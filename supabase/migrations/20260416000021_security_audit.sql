-- Fase 14: Seguridad, audit log, error tracking

-- ═══════════════ AUDIT LOG ═══════════════
create table if not exists audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid,
  action text not null,         -- create | update | delete
  entity text not null,         -- leads | tours | properties | campaigns | tenants
  entity_id text,
  changes jsonb,                -- {field: {old, new}}
  ip text,
  created_at timestamptz default now()
);
create index if not exists idx_audit_tenant on audit_logs(tenant_id);
create index if not exists idx_audit_created on audit_logs(created_at);

-- ═══════════════ ERROR LOG ═══════════════
create table if not exists error_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references tenants(id) on delete set null,
  function_name text,           -- webhook | dashboard | campaign-runner | etc
  error_message text not null,
  error_stack text,
  context jsonb,                -- metadata adicional
  created_at timestamptz default now()
);
create index if not exists idx_errors_created on error_logs(created_at);

-- ═══════════════ RATE LIMITS ═══════════════
create table if not exists rate_limits (
  id bigint generated always as identity primary key,
  key text not null,            -- ip:X.X.X.X | token:ova_XXX | tenant:UUID
  window_start timestamptz not null default now(),
  count int not null default 1,
  unique(key, window_start)
);
create index if not exists idx_rate_key on rate_limits(key);

-- ═══════════════ ROW LEVEL SECURITY ═══════════════
-- Activar RLS en tablas principales
-- NOTA: las edge functions usan service_role que bypassa RLS.
-- RLS protege si alguien accede directo con anon key.

alter table leads enable row level security;
alter table conversations enable row level security;
alter table properties enable row level security;
alter table tours enable row level security;
alter table campaigns enable row level security;
alter table campaign_enrollments enable row level security;
alter table api_tokens enable row level security;
alter table outgoing_webhooks enable row level security;
alter table push_subscriptions enable row level security;
alter table subscriptions enable row level security;
alter table audit_logs enable row level security;
alter table error_logs enable row level security;

-- Politica base: service_role puede todo (las edge functions usan esto)
-- Los usuarios con anon key no pueden acceder directamente a nada
-- (todo pasa por las edge functions que validan auth internamente)

-- Para user_profiles: un usuario puede leer su propio perfil
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'users_read_own' and tablename = 'user_profiles') then
    create policy users_read_own on user_profiles for select using (auth.uid() = id);
  end if;
end $$;

-- Trigger generico para audit log en leads
create or replace function audit_lead_changes()
returns trigger as $$
begin
  if TG_OP = 'UPDATE' then
    insert into audit_logs (tenant_id, action, entity, entity_id, changes)
    values (
      NEW.tenant_id,
      'update',
      'leads',
      NEW.sender_id,
      jsonb_build_object(
        'status', jsonb_build_object('old', OLD.status, 'new', NEW.status),
        'ai_active', jsonb_build_object('old', OLD.ai_active, 'new', NEW.ai_active),
        'score', jsonb_build_object('old', OLD.score, 'new', NEW.score)
      )
    );
  elsif TG_OP = 'INSERT' then
    insert into audit_logs (tenant_id, action, entity, entity_id)
    values (NEW.tenant_id, 'create', 'leads', NEW.sender_id);
  elsif TG_OP = 'DELETE' then
    insert into audit_logs (tenant_id, action, entity, entity_id)
    values (OLD.tenant_id, 'delete', 'leads', OLD.sender_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

drop trigger if exists audit_leads on leads;
create trigger audit_leads
  after insert or update or delete on leads
  for each row execute function audit_lead_changes();

-- Trigger para audit en tours
create or replace function audit_tour_changes()
returns trigger as $$
begin
  if TG_OP = 'UPDATE' then
    insert into audit_logs (tenant_id, action, entity, entity_id, changes)
    values (NEW.tenant_id, 'update', 'tours', NEW.id::text,
      jsonb_build_object('status', jsonb_build_object('old', OLD.status, 'new', NEW.status)));
  elsif TG_OP = 'INSERT' then
    insert into audit_logs (tenant_id, action, entity, entity_id)
    values (NEW.tenant_id, 'create', 'tours', NEW.id::text);
  end if;
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

drop trigger if exists audit_tours on tours;
create trigger audit_tours
  after insert or update on tours
  for each row execute function audit_tour_changes();
