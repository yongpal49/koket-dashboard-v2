import { recentRange } from "../utils/dateRange.js";

const sections = ["core", "members", "supply", "engagement", "funnels", "operations"];

async function requestDashboard(startDate, endDate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  const period = { start_date: startDate, end_date: endDate, timezone: "Asia/Seoul" };
  try {
    const response = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sections, startDate, endDate }),
      signal: controller.signal,
    });
    if (response.status === 401) return { unauthorized: true };
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "서버가 데이터를 반환하지 못했습니다.");
    if (!sections.every(section => payload.data?.[section] && typeof payload.data[section] === "object")) {
      throw new Error("대시보드 응답 형식이 일치하지 않습니다.");
    }
    return { data: payload.data, metadata: payload.metadata, mode: "live", period, warning: null };
  } catch (error) {
    return { data: null, mode: "error", period, warning: error.name === "AbortError" ? "조회 시간이 초과됐습니다. 다시 시도해주세요." : error.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadDashboard(startDate, endDate) {
  if (startDate) return requestDashboard(startDate, endDate);
  const recent = recentRange();
  const initial = await requestDashboard(recent.startDate, recent.endDate);
  if (initial.mode !== "live") return initial;
  const firstDate = initial.metadata?.available_data_range?.start_date;
  if (!firstDate || firstDate === recent.startDate) return initial;
  return requestDashboard(firstDate, recent.endDate);
}
