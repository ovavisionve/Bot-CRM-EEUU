-- =========================================================================
-- OVA REAL — Migración a arquitectura multi-tenant
-- =========================================================================
-- Cada tenant = un cliente de OVA VISION (agente o agencia inmobiliaria).
-- Todas las tablas llevan tenant_id para aislamiento de datos.

-- ───────────────────────────────────────────────────────────────────────
-- 1. TENANTS — clientes de OVA VISION
-- ───────────────────────────────────────────────────────────────────────
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text default 'starter',                    -- starter | pro | agency
  status text default 'active',                    -- active | suspended | trial

  -- Branding
  logo_url text,
  brand_color text default '#2563EB',

  -- Contacto del agente
  agent_name text not null,
  agent_phone text,
  agent_email text not null,
  agent_language text default 'en',

  -- Configuración del Bot
  bot_name text,
  bot_persona text,
  bot_active boolean default false,

  -- Meta / Instagram
  meta_page_id text,
  instagram_user_id text,
  instagram_access_token text,
  instagram_handle text,

  -- Twilio SMS (plan Pro+)
  twilio_phone_number text,
  twilio_account_sid text,
  twilio_auth_token text,

  -- Stripe
  stripe_customer_id text,
  stripe_subscription_id text,

  -- Google Sheets para propiedades
  google_sheet_id text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  trial_ends_at timestamptz
);

create index if not exists idx_tenants_meta_page_id on tenants(meta_page_id);
create index if not exists idx_tenants_instagram_user_id on tenants(instagram_user_id);
create index if not exists idx_tenants_slug on tenants(slug);

-- ───────────────────────────────────────────────────────────────────────
-- 2. AGENT_CONFIGS — configuración del bot por tenant
-- ───────────────────────────────────────────────────────────────────────
create table if not exists agent_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade unique,

  agent_voice text,
  communication_style text default 'casual',
  preferred_language text default 'en',
  auto_switch_language boolean default true,

  qualify_before_pitch boolean default true,
  max_ai_messages_before_handoff int default 20,

  custom_intents jsonb default '[]'::jsonb,
  custom_responses jsonb default '{}'::jsonb,

  active_hours jsonb default '{"start": "08:00", "end": "22:00", "timezone": "America/New_York"}'::jsonb,
  active_days text[] default array['mon','tue','wed','thu','fri','sat'],

  handoff_keywords text[] default array['hablar con persona','speak to agent','human','real person'],
  handoff_notification text default 'email',

  updated_at timestamptz default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- 3. CAMPAIGNS — drip sequences (follow-ups personalizados)
-- ───────────────────────────────────────────────────────────────────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  name text not null,
  trigger text not null,  -- new_lead | no_response_24h | tour_reminder | etc
  steps jsonb not null,   -- array de pasos con delay, canal, mensaje
  active boolean default true,

  created_at timestamptz default now()
);

create index if not exists idx_campaigns_tenant on campaigns(tenant_id);

create table if not exists campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id bigint references leads(id) on delete cascade,

  current_step int default 0,
  status text default 'active',  -- active | paused | completed | cancelled
  next_step_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz default now()
);

-- ───────────────────────────────────────────────────────────────────────
-- 4. TOURS — visitas agendadas
-- ───────────────────────────────────────────────────────────────────────
create table if not exists tours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id bigint references leads(id) on delete cascade,
  property_id bigint references properties(id) on delete set null,

  scheduled_at timestamptz not null,
  duration_minutes int default 30,
  status text default 'scheduled',  -- scheduled | confirmed | completed | no_show | cancelled | rescheduled

  notes text,
  outcome text,
  reminder_sent boolean default false,
  confirmation_sent boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_tours_tenant on tours(tenant_id);
create index if not exists idx_tours_scheduled on tours(scheduled_at);

-- ───────────────────────────────────────────────────────────────────────
-- 5. AGREGAR tenant_id A TABLAS EXISTENTES
-- ───────────────────────────────────────────────────────────────────────
alter table leads add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table conversations add column if not exists tenant_id uuid references tenants(id) on delete cascade;
alter table properties add column if not exists tenant_id uuid references tenants(id) on delete cascade;

