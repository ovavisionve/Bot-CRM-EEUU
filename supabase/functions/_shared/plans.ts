// Definicion de planes: features incluidas y precios.
// Los stripe_price_id se setean via env vars en Supabase.

export interface Plan {
  id: string
  name: string
  price_monthly: number
  description: string
  features: Record<string, boolean>
  limits: { leads: number; properties: number; messages_per_month: number; agents: number }
}

export const PLANS: Record<string, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    price_monthly: 97,
    description: "Bot de Instagram + CRM basico",
    features: {
      instagram_bot: true,
      ai_responses: true,
      ai_memory_extraction: true,
      dashboard_access: true,
      multi_language: true,
      admin_email_notifications: true,
      handoff_to_human: true,
      lead_editing: true,
      manual_messaging: true,
      google_sheets_properties: true,
      properties_editor: true,
      auto_followups: false,
      pipeline_kanban: false,
      analytics: false,
      reports_export: false,
      tour_calendar: false,
      custom_bot_voice: false,
      drip_campaigns: false,
      lead_scoring: false,
      sms_bot: false,
      white_label: false,
    },
    limits: { leads: 50, properties: 3, messages_per_month: 500, agents: 1 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price_monthly: 197,
    description: "Todo lo del Starter + automatizaciones + analytics",
    features: {
      instagram_bot: true,
      ai_responses: true,
      ai_memory_extraction: true,
      dashboard_access: true,
      multi_language: true,
      admin_email_notifications: true,
      handoff_to_human: true,
      lead_editing: true,
      manual_messaging: true,
      google_sheets_properties: true,
      properties_editor: true,
      auto_followups: true,
      pipeline_kanban: true,
      analytics: true,
      reports_export: true,
      tour_calendar: true,
      custom_bot_voice: true,
      drip_campaigns: true,
      lead_scoring: true,
      sms_bot: false,
      white_label: false,
    },
    limits: { leads: 500, properties: 10, messages_per_month: 5000, agents: 1 },
  },
  agency: {
    id: "agency",
    name: "Agency",
    price_monthly: 497,
    description: "Todo del Pro + SMS + white-label + multi-agente",
    features: {
      instagram_bot: true,
      ai_responses: true,
      ai_memory_extraction: true,
      dashboard_access: true,
      multi_language: true,
      admin_email_notifications: true,
      handoff_to_human: true,
      lead_editing: true,
      manual_messaging: true,
      google_sheets_properties: true,
      properties_editor: true,
      auto_followups: true,
      pipeline_kanban: true,
      analytics: true,
      reports_export: true,
      tour_calendar: true,
      custom_bot_voice: true,
      drip_campaigns: true,
      lead_scoring: true,
      sms_bot: true,
      white_label: true,
    },
    limits: { leads: -1, properties: -1, messages_per_month: -1, agents: 10 },
  },
}

// Mapping entre Stripe price IDs (del env) y nuestros plan IDs
export function planFromStripePriceId(priceId: string): string {
  const starter = Deno.env.get("STRIPE_PRICE_STARTER")
  const pro = Deno.env.get("STRIPE_PRICE_PRO")
  const agency = Deno.env.get("STRIPE_PRICE_AGENCY")
  if (priceId === starter) return "starter"
  if (priceId === pro) return "pro"
  if (priceId === agency) return "agency"
  return "starter"
}

export function getStripePriceForPlan(plan: string): string | null {
  switch (plan) {
    case "starter": return Deno.env.get("STRIPE_PRICE_STARTER") || null
    case "pro": return Deno.env.get("STRIPE_PRICE_PRO") || null
    case "agency": return Deno.env.get("STRIPE_PRICE_AGENCY") || null
    default: return null
  }
}
