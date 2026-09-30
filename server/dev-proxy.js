import { SESSION_COOKIE } from "../worker/auth.js";

/** Local frontend development against the existing authenticated, aggregate-only API. */
export function createDashboardProxy(target) {
  const url = new URL(target);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("DASHBOARD_API_PROXY must be an HTTPS origin (HTTP is allowed only for loopback tests).");
  }

  return {
    "^/api/(?:auth(?:/status)?|logout|dashboard)(?:\\?.*)?$": {
      target: url.origin,
      changeOrigin: true,
      secure: true,
      proxyTimeout: 60000,
      cookieDomainRewrite: "",
      configure(proxy) {
        proxy.on("proxyReq", (outgoing, request) => {
          const cookie = String(request.headers.cookie || "").split(";")
            .map(value => value.trim()).find(value => value.startsWith(`${SESSION_COOKIE}=`));
          if (cookie) outgoing.setHeader("cookie", cookie);
          else outgoing.removeHeader("cookie");
          outgoing.removeHeader("authorization");
          outgoing.removeHeader("apikey");
        });
        proxy.on("proxyRes", response => {
          // Only the local HTTP copy loses Secure; upstream HTTPS cookies are unchanged.
          const cookies = (response.headers["set-cookie"] || [])
            .filter(value => value.startsWith(`${SESSION_COOKIE}=`))
            .map(value => value.replace(/;\s*Secure\b/gi, ""));
          if (cookies.length) response.headers["set-cookie"] = cookies;
          else delete response.headers["set-cookie"];
        });
      },
    },
  };
}
