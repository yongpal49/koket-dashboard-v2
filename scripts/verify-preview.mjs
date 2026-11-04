// Isolated, loopback-only UI/API check with synthetic records. No production keys.
import { createServer as createHttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { NOTIFICATION_LABELS } from '../shared/dashboard-labels.js';

const at = new Date(Date.now() - 60000).toISOString();
const stepAt = seconds => new Date(Date.parse(at) + seconds * 1000).toISOString();
const tables = {
  users: [
    { user_id: 'member', role: 'member', joined_at: at, account_status: 'active', dormitory_code: '202', dormitory_public: false, department_code: 'computer_engineering' },
    { user_id: 'pending', role: 'member', joined_at: at, account_status: 'withdrawal_pending', dormitory_code: 'off_campus', dormitory_public: false },
    { user_id: 'withdrawn', role: 'member', joined_at: at, account_status: 'withdrawn' },
  ],
  items: [
    { item_id: 'one', seller_id: 'member', sale_status: 'selling', visibility_status: 'visible', created_at: at, view_count: 12, dormitory_code: null },
    { item_id: 'two', seller_id: 'member', sale_status: 'selling', visibility_status: 'hidden', created_at: at, view_count: 8, dormitory_code: '101' },
  ],
  categories: [{ category_id: 'books', chip_label: '교재', category_name: '교재/도서', chip_order: 1 }],
  item_categories: [{ item_category_id: 'link', item_id: 'one', category_id: 'books', is_primary: true }],
  notifications: Object.keys(NOTIFICATION_LABELS).map((notification_type, i) => ({ notification_id: `notification-${i}`, notification_type, created_at: at, read_at: i % 2 ? null : at })),
  reports: ['item', 'chat', 'user', 'review'].map((report_type, i) => ({ report_id: `report-${i}`, report_type, report_status: ['received', 'reviewing', 'resolved', 'closed'][i], created_at: at })),
  analytics_events: [{ event_id: 'event', event_name: 'new_behavior', user_id: 'member', anonymous_id: 'fixture-device', user_role: 'member', occurred_at: at, platform: 'web', app_version: 'test' }],
  trades: [
    { trade_id: 'reviewed', buyer_id: 'member', seller_id: 'pending', item_id: 'one', trade_status: 'completed', created_at: at, completed_at: stepAt(20) },
    { trade_id: 'completed', buyer_id: 'member', seller_id: 'pending', item_id: 'two', trade_status: 'completed', created_at: at, completed_at: stepAt(20) },
    { trade_id: 'reserved', buyer_id: 'member', seller_id: 'pending', item_id: 'one', trade_status: 'reserved', created_at: at },
    { trade_id: 'cancelled', buyer_id: 'member', seller_id: 'pending', item_id: 'two', trade_status: 'cancelled', created_at: at },
  ],
  trade_status_history: ['reviewed', 'completed', 'reserved'].map(trade_id => ({ trade_status_history_id: `history-${trade_id}`, trade_id, to_status: 'reserved', created_at: stepAt(10) })),
  reviews: [{ review_id: 'review', trade_id: 'reviewed', created_at: stepAt(30) }],
};
if (process.argv.includes('--with-member-trends')) {
  for (let day = 1; day <= 35; day++) {
    const count = day % 6 === 0 ? 0 : (day % 4) + 1;
    for (let index = 0; index < count; index++) tables.users.push({
      user_id: `signup-${day}-${index}`, role: 'member',
      joined_at: new Date(Date.parse(at) - day * 86400000).toISOString(),
      account_status: 'active', department_code: 'computer_engineering',
    });
  }
}
if (process.argv.includes('--with-funnel-events')) {
  tables.analytics_events.push(...['start_item_registration', 'preview_item', 'create_item'].map((event_name, i) => ({ event_id: `listing-${i}`, event_name, user_id: 'member', anonymous_id: 'fixture-device', session_id: 'fixture-session', user_role: 'member', occurred_at: stepAt(i * 10), properties: {}, platform: 'web', app_version: 'test' })));
}
const database = createHttpServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const table = url.pathname.split('/').at(-1);
  res.setHeader('content-type', 'application/json');
  if (table === 'users' && url.searchParams.get('select')?.split(',').includes('withdrawn_at')) {
    res.writeHead(400); return res.end(JSON.stringify({ code: '42703', message: 'column users.withdrawn_at does not exist' }));
  }
  const all = tables[table] || [];
  const offset = Number(url.searchParams.get('offset') || 0);
  const limit = Number(url.searchParams.get('limit') || 1000);
  res.setHeader('content-range', `${offset}-${Math.max(offset, all.length - 1)}/${all.length}`);
  res.end(JSON.stringify(all.slice(offset, offset + limit)));
});
await new Promise(resolve => database.listen(0, '127.0.0.1', resolve));
Object.assign(process.env, {
  DASHBOARD_API_PROXY: '', DASHBOARD_DATA_SOURCE: 'tables',
  SUPABASE_URL: `http://127.0.0.1:${database.address().port}`, SUPABASE_SECRET_KEY: 'fixture-only',
  DASHBOARD_PASSWORD: 'fixture-only-password', DASHBOARD_SESSION_SECRET: randomBytes(32).toString('hex'),
});
const vite = await createServer({ server: { host: '127.0.0.1', port: 5178, strictPort: true }, plugins: [{
  name: 'synthetic-verification-banner', transformIndexHtml: html => html.replace('<body>', '<body><div style="padding:12px;background:#fff1c2;text-align:center;font:14px sans-serif">합성 데이터로 표시·집계를 검증하는 임시 화면입니다.</div>'),
}] });
await vite.listen();
console.log('Synthetic preview: http://127.0.0.1:5178 · password: fixture-only-password');
async function close() { await vite.close(); database.close(); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
