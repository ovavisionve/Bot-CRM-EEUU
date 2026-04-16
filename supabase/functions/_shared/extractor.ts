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
}

export async function extraerEstadoLead(
  historial: HistorialMsg[],
  mensajeNuevo: string,
  estadoActual: any
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

EXTRACTION RULES:
- The LATEST message is the most important. If the lead mentions a property by name in their latest message, that IS their selected property.
- "Confirm X", "at X", "the X one", "X is better" → clearly choosing property X
- If lead mentions a specific date/time AND a property in same message → tour_confirmed = true
- If the lead already confirmed names earlier, don't lose them
- Don't downgrade fields: if status was "tour_confirmed" don't change it to "touring" unless user cancels
- If the lead is frustrated with the bot repeating questions, that doesn't change any extracted data

Return JSON (use null ONLY if truly unknown, not if previously known):
{
  "name": "Lead full name",
  "partner_name": "Partner name",
  "move_in_date": "when moving",
  "occupants": "solo | pareja | familia",
  "pets": "none | normal | ESA",
  "credit_score": number,
  "preferred_unit": "1BR/1BA | 2BR/2BA | 3BR/2BA | studio",
  "selected_property_name": "EXACT property name lead chose (e.g. 'Flagami Budget 2BR/1BA', 'Coral Terrace 2BR/2BA'). Match the property name in the AVAILABLE PROPERTIES list exactly.",
  "tour_date": "Friday 5pm / 2026-04-20 / etc",
  "tour_confirmed": true/false,
  "language": "en | es",
  "status": "new | contacted | qualified | disqualified | touring | tour_confirmed | closed_won | closed_lost",
  "budget_max": number,
  "notes": "brief notes <200 chars"
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
        model: "google/gemini-2.5-flash",
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
