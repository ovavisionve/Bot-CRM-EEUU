// supabase/functions/webhook/index.ts
// Webhook multi-tenant — identifica el tenant por el Instagram User ID
// que aparece en recipient.id (o entry.id) de cada evento.

import { generarRespuesta } from "../_shared/respuestas.ts"
import { enviarMensajesMultiples, enviarImagen, enviarVideo } from "../_shared/instagram.ts"
import {
  obtenerOCrearLead,
  guardarMensaje,
  obtenerHistorial,
  actualizarLead,
} from "../_shared/db.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { extraerEstadoLead, computeStatus } from "../_shared/extractor.ts"
import { getTenantByInstagramId, getAgentConfig } from "../_shared/tenant.ts"
import { calculateScore } from "../_shared/scoring.ts"
import { fireWebhooks } from "../_shared/outgoing.ts"
import { sendPushToTenant } from "../_shared/push.ts"
import { processAttachments } from "../_shared/attachments.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ─── GET: Verificacion de Meta ───
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")

    const expected = Deno.env.get("META_VERIFY_TOKEN")

    if (!expected) {
      console.error("[webhook:GET] META_VERIFY_TOKEN no esta configurado")
      return new Response("Server misconfigured", { status: 500 })
    }

    if (mode === "subscribe" && token === expected && challenge) {
      console.log("[webhook:GET] Verificacion OK")
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
        const instagramUserId = String(entry.id)

        const tenant = await getTenantByInstagramId(instagramUserId)

        if (!tenant) {
          console.warn("[webhook:POST] Sin tenant para instagram_user_id:", instagramUserId)
          continue
        }

        if (!tenant.bot_active) {
          console.log("[webhook:POST] Bot desactivado para tenant:", tenant.slug)
          continue
        }

        if (!tenant.features?.instagram_bot) {
          console.log(`[webhook:POST][${tenant.slug}] instagram_bot feature OFF`)
          continue
        }

        const agentConfig = await getAgentConfig(tenant.id)

        const messagingEvents = entry.messaging || []
        const changesEvents = (entry.changes || [])
          .filter((c: any) => c.field === "messages" || c.field === "message_reactions")
          .map((c: any) => c.value)

        const eventos = [...messagingEvents, ...changesEvents]

        for (const event of eventos) {
          const senderId = event.sender?.id
          const mid = event.message?.mid || ""
          let mensaje = event.message?.text || ""
          let attachmentType: string | null = null
          let attachmentUrl: string | null = null

          const atts = event.message?.attachments || []
          if (atts.length > 0 && !mensaje) {
            try {
              const results = await processAttachments(atts, tenant.instagram_access_token, "Real estate conversation")
              if (results.length > 0) {
                mensaje = results.map((r: any) => r.text).join(" ")
                attachmentType = results[0].type
                attachmentUrl = results[0].originalUrl
              }
            } catch (err) { console.error("[webhook:POST] Attachment error:", err) }
          }

          if (!senderId || !mensaje) continue
          if (event.message?.is_echo) continue
          if (senderId === "12334") continue

          // DEDUP: verificar si ya procesamos este mid
          if (mid) {
            const { createClient: ccDedup } = await import("https://esm.sh/@supabase/supabase-js@2")
            const sbDedup = ccDedup(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
            const { data: existing } = await sbDedup
              .from("conversations")
              .select("id")
              .eq("meta_message_id", mid)
              .maybeSingle()
            if (existing) {
              console.log(`[webhook:POST] Mensaje duplicado (mid=${mid}), ignorando`)
              continue
            }
          }

          // DEBOUNCE: esperar 3 segundos para combinar mensajes rapidos
          await new Promise(resolve => setTimeout(resolve, 3000))

          const { createClient: ccBatch } = await import("https://esm.sh/@supabase/supabase-js@2")
          const sbBatch = ccBatch(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

          await sbBatch.from("conversations").insert({
            sender_id: senderId,
            lead_id: null,
            tenant_id: tenant.id,
            direction: "inbound",
            message_text: mensaje,
            channel: "instagram",
            sent_by: "lead",
            meta_message_id: mid || null,
          })

          const { data: recentMsgs } = await sbBatch
            .from("conversations")
            .select("message_text, created_at")
            .eq("sender_id", senderId)
            .eq("tenant_id", tenant.id)
            .eq("direction", "inbound")
            .gte("created_at", new Date(Date.now() - 8000).toISOString())
            .order("created_at", { ascending: true })

          const { data: recentOutbound } = await sbBatch
            .from("conversations")
            .select("created_at")
            .eq("sender_id", senderId)
            .eq("tenant_id", tenant.id)
            .eq("direction", "outbound")
            .gte("created_at", new Date(Date.now() - 8000).toISOString())
            .limit(1)

          if (recentOutbound && recentOutbound.length > 0) {
            console.log(`[webhook:POST] Ya hay respuesta reciente para ${senderId}, skippeando`)
            continue
          }

          if (recentMsgs && recentMsgs.length > 1) {
            mensaje = recentMsgs.map((m: any) => m.message_text).join(". ")
            console.log(`[webhook:POST][${tenant.slug}] Combinando ${recentMsgs.length} mensajes: ${mensaje.substring(0, 100)}`)
          }

          console.log(`[webhook:POST][${tenant.slug}] DM de ${senderId}: ${mensaje}`)

          // 1. Obtener o crear lead
          const lead = await obtenerOCrearLead(senderId, tenant.id)

          // Auto-asignar lead (round-robin)
          if (!lead.assigned_to && tenant.features?.auto_routing) {
            try {
              const { createClient: cc3 } = await import("https://esm.sh/@supabase/supabase-js@2")
              const sb3 = cc3(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
              const { data: agents } = await sb3.from("user_profiles")
                .select("id")
                .eq("tenant_id", tenant.id)
                .eq("active", true)
                .in("role", ["tenant_admin", "agent"])
              if (agents && agents.length > 0) {
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

          // Si el operador humano tomo control, no responder con IA
          if (lead.ai_active === false) {
            console.log(`[webhook:POST][${tenant.slug}] AI pausado para este lead`)
            await guardarMensaje(senderId, lead.id, tenant.id, mensaje, "inbound")
            continue
          }

          // Handoff to human
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
              await enviarMensajesMultiples(
                senderId,
                [
                  tenant.agent_language === "es"
                    ? "Ok, te conecto con " + tenant.agent_name + " ahora mismo."
                    : "Ok, let me connect you with " + tenant.agent_name + " right away.",
                ],
                tenant.instagram_access_token
              )
              if (tenant.features?.admin_email_notifications) {
                await notificarAdmin({
                  senderId,
                  leadName: lead.name || undefined,
                  mensaje: mensaje,
                  tipo: "handoff",
                  tenant,
                })
              }
              continue
            }
          }

          // 3. Historial
          const historial = await obtenerHistorial(senderId, tenant.id)

          // DETECCION DE LOOP
          const loopCheck = historial
            .filter((m: any) => m.direction === "outbound")
            .slice(-4)
            .map((m: any) => m.message_text.substring(0, 50).toLowerCase())
          if (loopCheck.length >= 3) {
            const last3 = loopCheck.slice(-3)
            const allSimilar = last3.every((t: string) =>
              last3[0].includes(t.substring(0, 20)) || t.includes(last3[0].substring(0, 20))
            )
            if (allSimilar) {
              console.warn(`[webhook:POST][${tenant.slug}] LOOP DETECTADO para ${senderId}, pausando bot`)
              await actualizarLead(senderId, tenant.id, { ai_active: false })
              const loopMsg = (lead.language === "es")
                ? `Disculpa la confusion. Te paso con ${tenant.agent_name} directamente. Escribeme al ${(tenant.agent_phone || "").replace(/[^0-9]/g, "")} por WhatsApp.`
                : `Sorry for the confusion. Let me connect you with ${tenant.agent_name} directly. Text me at ${(tenant.agent_phone || "").replace(/[^0-9]/g, "")} on WhatsApp.`
              await enviarMensajesMultiples(senderId, [loopMsg], tenant.instagram_access_token)
              await guardarMensaje(senderId, lead.id, tenant.id, loopMsg, "outbound", { sent_by: "system" })
              if (tenant.features?.admin_email_notifications) {
                await notificarAdmin({
                  senderId, leadName: lead.name || undefined,
                  mensaje: "LOOP detectado — bot pausado automaticamente",
                  tipo: "tour_agendado", tenant,
                })
              }
              continue
            }
          }

          // 4. Obtener nombres de propiedades para el extractor
          let propNames: string[] = []
          if (tenant.features?.ai_memory_extraction) {
            try {
              if (tenant.features?.google_sheets_properties && tenant.google_sheet_id) {
                const { obtenerPropiedades } = await import("../_shared/sheets.ts")
                const props = await obtenerPropiedades(tenant.google_sheet_id)
                propNames = props.map((p: any) => p.nombre).filter(Boolean)
              }
            } catch (_) {}
          }

          // 5. PARALELO: extraer estado + generar respuesta al mismo tiempo
          const extractPromise = tenant.features?.ai_memory_extraction
            ? extraerEstadoLead(historial, mensaje, lead, tenant, propNames)
            : Promise.resolve({})

          const leadParaGenerar = { ...lead }
          const generatePromise = tenant.features?.ai_responses
            ? generarRespuesta(mensaje, historial, leadParaGenerar, tenant, agentConfig)
            : Promise.resolve([] as string[])

          const [nuevoEstado, respuestas] = await Promise.all([extractPromise, generatePromise])

          // 6. Computar status en codigo (no del LLM)
          const leadMerged = { ...lead, ...nuevoEstado }
          const computedStatus = computeStatus(leadMerged)
          if (computedStatus !== lead.status) {
            nuevoEstado.status = computedStatus
          }

          // Guardar estado extraido + status computado
          if (Object.keys(nuevoEstado).length > 0) {
            await actualizarLead(senderId, tenant.id, nuevoEstado)
          }

          // 7. Enviar por Instagram
          await enviarMensajesMultiples(
            senderId,
            respuestas,
            tenant.instagram_access_token
          )

          // 7b. Fotos/video de la propiedad seleccionada
          const pideFotos = /foto|fotos|image|images|picture|pictures|muestrame|muéstrame|show me|envíame|enviame|enseñame|enséñame/.test(mensaje.toLowerCase())
          const pideVideo = /video|videos|tour virtual/.test(mensaje.toLowerCase())
          if ((pideFotos || pideVideo) && (leadMerged.selected_property_name || nuevoEstado.selected_property_name)) {
            try {
              let props: any[] = []
              if (tenant.features?.google_sheets_properties && tenant.google_sheet_id) {
                const { obtenerPropiedades: getProps } = await import("../_shared/sheets.ts")
                props = await getProps(tenant.google_sheet_id)
              }
              const propName = (nuevoEstado.selected_property_name || leadMerged.selected_property_name || "").toLowerCase()
              const elegida = props.find((p: any) => propName.includes(p.nombre.toLowerCase().split(" ")[0]))
              if (pideFotos && elegida?.foto_url) {
                await enviarImagen(senderId, elegida.foto_url, tenant.instagram_access_token)
                await guardarMensaje(senderId, lead.id, tenant.id, "[Foto enviada: " + elegida.nombre + "]", "outbound", { sent_by: "bot" })
              }
              if (pideVideo && elegida?.video_url) {
                await enviarVideo(senderId, elegida.video_url, tenant.instagram_access_token)
                await guardarMensaje(senderId, lead.id, tenant.id, "[Video enviado: " + elegida.nombre + "]", "outbound", { sent_by: "bot" })
              }
            } catch (err) {
              console.error("[webhook] Error enviando media:", err)
            }
          }

          // 8. Guardar respuestas outbound
          for (const resp of respuestas) {
            await guardarMensaje(senderId, lead.id, tenant.id, resp, "outbound")
          }

          // 9. Marcar ultimo contacto + score
          const extraUpdates: Record<string, unknown> = {
            last_ai_message_at: new Date().toISOString(),
            last_contacted_at: new Date().toISOString(),
          }
          if (tenant.features?.lead_scoring) {
            const msgCount = historial.length + 1
            const { score, factors } = calculateScore(leadMerged, msgCount)
            extraUpdates.score = score
            extraUpdates.score_factors = factors
          }
          await actualizarLead(senderId, tenant.id, extraUpdates)

          // 10. Si tour_confirmed -> crear registro en tours
          const acabaDeConfirmarTour = (
            (nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true) &&
            lead.status !== "tour_confirmed" &&
            !!leadMerged.tour_date
          )
          if (acabaDeConfirmarTour && tenant.features?.tour_calendar) {
            try {
              const { createClient: cc } = await import("https://esm.sh/@supabase/supabase-js@2")
              const sb = cc(
                Deno.env.get("SUPABASE_URL")!,
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
              )
              let scheduled = parseTourDate(leadMerged.tour_date)

              const { data: newTour } = await sb.from("tours").insert({
                tenant_id: tenant.id,
                lead_id: lead.id,
                scheduled_at: scheduled,
                status: "scheduled",
                notes: `Auto-creado por el bot. Propiedad: ${leadMerged.selected_property_name || "N/A"}. Fecha original: ${leadMerged.tour_date}`,
              }).select().single()
              console.log(`[webhook:POST][${tenant.slug}] Tour auto-creado para ${senderId}`)

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
                    title: `Tour: ${leadMerged.name || senderId}`,
                    description: `Tour agendado via OVA REAL\nLead: ${leadMerged.name || ""}\nIG: ${senderId}\nPropiedad: ${leadMerged.selected_property_name || ""}\nNotas: ${leadMerged.notes || ""}`,
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

          // Push notification
          sendPushToTenant(tenant.id, {
            title: "Nuevo DM de " + (leadMerged.name || senderId),
            body: mensaje.substring(0, 100),
            url: "/Bot-CRM-EEUU/dashboard.html?tenant=" + tenant.slug,
            tag: "dm-" + senderId,
          }).catch(() => {})

          // Outgoing webhooks
          const prevStatus = lead.status
          const newStatus = nuevoEstado.status || prevStatus
          fireWebhooks(tenant.id, "message.inbound", {
            sender_id: senderId, text: mensaje, lead_id: lead.id, lead_name: leadMerged.name,
          }).catch(() => {})
          const isNewLead = (new Date().getTime() - new Date(lead.created_at).getTime()) < 5000
          if (isNewLead) {
            fireWebhooks(tenant.id, "lead.created", { lead: leadMerged }).catch(() => {})
          }
          if (newStatus && newStatus !== prevStatus) {
            const statusEventMap: Record<string, string> = {
              qualified: "lead.qualified",
              disqualified: "lead.disqualified",
              tour_confirmed: "lead.tour_confirmed",
              closed_won: "lead.closed_won",
              closed_lost: "lead.closed_lost",
            }
            const evt = statusEventMap[newStatus]
            if (evt) fireWebhooks(tenant.id, evt as any, { lead: leadMerged }).catch(() => {})
          }

          // 11. Notificar admin SOLO para tour_agendado
          if (tenant.features?.admin_email_notifications) {
            const leadName = leadMerged.name || undefined
            const nowConfirmed = (
              nuevoEstado.status === "tour_confirmed" || nuevoEstado.tour_confirmed === true
            )
            const wasConfirmed = lead.status === "tour_confirmed" || lead.tour_confirmed === true

            if (nowConfirmed && !wasConfirmed) {
              await notificarAdmin({
                senderId,
                leadName,
                mensaje: `Tour agendado ${leadMerged.tour_date || ""} en ${leadMerged.selected_property_name || ""}`,
                tipo: "tour_agendado",
                tenant,
              })
            } else {
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

function parseTourDate(text: string | null): string {
  if (!text) return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const direct = Date.parse(text)
  if (!isNaN(direct)) return new Date(direct).toISOString()

  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const now = new Date()

  const dayMap: Record<string, number> = {
    domingo: 0, sunday: 0, dom: 0, sun: 0,
    lunes: 1, monday: 1, lun: 1, mon: 1,
    martes: 2, tuesday: 2, mar: 2, tue: 2,
    miercoles: 3, wednesday: 3, mie: 3, wed: 3,
    jueves: 4, thursday: 4, jue: 4, thu: 4,
    viernes: 5, friday: 5, vie: 5, fri: 5,
    sabado: 6, saturday: 6, sab: 6, sat: 6,
  }

  let targetDay: number | null = null
  for (const [word, num] of Object.entries(dayMap)) {
    if (lower.includes(word)) { targetDay = num; break }
  }

  if (lower.includes("hoy") || lower.includes("today")) {
    targetDay = now.getDay()
  } else if (lower.includes("manana") || lower.includes("tomorrow")) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    targetDay = tomorrow.getDay()
  }

  let date = new Date(now)
  if (targetDay !== null) {
    const currentDay = now.getDay()
    let daysAhead = targetDay - currentDay
    if (daysAhead <= 0) daysAhead += 7
    date.setDate(now.getDate() + daysAhead)
  } else {
    date.setDate(now.getDate() + 3)
  }

  const month = date.getMonth()
  const tzOffset = (month >= 2 && month <= 10) ? 4 : 5

  const hourMatch = lower.match(/(\d{1,2})\s*(pm|am|p\.m\.|a\.m\.)?/)
  if (hourMatch) {
    let hour = parseInt(hourMatch[1])
    const isPM = hourMatch[2]?.startsWith("p")
    if (isPM && hour < 12) hour += 12
    if (!hourMatch[2] && hour < 8) hour += 12
    date.setUTCHours(hour + tzOffset, 0, 0, 0)
  } else {
    date.setUTCHours(14 + tzOffset, 0, 0, 0)
  }

  return date.toISOString()
}
