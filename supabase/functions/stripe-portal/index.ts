// Stripe Customer Portal: genera un link al portal de Stripe para que el
// cliente gestione su suscripcion (cambiar plan, cancelar, ver facturas).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getAuthUser } from "../_shared/auth.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  if (!user.tenant_id) return new Response(JSON.stringify({ error: "No tenant" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("tenant_id", user.tenant_id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "Sin suscripcion activa" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  const secret = Deno.env.get("STRIPE_SECRET_KEY")
  if (!secret) return new Response(JSON.stringify({ error: "Stripe no configurado" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  const params = new URLSearchParams()
  params.append("customer", sub.stripe_customer_id)
  params.append("return_url", "https://ovavisionve.github.io/Bot-CRM-EEUU/dashboard.html")

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + secret,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || "Stripe error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }

  return new Response(JSON.stringify({ ok: true, url: data.url }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
})
