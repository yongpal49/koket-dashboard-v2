import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnels } from '../server/funnel-analytics.js';

const start = Date.parse('2026-09-01T00:00:00+09:00');
const DAY = 86400000;
const options = { period: [start, start + DAY], now: start + 40 * DAY };
const event = (event_name, offset, fields = {}) => ({ event_id: `${event_name}-${offset}`, event_name, occurred_at: new Date(start + offset).toISOString(), anonymous_id: 'device-a', session_id: 'session-a', user_role: 'member', user_id: 'member-a', properties: {}, ...fields });
const counts = funnel => funnel.stages.map(row => row.actors ?? row.attempts);

test('no event data stays unavailable, while an observed nonconversion is zero', () => {
  const empty = buildFunnels([], [], options);
  const observed = buildFunnels([event('start_item_registration', 0)], [], options).item_registration;
  assert.equal(empty.item_registration.status, 'no_events');
  assert.deepEqual(empty.item_registration.stages, []);
  assert.equal(empty.item_registration.mature_conversion_rate, null);
  assert.deepEqual(counts(observed), [1, 0, 0]);
  assert.equal(observed.mature_conversion_rate, 0);
});

test('signup links guest records to one member after an authenticated batch flush', () => {
  const rows = [event('login_required', 0, { user_role: 'guest', user_id: null }), event('start_sign_up', 100, { user_role: 'guest' }), event('school_verification_completed', 200), event('sign_up', 300)];
  const funnel = buildFunnels(rows.reverse(), [], options).guest_to_member;
  assert.deepEqual(counts(funnel), [1, 1, 1, 1]);
  assert.equal(funnel.status, 'ready');
  assert.equal(funnel.average_completion_seconds, 0.3);
});

test('signup never joins multiple member accounts on a shared anonymous identifier', () => {
  const rows = [event('login_required', 0, { user_role: 'guest', user_id: null }), event('start_sign_up', 100), event('school_verification_completed', 200), event('sign_up', 300, { user_id: 'member-b' })];
  const funnel = buildFunnels(rows, [], options).guest_to_member;
  assert.equal(funnel.cohort_size, 0);
  assert.equal(funnel.quality.excluded_ambiguous_starts, 1);
});

test('signup requires ordered stages and a confirmed member identity', () => {
  const rows = [event('login_required', 100, { user_role: 'guest', user_id: null }), event('school_verification_completed', 110), event('start_sign_up', 200), event('sign_up', 300)];
  const funnel = buildFunnels(rows, [], options).guest_to_member;
  assert.deepEqual(counts(funnel), [1, 1, 0, 0]);
});

test('signup accepts the 30-day boundary but excludes later completions', () => {
  const common = [event('login_required', 0, { user_role: 'guest' }), event('start_sign_up', 100), event('school_verification_completed', 200)];
  const rows = [
    ...common, event('sign_up', 30 * DAY),
    ...common.map(row => ({ ...row, event_id: `b-${row.event_id}`, user_id: 'member-b', anonymous_id: 'device-b' })),
    event('sign_up', 30 * DAY + 1, { user_id: 'member-b', anonymous_id: 'device-b' }),
  ];
  const funnel = buildFunnels(rows, [], options).guest_to_member;
  assert.deepEqual(counts(funnel), [2, 2, 2, 1]);
});

test('signup without an authenticated completion remains incomplete', () => {
  const rows = ['login_required', 'start_sign_up', 'school_verification_completed', 'sign_up'].map((name, index) => event(name, index * 100, { user_id: null, user_role: 'guest' }));
  const funnel = buildFunnels(rows, [], options).guest_to_member;
  assert.deepEqual(counts(funnel), [1, 1, 1, 0]);
});

test('listing form remounts remain one session flow across the date boundary', () => {
  const rows = [event('start_item_registration', DAY - 100), event('preview_item', DAY - 50), event('start_item_registration', DAY), event('create_item', DAY + 100)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 1]);
});

test('listing category and preview returns do not inflate the registration session count', () => {
  const rows = [event('start_item_registration', 0), event('start_item_registration', 50), event('preview_item', 100), event('start_item_registration', 150), event('preview_item', 200), event('create_item', 250)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 1]);
  assert.equal(funnel.count_unit, 'registration_sessions');
});

test('several products in one registration session remain one observed session flow', () => {
  const rows = [event('start_item_registration', 0), event('preview_item', 100), event('create_item', 200), event('start_item_registration', 300), event('preview_item', 400), event('create_item', 500)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 1]);
});

test('a registration session that began before the selected dates does not become a new cohort on remount', () => {
  const rows = [event('start_item_registration', -1), event('start_item_registration', 100), event('preview_item', 200), event('create_item', 300)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.equal(funnel.cohort_size, 0);
  assert.deepEqual(funnel.stages, []);
});

test('listing attempts cannot borrow preview or completion from another user or session', () => {
  const rows = [event('start_item_registration', 0), event('preview_item', 100, { user_id: 'member-b' }), event('create_item', 200, { session_id: 'session-b' })];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 0, 0]);
});

