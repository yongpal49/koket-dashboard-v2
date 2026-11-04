import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTableDashboard } from '../server/table-dashboard.js';

const env = { SUPABASE_URL: 'https://fixture.supabase.invalid', SUPABASE_SECRET_KEY: 'fixture-only' };
const period = { startDate: '2026-09-01', endDate: '2026-09-07' };
const now = Date.parse('2026-09-20T00:00:00Z');
function fixtureFetch(fixtures = {}, cap = Infinity, onRequest = () => {}, userColumns = []) {
  return async (input, options) => {
    const url = new URL(input);
    onRequest(url, options);
    const table = url.pathname.split('/').at(-1);
    const missing = table === 'users' && ['account_status', 'withdrawn_at'].find(column => url.searchParams.get('select').split(',').includes(column) && !userColumns.includes(column));
    if (missing) return new Response(JSON.stringify({ code: '42703', message: `column users.${missing} does not exist` }), { status: 400 });
    const rows = fixtures[table] || [];
    const offset = Number(url.searchParams.get('offset'));
    const limit = Math.min(cap, Number(url.searchParams.get('limit')));
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { 'content-range': `${offset}-${Math.max(offset, offset + Math.min(limit, rows.length - offset) - 1)}/${rows.length}` } });
  };
}

test('aggregates six sections, excludes admin members and attributes completed_at at KST boundaries', async () => {
  const fixtures = {
    users: [
      { user_id: 'member-a', role: 'member', joined_at: '2026-08-31T15:00:00Z', department_code: 'CS' },
      { user_id: 'member-b', role: 'member', joined_at: '2026-08-01T00:00:00Z', department_code: 'CS' },
      { user_id: 'admin-secret-id', role: 'admin', joined_at: '2026-09-01T00:00:00Z', department_code: 'ADMIN' },
    ],
    items: [{ item_id: 'item-a', seller_id: 'member-a', created_at: '2026-08-30T15:00:00Z', sale_status: 'sold', visibility_status: 'visible' }],
    categories: [{ category_id: 'cat-a', category_name: '교재/도서', chip_label: '교재' }],
    item_categories: [{ item_category_id: 'link-a', item_id: 'item-a', category_id: 'cat-a', is_primary: true }],
    trades: [
      { trade_id: 'trade-a', item_id: 'item-a', seller_id: 'member-a', buyer_id: 'member-b', trade_status: 'completed', created_at: '2026-08-30T15:00:00Z', completed_at: '2026-08-31T15:00:00Z', updated_at: '2026-09-10T00:00:00Z', scheduled_at: '2026-09-01T06:00:00Z' },
      { trade_id: 'trade-b', item_id: 'item-a', seller_id: 'member-a', buyer_id: 'member-b', trade_status: 'completed', completed_at: '2026-09-07T15:00:00Z' },
    ],
    favorites: [{ favorite_id: 'fav-a', user_id: 'member-b', item_id: 'item-a', created_at: '2026-09-02T00:00:00Z' }],
    messages: [{ message_id: 'msg-a', chat_room_id: 'room-a', sender_id: 'member-a', message_type: 'text', created_at: '2026-09-02T00:00:00Z' }],
    reviews: [{ review_id: 'review-a', trade_id: 'trade-a', created_at: '2026-09-02T00:00:00Z' }],
  };
  const { data, metadata } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch(fixtures, 1, (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(url.searchParams.get('order').endsWith('.asc'), true);
    assert.equal(url.searchParams.get('select').includes('*'), false);
    assert.equal(options.headers.apikey, 'fixture-only');
  }) });
  assert.deepEqual(Object.keys(data), ['core', 'members', 'supply', 'engagement', 'funnels', 'operations']);
  assert.equal(data.core.kpis.current.completed_trades, 1);
  assert.equal(data.core.completed_trades_daily[0].value, 1);
  assert.equal(data.members.kpis.current.total_members, 2);
  assert.equal(data.members.kpis.current.new_members, 1);
  assert.equal(data.supply.kpis.current.average_days_to_sell, 1);
  assert.equal(data.engagement.kpis.current.review_rate, 100);
  assert.deepEqual(data.engagement.completed_trades_by_category, [{ category_name: '교재', trades: 1 }]);
  assert.deepEqual(metadata.previous_period, { start_date: '2026-08-25', end_date: '2026-08-31' });
  assert.equal(data.engagement.weekly_trends.length, 7);
  assert.equal(data.engagement.weekly_trends.at(-1).week_start, '2026-08-31');
  assert.equal(JSON.stringify({ data, metadata }).includes('member-a'), false);
  assert.equal(JSON.stringify({ data, metadata }).includes('fixture-only'), false);
});

