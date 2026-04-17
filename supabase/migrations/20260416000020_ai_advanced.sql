-- Fase 13: IA avanzada
alter table leads add column if not exists sentiment text;
alter table leads add column if not exists close_probability int;
alter table conversations add column if not exists attachment_type text;
alter table conversations add column if not exists attachment_url text;
