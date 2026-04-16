// Enviar mensajes por Instagram Business API
// Usa el access_token del tenant (cada cliente tiene su propia cuenta de IG)

const IG_API_URL = "https://graph.instagram.com/v22.0/me/messages"

export async function enviarMensaje(
  recipientId: string,
  texto: string,
  accessToken?: string | null
) {
  // Fallback a env var si no se pasa token (compatibilidad)
  const token = accessToken || Deno.env.get("INSTAGRAM_ACCESS_TOKEN")

  if (!token) {
    console.error("[instagram] No hay access_token disponible (tenant ni env)")
    return
  }

  const res = await fetch(IG_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: texto },
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    console.error("[instagram] Error enviando mensaje:", res.status, error)
    return
  }

  console.log("[instagram] Mensaje enviado a", recipientId, ":", texto.substring(0, 50))
}

export async function enviarMensajesMultiples(
  recipientId: string,
  mensajes: string[],
  accessToken?: string | null
) {
  for (let i = 0; i < mensajes.length; i++) {
    await enviarMensaje(recipientId, mensajes[i], accessToken)

    if (i < mensajes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
}
