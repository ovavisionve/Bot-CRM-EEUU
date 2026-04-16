// supabase/functions/webhook/index.ts
// Webhook de Instagram — OVA VISION
// Recibe verificación GET de Meta y eventos POST de mensajes.

import { detectarRespuesta } from "../_shared/respuestas.ts"
import { enviarMensaje } from "../_shared/instagram.ts"
import { guardarLead } from "../_shared/db.ts"
import { notificarAdmin } from "../_shared/notificar.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ─── GET: Verificación de Meta ───
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")

    const expected = Deno.env.get("META_VERIFY_TOKEN")

    if (!expected) {
      console.error("[webhook:GET] META_VERIFY_TOKEN no está configurado")
      return new Response("Server misconfigured", { status: 500 })
    }

    if (mode === "subscribe" && token === expected && challenge) {
      console.log("[webhook:GET] Verificación OK — devolviendo challenge")
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }

    console.warn("[webhook:GET] Verificación rechazada", { mode, tokenMatch: token === expected })
    return new Response("Unauthorized", { status: 403 })
  }

  // ─── POST: Eventos de Instagram ───
  if (req.method === "POST") {
    try {
      const body = await req.json()

      console.log("[webhook:POST] Evento recibido:", JSON.stringify(body, null, 2))

      // Verificar que es un evento de Instagram
      if (body.object !== "instagram") {
        console.warn("[webhook:POST] Evento ignorado — object:", body.object)
        return new Response("Not Instagram", { status: 400 })
      }

      for (const entry of body.entry || []) {
        console.log("[webhook:POST] Entry ID:", entry.id, "— Time:", entry.time)

        for (const event of entry.messaging || []) {
          const senderId = event.sender?.id
          const mensaje = event.message?.text || ""

          console.log("[webhook:POST] Mensaje de", senderId, ":", mensaje)

          if (!mensaje) {
            console.log("[webhook:POST] Evento sin texto (sticker, imagen, etc.) — ignorado")
            continue
          }

          // TODO (paso 4-5): detectar respuesta y enviar DM
          // TODO (paso 6): guardar lead en DB
          // TODO (paso 7): notificar al admin
        }
      }
    } catch (err) {
      console.error("[webhook:POST] Error procesando evento:", err)
    }

    // Siempre responder 200 para que Meta no reintente
    return new Response("OK", { status: 200 })
  }

  return new Response("Method not allowed", { status: 405 })
})
