const rate = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 10000) / 100 : null;

export function buildBusinessFunnel(trades, history, reviews, { period, now }) {
  const reservedByTrade = new Map();
  const reviewsByTrade = new Map();
  for (const row of history) {
    if (row.to_status !== 'reserved') continue;
    if (!reservedByTrade.has(row.trade_id)) reservedByTrade.set(row.trade_id, []);
    reservedByTrade.get(row.trade_id).push(Date.parse(row.created_at));
  }
  for (const row of reviews) {
    if (!reviewsByTrade.has(row.trade_id)) reviewsByTrade.set(row.trade_id, []);
    reviewsByTrade.get(row.trade_id).push(Date.parse(row.created_at));
  }
  const cohorts = trades.filter(trade => {
    const created = Date.parse(trade.created_at);
    return created >= period[0] && created < period[1] && created <= now;
  }).map(trade => {
    const created = Date.parse(trade.created_at);
    const reservedTimes = (reservedByTrade.get(trade.trade_id) || []).filter(at => at >= created && at <= now);
    const reserved = reservedTimes.length ? Math.min(...reservedTimes) : null;
    const completed = Date.parse(trade.completed_at);
    const validCompleted = trade.trade_status === 'completed' && completed >= created && completed <= now;
    const times = [created];
    if (reserved !== null) {
      times.push(reserved);
      if (validCompleted && completed >= reserved) {
        times.push(completed);
        const reviewed = (reviewsByTrade.get(trade.trade_id) || []).filter(at => at >= completed && at <= now);
        if (reviewed.length) times.push(Math.min(...reviewed));
      }
    }
    return { times, missingReservation: validCompleted && (reserved === null || completed < reserved), pending: !['completed', 'cancelled', 'rejected'].includes(trade.trade_status) };
  });
  const stageDefinitions = [
    { stage: 'trade_created', label: '거래 요청', source: 'trades.created_at' },
    { stage: 'trade_reserved', label: '예약 확정', source: 'trade_status_history.created_at (to_status=reserved)' },
    { stage: 'trade_completed', label: '거래 완료', source: 'trades.completed_at' },
    { stage: 'review_submitted', label: '후기 작성', source: 'reviews.created_at' },
  ];
  const completed = cohorts.filter(cohort => cohort.times.length === stageDefinitions.length);
  return {
    status: cohorts.length ? 'snapshot' : 'no_cohorts', data_source: 'business_records', definition_version: '20261103.1',
    count_unit: 'trades', count_field: 'attempts', observation_window_label: '조회 시점까지', observed_at: new Date(now).toISOString(),
    definition: '선택 기간에 생성된 거래를 기준으로 조회 시점까지 예약 확정 → 거래 완료 → 후기 작성을 동일 거래의 시간 순서로 확인합니다. 관찰 기간은 고정하지 않으며 진행 중 거래는 이후 결과가 달라집니다. 예약 확정 이력이 없는 완료 거래는 연속 단계로 추정하지 않습니다.',
    requires_all_stages: true, rates_are_provisional: true, cohort_size: cohorts.length,
    pending_cohorts: cohorts.filter(cohort => cohort.pending).length,
    mature_cohorts: null, immature_cohorts: null, mature_conversion_rate: null,
    average_completion_seconds: completed.length ? completed.reduce((sum, cohort) => sum + (cohort.times.at(-1) - cohort.times[0]) / 1000, 0) / completed.length : null,
    quality: { completed_without_reservation_evidence: cohorts.filter(cohort => cohort.missingReservation).length },
    stage_definitions: stageDefinitions,
    stages: cohorts.length ? stageDefinitions.map(({ stage }, index) => {
      const count = cohorts.filter(cohort => cohort.times.length > index).length;
      return { stage, attempts: count, rate_from_start: rate(count, cohorts.length) };
    }) : [],
  };
}
