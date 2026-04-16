-- Fase 9: Stripe + self-service billing

-- Tabla subscriptions para trackear Stripe (1 sub por tenant)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade unique,

  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,

  plan text not null default 'starter',
  status text default 'active',  -- active | past_due | canceled | trialing | unpaid
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_subs_tenant on subscriptions(tenant_id);
create index if not exists idx_subs_stripe_cust on subscriptions(stripe_customer_id);
create index if not exists idx_subs_stripe_sub on subscriptions(stripe_subscription_id);

-- Habilitar Realtime para subscriptions
alter publication supabase_realtime add table subscriptions;

-- Seed de subscription para Luis (custom plan, no pago)
insert into subscriptions (tenant_id, plan, status)
select id, 'custom', 'active' from tenants where slug = 'luis-almario'
on conflict (tenant_id) do nothing;
