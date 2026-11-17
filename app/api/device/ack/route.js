import { ObjectId } from "mongodb";
import { reminders, bumpVersion } from "@/lib/db";
import { isDevice, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ESP32 calls after firing a one-off reminder so it is disabled: POST { id }
export async function POST(request) {
  if (!isDevice(request)) return unauthorized();
  const { id } = await request.json().catch(() => ({}));
  if (!ObjectId.isValid(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const res = await (await reminders()).updateOne(
    { _id: new ObjectId(id), type: "once" },
    { $set: { enabled: false, firedAt: new Date().toISOString() } }
  );
  if (res.modifiedCount) await bumpVersion();
  return Response.json({ ok: true });
}
