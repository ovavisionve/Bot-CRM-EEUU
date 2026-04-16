// Helper de autenticación para edge functions.
// Lee el JWT del header Authorization, verifica con Supabase Auth
// y devuelve el perfil del usuario (role + tenant_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export type UserRole = "super_admin" | "tenant_admin" | "agent"

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  tenant_id: string | null
  name: string | null
}

export async function getAuthUser(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null

  const jwt = authHeader.substring(7)

  // Verificar JWT contra Supabase Auth
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  )

  const { data: { user }, error } = await anonClient.auth.getUser(jwt)
  if (error || !user) return null

  // Obtener user_profile (con service role, bypass RLS)
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile) return null

  return {
    id: user.id,
    email: user.email!,
    role: profile.role,
    tenant_id: profile.tenant_id,
    name: profile.name,
  }
}

export function isSuperAdmin(u: AuthenticatedUser | null): boolean {
  return u?.role === "super_admin"
}

export function canAccessTenant(u: AuthenticatedUser | null, tenantId: string): boolean {
  if (!u) return false
  if (u.role === "super_admin") return true
  return u.tenant_id === tenantId
}
