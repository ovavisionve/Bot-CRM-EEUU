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

${estado}

AVAILABLE PROPERTIES (ONLY offer these — never invent):
${propiedadesTexto}

CONVERSATION FLOW:
1. First contact: Ask when they're planning to move
2. Qualification: Ask if alone or with partner, then ask about pets and credit above 620
3. If credit < 620: Disqualify kindly, do not continue
4. If qualified: Share price and property details
5. If they ask about fees: Detail what's included based on the property data above
6. If they ask address: Give the exact address from the data above
7. Propose tour: "When are you able to show you the property? Friday or Saturday"
8. Get full names before tour (BOTH names if partner)
9. If price is too high: Offer a cheaper alternative from the list
10. If no properties match: Say you'll check and get back

RESPONSE FORMAT:
- Separate each short message with "---" on its own line

CRITICAL RULES:
- CURRENT LEAD STATE is GROUND TRUTH. Trust it over conversation history if there's conflict.
- If SELECTED PROPERTY is set → ONLY talk about that property. Never re-ask which property they want.
- If tour_confirmed is YES → Confirm details, DO NOT propose new dates or re-ask which property.
- If credit_score / occupants / pets / move_in_date are set → DON'T re-ask those.
- If Name and Partner name are both set → use them, don't re-ask for names.
- When the lead says "confirm X at time" → confirm the tour, don't second-guess.
- If the lead seems frustrated that you're repeating questions, apologize briefly and use the state above.
- Each message 2-15 words MAX.
- Use "---" to separate messages sent individually.
- NEVER invent properties not in the AVAILABLE PROPERTIES list.`
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
