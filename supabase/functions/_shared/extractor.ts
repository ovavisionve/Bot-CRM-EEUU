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

  const prompt = `Extract structured data from this real estate conversation.

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

FULL CONVERSATION:
${conversacion}
Lead: ${mensajeNuevo}

Extract ONLY fields that can be CONFIDENTLY determined from the conversation. If something was never mentioned or is ambiguous, leave it null.

Return JSON with these fields (use null for unknown):
{
  "name": "Lead full name if given, else null",
  "partner_name": "Partner name if given, else null",
  "move_in_date": "June 2026 / next month / etc if given, else null",
  "occupants": "solo | pareja | familia",
  "pets": "none | normal | ESA",
  "credit_score": number or null,
  "preferred_unit": "1BR/1BA | 2BR/2BA | 3BR/2BA | studio | null",
  "selected_property_name": "Exact name of property the lead chose from agent options (e.g. 'Coral Terrace 2BR/2BA', 'Flagami 2BR/1BA'). Null if not yet chosen",
  "tour_date": "Friday 5pm / tomorrow 2pm / 2026-04-20 etc. Null if no tour scheduled",
  "tour_confirmed": "true if tour is confirmed with specific date+time, false otherwise",
  "language": "en | es (based on how lead writes)",
  "status": "new | contacted | qualified | disqualified | touring | tour_confirmed | closed_won | closed_lost",
  "budget_max": "max monthly budget if mentioned, else null",
  "notes": "brief relevant notes (preferences, concerns) - max 200 chars"
}

STATUS RULES:
- new: just started
- contacted: greeted but no info yet
- qualified: credit >= 620 AND occupants given
- disqualified: credit < 620
- touring: tour date proposed but not confirmed
- tour_confirmed: tour date + names given
- closed_won/closed_lost: only if explicitly signed or rejected

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
