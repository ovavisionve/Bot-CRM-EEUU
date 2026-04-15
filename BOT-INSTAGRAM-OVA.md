# Bot de Respuestas Automáticas Instagram — OVA VISION
> Instrucciones de desarrollo para Claude Code

---

## Contexto del proyecto

**Agencia:** OVA VISION — agencia venezolana de automatización IA y branding.  
**Web:** ovavisionagency.com  
**Contacto:** ovavision.ve@gmail.com · +58 424 578 1707

Este bot es una plataforma interna de OVA VISION que se conecta a cuentas de Instagram de clientes para responder DMs automáticamente, capturar leads y notificar al administrador. El sistema está diseñado para escalar a múltiples clientes desde una sola app de Meta.

**Regla crítica:** Toda automatización es mediante integraciones de API propias. No se usa n8n, Make, Zapier ni ninguna plataforma de automatización de terceros. Todo el código es nuestro.

---

## App de Meta ya creada

| Campo | Valor |
|---|---|
| Nombre de la app | Bot OVA Clientes |
| App ID | `893446043743152` |
| Clave secreta | *(guardar en .env — no commitear)* |
| Casos de uso activos | Instagram Business, Messenger, WhatsApp |
| Estado | En desarrollo (sandbox) |

Los permisos de Instagram ya están agregados:
- `instagram_business_basic`
- `instagram_manage_comments`
- `instagram_business_manage_messages`

---

## Stack técnico

| Pieza | Tecnología | Costo |
|---|---|---|
| Framework | Next.js 14 (App Router) | Gratis |
| Hosting + deploy | Vercel (plan free) | Gratis |
| Webhook receptor | Next.js API route | Gratis |
| Base de datos de leads | Google Sheets + Apps Script | Gratis |
| Notificación al admin | Gmail API / WhatsApp link | Gratis |
| Control de respuestas | JSON de configuración editable | Gratis |

---

## Estructura del proyecto

```
ova-instagram-bot/
├── app/
│   └── api/
│       └── webhook/
│           └── route.js          ← Webhook principal (GET verificación + POST eventos)
├── lib/
│   ├── instagram.js              ← Funciones para llamar a Graph API (enviar mensajes)
│   ├── respuestas.js             ← Motor de palabras clave y lógica de respuesta
│   ├── sheets.js                 ← Guardar leads en Google Sheets
│   └── notificar.js              ← Notificación al admin por email o WhatsApp link
├── config/
│   └── respuestas.json           ← Respuestas editables por el cliente o el admin
├── .env.local                    ← Variables de entorno (nunca commitear)
├── .env.example                  ← Plantilla de variables (sí commitear)
└── README.md
```

---

## Variables de entorno (.env.local)

```env
# Meta / Instagram
META_APP_ID=893446043743152
META_APP_SECRET=TU_CLAVE_SECRETA_AQUI
META_VERIFY_TOKEN=ova_webhook_secret_2026   # Token personalizado para verificar el webhook
INSTAGRAM_ACCESS_TOKEN=                     # Se genera al conectar la cuenta del cliente

# Google Sheets (para registro de leads)
GOOGLE_SHEETS_ID=                           # ID del Sheet donde se guardan los leads
GOOGLE_SERVICE_ACCOUNT_EMAIL=              # Email de la service account de Google
GOOGLE_PRIVATE_KEY=                         # Clave privada de la service account

# Admin (notificaciones)
ADMIN_EMAIL=ovavision.ve@gmail.com
ADMIN_WHATSAPP=+584245781707
```

---

## Webhook — lógica principal

### GET /api/webhook — Verificación de Meta

Meta hace una petición GET al activar el webhook. Hay que responder con el `hub.challenge`.

```js
// app/api/webhook/route.js
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Unauthorized', { status: 403 })
}
```

### POST /api/webhook — Recepción de eventos

```js
export async function POST(request) {
  const body = await request.json()

  // Verificar que es un evento de Instagram
  if (body.object !== 'instagram') {
    return new Response('Not Instagram', { status: 400 })
  }

  for (const entry of body.entry) {
    for (const event of entry.messaging || []) {
      const senderId = event.sender.id
      const mensaje = event.message?.text?.toLowerCase() || ''

      if (!mensaje) continue

      // Motor de respuestas
      const respuesta = detectarRespuesta(mensaje)

      // Responder por Instagram DM
      await enviarMensaje(senderId, respuesta)

      // Guardar lead en Google Sheets
      await guardarLead({ senderId, mensaje, respuesta })

      // Notificar al admin
      await notificarAdmin({ senderId, mensaje })
    }
  }

  return new Response('OK', { status: 200 })
}
```

---

## Motor de respuestas (config/respuestas.json)

Este archivo lo puede editar el cliente o el admin sin tocar código.

