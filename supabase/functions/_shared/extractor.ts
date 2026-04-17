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

  const prompt = `Sos un extractor de datos. Leé esta conversación de real estate y extraé los datos del lead a JSON.

DATOS ACTUALES DEL LEAD (preservalos si el mensaje nuevo no los cambia):
${JSON.stringify(
    Object.fromEntries(
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
        status: estadoActual.status,
      }).filter(([_, v]) => v !== null && v !== undefined)
    ),
    null, 2
  )}

CONVERSACIÓN:
${conversacion}
Lead (ÚLTIMO MENSAJE): ${mensajeNuevo}

PROPIEDADES DISPONIBLES (usá estos nombres exactos para selected_property_name):
- Coral Terrace 2BR/2BA
- Coral Terrace West 1BR/1BA
- Flagami Budget 2BR/1BA
- Alexan Ludlam Premium 2BR/2BA
- Westchester Studio
- Bird Road 3BR/2BA
- Doral Modern 1BR/1BA
- Little Havana Renovated 2BR/1BA
- Kendall Family 3BR/2BA
- Brickell Tower 1BR/1BA

REGLAS:
- Si el lead dice "Coral Terrace" o "coral terrace" → selected_property_name = "Coral Terrace 2BR/2BA"
- Si dice "Flagami" → "Flagami Budget 2BR/1BA"
- Si dice un día ("viernes", "Friday", "sabado") → tour_date = ese día
- Si dice un nombre ("Carlos Lopez") → name = "Carlos Lopez"
- Si menciona pareja ("mi novia Maria") → partner_name = "Maria"
- Si dice "solo" / "alone" → occupants = "solo"
- Si dice "con pareja" / "with partner" → occupants = "pareja"
- Si dice un número de crédito → credit_score = ese número
- Si responde "sí" a pregunta de crédito 620 → credit_score = 620
- Si dice "2 cuartos" / "2BR" → preferred_unit = "2BR/2BA"
- PRESERVAR datos previos: si un campo ya tiene valor y el mensaje nuevo no lo cambia, mantené el valor anterior
- NUNCA borrar selected_property_name si ya estaba puesto (salvo que elija otra)

STATUS:
- new → sin info
- contacted → ya saludó
- qualified → crédito >= 620 Y sabe ocupantes
- touring → eligió propiedad O propuso día de tour
- tour_confirmed → tiene propiedad + día + nombre
- disqualified → crédito < 620

Devolvé SOLO JSON válido, sin markdown, sin explicación:
{
  "name": string o null,
  "partner_name": string o null,
  "move_in_date": string o null,
  "occupants": "solo" | "pareja" | "familia" | null,
  "pets": "none" | "normal" | "ESA" | null,
  "credit_score": number o null,
  "preferred_unit": string o null,
  "selected_property_name": string EXACTO de la lista o null,
  "tour_date": string o null,
  "tour_confirmed": boolean,
  "language": "en" | "es",
  "status": string,
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
