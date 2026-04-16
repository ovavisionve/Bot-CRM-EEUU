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

const ADMIN_KEY = "ova_admin_2026"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const tenantSlug = url.searchParams.get("tenant")
  const senderId = url.searchParams.get("lead")
  const listTenants = url.searchParams.get("tenants") === "1"
  const adminKey = url.searchParams.get("admin_key") || req.headers.get("x-admin-key")
  const action = url.searchParams.get("action")

  const supabase = getClient()

  // ─── Admin: actualizar features de un tenant ───
  if (req.method === "POST" && action === "update-features") {
    if (adminKey !== ADMIN_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const body = await req.json()
    const { slug, features } = body

    const { error } = await supabase
      .from("tenants")
      .update({ features, updated_at: new Date().toISOString() })
      .eq("slug", slug)

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // ─── Admin: crear nuevo tenant ───
  if (req.method === "POST" && action === "create-tenant") {
    if (adminKey !== ADMIN_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const body = await req.json()
    const { data, error } = await supabase
      .from("tenants")
      .insert({
        name: body.name,
        slug: body.slug,
        agent_name: body.agent_name,
        agent_email: body.agent_email,
        agent_phone: body.agent_phone,
        agent_language: body.agent_language || "en",
        instagram_user_id: body.instagram_user_id,
        instagram_access_token: body.instagram_access_token,
        instagram_handle: body.instagram_handle,
        google_sheet_id: body.google_sheet_id,
        plan: body.plan || "starter",
        bot_active: true,
      })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Crear agent_config default
    await supabase.from("agent_configs").insert({ tenant_id: data.id })

    return new Response(JSON.stringify({ ok: true, tenant: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Endpoint: listar todos los tenants (para super admin)
  if (listTenants) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name, slug, plan, status, agent_name, agent_email, agent_phone, bot_active, instagram_handle, instagram_user_id, google_sheet_id, features, created_at")
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
