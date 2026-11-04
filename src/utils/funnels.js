export function funnelDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '완료 기록 없음';
  if (seconds < 60) return `${Math.round(seconds)}초`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}시간`;
  return `${(seconds / 86400).toFixed(1)}일`;
}

export function funnelStatus(funnel) {
  if (funnel.data_source === 'business_records') return funnel.status === 'no_cohorts'
    ? '선택 기간에 거래 요청 기록 없음'
    : `거래 기록 기준 · 조회 시점까지의 진행 결과 · 진행 중 ${funnel.pending_cohorts ?? 0}건`;
  if (funnel.status === 'no_events') return '행동 이벤트 수집 기록 없음 · 클릭 퍼널 계산 대기';
  if (funnel.status === 'no_cohorts') return '선택 기간에 이 퍼널의 시작 기록 없음';
  if (funnel.rates_are_provisional) return `관찰 중 ${funnel.immature_cohorts ?? 0}건 포함 · 전환율은 잠정값`;
  return '관찰 기간 완료 · 수집된 기록 기준';
}

export function stageCount(stage) {
  return stage?.actors ?? stage?.attempts ?? 0;
}

export function stageGap(previous, next) {
  const count = stageCount(previous);
  return count > 0 ? Math.max(0, Math.round((1 - stageCount(next) / count) * 100)) : null;
}
