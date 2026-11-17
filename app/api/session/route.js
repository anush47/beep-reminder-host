import {
  roleForPassword,
  makeSessionCookie,
  clearSessionCookie,
  getRole,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

// Who am I?
export async function GET(request) {
  return Response.json({ role: getRole(request) });
}

// Log in with the site or admin password.
export async function POST(request) {
  const { password } = await request.json().catch(() => ({}));
  const role = roleForPassword(password);
  if (!role) return Response.json({ error: "wrong password" }, { status: 401 });
  return Response.json({ role }, { headers: { "Set-Cookie": makeSessionCookie(role) } });
}

// Log out.
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
