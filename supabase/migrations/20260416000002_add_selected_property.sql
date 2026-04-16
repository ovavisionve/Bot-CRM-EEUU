-- Guardar el nombre de la propiedad que eligió el lead
-- para que el bot no mezcle propiedades en conversaciones largas

alter table leads add column if not exists selected_property_name text;
alter table leads add column if not exists budget_max int;
alter table leads add column if not exists notes text;
