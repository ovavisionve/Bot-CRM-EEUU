// Bootstrap — Crea los usuarios iniciales.
// Se ejecuta UNA vez después de la migración de user_profiles.
// Protegido con un token temporal para que no lo corra cualquiera.
//
// Llamar con:
//   POST /functions/v1/bootstrap?token=ova_bootstrap_2026
//   body: { super_admin_password: "...", luis_password: "..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BOOTSTRAP_TOKEN = "ova_bootstrap_2026"

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 })

  const url = new URL(req.url)
  const token = url.searchParams.get("token")
  if (token !== BOOTSTRAP_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const { super_admin_password, luis_password, super_admin_email, luis_email } = await req.json()

  if (!super_admin_password || !luis_password) {
    return new Response(
      JSON.stringify({ error: "super_admin_password y luis_password requeridos" }),
      { status: 400 }
    )
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const adminEmail = super_admin_email || "ovavision.ve@gmail.com"
  const luisEmail = luis_email || "luis@filardo305.com"

  const results: any = {}

  // 1. Crear super_admin (OVA VISION)
  const { data: sa, error: saErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: super_admin_password,
    email_confirm: true,
    user_metadata: {
      role: "super_admin",
      name: "OVA VISION Admin",
    },
  })
  results.super_admin = saErr ? { error: saErr.message } : { id: sa?.user?.id, email: sa?.user?.email }

  // 2. Crear tenant_admin Luis asociado a su tenant
  const { data: luisTenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "luis-almario")
    .maybeSingle()

  if (!luisTenant) {
    results.luis = { error: "Tenant Luis no encontrado - correr migraciones primero" }
  } else {
    const { data: luisUser, error: luisErr } = await supabase.auth.admin.createUser({
      email: luisEmail,
      password: luis_password,
      email_confirm: true,
      user_metadata: {
        role: "tenant_admin",
        tenant_id: luisTenant.id,
        name: "Luis Almario",
      },
    })
    results.luis = luisErr
      ? { error: luisErr.message }
      : { id: luisUser?.user?.id, email: luisUser?.user?.email, tenant_id: luisTenant.id }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
})
