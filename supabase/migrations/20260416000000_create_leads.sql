-- Tabla de leads capturados desde Instagram DMs
create table leads (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  sender_id text not null,
  mensaje text not null,
  respuesta text not null,
  estado text default 'Pendiente'
);

-- Index para buscar por sender
create index idx_leads_sender_id on leads (sender_id);
