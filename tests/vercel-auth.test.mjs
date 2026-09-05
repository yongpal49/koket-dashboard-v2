import assert from "node:assert/strict";
import test from "node:test";
import { handleAuthStatus, handleDashboard, handleLogin, handleLogout } from "../server/vercel.js";

const testEnv = {
  DASHBOARD_PASSWORD: "test-admin-password",
  DASHBOARD_SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

const withTestEnv = async (callback) => {
  const previous = {};
  for (const [key, value] of Object.entries(testEnv)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const key of Object.keys(testEnv)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
};

const responseMock = () => ({
  headers: {},
  statusCode: 200,
  body: "",
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
  end(value = "") { this.body = value; },
});

const call = async (handler, request) => {
  const response = responseMock();
  await handler({ headers: {}, ...request }, response);
  return { response, body: JSON.parse(response.body || "{}") };
};

test("Vercel login rejects an incorrect administrator password", () => withTestEnv(async () => {
  const { response } = await call(handleLogin, { method: "POST", body: { password: "incorrect" } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["set-cookie"], undefined);
}));

test("Vercel login creates a valid administrator session", () => withTestEnv(async () => {
  const login = await call(handleLogin, { method: "POST", body: { password: "test-admin-password" } });
  assert.equal(login.response.statusCode, 200);
  assert.match(login.response.headers["set-cookie"], /koket_admin_session=/);
  assert.match(login.response.headers["set-cookie"], /HttpOnly/);
  assert.match(login.response.headers["set-cookie"], /Secure/);

  const status = await call(handleAuthStatus, {
    method: "GET",
    headers: { cookie: login.response.headers["set-cookie"] },
  });
  assert.deepEqual(status.body, { configured: true, authenticated: true });

  const logout = await call(handleLogout, { method: "POST" });
  assert.equal(logout.response.statusCode, 200);
  assert.match(logout.response.headers["set-cookie"], /Max-Age=0/);
}));

test("Vercel dashboard API blocks requests without a session", () => withTestEnv(async () => {
  const { response } = await call(handleDashboard, { method: "POST", body: { sections: ["core"] } });
  assert.equal(response.statusCode, 401);
}));
