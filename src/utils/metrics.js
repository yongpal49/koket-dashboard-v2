export const isMetric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export const formatMetric = (value, unit = '') => isMetric(value)
  ? `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${unit}`
  : '–';

export function metricChange(current, previous, percentagePoint = false, inverse = false) {
  if (!isMetric(current) || !isMetric(previous)) return { text: '비교 불가', tone: 'neutral' };
  const c = Number(current), p = Number(previous);
  if (!percentagePoint && p === 0 && c !== 0) return { text: '이전 값 0 · 비교 불가', tone: 'neutral' };
  const difference = percentagePoint ? c - p : p === 0 ? 0 : (c - p) / Math.abs(p) * 100;
  const rounded = Math.round(difference * 10) / 10;
  if (rounded === 0) return { text: '변동 없음', tone: 'neutral' };
  return { text: `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}${percentagePoint ? '%p' : '%'}`, tone: (inverse ? rounded < 0 : rounded > 0) ? 'up' : 'down' };
}
export const formatAxisDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : value;

export function normalizeRetentionWeeks(weeks) {
  if (!Array.isArray(weeks)) return [];
  const populated = weeks.find(value => value != null);
  return populated && typeof populated === 'object'
    ? [100, ...weeks.map(week => week?.retention_rate ?? null)]
    : weeks;
}
export const metricShare = (part, total) => isMetric(part) && isMetric(total) && Number(total) > 0
  ? Number(part) / Number(total) * 100 : null;
