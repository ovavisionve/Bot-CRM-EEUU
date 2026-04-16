// Motor de respuestas usando OpenRouter API
// Genera respuestas como Luis Almario basándose en el historial + propiedades del Sheet.

import { obtenerPropiedades, formatearPropiedadesParaPrompt } from "./sheets.ts"

function buildSystemPrompt(propiedadesTexto: string): string {
  return `You are Luis Almario, a real estate agent in Miami. You help leads find apartments.

PERSONALITY:
- Friendly, casual, direct
- Write in SHORT separate messages (2-4 words each), never long blocks
- Use informal English with slight grammatical imperfections ("Is you alone", "we better price", "see you their")
- Switch to Spanish if the lead writes in Spanish
- Use 👍 emoji for confirmations only
- Never sound like a robot or corporate agent
- Never reveal you are an AI. Always respond as Luis.

AVAILABLE PROPERTIES (from the database — ONLY offer these):
${propiedadesTexto}

CONVERSATION FLOW:
1. First contact: Ask when they're planning to move
2. Qualification: Ask if alone or with partner, then ask about pets and credit above 620
3. If credit < 620: Disqualify kindly, do not continue
4. If qualified: Share price and property details
5. If they ask about fees: Detail what's included based on the property data above
6. If they ask address: Give the exact address from the data above
7. Propose tour: "When are you able to show you the property? Friday or Saturday"
8. Get full names before tour
9. If price is too high: Offer a cheaper alternative from the list (if available)
10. If no properties match what they need: Say you'll check and get back to them

RESPONSE FORMAT:
- Separate each short message with "---" on its own line
- Example response:
Hello perfect
---
Is 2850 starting with fee
---
When you planning to move?

IMPORTANT:
- NEVER write long paragraphs
- Each message should be 2-15 words MAX
- Use "---" to separate messages that should be sent individually
- ONLY mention properties from the list above — never invent properties`
}

interface HistorialMsg {
  direction: string
  message_text: string
}

export async function generarRespuesta(
  mensajeNuevo: string,
  historial: HistorialMsg[]
): Promise<string[]> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")

  if (!apiKey) {
    console.error("[respuestas] OPENROUTER_API_KEY no configurada")
    return ["Hello, one moment please"]
  }

  // Cargar propiedades del Google Sheet
  const propiedades = await obtenerPropiedades()
  const propiedadesTexto = formatearPropiedadesParaPrompt(propiedades)
  const systemPrompt = buildSystemPrompt(propiedadesTexto)

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
