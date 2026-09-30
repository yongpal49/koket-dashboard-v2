const DAY = 86400000;
const KST = 9 * 3600000;

export function recentRange(days = 7, now = Date.now()) {
  const endDate = new Date(now + KST).toISOString().slice(0, 10);
  const startDate = new Date(Date.parse(`${endDate}T00:00:00Z`) - (days - 1) * DAY).toISOString().slice(0, 10);
  return { startDate, endDate };
}

export function rangeError({ startDate, endDate }) {
  if (!startDate || !endDate) return "시작일과 종료일을 입력해주세요.";
  if (startDate > endDate) return "종료일은 시작일 이후로 선택해주세요.";
  if (Date.parse(endDate) - Date.parse(startDate) >= 366 * DAY) return "한 번에 최대 366일까지 조회할 수 있습니다.";
  return "";
}

export function formatPeriod(period) {
  const start = String(period.start_date || "").split("-");
  const end = String(period.end_date || "").split("-");
  if (start.length !== 3 || end.length !== 3) return "기간 확인 중";
  return `${start.join(".")}–${start[0] === end[0] ? `${end[1]}.${end[2]}` : end.join(".")}`;
}
