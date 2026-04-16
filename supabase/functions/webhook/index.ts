// supabase/functions/webhook/index.ts
// Webhook de Instagram — OVA VISION / Luis Almario RE
// Recibe verificación GET de Meta y procesa DMs con IA.

import { generarRespuesta } from "../_shared/respuestas.ts"
import { enviarMensajesMultiples } from "../_shared/instagram.ts"
import { obtenerOCrearLead, guardarMensaje, obtenerHistorial, actualizarLead } from "../_shared/db.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { extraerEstadoLead } from "../_shared/extractor.ts"

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

      if (body.object !== "instagram") {
        console.warn("[webhook:POST] Evento ignorado — object:", body.object)
        return new Response("Not Instagram", { status: 400 })
      }

      for (const entry of body.entry || []) {
        // Instagram Graph API manda los eventos en 2 formatos distintos:
        // 1. entry.messaging[]           (formato Messenger)
        // 2. entry.changes[] con field="messages"  (formato Instagram v5+)
        const messagingEvents = entry.messaging || []
        const changesEvents = (entry.changes || [])
          .filter((c: any) => c.field === "messages" || c.field === "message_reactions")
          .map((c: any) => c.value)

        const eventos = [...messagingEvents, ...changesEvents]

        for (const event of eventos) {
          const senderId = event.sender?.id
          const mensaje = event.message?.text || ""

          if (!senderId || !mensaje) {
            console.log("[webhook:POST] Evento sin texto — ignorado")
            continue
          }

          // Ignorar mensajes que nosotros mismos enviamos (echo)
          if (event.message?.is_echo) {
            console.log("[webhook:POST] Echo ignorado")
            continue
          }

          // Ignorar el evento de prueba de Meta (sender.id="12334")
          if (senderId === "12334") {
            console.log("[webhook:POST] Evento de prueba de Meta ignorado")
            continue
          }

          console.log("[webhook:POST] DM de", senderId, ":", mensaje)

          // 1. Obtener o crear lead en la DB
          const lead = await obtenerOCrearLead(senderId)

          // 2. Guardar el mensaje entrante
          await guardarMensaje(senderId, lead.id, mensaje, "inbound")

          // 3. Obtener historial de conversación
          const historial = await obtenerHistorial(senderId)

          // 4. Extraer estado estructurado del lead (memoria explícita)
          const nuevoEstado = await extraerEstadoLead(historial, mensaje, lead)
          if (Object.keys(nuevoEstado).length > 0) {
            await actualizarLead(senderId, nuevoEstado)
          }

          // 5. Generar respuesta con Claude usando el estado actualizado
          const leadActualizado = { ...lead, ...nuevoEstado }
          const respuestas = await generarRespuesta(mensaje, historial, leadActualizado)

          // 6. Enviar mensajes por Instagram (múltiples, cortos)
          await enviarMensajesMultiples(senderId, respuestas)

          // 7. Guardar cada respuesta en la DB
          for (const resp of respuestas) {
            await guardarMensaje(senderId, lead.id, resp, "outbound")
          }

          // 8. Notificar al admin si hubo cambio de estado importante
          if (nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true) {
            await notificarAdmin({
              senderId,
              mensaje: `Tour agendado con ${leadActualizado.name || senderId} en ${leadActualizado.tour_date || "fecha pendiente"}`,
              tipo: "tour_agendado",
            })
          } else if (nuevoEstado.status === "qualified") {
            await notificarAdmin({
              senderId,
              mensaje: `Lead calificado: ${leadActualizado.name || senderId}`,
              tipo: "calificado",
            })
          } else {
            await notificarAdmin({ senderId, mensaje })
          }
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
