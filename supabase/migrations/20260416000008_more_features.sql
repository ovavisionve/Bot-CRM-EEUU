-- Nuevos feature flags para las funcionalidades agregadas en Fase 3 y 4
-- Cada una controla si aparece/funciona en el CRM del tenant.

-- Actualizar default de features para nuevos tenants
alter table tenants
  alter column features set default '{
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
    "custom_bot_voice": false,
    "properties_editor": false,
    "manual_messaging": false,
    "lead_editing": false,
    "reports_export": false,
    "pipeline_kanban": false
  }'::jsonb;

-- Merge los nuevos flags en tenants existentes (los inicializa en false)
update tenants
set features = coalesce(features, '{}'::jsonb) ||
  '{
    "properties_editor": false,
    "manual_messaging": false,
    "lead_editing": false,
    "reports_export": false,
    "pipeline_kanban": false
  }'::jsonb
where not (features ? 'properties_editor');

-- Luis Almario RE: activar todas las features nuevas para que mantenga
-- la experiencia que ya tiene funcionando.
update tenants
set features = features ||
  '{
    "properties_editor": true,
    "manual_messaging": true,
    "lead_editing": true,
    "reports_export": true,
    "pipeline_kanban": true
  }'::jsonb
where slug = 'luis-almario';
