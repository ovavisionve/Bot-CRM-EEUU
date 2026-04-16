// Webhook de Stripe: recibe eventos y actualiza subscriptions + features del tenant.
// Eventos manejados:
//  - checkout.session.completed: primer pago, crea/actualiza subscription
//  - customer.subscription.updated: cambios de plan
//  - customer.subscription.deleted: cancelacion

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { PLANS, planFromStripePriceId } from "../_shared/plans.ts"

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })

  const rawBody = await req.text()
  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  // Nota: verificacion HMAC de Stripe signature se omite aca por simplicidad.
  // En produccion agregar verificacion con STRIPE_WEBHOOK_SECRET.

  console.log("[stripe-webhook] event:", event.type)

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object)
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object)
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object)
    }
  } catch (err) {
    console.error("[stripe-webhook] error:", err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  })
})

async function handleCheckoutCompleted(session: any) {
  const supabase = getSupabase()
  const customerId = session.customer
  const subId = session.subscription
  const metadata = session.metadata || {}

  // Si hay tenant_slug en metadata -> upgrade de tenant existente
  if (metadata.tenant_slug) {
    const { data: tenant } = await supabase
      .from("tenants").select("id").eq("slug", metadata.tenant_slug).maybeSingle()
    if (tenant) {
      await upsertSubscription(tenant.id, customerId, subId)
      return
    }
  }

  // Si es signup nuevo -> crear tenant + user + subscription
  if (metadata.signup === "true" && metadata.email) {
    const slug = metadata.slug || (metadata.email.split("@")[0] + "-" + Date.now().toString(36))
    const { data: tenant, error: tErr } = await supabase.from("tenants").insert({
      name: metadata.business_name || metadata.email,
      slug,
      agent_name: metadata.agent_name || metadata.email.split("@")[0],
      agent_email: metadata.email,
      agent_phone: metadata.phone || null,
      agent_language: metadata.language || "en",
      plan: "starter",
      status: "active",
      bot_active: true,
    }).select().single()

    if (tErr || !tenant) {
      console.error("[stripe-webhook] create tenant failed:", tErr)
      return
    }

    // Crear agent_config default
    await supabase.from("agent_configs").insert({ tenant_id: tenant.id })

    // Crear user
    if (metadata.password) {
      const { error: uErr } = await supabase.auth.admin.createUser({
        email: metadata.email,
        password: metadata.password,
        email_confirm: true,
        user_metadata: {
          role: "tenant_admin",
          tenant_id: tenant.id,
          name: metadata.agent_name || null,
        },
      })
      if (uErr) console.error("[stripe-webhook] create user failed:", uErr)
    }

    await upsertSubscription(tenant.id, customerId, subId)
  }
}

async function handleSubscriptionUpdated(sub: any) {
  const supabase = getSupabase()
  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = planFromStripePriceId(priceId)

  // Buscar la subscription por stripe_subscription_id
  const { data: existing } = await supabase
    .from("subscriptions").select("tenant_id").eq("stripe_subscription_id", sub.id).maybeSingle()
  if (!existing) {
    // Si no existe, buscar por customer
    const { data: byCust } = await supabase
      .from("subscriptions").select("tenant_id").eq("stripe_customer_id", sub.customer).maybeSingle()
    if (byCust) {
      await updateSubscriptionRow(byCust.tenant_id, sub, plan, priceId)
    }
    return
  }
  await updateSubscriptionRow(existing.tenant_id, sub, plan, priceId)
}

async function handleSubscriptionDeleted(sub: any) {
  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from("subscriptions").select("tenant_id").eq("stripe_subscription_id", sub.id).maybeSingle()
  if (!existing) return

  await supabase.from("subscriptions").update({
    status: "canceled",
    cancel_at_period_end: false,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", existing.tenant_id)

  // Desactivar features (dejar solo dashboard para que vea su historial)
  await supabase.from("tenants").update({
    status: "suspended",
    bot_active: false,
    features: { dashboard_access: true, reports_export: true },
    updated_at: new Date().toISOString(),
  }).eq("id", existing.tenant_id)
}

async function upsertSubscription(tenantId: string, customerId: string, subscriptionId: string) {
  const supabase = getSupabase()
  // Obtener detalles de la suscripcion desde Stripe
  const secret = Deno.env.get("STRIPE_SECRET_KEY")!
  const res = await fetch("https://api.stripe.com/v1/subscriptions/" + subscriptionId, {
    headers: { "Authorization": "Bearer " + secret },
  })
  const sub = await res.json()
  const priceId = sub.items?.data?.[0]?.price?.id
  const plan = planFromStripePriceId(priceId)

  await supabase.from("subscriptions").upsert({
    tenant_id: tenantId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    plan,
    status: sub.status,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" })

  // Aplicar features del plan
  const planDef = PLANS[plan]
  if (planDef) {
    await supabase.from("tenants").update({
      plan,
      features: planDef.features,
      status: "active",
      bot_active: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    }).eq("id", tenantId)
  }
}

async function updateSubscriptionRow(tenantId: string, sub: any, plan: string, priceId: string) {
  const supabase = getSupabase()
  await supabase.from("subscriptions").update({
    plan,
    stripe_price_id: priceId,
    status: sub.status,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", tenantId)

  const planDef = PLANS[plan]
  if (planDef) {
    await supabase.from("tenants").update({
      plan,
      features: planDef.features,
      updated_at: new Date().toISOString(),
    }).eq("id", tenantId)
  }
}
