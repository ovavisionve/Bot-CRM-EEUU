-- Push subscriptions (Web Push API)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index if not exists idx_push_subs_tenant on push_subscriptions(tenant_id);
create index if not exists idx_push_subs_user on push_subscriptions(user_id);

-- Feature flag
update tenants
set features = coalesce(features, '{}'::jsonb) ||
  '{"push_notifications": false}'::jsonb
where not (features ? 'push_notifications');

update tenants
set features = features || '{"push_notifications": true}'::jsonb
where slug = 'luis-almario';
