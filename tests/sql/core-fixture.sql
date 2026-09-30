-- Isolated PostgreSQL only: synthetic fixture, never run against the live project.
create role anon;
create role authenticated;
create role service_role;
create table public.users(user_id uuid primary key, role text, department_code text);
create table public.items(item_id uuid primary key, seller_id uuid, created_at timestamptz, sold_at timestamptz);
create table public.trades(trade_id uuid primary key, item_id uuid, buyer_id uuid, seller_id uuid, trade_status text, completed_at timestamptz);
create table public.analytics_events(event_id uuid primary key, event_name text, user_id uuid, anonymous_id text, session_id text, occurred_at timestamptz, user_role text, properties jsonb default '{}');
grant usage on schema public to service_role, anon, authenticated;
grant select on all tables in schema public to service_role;
insert into users values
 ('00000000-0000-0000-0000-000000000001','member','business'),
 ('00000000-0000-0000-0000-000000000002','member','business'),
 ('00000000-0000-0000-0000-000000000003','admin','business');
insert into items values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-01-01 00:00+09','2026-01-31 00:00+09'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','2026-01-01 00:00+09','2026-01-31 00:00:01+09');
insert into trades values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','completed','2026-01-08 00:00+09'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','completed','2026-01-31 00:00:01+09'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','completed','2026-01-01 01:00+09');
insert into analytics_events(event_id,event_name,user_id,anonymous_id,session_id,occurred_at,properties) values
 ('30000000-0000-0000-0000-000000000001','view_item',null,'device1','s1','2026-01-01 00:00+09','{"item_id":"10000000-0000-0000-0000-000000000001"}'),
 ('30000000-0000-0000-0000-000000000002','view_item',null,'device1','s1','2026-01-01 01:00+09','{"item_id":"10000000-0000-0000-0000-000000000001"}'),
 ('30000000-0000-0000-0000-000000000003','view_item',null,'device1','s1','2026-01-01 00:00+09','{"item_id":"10000000-0000-0000-0000-000000000002"}'),
 ('30000000-0000-0000-0000-000000000004','login_required',null,'device1','s1','2026-01-01 00:00+09','{"restricted_feature":"chat"}'),
 ('30000000-0000-0000-0000-000000000005','login_required',null,'device2','s2','2026-01-01 00:00+09','{"restricted_feature":"chat"}'),
 ('30000000-0000-0000-0000-000000000006','sign_up','00000000-0000-0000-0000-000000000001','device1','s1','2026-01-31 00:00+09','{}'),
 ('30000000-0000-0000-0000-000000000007','sign_up','00000000-0000-0000-0000-000000000002','device2','s2','2026-01-31 00:00:01+09','{}'),
 ('30000000-0000-0000-0000-000000000008','start_item_registration','00000000-0000-0000-0000-000000000001','device1','r1','2026-01-01 00:00+09','{}'),
 ('30000000-0000-0000-0000-000000000009','start_item_registration','00000000-0000-0000-0000-000000000001','device1','r1','2026-01-01 01:00+09','{}'),
 ('30000000-0000-0000-0000-000000000010','create_item','00000000-0000-0000-0000-000000000001','device1','r1','2026-01-02 01:00+09','{}'),
 ('30000000-0000-0000-0000-000000000011','view_item','00000000-0000-0000-0000-000000000003','admin','a1','2026-01-01 00:00+09','{"item_id":"10000000-0000-0000-0000-000000000001"}');

-- A relisted item's current sold_at must not conceal the earlier completed sale.
update items set sold_at = '2026-02-10 00:00+09' where item_id = '10000000-0000-0000-0000-000000000001';
-- Auth changed before the analytics batch flush: captured role preserves guest state.
insert into analytics_events(event_id,event_name,user_id,anonymous_id,session_id,occurred_at,user_role,properties) values
 ('30000000-0000-0000-0000-000000000012','login_required','00000000-0000-0000-0000-000000000002','lateflush','lf','2026-01-02 00:00+09','guest','{"restricted_feature":"chat"}'),
 ('30000000-0000-0000-0000-000000000013','sign_up','00000000-0000-0000-0000-000000000002','lateflush','lf','2026-01-03 00:00+09','member','{}');
insert into analytics_events(event_id,event_name,anonymous_id,session_id,occurred_at) values
 ('30000000-0000-0000-0000-000000000014','screen_view','unlinked','u1','2026-01-02 00:00+09');
