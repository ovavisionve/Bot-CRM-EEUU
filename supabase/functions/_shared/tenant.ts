// Multi-tenant helpers — identificar al cliente por Instagram User ID
// (que Meta envía como `entry.id` o `recipient.id`) y cargar su config.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export interface TenantFeatures {
  instagram_bot: boolean
  ai_responses: boolean
  google_sheets_properties: boolean
  ai_memory_extraction: boolean
  auto_followups: boolean
  admin_email_notifications: boolean
  handoff_to_human: boolean
  multi_language: boolean
  dashboard_access: boolean
  sms_bot: boolean
  drip_campaigns: boolean
  lead_scoring: boolean
  analytics: boolean
  white_label: boolean
  tour_calendar: boolean
  custom_bot_voice: boolean
}

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  features: TenantFeatures
  agent_name: string
  agent_phone: string | null
  agent_email: string
  agent_language: string
  bot_name: string | null
  bot_active: boolean
  instagram_user_id: string | null
  instagram_access_token: string | null
  instagram_handle: string | null
  google_sheet_id: string | null
}

export interface AgentConfig {
  id: string
  tenant_id: string
  agent_voice: string | null
  communication_style: string
  preferred_language: string
  auto_switch_language: boolean
  qualify_before_pitch: boolean
  max_ai_messages_before_handoff: number
  custom_intents: any[]
  custom_responses: Record<string, string>
  active_hours: { start: string; end: string; timezone: string }
  active_days: string[]
  handoff_keywords: string[]
}

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

/**
 * Busca el tenant por su Instagram User ID (el que Meta identifica como page_id).
 * Este ID aparece en `entry.id` y `recipient.id` de cada evento del webhook.
 */
export async function getTenantByInstagramId(instagramUserId: string): Promise<Tenant | null> {
  const supabase = getClient()

  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("instagram_user_id", instagramUserId)
    .eq("status", "active")
    .maybeSingle()

  if (error) {
    console.error("[tenant] Error buscando tenant:", error)
    return null
  }

  if (!data) {
    console.warn("[tenant] No se encontró tenant para instagram_user_id:", instagramUserId)
    return null
  }

  return data as Tenant
}

/**
 * Obtiene la config del bot para un tenant específico.
 * Si no existe, devuelve una config default.
 */
export async function getAgentConfig(tenantId: string): Promise<AgentConfig | null> {
  const supabase = getClient()

  const { data, error } = await supabase
    .from("agent_configs")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    console.error("[tenant] Error obteniendo agent_config:", error)
    return null
  }

  return data as AgentConfig | null
}

/**
 * Lista todos los tenants activos con bot habilitado.
 * Útil para crons (follow-ups, reminders, etc.)
 */
export async function listActiveTenants(): Promise<Tenant[]> {
  const supabase = getClient()

  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("status", "active")
    .eq("bot_active", true)

  return (data || []) as Tenant[]
}

/**
 * Fallback: si no hay tenant en DB, usar las env vars (compatibilidad).
 * Usar sólo para migración — eventualmente todo se carga del tenant.
 */
export function getEnvFallbackTenant(): Partial<Tenant> {
  return {
    id: "env-fallback",
    name: "Env Fallback",
    slug: "env",
    status: "active",
    agent_name: "Bot",
    agent_phone: Deno.env.get("ADMIN_WHATSAPP") || null,
    agent_email: Deno.env.get("ADMIN_EMAIL") || "ovavision.ve@gmail.com",
    agent_language: "en",
    bot_active: true,
    instagram_access_token: Deno.env.get("INSTAGRAM_ACCESS_TOKEN") || null,
    instagram_handle: null,
    google_sheet_id: Deno.env.get("GOOGLE_SHEET_ID") || null,
  }
}
