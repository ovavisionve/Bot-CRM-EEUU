-- Programa el cron de follow-ups para correr cada hora
-- Requiere que las extensiones pg_cron y pg_net estén habilitadas

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remover job anterior si existe (para poder re-correr la migración)
select cron.unschedule('followups-hourly')
where exists (select 1 from cron.job where jobname = 'followups-hourly');

-- Programar el cron cada hora en el minuto 0
select cron.schedule(
  'followups-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vrfydffwczomvuoigwsm.supabase.co/functions/v1/followup-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