```json
{
  "palabras_clave": [
    {
      "keywords": ["precio", "costo", "cuánto", "cuanto", "cobran"],
      "respuesta": "¡Hola! 👋 Gracias por escribirnos. Para ver nuestros precios entra aquí: [LINK]"
    },
    {
      "keywords": ["pedido", "pedir", "ordenar", "quiero", "comprar"],
      "respuesta": "¡Con gusto! 🛒 Puedes hacer tu pedido aquí: [LINK]"
    },
    {
      "keywords": ["horario", "hora", "abren", "cierran", "disponible"],
      "respuesta": "Atendemos de lunes a sábado de 10am a 8pm 🕐 ¿En qué más te podemos ayudar?"
    },
    {
      "keywords": ["ubicacion", "ubicación", "dirección", "donde", "dónde"],
      "respuesta": "Estamos en [DIRECCIÓN]. También hacemos delivery 🛵 ¿Quieres hacer un pedido?"
    },
    {
      "keywords": ["hola", "buenas", "buenos", "hey", "hi"],
      "respuesta": "¡Hola! 👋 Bienvenido/a. ¿En qué podemos ayudarte hoy?"
    }
  ],
  "respuesta_default": "¡Hola! 😊 Gracias por escribirnos. Un momento, en breve te atendemos. También puedes escribirnos al [WHATSAPP_LINK]"
}
```

### lib/respuestas.js

```js
import config from '../config/respuestas.json'

export function detectarRespuesta(mensaje) {
  const texto = mensaje.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  for (const item of config.palabras_clave) {
    const coincide = item.keywords.some(kw => texto.includes(kw))
    if (coincide) return item.respuesta
  }

  return config.respuesta_default
}
```

---

## Enviar mensaje por Instagram Graph API

```js
// lib/instagram.js
export async function enviarMensaje(recipientId, texto) {
  const url = `https://graph.facebook.com/v19.0/me/messages`
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: texto },
      messaging_type: 'RESPONSE',
      access_token: process.env.INSTAGRAM_ACCESS_TOKEN
    })
  })

  if (!res.ok) {
    const error = await res.json()
    console.error('Error enviando mensaje Instagram:', error)
  }

  return res.json()
}
```

---

## Guardar lead en Google Sheets

```js
// lib/sheets.js
import { google } from 'googleapis'

export async function guardarLead({ senderId, mensaje, respuesta }) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  )

  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: 'Leads!A:E',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        new Date().toISOString(),     // Fecha
        senderId,                      // Instagram ID
        mensaje,                       // Mensaje recibido
        respuesta,                     // Respuesta enviada
        'Pendiente'                    // Estado (editable por el admin)
      ]]
    }
  })
}
```

**Estructura del Google Sheet (hoja: Leads):**

| A - Fecha | B - Instagram ID | C - Mensaje | D - Respuesta enviada | E - Estado |
|---|---|---|---|---|
| 2026-04-15T... | 123456789 | "cuánto cuesta?" | "¡Hola! Para ver precios..." | Pendiente |

---

## Configuración del webhook en Meta Developers

Una vez que el proyecto esté desplegado en Vercel:

1. Ir a la app en developers.facebook.com → Casos de uso → Instagram → Configuración de API
2. En la sección **Webhooks**, ingresar:
   - **URL de callback:** `https://tu-dominio.vercel.app/api/webhook`
   - **Token de verificación:** el valor de `META_VERIFY_TOKEN` en tu .env
3. Suscribirse al campo `messages`
4. Meta hace la petición GET de verificación — si el webhook responde bien, queda activo

---

## Conectar cuenta de Instagram del cliente

1. En Meta Developers → la app → Roles → Testers: agregar el Instagram del cliente
2. El cliente acepta la invitación desde su cuenta
3. Generar el `Page Access Token` desde el Graph API Explorer con los permisos:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
4. Guardar ese token en `INSTAGRAM_ACCESS_TOKEN` del .env en Vercel

---

## Deploy en Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Configurar variables de entorno en Vercel dashboard
# Settings → Environment Variables → agregar todas las del .env
```

O conectar el repo de GitHub a Vercel para deploy automático en cada push.

---

## Orden de desarrollo recomendado

1. Inicializar proyecto Next.js + estructura de carpetas
2. Crear webhook GET (verificación) y hacer el primer test con Meta
3. Crear webhook POST con logs básicos para ver los eventos que llegan
4. Implementar motor de respuestas con el JSON de configuración
5. Implementar `enviarMensaje` y probar el flujo completo en sandbox
6. Implementar `guardarLead` con Google Sheets
7. Implementar notificación al admin
8. Deploy en Vercel + configurar webhook en Meta con URL real
9. Conectar cuenta real del cliente y prueba final

---

## Notas importantes

- La ventana de respuesta automática de Meta es **24 horas** desde el último mensaje del usuario. Pasado ese tiempo, el bot no puede responder salvo con plantillas aprobadas.
- El bot solo responde, **nunca inicia** conversaciones (restricción de Meta).
- Todos los tokens de acceso tienen vencimiento — implementar refresh o usar tokens de larga duración (60 días) desde el Graph API Explorer.
- Para producción con múltiples clientes, cada cliente tiene su propio `access_token` almacenado en la base de datos (o en variables de entorno separadas por cliente).
- Esta misma arquitectura escala a Messenger y WhatsApp Business cambiando el endpoint y el token — la lógica de respuestas y Sheets es reutilizable.
