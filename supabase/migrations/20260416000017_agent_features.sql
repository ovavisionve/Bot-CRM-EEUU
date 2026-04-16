-- Agregar feature flags de Fase 10 al JSON de tenants
-- multi_agent: controla si puede invitar agentes + leaderboard
-- auto_routing: activa el round-robin en el webhook

update tenants
set features = coalesce(features, '{}'::jsonb) ||
  '{
    "multi_agent": false,
    "auto_routing": false
  }'::jsonb
where not (features ? 'multi_agent');

-- Luis los tiene activos por default para probar
update tenants
set features = features ||
  '{"multi_agent": true, "auto_routing": true}'::jsonb
where slug = 'luis-almario';
