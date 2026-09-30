-- 2026-09-28: align the deployed RPC with account_status/withdrawn_at compatibility.
-- Retains pending withdrawals in remaining accounts until withdrawal completes.
-- Core dashboard RPC. Source data is never changed by this migration.
-- Cohorts start inside each selected KST period; outcomes are observed up to now().
-- Rates include immature cohorts (provisional); metadata exposes their counts.
-- A view cohort is one actor + item, anchored at their first view in each period.
-- A guest cohort is one anonymous ID, anchored at its first login_required in each period.
-- Registration attempts are start events, ending at the next start in the same actor/session.
-- Anonymous identities merge only when exactly one non-excluded member is observed.
-- Admin/withdrawn accounts and anonymous IDs associated with them are excluded.
-- Missing denominator returns JSON null. These are reconstructed definitions, not the
-- unavailable original 31_dashboard_analytics_views.sql implementation.
create or replace function public.get_dashboard_core(
  p_start_date date default ((now() at time zone 'Asia/Seoul')::date - 6),
  p_end_date date default (now() at time zone 'Asia/Seoul')::date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_now timestamptz := now();
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or p_end_date - p_start_date > 365 then
    raise exception 'Date range must contain 1 to 366 days' using errcode = '22023';
  end if;

  with
  bounds as (
    select p_start_date::timestamp at time zone 'Asia/Seoul' as start_at,
           (p_end_date + 1)::timestamp at time zone 'Asia/Seoul' as end_at,
           date_trunc('week', p_end_date::timestamp)::date as last_week
  ),
  periods as (
    select 'current'::text as period, start_at, end_at from bounds
    union all
    select 'previous', (p_start_date - (p_end_date - p_start_date + 1))::timestamp at time zone 'Asia/Seoul', start_at from bounds
    union all
    select 'week_' || n, (last_week - (7 * n))::timestamp at time zone 'Asia/Seoul',
           least((last_week + 7 - (7 * n))::timestamp at time zone 'Asia/Seoul', end_at)
    from bounds cross join generate_series(0, 7) n
  ),
  excluded_users as materialized (
    select u.user_id from public.users u
    where u.role = 'admin' or u.department_code = 'withdrawn'
      or to_jsonb(u) ->> 'account_status' = 'withdrawn'
      or nullif(to_jsonb(u) ->> 'withdrawn_at', '') is not null
  ),
  excluded_devices as materialized (
    select distinct anonymous_id from public.analytics_events
    where user_role = 'admin' or user_id in (select user_id from excluded_users)
  ),
  events as materialized (
    select e.* from public.analytics_events e
    where e.occurred_at <= v_now
      and e.user_role is distinct from 'admin'
      and not exists (select 1 from excluded_users u where u.user_id = e.user_id)
      and not exists (select 1 from excluded_devices d where d.anonymous_id = e.anonymous_id)
  ),
  identities as (
    select anonymous_id, min(user_id::text) as member_id, count(distinct user_id) as member_count
    from events where user_id is not null group by anonymous_id
  ),
  normalized as materialized (
    select e.*,
      case when e.user_id is not null then e.user_id::text
           when i.member_count = 1 then i.member_id end as member_id,
      case when e.user_id is not null then 'member:' || e.user_id::text
           when i.member_count = 1 then 'member:' || i.member_id
           else 'guest:' || e.anonymous_id end as actor_id
    from events e left join identities i using (anonymous_id)
  ),
  completed as materialized (
    select t.* from public.trades t
    where t.trade_status = 'completed' and t.completed_at is not null and t.completed_at <= v_now
      and not exists (select 1 from excluded_users u where u.user_id in (t.buyer_id, t.seller_id))
  ),
  listings as materialized (
    select i.*, least(i.sold_at, (select min(t.completed_at) from completed t where t.item_id = i.item_id)) as sale_at
    from public.items i where i.created_at <= v_now
      and not exists (select 1 from excluded_users u where u.user_id = i.seller_id)
  ),
  view_starts as (
    select p.period, e.actor_id, e.member_id, e.properties ->> 'item_id' as item_id, min(e.occurred_at) as started_at
    from periods p join normalized e on e.occurred_at >= p.start_at and e.occurred_at < p.end_at
    where e.event_name = 'view_item' and nullif(e.properties ->> 'item_id', '') is not null
    group by p.period, e.actor_id, e.member_id, e.properties ->> 'item_id'
  ),
  view_cohorts as (
    select v.*, exists (select 1 from completed t where t.buyer_id::text = v.member_id and t.item_id::text = v.item_id
      and t.completed_at >= v.started_at and t.completed_at <= v.started_at + interval '7 days') as converted
    from view_starts v
  ),
  sale_cohorts as (
    select p.period, i.created_at as started_at,
      (i.sale_at >= i.created_at and i.sale_at <= i.created_at + interval '30 days' and i.sale_at <= v_now) is true as converted
    from periods p join listings i on i.created_at >= p.start_at and i.created_at < p.end_at
  ),
  guest_starts as (
    select p.period, e.anonymous_id, min(e.occurred_at) as started_at
    from periods p join events e on e.occurred_at >= p.start_at and e.occurred_at < p.end_at
    where e.event_name = 'login_required' and (e.user_role = 'guest' or (e.user_role is null and e.user_id is null)) and nullif(e.anonymous_id, '') is not null
    group by p.period, e.anonymous_id
  ),
  guest_cohorts as (
    select g.*, exists (select 1 from events e where e.event_name = 'sign_up' and e.anonymous_id = g.anonymous_id
      and e.user_id is not null and e.occurred_at >= g.started_at
      and e.occurred_at <= g.started_at + interval '30 days') as converted
    from guest_starts g
  ),
  registration_sequence as (
    select e.*, lead(e.occurred_at) over (partition by e.actor_id, e.session_id order by e.occurred_at, e.event_id) as next_start_at
    from normalized e where e.event_name = 'start_item_registration' and nullif(e.session_id, '') is not null
  ),
  registration_cohorts as (
    select p.period, r.occurred_at as started_at, exists (select 1 from normalized e
      where e.event_name = 'create_item' and e.actor_id = r.actor_id and e.session_id = r.session_id
        and e.occurred_at >= r.occurred_at and e.occurred_at <= r.occurred_at + interval '24 hours'
        and (r.next_start_at is null or e.occurred_at < r.next_start_at)) as converted
    from periods p join registration_sequence r on r.occurred_at >= p.start_at and r.occurred_at < p.end_at
  ),
  rate_inputs as (
    select period, 'trade_conversion_rate'::text as metric, started_at, converted, interval '7 days' as observation_window from view_cohorts
    union all select period, 'sale_success_rate', started_at, converted, interval '30 days' from sale_cohorts
    union all select period, 'guest_conversion_rate', started_at, converted, interval '30 days' from guest_cohorts
    union all select period, 'registration_completion_rate', started_at, converted, interval '24 hours' from registration_cohorts
  ),
  rates as (
    select p.period, m.metric, count(r.started_at) as denominator,
      count(r.started_at) filter (where r.converted) as converted,
      count(r.started_at) filter (where r.started_at + r.observation_window > v_now) as immature,
      round(100.0 * count(r.started_at) filter (where r.converted) / nullif(count(r.started_at), 0), 2) as rate
    from periods p cross join (values ('trade_conversion_rate'), ('sale_success_rate'), ('guest_conversion_rate'), ('registration_completion_rate')) m(metric)
    left join rate_inputs r on r.period = p.period and r.metric = m.metric
    group by p.period, m.metric
  ),
  kpis as (
    select p.period, jsonb_object_agg(r.metric, r.rate) || jsonb_build_object('completed_trades',
      (select count(*) from completed t where t.completed_at >= p.start_at and t.completed_at < p.end_at)) as data
    from periods p join rates r using (period) group by p.period, p.start_at, p.end_at
  ),
  active_actors as (
    select e.actor_id, bool_or((e.user_role = 'member' or (e.user_role is null and e.user_id is not null)) is true) as is_member
    from normalized e cross join bounds b
    where e.occurred_at >= b.start_at and e.occurred_at < b.end_at and nullif(e.anonymous_id, '') is not null
    group by e.actor_id
  ),
  feature_starts as (
    select e.anonymous_id,
      case e.properties ->> 'restricted_feature'
        when 'chat' then '채팅 시작' when 'chat_started' then '채팅 시작'
        when 'chat_start' then '채팅 시작' when 'start_chat' then '채팅 시작'
        when 'item_registration' then '상품 등록' when 'create_item' then '상품 등록'
        when 'wishlist' then '찜' when 'add_to_wishlist' then '찜' when 'favorite' then '찜'
        when 'trade_reservation' then '예약 요청' when 'reservation' then '예약 요청'
        when 'my_page' then '마이페이지' when 'profile' then '마이페이지'
        else '기타' end as feature,
      min(e.occurred_at) as started_at
    from events e cross join bounds b
    where e.event_name = 'login_required' and (e.user_role = 'guest' or (e.user_role is null and e.user_id is null)) and nullif(e.anonymous_id, '') is not null
      and e.occurred_at >= b.start_at and e.occurred_at < b.end_at
    group by e.anonymous_id, 2
  ),
  features as (
    select f.feature, count(*) as guests,
      count(*) filter (where exists (select 1 from events e where e.event_name = 'sign_up'
        and e.anonymous_id = f.anonymous_id and e.user_id is not null
        and e.occurred_at >= f.started_at and e.occurred_at <= f.started_at + interval '30 days')) as converted_guests,
      count(*) filter (where f.started_at + interval '30 days' > v_now) as immature_guests
    from feature_starts f group by f.feature
  )
  select jsonb_build_object(
    'kpis', (select jsonb_object_agg(period, data) from kpis where period in ('current', 'previous')),
    'completed_trades_daily', (select jsonb_agg(jsonb_build_object('date', d::date, 'value',
      (select count(*) from completed t where t.completed_at >= d::timestamp at time zone 'Asia/Seoul'
         and t.completed_at < (d::date + 1)::timestamp at time zone 'Asia/Seoul')) order by d)
      from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') d),
    'weekly_conversion_trend', (select jsonb_agg(jsonb_build_object('week_start', (p.start_at at time zone 'Asia/Seoul')::date,
      'trade_conversion_rate', k.data -> 'trade_conversion_rate', 'sale_success_rate', k.data -> 'sale_success_rate') order by p.start_at)
      from periods p join kpis k using (period) where p.period like 'week_%'),
    'guest_member_mix', case when exists (select 1 from active_actors) then
      (select jsonb_agg(jsonb_build_object('actor_type', a.kind, 'actors', (select count(*) from active_actors where is_member = a.member)))
       from (values ('guest', false), ('member', true)) a(kind, member)) else '[]'::jsonb end,
    'login_required_conversion_by_feature', coalesce((select jsonb_agg(jsonb_build_object('feature', feature,
      'guests', guests, 'converted_guests', converted_guests, 'conversion_rate', round(100.0 * converted_guests / nullif(guests, 0), 2),
      'immature_guests', immature_guests) order by feature) from features), '[]'::jsonb),
    'metadata', jsonb_build_object(
      'source', 'supabase_rpc', 'definition_version', '20260928.1', 'timezone', 'Asia/Seoul',
      'start_date', p_start_date, 'end_date', p_end_date, 'observed_at', v_now,
      'previous_start_date', p_start_date - (p_end_date - p_start_date + 1), 'previous_end_date', p_start_date - 1,
      'rates_are_provisional', true,
      'cohorts', (select jsonb_object_agg(period, metrics) from (
        select period, jsonb_object_agg(metric, jsonb_build_object('denominator', denominator, 'converted', converted, 'immature', immature)) as metrics
        from rates group by period) c),
      'event_count', (select count(*) from events),
      'unlinked_view_cohorts', (select count(*) from view_cohorts where period = 'current' and member_id is null),
      'notes', jsonb_build_array(
        '전환율은 선택 기간에 시작한 집단 기준이며, 이후 관측된 완료까지 각 7일·30일·24시간 창에서 계산합니다.',
        '관측 창이 아직 끝나지 않은 집단도 포함하므로 전환율은 잠정값입니다. 분모가 없으면 null입니다.',
        '상품 조회는 기간별 사용자·상품 최초 조회, 가입 전환은 익명 ID별 최초 로그인 요구를 기준으로 중복 제거합니다.',
        '등록 완료율은 동일 사용자·세션 내 시작부터 다음 시작 전까지 첫 완료를 연결합니다. 세션이 바뀐 완료는 연결하지 않습니다.',
        '활동 구성은 선택 기간 중 회원 활동이 한 번이라도 있는 연결 사용자를 회원으로 분류합니다.',
        '관리자·탈퇴 계정 및 연결 익명 ID를 제외합니다. 과거 이벤트 삭제·익명 ID 초기화로 일부 전환을 연결하지 못할 수 있습니다.',
        '주별 추이는 종료일이 속한 월요일 시작 주를 포함한 최근 8주이며 마지막 주는 종료일까지입니다.'
      )
    )
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_dashboard_core(date, date) from public, anon, authenticated;
grant execute on function public.get_dashboard_core(date, date) to service_role;
comment on function public.get_dashboard_core(date, date) is
  'KOKET core dashboard, KST cohorts and observed 7d/30d/24h conversions; service_role only. Missing denominators are null; immature cohorts remain provisional.';
