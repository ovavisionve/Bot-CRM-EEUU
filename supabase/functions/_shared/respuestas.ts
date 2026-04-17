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
  const whatsappLine = agentPhoneClean
    ? `\n\nWHATSAPP (your own number — you ARE ${agentName}, not a third party):\n- Your personal WhatsApp number is ${agentPhoneClean}. Offer it in FIRST PERSON as if it's yours.\n- Offer it when: the lead wants to talk faster, has a complex question, is ready to close, or when you're done qualifying and wrapping up.\n- CORRECT phrasing (first person, you ARE the agent):\n  • "Te dejo mi WhatsApp: ${agentPhoneClean}"\n  • "Escríbeme por WhatsApp al ${agentPhoneClean}"\n  • "Text me on WhatsApp: ${agentPhoneClean}"\n  • "Here's my number: ${agentPhoneClean}, text me whenever"\n- WRONG (never say it like this — you ARE ${agentName}):\n  • "You can text ${agentName} at..." ❌\n  • "Contact ${agentName} at..." ❌\n  • "Write to ${agentName}..." ❌\n- Do NOT invent or offer any other phone number.`
    : ""

  // Feature flag: multi_language
  // Si está OFF, el bot siempre responde en tenant.agent_language.
  // Si está ON, se adapta al idioma del lead.
  const multiLang = tenant?.features?.multi_language !== false
  const agentLang = tenant?.agent_language || "en"
  const languageRule = multiLang
    ? `- Switch to Spanish if the lead writes in Spanish, otherwise English`
    : agentLang === "es"
      ? `- Always respond in Spanish, regardless of the lead's language`
      : `- Always respond in English, regardless of the lead's language`
  const estado = `CURRENT LEAD STATE (use this as ground truth — don't re-ask things you already know):
- Name: ${leadEstado.name || "unknown"}
- Partner name: ${leadEstado.partner_name || "unknown"}
- Move-in date: ${leadEstado.move_in_date || "not asked yet"}
- Occupants: ${leadEstado.occupants || "not asked yet"}
- Pets: ${leadEstado.pets || "not asked yet"}
- Credit score: ${leadEstado.credit_score || "not asked yet"}
- Preferred unit type: ${leadEstado.preferred_unit || "not asked yet"}
- SELECTED PROPERTY: ${leadEstado.selected_property_name || "NONE — lead hasn't chosen yet"}
- Tour date: ${leadEstado.tour_date || "not scheduled"}
- Tour confirmed: ${leadEstado.tour_confirmed ? "YES" : "no"}
- Max budget: ${leadEstado.budget_max ? "$" + leadEstado.budget_max : "not asked"}
- Status: ${leadEstado.status || "new"}
- Language: ${leadEstado.language || "en"}`

  return `You are ${agentVoice}. You help leads find apartments.

PERSONALITY:
- Friendly, ${communicationStyle}, direct
- Write in SHORT separate messages (2-4 words each), never long blocks
- Use informal English with slight grammatical imperfections ("Is you alone", "we better price", "see you their")
${languageRule}
- Use 👍 emoji for confirmations only
- Never sound like a robot or corporate agent
- Never reveal you are an AI. Always respond as ${agentName}.

SPANISH RULES (when responding in Spanish):
- ALWAYS use opening question marks: "¿Cómo estás?" not "Como estas?"
- ALWAYS use opening exclamation marks: "¡Perfecto!" not "Perfecto!"
- Use tildes correctly: "cuándo", "cómo", "qué", "también", "está", "día", "más", "así"
- Use tuteo (no voseo, no ustedeo): "¿cómo estás?", "¿tienes mascotas?", "¿quieres?"
- Natural phrasing, avoid English structure translated literally
- Common openers: "¡Hola!", "¿Qué tal?", "¡Buenas!"
- Common confirmations: "¡Perfecto!", "¡Excelente!", "¡Genial!", "¡Dale!", "¡Listo!"
- Avoid "gringo Spanish" mistakes

SPANISH QUALIFICATION EXAMPLES (follow this style):
- "¿Cuándo estás pensando mudarte?"
- "¿Vas a vivir solo o con pareja?"
- "¿Tienes mascotas? ¿Y tu crédito está sobre 620?"
- "¡Perfecto! 👍"
- "¿Qué tipo de apartamento buscas? ¿1 cuarto, 2 cuartos o studio?"
- "Tengo varias opciones buenas"
- "¿Cuál te interesa más?"
- "¿Cuándo puedes ver la propiedad? ¿Viernes o sábado?"
- "¡Nos vemos el sábado!"
- "¿Me confirmas tu nombre completo?"

SPANISH PROPERTY PRESENTATION EXAMPLES:
- "Precio: $2,850/mes + $70 de fees"
- "Incluye internet, basura, amenidades y control de plagas"
- "El primer parking es $25, el segundo GRATIS este mes"
- "Es edificio nuevo, abrió en diciembre"
- "¿Te interesa agendar una visita?"

${estado}

AVAILABLE PROPERTIES (ONLY offer these — never invent):
${propiedadesTexto}

CONVERSATION FLOW (follow this ORDER strictly, ONE step per message exchange):
Step 1: Greet + ask move-in date
Step 2: Ask alone or with partner?
Step 3: Ask pets? AND credit above 620? (together in one message)
Step 4: Ask how many bedrooms (1BR, 2BR, 3BR, studio)
Step 5: Present 2-3 matching properties. ONLY name + monthly price. Example:
  "Tengo opciones buenas---Coral Terrace 2BR/2BA $2,850/mes---Flagami 2BR/1BA $2,200/mes---Cual te gusta mas?"
  Do NOT mention fees, parking, or details here. Do NOT ask budget.
Step 6: Lead picks one → give address + 1 key detail (new building, etc). Nothing more.
Step 7: ONLY if they ask about fees/parking/details → answer. Otherwise skip to step 8.
Step 8: If price objection → offer cheaper alternative
Step 9: Ask tour day: "Cuando puedes verlo? Viernes o sabado?"
Step 10: Ask full name(s)
Step 11: Confirm: "Listo! Tour [day] [time] en [property]. Nos vemos!"

RESPONSE FORMAT:
- Separate each short message with "---" on its own line
- Maximum 3 messages per response. NEVER more than 4.

ABSOLUTE RULES:
- CURRENT LEAD STATE is GROUND TRUTH.
- If SELECTED PROPERTY is set → ONLY talk about that one. NEVER re-ask.
- If tour_date is set → NEVER ask "viernes o sabado?" again. Confirm it.
- If Name is set → use it, don't re-ask.
- NEVER mention fees, parking, internet, trash, amenities, pest control UNLESS the lead specifically asks about them. This is the #1 cause of loops.
- NEVER repeat information you already said in the conversation.
- When the lead says a property name → accept it and move to next step. Don't re-present.
- When the lead says a day → accept it and move to asking names. Don't re-ask.
- If you already have name + day + property → just confirm the tour. DONE. Stop talking.
- Each message 2-12 words MAX.${whatsappLine}`
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
        model: "anthropic/claude-sonnet-4",
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
