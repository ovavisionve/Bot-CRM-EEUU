// Dashboard API — protegido con Supabase Auth
// Endpoints:
//   GET  ?action=me                 - user profile del JWT
//   GET  ?action=tenants            - super admin: lista de todos los tenants con stats
//   GET  ?tenant=<slug>             - super admin ve cualquier tenant; tenant_admin sólo el suyo
//   GET  ?tenant=<slug>&lead=<id>   - conversación de un lead
//   POST ?action=update-features    - super admin: actualizar features de un tenant
//   POST ?action=create-tenant      - super admin: crear nuevo tenant
//   POST ?action=create-user        - super admin: crear usuario para un tenant
//   POST ?action=update-tenant      - super admin o tenant_admin (su tenant): editar datos
//   POST ?action=toggle-ai          - tenant_admin: pausar/activar bot para un lead específico

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getAuthUser, isSuperAdmin, canAccessTenant } from "../_shared/auth.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  // Todas las rutas requieren auth (menos OPTIONS arriba)
  const user = await getAuthUser(req)
  if (!user) return json({ error: "Unauthorized" }, 401)

  const supabase = getClient()

  // ─── GET /me — perfil del usuario ───
  if (action === "me") {
    let tenantData = null
    if (user.tenant_id) {
      const { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", user.tenant_id)
        .maybeSingle()
      tenantData = data
    }
    return json({ user, tenant: tenantData })
  }

  // ─── GET ?action=tenants — super admin: lista todos ───
  if (action === "tenants") {
    if (!isSuperAdmin(user)) return json({ error: "Forbidden" }, 403)

    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name, slug, plan, status, agent_name, agent_email, agent_phone, bot_active, instagram_handle, instagram_user_id, google_sheet_id, features, created_at")
      .order("created_at", { ascending: false })

    const stats: Record<string, any> = {}
    for (const t of tenants || []) {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", t.id)
      stats[t.id] = { leads: count || 0 }
    }

    return json({ tenants: tenants || [], stats })
  }

  // ─── POST ?action=update-features — super admin ───
  if (req.method === "POST" && action === "update-features") {
    if (!isSuperAdmin(user)) return json({ error: "Forbidden" }, 403)
    const { slug, features } = await req.json()
    const { error } = await supabase
      .from("tenants")
      .update({ features, updated_at: new Date().toISOString() })
      .eq("slug", slug)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── POST ?action=create-tenant — super admin ───
  if (req.method === "POST" && action === "create-tenant") {
    if (!isSuperAdmin(user)) return json({ error: "Forbidden" }, 403)
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
    if (error) return json({ error: error.message }, 500)
    await supabase.from("agent_configs").insert({ tenant_id: data.id })
    return json({ ok: true, tenant: data })
  }

  // ─── POST ?action=create-user — super admin crea usuario para un tenant ───
  if (req.method === "POST" && action === "create-user") {
    if (!isSuperAdmin(user)) return json({ error: "Forbidden" }, 403)
    const { email, password, tenant_id, role, name } = await req.json()

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: tenant_id || null,
        role: role || "tenant_admin",
        name: name || null,
      },
    })
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, user: { id: data.user?.id, email: data.user?.email } })
  }

  // ─── POST ?action=update-tenant — super admin o propio tenant_admin ───
  if (req.method === "POST" && action === "update-tenant") {
    const { slug, updates } = await req.json()

    // Resolver el tenant
    const { data: t } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle()
    if (!t) return json({ error: "Tenant not found" }, 404)
    if (!canAccessTenant(user, t.id)) return json({ error: "Forbidden" }, 403)

    // Si no es super_admin, limitar qué campos puede modificar
    let allowed: Record<string, unknown> = updates
    if (!isSuperAdmin(user)) {
      allowed = {
        agent_name: updates.agent_name,
        agent_email: updates.agent_email,
        agent_phone: updates.agent_phone,
        agent_language: updates.agent_language,
        bot_name: updates.bot_name,
        bot_active: updates.bot_active,
        google_sheet_id: updates.google_sheet_id,
        logo_url: updates.logo_url,
        brand_color: updates.brand_color,
      }
    }

    const { error } = await supabase
      .from("tenants")
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq("id", t.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── POST ?action=toggle-ai — tenant_admin pausa/activa bot para un lead ───
  if (req.method === "POST" && action === "toggle-ai") {
    const { sender_id, ai_active } = await req.json()
    // Un tenant sólo puede tocar sus propios leads
    const { data: lead } = await supabase
      .from("leads")
      .select("tenant_id")
      .eq("sender_id", sender_id)
      .maybeSingle()
    if (!lead) return json({ error: "Lead not found" }, 404)
    if (!canAccessTenant(user, lead.tenant_id)) return json({ error: "Forbidden" }, 403)

    const { error } = await supabase
      .from("leads")
      .update({ ai_active, updated_at: new Date().toISOString() })
      .eq("sender_id", sender_id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── GET leads de un tenant + conversación de un lead ───
  const tenantSlug = url.searchParams.get("tenant")
  const senderId = url.searchParams.get("lead")

  // Resolver el tenant a consultar
  let tenantId: string | null = null
  let tenant: any = null

  if (isSuperAdmin(user)) {
    // Super admin: puede ver cualquier tenant o el que pida por slug
    if (tenantSlug) {
      const { data } = await supabase.from("tenants").select("*").eq("slug", tenantSlug).maybeSingle()
      if (data) { tenantId = data.id; tenant = data }
    } else {
      // Default: primero
      const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle()
      if (data) { tenantId = data.id; tenant = data }
    }
  } else {
    // tenant_admin / agent: sólo el suyo
    if (!user.tenant_id) return json({ error: "No tenant assigned" }, 403)
    const { data } = await supabase.from("tenants").select("*").eq("id", user.tenant_id).maybeSingle()
    if (data) { tenantId = data.id; tenant = data }
  }

  if (!tenantId) return json({ tenant: null, leads: [], conversacion: [] })

  // Leads del tenant
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })

  // Conversación del lead seleccionado
  let conversacion: any[] = []
  if (senderId) {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("sender_id", senderId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
    conversacion = data || []
  }

  return json({ tenant, leads: leads || [], conversacion })
})
