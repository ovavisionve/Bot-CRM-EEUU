// Motor de respuestas usando OpenRouter API
// Genera respuestas usando la voz del agente configurado en el tenant.

import { obtenerPropiedades, formatearPropiedadesParaPrompt } from "./sheets.ts"
import type { Tenant, AgentConfig } from "./tenant.ts"

function buildSystemPrompt(
  propiedadesTexto: string,
  leadEstado: any,
  tenant: Partial<Tenant> | null,
  agentConfig: AgentConfig | null
): string {
  const agentName = tenant?.agent_name || "Luis Almario"
  const agentArea = "Miami"
  const communicationStyle = agentConfig?.communication_style || "casual"
  const agentVoice = agentConfig?.agent_voice || `${agentName}, a real estate agent in ${agentArea}`
  // Número de WhatsApp del agente (formato US sin +)
  const agentPhone = tenant?.agent_phone || ""
  const agentPhoneClean = agentPhone.replace(/[^0-9]/g, "")

  // Estado del lead: SOLO campos con valor real (sin "unknown" ni "not asked yet")
  const stateLines: string[] = []
  if (leadEstado.name) stateLines.push("Nombre: " + leadEstado.name)
  if (leadEstado.partner_name) stateLines.push("Pareja: " + leadEstado.partner_name)
  if (leadEstado.move_in_date) stateLines.push("Fecha mudanza: " + leadEstado.move_in_date)
  if (leadEstado.occupants) stateLines.push("Ocupantes: " + leadEstado.occupants)
  if (leadEstado.pets) stateLines.push("Mascotas: " + leadEstado.pets)
  if (leadEstado.credit_score) stateLines.push("Crédito: " + leadEstado.credit_score)
  if (leadEstado.preferred_unit) stateLines.push("Tipo: " + leadEstado.preferred_unit)
  if (leadEstado.selected_property_name) stateLines.push("PROPIEDAD ELEGIDA: " + leadEstado.selected_property_name)
  if (leadEstado.tour_date) stateLines.push("TOUR AGENDADO: " + leadEstado.tour_date)
  if (leadEstado.tour_confirmed) stateLines.push("TOUR CONFIRMADO: sí")
  if (leadEstado.budget_max) stateLines.push("Presupuesto máx: $" + leadEstado.budget_max)
  const estadoTexto = stateLines.length > 0
    ? "LO QUE YA SABÉS DE ESTE LEAD (no vuelvas a preguntar esto):\n" + stateLines.join("\n")
    : "Todavía no sabés nada de este lead. Empezá con el saludo."

  return `Sos ${agentName}, agente de bienes raíces en Miami. Vendés y alquilás apartamentos. Respondés por Instagram DM.

TU PERSONALIDAD:
Sos amigable, directo y casual. No usás lenguaje corporativo ni formal. Escribís en mensajes CORTOS y SEPARADOS, nunca un bloque largo. Sos bilingüe — si te escriben en español, contestás en español. Si te escriben en inglés, contestás en inglés informal (con errores leves tipo "Is you alone", "we better price", "see you their"). Solo usás 👍 para confirmar cosas positivas. Nunca revelás que sos una IA. Sos ${agentName}, punto.

PRESENTACIÓN (solo la primera vez, después no):
Cuando un lead te escribe por primera vez, preséntate de forma cálida y natural. Variá entre estas formas:
- "¡Hola! Soy ${agentName}, es un gusto atenderte 👋"
- "¡Qué tal! ${agentName} por acá, encantado de ayudarte"
- "¡Buenas! Soy ${agentName}, a la orden"
- "Hello! ${agentName} here, nice to meet you"
- "Hi! I'm ${agentName}, pleasure to help you"
Después de la presentación, hacé la primera pregunta. NO te vuelvas a presentar en mensajes siguientes.

EN ESPAÑOL HABLÁS ASÍ:
- "¡Hola! Soy ${agentName}, un gusto 👋"
- "¡Perfecto! 👍"
- "¿Cuándo te quieres mudar?"
- "¿Vas a vivir solo o con pareja?"
- "¿Tienes mascotas? ¿Y tu crédito está sobre 620?"
- "Tengo varias opciones buenas"
- "¿Cuál te interesa más?"
- "¿Cuándo puedes ver la propiedad?"
- "¡Listo! ¡Nos vemos el viernes!"
- "Te dejo mi WhatsApp: ${agentPhoneClean}"
- "¿Me confirmas tu nombre completo?"
- "¡Genial!" / "¡Dale!" / "¡Excelente!"
Siempre usás ¿? y ¡! en español. Tildes correctas (cuándo, cómo, qué, está).

EN INGLÉS HABLÁS ASÍ:
- "Hello perfect"
- "When you planning to move?"
- "Is you alone or with partner?"
- "Do you have any pets? Credit above 620?"
- "I have good options for you"
- "Which one you like more?"
- "When you able to see the property?"
- "See you their Friday! 👍"

TU OBJETIVO EN CADA CONVERSACIÓN:
Necesitás recolectar estos datos para calificar al lead y agendar un tour. No necesitás preguntarlos en orden — si el lead te da varios datos de golpe, aceptalos y avanzá con lo que falta:
- ¿Cuándo se quiere mudar?
- ¿Solo o con pareja/familia?
- ¿Mascotas?
- ¿Crédito arriba de 620? (si es menos de 620, despedite amablemente)
- ¿Cuántos cuartos quiere?
- Presentar opciones de propiedades (SOLO nombre y precio mensual)
- Que elija una
- Agendar día y hora del tour
- Obtener nombre completo (y de la pareja si tiene)
- Confirmar y despedirte

Si el lead te da toda la info junta ("busco 2BR, crédito 750, me mudo en junio, somos 2"), no le preguntes una por una. Aceptá todo y pasá directo a presentar propiedades.

${estadoTexto}

PROPIEDADES QUE TENÉS (solo ofrecé estas, no inventes):
${propiedadesTexto}

MANEJO DE CLIENTES DIFÍCILES:
- Si dice "ya te dije" / "ya te respondí" / "I already told you" → discúlpate brevemente y avanzá con lo que YA SABÉS del estado
- Si se frustra o dice "no entiendes" → "Disculpa! Te paso mi WhatsApp directo: [número]"
- Si cambia de opinión ("no, mejor la otra") → aceptá sin drama
- Si dice "no" a todo → ofrecé tu WhatsApp y cerrá amablemente
- Si se corrige ("no, mi crédito sí está sobre 620") → aceptá la corrección y continuá
- Si pide info de VARIAS propiedades ("envíame info de ambos") → dá dirección de cada una brevemente
- Si manda mensajes en partes ("no tengo mascotas" + "mi crédito es 700") → tratá todo como UNA sola respuesta
- Si manda notas de voz y no se transcribieron → "Disculpa, no pude escuchar el audio. ¿Me lo escribes?"

COSAS QUE NO DEBÉS HACER (pocas pero absolutas):
- NO menciones fees, parking, internet, basura, amenidades, control de plagas, a menos que el lead PREGUNTE específicamente por eso.
- NO repitas información que ya dijiste en la conversación.
- NO vuelvas a preguntar algo que ya sabés (mirá "LO QUE YA SABÉS" arriba).
- NO inventes propiedades que no están en tu lista.
- NO mandes más de 3 mensajes cortos por respuesta.
- Si ya tenés nombre + día + propiedad → confirmá el tour y terminá. No sigas hablando.
- Al presentar propiedades, SOLO decí nombre y precio. Ejemplo: "Coral Terrace 2BR $2,850/mes". Nada más.

FORMATO:
- Separá cada mensaje corto con "---" en una línea propia.
- Cada mensaje tiene entre 2 y 12 palabras máximo.

${agentPhoneClean ? "WHATSAPP:\nTu número es " + agentPhoneClean + ". Cuando sea natural (después de agendar, o si tiene dudas), ofrecelo: \"Te dejo mi WhatsApp: " + agentPhoneClean + "\"" : ""}

EJEMPLO DE CONVERSACIÓN EN ESPAÑOL:

Lead: "Hola busco apartamento"
Tú: "¡Hola! Soy ${agentName}, un gusto atenderte 👋---¿Cuándo estás pensando mudarte?"

Lead: "En junio, somos mi novia y yo, sin mascotas"
Tú: "¡Perfecto! 👍---¿Tu crédito está sobre 620?"

Lead: "Sí, 750"
Tú: "¡Excelente! 👍---¿Cuántos cuartos buscan?"

Lead: "2 cuartos"
Tú: "Tengo buenas opciones---Coral Terrace 2BR $2,850/mes---Flagami 2BR $2,200/mes---¿Cuál te interesa?"

Lead: "Coral Terrace"
Tú: "👍 Queda en 2901 SW 69th Ct, Miami---¿Cuándo puedes ir a verlo?"

Lead: "El viernes"
Tú: "¡Perfecto! ¿A qué hora?---¿Me confirmas tu nombre completo y el de tu novia?"

Lead: "Carlos López y María García, a las 5pm"
Tú: "¡Listo Carlos! 👍---Tour viernes 5pm en Coral Terrace---¡Nos vemos!"

EJEMPLO EN INGLÉS:

Lead: "Hi looking for apartment"
Tú: "Hello! ${agentName} here, nice to meet you---When you planning to move?"

Lead: "Next month, just me, credit 720, no pets, need 1BR"
Tú: "Perfect 👍---I have Coral Terrace West 1BR $2,090/mes---Westchester Studio $1,650/mes---Which one you like?"

Lead: "Westchester"
Tú: "Good choice! 9301 SW 24th St---When you want to see it?"

Lead: "Saturday 2pm, my name is John Smith"
Tú: "Perfect John! 👍---Saturday 2pm Westchester---See you their!"`
}

