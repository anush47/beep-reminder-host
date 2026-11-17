import { DateTime } from "luxon";

export const TZ = () => process.env.TIMEZONE || "UTC";

/**
 * Reminder shapes (all times are interpreted in TIMEZONE):
 *  { type: "once",     at: "2026-12-01T09:30" }
 *  { type: "daily",    time: "08:00" }
 *  { type: "weekly",   time: "08:00", days: [1,3,5] }   // 1=Mon ... 7=Sun
 *  { type: "interval", everyMinutes: 90 }               // anchored at createdAt
 */
export function expand(reminder, fromMs, toMs) {
  if (!reminder.enabled) return [];
  const zone = TZ();
  const out = [];
  const push = (dt) => {
    const ms = dt.toMillis();
    if (ms >= fromMs && ms <= toMs) out.push(Math.floor(ms / 1000));
  };

  if (reminder.type === "once") {
    const dt = DateTime.fromISO(reminder.at, { zone });
    if (dt.isValid) push(dt);
  } else if (reminder.type === "interval") {
    const step = Math.max(1, Number(reminder.everyMinutes)) * 60000;
    const anchor = new Date(reminder.createdAt).getTime();
    let k = Math.max(0, Math.ceil((fromMs - anchor) / step));
    for (let t = anchor + k * step; t <= toMs && out.length < 500; t += step) {
      push(DateTime.fromMillis(t));
    }
  } else if (reminder.type === "daily" || reminder.type === "weekly") {
    const [h, m] = (reminder.time || "00:00").split(":").map(Number);
    let day = DateTime.fromMillis(fromMs, { zone }).startOf("day");
    const last = DateTime.fromMillis(toMs, { zone }).startOf("day");
    while (day <= last) {
      const ok =
        reminder.type === "daily" || (reminder.days || []).includes(day.weekday);
      if (ok) push(day.set({ hour: h, minute: m }));
      day = day.plus({ days: 1 });
    }
  }
  return out;
}

// Validate + normalise user input. Returns { value } or { error }.
export function parseReminder(body) {
  const title = String(body.title || "").trim().slice(0, 60);
  if (!title) return { error: "title required" };
  const type = body.type;
  const value = { title, type, enabled: body.enabled !== false };

  if (type === "once") {
    if (!DateTime.fromISO(body.at || "").isValid) return { error: "invalid date/time" };
    value.at = body.at;
  } else if (type === "interval") {
    const n = Number(body.everyMinutes);
    if (!Number.isFinite(n) || n < 1) return { error: "everyMinutes must be >= 1" };
    value.everyMinutes = Math.floor(n);
  } else if (type === "daily" || type === "weekly") {
    if (!/^\d{2}:\d{2}$/.test(body.time || "")) return { error: "time must be HH:mm" };
    value.time = body.time;
    if (type === "weekly") {
      const days = (body.days || []).map(Number).filter((d) => d >= 1 && d <= 7);
      if (!days.length) return { error: "pick at least one day" };
      value.days = [...new Set(days)];
    }
  } else {
    return { error: "invalid type" };
  }
  return { value };
}
