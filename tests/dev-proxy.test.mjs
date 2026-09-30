import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { createServer } from "vite";
import { createDashboardProxy } from "../server/dev-proxy.js";

test("collaboration proxy preserves login/read/logout, filters credentials and restricts routes", async () => {
  const calls = [];
  const upstream = createHttpServer(async (request, response) => {
    calls.push({ url: request.url, headers: request.headers });
    let raw = "";
    for await (const chunk of request) raw += chunk;
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/auth") {
      assert.equal(JSON.parse(raw).password, "fixture-password");
      response.setHeader("set-cookie", [
        "koket_admin_session=fixture-session; Domain=example.test; Path=/; HttpOnly; SameSite=Strict; Secure",
        "unrelated=private; Secure",
      ]);
      response.end('{"ok":true}');
    } else if (request.url === "/api/logout") {
      response.setHeader("set-cookie", "koket_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict; Secure");
      response.end('{"ok":true}');
    } else {
      response.statusCode = request.headers.cookie === "koket_admin_session=fixture-session" ? 200 : 401;
      response.end(JSON.stringify({ data: { core: {} } }));
    }
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const vite = await createServer({
    configFile: false, logLevel: "silent", appType: "custom",
    server: { host: "127.0.0.1", port: 0, proxy: createDashboardProxy(target) },
  });
  try {
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const request = (path, options = {}) => fetch(base + path, options);
    assert.equal((await request("/api/dashboard", { method: "POST" })).status, 401);
    const login = await request("/api/auth", { method: "POST", body: JSON.stringify({ password: "fixture-password" }) });
    const cookie = login.headers.get("set-cookie");
    assert.equal(login.status, 200);
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.doesNotMatch(cookie, /Secure|Domain=|unrelated=/i);
    const headers = { cookie: "other_app=private; koket_admin_session=fixture-session", authorization: "Bearer unrelated", apikey: "unrelated" };
    assert.equal((await request("/api/auth/status", { headers })).status, 200);
    assert.equal((await request("/api/dashboard", { method: "POST", headers })).status, 200);
    assert.equal(calls.at(-1).headers.cookie, "koket_admin_session=fixture-session");
    assert.equal(calls.at(-1).headers.authorization, undefined);
    assert.equal(calls.at(-1).headers.apikey, undefined);
    const count = calls.length;
    assert.equal((await request("/api/dashboard/delete", { method: "POST" })).status, 404);
    assert.equal((await request("/rest/v1/users", { method: "DELETE" })).status, 404);
    assert.equal(calls.length, count);
    const logout = await request("/api/logout", { method: "POST", headers });
    assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
    assert.doesNotMatch(logout.headers.get("set-cookie"), /Secure/i);
    assert.equal((await request("/api/dashboard", { method: "POST" })).status, 401);
    assert.throws(() => createDashboardProxy("http://example.test"));
    assert.throws(() => createDashboardProxy("https://example.test/api"));
    assert.throws(() => createDashboardProxy("https://user:password@example.test"));
  } finally {
    await vite.close();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
});
