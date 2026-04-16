// Supabase client multi-tenant para leads y conversaciones.
// Todas las queries filtran por tenant_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

// Buscar o crear un lead por sender_id y tenant_id
export async function obtenerOCrearLead(senderId: string, tenantId: string) {
  const supabase = getClient()

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("sender_id", senderId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (lead) return lead

  const { data: nuevo, error } = await supabase
    .from("leads")
    .insert({
      sender_id: senderId,
      tenant_id: tenantId,
      instagram_id: senderId,
      source: "instagram",
    })
    .select()
    .single()

  if (error) {
    console.error("[db] Error creando lead:", error)
    throw error
  }

  return nuevo
}

// Guardar un mensaje (inbound o outbound)
export async function guardarMensaje(
  senderId: string,
  leadId: number,
  tenantId: string,
  texto: string,
  direction: "inbound" | "outbound",
  metadata: { sent_by?: string; channel?: string; ai_intent?: string } = {}
) {
  const supabase = getClient()

  const { error } = await supabase
    .from("conversations")
    .insert({
      sender_id: senderId,
      lead_id: leadId,
      tenant_id: tenantId,
      message_text: texto,
      direction,
      channel: metadata.channel || "instagram",
      sent_by: metadata.sent_by || (direction === "outbound" ? "bot" : "lead"),
      ai_intent: metadata.ai_intent,
    })

  if (error) console.error("[db] Error guardando mensaje:", error)
}

// Obtener historial de conversación para dar contexto a Claude
export async function obtenerHistorial(
  senderId: string,
  tenantId: string,
  limite = 20
) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from("conversations")
    .select("direction, message_text, created_at")
    .eq("sender_id", senderId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(limite)

  if (error) {
    console.error("[db] Error obteniendo historial:", error)
    return []
  }

  return data || []
}

// Actualizar campos del lead (nombre, status, etc.)
export async function actualizarLead(
  senderId: string,
  tenantId: string,
  campos: Record<string, unknown>
) {
  const supabase = getClient()

  const { error } = await supabase
    .from("leads")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("sender_id", senderId)
    .eq("tenant_id", tenantId)

  if (error) console.error("[db] Error actualizando lead:", error)
}
