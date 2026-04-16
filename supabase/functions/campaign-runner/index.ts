// Campaign runner — procesa enrollments y dispara nuevos triggers
// Se llama cada hora vía pg_cron (ver migración)
//
// 1. Enrolla leads nuevos en campañas new_lead
// 2. Enrolla en tour_reminder 24h antes del tour
// 3. Enrolla en post_tour 24h después del tour
// 4. Procesa enrollments activos: si next_step_at <= now, ejecuta el step

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enviarMensaje } from "../_shared/instagram.ts"
import { enviarSMS } from "../_shared/twilio.ts"
import { listActiveTenants } from "../_shared/tenant.ts"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async () => {
  const tenants = await listActiveTenants()
  let enrolled = 0
  let executed = 0

  for (const tenant of tenants) {
    if (!tenant.features?.drip_campaigns) continue

    const supabase = getClient()
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("active", true)

    if (!campaigns || campaigns.length === 0) continue

    // Enrollar leads en triggers que corresponden
    for (const camp of campaigns) {
      const n = await enrollLeadsForTrigger(tenant, camp)
      enrolled += n
    }

    // Ejecutar enrollments pendientes
    const e = await executePendingSteps(tenant)
    executed += e
  }

  return new Response(
    JSON.stringify({ ok: true, tenants: tenants.length, enrolled, executed }),
    { headers: { "Content-Type": "application/json" } }
  )
})

async function enrollLeadsForTrigger(tenant: any, campaign: any): Promise<number> {
  const supabase = getClient()
  const now = new Date()
  let count = 0

  // Solo enrollar leads que NO estén ya enrollados en esta campaign
  const { data: existing } = await supabase
    .from("campaign_enrollments")
    .select("lead_id")
    .eq("campaign_id", campaign.id)
  const already = new Set((existing || []).map((e: any) => e.lead_id))

  let query = supabase.from("leads").select("*").eq("tenant_id", tenant.id)

  if (campaign.trigger === "new_lead") {
    // Leads creados en última hora
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    query = query.gte("created_at", oneHourAgo)
  } else if (campaign.trigger === "tour_reminder") {
    // Leads con tour en las próximas 24-25 horas y status scheduled/confirmed
    const { data: tours } = await supabase
      .from("tours")
      .select("lead_id, scheduled_at, status")
      .eq("tenant_id", tenant.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", new Date(now.getTime() + 23 * 60 * 60 * 1000).toISOString())
      .lte("scheduled_at", new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString())
    for (const t of tours || []) {
      if (already.has(t.lead_id)) continue
      await enrollLead(tenant.id, campaign.id, t.lead_id, now)
      count++
    }
    return count
  } else if (campaign.trigger === "post_tour") {
    // Tours completados hace 20-28 horas
    const { data: tours } = await supabase
      .from("tours")
      .select("lead_id, scheduled_at")
      .eq("tenant_id", tenant.id)
      .lte("scheduled_at", new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString())
      .gte("scheduled_at", new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString())
    for (const t of tours || []) {
      if (already.has(t.lead_id)) continue
      await enrollLead(tenant.id, campaign.id, t.lead_id, now)
      count++
    }
    return count
  } else if (campaign.trigger === "budget_objection") {
    // Leads con notes.budget_objection = true o detectado en conversación (por ahora manual)
    // Se enrollan manualmente desde el CRM
    return 0
  } else if (campaign.trigger === "no_response_24h") {
    // Los cubre followup-cron actualmente, skippear
    return 0
  }

  const { data: leads } = await query
  for (const l of leads || []) {
    if (already.has(l.id)) continue
    await enrollLead(tenant.id, campaign.id, l.id, now)
    count++
  }
  return count
}

async function enrollLead(tenantId: string, campaignId: string, leadId: number, now: Date) {
  const supabase = getClient()
  await supabase.from("campaign_enrollments").insert({
    tenant_id: tenantId,
    campaign_id: campaignId,
    lead_id: leadId,
    current_step: 0,
    status: "active",
    next_step_at: now.toISOString(),
  })
}

async function executePendingSteps(tenant: any): Promise<number> {
  const supabase = getClient()
  const now = new Date()

  const { data: enrollments } = await supabase
    .from("campaign_enrollments")
    .select("*, campaigns(steps, trigger), leads(sender_id, name, tour_date, selected_property_name, language, phone)")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .lte("next_step_at", now.toISOString())

  let count = 0
  for (const e of enrollments || []) {
    const steps = e.campaigns?.steps || []
    if (e.current_step >= steps.length) {
      await supabase
        .from("campaign_enrollments")
        .update({ status: "completed", completed_at: now.toISOString() })
        .eq("id", e.id)
      continue
    }
    const step = steps[e.current_step]
    const lead = e.leads
    if (!lead) continue

    // Reemplazar placeholders
    const msg = (step.message || "")
      .replace(/\{name\}/g, (lead.name || "").split(" ")[0] || "")
      .replace(/\{tour_date\}/g, lead.tour_date || "")
      .replace(/\{property\}/g, lead.selected_property_name || "")
      .replace(/\{property_address\}/g, lead.selected_property_name || "")

    const channel = step.channel || "instagram"
    let sent = false

    if (channel === "instagram") {
      await enviarMensaje(lead.sender_id, msg, tenant.instagram_access_token)
      sent = true
    } else if (channel === "sms" && tenant.features?.sms_bot) {
      if (lead.phone) {
        const r = await enviarSMS(
          lead.phone, msg,
          tenant.twilio_account_sid, tenant.twilio_auth_token, tenant.twilio_phone_number,
        )
        sent = r.ok
      }
    }

    if (sent) {
      await supabase.from("conversations").insert({
        sender_id: lead.sender_id,
        lead_id: e.lead_id,
        tenant_id: tenant.id,
        direction: "outbound",
        message_text: msg,
        channel,
        sent_by: "campaign",
      })
      count++
    }

    // Avanzar al siguiente step
    const nextStep = e.current_step + 1
    const nextAt = steps[nextStep]
      ? new Date(now.getTime() + (steps[nextStep].delay_hours || 0) * 60 * 60 * 1000).toISOString()
      : null
    const newStatus = nextStep >= steps.length ? "completed" : "active"
    await supabase
      .from("campaign_enrollments")
      .update({
        current_step: nextStep,
        next_step_at: nextAt,
        status: newStatus,
        completed_at: newStatus === "completed" ? now.toISOString() : null,
      })
      .eq("id", e.id)
  }
  return count
}
