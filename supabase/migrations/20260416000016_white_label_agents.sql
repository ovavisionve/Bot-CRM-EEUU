-- Fase 10: White-label + Multi-agent

-- Branding extendido para tenants (ya existen logo_url y brand_color)
alter table tenants add column if not exists company_name text;
alter table tenants add column if not exists accent_color text default '#42b72a';
alter table tenants add column if not exists support_email text;

-- user_profiles: agregar campos para agentes
alter table user_profiles add column if not exists phone text;
alter table user_profiles add column if not exists avatar_url text;
alter table user_profiles add column if not exists active boolean default true;
alter table user_profiles add column if not exists last_login_at timestamptz;

-- Sacar white_label y actualizar Luis con ese feature activo para probar
update tenants
set features = features || '{"white_label": true}'::jsonb
where slug = 'luis-almario';

-- Sampler de branding para Luis (opcional)
update tenants
set
  company_name = 'Luis Almario Real Estate',
  brand_color = '#1e3a8a',
  accent_color = '#f59e0b',
  support_email = 'luisrentals16@gmail.com'
where slug = 'luis-almario' and company_name is null;

create index if not exists idx_user_profiles_active on user_profiles(active) where active = true;