test('empty tables preserve null rates and unavailable metrics rather than demo values', async () => {
  const { data, metadata } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch() });
  assert.equal(data.core.kpis.current.completed_trades, 0);
  assert.equal(data.core.kpis.current.trade_conversion_rate, null);
  assert.equal(data.engagement.kpis.current.review_rate, null);
  assert.equal(data.members.kpis.current.new_guests, null);
  assert.equal(data.members.kpis.current.week_4_retention_rate, null);
  assert.equal(data.operations.reservation_fulfillment.fulfillment_rate, null);
  assert.deepEqual(data.funnels.trade_completion.stages, []);
  assert.equal(metadata.analytics_observed_range.first_event_at, null);
});

test('funnels consume event linkage columns and preserve account exclusions across business and event cohorts', async () => {
  const fixtures = {
    users: [{ user_id: 'member', role: 'member' }, { user_id: 'admin', role: 'admin' }],
    analytics_events: ['member', 'admin'].flatMap(user_id => [
      { event_id: `${user_id}-start`, event_name: 'start_item_registration', user_id, anonymous_id: `${user_id}-device`, session_id: 's', occurred_at: '2026-09-01T00:00:00Z' },
      { event_id: `${user_id}-preview`, event_name: 'preview_item', user_id, anonymous_id: `${user_id}-device`, session_id: 's', occurred_at: '2026-09-01T01:00:00Z' },
      { event_id: `${user_id}-done`, event_name: 'create_item', user_id, anonymous_id: `${user_id}-device`, session_id: 's', occurred_at: '2026-09-01T02:00:00Z', properties: { item_id: 'item' } },
    ]),
    trades: ['member', 'admin'].map(buyer_id => ({ trade_id: buyer_id, buyer_id, seller_id: 'seller', created_at: '2026-09-01T00:00:00Z', trade_status: 'completed', completed_at: '2026-09-02T00:00:00Z' })),
    trade_status_history: ['member', 'admin'].map(trade_id => ({ trade_status_history_id: trade_id, trade_id, to_status: 'reserved', created_at: '2026-09-01T01:00:00Z' })),
    reviews: ['member', 'admin'].map(trade_id => ({ review_id: trade_id, trade_id, created_at: '2026-09-03T00:00:00Z' })),
  };
  const { data } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch(fixtures, 100, url => {
    if (url.pathname.endsWith('/analytics_events')) {
      const columns = url.searchParams.get('select').split(',');
      assert.equal(columns.includes('session_id') && columns.includes('properties'), true);
    }
  }) });
  assert.deepEqual(data.funnels.item_registration.stages.map(row => row.attempts), [1, 1, 1]);
  assert.deepEqual(data.funnels.operational_trade.stages.map(row => row.attempts), [1, 1, 1, 1]);
  assert.equal(JSON.stringify(data.funnels).includes('member-device'), false);
});

test('pagination cap fails instead of returning partial aggregates', async () => {
  const users = Array.from({ length: 3 }, (_, i) => ({ user_id: `u${i}`, role: 'member', joined_at: '2026-01-01T00:00:00Z' }));
  await assert.rejects(loadTableDashboard(env, period, { now, maxPages: 2, fetch: fixtureFetch({ users }, 1) }), /pagination limit/);
});

