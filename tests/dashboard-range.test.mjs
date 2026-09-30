import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDashboard } from '../src/data/dashboardService.js';
import { rangeError, recentRange } from '../src/utils/dateRange.js';

test('default covers stored history; presets/custom use exact dates; failures stay explicit', async t => {
  const requests = [];
  let firstDate = '2026-05-11';
  let status = 200;
  let failFull = false;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const dates = JSON.parse(options.body);
    requests.push(dates);
    if (status === 401) return new Response('{}', { status });
    if (failFull && dates.startDate === firstDate) return new Response('{"error":"full range failed"}', { status: 502 });
    return Response.json({
      data: Object.fromEntries(['core', 'members', 'supply', 'engagement', 'funnels', 'operations'].map(key => [key, { observed: dates.startDate }])),
      metadata: { available_data_range: { start_date: firstDate } },
    });
  });
  const full = await loadDashboard();
  assert.equal(full.mode, 'live');
  assert.equal(full.period.start_date, firstDate);
  assert.equal(full.period.end_date, recentRange().endDate);
  assert.equal(full.data.supply.observed, firstDate);
  assert.equal(requests.length, 2);

  requests.length = 0;
  const custom = await loadDashboard('2026-08-01', '2026-08-31');
  assert.deepEqual(custom.period, { start_date: '2026-08-01', end_date: '2026-08-31', timezone: 'Asia/Seoul' });
  assert.equal(requests.length, 1);

  requests.length = 0;
  failFull = true;
  const failed = await loadDashboard();
  assert.equal(failed.mode, 'error');
  assert.equal(failed.data, null);
  assert.equal(failed.warning, 'full range failed');
  assert.equal(requests.length, 2);

  requests.length = 0;
  status = 401;
  assert.deepEqual(await loadDashboard(), { unauthorized: true });
  assert.equal(requests.length, 1);

  requests.length = 0;
  status = 200;
  failFull = false;
  firstDate = null;
  assert.equal((await loadDashboard()).mode, 'live');
  assert.equal(requests.length, 1);

  const midnight = Date.parse('2026-01-01T00:30:00+09:00');
  assert.deepEqual(recentRange(7, midnight), { startDate: '2025-12-26', endDate: '2026-01-01' });
  assert.deepEqual(recentRange(30, midnight), { startDate: '2025-12-03', endDate: '2026-01-01' });
  assert.notEqual(rangeError({ startDate: '', endDate: '2026-09-10' }), '');
  assert.notEqual(rangeError({ startDate: '2026-09-10', endDate: '2026-09-01' }), '');
  assert.equal(rangeError({ startDate: '2024-01-01', endDate: '2024-12-31' }), '');
  assert.notEqual(rangeError({ startDate: '2024-01-01', endDate: '2025-01-01' }), '');
});
