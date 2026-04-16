-- Expandir schema: leads completo, conversaciones y propiedades
-- para soportar el flujo conversacional de Luis Almario RE

-- Recrear tabla leads con campos completos
drop table if exists leads;

create table leads (
  id bigint generated always as identity primary key,
  sender_id text not null unique,
  name text,
  partner_name text,
  move_in_date text,
  occupants text,
  pets text,
  credit_score int,
  preferred_unit text,
  language text default 'en',
  channel text default 'instagram',
  tour_date text,
  tour_confirmed boolean default false,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_contacted_at timestamptz
);

create index idx_leads_sender_id on leads (sender_id);

-- Historial de mensajes (para dar contexto a Claude)
create table conversations (
  id bigint generated always as identity primary key,
  lead_id bigint references leads(id) on delete cascade,
  sender_id text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_text text not null,
  created_at timestamptz default now()
);

create index idx_conversations_sender on conversations (sender_id);
create index idx_conversations_lead on conversations (lead_id);

-- Propiedades activas
create table properties (
  id bigint generated always as identity primary key,
  name text not null,
  address text not null,
  bedrooms int,
  bathrooms int,
  base_price decimal,
  fees decimal,
  parking_fee decimal,
  promotions text,
  notes text,
  created_at timestamptz default now()
);

-- Insertar propiedades de Luis
insert into properties (name, address, bedrooms, bathrooms, base_price, fees, parking_fee, promotions, notes) values
  ('Principal 2BR/2BA', '2901 SW 69th Court, Miami FL 33155', 2, 2, 2850, 70, 25, '2do parking GRATIS este mes', 'Edificio nuevo, abrió en diciembre. Fees incluyen internet, trash, amenities, pest control.'),
  ('Principal 1BR/1BA', '3140 SW 69th Ave Unit A (Coral Terrace West)', 1, 1, 2090, 70, 25, '2do parking GRATIS este mes', 'Misma zona que el principal.'),
  ('Alternativa económica', '3830 NW 11th St, Miami FL 33126', null, null, null, null, null, null, 'Ofrecer cuando el lead dice que el precio está fuera de presupuesto.'),
  ('Premium', 'Alexan Ludlam Trace area', null, null, 3000, null, null, 'Specials disponibles', 'Zona premium, ~$3000/mes con specials y fees.');
