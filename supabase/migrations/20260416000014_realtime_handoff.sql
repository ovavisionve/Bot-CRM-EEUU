-- Fase 8: Habilitar Supabase Realtime para conversations y leads
-- Esto permite suscribirse desde el frontend a inserts/updates en tiempo real

-- Habilitar replicacion para Realtime en las tablas relevantes
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table tours;

-- Campo para asignar leads a agentes especificos (plan Agency)
alter table leads add column if not exists assigned_to uuid references user_profiles(id) on delete set null;
create index if not exists idx_leads_assigned on leads(assigned_to);

-- Vista de handoff queue: leads con ai_active=false agrupados
-- (consulta directa, no necesita view, pero indexamos para que sea rapida)
create index if not exists idx_leads_ai_active on leads(ai_active) where ai_active = false;
