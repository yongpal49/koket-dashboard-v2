const DAY = 86400000;
const text = value => typeof value === 'string' && value.trim() ? value : null;
const rate = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;
const inPeriod = (at, period) => at >= period[0] && at < period[1];
const key = (...parts) => JSON.stringify(parts);

const DEFINITIONS = {
  guest_to_member: {
    data_source: 'analytics_events',
    observation_window_days: 30, count_unit: 'anonymous_visitors', count_field: 'actors',
    definition: '선택 기간의 첫 로그인 요구부터 30일 내 가입 시작 → 학교 인증 → 가입 완료를 순서대로 확인합니다. 동일 익명 식별자에 회원이 하나만 연결된 경우에만 가입 완료로 연결합니다.',
    stage_definitions: ['login_required', 'start_sign_up', 'school_verification_completed', 'sign_up'].map(stage => ({ stage, source: 'analytics_events' })),
  },
  item_registration: {
    data_source: 'analytics_events',
    observation_window_hours: 24, count_unit: 'registration_sessions', count_field: 'attempts',
    definition: '동일 이용자·세션의 첫 등록 시작이 선택 기간에 속하는 흐름을 기준으로 24시간 내 미리보기 → 등록 완료를 순서대로 확인합니다. 화면 복귀에 따른 시작 재발행과 같은 세션의 여러 상품은 한 흐름으로 집계합니다. 사진·카테고리 입력 순서는 강제하지 않습니다.',
    stage_definitions: ['start_item_registration', 'preview_item', 'create_item'].map(stage => ({ stage, source: 'analytics_events' })),
  },
  trade_completion: {
    data_source: 'analytics_events_and_business_records',
    observation_window_days: 7, count_unit: 'buyer_item_pairs', count_field: 'attempts',
    definition: '선택 기간의 이용자·상품별 첫 조회부터 7일 내 구매자의 채팅 진입 → 거래 생성 → 완료를 순서대로 확인합니다. 채팅은 새 방 생성과 기존 방 진입을 포함합니다. 생성·완료는 동일 구매자·상품의 실제 거래와 시각을 연결하며, 완료는 같은 거래의 생성 이후여야 합니다.',
    stage_definitions: [
      { stage: 'view_item', source: 'analytics_events' }, { stage: 'chat_engaged', label: '채팅 진입', source: 'analytics_events.chat_started | analytics_events.chat_room_opened (actor_role=buyer)' },
      { stage: 'trade_created', label: '거래 요청', source: 'trades.created_at' }, { stage: 'trade_completed', label: '거래 완료', source: 'trades.completed_at' },
    ],
  },
};

function grouped(rows, getKey) {
  const result = new Map();
  for (const row of rows) {
    const rowKey = getKey(row);
    if (rowKey === null) continue;
    if (!result.has(rowKey)) result.set(rowKey, []);
    result.get(rowKey).push(row);
  }
  return result;
}

function normalizeEvents(input, now) {
  const seen = new Set();
  const events = input.flatMap(event => {
    const at = Date.parse(event.occurred_at);
    if (!Number.isFinite(at) || at > now || (event.event_id && seen.has(event.event_id))) return [];
    if (event.event_id) seen.add(event.event_id);
    return [{ ...event, at, member_id: text(event.user_id), anonymous_id: text(event.anonymous_id), properties: event.properties || {} }];
  }).sort((a, b) => a.at - b.at || String(a.event_id).localeCompare(String(b.event_id)));
  const membersByDevice = new Map();
  for (const event of events) {
    if (!event.member_id || !event.anonymous_id) continue;
    if (!membersByDevice.has(event.anonymous_id)) membersByDevice.set(event.anonymous_id, new Set());
    membersByDevice.get(event.anonymous_id).add(event.member_id);
  }
  return {
    membersByDevice,
    events: events.map(event => {
      const linkedMembers = membersByDevice.get(event.anonymous_id);
      const memberId = event.member_id || (linkedMembers?.size === 1 ? [...linkedMembers][0] : null);
      return { ...event, member_id: memberId, actor: memberId ? `member:${memberId}` : event.anonymous_id ? `guest:${event.anonymous_id}` : null };
    }),
  };
}

function followStages(start, rows, names, deadline) {
  const times = [start.at];
  for (const name of names.slice(1)) {
    const next = rows.find(event => event.event_name === name && event.at >= times.at(-1) && event.at <= deadline
      && (name !== 'sign_up' || text(event.user_id)));
    if (!next) break;
    times.push(next.at);
  }
  return { started_at: start.at, times };
}

