import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTableDashboard } from '../server/table-dashboard.js';
import { NOTIFICATION_LABELS, ACCOUNT_STATUS_LABELS, displayLabel, dormitoryLabel } from '../shared/dashboard-labels.js';

const period = { startDate: '2026-09-01', endDate: '2026-09-07' };
const created_at = '2026-09-02T00:00:00Z';
const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'fixture-only' };
async function aggregate(tables) {
  return loadTableDashboard(env, period, { now: Date.parse('2026-09-28T00:00:00Z'), fetch: async input => {
    const url = new URL(input);
    const name = url.pathname.split('/').at(-1);
    // Today's live schema has account_status, but no withdrawn_at column.
    if (name === 'users' && url.searchParams.get('select').split(',').includes('withdrawn_at')) {
      return new Response(JSON.stringify({ code: '42703', message: 'column users.withdrawn_at does not exist' }), { status: 400 });
    }
    const rows = tables[name] || [];
    return new Response(JSON.stringify(rows), { headers: { 'content-range': `0-${rows.length - 1}/${rows.length}` } });
  } });
}

test('pending withdrawal stays a distinct remaining account; future labels are not lost', async () => {
  const users = ['active', 'withdrawal_pending', 'withdrawn', 'new_status'].map((account_status, i) => ({ user_id: `u${i}`, role: 'member', joined_at: created_at, account_status }));
  const { data, metadata } = await aggregate({ users });
  assert.equal(data.members.kpis.current.total_members, 3);
  assert.equal(data.members.kpis.current.new_members, 4);
  assert.deepEqual(Object.fromEntries(data.members.account_status_distribution.map(row => [row.status, row.members])), { active: 1, new_status: 1, withdrawal_pending: 1, withdrawn: 1 });
  assert.equal(metadata.schema.users.withdrawn_at, false);
  assert.equal(displayLabel(ACCOUNT_STATUS_LABELS, 'withdrawal_pending'), '탈퇴 처리 중');
  assert.equal(displayLabel(ACCOUNT_STATUS_LABELS, 'new_status'), 'new_status');
});

test('current dormitory and lifetime views do not infer private profiles or include deleted/admin inventory', async () => {
  const users = [
    { user_id: 'u', role: 'member', account_status: 'active', joined_at: created_at, dormitory_code: '202', dormitory_public: false },
    { user_id: 'a', role: 'admin', dormitory_code: '101', dormitory_public: true },
    { user_id: 'w', role: 'member', account_status: 'withdrawn', dormitory_code: '102' },
  ];
  const base = { seller_id: 'u', sale_status: 'selling', created_at: '2026-08-01T00:00:00Z', visibility_status: 'visible' };
  const items = [
    { ...base, item_id: 'private-item', view_count: 12, dormitory_code: null },
    { ...base, item_id: 'public-item', view_count: '8', dormitory_code: '101', visibility_status: 'hidden' },
    { ...base, item_id: 'deleted', view_count: 999, deleted_at: created_at },
    { ...base, item_id: 'admin', seller_id: 'a', view_count: 999 },
    { ...base, item_id: 'withdrawn', seller_id: 'w', view_count: 999 },
  ];
  const { data } = await aggregate({ users, items, categories: [{ category_id: 'new-category', chip_label: '새 카테고리', chip_order: 1 }], item_categories: [{ item_category_id: 'link', item_id: 'public-item', category_id: 'new-category', is_primary: true }] });
  assert.deepEqual(data.members.dormitory_distribution, [{ dormitory_code: '202', members: 1 }]);
  assert.deepEqual(data.members.dormitory_public_distribution, [{ visibility: 'private', members: 1 }]);
  assert.deepEqual(data.supply.item_dormitory_distribution, [{ dormitory_code: '', items: 1 }, { dormitory_code: '101', items: 1 }]);
  assert.equal(JSON.stringify(data.supply.item_dormitory_distribution).includes('202'), false);
  assert.deepEqual(data.supply.view_count_snapshot, { total_views: 20, items: 2, items_with_counts: 2 });
  assert.equal(data.supply.kpis.current.new_items, 0); // Lifetime snapshot survives an unrelated selected period.
  assert.equal(data.supply.views_by_category.find(row => row.category_name === '새 카테고리').views, 8);
  assert.equal(dormitoryLabel('off_campus'), '생활관 미거주');
  assert.equal(dormitoryLabel('other'), '그 외 생활관');
  assert.equal(dormitoryLabel(null, true), '비공개/미설정');
  const missing = await aggregate({ users, items: [{ ...base, item_id: 'unavailable' }] });
  assert.equal(missing.data.supply.view_count_snapshot.total_views, null);
});

test('all fourteen notification types, new event labels and report types retain their counts', async () => {
  const names = [...Object.keys(NOTIFICATION_LABELS), 'future_notification'];
  const notifications = names.map((notification_type, i) => ({ notification_id: `n${i}`, notification_type, created_at, read_at: i % 2 ? null : created_at }));
  notifications.push({ notification_id: 'outside', notification_type: names[0], created_at: '2026-08-01T00:00:00Z' });
  const reports = ['item', 'chat', 'user', 'review'].map((report_type, i) => ({ report_id: `r${i}`, report_type, report_status: ['received', 'reviewing', 'resolved', 'closed'][i], created_at }));
  const analytics_events = [
    { event_id: 'e1', event_name: 'future_event', anonymous_id: 'device', user_role: 'guest', occurred_at: created_at },
    { event_id: 'e2', event_name: 'future_event', anonymous_id: 'admin-device', user_role: 'admin', occurred_at: created_at },
  ];
  const { data } = await aggregate({ notifications, reports, analytics_events });
  assert.equal(Object.keys(NOTIFICATION_LABELS).length, 14);
  assert.equal(data.operations.notification_read_performance.length, 15);
  assert.equal(data.operations.notification_read_performance.reduce((sum, row) => sum + row.notifications, 0), 15);
  assert.equal(data.operations.notification_read_performance.find(row => row.notification_type === names[0]).read_rate, 100);
  assert.equal(data.operations.reports.current_backlog, 2);
  assert.equal(data.operations.report_type_distribution.length, 4);
  assert.deepEqual(data.funnels.event_distribution, [{ event_name: 'future_event', events: 1 }]);
  assert.equal(data.funnels.trade_completion.status, 'no_cohorts');
});
