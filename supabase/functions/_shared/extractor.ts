// Extrae datos estructurados del lead a partir de la conversación
// para mantener memoria explícita y evitar que el bot se confunda.

interface HistorialMsg {
  direction: string
  message_text: string
}

export interface LeadEstado {
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

const ALLOWED_FIELDS: (keyof LeadEstado)[] = [
  "name", "partner_name", "move_in_date", "occupants", "pets",
  "credit_score", "preferred_unit", "selected_property_name",
  "tour_date", "tour_confirmed", "language",
  "budget_max", "notes", "sentiment", "close_probability",
]

export function computeStatus(lead: any): string {
  if (lead.credit_score && lead.credit_score < 620) return "disqualified"
  if (
    lead.tour_confirmed === true ||
    (lead.tour_date && lead.selected_property_name && lead.name)
  ) return "tour_confirmed"
  if (lead.tour_date || lead.selected_property_name) return "touring"
  if (lead.credit_score && lead.credit_score >= 620 && lead.occupants) return "qualified"
  if (lead.name || lead.occupants || lead.credit_score || lead.move_in_date) return "contacted"
  return "new"
}

export function computeStage(lead: any): { stage: string; needed: string[]; nextQuestion: string } {
  const needed: string[] = []

  if (!lead.move_in_date) needed.push("fecha de mudanza")
  if (!lead.occupants) needed.push("si vive solo o con pareja/familia")
  if (!lead.pets) needed.push("mascotas")
  if (!lead.credit_score) needed.push("credito sobre 620")
  if (!lead.preferred_unit) needed.push("cuantos cuartos busca")

  if (lead.credit_score && lead.credit_score < 620) {
    return { stage: "DISQUALIFIED", needed: [], nextQuestion: "Despedite amablemente, credito insuficiente." }
  }

  if (needed.length > 0) {
    return {
      stage: "QUALIFYING",
      needed,
      nextQuestion: `Pregunta por: ${needed[0]}. Podes combinar 2 preguntas si es natural.`,
    }
  }

  if (!lead.selected_property_name) {
    return {
      stage: "PRESENTING_PROPERTIES",
      needed: ["que elija una propiedad"],
      nextQuestion: "Presenta las opciones (SOLO nombre y precio) y pregunta cual le interesa.",
    }
  }

  if (!lead.tour_date) {
    return {
      stage: "SCHEDULING_TOUR",
      needed: ["dia y hora del tour"],
      nextQuestion: "Pregunta cuando puede ir a ver la propiedad.",
    }
  }

  if (!lead.name) {
    return {
      stage: "GETTING_NAME",
      needed: ["nombre completo"],
      nextQuestion: "Pedi el nombre completo (y de la pareja si tiene).",
    }
  }

  return {
    stage: "CONFIRMING",
    needed: [],
    nextQuestion: "Confirma el tour (propiedad + dia + hora + nombre) y despedite.",
  }
}

function validateExtracted(parsed: any): LeadEstado {
  const result: LeadEstado = {}

  for (const key of ALLOWED_FIELDS) {
    const val = parsed[key]
    if (val === null || val === undefined || val === "" || val === "null") continue

    switch (key) {
      case "credit_score":
      case "budget_max":
      case "close_probability": {
        const num = typeof val === "number" ? val : parseInt(String(val))
        if (!isNaN(num)) result[key] = num
        break
      }
      case "tour_confirmed": {
        result[key] = val === true || val === "true"
        break
      }
      case "language": {
        const lang = String(val).toLowerCase()
        if (lang === "en" || lang === "es") result[key] = lang
        break
      }
      case "occupants": {
        const occ = String(val).toLowerCase()
        if (["solo", "pareja", "familia"].includes(occ)) result[key] = occ
        break
      }
      case "pets": {
        const pet = String(val).toLowerCase()
        if (["none", "normal", "esa"].includes(pet)) result[key] = pet
        break
      }
      case "sentiment": {
        const sent = String(val).toLowerCase()
        if (["positive", "neutral", "negative", "frustrated"].includes(sent)) result[key] = sent
        break
      }
      default:
        result[key] = String(val)
    }
  }

  return result
}

export async function extraerEstadoLead(
  historial: HistorialMsg[],
  mensajeNuevo: string,
  estadoActual: any,
  _tenant?: any,
  propertyNames?: string[]
): Promise<LeadEstado> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")
  if (!apiKey) return {}

  // Solo enviar ultimos 10 mensajes para mantener foco
  const historialReciente = historial.slice(-10)
  const conversacion = historialReciente
    .map((m) => `${m.direction === "inbound" ? "Lead" : "Agent"}: ${m.message_text}`)
    .join("\n")

  // Estado actual compacto: solo campos con valor
  const estadoCompacto = Object.fromEntries(
    Object.entries({
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
    }).filter(([_, v]) => v !== null && v !== undefined)
  )

  const prompt = `Extract lead data from this real estate conversation into JSON.

CURRENT LEAD DATA (preserve if the new message doesn't change them):
${JSON.stringify(estadoCompacto, null, 2)}

RECENT CONVERSATION:
${conversacion}
Lead (LATEST MESSAGE): ${mensajeNuevo}

AVAILABLE PROPERTIES (use EXACT names for selected_property_name):
${(propertyNames && propertyNames.length > 0) ? propertyNames.map(n => "- " + n).join("\n") : "- (none loaded)"}

RULES:
- Extract ONLY what the lead explicitly says or confirms
- If the lead mentions a property by partial name, match to the closest from the list above
- If they say a day name ("Friday", "sabado") -> tour_date = that day name
- If they say a time ("5pm", "a las 3") AND tour_date already has a day -> COMBINE: "sabado 5pm"
- If they say a time without a prior day -> tour_date = the time alone
- If they mention a partner/spouse name -> partner_name
- "solo"/"alone" -> occupants = "solo", "con pareja"/"with partner" -> occupants = "pareja"
- If they say "yes" to credit 620 question -> credit_score = 620
- PRESERVE previous values: if a field has a value and the new message doesn't change it, KEEP the previous value
- NEVER clear selected_property_name unless the lead explicitly chooses a different one

Return ONLY valid JSON, no markdown, no explanation:
{
  "name": string or null,
  "partner_name": string or null,
  "move_in_date": string or null,
  "occupants": "solo" | "pareja" | "familia" | null,
  "pets": "none" | "normal" | "ESA" | null,
  "credit_score": number or null,
  "preferred_unit": string or null,
  "selected_property_name": exact string from list or null,
  "tour_date": string or null,
  "tour_confirmed": boolean,
  "language": "en" | "es",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "close_probability": number 0-100
}`

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-haiku",
        max_tokens: 500,
        temperature: 0,
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

    console.log("[extractor] Raw (first 300 chars):", texto.substring(0, 300))

    const firstBrace = texto.indexOf("{")
    const lastBrace = texto.lastIndexOf("}")
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error("[extractor] No valid JSON found in response")
      return {}
    }
    const jsonStr = texto.substring(firstBrace, lastBrace + 1)
    const parsed = JSON.parse(jsonStr)

    console.log("[extractor] Parsed JSON:", JSON.stringify(parsed))

    // Validate types and filter to allowed fields only
    const validated = validateExtracted(parsed)

    console.log("[extractor] Validated fields:", Object.keys(validated).join(", ") || "(empty)")
    if (Object.keys(validated).length === 0) {
      console.warn("[extractor] WARNING: extractor returned all null/empty. Raw:", texto.substring(0, 200))
    }

    return validated
  } catch (err) {
    console.error("[extractor] Parse error:", err)
    return {}
  }
}
