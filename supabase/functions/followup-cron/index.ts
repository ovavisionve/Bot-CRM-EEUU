// Cron job: revisa leads sin respuesta y les manda follow-ups automáticos
// Secuencia: 24h → recordatorio, 48h → reagendar, 72h → checkin casual

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { enviarMensaje } from "../_shared/instagram.ts"
import { notificarAdmin } from "../_shared/notificar.ts"

const ESTADOS_ACTIVOS_PARA_FOLLOWUP = [
  "new", "contacted", "qualified", "touring",
]

interface Lead {
  id: number
  sender_id: string
  name: string | null
  language: string | null
  status: string | null
  followup_count: number | null
  tour_date: string | null
  selected_property_name: string | null
  last_contacted_at: string | null
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  console.log("[followup-cron] Iniciando revisión de leads")

  // Obtener leads activos
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .in("status", ESTADOS_ACTIVOS_PARA_FOLLOWUP)

  if (error) {
    console.error("[followup-cron] Error obteniendo leads:", error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 })
  }

  console.log(`[followup-cron] Revisando ${leads?.length || 0} leads activos`)

  let procesados = 0
  let enviados = 0

  for (const lead of (leads || []) as Lead[]) {
    procesados++
    const resultado = await procesarLead(supabase, lead)
    if (resultado) enviados++
  }

  console.log(`[followup-cron] Procesados: ${procesados}, mensajes enviados: ${enviados}`)

  return new Response(
    JSON.stringify({ ok: true, procesados, enviados }),
    { headers: { "Content-Type": "application/json" } }
  )
})

async function procesarLead(supabase: any, lead: Lead): Promise<boolean> {
  // Último mensaje outbound del bot
  const { data: lastOut } = await supabase
    .from("conversations")
    .select("created_at")
    .eq("sender_id", lead.sender_id)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastOut) return false

  // Último mensaje inbound del lead
  const { data: lastIn } = await supabase
    .from("conversations")
    .select("created_at")
    .eq("sender_id", lead.sender_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Si el lead respondió después de nuestro último mensaje, no hay que hacer follow-up
  if (lastIn && new Date(lastIn.created_at) > new Date(lastOut.created_at)) {
    return false
  }

  const horas = (Date.now() - new Date(lastOut.created_at).getTime()) / (1000 * 60 * 60)
  const count = lead.followup_count || 0
  const esES = lead.language === "es"
  const nombre = lead.name ? lead.name.split(" ")[0] : ""

  let mensaje: string | null = null

  // 24h sin respuesta — primer follow-up
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
  }
  // 48h — ofrecer reagendar
  else if (horas >= 48 && horas < 72 && count === 1) {
    if (lead.tour_date) {
      mensaje = esES
        ? `Hola ${nombre}, prefieres mover la cita o está bien para ${lead.tour_date}?`
        : `Hi ${nombre}, want to reschedule or still good for ${lead.tour_date}?`
    } else {
      mensaje = esES
        ? `${nombre}, todo bien? Quedamos o prefieres ver en otro momento?`
        : `${nombre}, everything ok? Want to schedule a visit or see later?`
    }
  }
  // 72h — checkin casual
  else if (horas >= 72 && count === 2) {
    mensaje = esES
      ? `${nombre}, pasó algo? Todo bien?`
      : `${nombre}, everything ok?`
  }

  if (!mensaje) return false

  console.log(`[followup-cron] Enviando follow-up #${count + 1} a ${lead.sender_id}: ${mensaje}`)

  await enviarMensaje(lead.sender_id, mensaje)

  // Guardar en conversations
  await supabase.from("conversations").insert({
    sender_id: lead.sender_id,
    lead_id: lead.id,
    direction: "outbound",
    message_text: mensaje,
  })

  // Actualizar lead
  await supabase
    .from("leads")
    .update({
      followup_count: count + 1,
      last_contacted_at: new Date().toISOString(),
    })
    .eq("sender_id", lead.sender_id)

  // Notificar al admin si ya es el tercer follow-up (lead frío)
  if (count + 1 >= 3) {
    await notificarAdmin({
      senderId: lead.sender_id,
      leadName: lead.name || undefined,
      mensaje: `Lead frío — ${count + 1} follow-ups sin respuesta`,
      tipo: "handoff",
    })
  }

  return true
}