-- Campos extra en leads según spec de OVA REAL
alter table leads add column if not exists phone text;
alter table leads add column if not exists instagram_id text;
alter table leads add column if not exists instagram_handle text;
alter table leads add column if not exists email text;
alter table leads add column if not exists source text;
alter table leads add column if not exists score int default 0;
alter table leads add column if not exists score_factors jsonb;
alter table leads add column if not exists tour_notes text;
alter table leads add column if not exists property_id bigint references properties(id) on delete set null;
alter table leads add column if not exists ai_active boolean default true;
alter table leads add column if not exists last_ai_message_at timestamptz;
alter table leads add column if not exists next_followup_at timestamptz;
alter table leads add column if not exists disqualify_reason text;
alter table leads add column if not exists raw_data jsonb;
alter table leads add column if not exists tags text[];

-- Campos extra en messages (conversations) según spec
alter table conversations add column if not exists channel text default 'instagram';
alter table conversations add column if not exists media_url text;
alter table conversations add column if not exists sent_by text default 'bot';
alter table conversations add column if not exists meta_message_id text;
alter table conversations add column if not exists twilio_sid text;
alter table conversations add column if not exists status text default 'sent';
alter table conversations add column if not exists ai_intent text;
alter table conversations add column if not exists ai_confidence decimal(3,2);

-- Campos extra en properties
alter table properties add column if not exists city text;
alter table properties add column if not exists state text;
alter table properties add column if not exists zip text;
alter table properties add column if not exists maps_url text;
alter table properties add column if not exists type text;
alter table properties add column if not exists sqft int;
alter table properties add column if not exists floor text;
alter table properties add column if not exists available boolean default true;
alter table properties add column if not exists available_date date;
alter table properties add column if not exists units_available int default 1;
alter table properties add column if not exists min_credit_score int default 620;
alter table properties add column if not exists pets_allowed boolean default true;
alter table properties add column if not exists esa_allowed boolean default true;
alter table properties add column if not exists photos text[];
alter table properties add column if not exists video_url text;
alter table properties add column if not exists virtual_tour_url text;
alter table properties add column if not exists active boolean default true;
alter table properties add column if not exists priority int default 0;
alter table properties add column if not exists updated_at timestamptz default now();

-- ───────────────────────────────────────────────────────────────────────
-- 6. SEED — Luis Almario RE como primer tenant
-- ───────────────────────────────────────────────────────────────────────
insert into tenants (
  name, slug, plan, status,
  agent_name, agent_phone, agent_email, agent_language,
  bot_name, bot_active,
  instagram_user_id, instagram_handle,
  google_sheet_id
) values (
  'Luis Almario RE',
  'luis-almario',
  'pro',
  'active',
  'Luis Almario',
  '+17865551234',
  'ovavision.ve@gmail.com',  -- temporal hasta que Luis dé su email
  'en',
  'Luis Bot',
  true,
  '17841480294765249',      -- IG User ID de filardo305realty
  'filardo305realty',
  '1Z-4GBiEBqR7qRyahILkpMDuv48BDS5JLgTGi161lLXA'
) on conflict (slug) do nothing;

-- Config default del bot para Luis
insert into agent_configs (tenant_id, agent_voice, communication_style, preferred_language)
select id, 'Luis Almario - Miami real estate agent', 'casual', 'en'
from tenants where slug = 'luis-almario'
on conflict (tenant_id) do nothing;

-- Asignar leads/conversations/properties existentes al tenant de Luis
update leads
set tenant_id = (select id from tenants where slug = 'luis-almario')
where tenant_id is null;

update conversations
set tenant_id = (select id from tenants where slug = 'luis-almario')
where tenant_id is null;

update properties
set tenant_id = (select id from tenants where slug = 'luis-almario')
where tenant_id is null;

-- Hacer tenant_id obligatorio
alter table leads alter column tenant_id set not null;
alter table conversations alter column tenant_id set not null;
-- properties puede seguir permitiendo null por ahora (vienen del Sheet)

-- Indices de performance
create index if not exists idx_leads_tenant on leads(tenant_id);
create index if not exists idx_conversations_tenant on conversations(tenant_id);
create index if not exists idx_properties_tenant on properties(tenant_id);
