// Webhook para SMS entrantes vía Twilio
// Twilio hace POST con application/x-www-form-urlencoded
// Campos: From (número del lead), To (número del tenant), Body (texto)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { generarRespuesta } from "../_shared/respuestas.ts"
import { enviarSMS } from "../_shared/twilio.ts"
import { obtenerOCrearLead, guardarMensaje, obtenerHistorial, actualizarLead } from "../_shared/db.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { extraerEstadoLead } from "../_shared/extractor.ts"
import { getAgentConfig } from "../_shared/tenant.ts"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })

  try {
    const formText = await req.text()
    const params = new URLSearchParams(formText)
    const from = params.get("From") || ""
    const to = params.get("To") || ""
    const body = params.get("Body") || ""

    console.log(`[sms-webhook] From=${from} To=${to} Body=${body}`)

    if (!from || !to || !body) {
      return new Response("<Response></Response>", {
        status: 200, headers: { "Content-Type": "text/xml" }
      })
    }

    // Identificar al tenant por twilio_phone_number (el To del SMS)
    const supabase = getClient()
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("twilio_phone_number", to)
      .eq("status", "active")
      .maybeSingle()

    if (!tenant || !tenant.features?.sms_bot) {
      console.log(`[sms-webhook] Sin tenant o sms_bot OFF para ${to}`)
      return new Response("<Response></Response>", {
        status: 200, headers: { "Content-Type": "text/xml" }
      })
    }

    if (!tenant.bot_active) {
      return new Response("<Response></Response>", {
        status: 200, headers: { "Content-Type": "text/xml" }
      })
    }

    const agentConfig = await getAgentConfig(tenant.id)

    // Usamos el número del lead como sender_id para tracking
    const senderId = from
    const lead = await obtenerOCrearLead(senderId, tenant.id)

    // Actualizar phone del lead
    if (!lead.phone) {
      await actualizarLead(senderId, tenant.id, { phone: from, source: "sms" })
    }

    await guardarMensaje(senderId, lead.id, tenant.id, body, "inbound", { channel: "sms" })

    if (lead.ai_active === false) {
      return new Response("<Response></Response>", {
        status: 200, headers: { "Content-Type": "text/xml" }
      })
    }

    const historial = await obtenerHistorial(senderId, tenant.id)
    const nuevoEstado = tenant.features?.ai_memory_extraction
      ? await extraerEstadoLead(historial, body, lead, tenant)
      : {}
    if (Object.keys(nuevoEstado).length > 0) {
      await actualizarLead(senderId, tenant.id, nuevoEstado)
    }
    const leadActualizado = { ...lead, ...nuevoEstado }

    if (!tenant.features?.ai_responses) {
      return new Response("<Response></Response>", {
        status: 200, headers: { "Content-Type": "text/xml" }
      })
    }

    const respuestas = await generarRespuesta(body, historial, leadActualizado, tenant, agentConfig)

    // Juntar múltiples respuestas cortas en un SMS (SMS no soporta bien los mensajes separados)
    const textoFinal = respuestas.join(" ")

    const r = await enviarSMS(
      from, textoFinal,
      tenant.twilio_account_sid, tenant.twilio_auth_token, tenant.twilio_phone_number,
    )

    if (r.ok) {
      await guardarMensaje(senderId, lead.id, tenant.id, textoFinal, "outbound", { channel: "sms" })
    }

    await notificarAdmin({ senderId, mensaje: body, tenant, leadName: leadActualizado.name })

    // Respuesta TwiML vacía (ya mandamos SMS via API)
    return new Response("<Response></Response>", {
      status: 200, headers: { "Content-Type": "text/xml" }
    })
  } catch (err) {
    console.error("[sms-webhook] Error:", err)
    return new Response("<Response></Response>", {
      status: 200, headers: { "Content-Type": "text/xml" }
    })
  }
})