test('invalid dates fail before a database read', async () => {
  const fetch = async () => { throw new Error('must not fetch'); };
  for (const range of [ { startDate: '2026-02-30', endDate: '2026-03-02' }, { startDate: '2026-09-07', endDate: '2026-09-01' }, { startDate: '2025-01-01', endDate: '2026-01-02' } ]) {
    await assert.rejects(loadTableDashboard(env, range, { fetch }), error => error.status === 400);
  }
});

test('critical read failures and pagination instability fail closed', async () => {
  await assert.rejects(loadTableDashboard(env, period, { fetch: async () => new Response('{}', { status: 403 }) }), /table read failed/);
  await assert.rejects(loadTableDashboard(env, period, { maxPages: 3, fetch: async () => new Response('[{"user_id":"same"}]') }), /pagination|Invalid|Unstable/);
});

test('modern secret authentication, observed activity, dates and coarse places expose aggregates only', async () => {
  const fixtures = {
    users: [{ user_id: 'u', role: 'member', joined_at: '2026-08-01T00:00:00Z' }],
    trades: [{ trade_id: 't', trade_status: 'completed', created_at: '2026-09-01T00:00:00Z', completed_at: '2026-09-02T00:00:00Z', meeting_place: '학생회관 305호 개인 전화번호', scheduled_at: '2026-09-02T00:00:00Z' }],
    analytics_events: [{ event_id: 'e', user_id: 'u', user_role: 'member', occurred_at: '2026-09-02T03:00:00Z', anonymous_id: 'private-device' }],
  };
  const { data, metadata } = await loadTableDashboard({ ...env, SUPABASE_SECRET_KEY: 'sb_secret_fixture' }, period, { now, fetch: fixtureFetch(fixtures, 100, (_url, options) => {
    assert.equal(options.headers.apikey, 'sb_secret_fixture');
    assert.equal(options.headers.Authorization, undefined);
  }) });
  assert.equal(data.members.dau_trend[1].value, 1);
  assert.equal(data.members.dau_trend[0].value, null);
  assert.equal(metadata.source_counts.analytics_events, 1);
  assert.deepEqual(metadata.available_data_range, { start_date: '2026-08-01', end_date: '2026-09-02' });
  assert.deepEqual(data.engagement.trade_place_distribution, [{ meeting_place: '학생회관', trades: 1 }]);
  assert.equal(JSON.stringify({ data, metadata }).includes('305호'), false);
  assert.equal(JSON.stringify({ data, metadata }).includes('private-device'), false);
});

test('withdrawal sentinel distinguishes current accounts from signup history and labels departments', async () => {
  const users = [
    { user_id: 'a', role: 'member', department_code: 'computer_engineering', joined_at: '2026-09-01T00:00:00Z' },
    { user_id: 'b', role: 'member', department_code: 'withdrawn', joined_at: '2026-09-01T00:00:00Z' },
    { user_id: 'c', role: 'member', department_code: 'ws', joined_at: '2026-09-01T00:00:00Z' },
    { user_id: 'd', role: 'member', department_code: '기계공학과', joined_at: '2026-09-01T00:00:00Z' },
    { user_id: 'e', role: 'member', department_code: 'mechanical_engineering', joined_at: '2026-09-01T00:00:00Z' },
    { user_id: 'f', role: 'admin', department_code: 'computer_engineering', joined_at: '2026-09-01T00:00:00Z' },
  ];
  const { data } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch({ users }) });
  assert.equal(data.members.kpis.current.total_members, 4);
  assert.equal(data.members.kpis.current.new_members, 5);
  assert.deepEqual(data.members.account_status_distribution, [{ status: '가입 계정', members: 4 }, { status: '탈퇴 처리', members: 1 }]);
  const labels = data.members.department_distribution.map(row => row.department_code);
  assert.deepEqual(new Set(labels), new Set(['컴퓨터공학부', '기타/미입력', '기계공학과', '기계공학부']));
  assert.equal(data.members.cumulative_members_weekly.at(-1).members, 5);
});

