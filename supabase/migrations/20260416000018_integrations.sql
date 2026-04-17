-- Fase 11: Integraciones (API publica, webhooks salientes, widget, import CSV)

-- API tokens del tenant (para que terceros hagan POST/GET)
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  token text not null unique,
  scopes text[] default array['leads:read', 'leads:write'],
  last_used_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid references user_profiles(id) on delete set null
);
create index if not exists idx_api_tokens_tenant on api_tokens(tenant_id);
create index if not exists idx_api_tokens_token on api_tokens(token);

-- Outgoing webhooks (notificar a terceros cuando pasan eventos)
create table if not exists outgoing_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  url text not null,
  events text[] not null default array['lead.created'],
  secret text,
  active boolean default true,
  last_triggered_at timestamptz,
  last_status_code int,
  created_at timestamptz default now()
);
create index if not exists idx_outgoing_webhooks_tenant on outgoing_webhooks(tenant_id);

-- Nuevos feature flags (default false, Luis los activa)
update tenants
set features = coalesce(features, '{}'::jsonb) ||
  '{
    "api_access": false,
    "outgoing_webhooks": false,
    "csv_import": false,
    "website_widget": false
  }'::jsonb
where not (features ? 'api_access');

update tenants
set features = features || '{
  "api_access": true,
  "outgoing_webhooks": true,
  "csv_import": true,
  "website_widget": true
}'::jsonb
where slug = 'luis-almario';