function summarize(name, cohorts, now, hasEvents, quality = {}) {
  const definition = DEFINITIONS[name];
  const windowMs = definition.observation_window_days ? definition.observation_window_days * DAY : definition.observation_window_hours * 3600000;
  const mature = cohorts.filter(cohort => cohort.started_at + windowMs <= now);
  const stageCount = definition.stage_definitions.length;
  const completed = cohorts.filter(cohort => cohort.times.length === stageCount);
  const immature = cohorts.length - mature.length;
  return {
    ...definition, definition_version: '20261103.2', requires_all_stages: true,
    status: !hasEvents ? 'no_events' : !cohorts.length ? 'no_cohorts' : immature ? 'provisional' : 'ready',
    cohort_size: cohorts.length, mature_cohorts: mature.length, immature_cohorts: immature,
    rates_are_provisional: immature > 0,
    mature_conversion_rate: rate(mature.filter(cohort => cohort.times.length === stageCount).length, mature.length),
    average_completion_seconds: completed.length ? completed.reduce((sum, cohort) => sum + (cohort.times.at(-1) - cohort.started_at) / 1000, 0) / completed.length : null,
    quality,
    stages: cohorts.length ? definition.stage_definitions.map(({ stage }, index) => {
      const count = cohorts.filter(cohort => cohort.times.length > index).length;
      return { stage, [definition.count_field]: count, rate_from_start: rate(count, cohorts.length) };
    }) : [],
  };
}

export function buildFunnels(inputEvents, trades, { period, now }) {
  const { events, membersByDevice } = normalizeEvents(inputEvents, now);
  const signup = [];
  let ambiguousStarts = 0;
  for (const [anonymousId, rows] of grouped(events, event => event.anonymous_id)) {
    const start = rows.find(event => event.event_name === 'login_required' && inPeriod(event.at, period)
      && (event.user_role === 'guest' || (!event.user_role && !event.user_id)));
    if (!start) continue;
    if (membersByDevice.get(anonymousId)?.size > 1) { ambiguousStarts++; continue; }
    signup.push(followStages(start, rows, DEFINITIONS.guest_to_member.stage_definitions.map(row => row.stage), start.at + 30 * DAY));
  }

  const registrations = [];
  const listingNames = DEFINITIONS.item_registration.stage_definitions.map(row => row.stage);
  for (const rows of grouped(events, event => event.actor && text(event.session_id) ? key(event.actor, event.session_id) : null).values()) {
    const start = rows.find(event => event.event_name === listingNames[0]);
    if (!start || !inPeriod(start.at, period)) continue;
    registrations.push(followStages(start, rows, listingNames, start.at + DAY));
  }

  const tradeRows = grouped(trades.filter(trade => text(trade.buyer_id) && text(trade.item_id)), trade => key(trade.buyer_id, trade.item_id));
  const purchases = [];
  for (const rows of grouped(events, event => event.actor && text(event.properties.item_id) ? key(event.actor, event.properties.item_id) : null).values()) {
    const start = rows.find(event => event.event_name === 'view_item' && inPeriod(event.at, period));
    if (!start) continue;
    const deadline = Math.min(start.at + 7 * DAY, now);
    const chat = rows.find(event => ['chat_started', 'chat_room_opened'].includes(event.event_name) && event.properties.actor_role === 'buyer' && event.at >= start.at && event.at <= deadline);
    const times = [start.at];
    if (chat) {
      times.push(chat.at);
      const candidates = (tradeRows.get(key(start.member_id, start.properties.item_id)) || [])
        .map(trade => ({ ...trade, created: Date.parse(trade.created_at), completed: Date.parse(trade.completed_at) }))
        .filter(trade => trade.created >= chat.at && trade.created <= deadline);
      if (candidates.length) {
        times.push(Math.min(...candidates.map(trade => trade.created)));
        const completed = candidates.filter(trade => trade.trade_status === 'completed' && trade.completed >= trade.created && trade.completed <= deadline);
        if (completed.length) times.push(Math.min(...completed.map(trade => trade.completed)));
      }
    }
    purchases.push({ started_at: start.at, times });
  }
  return {
    guest_to_member: summarize('guest_to_member', signup, now, events.length > 0, { excluded_ambiguous_starts: ambiguousStarts }),
    item_registration: summarize('item_registration', registrations, now, events.length > 0, { excluded_unlinked_starts: events.filter(event => event.event_name === listingNames[0] && inPeriod(event.at, period) && (!event.actor || !text(event.session_id))).length }),
    trade_completion: summarize('trade_completion', purchases, now, events.length > 0, { excluded_unlinked_starts: events.filter(event => event.event_name === 'view_item' && inPeriod(event.at, period) && (!event.actor || !text(event.properties.item_id))).length }),
  };
}