test('observed account schema separates suspension and excludes every withdrawal representation', async () => {
  const joined_at = '2026-09-01T00:00:00Z';
  const created_at = joined_at;
  const users = [
    { user_id: 'active', role: 'member', account_status: 'active', department_code: 'computer_engineering', joined_at },
    { user_id: 'suspended', role: 'member', account_status: 'suspended', department_code: 'mechanical_engineering', joined_at },
    { user_id: 'withdrawn', role: 'member', account_status: 'withdrawn', department_code: 'computer_engineering', withdrawn_at: '2026-09-02T00:00:00Z', joined_at },
    { user_id: 'legacy', role: 'member', account_status: 'active', department_code: 'withdrawn', joined_at },
    { user_id: 'timestamp', role: 'member', account_status: 'active', withdrawn_at: '2026-09-02T00:00:00Z', joined_at },
    { user_id: 'unknown', role: 'member', account_status: 'unexpected', joined_at },
    { user_id: 'admin', role: 'admin', account_status: 'active', joined_at },
  ];
  const fixtures = {
    users,
    items: ['active', 'suspended', 'withdrawn', 'legacy', 'timestamp', 'admin'].map(seller_id => ({ item_id: seller_id, seller_id, sale_status: 'selling', created_at })),
    trades: ['active', 'withdrawn', 'legacy', 'timestamp', 'admin'].map(buyer_id => ({ trade_id: buyer_id, seller_id: 'suspended', buyer_id, trade_status: 'completed', created_at, completed_at: created_at })),
    favorites: users.map(({ user_id }) => ({ favorite_id: user_id, user_id, created_at })),
    messages: users.map(({ user_id }) => ({ message_id: user_id, sender_id: user_id, chat_room_id: user_id, message_type: 'text', created_at })),
    analytics_events: [
      ...users.map(({ user_id, role }) => ({ event_id: user_id, user_id, anonymous_id: `device-${user_id}`, user_role: role, platform: 'web', occurred_at: created_at })),
      { event_id: 'linked-guest', anonymous_id: 'device-withdrawn', user_role: 'guest', platform: 'web', occurred_at: created_at },
    ],
  };
  const { data, metadata } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch(fixtures, 1, () => {}, ['account_status', 'withdrawn_at']) });
  assert.deepEqual(metadata.schema.users, { account_status: true, withdrawn_at: true });
  assert.equal(data.members.kpis.current.total_members, 3);
  assert.equal(data.members.kpis.current.new_members, 6);
  assert.deepEqual(data.members.account_status_distribution, [
    { status: 'active', members: 1 }, { status: 'suspended', members: 1 },
    { status: 'unexpected', members: 1 }, { status: 'withdrawn', members: 3 },
  ]);
  assert.equal(data.supply.kpis.current.new_items, 2);
  assert.equal(data.core.kpis.current.completed_trades, 1);
  assert.equal(data.engagement.kpis.current.favorite_users, 3);
  assert.equal(data.engagement.kpis.current.active_chat_rooms, 3);
  assert.equal(data.members.dau_trend[0].value, 3);
  assert.deepEqual(data.members.platform_distribution, [{ platform: 'web', actors: 3 }]);
  assert.equal(data.core.guest_member_mix.find(row => row.actor_type === 'guest').actors, 0);
  assert.equal(JSON.stringify({ data, metadata }).includes('device-'), false);
});

