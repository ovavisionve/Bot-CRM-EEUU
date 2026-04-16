// supabase/functions/webhook/index.ts
// Webhook multi-tenant — identifica el tenant por el Instagram User ID
// que aparece en recipient.id (o entry.id) de cada evento.

import { generarRespuesta } from "../_shared/respuestas.ts"
import { enviarMensajesMultiples } from "../_shared/instagram.ts"
import {
  obtenerOCrearLead,
  guardarMensaje,
  obtenerHistorial,
  actualizarLead,
} from "../_shared/db.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { extraerEstadoLead } from "../_shared/extractor.ts"
import { getTenantByInstagramId, getAgentConfig } from "../_shared/tenant.ts"

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
      console.log("[webhook:GET] Verificación OK")
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      })
    }

    return new Response("Unauthorized", { status: 403 })
  }

  // ─── POST: Eventos de Instagram ───
  if (req.method === "POST") {
    try {
      const body = await req.json()

      console.log("[webhook:POST] Evento recibido:", JSON.stringify(body))

      if (body.object !== "instagram") {
        return new Response("Not Instagram", { status: 400 })
      }

      for (const entry of body.entry || []) {
        // El entry.id es el Instagram User ID del tenant que recibe el mensaje
        const instagramUserId = String(entry.id)

        // Identificar al tenant dueño de esta cuenta de Instagram
        const tenant = await getTenantByInstagramId(instagramUserId)

        if (!tenant) {
          console.warn("[webhook:POST] Sin tenant para instagram_user_id:", instagramUserId)
          continue
        }

        if (!tenant.bot_active) {
          console.log("[webhook:POST] Bot desactivado para tenant:", tenant.slug)
          continue
        }

        const agentConfig = await getAgentConfig(tenant.id)

        // Combinar ambos formatos de eventos (messaging y changes)
        const messagingEvents = entry.messaging || []
        const changesEvents = (entry.changes || [])
          .filter((c: any) => c.field === "messages" || c.field === "message_reactions")
          .map((c: any) => c.value)

        const eventos = [...messagingEvents, ...changesEvents]

        for (const event of eventos) {
          const senderId = event.sender?.id
          const mensaje = event.message?.text || ""

          if (!senderId || !mensaje) continue
          if (event.message?.is_echo) continue
          if (senderId === "12334") continue // evento de prueba de Meta

          console.log(`[webhook:POST][${tenant.slug}] DM de ${senderId}: ${mensaje}`)

          // 1. Obtener o crear lead con tenant_id
          const lead = await obtenerOCrearLead(senderId, tenant.id)

          // Si el operador humano tomó control, no responder con IA
          if (lead.ai_active === false) {
            console.log(`[webhook:POST][${tenant.slug}] AI pausado para este lead`)
            await guardarMensaje(senderId, lead.id, tenant.id, mensaje, "inbound")
            continue
          }

          // 2. Guardar mensaje inbound
          await guardarMensaje(senderId, lead.id, tenant.id, mensaje, "inbound")

          // 3. Historial
          const historial = await obtenerHistorial(senderId, tenant.id)

          // 4. Extraer estado estructurado
          const nuevoEstado = await extraerEstadoLead(historial, mensaje, lead, tenant)
          if (Object.keys(nuevoEstado).length > 0) {
            await actualizarLead(senderId, tenant.id, nuevoEstado)
          }

          // 5. Generar respuesta con estado actualizado + tenant config
          const leadActualizado = { ...lead, ...nuevoEstado }
          const respuestas = await generarRespuesta(
            mensaje,
            historial,
            leadActualizado,
            tenant,
            agentConfig
          )

          // 6. Enviar por Instagram usando el token del tenant
          await enviarMensajesMultiples(
            senderId,
            respuestas,
            tenant.instagram_access_token
          )

          // 7. Guardar respuestas outbound
          for (const resp of respuestas) {
            await guardarMensaje(senderId, lead.id, tenant.id, resp, "outbound")
          }

          // 8. Marcar último contacto del bot con el lead
          await actualizarLead(senderId, tenant.id, {
            last_ai_message_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
          })

          // 9. Notificar al admin si cambio de estado importante
          const leadName = leadActualizado.name || undefined
          if (nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true) {
            await notificarAdmin({
              senderId,
              leadName,
              mensaje: `Tour agendado ${leadActualizado.tour_date || ""} en ${leadActualizado.selected_property_name || ""}`,
              tipo: "tour_agendado",
              tenant,
            })
          } else if (nuevoEstado.status === "qualified") {
            await notificarAdmin({
              senderId,
              leadName,
              mensaje: `Lead calificado`,
              tipo: "calificado",
              tenant,
            })
          } else if (nuevoEstado.status === "disqualified") {
            await notificarAdmin({
              senderId,
              leadName,
              mensaje: `Lead descalificado`,
              tipo: "disqualified",
              tenant,
            })
          } else {
            await notificarAdmin({ senderId, mensaje, tenant })
          }
        }
      }
    } catch (err) {
      console.error("[webhook:POST] Error:", err)
    }

    return new Response("OK", { status: 200 })
  }

  return new Response("Method not allowed", { status: 405 })
})
