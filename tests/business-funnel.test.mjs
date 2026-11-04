import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBusinessFunnel } from '../server/business-funnel.js';

const start = Date.parse('2026-09-01T00:00:00+09:00');
const day = 86400000;
const iso = offset => new Date(start + offset).toISOString();
const options = { period: [start, start + day], now: start + 40 * day };
const trade = (id, offset = 0, fields = {}) => ({ trade_id: id, created_at: iso(offset), trade_status: 'requested', ...fields });
const history = (id, offset) => ({ trade_id: id, to_status: 'reserved', created_at: iso(offset) });
const review = (id, offset) => ({ trade_id: id, created_at: iso(offset) });
const counts = funnel => funnel.stages.map(row => row.attempts);

test('business funnel connects one trade through reservation, completion and review without an arbitrary time cap', () => {
  const trades = [trade('a', 0, { trade_status: 'completed', completed_at: iso(20 * day) }), trade('b', 100)];
  const funnel = buildBusinessFunnel(trades, [history('a', 10 * day)], [review('a', 25 * day), review('a', 26 * day)], options);
  assert.deepEqual(counts(funnel), [2, 1, 1, 1]);
  assert.equal(funnel.pending_cohorts, 1);
  assert.equal(funnel.stages.at(-1).rate_from_start, 50);
  assert.equal(funnel.data_source, 'business_records');
});

test('completed trade without reservation evidence is flagged rather than reconstructed', () => {
  const trades = [trade('a', 0, { trade_status: 'completed', completed_at: iso(100) })];
  const funnel = buildBusinessFunnel(trades, [history('another', 50)], [review('a', 200)], options);
  assert.deepEqual(counts(funnel), [1, 0, 0, 0]);
  assert.equal(funnel.quality.completed_without_reservation_evidence, 1);
});

test('reservation and review timestamps must follow the same trade and never be in the future', () => {
  const trades = [trade('a', 0, { trade_status: 'completed', completed_at: iso(100) })];
  const funnel = buildBusinessFunnel(trades, [history('a', -1), history('a', 50)], [review('a', 80), review('another', 110), review('a', 41 * day)], options);
  assert.deepEqual(counts(funnel), [1, 1, 1, 0]);
});

test('business cohorts use the selected KST creation dates and preserve missing-data rates', () => {
  const funnel = buildBusinessFunnel([trade('before', -1), trade('after', day)], [], [], options);
  assert.equal(funnel.cohort_size, 0);
  assert.deepEqual(funnel.stages, []);
  assert.equal(funnel.mature_conversion_rate, null);
});

test('future trade creation, late reservation and contradictory completion state are not inferred', () => {
  const trades = [trade('future', 1000), trade('late-reserved', 0, { trade_status: 'completed', completed_at: iso(100) }), trade('contradictory', 0, { trade_status: 'requested', completed_at: iso(100) })];
  const funnel = buildBusinessFunnel(trades, [history('late-reserved', 200), history('contradictory', 50)], [], { ...options, now: start + 500 });
  assert.deepEqual(counts(funnel), [2, 2, 0, 0]);
  assert.equal(funnel.quality.completed_without_reservation_evidence, 1);
});
