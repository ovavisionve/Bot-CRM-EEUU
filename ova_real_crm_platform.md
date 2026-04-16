# 🏢 OVA REAL — Plataforma CRM SaaS Multi-Tenant para Agentes de Bienes Raíces
## Especificaciones completas para Claude Code
### Desarrollado por OVA VISION Agency

---

## 1. Visión del Producto

**OVA REAL** es una plataforma SaaS multi-tenant de CRM + Automatización IA diseñada específicamente para agentes y agencias de bienes raíces en el mercado hispano de EE.UU. y Latinoamérica.

OVA VISION vende acceso a la plataforma como servicio a múltiples clientes (agentes/agencias). Cada cliente recibe:
- Su propio agente IA entrenado con su voz, propiedades y estilo
- CRM completo para gestionar sus leads
- Automatización de Instagram DMs y SMS
- Dashboard de rendimiento y analytics

**Modelo de negocio:** OVA VISION como Super Admin → Clientes (agentes RE) como Tenants → Sus leads como usuarios finales.

---

## 2. Inspiración Competitiva — Lo Mejor del Mercado

| Plataforma | Qué copiamos |
|---|---|
| **Follow Up Boss** | Pipeline visual, lead routing automático, speed-to-lead analytics, team leaderboards |
| **CINC** | AI behavior-based nurturing, Autotracks (drip campaigns por comportamiento) |
| **Wise Agent** | Transaction management, drip campaigns, comisiones, todo-en-uno asequible |
| **Top Producer** | Market expert tools, property alerts, seguimiento desde cold lead hasta cierre |
| **BoldTrail** | Multi-agent management, accountability tracking, gap detection por agente |
| **Lofty** | AI Assistant para workflows, Social Studio, respuestas automáticas inteligentes |
| **REsimpli** | Multi-canal (SMS + DM + email), AI para llamadas entrantes, score de leads |

**Lo que los supera OVA REAL:**
- Entrenamiento del agente IA con la voz real del agente (no genérico)
- Soporte nativo bilingüe español-inglés
- Precio accesible para el mercado latinoamericano
- Zero third-party automation tools (todo código propio)
- Onboarding en menos de 30 minutos por cliente

---

## 3. Arquitectura Multi-Tenant

### Modelo de Datos: Shared Schema con Row-Level Security (RLS)

```
Super Admin (OVA VISION)
    │
    ├── Tenant 1: Luis Almario RE (Miami)
    │       ├── Agente IA: "Luis Bot"
    │       ├── Propiedades: [2901 SW 69th Ct, ...]
    │       ├── Leads: [Daniel Manzi, Adrian Peschiera, ...]
    │       └── Canales: Instagram @luisalmario, SMS +1786...
    │
    ├── Tenant 2: María González RE (Houston)
    │       ├── Agente IA: "María Bot"
    │       ├── Propiedades: [...]
    │       └── Canales: Instagram @mariagonzalez, SMS...
    │
    └── Tenant N: ...
```

### Regla de Aislamiento
Cada tabla lleva `tenant_id`. Ningún tenant puede ver datos de otro. El Super Admin ve todo.

---

## 4. Stack Técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR + API routes + Vercel |
| Base de datos | Supabase (PostgreSQL + RLS) | Multi-tenant nativo, realtime, gratis en inicio |
| Auth | Supabase Auth | Roles: super_admin, tenant_admin, agent |
| AI | Claude API (claude-sonnet-4) | Motor de respuestas del bot |
| SMS | Twilio | Mensajes de texto automatizados |
| Instagram | Meta Graph API | DMs automatizados |
| Email | Resend | Notificaciones y drip campaigns |
| Hosting | Vercel | Deploy automático |
| Storage | Supabase Storage | Fotos/videos de propiedades |
| Pagos | Stripe | Suscripciones por plan |
| Analytics | Supabase + custom | Métricas por tenant |

---

## 5. Estructura del Proyecto

