-- Fase 6: drip campaigns, lead scoring, sms bot
-- Luis tiene drip_campaigns y lead_scoring activos para probar.
-- SMS sigue OFF porque requiere credenciales Twilio.

update tenants
set features = features ||
  '{"drip_campaigns": true, "lead_scoring": true}'::jsonb
where slug = 'luis-almario';

-- Campañas pre-cargadas para Luis
-- 1. Recordatorio de tour
insert into campaigns (tenant_id, name, trigger, steps, active)
select
  id,
  'Recordatorio de tour',
  'tour_reminder',
  '[
    {"step":1,"delay_hours":-24,"channel":"instagram","message":"Hola {name}, te recuerdo nuestra cita para ver el apartamento. ¿Sigue en pie para {tour_date}?"},
    {"step":2,"delay_hours":-2,"channel":"instagram","message":"{name}, en 2 horas nos vemos. La dirección: {property_address}. ¡Hasta ahora!"}
  ]'::jsonb,
  true
from tenants where slug = 'luis-almario'
on conflict do nothing;

-- 2. Post-tour follow-up
insert into campaigns (tenant_id, name, trigger, steps, active)
select
  id,
  'Seguimiento post-tour',
  'post_tour',
  '[
    {"step":1,"delay_hours":24,"channel":"instagram","message":"Hola {name}, ¿cómo te pareció el apartamento? ¿Alguna pregunta que te quedó?"},
    {"step":2,"delay_hours":72,"channel":"instagram","message":"{name}, si el apartamento te gustó te ayudo con la aplicación. Escríbeme cuando puedas."}
  ]'::jsonb,
  true
from tenants where slug = 'luis-almario'
on conflict do nothing;

-- 3. Objeción de presupuesto
insert into campaigns (tenant_id, name, trigger, steps, active)
select
  id,
  'Objeción de presupuesto',
  'budget_objection',
  '[
    {"step":1,"delay_hours":0,"channel":"instagram","message":"{name}, entiendo. Tengo otras opciones más económicas. ¿Quieres que te mande algunas?"},
    {"step":2,"delay_hours":48,"channel":"instagram","message":"¿Te interesó alguna de las otras? Las tengo disponibles todavía."}
  ]'::jsonb,
  true
from tenants where slug = 'luis-almario'
on conflict do nothing;
