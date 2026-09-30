import { LABEL_CONTRACT_VERSION } from '../shared/dashboard-labels.js';

const DAY = 86400000;
const KST = 9 * 3600000;
// Canonical labels: KOKET/src/types/domain.ts DEPARTMENT_LABELS.
const DEPARTMENT_LABELS = {
  mechanical_engineering: '기계공학부',
  electrical_electronic_communication: '전기·전자·통신공학부',
  computer_engineering: '컴퓨터공학부',
  industrial_management: '산업경영학부',
  design_engineering: '디자인공학부',
};
function departmentLabel(value) {
  const code = String(value || '').trim();
  if (!code || code === 'undeclared' || code === 'withdrawn') return '기타/미입력';
  if (Object.hasOwn(DEPARTMENT_LABELS, code)) return DEPARTMENT_LABELS[code];
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(code) ? '기타/미입력' : code;
}
const TABLES = {
  users: 'user_id,role,joined_at,department_code,dormitory_code,dormitory_public',
  items: 'item_id,seller_id,sale_status,visibility_status,created_at,sold_at,deleted_at,view_count,dormitory_code',
  favorites: 'favorite_id,user_id,item_id,created_at',
  messages: 'message_id,chat_room_id,sender_id,message_type,created_at',
  trades: 'trade_id,item_id,buyer_id,seller_id,trade_status,created_at,completed_at,cancelled_at,scheduled_at,meeting_place',
  trade_status_history: 'trade_status_history_id,trade_id,to_status,created_at',
  reviews: 'review_id,trade_id,created_at',
  categories: 'category_id,category_name,chip_label,chip_order',
  item_categories: 'item_category_id,item_id,category_id,is_primary',
  reports: 'report_id,report_type,report_status,created_at,resolved_at',
  notifications: 'notification_id,notification_type,read_at,created_at',
  analytics_events: 'event_id,event_name,user_id,anonymous_id,user_role,occurred_at,platform,app_version',
};

function dateMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error('Invalid dashboard date'), { status: 400 });
  const ms = Date.parse(`${value}T00:00:00+09:00`);
  if (!Number.isFinite(ms) || new Date(ms + KST).toISOString().slice(0, 10) !== value) throw Object.assign(new Error('Invalid dashboard date'), { status: 400 });
  return ms;
}
const stamp = value => value ? Date.parse(value) : NaN;
const label = ms => new Date(ms + KST).toISOString().slice(0, 10);
const inside = (value, period) => stamp(value) >= period[0] && stamp(value) < period[1];
const rate = (n, d) => d ? Math.round(n / d * 10000) / 100 : null;
const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const unique = (rows, key) => new Set(rows.map(row => row[key]).filter(Boolean)).size;
function groups(rows, key, valueKey) {
  const counts = new Map();
  for (const row of rows) { const value = typeof key === 'function' ? key(row) : row[key]; if (value != null) counts.set(value, (counts.get(value) || 0) + 1); }
  return [...counts].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([keyValue, value]) => ({ [typeof key === 'string' ? key : 'key']: keyValue, [valueKey]: value }));
}