```
ova-real/
├── app/
│   ├── (auth)/
│   │   ├── login/page.jsx
│   │   └── register/page.jsx          ← Solo para nuevos tenants (invitación)
│   │
│   ├── (super-admin)/                  ← Solo OVA VISION ve esto
│   │   ├── dashboard/page.jsx          ← Vista de todos los tenants
│   │   ├── tenants/
│   │   │   ├── page.jsx               ← Lista de clientes
│   │   │   ├── new/page.jsx           ← Crear nuevo cliente
│   │   │   └── [id]/page.jsx          ← Gestión de un cliente específico
│   │   ├── billing/page.jsx           ← Estado de pagos de todos los clientes
│   │   └── analytics/page.jsx         ← Analytics globales
│   │
│   ├── (tenant)/                       ← Dashboard del agente/cliente
│   │   ├── dashboard/page.jsx          ← Resumen: leads hoy, tours, conversiones
│   │   ├── leads/
│   │   │   ├── page.jsx               ← Pipeline visual (kanban)
│   │   │   ├── [id]/page.jsx          ← Perfil completo del lead
│   │   │   └── import/page.jsx        ← Importar leads CSV
│   │   ├── conversations/
│   │   │   ├── page.jsx               ← Inbox unificado (IG + SMS)
│   │   │   └── [id]/page.jsx          ← Conversación individual
│   │   ├── properties/
│   │   │   ├── page.jsx               ← Lista de propiedades activas
│   │   │   ├── new/page.jsx           ← Agregar propiedad
│   │   │   └── [id]/page.jsx          ← Editar propiedad
│   │   ├── agent/
│   │   │   ├── page.jsx               ← Configuración del agente IA
│   │   │   ├── train/page.jsx         ← Entrenar con voz y estilo del agente
│   │   │   └── test/page.jsx          ← Probar el bot antes de activar
│   │   ├── campaigns/
│   │   │   ├── page.jsx               ← Drip campaigns activas
│   │   │   └── new/page.jsx           ← Crear nueva campaña
│   │   ├── calendar/page.jsx          ← Tours agendados
│   │   ├── analytics/page.jsx         ← Métricas del tenant
│   │   └── settings/page.jsx          ← Configuración general
│   │
│   └── api/
│       ├── webhook/
│       │   ├── instagram/route.js     ← Webhook Instagram (POST + GET)
│       │   └── sms/route.js           ← Webhook Twilio SMS
│       ├── ai/
│       │   └── respond/route.js       ← Motor IA (llama a Claude API)
│       ├── leads/route.js
│       ├── properties/route.js
│       └── stripe/
│           └── webhook/route.js       ← Eventos de pago
│
├── lib/
│   ├── supabase/
│   │   ├── client.js                  ← Cliente Supabase browser
│   │   └── server.js                  ← Cliente Supabase server (con RLS)
│   ├── ai/
│   │   ├── engine.js                  ← Motor principal de IA
│   │   ├── buildPrompt.js             ← Constructor del system prompt por tenant
│   │   └── classifyIntent.js          ← Clasificar intención del mensaje
│   ├── channels/
│   │   ├── instagram.js               ← Enviar/recibir DMs Instagram
│   │   └── sms.js                     ← Enviar/recibir SMS Twilio
│   ├── leads/
│   │   ├── qualify.js                 ← Lógica de calificación
│   │   ├── score.js                   ← Lead scoring automático
│   │   └── followup.js                ← Motor de follow-ups automáticos
│   └── notifications/
│       └── notify.js                  ← Notificar al agente humano
│
├── components/
│   ├── pipeline/
│   │   ├── KanbanBoard.jsx            ← Pipeline drag-and-drop
│   │   └── LeadCard.jsx
│   ├── conversations/
│   │   ├── InboxList.jsx
│   │   └── ChatWindow.jsx             ← Vista de conversación + override manual
│   ├── analytics/
│   │   ├── ConversionFunnel.jsx
│   │   └── LeadSourceChart.jsx
│   └── shared/
│       └── TenantGuard.jsx            ← Protege rutas por tenant
│
├── config/
│   └── plans.js                       ← Definición de planes (Starter/Pro/Agency)
│
└── supabase/
    └── migrations/                    ← Esquema de base de datos
```

---

## 6. Base de Datos — Esquema Completo

### Tabla: tenants
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- "Luis Almario RE"
  slug TEXT UNIQUE NOT NULL,                   -- "luis-almario" (para subdomain futuro)
  plan TEXT DEFAULT 'starter',                 -- starter | pro | agency
  status TEXT DEFAULT 'active',               -- active | suspended | trial
  
  -- Branding
  logo_url TEXT,
  brand_color TEXT DEFAULT '#2563EB',
  
  -- Contacto del agente
  agent_name TEXT NOT NULL,
  agent_phone TEXT,
  agent_email TEXT NOT NULL,
  agent_language TEXT DEFAULT 'en',           -- idioma preferido del agente
  
  -- Configuración del Bot
  bot_name TEXT,                               -- "Luis Bot"
  bot_persona TEXT,                            -- System prompt base del agente
  bot_active BOOLEAN DEFAULT FALSE,
  
  -- Meta/Instagram
  meta_page_id TEXT,
  instagram_access_token TEXT,
  instagram_handle TEXT,
  
  -- Twilio SMS
  twilio_phone_number TEXT,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  
  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ
);
```

### Tabla: leads
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Identidad
  name TEXT NOT NULL,
  partner_name TEXT,
  phone TEXT,
  instagram_id TEXT,
  instagram_handle TEXT,
  email TEXT,
  
  -- Calificación
  move_in_date TEXT,
  occupants TEXT,                              -- solo | pareja | familia
  pets TEXT DEFAULT 'none',                   -- none | normal | ESA
  credit_score INTEGER,
  credit_qualified BOOLEAN,
  preferred_unit TEXT,                         -- 1BR/1BA | 2BR/2BA | studio
  budget_min INTEGER,
  budget_max INTEGER,
  
  -- Preferencias
  language TEXT DEFAULT 'en',                 -- en | es
  source TEXT,                                 -- instagram | sms | referral | web | zillow
  
  -- Estado en el pipeline
  status TEXT DEFAULT 'new',
  /*
    new           → Lead acaba de llegar
    contacted     → Se le escribió por primera vez
    qualified     → Pasó preguntas de calificación
    disqualified  → No califica (crédito, presupuesto, etc.)
    touring       → Tour agendado
    tour_done     → Completó el tour
    applied       → Llenó aplicación
    closed_won    → Firmó contrato
    closed_lost   → No cerró
    nurturing     → No está listo aún, en follow-up largo plazo
  */
  
  -- Lead Score (0-100)
  score INTEGER DEFAULT 0,
  score_factors JSONB,                         -- {"credit": 30, "budget": 25, "timeline": 20, ...}
  
  -- Tour
  tour_date TIMESTAMPTZ,
  tour_confirmed BOOLEAN DEFAULT FALSE,
  tour_notes TEXT,
  
  -- Propiedad de interés
  property_id UUID REFERENCES properties(id),
  
  -- Control IA
  ai_active BOOLEAN DEFAULT TRUE,             -- Si FALSE el agente humano toma control
  last_ai_message_at TIMESTAMPTZ,
  followup_count INTEGER DEFAULT 0,
  next_followup_at TIMESTAMPTZ,
  disqualify_reason TEXT,
  
  -- Metadata
  raw_data JSONB,                              -- Datos adicionales sin estructura fija
  tags TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ
);
```

