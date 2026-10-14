// Jersey Junkers — the editable message at the top of /dashboard/
// GET  /api/dashboard-message  → { message, isAdmin }   (team login)
// POST /api/dashboard-message  → saves it               (admin login only)
// Stored in Netlify Blobs (store "dashboard", key "message").
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });

const tok = (prefix, pw) => (pw ? createHash("sha256").update(prefix + pw).digest("hex") : null);
const cookieVal = (req, name) => ((req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`)) || [])[1];

const METRICS = ["none", "revenue", "jobs", "reviews"];
const clean = (s, max) => String(s ?? "").replace(/\r/g, "").slice(0, max);

export default async (req) => {
  const team = tok("jj-dash:", process.env.DASHBOARD_PASSWORD || process.env.PROTECTED_PAGE_PASSWORD);
  const admin = tok("jj-admin:", process.env.DASHBOARD_ADMIN_PASSWORD);
  if (!team || cookieVal(req, "jj_dash") !== team) return json({ error: "unauthorized" }, 401);
  const isAdmin = !!admin && cookieVal(req, "jj_admin") === admin;

  const store = getStore("dashboard");

  if (req.method === "GET") {
    const message = (await store.get("message", { type: "json" })) || null;
    return json({ message, isAdmin });
  }

  if (req.method === "POST") {
    if (!isAdmin) return json({ error: "Only the admin login can edit the message" }, 403);
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    if (body.clear) { await store.delete("message"); return json({ message: null, isAdmin }); }
    const metric = METRICS.includes(body.goalMetric) ? body.goalMetric : "none";
    const message = {
      headline: clean(body.headline, 120),
      body: clean(body.body, 2000),
      goalMetric: metric,
      goalTarget: metric === "none" ? 0 : Math.max(0, +body.goalTarget || 0),
      goalLabel: clean(body.goalLabel, 120),
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON("message", message);
    return json({ message, isAdmin });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/dashboard-message" };
