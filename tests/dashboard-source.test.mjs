import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboardData } from '../server/dashboard-source.js';

test('core-rpc supplies DB core, preserves other tabs and fails closed on RPC error', async t => {
  const env = { DASHBOARD_DATA_SOURCE: 'core-rpc', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SECRET_KEY: 'sb_secret_fixture' };
  const body = { startDate: '2026-09-03', endDate: '2026-09-09' };
  let failRpc = false;
  const core = { kpis: { current: { completed_trades: 7 }, previous: { completed_trades: 2 } }, completed_trades_daily: [], weekly_conversion_trend: [], guest_member_mix: [], login_required_conversion_by_feature: [], metadata: { event_count: 0, notes: ['SQL definition'] } };
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.pathname.includes('/rpc/')) {
      assert.equal(url.pathname, '/rest/v1/rpc/get_dashboard_core');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
      assert.equal(options.headers.authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), { p_start_date: body.startDate, p_end_date: body.endDate });
      return new Response(JSON.stringify(failRpc ? { code: 'PGRST202', message: 'private upstream detail' } : core), { status: failRpc ? 404 : 200 });
    }
    assert.equal(options.method, 'GET');
    return new Response('[]', { headers: { 'content-range': '*/0' } });
  });
  const result = await loadDashboardData(env, body);
  assert.deepEqual(result.data.core, core);
  assert.equal(result.data.supply.kpis.current.new_items, 0);
  assert.equal(result.metadata.source, 'core-rpc');
  assert.equal(result.metadata.section_sources.core, 'get_dashboard_core');
  assert.equal(result.metadata.notes.includes('SQL definition'), true);
  failRpc = true;
  await assert.rejects(loadDashboardData(env, body), error => error.status === 502 && error.message.includes('PGRST202') && !error.message.includes('private upstream detail'));
});
