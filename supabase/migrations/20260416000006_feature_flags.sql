-- Feature flags por tenant
-- Permite activar/desactivar cada función individualmente sin tocar código

alter table tenants add column if not exists features jsonb default '{
  "instagram_bot": false,
  "ai_responses": false,
  "google_sheets_properties": false,
  "ai_memory_extraction": false,
  "auto_followups": false,
  "admin_email_notifications": false,
  "handoff_to_human": false,
  "multi_language": false,
  "dashboard_access": false,
  "sms_bot": false,
  "drip_campaigns": false,
  "lead_scoring": false,
  "analytics": false,
  "white_label": false,
  "tour_calendar": false,
  "custom_bot_voice": false
}'::jsonb;

-- Luis Almario RE: todos los features que YA tiene funcionando en "true"
-- (lo dejamos como está - sin cambiar su comportamiento)
update tenants set features = '{
  "instagram_bot": true,
  "ai_responses": true,
  "google_sheets_properties": true,
  "ai_memory_extraction": true,
  "auto_followups": true,
  "admin_email_notifications": true,
  "handoff_to_human": false,
  "multi_language": true,
  "dashboard_access": true,
  "sms_bot": false,
  "drip_campaigns": false,
  "lead_scoring": false,
  "analytics": false,
  "white_label": false,
  "tour_calendar": false,
  "custom_bot_voice": false
}'::jsonb
where slug = 'luis-almario';

-- Plan a mostrar en el UI
update tenants set plan = 'custom' where slug = 'luis-almario';
