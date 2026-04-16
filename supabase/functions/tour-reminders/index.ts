// Tour reminders — corre cada 30 min vía pg_cron.
// 1. 24h antes: pinga al lead (si tour está "scheduled" sin confirmar)
// 2. 1h antes: avisa al agente humano por email + opcionalmente al lead
// 3. Después del tour (4h después): marca como overdue si no se actualizó

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enviarMensaje } from "../_shared/instagram.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { listActiveTenants } from "../_shared/tenant.ts"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async () => {
  const tenants = await listActiveTenants()
  let remindersLeadEnviados = 0
  let avisosAgente = 0
  let overdues = 0

  for (const tenant of tenants) {
    if (!tenant.features?.tour_calendar) continue

    const { lead, agente, overdue } = await procesarTenant(tenant)
    remindersLeadEnviados += lead
    avisosAgente += agente
    overdues += overdue
  }

  return new Response(
    JSON.stringify({ ok: true, tenants: tenants.length, remindersLeadEnviados, avisosAgente, overdues }),
    { headers: { "Content-Type": "application/json" } }
  )
})

async function procesarTenant(tenant: any) {
  const supabase = getClient()
  const now = Date.now()

  let lead = 0
  let agente = 0
  let overdue = 0

  // Tours del tenant en estados activos
  const { data: tours } = await supabase
    .from("tours")
    .select("*, leads(sender_id, name, language)")
    .eq("tenant_id", tenant.id)
    .in("status", ["scheduled", "confirmed"])

  for (const t of tours || []) {
    const sched = new Date(t.scheduled_at).getTime()
    const horas = (sched - now) / (1000 * 60 * 60)
    const lang = t.leads?.language || tenant.agent_language || "en"
    const nombre = (t.leads?.name || "").split(" ")[0] || ""

    // 24h antes -> reminder al lead (solo una vez)
    if (horas > 23 && horas < 24.5 && !t.reminder_sent && t.leads?.sender_id) {
      const msg = lang === "es"
        ? `Hola ${nombre}, ¿confirmas nuestra cita de mañana para ver el apartamento?`
        : `Hi ${nombre}, just confirming our appointment tomorrow to see the apartment?`
      await enviarMensaje(t.leads.sender_id, msg, tenant.instagram_access_token)
      await supabase.from("conversations").insert({
        sender_id: t.leads.sender_id, lead_id: t.lead_id, tenant_id: tenant.id,
        direction: "outbound", message_text: msg,
        sent_by: "tour_reminder", channel: "instagram",
      })
      await supabase.from("tours").update({ reminder_sent: true }).eq("id", t.id)
      lead++
    }

    // 1h antes -> aviso al agente humano + recordatorio al lead (solo una vez)
    if (horas > 0.5 && horas < 1.5 && !t.confirmation_sent) {
      // Mensaje al lead
      if (t.leads?.sender_id) {
        const msg = lang === "es"
          ? `${nombre}, te espero en 1 hora! Recuerda la dirección que te pasé.`
          : `${nombre}, see you in 1 hour! Remember the address I sent you.`
        await enviarMensaje(t.leads.sender_id, msg, tenant.instagram_access_token)
        await supabase.from("conversations").insert({
          sender_id: t.leads.sender_id, lead_id: t.lead_id, tenant_id: tenant.id,
          direction: "outbound", message_text: msg,
          sent_by: "tour_reminder", channel: "instagram",
        })
      }
      // Email al agente
      if (tenant.features?.admin_email_notifications) {
        await notificarAdmin({
          senderId: t.leads?.sender_id || "",
          leadName: t.leads?.name || undefined,
          mensaje: `Tour en 1 hora: ${new Date(t.scheduled_at).toLocaleString()} con ${t.leads?.name || "lead"}`,
          tipo: "tour_agendado",
          tenant,
        })
      }
      await supabase.from("tours").update({ confirmation_sent: true }).eq("id", t.id)
      agente++
    }

    // 4h después del tour sin actualizar -> marcar overdue (no_show por defecto)
    if (horas < -4 && t.status === "scheduled") {
      await supabase.from("tours").update({ status: "no_show", updated_at: new Date().toISOString() }).eq("id", t.id)
      // Notificar al admin para que confirme el outcome
      if (tenant.features?.admin_email_notifications) {
        await notificarAdmin({
          senderId: t.leads?.sender_id || "",
          leadName: t.leads?.name || undefined,
          mensaje: `Tour vencido sin confirmar - marcado como no_show. Revisa y actualiza el outcome.`,
          tipo: "tour_agendado",
          tenant,
        })
      }
      overdue++
    }
  }

  return { lead, agente, overdue }
}