### Tabla: messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  
  channel TEXT NOT NULL,                       -- instagram | sms | email
  direction TEXT NOT NULL,                     -- inbound | outbound
  
  content TEXT NOT NULL,
  media_url TEXT,
  
  sent_by TEXT DEFAULT 'bot',                 -- bot | agent | system
  
  meta_message_id TEXT,                        -- ID de Meta para tracking
  twilio_sid TEXT,                             -- SID de Twilio
  
  status TEXT DEFAULT 'sent',                 -- sent | delivered | read | failed
  
  ai_intent TEXT,                              -- precio | dirección | tour | saludo | ...
  ai_confidence DECIMAL(3,2),                 -- 0.00-1.00
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: properties
```sql
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Info básica
  name TEXT,                                   -- "Coral Terrace West"
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  maps_url TEXT,
  
  -- Detalles
  type TEXT,                                   -- apartment | house | condo | studio
  bedrooms INTEGER,
  bathrooms INTEGER,
  sqft INTEGER,
  floor TEXT,
  
  -- Precios
  base_price INTEGER NOT NULL,
  
  -- Fees (JSONB para flexibilidad)
  fees JSONB DEFAULT '{}',
  /*
  {
    "monthly_fees": 70,
    "internet": true,
    "trash": true,
    "amenities": true,
    "pest_control": true,
    "parking_1": 25,
    "parking_2": 0,
    "parking_2_promo": true
  }
  */
  
  -- Disponibilidad
  available BOOLEAN DEFAULT TRUE,
  available_date DATE,
  units_available INTEGER DEFAULT 1,
  
  -- Restricciones
  min_credit_score INTEGER DEFAULT 620,
  pets_allowed BOOLEAN DEFAULT TRUE,
  esa_allowed BOOLEAN DEFAULT TRUE,
  
  -- Media
  photos TEXT[],
  video_url TEXT,
  virtual_tour_url TEXT,
  
  -- Promociones activas
  promotions JSONB DEFAULT '[]',
  /*
  [
    {
      "description": "Second parking free this month",
      "expires_at": "2026-05-01",
      "active": true
    }
  ]
  */
  
  -- Control
  active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,                  -- Para ordenar propiedades a ofrecer
  notes TEXT,                                  -- Notas internas del agente
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: campaigns (Drip Sequences)
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  /*
    Triggers:
    - new_lead          → Cuando llega lead nuevo
    - no_response_24h   → Sin respuesta en 24h
    - no_response_48h
    - no_response_72h
    - tour_reminder     → Recordatorio 24h antes del tour
    - post_tour         → 24h después del tour
    - budget_objection  → Lead dice que es caro
    - long_term_nurture → Lead no está listo (mensual)
  */
  
  steps JSONB NOT NULL,
  /*
  [
    {
      "step": 1,
      "delay_hours": 0,
      "channel": "sms",
      "message": "Hello {name}, here {agent_name}! I wanted to ask when are you planning to move?",
      "condition": null
    },
    {
      "step": 2,
      "delay_hours": 24,
      "channel": "sms",
      "message": "{name}, pasó algo? Todo bien?",
      "condition": "no_reply"
    }
  ]
  */
  
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: campaign_enrollments
```sql
CREATE TABLE campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  lead_id UUID REFERENCES leads(id),
  
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',               -- active | paused | completed | cancelled
  
  next_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: tours