test('listing events include the window boundary and deduplicate IDs without inflating cohorts', () => {
  const first = event('start_item_registration', 0);
  const rows = [first, { ...first }, event('preview_item', DAY - 1), event('create_item', DAY)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 1]);
});

test('listing out-of-window completion stays incomplete and recent cohorts are provisional', () => {
  const rows = [event('start_item_registration', 0), event('preview_item', 100), event('create_item', DAY + 1)];
  const funnel = buildFunnels(rows, [], { ...options, now: start + 1000 }).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 0]);
  assert.equal(funnel.status, 'provisional');
  assert.equal(funnel.immature_cohorts, 1);
  assert.equal(funnel.mature_conversion_rate, null);
});

test('mature listing cohorts still reject completion after 24 hours', () => {
  const rows = [event('start_item_registration', 0), event('preview_item', 100), event('create_item', DAY + 1)];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 0]);
  assert.equal(funnel.status, 'ready');
  assert.equal(funnel.mature_conversion_rate, 0);
});

const view = (offset, fields = {}) => event('view_item', offset, { properties: { item_id: 'item-a' }, ...fields });
const chat = (offset, fields = {}) => event('chat_started', offset, { properties: { item_id: 'item-a', actor_role: 'buyer' }, ...fields });
const trade = (fields = {}) => ({ trade_id: 'trade-a', buyer_id: 'member-a', item_id: 'item-a', trade_status: 'completed', created_at: new Date(start + 200).toISOString(), completed_at: new Date(start + 300).toISOString(), ...fields });

test('trade joins a guest view, buyer chat and the same buyer/item business outcome', () => {
  const rows = [view(0, { user_id: null, user_role: 'guest' }), view(50), chat(100)];
  const funnel = buildFunnels(rows, [trade()], options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 1, 1, 1]);
  assert.equal(funnel.count_unit, 'buyer_item_pairs');
});

test('trade cannot borrow another buyer/item, a pre-chat trade or mismatched completion', () => {
  const records = [trade({ buyer_id: 'member-b' }), trade({ item_id: 'item-b' }), trade({ created_at: new Date(start + 50).toISOString() }), trade({ completed_at: new Date(start + 150).toISOString() })];
  const funnel = buildFunnels([view(0), chat(100)], records, options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 1, 1, 0]);
});

test('trade requires an ordered chat and includes only outcomes within seven days', () => {
  const records = [trade({ completed_at: new Date(start + 7 * DAY + 1).toISOString() })];
  const funnel = buildFunnels([chat(-100), view(0), chat(100)], records, options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 1, 1, 0]);
});

test('trade accepts exact seven-day outcomes but cannot use seller chat or another product chat', () => {
  const rows = [view(0), chat(50, { properties: { item_id: 'item-a', actor_role: 'seller' } }), chat(60, { properties: { item_id: 'item-b', actor_role: 'buyer' } }), chat(100)];
  const funnel = buildFunnels(rows, [trade({ completed_at: new Date(start + 7 * DAY).toISOString() })], options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 1, 1, 1]);
});

test('trade cannot use seller chat alone to establish the buyer path', () => {
  const rows = [view(0), chat(50, { properties: { item_id: 'item-a', actor_role: 'seller' } })];
  const funnel = buildFunnels(rows, [trade()], options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 0, 0, 0]);
});

test('returning buyers use an existing chat room without a new chat_started event', () => {
  const rows = [view(0), event('chat_room_opened', 100, { properties: { item_id: 'item-a', actor_role: 'buyer' } })];
  const funnel = buildFunnels(rows, [trade()], options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 1, 1, 1]);
  assert.equal(funnel.stages[1].stage, 'chat_engaged');
});

test('existing chat rooms cannot connect another item, seller activity or an unknown participant', () => {
  const rows = [view(0),
    event('chat_room_opened', 50, { properties: { item_id: 'item-b', actor_role: 'buyer' } }),
    event('chat_room_opened', 70, { properties: { item_id: 'item-a', actor_role: 'seller' } }),
    event('chat_room_opened', 80, { properties: { item_id: 'item-a' } }),
    event('chat_started', 90, { properties: { item_id: 'item-a' } }),
  ];
  const funnel = buildFunnels(rows, [trade()], options).trade_completion;
  assert.deepEqual(counts(funnel), [1, 0, 0, 0]);
});

test('KST cohort boundaries exclude starts before or at the exclusive end', () => {
  const rows = [event('start_item_registration', -1, { session_id: 'before' }), event('start_item_registration', 0), event('preview_item', 10), event('create_item', 20), event('start_item_registration', DAY, { session_id: 'after' })];
  const funnel = buildFunnels(rows, [], options).item_registration;
  assert.deepEqual(counts(funnel), [1, 1, 1]);
});
