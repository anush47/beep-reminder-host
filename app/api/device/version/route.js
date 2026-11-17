import { getVersion } from "@/lib/db";
import { isDevice, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Tiny endpoint the ESP32 polls every ~30s: just the schedule version number.
export async function GET(request) {
  if (!isDevice(request)) return unauthorized();
  return Response.json({ version: await getVersion() });
}