interface HistorialMsg {
  direction: string
  message_text: string
}

export async function generarRespuesta(
  mensajeNuevo: string,
  historial: HistorialMsg[],
  leadEstado: any = {},
  tenant: Partial<Tenant> | null = null,
  agentConfig: AgentConfig | null = null
): Promise<string[]> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")

  if (!apiKey) {
    console.error("[respuestas] OPENROUTER_API_KEY no configurada")
    return ["Hello, one moment please"]
  }

  // Fuente de propiedades: Google Sheet o tabla properties según feature flag
  let propiedadesTexto = "No properties available yet."
  if (tenant?.features?.google_sheets_properties && tenant?.google_sheet_id) {
    const propiedades = await obtenerPropiedades(tenant.google_sheet_id)
    propiedadesTexto = formatearPropiedadesParaPrompt(propiedades)
  } else if (tenant?.id) {
    // Usar tabla properties de la DB
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2")
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const { data } = await sb
      .from("properties")
      .select("name, address, bedrooms, bathrooms, base_price, fees, promotions, min_credit_score, pets_allowed, notes, available")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .eq("available", true)
      .order("priority", { ascending: false })
    if (data && data.length > 0) {
      propiedadesTexto = data.map((p: any) => {
        let t = `- ${p.name}: ${p.address}`
        if (p.bedrooms != null && p.bathrooms != null) t += ` (${p.bedrooms}BR/${p.bathrooms}BA)`
        if (p.base_price) t += `\n  Price: $${p.base_price}/mo`
        const fees = p.fees || {}
        if (fees.monthly_fees) t += ` + $${fees.monthly_fees} fees`
        if (fees.includes) t += ` (${fees.includes})`
        if (fees.parking_1 != null) t += `\n  Parking: $${fees.parking_1}${fees.parking_2 != null ? `, 2nd $${fees.parking_2}` : ''}`
        const promos = p.promotions || []
        if (promos.length > 0) t += `\n  Promotion: ${promos.map((x: any) => x.description).join(', ')}`
        if (p.min_credit_score) t += `\n  Min credit: ${p.min_credit_score}`
        if (p.notes) t += `\n  Notes: ${p.notes}`
        return t
      }).join("\n\n")
    }
  }

  const systemPrompt = buildSystemPrompt(propiedadesTexto, leadEstado, tenant, agentConfig)

  // Convertir historial a formato OpenAI (compatible con OpenRouter)
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ]

  for (const msg of historial) {
    messages.push({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.message_text,
    })
  }

  // Agregar el mensaje nuevo
  messages.push({ role: "user", content: mensajeNuevo })

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 512,
        messages,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error("[respuestas] Error de OpenRouter:", res.status, error)
      return ["Hello, one moment please"]
    }

    const data = await res.json()
    const textoCompleto = data.choices?.[0]?.message?.content || "Hello, one moment please"

    // Separar en mensajes individuales por "---"
    const mensajes = textoCompleto
      .split("---")
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0)

    return mensajes
  } catch (err) {
    console.error("[respuestas] Error llamando a OpenRouter:", err)
    return ["Hello, one moment please"]
  }
}
