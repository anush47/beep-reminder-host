import { reminders, getVersion } from "@/lib/db";
import { isDevice, unauthorized } from "@/lib/auth";
import { expand } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const WINDOW_HOURS = 48;

// ESP32 calls: GET /api/device/schedule?since=<version>   (header x-api-key)
// Returns 304 if nothing changed, otherwise the upcoming occurrences as epoch seconds.
export async function GET(request) {
  if (!isDevice(request)) return unauthorized();

  const version = await getVersion();
  const since = Number(new URL(request.url).searchParams.get("since"));
  const now = Date.now();

  // Occurrences depend on the clock too, so the 304 shortcut is only safe
  // when the device already holds the full window (it re-syncs at least every few hours).
  // Keep it simple: always return data; payload is tiny.
  const docs = await (await reminders()).find({ enabled: true }).toArray();
  const occurrences = [];
  for (const d of docs) {
    for (const at of expand(d, now - 60_000, now + WINDOW_HOURS * 3600_000)) {
      occurrences.push({ id: String(d._id), title: d.title, at, once: d.type === "once" });
    }
  }
  occurrences.sort((a, b) => a.at - b.at);

  return Response.json({
    version,
    changed: since !== version,
    now: Math.floor(now / 1000),
    occurrences: occurrences.slice(0, 100),
  });
}
