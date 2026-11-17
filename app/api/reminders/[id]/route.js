import { ObjectId } from "mongodb";
import { reminders, bumpVersion } from "@/lib/db";
import { getRole, unauthorized, forbidden } from "@/lib/auth";
import { parseReminder } from "@/lib/schedule";

export const dynamic = "force-dynamic";

function guard(request) {
  const role = getRole(request);
  if (role === "admin") return null;
  return role ? forbidden() : unauthorized();
}

function oid(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function PUT(request, { params }) {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return Response.json({ error: "bad id" }, { status: 400 });
  const { value, error } = parseReminder(await request.json().catch(() => ({})));
  if (error) return Response.json({ error }, { status: 400 });
  // $set + $unset so switching type doesn't leave stale fields behind.
  const unset = {};
  for (const f of ["at", "time", "days", "everyMinutes"]) if (!(f in value)) unset[f] = "";
  const update = { $set: value };
  if (Object.keys(unset).length) update.$unset = unset;
  const res = await (await reminders()).updateOne({ _id }, update);
  if (!res.matchedCount) return Response.json({ error: "not found" }, { status: 404 });
  await bumpVersion();
  return Response.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await params;
  const _id = oid(id);
  if (!_id) return Response.json({ error: "bad id" }, { status: 400 });
  await (await reminders()).deleteOne({ _id });
  await bumpVersion();
  return Response.json({ ok: true });
}