```sql
CREATE TABLE tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  property_id UUID REFERENCES properties(id),
  
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  
  status TEXT DEFAULT 'scheduled',
  /*
    scheduled | confirmed | completed | no_show | cancelled | rescheduled
  */
  
  notes TEXT,
  outcome TEXT,                                -- Resultado post-tour
  
  reminder_sent BOOLEAN DEFAULT FALSE,
  confirmation_sent BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: agent_configs (Configuración del Bot por Tenant)
```sql
CREATE TABLE agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  
  -- Personalidad
  agent_voice TEXT,                            -- Descripción del estilo del agente
  communication_style TEXT DEFAULT 'casual',   -- casual | professional | mixed
  preferred_language TEXT DEFAULT 'en',
  auto_switch_language BOOLEAN DEFAULT TRUE,   -- Switch si lead escribe en otro idioma
  
  -- Comportamiento del bot
  qualify_before_pitch BOOLEAN DEFAULT TRUE,
  max_ai_messages_before_handoff INTEGER DEFAULT 20,
  
  -- Intents personalizados (keywords específicas del negocio)
  custom_intents JSONB DEFAULT '[]',
  
  -- Respuestas personalizadas (sobrescriben las defaults)
  custom_responses JSONB DEFAULT '{}',
  /*
  {
    "greeting_en": "Hello {name}, here {agent_name}!...",
    "greeting_es": "Hola {name}, como vas?...",
    "price_response": "Hello perfect, the asking price for...",
    "address_response": "The address is...",
    "disqualify_message": "Thank you for reaching out..."
  }
  */
  
  -- Horario de actividad del bot
  active_hours JSONB DEFAULT '{"start": "08:00", "end": "22:00", "timezone": "America/New_York"}',
  active_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat'],
  
  -- Handoff al agente humano
  handoff_keywords TEXT[] DEFAULT ARRAY['hablar con persona','speak to agent','human'],
  handoff_notification TEXT DEFAULT 'email',   -- email | whatsapp | sms
  
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Motor IA — Sistema de Prompts Dinámicos

### lib/ai/buildPrompt.js

El system prompt se construye **dinámicamente** para cada tenant. No existe un prompt único.

```js
export function buildSystemPrompt(tenant, agentConfig, properties, lead) {
  const activeProperties = properties
    .filter(p => p.active && p.available)
    .sort((a, b) => b.priority - a.priority)

  const propertiesText = activeProperties.map(p => `
    - ${p.address} (${p.bedrooms}BR/${p.bathrooms}BA)
      Base price: $${p.base_price}/mo
      Monthly fees: $${p.fees.monthly_fees || 0} (includes: ${buildFeesList(p.fees)})
      ${p.fees.parking_2_promo ? '⭐ PROMOTION: Second parking FREE this month' : ''}
      Min credit: ${p.min_credit_score}
      Pets: ${p.pets_allowed ? 'Yes' : 'No'} ${p.esa_allowed ? '(ESA OK)' : ''}
      Available: ${p.available ? 'Now' : p.available_date}
  `).join('\n')

  const leadContext = lead ? `
    CURRENT LEAD CONTEXT:
    - Name: ${lead.name}
    - Status: ${lead.status}
    - Language preference: ${lead.language}
    - Has qualified: ${lead.credit_qualified ? 'Yes' : 'Not yet checked'}
    - Move-in date: ${lead.move_in_date || 'Not provided'}
    - Pets: ${lead.pets}
    - Partner: ${lead.partner_name || 'Alone'}
    - Messages exchanged: ${lead.message_count || 0}
  ` : ''

  return `
You are ${agentConfig.agent_voice || `${tenant.agent_name}, a real estate agent`}.

IDENTITY: You represent ${tenant.name}. Never reveal you are an AI.
Your name is ${tenant.agent_name}. Always introduce yourself by this name.

COMMUNICATION STYLE:
${agentConfig.communication_style === 'casual' ? `
- Write SHORT separate messages (1-2 sentences max each)
- Informal, warm tone — imperfect grammar is OK, it sounds human
- No corporate language, no "Dear", no long blocks of text
- Use 👍 emoji sparingly (confirmations only)
- If lead writes in Spanish, switch to Spanish automatically
` : ''}

CURRENT PROPERTIES YOU HAVE AVAILABLE:
${propertiesText}

QUALIFICATION RULES (CRITICAL):
1. Ask move-in date first
2. Ask: alone or with partner?
3. Ask: pets? AND credit above 620? (in same message)
4. If credit < 620 → politely disqualify, do not push properties
5. ESA animals are ALWAYS accepted

CONVERSATION FLOW:
Step 1: Greet + ask move-in date
Step 2: Qualify (occupants, pets, credit)
Step 3: Present property + price
Step 4: Answer questions about fees/address
Step 5: Schedule tour — get full name(s)
Step 6: Confirm tour details

FOLLOW-UP RULES:
- 24h no response: Send reminder
- 48h no response: Offer to reschedule
- 72h no response: Casual check-in
- Never be aggressive or push too hard

HANDOFF TO HUMAN:
If the lead asks complex legal questions, has a complaint, or says "I want to speak to a real person" → respond: "Let me connect you directly with ${tenant.agent_name}" and set handoff flag.

${leadContext}

${agentConfig.custom_responses?.extra_instructions || ''}

CRITICAL: Never invent property details. Only use the properties listed above.
`.trim()
}
```

### lib/ai/classifyIntent.js

