import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

const authEnv = () => ({
  DASHBOARD_PASSWORD: "test-admin-password",
  DASHBOARD_SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  ASSETS: { fetch: async () => new Response("missing", { status: 404 }) },
});

test("blocks dashboard data when no admin session exists", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/dashboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sections: ["core"] }),
  }), authEnv());

  assert.equal(response.status, 401);
});

test("rejects an incorrect administrator password", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "incorrect" }),
  }), authEnv());

  assert.equal(response.status, 401);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("creates and verifies a protected administrator session", async () => {
  const login = await worker.fetch(new Request("https://example.test/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test-admin-password" }),
  }), authEnv());

  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /koket_admin_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);

  const status = await worker.fetch(new Request("https://example.test/api/auth/status", {
    headers: { cookie },
  }), authEnv());
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { configured: true, authenticated: true });
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});
