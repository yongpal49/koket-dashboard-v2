import { loadTableDashboard } from "./table-dashboard.js";

const rpcNames = {
  core: "get_dashboard_core",
  members: "get_dashboard_members",
  supply: "get_dashboard_supply",
  engagement: "get_dashboard_engagement",
  funnels: "get_dashboard_funnels",
  operations: "get_dashboard_operations",
};

async function loadRpc(env, body, section) {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw new Error("수파베이스 서버 연결 설정이 없습니다.");
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${rpcNames[section]}`, {
    method: "POST",
    headers: {
      apikey: key,
      ...(!key.startsWith("sb_secret_") ? { authorization: `Bearer ${key}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ p_start_date: body.startDate, p_end_date: body.endDate }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const error = new Error(`${rpcNames[section]}: HTTP ${response.status}${details.code ? ` (${details.code})` : ""}`);
    error.status = response.status === 400 ? 400 : 502;
    throw error;
  }
  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${rpcNames[section]}: 응답 형식이 올바르지 않습니다.`);
  }
  return data;
}

export async function loadDashboardData(env, body) {
  if (env.DASHBOARD_DATA_SOURCE === "tables") return loadTableDashboard(env, body);
  if (env.DASHBOARD_DATA_SOURCE === "core-rpc") {
    const result = await loadTableDashboard(env, body);
    const core = await loadRpc(env, body, "core");
    result.data.core = core;
    result.metadata.source = "core-rpc";
    result.metadata.section_sources = { core: "get_dashboard_core", members: "tables", supply: "tables", engagement: "tables", funnels: "tables", operations: "tables" };
    result.metadata.core = core.metadata || {};
    result.metadata.notes = [
      "핵심 현황은 Supabase get_dashboard_core 함수가 계산합니다. 나머지 탭은 서버의 기존 테이블 집계를 사용합니다.",
      ...result.metadata.notes.filter(note => !note.startsWith("방문·전환·리텐션·휴면")),
      "핵심 현황의 전환율은 시작 행동 기준입니다. 조회 시점까지의 후속 결과를 포함하므로 관찰 기간(7일·30일·24시간)이 끝나기 전에는 값이 바뀔 수 있습니다.",
      "등록 완료율은 같은 사용자·세션에서 등록 시작 이후 다음 시작 전까지의 완료를 24시간 안에서 연결합니다. 세션을 넘는 등록은 연결하지 못합니다.",
      "방문·리텐션·휴면 및 별도 퍼널 탭은 기존 집계 범위를 유지합니다. 이벤트가 없는 핵심 지표는 –로 표시합니다.",
      ...(Array.isArray(core.metadata?.notes) ? core.metadata.notes : []),
    ];
    return result;
  }
  const sections = Array.isArray(body.sections)
    ? body.sections.filter((section) => Object.hasOwn(rpcNames, section))
    : Object.keys(rpcNames);
  const entries = await Promise.all(sections.map(async section => [section, await loadRpc(env, body, section)]));
  return { data: Object.fromEntries(entries), metadata: { source: "rpc", notes: [] } };
}
