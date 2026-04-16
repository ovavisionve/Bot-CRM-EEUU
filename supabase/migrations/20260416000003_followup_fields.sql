-- Campos adicionales para el motor de follow-ups automáticos

alter table leads add column if not exists followup_count int default 0;

create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_last_contacted on leads (last_contacted_at);
