// Dashboard API — multi-tenant
// Params:
//   ?tenant=<slug>          - Filtrar por tenant específico (default: todos si super_admin)
//   ?lead=<sender_id>       - Ver conversación de un lead
// Por ahora es público. En fase 2 se protege con Supabase Auth.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get("tenant")
  const senderId = url.searchParams.get("lead")
  const listTenants = url.searchParams.get("tenants") === "1"

  const supabase = getClient()

  // Endpoint: listar todos los tenants (para super admin)
  if (listTenants) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name, slug, plan, status, agent_name, agent_email, bot_active, instagram_handle, created_at")
      .order("created_at", { ascending: false })

    // Contar leads por tenant
    const stats: Record<string, any> = {}
    for (const t of tenants || []) {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", t.id)
      stats[t.id] = { leads: count || 0 }
    }

    return new Response(
      JSON.stringify({ tenants: tenants || [], stats }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  // Determinar qué tenant queremos ver
  let tenantId: string | null = null
  let tenant: any = null

  if (tenantSlug) {
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("slug", tenantSlug)
      .maybeSingle()
    if (data) {
      tenantId = data.id
      tenant = data
    }
  } else {
    // Default: primer tenant activo (Luis)
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data) {
      tenantId = data.id
      tenant = data
    }
  }

  // Leads del tenant
  let leads: any[] = []
  if (tenantId) {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
    leads = data || []
  }

  // Conversación del lead seleccionado
  let conversacion: any[] = []
  if (senderId && tenantId) {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("sender_id", senderId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
    conversacion = data || []
  }

  return new Response(
    JSON.stringify({ tenant, leads, conversacion }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})