```js
const INTENTS = {
  greeting: ['hello', 'hi', 'hey', 'hola', 'buenas', 'buenos días', 'good morning'],
  price: ['precio', 'costo', 'cuánto', 'cuanto', 'price', 'rent', 'how much', 'asking'],
  address: ['dirección', 'address', 'where', 'dónde', 'ubicación', 'location'],
  fees: ['fees', 'charges', 'additional', 'extra', 'cargos', 'servicios', 'incluye'],
  tour: ['tour', 'visit', 'show', 'ver', 'visitar', 'schedule', 'appointment', 'cita'],
  availability: ['available', 'disponible', 'when', 'cuándo', 'move in', 'mudanza'],
  qualification: ['credit', 'crédito', 'pets', 'mascotas', 'alone', 'partner', 'pareja'],
  confirm: ['yes', 'sí', 'si', 'ok', 'perfect', 'perfecto', 'confirmed', 'confirm'],
  budget_objection: ['expensive', 'caro', 'budget', 'presupuesto', 'too much', 'mucho'],
  human_request: ['speak to', 'talk to', 'hablar con', 'persona real', 'human', 'agent'],
}

export function classifyIntent(message) {
  const lower = message.toLowerCase()
  for (const [intent, keywords] of Object.entries(INTENTS)) {
    if (keywords.some(kw => lower.includes(kw))) return intent
  }
  return 'unknown'
}
```

### lib/ai/engine.js

```js
import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './buildPrompt.js'
import { classifyIntent } from './classifyIntent.js'
import { getLeadContext } from '../leads/qualify.js'

const anthropic = new Anthropic()

export async function generateResponse({ tenant, agentConfig, properties, lead, conversationHistory, incomingMessage }) {
  
  const intent = classifyIntent(incomingMessage)
  
  // Si pide humano → handoff inmediato
  if (intent === 'human_request') {
    return {
      messages: [`Let me connect you directly with ${tenant.agent_name}. They'll be in touch shortly! 👍`],
      action: 'handoff',
      intent
    }
  }

  const systemPrompt = buildSystemPrompt(tenant, agentConfig, properties, lead)

  // Convertir historial al formato de Claude
  const messages = [
    ...conversationHistory.slice(-20).map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content
    })),
    { role: 'user', content: incomingMessage }
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: systemPrompt,
    messages
  })

  const rawResponse = response.content[0].text

  // Separar en múltiples mensajes cortos (simula estilo humano)
  const splitMessages = splitIntoShortMessages(rawResponse)

  return {
    messages: splitMessages,
    action: detectAction(rawResponse, intent, lead),
    intent,
    raw: rawResponse
  }
}

// Divide la respuesta en mensajes cortos si tiene puntos o saltos de línea
function splitIntoShortMessages(text) {
  return text
    .split(/\n{2,}/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 4) // Máx 4 mensajes por respuesta
}

