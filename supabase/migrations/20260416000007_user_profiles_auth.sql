-- Sistema de autenticación con roles (super_admin / tenant_admin / agent)
-- Supabase Auth maneja users/passwords; nosotros agregamos role + tenant_id.

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  tenant_id uuid references tenants(id) on delete cascade,
  role text not null default 'tenant_admin' check (role in ('super_admin', 'tenant_admin', 'agent')),
  name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_profiles_tenant on user_profiles(tenant_id);
create index if not exists idx_user_profiles_email on user_profiles(email);

-- Trigger: cada vez que se crea un auth.users, crea automáticamente el user_profile
-- usando role y tenant_id del raw_user_meta_data (si se pasan al crear).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, role, tenant_id, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'tenant_admin'),
    nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid,
    new.raw_user_meta_data->>'name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
