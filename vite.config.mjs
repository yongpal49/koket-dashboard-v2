import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { clearSessionCookie, createSessionCookie, getAuthConfig, verifyPassword, verifySession } from "./worker/auth.js";

const RPC = {
  core: "get_dashboard_core",
  members: "get_dashboard_members",
  supply: "get_dashboard_supply",
  engagement: "get_dashboard_engagement",
  funnels: "get_dashboard_funnels",
  operations: "get_dashboard_operations",
};

function dashboardApi(env) {
  const supabaseKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const authConfig = getAuthConfig(env);

  const sendJson = (res, body, status = 200, headers = {}) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.end(JSON.stringify(body));
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });

  return {
    name: "koket-dashboard-api",
    configureServer(server) {
      server.middlewares.use("/api/auth/status", async (req, res) => {
        if (req.method !== "GET") return sendJson(res, { error: "Method not allowed" }, 405);
        if (!authConfig) return sendJson(res, { configured: false, authenticated: false }, 503);
        const authenticated = await verifySession(req.headers.cookie, authConfig.sessionSecret);
        return sendJson(res, { configured: true, authenticated });
      });

      server.middlewares.use("/api/auth", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, { error: "Method not allowed" }, 405);
        if (!authConfig) return sendJson(res, { error: "관리자 비밀번호 설정이 필요합니다." }, 503);
        try {
          const body = await readBody(req);
          if (!(await verifyPassword(body.password, authConfig.password))) return sendJson(res, { error: "비밀번호가 일치하지 않습니다." }, 401);
          const cookie = await createSessionCookie(authConfig.sessionSecret, false);
          return sendJson(res, { ok: true }, 200, { "set-cookie": cookie });
        } catch {
          return sendJson(res, { error: "잘못된 요청입니다." }, 400);
        }
      });

      server.middlewares.use("/api/logout", (req, res) => {
        if (req.method !== "POST") return sendJson(res, { error: "Method not allowed" }, 405);
        return sendJson(res, { ok: true }, 200, { "set-cookie": clearSessionCookie(false) });
      });

      server.middlewares.use("/api/dashboard", async (req, res) => {
        if (req.method !== "POST") {
          return sendJson(res, { error: "Method not allowed" }, 405);
        }
        if (!authConfig) return sendJson(res, { error: "Dashboard authentication is not configured." }, 503);
        if (!(await verifySession(req.headers.cookie, authConfig.sessionSecret))) return sendJson(res, { error: "Unauthorized" }, 401);
        if (!env.SUPABASE_URL || !supabaseKey) {
          return sendJson(res, { error: "Supabase environment variables are not configured." }, 503);
        }

        try {
            const body = await readBody(req);
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
            return sendJson(res, { data: Object.fromEntries(entries) });
          } catch (error) {
            return sendJson(res, { error: error.message }, 502);
          }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    build: { outDir: "dist/client" },
    optimizeDeps: { include: ["react", "react-dom/client", "recharts"] },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      warmup: { clientFiles: ["./src/main.jsx"] },
    },
    plugins: [react(), dashboardApi(env)],
  };
});
