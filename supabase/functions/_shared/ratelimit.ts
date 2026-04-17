// Rate limiter simple basado en ventana de tiempo + contador en DB
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function checkRateLimit(
  key: string,
  maxPerWindow: number = 100,
  windowMinutes: number = 15
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const now = new Date()
  // Redondear al inicio de la ventana
  const windowMs = windowMinutes * 60 * 1000
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString()

  // Upsert: incrementar contador o crear nuevo
  const { data } = await supabase
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStart)
    .maybeSingle()

  if (!data) {
    await supabase.from("rate_limits").insert({ key, window_start: windowStart, count: 1 })
    return { allowed: true, remaining: maxPerWindow - 1 }
  }

  if (data.count >= maxPerWindow) {
    return { allowed: false, remaining: 0 }
  }

  await supabase
    .from("rate_limits")
    .update({ count: data.count + 1 })
    .eq("key", key)
    .eq("window_start", windowStart)

  return { allowed: true, remaining: maxPerWindow - data.count - 1 }
}

// Limpiar rate limits viejos (correr periodicamente)
export async function cleanupRateLimits() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hora
  await supabase.from("rate_limits").delete().lt("window_start", cutoff)
}
