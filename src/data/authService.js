const request = async (path, options = {}) => {
  const response = await fetch(path, { credentials: "include", ...options });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  return { response, payload };
};

export async function checkAdminSession() {
  try {
    const { response, payload } = await request("/api/auth/status");
    if (response.status === 503) return { configured: false, authenticated: false };
    return { configured: true, authenticated: response.ok && payload.authenticated === true };
  } catch {
    return { configured: false, authenticated: false };
  }
}

export async function loginAdmin(password) {
  try {
    const { response, payload } = await request("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.status === 429) return { ok: false, message: "잠시 후 다시 시도해주세요." };
    if (!response.ok) return { ok: false, message: payload.error || "비밀번호가 일치하지 않습니다." };
    return { ok: true };
  } catch {
    return { ok: false, message: "로그인 서버에 연결할 수 없습니다." };
  }
}

export async function logoutAdmin() {
  try { await request("/api/logout", { method: "POST" }); } catch { /* local session is reset below */ }
}
