// Supabase client para leads y conversaciones
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

// Buscar o crear un lead por sender_id
export async function obtenerOCrearLead(senderId: string) {
  const supabase = getClient()

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("sender_id", senderId)
    .single()

  if (lead) return lead

  const { data: nuevo, error } = await supabase
    .from("leads")
    .insert({ sender_id: senderId })
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
  texto: string,
  direction: "inbound" | "outbound"
) {
  const supabase = getClient()

  const { error } = await supabase
    .from("conversations")
    .insert({
      sender_id: senderId,
      lead_id: leadId,
      message_text: texto,
      direction,
    })

  if (error) console.error("[db] Error guardando mensaje:", error)
}

// Obtener historial de conversación para dar contexto a Claude
export async function obtenerHistorial(senderId: string, limite = 20) {
  const supabase = getClient()

  const { data, error } = await supabase
    .from("conversations")
    .select("direction, message_text, created_at")
    .eq("sender_id", senderId)
    .order("created_at", { ascending: true })
    .limit(limite)

  if (error) {
    console.error("[db] Error obteniendo historial:", error)
    return []
  }

  return data || []
}

// Actualizar campos del lead (nombre, status, etc.)
export async function actualizarLead(senderId: string, campos: Record<string, unknown>) {
  const supabase = getClient()

  const { error } = await supabase
    .from("leads")
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq("sender_id", senderId)

  if (error) console.error("[db] Error actualizando lead:", error)
}
