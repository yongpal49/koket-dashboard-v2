import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMetric, metricChange, formatAxisDate, normalizeRetentionWeeks, metricShare } from '../src/utils/metrics.js';
test('numeric labels distinguish missing, zero, percentage points and count growth', () => {
  for (const value of [null, undefined, '', NaN, Infinity]) assert.equal(formatMetric(value, '%'), '–');
  assert.equal(formatMetric(0, '건'), '0건');
  assert.equal(formatMetric(12345.678, '명'), '12,345.68명');
  assert.deepEqual(metricChange(null, 1), { text: '비교 불가', tone: 'neutral' });
  assert.deepEqual(metricChange(0, 0), { text: '변동 없음', tone: 'neutral' });
  assert.deepEqual(metricChange(3, 0, true), { text: '+3.0%p', tone: 'up' });
  assert.equal(metricChange(3, 0).tone, 'neutral');
  assert.equal(metricChange(2, 4, false, true).tone, 'up');
  assert.equal(metricChange(2.001, 2).text, '변동 없음');
  assert.equal(formatAxisDate('2026-09-09'), '9/9');
});

test('retention nulls and zero-denominator shares stay unavailable', () => {
  assert.deepEqual(normalizeRetentionWeeks([null, 42, null]), [null, 42, null]);
  assert.deepEqual(normalizeRetentionWeeks([null, { retention_rate: 42 }]), [100, null, 42]);
  assert.deepEqual(normalizeRetentionWeeks(null), []);
  assert.equal(formatMetric(metricShare(0, 0), '%'), '–');
  assert.equal(formatMetric(metricShare(11, 12), '%'), '91.67%');
});
