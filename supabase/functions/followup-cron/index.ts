// Cron multi-tenant: revisa leads de cada tenant activo y envía follow-ups
// Secuencia: 24h → recordatorio, 48h → reagendar, 72h → checkin casual

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enviarMensaje } from "../_shared/instagram.ts"
import { notificarAdmin } from "../_shared/notificar.ts"
import { listActiveTenants } from "../_shared/tenant.ts"

const ESTADOS_ACTIVOS = ["new", "contacted", "qualified", "touring"]

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async () => {
  console.log("[followup-cron] Iniciando")

  const tenants = await listActiveTenants()
  console.log(`[followup-cron] Tenants activos: ${tenants.length}`)

  let totalProcesados = 0
  let totalEnviados = 0

  for (const tenant of tenants) {
    const { procesados, enviados } = await procesarTenant(tenant)
    totalProcesados += procesados
    totalEnviados += enviados
    console.log(`[followup-cron][${tenant.slug}] procesados=${procesados} enviados=${enviados}`)
  }

  return new Response(
    JSON.stringify({ ok: true, tenants: tenants.length, totalProcesados, totalEnviados }),
    { headers: { "Content-Type": "application/json" } }
  )
})

async function procesarTenant(tenant: any) {
  const supabase = getClient()

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenant.id)
    .in("status", ESTADOS_ACTIVOS)

  let procesados = 0
  let enviados = 0

  for (const lead of leads || []) {
    procesados++
    const enviado = await procesarLead(tenant, lead)
    if (enviado) enviados++
  }

  return { procesados, enviados }
}

async function procesarLead(tenant: any, lead: any): Promise<boolean> {
  const supabase = getClient()

  // Último outbound
  const { data: lastOut } = await supabase
    .from("conversations")
    .select("created_at")
    .eq("sender_id", lead.sender_id)
    .eq("tenant_id", tenant.id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastOut) return false

  // Último inbound
  const { data: lastIn } = await supabase
    .from("conversations")
    .select("created_at")
    .eq("sender_id", lead.sender_id)
    .eq("tenant_id", tenant.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Si el lead ya respondió, no hay que hacer follow-up
  if (lastIn && new Date(lastIn.created_at) > new Date(lastOut.created_at)) {
    return false
  }

  const horas = (Date.now() - new Date(lastOut.created_at).getTime()) / (1000 * 60 * 60)
  const count = lead.followup_count || 0
  const esES = lead.language === "es"
  const nombre = lead.name ? lead.name.split(" ")[0] : ""

  let mensaje: string | null = null

  if (horas >= 24 && horas < 48 && count === 0) {
    if (lead.tour_date && lead.status === "touring") {
      mensaje = esES
        ? `${nombre}, quedo pendiente de la confirmación para ${lead.tour_date}`
        : `${nombre}, just confirming our appointment ${lead.tour_date}?`
    } else {
      mensaje = esES
        ? `Hola ${nombre}, aún estás interesado en el apartamento?`
        : `Hi ${nombre}, still interested in the apartment?`
    }
  } else if (horas >= 48 && horas < 72 && count === 1) {
    if (lead.tour_date) {
      mensaje = esES
        ? `Hola ${nombre}, prefieres mover la cita o está bien para ${lead.tour_date}?`
        : `Hi ${nombre}, want to reschedule or still good for ${lead.tour_date}?`
    } else {
      mensaje = esES
        ? `${nombre}, todo bien? Quedamos o prefieres ver en otro momento?`
        : `${nombre}, everything ok? Want to schedule a visit?`
    }
  } else if (horas >= 72 && count === 2) {
    mensaje = esES ? `${nombre}, pasó algo? Todo bien?` : `${nombre}, everything ok?`
  }

  if (!mensaje) return false

  console.log(`[followup-cron][${tenant.slug}] Follow-up #${count + 1} -> ${lead.sender_id}`)

  await enviarMensaje(lead.sender_id, mensaje, tenant.instagram_access_token)

  await supabase.from("conversations").insert({
    sender_id: lead.sender_id,
    lead_id: lead.id,
    tenant_id: tenant.id,
    direction: "outbound",
    message_text: mensaje,
    sent_by: "bot",
    channel: "instagram",
  })

  await supabase
    .from("leads")
    .update({
      followup_count: count + 1,
      last_contacted_at: new Date().toISOString(),
      last_ai_message_at: new Date().toISOString(),
    })
    .eq("sender_id", lead.sender_id)
    .eq("tenant_id", tenant.id)

  // Lead frío después de 3 follow-ups → notificar al admin
  if (count + 1 >= 3) {
    await notificarAdmin({
      senderId: lead.sender_id,
      leadName: lead.name,
      mensaje: `Lead frío — ${count + 1} follow-ups sin respuesta`,
      tipo: "handoff",
      tenant,
    })
  }

  return true
}
