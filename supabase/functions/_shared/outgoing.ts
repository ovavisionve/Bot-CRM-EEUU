// Dispara outgoing webhooks al tenant cuando ocurren eventos (fire-and-forget)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export type WebhookEvent =
  | "lead.created"
  | "lead.qualified"
  | "lead.disqualified"
  | "lead.tour_confirmed"
  | "lead.closed_won"
  | "lead.closed_lost"
  | "message.inbound"
  | "message.outbound"

export async function fireWebhooks(
  tenantId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Check feature
  const { data: tenant } = await supabase.from("tenants").select("features").eq("id", tenantId).maybeSingle()
  if (!tenant?.features?.outgoing_webhooks) return

  // Get active webhooks subscribed to this event
  const { data: hooks } = await supabase
    .from("outgoing_webhooks")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("active", true)

  if (!hooks) return

  const matching = hooks.filter((h: any) =>
    (h.events || []).includes(event) || (h.events || []).includes("*")
  )

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload })

  for (const h of matching) {
    // Fire-and-forget (no await): no bloquear al bot
    fetch(h.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OVA-Event": event,
        "X-OVA-Webhook-Id": h.id,
        ...(h.secret ? { "X-OVA-Signature": h.secret } : {}),
      },
      body,
    })
      .then(async (res) => {
        await supabase.from("outgoing_webhooks").update({
          last_triggered_at: new Date().toISOString(),
          last_status_code: res.status,
        }).eq("id", h.id)
      })
      .catch((err) => console.error("[outgoing] webhook failed:", h.url, err))
  }
}
