import { MongoClient } from "mongodb";

// Reuse one client across hot reloads / warm serverless invocations.
const g = globalThis;

function getClient() {
  if (!g._mongoClient) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
    g._mongoClient = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 5 });
  }
  return g._mongoClient;
}

export async function getDb() {
  const client = getClient();
  return client.db(process.env.MONGODB_DB || "beep_reminder");
}

export async function reminders() {
  return (await getDb()).collection("reminders");
}

// A single counter document; bumped on every change so the ESP32
// can skip downloading when nothing changed.
export async function getVersion() {
  const doc = await (await getDb()).collection("meta").findOne({ _id: "schedule" });
  return doc?.version ?? 0;
}

export async function bumpVersion() {
  await (await getDb())
    .collection("meta")
    .updateOne({ _id: "schedule" }, { $inc: { version: 1 } }, { upsert: true });
}
