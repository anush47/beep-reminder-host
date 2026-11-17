"use client";
import { useEffect, useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const blank = { title: "", type: "daily", time: "08:00", at: "", days: [1, 2, 3, 4, 5], everyMinutes: 60 };

async function api(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function describe(r) {
  if (r.type === "once") return `Once · ${r.at.replace("T", " ")}`;
  if (r.type === "daily") return `Every day · ${r.time}`;
  if (r.type === "weekly") return `${r.days.map((d) => DAYS[d - 1]).join(", ")} · ${r.time}`;
  return `Every ${r.everyMinutes} min`;
}

export default function Home() {
  const [role, setRole] = useState(undefined); // undefined = loading
  const [password, setPassword] = useState("");
  const [list, setList] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = async () => setList(await api("/api/reminders"));

  useEffect(() => {
    api("/api/session").then((s) => {
      setRole(s.role);
      if (s.role) load().catch((e) => setError(e.message));
    });
  }, []);

  async function login(e) {
    e.preventDefault();
    setError("");
    try {
      const s = await api("/api/session", "POST", { password });
      setRole(s.role);
      setPassword("");
      await load();
    } catch (err) { setError(err.message); }
  }

  async function logout() {
    await api("/api/session", "DELETE");
    setRole(null); setList([]);
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      if (editing) await api(`/api/reminders/${editing}`, "PUT", form);
      else await api("/api/reminders", "POST", form);
      setForm(blank); setEditing(null);
      await load();
    } catch (err) { setError(err.message); }
  }

  async function toggle(r) {
    await api(`/api/reminders/${r.id}`, "PUT", { ...r, enabled: !r.enabled });
    await load();
  }

  async function remove(r) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await api(`/api/reminders/${r.id}`, "DELETE");
    await load();
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleDay = (d) =>
    set("days", form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);

  if (role === undefined) return <main><p className="muted">Loading…</p></main>;

  if (!role)
    return (
      <main>
        <h1>Beep Reminders</h1>
        <form className="card row" onSubmit={login} style={{ marginTop: 20 }}>
          <input className="grow" type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoFocus />
          <button>Enter</button>
          {error && <p className="err" style={{ width: "100%" }}>{error}</p>}
        </form>
      </main>
    );

  const admin = role === "admin";

  return (
    <main>
      <header>
        <h1>Beep Reminders</h1>
        <div className="row">
          <span className="muted">{admin ? "admin" : "view only"}</span>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </header>

      {admin && (
        <form className="card" onSubmit={save}>
          <div className="row">
            <input className="grow" placeholder="Title (e.g. Take meds)" value={form.title}
              onChange={(e) => set("title", e.target.value)} maxLength={60} />
            <select value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="interval">Every N min</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            {form.type === "once" && (
              <input type="datetime-local" value={form.at} onChange={(e) => set("at", e.target.value)} />
            )}
            {(form.type === "daily" || form.type === "weekly") && (
              <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
            )}
            {form.type === "interval" && (
              <>
                <input type="number" min="1" style={{ width: 90 }} value={form.everyMinutes}
                  onChange={(e) => set("everyMinutes", e.target.value)} />
                <span className="muted">minutes</span>
              </>
            )}
            {form.type === "weekly" && (
              <div className="days">
                {DAYS.map((n, i) => (
                  <label key={n}>
                    <input type="checkbox" checked={form.days.includes(i + 1)}
                      onChange={() => toggleDay(i + 1)} /> {n}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button>{editing ? "Save changes" : "Add reminder"}</button>
            {editing && (
              <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(blank); }}>
                Cancel
              </button>
            )}
          </div>
          {error && <p className="err">{error}</p>}
        </form>
      )}

      {list.length === 0 && <p className="muted">No reminders yet.</p>}
      {list.map((r) => (
        <div key={r.id} className={`card row ${r.enabled ? "" : "off"}`}>
          <div className="grow">
            <strong>{r.title}</strong>
            <div className="muted">{describe(r)}</div>
          </div>
          {admin && (
            <>
              <button className="ghost" onClick={() => toggle(r)}>{r.enabled ? "Pause" : "Resume"}</button>
              <button className="ghost" onClick={() => { setEditing(r.id); setForm({ ...blank, ...r }); window.scrollTo(0, 0); }}>Edit</button>
              <button className="danger" onClick={() => remove(r)}>Delete</button>
            </>
          )}
        </div>
      ))}
    </main>
  );
}
