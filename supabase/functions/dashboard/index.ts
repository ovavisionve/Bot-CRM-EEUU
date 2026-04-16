// Dashboard API — Devuelve leads y conversaciones como JSON
// El frontend es dashboard.html (archivo local)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const senderId = url.searchParams.get("lead")
  const supabase = getClient()

  // Obtener todos los leads
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false })

  // Si hay un lead seleccionado, obtener su conversacion
  let conversacion: any[] = []
  if (senderId) {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("sender_id", senderId)
      .order("created_at", { ascending: true })
    conversacion = data || []
  }

  return new Response(
    JSON.stringify({ leads: leads || [], conversacion }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  )
})
