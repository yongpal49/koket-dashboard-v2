-- Run after core-fixture.sql + migration in an isolated PostgreSQL database.
set role service_role;
do $$
declare r jsonb;
begin
 r := public.get_dashboard_core('2026-01-01', '2026-01-01');
 assert r #>> '{kpis,current,completed_trades}' = '0', 'admin trade excluded';
 assert (r #>> '{kpis,current,trade_conversion_rate}')::numeric = 50, '7-day boundary and duplicate views';
 assert (r #>> '{kpis,current,sale_success_rate}')::numeric = 50, '30-day sale boundary';
 assert (r #>> '{kpis,current,guest_conversion_rate}')::numeric = 50, '30-day signup boundary';
 assert (r #>> '{kpis,current,registration_completion_rate}')::numeric = 50, 'next start terminates prior attempt and 24-hour inclusive';
 assert r #>> '{metadata,cohorts,current,trade_conversion_rate,denominator}' = '2', 'actor/item deduplication';
 assert r #>> '{metadata,previous_start_date}' = '2025-12-31', 'equal previous range';
 assert r #> '{kpis,previous,trade_conversion_rate}' = 'null'::jsonb, 'empty denominator is null';
 assert jsonb_array_length(r -> 'weekly_conversion_trend') = 8, 'eight weeks';
 assert r #>> '{completed_trades_daily,0,date}' = '2026-01-01', 'KST daily date';
 assert r #>> '{login_required_conversion_by_feature,0,converted_guests}' = '1', 'feature attribution';
 r := public.get_dashboard_core('2026-01-08', '2026-01-08');
 assert r #>> '{kpis,current,completed_trades}' = '1', 'completion cohort differs from view cohort';
 assert r #>> '{completed_trades_daily,0,value}' = '1', 'KST midnight inclusive';
 r := public.get_dashboard_core('2026-01-02', '2026-01-02');
 assert (r #>> '{kpis,current,guest_conversion_rate}')::numeric = 100, 'captured guest role survives auth flush';
 assert r #>> '{login_required_conversion_by_feature,0,converted_guests}' = '1', 'guest feature survives auth flush';
 assert exists (select 1 from jsonb_array_elements(r -> 'guest_member_mix') e where e ->> 'actor_type' = 'guest' and e ->> 'actors' = '2'), 'guest activity uses captured role';
 r := public.get_dashboard_core();
 assert jsonb_array_length(r -> 'completed_trades_daily') = 7, 'default seven days';
 begin
   perform public.get_dashboard_core('2026-01-02', '2026-01-01');
   raise exception 'expected invalid range rejection';
 exception when invalid_parameter_value then null;
 end;
 assert not has_function_privilege('anon', 'public.get_dashboard_core(date,date)', 'execute'), 'anon denied';
 assert not has_function_privilege('authenticated', 'public.get_dashboard_core(date,date)', 'execute'), 'authenticated denied';
 assert has_function_privilege('service_role', 'public.get_dashboard_core(date,date)', 'execute'), 'service role allowed';
 raise notice 'Core RPC assertions passed';
end $$;
reset role;