function detectAction(response, intent, lead) {
  if (intent === 'tour' && response.match(/\d{1,2}:\d{2}|pm|am|tomorrow|mañana/i)) return 'tour_scheduled'
  if (response.match(/disqualif|no podemos|don't qualify/i)) return 'disqualify'
  if (intent === 'confirm' && lead?.status === 'touring') return 'tour_confirmed'
  return null
}
```

---

## 8. Webhook — Procesamiento de Mensajes

### app/api/webhook/instagram/route.js

```js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { generateResponse } from '@/lib/ai/engine'
import { sendInstagramMessage } from '@/lib/channels/instagram'
import { updateLeadStatus } from '@/lib/leads/qualify'
import { notifyAgent } from '@/lib/notifications/notify'

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

export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies })
  const body = await request.json()

  if (body.object !== 'instagram') return new Response('Not Instagram', { status: 400 })

  for (const entry of body.entry) {
    const pageId = entry.id

    // Identificar el tenant por su page_id
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*, agent_configs(*)')
      .eq('meta_page_id', pageId)
      .single()

    if (!tenant || tenant.status !== 'active') continue

    for (const event of entry.messaging || []) {
      const instagramId = event.sender.id
      const messageText = event.message?.text || ''
      if (!messageText) continue

      // Buscar o crear lead
      let { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('instagram_id', instagramId)
        .single()

      if (!lead) {
        const { data: newLead } = await supabase
          .from('leads')
          .insert({
            tenant_id: tenant.id,
            instagram_id: instagramId,
            language: detectLanguage(messageText),
            status: 'new',
            source: 'instagram',
            ai_active: true
          })
          .select()
          .single()
        lead = newLead
      }

      // Guardar mensaje inbound
      await supabase.from('messages').insert({
        tenant_id: tenant.id,
        lead_id: lead.id,
        channel: 'instagram',
        direction: 'inbound',
        content: messageText,
        sent_by: 'lead'
      })

      // Si el agente humano tomó control, no responder con IA
      if (!lead.ai_active) continue

      // Obtener historial de conversación
      const { data: history } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })
        .limit(40)

      // Obtener propiedades del tenant
      const { data: properties } = await supabase
        .from('properties')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('active', true)

      // Generar respuesta IA
      const { messages, action, intent } = await generateResponse({
        tenant,
        agentConfig: tenant.agent_configs,
        properties,
        lead,
        conversationHistory: history,
        incomingMessage: messageText
      })

      // Enviar mensajes con delay entre ellos (simula escritura humana)
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await delay(1500 + Math.random() * 1000)
        
        await sendInstagramMessage(instagramId, messages[i], tenant.instagram_access_token)
        
        await supabase.from('messages').insert({
          tenant_id: tenant.id,
          lead_id: lead.id,
          channel: 'instagram',
          direction: 'outbound',
          content: messages[i],
          sent_by: 'bot',
          ai_intent: intent
        })
      }

      // Procesar acciones detectadas
      await updateLeadStatus(supabase, lead, action, intent, messageText)

      // Handoff: notificar al agente humano
      if (action === 'handoff') {
        await supabase.from('leads').update({ ai_active: false }).eq('id', lead.id)
        await notifyAgent(tenant, lead, 'handoff_requested')
      }

      // Tour agendado: notificar al agente
      if (action === 'tour_scheduled') {
        await notifyAgent(tenant, lead, 'tour_scheduled')
      }
    }
  }

  return new Response('OK', { status: 200 })
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
function detectLanguage(text) {
  const spanishWords = ['hola', 'quiero', 'como', 'cuánto', 'puedo', 'tengo', 'estoy']
  return spanishWords.some(w => text.toLowerCase().includes(w)) ? 'es' : 'en'
}
```

---

## 9. Lead Scoring Automático

### lib/leads/score.js

```js
export function calculateScore(lead) {
  let score = 0
  const factors = {}

  // Crédito (30 puntos)
  if (lead.credit_score >= 750) { score += 30; factors.credit = 30 }
  else if (lead.credit_score >= 680) { score += 20; factors.credit = 20 }
  else if (lead.credit_score >= 620) { score += 10; factors.credit = 10 }
  else { factors.credit = 0 }

  // Timeline de mudanza (25 puntos)
  const daysToMove = getDaysUntilMove(lead.move_in_date)
  if (daysToMove <= 30) { score += 25; factors.timeline = 25 }
  else if (daysToMove <= 60) { score += 15; factors.timeline = 15 }
  else if (daysToMove <= 90) { score += 10; factors.timeline = 10 }
  else { factors.timeline = 5; score += 5 }

  // Presupuesto (20 puntos)
  // ... lógica basada en presupuesto vs precio de propiedad

  // Engagement (15 puntos)
  // Basado en velocidad de respuesta, número de mensajes, preguntas específicas
  const responseRate = lead.message_count > 5 ? 15 : lead.message_count * 3
  score += responseRate; factors.engagement = responseRate

  // Canal (10 puntos)
  if (lead.source === 'referral') { score += 10; factors.source = 10 }
  else if (lead.source === 'instagram') { score += 7; factors.source = 7 }
  else { score += 5; factors.source = 5 }

  return { score: Math.min(score, 100), factors }
}
```

---

## 10. Vistas del CRM — Especificaciones de UI

### 10.1 Pipeline Kanban (Vista principal del tenant)

```
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline — Luis Almario RE                     + Add Lead      │
├──────────┬───────────┬──────────┬──────────┬──────────┬────────┤
│  NEW(8)  │CONTACTED  │QUALIFIED │ TOURING  │APPLIED   │ CLOSED │
│          │   (12)    │  (5)     │  (3)     │  (2)     │  (1)   │
├──────────┼───────────┼──────────┼──────────┼──────────┼────────┤
│ 🔴Daniel  │ 🟡Celia   │ 🟢Adrian  │ 🟢Caleb  │          │        │
│ Manzi     │ Kottakis  │ Peschiera│ Calaway  │          │        │
│ 2BR IG    │ 2BR SMS   │ 2BR SMS  │ 2BR SMS  │          │        │
│ Score:72  │ Score:55  │ Score:88 │ Score:91 │          │        │
│ Hot 🔥    │ Warm      │ Hot 🔥   │ Tour 📅  │          │        │
├──────────┼───────────┼──────────┤          │          │        │
│ Fernando │           │          │          │          │        │
│ Fernandez│           │          │          │          │        │
│ 1BR IG   │           │          │          │          │        │
│ Score:65 │           │          │          │          │        │
└──────────┴───────────┴──────────┴──────────┴──────────┴────────┘
```

### 10.2 Perfil del Lead (Vista detallada)

Secciones:
1. **Header:** Nombre, score, estado, canal, idioma, tags, botones de acción
2. **Conversación:** Chat completo con opción de "Tomar Control" (desactiva IA para ese lead)
3. **Calificación:** Resumen de datos recolectados (crédito, mascotas, pareja, presupuesto)
4. **Timeline:** Historial de eventos (lead creado, calificado, tour agendado, etc.)
5. **Propiedad de interés:** Link a la propiedad + comparación con presupuesto
6. **Próximo follow-up:** Fecha y mensaje programado

### 10.3 Inbox Unificado

```
┌─────────────────────────────────────────────────────────────┐
│  Inbox  [All] [Instagram] [SMS] [Unread: 3] [Bot Active: 5] │
├────────────────────┬────────────────────────────────────────┤
│ 🟢 Daniel Manzi    │                                        │
│ "What's the right  │  Daniel Manzi — Instagram              │
│  address??"        │  Score: 72  Status: Contacted          │
│ 2m ago  IG  🤖Bot │  ──────────────────────────────────    │
├────────────────────┤  📥 What's the right address??         │
│ 🟡 Celia Kottakis  │  ─────────────────────────────         │
│ "What apartment    │  📤 Not is 2850 +70 not more    🤖     │
│  is that?"         │     2901 sw 69 court, Miami...  🤖     │
│ 1h ago  SMS  👤    │                                        │
├────────────────────┤  [Type a message... or let bot reply]  │
│ 🔴 Fernando F.     │  [Take Control] [Mark as Tour] [Disq.] │
│ "Crédito 750"      └────────────────────────────────────────┘
│ 3h ago  IG  🤖Bot │
└────────────────────┘
```

### 10.4 Dashboard Super Admin (OVA VISION)

```
┌────────────────────────────────────────────────────────────┐
│  OVA REAL — Super Admin                    OVA VISION      │
├──────────┬─────────────┬──────────────┬────────────────────┤
│ Tenants  │ MRR         │ Active Bots  │ Messages Today     │
│   14     │ $2,380/mo   │     11       │     847            │
├──────────┴─────────────┴──────────────┴────────────────────┤
│                                                             │
│  TENANTS                                                    │
│  ┌──────────────────┬──────┬────────┬────────┬──────────┐  │
│  │ Client           │ Plan │ Leads  │ MoM    │ Status   │  │
│  ├──────────────────┼──────┼────────┼────────┼──────────┤  │
│  │ Luis Almario RE  │ Pro  │  128   │ +12%   │ ✅ Active │  │
│  │ María González   │ Pro  │   87   │ +8%    │ ✅ Active │  │
│  │ RE Group Miami   │ Agcy │  341   │ +24%   │ ✅ Active │  │
│  │ Carlos Mejía     │ Strt │   23   │ -2%    │ ⚠️ Trial  │  │
│  └──────────────────┴──────┴────────┴────────┴──────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 11. Planes y Precios (Stripe)

