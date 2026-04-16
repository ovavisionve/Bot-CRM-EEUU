-- Programa el campaign-runner para correr cada hora en el minuto 15
-- (desfasado del followup-cron que corre en el minuto 0 para no colapsar)

select cron.unschedule('campaign-runner-hourly')
where exists (select 1 from cron.job where jobname = 'campaign-runner-hourly');

select cron.schedule(
  'campaign-runner-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://vrfydffwczomvuoigwsm.supabase.co/functions/v1/campaign-runner',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