async function readTable(base, secret, table, columns, options, signal) {
  const rows = [];
  const seen = new Set();
  const pk = columns.split(',')[0];
  let expectedTotal;
  for (let page = 0; page < options.maxPages; page++) {
    const url = new URL(`${base}/rest/v1/${table}`);
    url.searchParams.set('select', columns);
    url.searchParams.set('order', `${pk}.asc`);
    url.searchParams.set('offset', String(rows.length));
    url.searchParams.set('limit', String(options.pageSize));
    const response = await options.fetch(url.toString(), { method: 'GET', headers: { apikey: secret, ...(secret.split('.').length === 3 ? { Authorization: `Bearer ${secret}` } : {}), Prefer: 'count=exact' }, signal });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const missingColumn = response.status === 400 && details?.code === '42703'
        ? /^column users\.(account_status|withdrawn_at) does not exist$/.exec(details.message || '')?.[1]
        : undefined;
      throw Object.assign(new Error(`Dashboard table read failed: ${table} (${response.status})`), { missingColumn });
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error(`Invalid table response: ${table}`);
    const countText = response.headers.get('content-range')?.split('/')[1];
    if (countText && /^\d+$/.test(countText)) {
      const total = Number(countText);
      if (expectedTotal !== undefined && expectedTotal !== total) throw new Error(`Table changed during pagination: ${table}`);
      expectedTotal = total;
    }
    for (const row of batch) {
      if (!row || !row[pk] || seen.has(row[pk])) throw new Error(`Unstable table pagination: ${table}`);
      seen.add(row[pk]);
      rows.push(row);
    }
    if (expectedTotal !== undefined && rows.length > expectedTotal) throw new Error(`Invalid table count: ${table}`);
    if (expectedTotal !== undefined && rows.length === expectedTotal) return rows;
    if (!batch.length) {
      if (expectedTotal !== undefined && rows.length !== expectedTotal) throw new Error(`Incomplete table read: ${table}`);
      return rows;
    }
  }
  throw new Error(`Dashboard pagination limit exceeded: ${table}`);
}

async function readUsers(base, secret, options, signal) {
  const optionalColumns = ['account_status', 'withdrawn_at'];
  // Only an explicit missing optional column permits a narrower retry.
  // Permissions, missing tables and pagination failures remain fatal.
  while (true) {
    try {
      const rows = await readTable(base, secret, 'users', [TABLES.users, ...optionalColumns].join(','), options, signal);
      return { rows, accountStatus: optionalColumns.includes('account_status'), withdrawnAt: optionalColumns.includes('withdrawn_at') };
    } catch (error) {
      const index = optionalColumns.indexOf(error.missingColumn);
      if (index < 0) throw error;
      optionalColumns.splice(index, 1);
    }
  }
}

const isWithdrawn = row => row.account_status === 'withdrawn' || row.department_code === 'withdrawn' || Number.isFinite(stamp(row.withdrawn_at));

