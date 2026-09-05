const encoder = new TextEncoder();

export const SESSION_COOKIE = "koket_admin_session";
export const SESSION_MAX_AGE = 60 * 60 * 12;

const encodeBase64Url = (buffer) => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const safeEqual = (left, right) => {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
};

const digest = async (value) => encodeBase64Url(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));

const sign = async (value, secret) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encodeBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
};

const readCookie = (cookieHeader, name) => {
  const prefix = `${name}=`;
  const pair = String(cookieHeader || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return pair ? decodeURIComponent(pair.slice(prefix.length)) : null;
};

export function getAuthConfig(env) {
  const password = env.DASHBOARD_PASSWORD;
  const sessionSecret = env.DASHBOARD_SESSION_SECRET;
  if (!password || !sessionSecret) return null;
  return { password, sessionSecret };
}

export async function verifyPassword(input, expected) {
  if (typeof input !== "string" || !input) return false;
  const [inputHash, expectedHash] = await Promise.all([digest(input), digest(expected)]);
  return safeEqual(inputHash, expectedHash);
}

export async function createSessionCookie(sessionSecret, secure = true) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const signature = await sign(String(expiresAt), sessionSecret);
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(`${expiresAt}.${signature}`)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearSessionCookie(secure = true) {
  const attributes = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=0"];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export async function verifySession(cookieHeader, sessionSecret) {
  const token = readCookie(cookieHeader, SESSION_COOKIE);
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, await sign(expiresAt, sessionSecret));
}
