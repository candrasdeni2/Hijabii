create extension if not exists pg_cron;

select cron.unschedule('expire-orders')
where exists (select 1 from cron.job where jobname = 'expire-orders');

select cron.schedule('expire-orders', '*/10 * * * *', $$select public.expire_overdue_orders()$$);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'expire-orders';