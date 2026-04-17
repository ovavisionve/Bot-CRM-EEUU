// Guarda errores en la tabla error_logs para tracking
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function logError(
  functionName: string,
  error: unknown,
  tenantId?: string | null,
  context?: Record<string, unknown>
) {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : null
    await supabase.from("error_logs").insert({
      function_name: functionName,
      error_message: msg,
      error_stack: stack,
      tenant_id: tenantId || null,
      context: context || null,
    })
  } catch (_) { /* no fallar por el logger */ }
  console.error(`[${functionName}] ERROR:`, error)
}