test('legacy and partially migrated schemas only retry explicitly absent optional columns', async () => {
  for (const userColumns of [[], ['account_status'], ['withdrawn_at']]) {
    const queries = [];
    const users = [{ user_id: 'u', role: 'member', department_code: 'computer_engineering', joined_at: '2026-09-01T00:00:00Z', ...(userColumns.includes('account_status') ? { account_status: 'active' } : {}) }];
    const { data, metadata } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch({ users }, Infinity, url => {
      if (url.pathname.endsWith('/users')) queries.push(url.searchParams.get('select'));
    }, userColumns) });
    assert.equal(queries.length, 3 - userColumns.length);
    assert.equal(data.members.kpis.current.total_members, 1);
    assert.deepEqual(metadata.schema.users, { account_status: userColumns.includes('account_status'), withdrawn_at: userColumns.includes('withdrawn_at') });
    assert.equal(queries.at(-1).includes('account_status'), userColumns.includes('account_status'));
    assert.equal(queries.at(-1).includes('withdrawn_at'), userColumns.includes('withdrawn_at'));
  }
  for (const [status, code, message] of [[403, '42501', 'permission denied'], [400, '42703', 'column users.user_id does not exist'], [404, '42P01', 'relation users does not exist'], [400, 'PGRST100', 'invalid select']]) {
    let attempts = 0;
    const fetch = async (input, options) => {
      if (new URL(input).pathname.endsWith('/users')) {
        attempts++;
        return new Response(JSON.stringify({ code, message }), { status });
      }
      return fixtureFetch()(input, options);
    };
    await assert.rejects(loadTableDashboard(env, period, { now, fetch }), /table read failed: users/);
    assert.equal(attempts, 1);
  }
});

test('category display and observed trade/notification types remain source-backed; deleted stock is excluded', async () => {
  const created_at = '2026-09-01T00:00:00Z';
  const labels = ['교재', '전자기기', '생활', '의류', '스포츠', '기타'];
  const codes = ['books', 'digital_devices', 'daily_goods', 'fashion_accessories', 'sports_hobbies', 'other'];
  const types = ['chat_message_received', 'trade_request_received', 'review_received', 'report_received', 'report_resolved', 'keyword_match'];
  const fixtures = {
    categories: codes.map((category_code, index) => ({ category_id: category_code, category_code, category_name: labels[index], chip_label: labels[index], chip_order: index + 1 })).reverse(),
    items: [
      ...codes.map(item_id => ({ item_id, seller_id: 'u', sale_status: 'selling', created_at })),
      { item_id: 'deleted-code', seller_id: 'u', sale_status: 'deleted', created_at },
      { item_id: 'deleted-time', seller_id: 'u', sale_status: 'selling', deleted_at: created_at, created_at },
    ],
    item_categories: codes.map(code => ({ item_category_id: code, item_id: code, category_id: code, is_primary: true })),
    trades: [{ trade_id: 'request', trade_status: 'requested', created_at }],
    notifications: types.map(notification_type => ({ notification_id: notification_type, notification_type, created_at })),
  };
  const { data } = await loadTableDashboard(env, period, { now, fetch: fixtureFetch(fixtures) });
  assert.deepEqual(data.supply.selling_items_by_category, labels.map(category_name => ({ category_name, items: 1 })));
  assert.deepEqual(data.supply.item_status_snapshot, [{ status: 'selling', items: 6 }]);
  assert.equal(data.supply.kpis.current.new_items, 8);
  assert.deepEqual(new Set(data.engagement.reservation_status_weekly.map(row => row.status)), new Set(['requested']));
  assert.deepEqual(new Set(data.operations.notification_read_performance.map(row => row.notification_type)), new Set(types));
  fixtures.trades.push({ trade_id: 'rejected', trade_status: 'rejected', created_at });
  fixtures.notifications.push({ notification_id: 'trade_rejected', notification_type: 'trade_rejected', created_at });
  const legacy = await loadTableDashboard(env, period, { now, fetch: fixtureFetch(fixtures) });
  assert.equal(legacy.data.engagement.reservation_status_weekly.some(row => row.status === 'rejected'), true);
  assert.equal(legacy.data.operations.notification_read_performance.some(row => row.notification_type === "trade_rejected"), true);
});
