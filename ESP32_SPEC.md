# ESP32 Firmware Spec: Beep Reminder Device

Hand this document to whoever (or whatever agent) builds the C++/Arduino firmware.
The server side already exists (Next.js on Vercel + MongoDB). This doc describes
what the device must do and the exact HTTP contract.

## 1. Idea

The device is a reminder buzzer. Users manage reminders (once, daily, weekly,
every N minutes) in a web UI. The server expands those rules into concrete
**UTC epoch timestamps**. The ESP32 syncs them over HTTPS and **fires the beep
locally from its own NTP-synced clock**.

Key principles:

- **The device polls; the server never pushes** (Vercel serverless cannot hold connections).
- **The device does no recurrence or timezone math.** It only sees a list of timestamps.
- **It must keep working offline.** Once synced, reminders fire even if Wi-Fi drops.
- Epoch time is UTC, so the device needs NTP but no timezone configuration.

## 2. Sync strategy

Two-level polling to keep edits fast and traffic tiny:

1. **Every 30 s**: `GET /api/device/version` (a few bytes). Compare with the stored `knownVersion`.
2. **Full download** (`GET /api/device/schedule`) only when:
   - the version differs from `knownVersion`, or
   - the last full sync was more than **3 hours** ago (the server returns a rolling 48 h window, so it must be refreshed), or
   - on boot.

Edits made in the web UI therefore reach the device within about 30 s.

If any request fails (Wi-Fi down, non-200, bad JSON): **keep the existing schedule** and retry at the next 30 s tick. Only update `knownVersion` and `lastSync` after a successful, fully parsed schedule download.

## 3. HTTP contract

Base URL: `https://<app>.vercel.app`. Every request must send the header:

```
x-api-key: <DEVICE_API_KEY>
```

A missing or wrong key returns `401 {"error":"unauthorized"}`.

### GET /api/device/version

```json
{ "version": 12 }
```

### GET /api/device/schedule

```json
{
  "version": 12,
  "changed": true,
  "now": 1767225600,
  "occurrences": [
    { "id": "6741f0c2a1b2c3d4e5f60789", "title": "Take meds", "at": 1767254400, "once": false },
    { "id": "6741f0c2a1b2c3d4e5f6078a", "title": "Meeting",   "at": 1767258000, "once": true }
  ]
}
```

- `at`: UTC epoch **seconds**.
- `now`: server time in epoch seconds. It is optional and can be used as a sanity check against NTP.
- `occurrences`: sorted ascending, up to 100 items, covering roughly the next 48 h (plus 60 s of past).
- `once: true` means a one-off reminder: after firing it, call the ack endpoint.
- Take `version` from this response and store it as `knownVersion`.
- Ignore `changed`. It's informational.

### POST /api/device/ack

Called after firing an item with `once: true`, so the server disables it and it is not returned again.

```
Content-Type: application/json
{ "id": "6741f0c2a1b2c3d4e5f60789" }
```

Response: `{ "ok": true }`. If the call fails, retry on the next loop. It is safe to repeat.

## 4. Firing logic

```
every ~500 ms:
  now = time(nullptr)
  for each item in occurrences:
    if !item.fired and now >= item.at and now - item.at < 120:
      item.fired = true
      beep()              // e.g. 3 short beeps; optionally log the title to Serial
      if item.once: ack(item.id)
```

Rules:

- **Dedupe key is `(id, at)`.** When a new schedule arrives, carry over `fired = true` for any new item whose `(id, at)` matches an already-fired one. Otherwise a re-sync within the 60 s past window would beep twice.
- **Grace window:** only fire if the item is less than 120 s late. After a long outage, stale items must be skipped silently, not beeped.
- Do not fire anything until NTP time is valid (`time(nullptr) > 1700000000`).
- Different items with the same `at` should all fire.
- If the schedule array would exceed capacity, keep the earliest 100 (the server already caps at 100).

## 5. Requirements

| Area | Requirement |
|---|---|
| Board | Any ESP32 (Arduino framework) |
| Libraries | `WiFi`, `WiFiClientSecure`, `HTTPClient`, `ArduinoJson` v7, `time.h` |
| Time | `configTime(0, 0, "pool.ntp.org", "time.google.com")`. UTC only. |
| Output | A buzzer on a configurable GPIO (default 4). Optional LED. |
| Config | Wi-Fi SSID/pass, base URL, API key, buzzer pin as constants at the top (or a `secrets.h` that is gitignored) |
| Wi-Fi | Auto-reconnect if the connection drops. Do not block the firing loop while reconnecting. |
| HTTP | Set a timeout (about 8 s) so a hung request cannot stall beeping. |
| Memory | Parse JSON with a `JsonDocument`. Avoid large `String` churn. |

## 6. Security notes

- Start with `WiFiClientSecure::setInsecure()` to get running. **For production, pin the Vercel/Let's Encrypt root CA** with `setCACert()`.
- The API key is a shared secret baked into the firmware, so do not commit it.

## 7. Nice-to-haves (optional)

- Persist the last schedule and `knownVersion` to NVS/flash so reminders survive a reboot with no Wi-Fi.
- Status LED: solid when synced, blinking when offline.
- Battery variant: use deep sleep, wake every 5–15 min to sync, and set an RTC wake timer for the next `at`. Edits would then reach the device with that longer delay.
- Serial logging of each sync (version, item count) and each fired reminder.

## 8. Test checklist

1. Boot: connects to Wi-Fi, gets NTP time, does a first full sync.
2. Create a one-off reminder about 2 minutes out in the web UI: the device beeps once at the right second, and the reminder shows as disabled in the UI afterwards (ack worked).
3. Create a daily/interval reminder: the device beeps at each occurrence.
4. Edit or delete a reminder: the device reflects the change within about 30 s.
5. Pause Wi-Fi for 5 minutes: reminders still fire on time, and the device recovers and re-syncs afterwards.
6. Re-sync during the 60 s after a beep: no double beep.
7. Wrong API key: the device keeps its old schedule and does not crash.
