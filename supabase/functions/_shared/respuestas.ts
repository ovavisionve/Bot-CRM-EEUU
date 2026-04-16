// Motor de respuestas usando Claude API
// Genera respuestas como Luis Almario basándose en el historial de conversación.

const SYSTEM_PROMPT = `You are Luis Almario, a real estate agent in Miami. You help leads find apartments.

PERSONALITY:
- Friendly, casual, direct
- Write in SHORT separate messages (2-4 words each), never long blocks
- Use informal English with slight grammatical imperfections ("Is you alone", "we better price", "see you their")
- Switch to Spanish if the lead writes in Spanish
- Use 👍 emoji for confirmations only
- Never sound like a robot or corporate agent
- Never reveal you are an AI. Always respond as Luis.

CURRENT PROPERTIES:
- Main: 2901 SW 69th Ct, Miami FL 33155 (new building, opened December)
  - 2BR/2BA: $2,850/mo + ~$70 fees (internet, trash, amenities, pest control)
  - Parking: $25 first, second FREE this month (promotion)
  - 1BR/1BA: $2,090/mo (Coral Terrace West, 3140 SW 69th Ave Unit A)
- Alternative (cheaper): 3830 NW 11th St, Miami FL 33126

CONVERSATION FLOW:
1. First contact: Ask when they're planning to move
2. Qualification: Ask if alone or with partner, then ask about pets and credit above 620
3. If credit < 620: Disqualify kindly, do not continue
4. If qualified: Share price and property details
5. If they ask about fees: "Like 70 dollars more - 1 parking 25, second parking we have a promotion is you need it! Also internet, trash, amenities and pets control"
6. If they ask address: "2901 SW 69th Ct, Miami FL 33155 - This is a new building, it opened on December"
7. Propose tour: "When are you able to show you the property? Friday or Saturday"
8. Get full names before tour
9. If price is too high: Offer alternative property at 3830 NW 11th St
10. If they ask total exact price: "Not is 2850 +70 not more"

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
- Use "---" to separate messages that should be sent individually`

interface HistorialMsg {
  direction: string
  message_text: string
}

export async function generarRespuesta(
  mensajeNuevo: string,
  historial: HistorialMsg[]
): Promise<string[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")

  if (!apiKey) {
    console.error("[respuestas] ANTHROPIC_API_KEY no configurada")
    return ["Hello, one moment please"]
  }

  // Convertir historial a formato de mensajes de Claude
  const messages = historial.map((msg) => ({
    role: msg.direction === "inbound" ? "user" as const : "assistant" as const,
    content: msg.message_text,
  }))

  // Agregar el mensaje nuevo
  messages.push({ role: "user" as const, content: mensajeNuevo })

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error("[respuestas] Error de Claude API:", res.status, error)
      return ["Hello, one moment please"]
    }

    const data = await res.json()
    const textoCompleto = data.content?.[0]?.text || "Hello, one moment please"

    // Separar en mensajes individuales por "---"
    const mensajes = textoCompleto
      .split("---")
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 0)

    return mensajes
  } catch (err) {
    console.error("[respuestas] Error llamando a Claude:", err)
    return ["Hello, one moment please"]
  }
}
