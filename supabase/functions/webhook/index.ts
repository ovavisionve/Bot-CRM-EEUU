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
import { calculateScore } from "../_shared/scoring.ts"

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

        // Feature gating: el bot de Instagram tiene que estar habilitado
        if (!tenant.features?.instagram_bot) {
          console.log(`[webhook:POST][${tenant.slug}] instagram_bot feature OFF`)
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

          // Auto-asignar lead nuevo a un agente (round-robin) si el tenant
          // tiene la feature auto_routing activa y el lead no esta asignado.
          if (!lead.assigned_to && tenant.features?.auto_routing) {
            try {
              const { createClient: cc3 } = await import("https://esm.sh/@supabase/supabase-js@2")
              const sb3 = cc3(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
              )
              const { data: agents } = await sb3.from("user_profiles")
                .select("id")
                .eq("tenant_id", tenant.id)
                .eq("active", true)
                .in("role", ["tenant_admin", "agent"])
              if (agents && agents.length > 0) {
                // Elegir el agente con menos leads asignados (balanceado)
                let min = Infinity
                let chosen: string | null = null
                for (const a of agents) {
                  const { count } = await sb3.from("leads")
                    .select("*", { count: "exact", head: true })
                    .eq("tenant_id", tenant.id)
                    .eq("assigned_to", a.id)
                  const c = count || 0
                  if (c < min) { min = c; chosen = a.id }
                }
                if (chosen) {
                  await sb3.from("leads").update({ assigned_to: chosen })
                    .eq("sender_id", senderId).eq("tenant_id", tenant.id)
                  lead.assigned_to = chosen
                }
              }
            } catch (err) {
              console.error("[webhook] auto-assign failed:", err)
            }
          }

          // Si el operador humano tomó control, no responder con IA
          if (lead.ai_active === false) {
            console.log(`[webhook:POST][${tenant.slug}] AI pausado para este lead`)
            await guardarMensaje(senderId, lead.id, tenant.id, mensaje, "inbound")
            continue
          }

          // 2. Guardar mensaje inbound
          await guardarMensaje(senderId, lead.id, tenant.id, mensaje, "inbound")

          // Feature gating: handoff_to_human
          // Si está activado y el lead usa alguna handoff keyword,
          // pausar el bot y notificar al admin para que tome el control.
          if (tenant.features?.handoff_to_human) {
            const keywords = agentConfig?.handoff_keywords || [
              "hablar con persona", "hablar con alguien", "speak to agent",
              "real person", "humano", "human", "talk to a person",
            ]
            const mensajeLower = mensaje.toLowerCase()
            const pide = keywords.some((k) => mensajeLower.includes(k.toLowerCase()))
            if (pide) {
              console.log(`[webhook:POST][${tenant.slug}] Handoff solicitado por ${senderId}`)
              await actualizarLead(senderId, tenant.id, { ai_active: false, status: "contacted" })

              // Mandar un mensaje cordial al lead
              await enviarMensajesMultiples(
                senderId,
                [
                  tenant.agent_language === "es"
                    ? "Ok, te conecto con " + tenant.agent_name + " ahora mismo."
                    : "Ok, let me connect you with " + tenant.agent_name + " right away.",
                ],
                tenant.instagram_access_token
              )
              // Notificar al admin si la feature está activa
              if (tenant.features?.admin_email_notifications) {
                await notificarAdmin({
                  senderId,
                  leadName: lead.name || undefined,
                  mensaje: mensaje,
                  tipo: "handoff",
                  tenant,
                })
              }
              continue // no seguir con el flujo IA
            }
          }

          // 3. Historial
          const historial = await obtenerHistorial(senderId, tenant.id)

          // 4. Extraer estado estructurado (sólo si el feature está activo)
          let nuevoEstado: Record<string, any> = {}
          if (tenant.features?.ai_memory_extraction) {
            nuevoEstado = await extraerEstadoLead(historial, mensaje, lead, tenant)
            if (Object.keys(nuevoEstado).length > 0) {
              await actualizarLead(senderId, tenant.id, nuevoEstado)
            }
          }

          // 5. Generar respuesta IA (sólo si el feature está activo)
          const leadActualizado = { ...lead, ...nuevoEstado }
          let respuestas: string[] = []
          if (tenant.features?.ai_responses) {
            respuestas = await generarRespuesta(
              mensaje,
              historial,
              leadActualizado,
              tenant,
              agentConfig
            )
          } else {
            console.log(`[webhook:POST][${tenant.slug}] ai_responses feature OFF - no respondo`)
          }

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

          // 8. Marcar último contacto del bot con el lead + calcular score si está activo
          const extraUpdates: Record<string, unknown> = {
            last_ai_message_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
          }
          if (tenant.features?.lead_scoring) {
            const msgCount = historial.length + 1
            const { score, factors } = calculateScore(leadActualizado, msgCount)
            extraUpdates.score = score
            extraUpdates.score_factors = factors
          }
          await actualizarLead(senderId, tenant.id, extraUpdates)

          // 9. Si tour_calendar está ON y se confirmó tour -> crear registro en tours
          const acabaDeConfirmarTour = (
            (nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true) &&
            lead.status !== "tour_confirmed" &&
            !!leadActualizado.tour_date
          )
          if (acabaDeConfirmarTour && tenant.features?.tour_calendar) {
            try {
              const { createClient: cc } = await import("https://esm.sh/@supabase/supabase-js@2")
              const sb = cc(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
              )
              // Parsear la fecha del tour (texto libre) - si falla, usar fecha actual + 3 días
              let scheduled = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
              const parsed = Date.parse(leadActualizado.tour_date)
              if (!isNaN(parsed)) scheduled = new Date(parsed).toISOString()

              const { data: newTour } = await sb.from("tours").insert({
                tenant_id: tenant.id,
                lead_id: lead.id,
                scheduled_at: scheduled,
                status: "scheduled",
                notes: `Auto-creado por el bot. Propiedad: ${leadActualizado.selected_property_name || "N/A"}. Fecha original: ${leadActualizado.tour_date}`,
              }).select().single()
              console.log(`[webhook:POST][${tenant.slug}] Tour auto-creado para ${senderId}`)

              // Sync con Google Calendar si está configurado
              const calWebhook = Deno.env.get("CALENDAR_WEBHOOK_URL")
              if (newTour && calWebhook) {
                fetch(calWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    token: "ova_calendar_secret_2026",
                    action: "upsert",
                    tour_id: newTour.id,
                    calendar_email: tenant.agent_email,
                    title: `Tour: ${leadActualizado.name || senderId}`,
                    description: `Tour agendado vía OVA REAL\nLead: ${leadActualizado.name || ""}\nIG: ${senderId}\nPropiedad: ${leadActualizado.selected_property_name || ""}\nNotas: ${leadActualizado.notes || ""}`,
                    start: scheduled,
                    duration_minutes: 30,
                    status: "scheduled",
                  }),
                }).catch((e) => console.error("[calendar] sync failed:", e))
              }
            } catch (err) {
              console.error("[webhook:POST] Error creando tour:", err)
            }
          }

          // 10. Notificar al admin SOLO para tour_agendado (evita spam de emails)
          if (tenant.features?.admin_email_notifications) {
            const leadName = leadActualizado.name || undefined

            // Solo notificar si es un cambio GENUINO: el lead no estaba ya en tour_confirmed
            const nowConfirmed = (
              nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true
            )
            const wasConfirmed = lead.status === "tour_confirmed" || lead.tour_confirmed === true

            if (nowConfirmed && !wasConfirmed) {
              await notificarAdmin({
                senderId,
                leadName,
                mensaje: `Tour agendado ${leadActualizado.tour_date || ""} en ${leadActualizado.selected_property_name || ""}`,
                tipo: "tour_agendado",
                tenant,
              })
            } else {
              // Loguear todos los otros eventos pero sin mandar email
              await notificarAdmin({ senderId, mensaje, tenant })
            }
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
