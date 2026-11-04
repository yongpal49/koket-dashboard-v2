import test from 'node:test';
import assert from 'node:assert/strict';
import { funnelDuration, funnelStatus, stageGap } from '../src/utils/funnels.js';

test('zero denominator and absent durations remain unavailable', () => {
  assert.equal(stageGap({ attempts: 0 }, { attempts: 0 }), null);
  assert.equal(stageGap({ attempts: 5 }, { attempts: 2 }), 60);
  assert.equal(funnelDuration(null), '완료 기록 없음');
  assert.equal(funnelDuration(0), '0초');
});

test('business snapshot and immature click cohorts are visibly distinct', () => {
  assert.match(funnelStatus({ data_source: 'business_records' }), /거래 기록 기준/);
  assert.match(funnelStatus({ data_source: 'business_records', status: 'no_cohorts' }), /거래 요청 기록 없음/);
  assert.match(funnelStatus({ status: 'no_events' }), /수집 기록 없음/);
  assert.match(funnelStatus({ rates_are_provisional: true, immature_cohorts: 3 }), /관찰 중 3건.*잠정값/);
});
