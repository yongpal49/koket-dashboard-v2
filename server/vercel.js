import { loadDashboardData } from "./dashboard-source.js";
import {
  clearSessionCookie,
  createSessionCookie,
  getAuthConfig,
  verifyPassword,
  verifySession,
} from "../worker/auth.js";


const sendJson = (response, status, body, headers = {}) => {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}");
};

const authConfig = () => getAuthConfig(process.env);

export async function handleAuthStatus(request, response) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" }, { allow: "GET" });
  const config = authConfig();
  if (!config) return sendJson(response, 503, { configured: false, authenticated: false });

  const authenticated = await verifySession(request.headers.cookie, config.sessionSecret);
  return sendJson(response, 200, { configured: true, authenticated });
}

export async function handleLogin(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });
  const config = authConfig();
  if (!config) return sendJson(response, 503, { error: "관리자 비밀번호 설정이 필요합니다." });

  try {
    const body = await readJsonBody(request);
    if (!(await verifyPassword(body.password, config.password))) {
      return sendJson(response, 401, { error: "비밀번호가 일치하지 않습니다." });
    }

    const cookie = await createSessionCookie(config.sessionSecret, true);
    return sendJson(response, 200, { ok: true }, { "set-cookie": cookie });
  } catch {
    return sendJson(response, 400, { error: "잘못된 요청입니다." });
  }
}

export function handleLogout(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });
  return sendJson(response, 200, { ok: true }, { "set-cookie": clearSessionCookie(true) });
}

export async function handleDashboard(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" }, { allow: "POST" });

  const config = authConfig();
  if (!config) return sendJson(response, 503, { error: "Dashboard authentication is not configured." });
  if (!(await verifySession(request.headers.cookie, config.sessionSecret))) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !supabaseKey) {
    return sendJson(response, 503, { error: "Supabase environment variables are not configured." });
  }

  try {
    const body = await readJsonBody(request);
    return sendJson(response, 200, await loadDashboardData(process.env, body));
  } catch (error) {
    return sendJson(response, error.status || 502, { error: error.message });
  }
}