### config/plans.js

```js
export const PLANS = {
  starter: {
    name: 'Starter',
    price_monthly: 97,                          // USD/mes
    stripe_price_id: 'price_starter_...',
    limits: {
      leads: 50,
      messages_per_month: 500,
      properties: 3,
      channels: ['instagram'],
      agents: 1,
      campaigns: 2
    },
    features: [
      'Instagram DM bot',
      'CRM básico (50 leads)',
      '3 propiedades activas',
      'Google Sheets de leads',
      'Notificaciones por email'
    ]
  },

  pro: {
    name: 'Pro',
    price_monthly: 197,
    stripe_price_id: 'price_pro_...',
    limits: {
      leads: 500,
      messages_per_month: 5000,
      properties: 10,
      channels: ['instagram', 'sms'],
      agents: 1,
      campaigns: 10
    },
    features: [
      'Todo de Starter',
      'SMS automatizados (Twilio)',
      'CRM completo (500 leads)',
      'Pipeline Kanban',
      'Lead scoring IA',
      'Drip campaigns',
      'Analytics avanzados',
      'Entrenamiento personalizado del bot'
    ]
  },

  agency: {
    name: 'Agency',
    price_monthly: 497,
    stripe_price_id: 'price_agency_...',
    limits: {
      leads: -1,                                // Ilimitados
      messages_per_month: -1,
      properties: -1,
      channels: ['instagram', 'sms', 'email'],
      agents: 10,                               // Múltiples agentes bajo un tenant
      campaigns: -1
    },
    features: [
      'Todo de Pro',
      'Hasta 10 sub-agentes',
      'Leads ilimitados',
      'Mensajes ilimitados',
      'White-label básico (logo propio)',
      'API access',
      'Soporte prioritario OVA VISION',
      'Onboarding dedicado'
    ]
  }
}
```

---

## 12. Configuración del Agente IA — Onboarding del Tenant

### Flujo de onboarding (30 minutos)

**Paso 1 — Info básica**
- Nombre del agente, foto, idioma preferido

**Paso 2 — Conectar canales**
- Instagram: guiar para conectar Instagram Business + generar token
- SMS (plan Pro+): ingresar credenciales Twilio o nosotros lo configuramos

**Paso 3 — Cargar propiedades**
- Formulario para agregar propiedades (nombre, dirección, precio, fees, fotos)
- Import CSV de propiedades

**Paso 4 — Entrenar el bot**

```
Cuestionario de voz del agente:
1. "¿Cómo saludas normalmente a un lead nuevo?" (texto libre)
2. "¿Cómo presentas el precio?" (texto libre)
3. "¿Qué dices cuando un lead pregunta la dirección?" (texto libre)
4. "¿Cuál es tu mensaje de seguimiento favorito?" (texto libre)
5. Seleccionar nivel de formalidad: [Muy casual] [Casual] [Profesional]
6. ¿Mezclas inglés y español? [Siempre inglés] [Siempre español] [Bilingüe automático]
```

La IA procesa estas respuestas y genera el `agent_voice` para el system prompt.

**Paso 5 — Probar el bot**
- Chat de prueba interno: el agente puede escribirle al bot y ver cómo respondería
- Ajustar respuestas antes de activar

**Paso 6 — Activar**
- Toggle de activación del bot
- Configurar webhook en Meta Developers (guía paso a paso integrada)

---

## 13. Notificaciones al Agente

