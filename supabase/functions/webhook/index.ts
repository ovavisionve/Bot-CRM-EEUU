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
    // TODO (paso 3): parsear body, detectar respuesta, enviar DM,
    // guardar lead y notificar al admin.
    return new Response("OK", { status: 200 })
  }

  return new Response("Method not allowed", { status: 405 })
})
