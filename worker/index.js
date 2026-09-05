import { clearSessionCookie, createSessionCookie, getAuthConfig, verifyPassword, verifySession } from "./auth.js";

const RPC = {
  core: "get_dashboard_core",
  members: "get_dashboard_members",
  supply: "get_dashboard_supply",
  engagement: "get_dashboard_engagement",
  funnels: "get_dashboard_funnels",
  operations: "get_dashboard_operations",
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const jsonWithCookie = (body, cookie, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "set-cookie": cookie },
});

async function authStatus(request, env) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const config = getAuthConfig(env);
  if (!config) return json({ configured: false, authenticated: false }, 503);
  return json({ configured: true, authenticated: await verifySession(request.headers.get("cookie"), config.sessionSecret) });
}

async function login(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const config = getAuthConfig(env);
  if (!config) return json({ error: "관리자 비밀번호 설정이 필요합니다." }, 503);
  try {
    const body = await request.json();
    if (!(await verifyPassword(body.password, config.password))) return json({ error: "비밀번호가 일치하지 않습니다." }, 401);
    return jsonWithCookie({ ok: true }, await createSessionCookie(config.sessionSecret, true));
  } catch {
    return json({ error: "잘못된 요청입니다." }, 400);
  }
}

function logout(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  return jsonWithCookie({ ok: true }, clearSessionCookie(true));
}

async function dashboard(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authConfig = getAuthConfig(env);
  if (!authConfig) return json({ error: "Dashboard authentication is not configured." }, 503);
  if (!(await verifySession(request.headers.get("cookie"), authConfig.sessionSecret))) return json({ error: "Unauthorized" }, 401);
  const supabaseKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) return json({ error: "Supabase environment variables are not configured." }, 503);
  try {
    const body = await request.json();
    const sections = Array.isArray(body.sections) ? body.sections.filter((name) => RPC[name]) : Object.keys(RPC);
    const entries = await Promise.all(sections.map(async (section) => {
      const isLegacyKey = !supabaseKey.startsWith("sb_secret_");
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${RPC[section]}`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          ...(isLegacyKey ? { authorization: `Bearer ${supabaseKey}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_start_date: body.startDate, p_end_date: body.endDate }),
      });
      if (!response.ok) throw new Error(`${section}: ${response.status} ${await response.text()}`);
      return [section, await response.json()];
    }));
    return json({ data: Object.fromEntries(entries) });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/status") return authStatus(request, env);
    if (url.pathname === "/api/auth") return login(request, env);
    if (url.pathname === "/api/logout") return logout(request);
    if (url.pathname === "/api/dashboard") return dashboard(request, env);
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) return response;
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
