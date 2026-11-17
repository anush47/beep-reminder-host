import crypto from "node:crypto";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(payload) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(payload)
    .digest("base64url");
}

function safeEqual(a = "", b = "") {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Returns "admin" | "site" | null for a typed password.
export function roleForPassword(password) {
  const admin = process.env.ADMIN_PASSWORD;
  const site = process.env.SITE_PASSWORD;
  if (admin && safeEqual(password, admin)) return "admin";
  if (site && safeEqual(password, site)) return "site";
  return null;
}

export function makeSessionCookie(role) {
  const body = Buffer.from(
    JSON.stringify({ role, exp: Date.now() + MAX_AGE * 1000 })
  ).toString("base64url");
  const value = `${body}.${sign(body)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// Reads the role from a Request's cookie header.
export function getRole(request) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!match) return null;
  const [body, sig] = match.slice(COOKIE.length + 1).split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (Date.now() > exp) return null;
    return role === "admin" || role === "site" ? role : null;
  } catch {
    return null;
  }
}

export function isDevice(request) {
  const key = process.env.DEVICE_API_KEY;
  return !!key && safeEqual(request.headers.get("x-api-key") || "", key);
}

export const unauthorized = () =>
  Response.json({ error: "unauthorized" }, { status: 401 });
export const forbidden = () =>
  Response.json({ error: "forbidden" }, { status: 403 });
