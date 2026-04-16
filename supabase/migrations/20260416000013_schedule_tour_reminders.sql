-- Programa el cron de tour-reminders: cada 30 minutos

select cron.unschedule('tour-reminders-30min')
where exists (select 1 from cron.job where jobname = 'tour-reminders-30min');

select cron.schedule(
  'tour-reminders-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://vrfydffwczomvuoigwsm.supabase.co/functions/v1/tour-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
