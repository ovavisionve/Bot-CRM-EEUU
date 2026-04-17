// API publica con Bearer token (para terceros / Zapier / CRMs externos / widgets)
//
// Endpoints (todos requieren Authorization: Bearer ova_XXXX):
//   GET  /public-api/leads?limit=50
//   POST /public-api/leads      { name, email, phone, ... }
//   GET  /public-api/leads/:id
//   GET  /public-api/health     (sin auth)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

async function authenticate(req: Request): Promise<{ tenant_id: string; scopes: string[] } | null> {
  const authz = req.headers.get("Authorization")
  if (!authz || !authz.startsWith("Bearer ")) return null
  const token = authz.substring(7)
  if (!token.startsWith("ova_")) return null

  const supabase = getClient()
  const { data } = await supabase
    .from("api_tokens")
    .select("tenant_id, scopes")
    .eq("token", token)
    .maybeSingle()
  if (!data) return null

  // Actualizar last_used_at (fire-and-forget)
  supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token).then()

  return { tenant_id: data.tenant_id, scopes: data.scopes || [] }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const path = url.pathname.replace("/public-api", "").replace(/^\/+|\/+$/g, "") || ""

  if (path === "health") {
    return json({ ok: true, service: "OVA REAL Public API", version: 1 })
  }

  const auth = await authenticate(req)
  if (!auth) return json({ error: "Invalid or missing API token" }, 401)

  const supabase = getClient()

  // GET /leads
  if (path === "leads" && req.method === "GET") {
    if (!auth.scopes.includes("leads:read")) return json({ error: "Missing scope leads:read" }, 403)
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200)
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", auth.tenant_id)
      .order("created_at", { ascending: false })
      .limit(limit)
    return json({ leads: data || [] })
  }

  // POST /leads
  if (path === "leads" && req.method === "POST") {
    if (!auth.scopes.includes("leads:write")) return json({ error: "Missing scope leads:write" }, 403)
    const body = await req.json()

    const senderId = body.sender_id || body.phone || body.email ||
      ("api_" + Math.random().toString(36).slice(2, 12))

    const { data, error } = await supabase.from("leads").insert({
      tenant_id: auth.tenant_id,
      sender_id: senderId,
      name: body.name || null,
      phone: body.phone || null,
      email: body.email || null,
      instagram_handle: body.instagram_handle || null,
      move_in_date: body.move_in_date || null,
      occupants: body.occupants || null,
      pets: body.pets || null,
      credit_score: body.credit_score || null,
      budget_max: body.budget_max || null,
      language: body.language || "en",
      source: body.source || "api",
      status: body.status || "new",
      notes: body.notes || null,
    }).select().single()

    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, lead: data }, 201)
  }

  // GET /leads/:id
  const leadMatch = path.match(/^leads\/(.+)$/)
  if (leadMatch && req.method === "GET") {
    if (!auth.scopes.includes("leads:read")) return json({ error: "Missing scope leads:read" }, 403)
    const id = leadMatch[1]
    const { data } = await supabase
      .from("leads").select("*").eq("tenant_id", auth.tenant_id)
      .or(`id.eq.${id},sender_id.eq.${id}`)
      .maybeSingle()
    if (!data) return json({ error: "Not found" }, 404)
    return json({ lead: data })
  }

  return json({ error: "Not found. Endpoints: GET/POST /leads, GET /leads/:id, GET /health" }, 404)
})
