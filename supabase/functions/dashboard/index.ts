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

function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const escape = (v: any) => {
    if (v === null || v === undefined) return ""
    const s = String(v).replace(/"/g, '""')
    return /[",\n\r]/.test(s) ? `"${s}"` : s
  }
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","))
  }
  return lines.join("\n")
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

  // ─── POST ?action=update-agent-config — editar voz/estilo del bot ───
  if (req.method === "POST" && action === "update-agent-config") {
    const { slug, updates } = await req.json()
    const { data: t } = await supabase.from("tenants").select("id, features").eq("slug", slug).maybeSingle()
    if (!t) return json({ error: "Tenant not found" }, 404)
    if (!canAccessTenant(user, t.id)) return json({ error: "Forbidden" }, 403)

    // custom_bot_voice gatea si el tenant puede editar agent_voice
    if (!isSuperAdmin(user) && !t.features?.custom_bot_voice) {
      return json({ error: "Feature custom_bot_voice no está activa" }, 403)
    }

    const allowed: Record<string, unknown> = {}
    const whitelist = ["agent_voice", "communication_style", "preferred_language", "auto_switch_language"]
    for (const k of whitelist) if (k in updates) allowed[k] = updates[k]

    const { error } = await supabase
      .from("agent_configs")
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq("tenant_id", t.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── GET ?action=agent-config — leer config del bot del tenant ───
  if (action === "agent-config") {
    const slug = url.searchParams.get("tenant")
    let tid: string | null = null
    if (slug && isSuperAdmin(user)) {
      const { data: t } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle()
      tid = t?.id || null
    } else {
      tid = user.tenant_id
    }
    if (!tid) return json({ config: null })
    const { data } = await supabase.from("agent_configs").select("*").eq("tenant_id", tid).maybeSingle()
    return json({ config: data })
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

  // ─── GET ?action=properties — listar propiedades del tenant ───
  if (action === "properties") {
    let tid: string | null = null
    const slug = url.searchParams.get("tenant")
    if (isSuperAdmin(user) && slug) {
      const { data } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle()
      tid = data?.id || null
    } else {
      tid = user.tenant_id
    }
    if (!tid) return json({ properties: [] })
    const { data } = await supabase
      .from("properties")
      .select("*")
      .eq("tenant_id", tid)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
    return json({ properties: data || [] })
  }

  // ─── POST ?action=create-property ───
  if (req.method === "POST" && action === "create-property") {
    const body = await req.json()
    const tid = isSuperAdmin(user) && body.tenant_slug
      ? (await supabase.from("tenants").select("id").eq("slug", body.tenant_slug).maybeSingle()).data?.id
      : user.tenant_id
    if (!tid) return json({ error: "No tenant" }, 404)
    if (!canAccessTenant(user, tid)) return json({ error: "Forbidden" }, 403)

    const { data, error } = await supabase
      .from("properties")
      .insert({
        tenant_id: tid,
        name: body.name,
        address: body.address,
        city: body.city,
        state: body.state,
        zip: body.zip,
        type: body.type,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        sqft: body.sqft,
        base_price: body.base_price,
        fees: body.fees_json || {},
        promotions: body.promotions_json || [],
        available: body.available !== false,
        available_date: body.available_date || null,
        min_credit_score: body.min_credit_score || 620,
        pets_allowed: body.pets_allowed !== false,
        esa_allowed: body.esa_allowed !== false,
        active: body.active !== false,
        priority: body.priority || 0,
        notes: body.notes,
      })
      .select()
      .single()
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, property: data })
  }

  // ─── POST ?action=update-property ───
  if (req.method === "POST" && action === "update-property") {
    const { id, updates } = await req.json()
    const { data: p } = await supabase.from("properties").select("tenant_id").eq("id", id).maybeSingle()
    if (!p) return json({ error: "Not found" }, 404)
    if (!canAccessTenant(user, p.tenant_id)) return json({ error: "Forbidden" }, 403)

    const allowed: Record<string, unknown> = {}
    const whitelist = [
      "name", "address", "city", "state", "zip", "type",
      "bedrooms", "bathrooms", "sqft", "base_price",
      "available", "available_date", "min_credit_score",
      "pets_allowed", "esa_allowed", "active", "priority",
      "notes", "fees", "promotions",
    ]
    for (const k of whitelist) if (k in updates) allowed[k] = updates[k]

    const { error } = await supabase
      .from("properties")
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── POST ?action=delete-property ───
  if (req.method === "POST" && action === "delete-property") {
    const { id } = await req.json()
    const { data: p } = await supabase.from("properties").select("tenant_id").eq("id", id).maybeSingle()
    if (!p) return json({ error: "Not found" }, 404)
    if (!canAccessTenant(user, p.tenant_id)) return json({ error: "Forbidden" }, 403)
    const { error } = await supabase.from("properties").delete().eq("id", id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── GET ?action=export&type=leads|conversations|properties|analytics&format=csv|json ───
  if (action === "export") {
    const type = url.searchParams.get("type") || "leads"
    const format = (url.searchParams.get("format") || "csv").toLowerCase()
    const slug = url.searchParams.get("tenant")

    let tid: string | null = null
    if (isSuperAdmin(user) && slug) {
      const { data } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle()
      tid = data?.id || null
    } else if (!isSuperAdmin(user)) {
      tid = user.tenant_id
    } else {
      const { data } = await supabase.from("tenants").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle()
      tid = data?.id || null
    }
    if (!tid) return json({ error: "No tenant" }, 404)

    let rows: any[] = []
    let filename = "export"

    if (type === "leads") {
      const { data } = await supabase
        .from("leads")
        .select("sender_id, name, partner_name, phone, email, status, score, language, source, move_in_date, occupants, pets, credit_score, budget_max, preferred_unit, selected_property_name, tour_date, tour_confirmed, ai_active, followup_count, notes, tour_notes, created_at, updated_at, last_contacted_at")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false })
      rows = data || []
      filename = "leads_" + new Date().toISOString().slice(0, 10)
    } else if (type === "conversations") {
      const leadId = url.searchParams.get("lead")
      let q = supabase
        .from("conversations")
        .select("sender_id, direction, sent_by, channel, message_text, ai_intent, created_at")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: true })
      if (leadId) q = q.eq("sender_id", leadId)
      const { data } = await q
      rows = data || []
      filename = "conversations_" + (leadId || "all") + "_" + new Date().toISOString().slice(0, 10)
    } else if (type === "properties") {
      const { data } = await supabase
        .from("properties")
        .select("name, address, bedrooms, bathrooms, base_price, fees, parking_fee, promotions, notes, active, available, priority")
        .eq("tenant_id", tid)
        .order("priority", { ascending: false })
      rows = data || []
      filename = "properties_" + new Date().toISOString().slice(0, 10)
    } else if (type === "analytics") {
      // Re-uso la misma lógica: llamar al endpoint analytics internamente
      const res = await fetch(new URL(url.origin + "/functions/v1/dashboard?action=analytics&tenant=" + encodeURIComponent(slug || "")).toString(), {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      })
      const analyticsData = await res.json()
      // Flatten para CSV
      rows = [
        { metric: "leads_total", value: analyticsData.totals?.leads || 0 },
        { metric: "leads_today", value: analyticsData.totals?.leads_today || 0 },
        { metric: "leads_week", value: analyticsData.totals?.leads_week || 0 },
        { metric: "leads_month", value: analyticsData.totals?.leads_month || 0 },
        { metric: "messages_total", value: analyticsData.totals?.messages || 0 },
        { metric: "messages_inbound", value: analyticsData.totals?.inbound || 0 },
        { metric: "messages_outbound", value: analyticsData.totals?.outbound || 0 },
        { metric: "avg_response_seconds", value: analyticsData.avg_response_seconds || 0 },
        { metric: "rate_qualification", value: ((analyticsData.rates?.qualification || 0) * 100).toFixed(1) + "%" },
        { metric: "rate_tour", value: ((analyticsData.rates?.tour || 0) * 100).toFixed(1) + "%" },
        { metric: "rate_close", value: ((analyticsData.rates?.close || 0) * 100).toFixed(1) + "%" },
        ...Object.entries(analyticsData.funnel || {}).map(([k, v]) => ({ metric: "funnel_" + k, value: v })),
      ]
      if (format === "json") {
        return new Response(JSON.stringify(analyticsData, null, 2), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="analytics_${new Date().toISOString().slice(0, 10)}.json"`,
          },
        })
      }
      filename = "analytics_" + new Date().toISOString().slice(0, 10)
    } else {
      return json({ error: "Unknown export type" }, 400)
    }

    if (format === "json") {
      return new Response(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}.json"`,
        },
      })
    }

    // CSV con BOM para que Excel abra en UTF-8 correctamente
    const csv = toCsv(rows)
    return new Response("\uFEFF" + csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    })
  }

  // ─── GET ?action=analytics — métricas del tenant ───
  if (action === "analytics") {
    // Resolver tenant
    let tid: string | null = null
    const slug = url.searchParams.get("tenant")
    if (isSuperAdmin(user) && slug) {
      const { data } = await supabase.from("tenants").select("id, features").eq("slug", slug).maybeSingle()
      tid = data?.id || null
    } else if (!isSuperAdmin(user)) {
      tid = user.tenant_id
    } else {
      const { data } = await supabase.from("tenants").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle()
      tid = data?.id || null
    }
    if (!tid) return json({ error: "No tenant" }, 404)

    // Feature gate: analytics
    const { data: t } = await supabase.from("tenants").select("features").eq("id", tid).maybeSingle()
    if (!t?.features?.analytics) {
      return json({ error: "analytics_disabled" }, 403)
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Total leads
    const { count: totalLeads } = await supabase
      .from("leads").select("*", { count: "exact", head: true }).eq("tenant_id", tid)

    // Leads hoy
    const { count: leadsToday } = await supabase
      .from("leads").select("*", { count: "exact", head: true })
      .eq("tenant_id", tid).gte("created_at", today)

    // Leads últimos 7 días
    const { count: leadsWeek } = await supabase
      .from("leads").select("*", { count: "exact", head: true })
      .eq("tenant_id", tid).gte("created_at", weekAgo)

    // Leads últimos 30 días
    const { count: leadsMonth } = await supabase
      .from("leads").select("*", { count: "exact", head: true })
      .eq("tenant_id", tid).gte("created_at", monthAgo)

    // Funnel por status
    const { data: allLeads } = await supabase
      .from("leads").select("status, created_at").eq("tenant_id", tid)
    const funnel: Record<string, number> = {
      new: 0, contacted: 0, qualified: 0,
      touring: 0, tour_confirmed: 0, closed_won: 0,
      closed_lost: 0, disqualified: 0,
    }
    for (const l of allLeads || []) {
      const s = l.status || "new"
      if (s in funnel) funnel[s]++
    }

    // Mensajes
    const { count: totalMessages } = await supabase
      .from("conversations").select("*", { count: "exact", head: true }).eq("tenant_id", tid)
    const { count: inboundMessages } = await supabase
      .from("conversations").select("*", { count: "exact", head: true })
      .eq("tenant_id", tid).eq("direction", "inbound")
    const { count: outboundMessages } = await supabase
      .from("conversations").select("*", { count: "exact", head: true })
      .eq("tenant_id", tid).eq("direction", "outbound")

    // Speed-to-lead: para cada lead, tiempo entre primer inbound y primer outbound
    const { data: firstInbounds } = await supabase
      .from("conversations")
      .select("lead_id, created_at")
      .eq("tenant_id", tid).eq("direction", "inbound")
      .order("created_at", { ascending: true })
    const { data: firstOutbounds } = await supabase
      .from("conversations")
      .select("lead_id, created_at")
      .eq("tenant_id", tid).eq("direction", "outbound")
      .order("created_at", { ascending: true })

    const firstIn: Record<string, string> = {}
    for (const m of firstInbounds || []) {
      if (!firstIn[m.lead_id]) firstIn[m.lead_id] = m.created_at
    }
    const firstOut: Record<string, string> = {}
    for (const m of firstOutbounds || []) {
      if (!firstOut[m.lead_id]) firstOut[m.lead_id] = m.created_at
    }
    let totalMs = 0, samples = 0
    for (const lid of Object.keys(firstIn)) {
      if (firstOut[lid]) {
        const diff = new Date(firstOut[lid]).getTime() - new Date(firstIn[lid]).getTime()
        if (diff >= 0) { totalMs += diff; samples++ }
      }
    }
    const avgResponseSeconds = samples > 0 ? Math.round(totalMs / samples / 1000) : null

    // Leads por día (últimos 14 días)
    const byDay: Record<string, number> = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      byDay[key] = 0
    }
    for (const l of allLeads || []) {
      const key = (l.created_at || "").slice(0, 10)
      if (key in byDay) byDay[key]++
    }

    // Tasas de conversión
    const qualified = funnel.qualified + funnel.touring + funnel.tour_confirmed + funnel.closed_won
    const toured = funnel.tour_confirmed + funnel.closed_won
    const won = funnel.closed_won

    return json({
      totals: {
        leads: totalLeads || 0,
        leads_today: leadsToday || 0,
        leads_week: leadsWeek || 0,
        leads_month: leadsMonth || 0,
        messages: totalMessages || 0,
        inbound: inboundMessages || 0,
        outbound: outboundMessages || 0,
      },
      funnel,
      rates: {
        qualification: totalLeads ? (qualified / totalLeads) : 0,
        tour: qualified ? (toured / qualified) : 0,
        close: toured ? (won / toured) : 0,
      },
      avg_response_seconds: avgResponseSeconds,
      leads_by_day: byDay,
    })
  }

  // ─── POST ?action=toggle-ai — tenant_admin pausa/activa bot para un lead ───
  if (req.method === "POST" && action === "toggle-ai") {
    const { sender_id, ai_active } = await req.json()
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

  // ─── POST ?action=update-lead — editar datos del lead manualmente ───
  if (req.method === "POST" && action === "update-lead") {
    const { sender_id, updates } = await req.json()
    const { data: lead } = await supabase
      .from("leads")
      .select("tenant_id")
      .eq("sender_id", sender_id)
      .maybeSingle()
    if (!lead) return json({ error: "Lead not found" }, 404)
    if (!canAccessTenant(user, lead.tenant_id)) return json({ error: "Forbidden" }, 403)

    // Whitelist de campos editables manualmente
    const allowed: Record<string, unknown> = {}
    const whitelist = [
      "name", "partner_name", "phone", "email",
      "status", "score", "tour_notes", "notes", "tags",
      "language", "preferred_unit", "selected_property_name",
      "tour_date", "tour_confirmed", "move_in_date",
      "occupants", "pets", "credit_score", "budget_max",
    ]
    for (const key of whitelist) {
      if (key in updates) allowed[key] = updates[key]
    }

    const { error } = await supabase
      .from("leads")
      .update({ ...allowed, updated_at: new Date().toISOString() })
      .eq("sender_id", sender_id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  // ─── POST ?action=send-message — enviar mensaje manual al lead ───
  if (req.method === "POST" && action === "send-message") {
    const { sender_id, texto, pause_bot } = await req.json()

    const { data: lead } = await supabase
      .from("leads")
      .select("tenant_id, id")
      .eq("sender_id", sender_id)
      .maybeSingle()
    if (!lead) return json({ error: "Lead not found" }, 404)
    if (!canAccessTenant(user, lead.tenant_id)) return json({ error: "Forbidden" }, 403)

    const { data: t } = await supabase
      .from("tenants")
      .select("instagram_access_token")
      .eq("id", lead.tenant_id)
      .maybeSingle()
    if (!t?.instagram_access_token) return json({ error: "No access token" }, 500)

    // Enviar vía Graph API
    const res = await fetch("https://graph.instagram.com/v22.0/me/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t.instagram_access_token}`,
      },
      body: JSON.stringify({
        recipient: { id: sender_id },
        message: { text: texto },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return json({ error: "IG API error: " + err }, 500)
    }

    // Guardar como outbound "agent"
    await supabase.from("conversations").insert({
      sender_id,
      lead_id: lead.id,
      tenant_id: lead.tenant_id,
      direction: "outbound",
      message_text: texto,
      sent_by: "agent",
      channel: "instagram",
    })

    // Pausar bot si se pidió
    if (pause_bot) {
      await supabase
        .from("leads")
        .update({ ai_active: false, updated_at: new Date().toISOString() })
        .eq("sender_id", sender_id)
    }

    return json({ ok: true })
  }

  // ─── POST ?action=bulk-update-status — mover múltiples leads de status (kanban) ───
  if (req.method === "POST" && action === "bulk-update-status") {
    const { sender_ids, new_status } = await req.json()
    if (!Array.isArray(sender_ids) || sender_ids.length === 0) {
      return json({ error: "sender_ids requerido" }, 400)
    }

    // Verificar que todos los leads son del tenant del usuario
    const { data: leadsCheck } = await supabase
      .from("leads")
      .select("sender_id, tenant_id")
      .in("sender_id", sender_ids)

    for (const l of leadsCheck || []) {
      if (!canAccessTenant(user, l.tenant_id)) return json({ error: "Forbidden" }, 403)
    }

    const { error } = await supabase
      .from("leads")
      .update({ status: new_status, updated_at: new Date().toISOString() })
      .in("sender_id", sender_ids)
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