### Cuándo notificar al agente humano:

| Evento | Canal | Urgencia |
|---|---|---|
| Lead nuevo calificado (score > 70) | Email + WhatsApp | 🔴 Alta |
| Tour agendado | Email + WhatsApp | 🔴 Alta |
| Lead pide hablar con humano | Email + WhatsApp + SMS | 🔴 Alta |
| Lead deja de responder (> 72h) | Email | 🟡 Media |
| Lead dice que el precio es caro | Email | 🟡 Media |
| Tour en 24 horas | Email | 🟡 Media |
| Resumen diario de leads | Email (8am) | 🟢 Baja |
| Lead disqualificado | Solo en CRM | — |

### lib/notifications/notify.js

```js
export async function notifyAgent(tenant, lead, event) {
  const templates = {
    tour_scheduled: {
      subject: `🏠 Tour agendado — ${lead.name}`,
      body: `${lead.name} quiere hacer un tour. Revisa en tu CRM.`
    },
    handoff_requested: {
      subject: `🚨 ${lead.name} quiere hablar contigo`,
      body: `El lead ${lead.name} pidió hablar con una persona real. El bot fue pausado.`
    },
    new_hot_lead: {
      subject: `🔥 Nuevo lead calificado — ${lead.name} (Score: ${lead.score})`,
      body: `Nuevo lead listo para atender.`
    }
  }

  const template = templates[event]
  if (!template) return

  // Email vía Resend
  await sendEmail({ to: tenant.agent_email, ...template })

  // WhatsApp link (fallback simple)
  if (['tour_scheduled', 'handoff_requested'].includes(event)) {
    const waMsg = encodeURIComponent(`OVA REAL: ${template.body} Ver: https://app.ovareal.com/leads/${lead.id}`)
    // Log the WhatsApp link for the agent to tap
    console.log(`WhatsApp: https://wa.me/${tenant.agent_phone}?text=${waMsg}`)
  }
}
```

---

## 14. Analytics por Tenant

### Métricas a mostrar en el dashboard:

**Resumen diario:**
- Leads nuevos hoy
- Mensajes enviados / recibidos
- Tours agendados esta semana
- Tasa de respuesta del bot (% de mensajes respondidos en < 5 min)

**Funnel de conversión:**
```
New Leads → Contacted → Qualified → Tour Scheduled → Tour Done → Applied → Closed
  100%  →    85%    →    60%    →      35%        →    25%   →   15%   →  8%
```

**Por canal:**
- Instagram vs SMS: volumen, calidad de leads, tasa de conversión

**Leaderboard (plan Agency):**
- Ranking de agentes por leads cerrados, tours realizados, velocidad de respuesta

**Speed-to-lead:**
- Tiempo promedio entre que llega el lead y la primera respuesta del bot

---

## 15. Orden de Desarrollo Recomendado

### Fase 1 — MVP (2-3 semanas)
1. Setup Next.js + Supabase + Auth
2. Schema de base de datos + RLS policies
3. Webhook Instagram funcional + respuestas básicas
4. CRM básico: lista de leads, perfil del lead, historial de conversación
5. Motor IA con prompt dinámico por tenant
6. Un tenant de prueba: Luis Almario RE

### Fase 2 — CRM Completo (2-3 semanas)
7. Pipeline Kanban drag-and-drop
8. Lead scoring automático
9. Drip campaigns (follow-up automático)
10. SMS con Twilio
11. Dashboard de analytics básico
12. Notificaciones al agente

### Fase 3 — Multi-Tenant + Monetización (2 semanas)
13. Super Admin dashboard
14. Onboarding flow para nuevos tenants
15. Integración Stripe (planes y pagos)
16. Entrenamiento personalizado del bot (cuestionario de voz)
17. Bot testing interface

### Fase 4 — Pro Features (ongoing)
18. Tour calendar con integración Google Calendar
19. White-label básico (logo + color del tenant)
20. API para import/export de leads
21. Mobile-responsive completo
22. Soporte multi-agente (plan Agency)

---

## 16. Variables de Entorno

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Meta / Instagram
META_APP_ID=893446043743152
META_APP_SECRET=
META_VERIFY_TOKEN=ova_real_webhook_2026

# Twilio (SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Anthropic (IA)
ANTHROPIC_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Resend (Email)
RESEND_API_KEY=

# OVA VISION Admin
SUPER_ADMIN_EMAIL=ovavision.ve@gmail.com
```

---

## 17. Row-Level Security (RLS) en Supabase

```sql
-- Política: los tenants solo ven sus propios leads
CREATE POLICY "Tenants see own leads"
ON leads FOR ALL
USING (tenant_id = auth.jwt() ->> 'tenant_id');

-- Política: super admin ve todo
CREATE POLICY "Super admin sees all"
ON leads FOR ALL
USING (auth.jwt() ->> 'role' = 'super_admin');

-- Aplicar mismo patrón a: messages, properties, campaigns, tours
```

---

*Documento generado el 15 de abril de 2026*
*OVA VISION Agency — ovavisionagency.com*
*Stack: Next.js 14 + Supabase + Claude API + Meta Graph API + Twilio + Stripe*
