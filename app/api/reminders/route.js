import { reminders, bumpVersion } from "@/lib/db";
import { getRole, unauthorized, forbidden } from "@/lib/auth";
import { parseReminder } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const out = (d) => ({ ...d, id: String(d._id), _id: undefined });

export async function GET(request) {
  if (!getRole(request)) return unauthorized();
  const docs = await (await reminders()).find().sort({ createdAt: 1 }).toArray();
  return Response.json(docs.map(out));
}

export async function POST(request) {
  if (getRole(request) !== "admin") return getRole(request) ? forbidden() : unauthorized();
  const { value, error } = parseReminder(await request.json().catch(() => ({})));
  if (error) return Response.json({ error }, { status: 400 });
  value.createdAt = new Date().toISOString();
  const res = await (await reminders()).insertOne(value);
  await bumpVersion();
  return Response.json(out({ ...value, _id: res.insertedId }), { status: 201 });
}
