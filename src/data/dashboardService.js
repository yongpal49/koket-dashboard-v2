import { demoData, demoPeriod } from "./demoData.js";

const sections = ["core", "members", "supply", "engagement", "funnels", "operations"];

export async function loadDashboard(startDate, endDate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sections, startDate, endDate }),
      signal: controller.signal,
    });

    if (response.status === 401) return { unauthorized: true };
    if (!response.ok) throw new Error(`dashboard api ${response.status}`);
    const payload = await response.json();
    return { data: payload.data, mode: "live", period: { start_date: startDate, end_date: endDate, timezone: "Asia/Seoul" }, warning: null };
  } catch {
    return {
      data: demoData,
      mode: "demo",
      period: { start_date: startDate || demoPeriod.start_date, end_date: endDate || demoPeriod.end_date, timezone: "Asia/Seoul" },
      warning: "현재 Supabase 연결 정보가 없어 예시 데이터로 표시 중입니다. 환경 변수를 설정하면 실데이터로 자동 전환됩니다.",
    };
  } finally {
    clearTimeout(timer);
  }
}
