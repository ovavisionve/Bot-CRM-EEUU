-- Activar Tour Calendar para Luis (sale de Coming Soon)
update tenants
set features = features || '{"tour_calendar": true}'::jsonb
where slug = 'luis-almario';
