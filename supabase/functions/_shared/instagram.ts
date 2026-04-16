// Enviar mensajes por Instagram Graph API (Instagram Business Login flow)

// Endpoint del nuevo Instagram Business API (tokens IGAA)
const IG_API_URL = "https://graph.instagram.com/v22.0/me/messages"

export async function enviarMensaje(recipientId: string, texto: string) {
  const token = Deno.env.get("INSTAGRAM_ACCESS_TOKEN")

  if (!token) {
    console.error("[instagram] INSTAGRAM_ACCESS_TOKEN no configurado")
    return
  }

  const res = await fetch(IG_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
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

// Enviar múltiples mensajes cortos con delay entre cada uno
export async function enviarMensajesMultiples(recipientId: string, mensajes: string[]) {
  for (let i = 0; i < mensajes.length; i++) {
    await enviarMensaje(recipientId, mensajes[i])

    // Pequeño delay entre mensajes (simula escritura)
    if (i < mensajes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
}