export async function loadTableDashboard(env, body, options = {}) {
  const start = dateMs(body?.startDate ?? body?.start_date ?? body?.p_start_date);
  const last = dateMs(body?.endDate ?? body?.end_date ?? body?.p_end_date);
  const end = last + DAY;
  if (start > last || end - start > 366 * DAY) throw Object.assign(new Error('Dashboard date range must be 1–366 days'), { status: 400 });
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
  if (!base || !secret) throw new Error('Supabase server configuration missing');
  const settings = { fetch: globalThis.fetch, pageSize: 1000, maxPages: 10000, timeoutMs: 30000, now: Date.now(), ...options };
  if (!Number.isInteger(settings.pageSize) || settings.pageSize < 1 || !Number.isInteger(settings.maxPages) || settings.maxPages < 1 || !(settings.timeoutMs > 0)) throw new Error('Invalid read options');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  let tables;
  let userSchema;
  try {
    tables = Object.fromEntries(await Promise.all(Object.entries(TABLES).map(async ([table, columns]) => {
      if (table === 'users') {
        userSchema = await readUsers(base, secret, settings, controller.signal);
        return [table, userSchema.rows];
      }
      return [table, await readTable(base, secret, table, columns, settings, controller.signal)];
    })));
  } catch (error) { controller.abort(); throw error; } finally { clearTimeout(timer); }
  const current = [start, end];
  const previous = [start - (end - start), start];
  const now = Number(settings.now);
  const today = Math.floor((Math.min(end, now) + KST) / DAY) * DAY - KST;
  const weekday = new Date(today + KST).getUTCDay() || 7;
  const monday = today - (weekday - 1) * DAY;
  const weeks = Array.from({ length: 7 }, (_, i) => [monday - (7 - i) * 7 * DAY, monday - (6 - i) * 7 * DAY]);
  const registeredUsers = tables.users.filter(row => row.role !== 'admin');
  const withdrawnUsers = registeredUsers.filter(isWithdrawn);
  const users = registeredUsers.filter(row => !isWithdrawn(row));
  const memberIds = new Set(users.map(row => row.user_id));
  const excludedUsers = new Set(tables.users.filter(row => row.role === 'admin' || isWithdrawn(row)).map(row => row.user_id));
  const excludedDevices = new Set(tables.analytics_events.filter(row => row.user_role === 'admin' || excludedUsers.has(row.user_id)).map(row => row.anonymous_id).filter(Boolean));
  const items = tables.items.filter(row => !excludedUsers.has(row.seller_id));
  const trades = tables.trades.filter(row => !excludedUsers.has(row.seller_id) && !excludedUsers.has(row.buyer_id));
  const favorites = tables.favorites.filter(row => !excludedUsers.has(row.user_id));
  const messages = tables.messages.filter(row => row.message_type === 'text' && !excludedUsers.has(row.sender_id));
  const events = tables.analytics_events.filter(row => row.user_role !== 'admin' && !excludedUsers.has(row.user_id) && !excludedDevices.has(row.anonymous_id) && stamp(row.occurred_at) <= now);
  const accountStatuses = userSchema.accountStatus
    ? groups(registeredUsers, row => isWithdrawn(row) ? 'withdrawn' : row.account_status || 'unknown', 'members').map(({ key, members }) => ({ status: key, members }))
    : [{ status: '가입 계정', members: users.length }, { status: '탈퇴 처리', members: withdrawnUsers.length }];
  const eventTimes = events.map(row => stamp(row.occurred_at)).filter(Number.isFinite);
  const eventMin = eventTimes.length ? eventTimes.reduce((a, b) => Math.min(a, b), Infinity) : null;
  const eventMax = eventTimes.length ? eventTimes.reduce((a, b) => Math.max(a, b), -Infinity) : null;
  const covered = period => eventMin !== null && Math.floor((eventMin + KST) / DAY) * DAY - KST <= period[0] && Math.floor((eventMax + KST) / DAY) * DAY - KST + DAY >= period[1];
  const active = period => unique(events.filter(row => memberIds.has(row.user_id) && inside(row.occurred_at, period)), 'user_id');
  const completed = period => trades.filter(row => row.trade_status === 'completed' && inside(row.completed_at, period));
  const created = (rows, period) => rows.filter(row => inside(row.created_at, period));
  const itemMap = new Map(items.map(row => [row.item_id, row]));
  const categoryOrder = new Map(tables.categories.map(row => [row.chip_label || row.category_name, row.chip_order ?? 999]));
  const sortCategories = rows => rows.sort((a, b) => (categoryOrder.get(a.category_name) ?? 999) - (categoryOrder.get(b.category_name) ?? 999) || a.category_name.localeCompare(b.category_name));
  const categoryMap = new Map(tables.categories.map(row => [row.category_id, row.chip_label || row.category_name]));
  const primaryCategories = new Map(tables.item_categories.filter(row => row.is_primary).map(row => [row.item_id, categoryMap.get(row.category_id)]));
  const byCategory = (rows, metric) => sortCategories(groups(rows, row => primaryCategories.get(row.item_id) || '미분류', metric).map(({ key, ...rest }) => ({ category_name: key, ...rest })));
  const saleDays = period => completed(period).map(row => (stamp(row.completed_at) - stamp(itemMap.get(row.item_id)?.created_at)) / DAY).filter(value => Number.isFinite(value) && value >= 0);
  const coreKpi = period => ({ completed_trades: completed(period).length, trade_conversion_rate: null, sale_success_rate: null, guest_conversion_rate: null, registration_completion_rate: null });
  const memberKpi = period => ({ new_guests: null, new_members: registeredUsers.filter(row => inside(row.joined_at, period)).length, total_members: users.filter(row => stamp(row.joined_at) < period[1]).length, active_member_rate: covered(period) ? rate(active(period), users.filter(row => stamp(row.joined_at) < period[1]).length) : null, week_4_retention_rate: null });
  const supplyKpi = period => { const rows = created(items, period); const sellers = unique(rows, 'seller_id'); return { new_items: rows.length, unique_sellers: sellers, average_items_per_seller: sellers ? rows.length / sellers : null, completed_sales: completed(period).length, average_days_to_sell: average(saleDays(period)) }; };
  const engagementKpi = period => {
    const done = completed(period);
    const mature = done.filter(row => stamp(row.completed_at) + 7 * DAY <= now);
    const reviewed = mature.filter(trade => tables.reviews.some(review => review.trade_id === trade.trade_id && stamp(review.created_at) >= stamp(trade.completed_at) && stamp(review.created_at) < stamp(trade.completed_at) + 7 * DAY));
    return { favorite_users: unique(created(favorites, period), 'user_id'), active_chat_rooms: unique(created(messages, period), 'chat_room_id'), reservations: created(trades, period).length, completed_trades: done.length, review_rate: mature.length === done.length ? rate(reviewed.length, done.length) : null };
  };
  const kpis = fn => ({ current: fn(current), previous: fn(previous) });
  const days = Array.from({ length: (end - start) / DAY }, (_, i) => [start + i * DAY, start + (i + 1) * DAY]);
  const currentEvents = events.filter(row => inside(row.occurred_at, current));
  const actor = row => row.user_id ? `m:${row.user_id}` : `g:${row.anonymous_id}`;
  const actorDistribution = keys => {
    const map = new Map();
    for (const row of currentEvents) { if (keys.some(key => !row[key])) continue; const key = JSON.stringify(keys.map(key => row[key])); if (!map.has(key)) map.set(key, new Set()); map.get(key).add(actor(row)); }
    return [...map].map(([key, actors]) => ({ ...Object.fromEntries(keys.map((name, i) => [name, JSON.parse(key)[i]])), actors: actors.size }));
  };
  const snapshot = items.filter(row => !row.deleted_at && row.sale_status !== 'deleted');
  const unsold = snapshot.filter(row => row.sale_status === 'selling');
  const ageBucket = days => days <= 7 ? '0–7일' : days <= 14 ? '8–14일' : days <= 29 ? '15–29일' : '30일 이상';
  const unsoldAges = unsold.map(row => ({ ...row, bucket: ageBucket(Math.max(0, (now - stamp(row.created_at)) / DAY)) }));
  const sellerCounts = groups(created(items, current), 'seller_id', 'items');
  const done = completed(current);
  const schedule = done.filter(row => Number.isFinite(stamp(row.scheduled_at))).map(row => ({ hour: new Date(stamp(row.scheduled_at) + KST).getUTCHours(), iso_weekday: new Date(stamp(row.scheduled_at) + KST).getUTCDay() || 7 }));
  const received = created(tables.reports, current);
  const resolutions = tables.reports.filter(row => inside(row.resolved_at, current)).map(row => (stamp(row.resolved_at) - stamp(row.created_at)) / 3600000).filter(value => value >= 0).sort((a, b) => a - b);
  const quantile = p => { if (!resolutions.length) return null; const index = (resolutions.length - 1) * p; const low = Math.floor(index); return resolutions[low] + (resolutions[Math.ceil(index)] - resolutions[low]) * (index - low); };
  const reservedIds = new Set(tables.trade_status_history.filter(row => row.to_status === 'reserved' && inside(row.created_at, current)).map(row => row.trade_id));
  const reserved = trades.filter(row => reservedIds.has(row.trade_id));
  const fulfilled = reserved.filter(row => row.trade_status === 'completed').length;
  const cancelled = reserved.filter(row => row.trade_status === 'cancelled').length;
  const notificationRows = created(tables.notifications, current);
  const data = {
    core: { kpis: kpis(coreKpi), completed_trades_daily: days.map(period => ({ date: label(period[0]), value: completed(period).length })), weekly_conversion_trend: [], guest_member_mix: currentEvents.length ? [{ actor_type: 'guest', actors: new Set(currentEvents.filter(row => !row.user_id && row.user_role === 'guest').map(actor)).size }, { actor_type: 'member', actors: unique(currentEvents.filter(row => memberIds.has(row.user_id)), 'user_id') }] : [], login_required_conversion_by_feature: [] },
    members: { kpis: kpis(memberKpi), dau_trend: days.map(period => ({ date: label(period[0]), value: active(period) || (covered(period) ? 0 : null) })), wau_trend: weeks.map(period => ({ week_start: label(period[0]), value: active(period) || (covered(period) ? 0 : null) })), mau_trend: [], department_distribution: groups(users.filter(row => stamp(row.joined_at) < end).map(row => ({ department_code: departmentLabel(row.department_code) })), 'department_code', 'members'), account_status_distribution: accountStatuses, cumulative_members_weekly: weeks.map(period => ({ week_start: label(period[0]), members: registeredUsers.filter(row => stamp(row.joined_at) < period[1]).length })), withdrawals_weekly: [], retention_cohorts: [], activity_status_distribution: [], dormant_period_distribution: [], reactivation: { dormant_members_at_start: null, reactivated_members: null, reactivation_rate: null }, platform_distribution: actorDistribution(['platform']), app_version_distribution: actorDistribution(['platform', 'app_version']) },
    supply: { kpis: kpis(supplyKpi), new_items_and_sellers_weekly: weeks.map(period => ({ week_start: label(period[0]), new_items: created(items, period).length, unique_sellers: unique(created(items, period), 'seller_id') })), item_status_snapshot: groups(snapshot.map(row => ({ status: row.visibility_status === 'hidden' ? 'hidden' : row.sale_status })), 'status', 'items'), selling_items_by_category: byCategory(unsold, 'items'), items_per_seller_distribution: groups(sellerCounts.map(row => ({ bucket: row.items >= 6 ? '6개 이상' : `${row.items}개` })), 'bucket', 'sellers'), unsold_item_age_distribution: groups(unsoldAges, 'bucket', 'items'), unsold_item_age_by_category: groups(unsoldAges, row => JSON.stringify([primaryCategories.get(row.item_id) || '미분류', row.bucket]), 'items').map(row => ({ category_name: JSON.parse(row.key)[0], bucket: JSON.parse(row.key)[1], items: row.items })), sale_duration_distribution: groups(saleDays(current).map(days => ({ bucket: ageBucket(days) })), 'bucket', 'items') },
    engagement: { kpis: kpis(engagementKpi), weekly_trends: weeks.map(period => ({ week_start: label(period[0]), ...engagementKpi(period), favorite_items: unique(created(favorites, period), 'item_id'), messages: created(messages, period).length })), completed_trades_by_category: byCategory(done, 'trades'), favorites_by_category: byCategory(created(favorites, current), 'favorites'), reservation_status_weekly: weeks.slice(-5).flatMap(period => groups(created(trades, period), 'trade_status', 'trades').map(({ trade_status, ...row }) => ({ week_start: label(period[0]), status: trade_status, ...row }))), trade_place_distribution: groups(done.map(row => ({ meeting_place: ['학생회관', '공학관', '도서관', '복지관', '기숙사', '인문사회관', '컨버전스홀'].find(place => String(row.meeting_place || '').includes(place)) || '기타' })), 'meeting_place', 'trades'), trade_time_of_day_distribution: groups(schedule.map(row => ({ time_bucket: row.hour < 6 ? '00_05' : row.hour < 12 ? '06_11' : row.hour < 18 ? '12_17' : '18_23' })), 'time_bucket', 'trades'), trade_hour_distribution: groups(schedule, 'hour', 'trades').sort((a, b) => a.hour - b.hour), trade_weekday_distribution: groups(schedule, 'iso_weekday', 'trades') },
    funnels: { guest_to_member: { observation_window_days: 30, stages: [] }, item_registration: { observation_window_hours: 24, stages: [] }, trade_completion: { observation_window_days: 7, stages: [] } },
    operations: { reservation_fulfillment: { reserved_trades: reserved.length, completed_trades: fulfilled, fulfillment_rate: rate(fulfilled, reserved.length), cancelled_or_verified_no_show_trades: cancelled, cancel_or_no_show_rate: rate(cancelled, reserved.length) }, reports: { received_in_period: received.length, current_backlog: tables.reports.filter(row => ['received', 'reviewing'].includes(row.report_status)).length, resolution_sla: { resolved_reports: resolutions.length, median_hours: quantile(0.5), p90_hours: quantile(0.9) } }, notification_read_performance: groups(notificationRows, 'notification_type', 'notifications').map(row => ({ ...row, read_rate: rate(notificationRows.filter(n => n.notification_type === row.notification_type && n.read_at).length, row.notifications) })) },
  };
  // Current snapshots: date filters cannot reconstruct earlier profile settings
  // or lifetime view_count values. Item dormitories never use seller profiles.
  data.members.dormitory_distribution = groups(users, row => row.dormitory_code || '', 'members')
    .map(({ key, members }) => ({ dormitory_code: key, members }));
  data.members.dormitory_public_distribution = groups(users, row => row.dormitory_public === true ? 'public' : 'private', 'members')
    .map(({ key, members }) => ({ visibility: key, members }));
  data.supply.item_dormitory_distribution = groups(snapshot, row => row.dormitory_code || '', 'items')
    .map(({ key, items }) => ({ dormitory_code: key, items }));
  const validViews = row => row.view_count != null && Number.isSafeInteger(Number(row.view_count)) && Number(row.view_count) >= 0;
  const countedItems = snapshot.filter(validViews);
  data.supply.view_count_snapshot = {
    total_views: countedItems.length === snapshot.length ? countedItems.reduce((sum, row) => sum + Number(row.view_count), 0) : null,
    items: snapshot.length, items_with_counts: countedItems.length,
  };
  data.supply.views_by_category = byCategory(snapshot, 'items').map(row => {
    const categoryItems = snapshot.filter(item => (primaryCategories.get(item.item_id) || '미분류') === row.category_name);
    return { ...row, views: categoryItems.every(validViews) ? categoryItems.reduce((sum, item) => sum + Number(item.view_count), 0) : null };
  });
  data.operations.report_status_distribution = groups(received, 'report_status', 'reports');
  data.operations.report_type_distribution = groups(received, 'report_type', 'reports');
  data.operations.notification_read_performance = data.operations.notification_read_performance.map(row => ({
    ...row, read_notifications: notificationRows.filter(n => n.notification_type === row.notification_type && n.read_at).length,
  }));
  data.funnels.event_distribution = groups(currentEvents, 'event_name', 'events');
  for (const key of ['guest_to_member', 'item_registration', 'trade_completion']) data.funnels[key].status = 'not_implemented';
  const sourceCounts = Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]));
  const sourceTimes = Object.values(tables).flatMap(rows => rows.flatMap(row => [row.joined_at, row.created_at, row.completed_at].map(stamp).filter(value => Number.isFinite(value) && value <= now)));
  const availableRange = sourceTimes.length ? { start_date: label(sourceTimes.reduce((a, b) => Math.min(a, b), Infinity)), end_date: label(sourceTimes.reduce((a, b) => Math.max(a, b), -Infinity)) } : { start_date: null, end_date: null };
  return { data, metadata: { source_counts: sourceCounts, schema: { users: { account_status: userSchema.accountStatus, withdrawn_at: userSchema.withdrawnAt } }, available_data_range: availableRange, source: 'tables', timezone: 'Asia/Seoul', period: { start_date: label(start), end_date: label(last) }, previous_period: { start_date: label(previous[0]), end_date: label(previous[1] - DAY) }, snapshot_at: new Date(now).toISOString(), analytics_observed_range: { first_event_at: eventMin === null ? null : new Date(eventMin).toISOString(), last_event_at: eventMax === null ? null : new Date(eventMax).toISOString() }, notes: [
    `라벨 계약 ${LABEL_CONTRACT_VERSION}. 현재 DB에서 확인한 생활관·조회수·계정 상태·알림 유형을 반영했습니다.`,
    '조회 기간의 회원·상품·거래·찜·채팅·신고·알림 기록을 집계했습니다. 관리자·탈퇴 계정과 연결된 이용 기록은 회원·거래 활동 집계에서 제외합니다.',
    '방문·전환·리텐션·휴면은 충분한 이용 기록이 없어 미집계입니다. 기록이 없는 지표는 0과 구분합니다.',
    '활성 회원은 수집된 이용 기록 기준입니다. 수집되지 않은 활동은 포함되지 않으며, 기록 범위 밖의 빈 기간은 미집계입니다.',
    '회원 수는 현재 탈퇴 완료되지 않은 계정 기준이며 탈퇴 처리 중·이용 정지 계정도 포함합니다. 신규 회원·누적 가입 추이는 탈퇴 계정의 가입 이력도 포함합니다. 계정 상태는 현재 기준이며 주별 탈퇴율은 미집계입니다.',
    userSchema.accountStatus ? '계정 상태는 정상·탈퇴 처리 중·탈퇴 등 저장된 값으로 구분합니다. account_status, 탈퇴 처리 학과 코드 또는 withdrawn_at으로 확인된 탈퇴 완료 계정은 제외합니다.' : '계정 상태 컬럼이 없는 기존 DB는 탈퇴 처리 학과 코드와 사용 가능한 탈퇴 시각으로 가입·탈퇴를 구분합니다. 이용 정지 상태는 추정하지 않습니다.',
    '학과는 앱의 공식 코드 라벨을 사용합니다. 직접 입력한 학과명은 그대로 구분하고 미입력·알 수 없는 코드는 기타/미입력으로 묶습니다. 찜은 현재 남아 있는 기록만 포함합니다.',
    '상품 상태·미판매 기간·신고 적체·예약 결과·알림 읽음 여부는 조회 시점의 현재 상태입니다. 과거 날짜를 선택해도 당시 상태로 복원되지 않습니다.',
    '생활관 선택·프로필 공개는 현재 미탈퇴 회원 기준입니다. 상품 생활관은 상품 자체의 공개값만 사용하며 비공개 판매자 프로필에서 추론하지 않습니다.',
    '상품 조회수는 현재 남은 상품의 누적 열람 합계로, 순 방문자 수나 선택 기간의 조회수가 아닙니다. 삭제된 상품은 제외하고 숨김 상품은 포함합니다.',
    '알림은 기간 내 생성 건수와 현재 읽음 상태, 신고 분포는 기간 내 접수 건의 현재 상태를 표시합니다. 알려지지 않은 새 라벨도 원래 코드로 구분합니다.',
    '거래는 완료일 기준, 시간·요일은 약속 시각 기준입니다. 거래 장소는 건물 단위로 묶었습니다.',
    '후기율은 완료 후 7일 내 후기 작성 거래 비율입니다. 7일이 지나지 않은 거래가 있으면 미집계합니다.',
    '예약 이행률은 기간 내 확정된 예약의 현재 완료 비율입니다. 취소는 집계하지만 노쇼 확정 기록은 없습니다.',
  ] } };
}
