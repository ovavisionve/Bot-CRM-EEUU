// Extrae datos estructurados del lead a partir de la conversación
// para mantener memoria explícita y evitar que el bot se confunda.

interface HistorialMsg {
  direction: string
  message_text: string
}

interface LeadEstado {
  name?: string | null
  partner_name?: string | null
  move_in_date?: string | null
  occupants?: string | null
  pets?: string | null
  credit_score?: number | null
  preferred_unit?: string | null
  selected_property_name?: string | null
  tour_date?: string | null
  tour_confirmed?: boolean | null
  language?: string | null
  status?: string | null
  budget_max?: number | null
  notes?: string | null
  sentiment?: string | null
  close_probability?: number | null
}

export async function extraerEstadoLead(
  historial: HistorialMsg[],
  mensajeNuevo: string,
  estadoActual: any,
  _tenant?: any // para futuro: prompt customizado por tenant
): Promise<LeadEstado> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")
  if (!apiKey) return {}

  const conversacion = historial
    .map((m) => `${m.direction === "inbound" ? "Lead" : "Agent"}: ${m.message_text}`)
    .join("\n")

  const prompt = `Extract structured data from this real estate conversation. Be AGGRESSIVE about detecting confirmations in the LATEST message.

CURRENT KNOWN STATE:
${JSON.stringify({
    name: estadoActual.name,
    partner_name: estadoActual.partner_name,
    move_in_date: estadoActual.move_in_date,
    occupants: estadoActual.occupants,
    pets: estadoActual.pets,
    credit_score: estadoActual.credit_score,
    preferred_unit: estadoActual.preferred_unit,
    selected_property_name: estadoActual.selected_property_name,
    tour_date: estadoActual.tour_date,
    tour_confirmed: estadoActual.tour_confirmed,
    status: estadoActual.status,
  }, null, 2)}

FULL CONVERSATION (most recent at bottom):
${conversacion}
Lead (LATEST): ${mensajeNuevo}

EXTRACTION RULES (CRITICAL):
- The LATEST message is the MOST IMPORTANT. Read it carefully.
- If the lead replies with just a property name like "Coral Terrace", "Flagami", "Bird Road" → that IS the selected_property_name. Use the FULL property name (e.g. "Coral Terrace 2BR/2BA", "Flagami Budget 2BR/1BA"). ALWAYS set this field when the lead mentions a property by name, even partially.
- If the lead has said the same property name multiple times, they are VERY clearly choosing it. Set selected_property_name AND advance status to at least "touring".
- "Confirm X", "at X", "the X one", "X is better", "quiero X", "me interesa X" → selected property
- If lead mentions a specific day/time + has selected a property → tour_date = that day/time
- Names like "Valeria Rodrigues", "Luis Ilarraza" → name (and partner_name if two names given)
- "solo" / "alone" → occupants = "solo"; "con pareja" / "with partner" → "pareja"
- "si", "yes", "perfecto" as answer to credit 620+ question → credit_qualified; if asked for number, infer credit_score or leave null
- Answer to "1BR/2BR/studio?" → extract to preferred_unit (e.g. "2BR/2BA")
- Don't downgrade fields: if selected_property_name was set, don't null it unless user explicitly changes choice
- If the lead is frustrated with the bot repeating questions, extract data from history aggressively and set status forward
- IMPORTANT: preserve previously known data if the latest message doesn't change it

Return JSON (use null ONLY if truly unknown, not if previously known):
{
  "name": "Lead full name",
  "partner_name": "Partner name",
  "move_in_date": "when moving",
  "occupants": "solo | pareja | familia",
  "pets": "none | normal | ESA",
  "credit_score": number,
  "preferred_unit": "1BR/1BA | 2BR/2BA | 3BR/2BA | studio",
  "selected_property_name": "EXACT property name lead chose",
  "tour_date": "Friday 5pm / 2026-04-20 / etc",
  "tour_confirmed": true/false,
  "language": "en | es",
  "status": "new | contacted | qualified | disqualified | touring | tour_confirmed | closed_won | closed_lost",
  "budget_max": number,
  "notes": "brief notes <200 chars",
  "sentiment": "positive | neutral | negative | frustrated (based on the lead's tone in the LATEST message)",
  "close_probability": "0-100 integer. How likely this lead is to sign a lease based on ALL data: credit, budget, engagement, timeline, interest shown, questions asked. 80+ = hot lead, 50-79 = warm, 20-49 = cold, <20 = unlikely"
}

STATUS RULES:
- new: no info yet
- contacted: greeted
- qualified: credit >= 620 AND occupants known
- disqualified: credit < 620
- touring: tour proposed but not fully confirmed
- tour_confirmed: property + date + names all confirmed
- closed_won/lost: explicit signed/rejected

Return ONLY valid JSON, no markdown.`

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) {
      console.error("[extractor] Error:", res.status, await res.text())
      return {}
    }

    const data = await res.json()
    const texto = data.choices?.[0]?.message?.content || "{}"

    // Intentar parsear el JSON (a veces viene envuelto en ```)
    const limpio = texto.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
    const parsed = JSON.parse(limpio)

    console.log("[extractor] Estado extraído:", JSON.stringify(parsed))

    // Filtrar nulls para no sobrescribir con nulls valores existentes
    const filtrado: LeadEstado = {}
    for (const key of Object.keys(parsed)) {
      if (parsed[key] !== null && parsed[key] !== undefined && parsed[key] !== "") {
        filtrado[key as keyof LeadEstado] = parsed[key]
      }
    }

    return filtrado
  } catch (err) {
    console.error("[extractor] Error parseando:", err)
    return {}
  }
}
