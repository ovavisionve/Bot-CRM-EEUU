// Procesar attachments de Instagram (voice notes, imagenes, videos)
// Voice notes -> transcripcion con Whisper (OpenAI) si hay API key
// Imagenes -> descripcion con modelo de vision via OpenRouter

export interface AttachmentResult {
  type: "audio" | "image" | "video" | "file"
  text: string // texto extraido o descripcion
  originalUrl: string
}

export async function processAttachments(
  attachments: any[],
  accessToken: string | null,
  context?: string
): Promise<AttachmentResult[]> {
  const results: AttachmentResult[] = []

  for (const att of attachments) {
    const type = att.type as string
    const url = att.payload?.url

    if (!url) continue

    if (type === "audio") {
      const text = await transcribeAudio(url, accessToken)
      results.push({ type: "audio", text, originalUrl: url })
    } else if (type === "image") {
      const text = await analyzeImage(url, context)
      results.push({ type: "image", text, originalUrl: url })
    } else if (type === "video") {
      results.push({ type: "video", text: "[Video recibido]", originalUrl: url })
    } else {
      results.push({ type: "file", text: "[Archivo recibido]", originalUrl: url })
    }
  }

  return results
}

async function transcribeAudio(url: string, accessToken: string | null): Promise<string> {
  // Intentar transcribir con OpenAI Whisper
  const openaiKey = Deno.env.get("OPENAI_API_KEY")
  if (!openaiKey) {
    console.log("[attachments] OPENAI_API_KEY no configurada, no se puede transcribir audio")
    return "[Nota de voz recibida - transcripcion no disponible]"
  }

  try {
    // Descargar el audio de Meta (requiere access token en la URL)
    const audioUrl = accessToken ? url + (url.includes("?") ? "&" : "?") + "access_token=" + accessToken : url
    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      console.error("[attachments] Error descargando audio:", audioRes.status)
      return "[Nota de voz recibida - no se pudo descargar]"
    }
    const audioBlob = await audioRes.blob()

    // Enviar a Whisper
    const formData = new FormData()
    formData.append("file", audioBlob, "audio.mp4")
    formData.append("model", "whisper-1")
    formData.append("language", "auto")

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + openaiKey },
      body: formData,
    })

    if (!whisperRes.ok) {
      console.error("[attachments] Whisper error:", whisperRes.status)
      return "[Nota de voz recibida - error de transcripcion]"
    }

    const data = await whisperRes.json()
    const transcript = data.text || ""
    console.log("[attachments] Audio transcrito:", transcript.substring(0, 100))
    return transcript || "[Nota de voz vacia]"
  } catch (err) {
    console.error("[attachments] Error transcribiendo audio:", err)
    return "[Nota de voz recibida - error procesando]"
  }
}

async function analyzeImage(url: string, context?: string): Promise<string> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")
  if (!apiKey) {
    return "[Imagen recibida - analisis no disponible]"
  }

  try {
    const prompt = context
      ? "This image was sent by a real estate lead during a conversation. Context: " + context + ". Describe what you see briefly (1-2 sentences). If it's a property photo, mention key details. If it's a document (ID, check, application), mention what type."
      : "Describe this image briefly (1-2 sentences). Focus on what's relevant for a real estate conversation."

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    })

    if (!res.ok) {
      console.error("[attachments] Vision error:", res.status)
      return "[Imagen recibida]"
    }

    const data = await res.json()
    const description = data.choices?.[0]?.message?.content || "[Imagen recibida]"
    console.log("[attachments] Imagen analizada:", description.substring(0, 100))
    return "[Imagen: " + description + "]"
  } catch (err) {
    console.error("[attachments] Error analizando imagen:", err)
    return "[Imagen recibida]"
  }
}
