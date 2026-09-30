alter table public.users add column account_status text default 'active';
alter table public.users add column withdrawn_at timestamptz;

do $$
declare r jsonb;
begin
 update public.users set account_status = 'suspended' where user_id = '00000000-0000-0000-0000-000000000001';
 r := public.get_dashboard_core('2026-01-08', '2026-01-08');
 assert r #>> '{kpis,current,completed_trades}' = '1', 'suspension keeps historical member activity';

 update public.users set account_status = 'withdrawn', withdrawn_at = '2026-02-01' where user_id = '00000000-0000-0000-0000-000000000001';
 r := public.get_dashboard_core('2026-01-08', '2026-01-08');
 assert r #>> '{kpis,current,completed_trades}' = '0', 'explicit withdrawal excludes buyer';
 r := public.get_dashboard_core('2026-01-01', '2026-01-01');
 assert r #> '{kpis,current,trade_conversion_rate}' = 'null'::jsonb, 'withdrawn member and linked guest views excluded';

 update public.users set account_status = 'active' where user_id = '00000000-0000-0000-0000-000000000001';
 r := public.get_dashboard_core('2026-01-08', '2026-01-08');
 assert r #>> '{kpis,current,completed_trades}' = '0', 'withdrawal timestamp excludes partially migrated user';

 update public.users set withdrawn_at = null, department_code = 'withdrawn' where user_id = '00000000-0000-0000-0000-000000000001';
 r := public.get_dashboard_core('2026-01-08', '2026-01-08');
 assert r #>> '{kpis,current,completed_trades}' = '0', 'legacy sentinel remains excluded after adding status column';
end $$;
