// Stripe Checkout: crea una sesion para que el cliente pague
//
// POST body: { email, plan: "starter"|"pro"|"agency", tenant_slug?, success_url?, cancel_url? }
// Si tenant_slug existe -> upgrade/downgrade (usa el customer existente)
// Si no existe -> es un signup nuevo, se crea tenant + usuario despues del pago

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getStripePriceForPlan } from "../_shared/plans.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

async function stripeApi(path: string, body: URLSearchParams): Promise<any> {
  const secret = Deno.env.get("STRIPE_SECRET_KEY")
  if (!secret) throw new Error("STRIPE_SECRET_KEY no configurado")
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + secret,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || "Stripe error")
  return data
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })
  if (req.method !== "POST") return new Response("POST only", { status: 405 })

  try {
    const body = await req.json()
    const { email, plan, tenant_slug, success_url, cancel_url, signup_data } = body

    const priceId = getStripePriceForPlan(plan)
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Plan invalido o STRIPE_PRICE_* no seteado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const supabase = getSupabase()
    let customerId: string | null = null

    // Si el tenant existe, buscar su stripe_customer_id
    if (tenant_slug) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id, tenants!inner(slug)")
        .eq("tenants.slug", tenant_slug)
        .maybeSingle()
      if (sub?.stripe_customer_id) customerId = sub.stripe_customer_id
    }

    // Crear session de Stripe Checkout
    const params = new URLSearchParams()
    params.append("mode", "subscription")
    params.append("line_items[0][price]", priceId)
    params.append("line_items[0][quantity]", "1")
    if (customerId) params.append("customer", customerId)
    else if (email) params.append("customer_email", email)
    params.append("success_url", success_url || "https://ovavisionve.github.io/Bot-CRM-EEUU/welcome.html?session_id={CHECKOUT_SESSION_ID}")
    params.append("cancel_url", cancel_url || "https://ovavisionve.github.io/Bot-CRM-EEUU/pricing.html")

    // Metadata para el webhook: si es signup nuevo, incluir datos
    if (tenant_slug) params.append("metadata[tenant_slug]", tenant_slug)
    if (signup_data) {
      params.append("metadata[signup]", "true")
      for (const [k, v] of Object.entries(signup_data)) {
        if (typeof v === "string") params.append("metadata[" + k + "]", v)
      }
    }

    const session = await stripeApi("/checkout/sessions", params)

    return new Response(JSON.stringify({ ok: true, url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
