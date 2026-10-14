// Jersey Junkers — "Must read" notice with sign-offs on /dashboard/
// GET  /api/dashboard-notice                      → { notice, signed, isAdmin }   (team login)
//        team sees names that signed; admin also sees timestamps
// POST { action:"ack", name }                     → record a sign-off            (team login)
// POST { action:"save", title, body, required[], keepSignoffs } → post / edit   (admin only)
// POST { action:"clear" }                         → take it down                 (admin only)
// Storage: Netlify Blobs store "dashboard": key "notice", sign-offs at "ack/<noticeId>/<name>".
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
const tok = (prefix, pw) => (pw ? createHash("sha256").update(prefix + pw).digest("hex") : null);
const cookieVal = (req, name) => ((req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`)) || [])[1];
const clean = (s, max) => String(s ?? "").replace(/\r/g, "").trim().slice(0, max);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";

async function signoffs(store, id) {
  if (!id) return [];
  const { blobs } = await store.list({ prefix: `ack/${id}/` });
  const rows = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return rows.filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
}

export default async (req) => {
  const team = tok("jj-dash:", process.env.DASHBOARD_PASSWORD || process.env.PROTECTED_PAGE_PASSWORD);
  const admin = tok("jj-admin:", process.env.DASHBOARD_ADMIN_PASSWORD);
  if (!team || cookieVal(req, "jj_dash") !== team) return json({ error: "unauthorized" }, 401);
  const isAdmin = !!admin && cookieVal(req, "jj_admin") === admin;
  const store = getStore("dashboard");

  const respond = async (notice) => {
    const rows = await signoffs(store, notice?.id);
    return json({ notice, isAdmin, signed: isAdmin ? rows : rows.map((r) => ({ name: r.name })) });
  };

  if (req.method === "GET") return respond(await store.get("notice", { type: "json" }));
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const notice = await store.get("notice", { type: "json" });

  if (body.action === "ack") {
    if (!notice) return json({ error: "There’s no notice to sign right now" }, 409);
    const name = clean(body.name, 60);
    if (!name) return json({ error: "Pick your name" }, 400);
    if (notice.required.length && !notice.required.some((n) => n.toLowerCase() === name.toLowerCase()))
      return json({ error: "That name isn’t on the list for this notice" }, 400);
    const key = `ack/${notice.id}/${slug(name)}`;
    const existing = await store.get(key, { type: "json" });
    if (!existing) await store.setJSON(key, { name, at: new Date().toISOString() });
    return respond(notice);
  }

  if (!isAdmin) return json({ error: "Only the admin login can change the notice" }, 403);

  if (body.action === "clear") { await store.delete("notice"); return respond(null); }

  if (body.action === "save") {
    const title = clean(body.title, 120), text = clean(body.body, 4000);
    if (!title && !text) return json({ error: "Add a title or message" }, 400);
    const required = [...new Set((Array.isArray(body.required) ? body.required : []).map((n) => clean(n, 60)).filter(Boolean))].slice(0, 40);
    const keep = body.keepSignoffs && notice;
    const next = {
      id: keep ? notice.id : Date.now().toString(36),
      title, body: text, required,
      postedAt: keep ? notice.postedAt : new Date().toISOString(),
      editedAt: keep ? new Date().toISOString() : null,
    };
    await store.setJSON("notice", next);
    return respond(next);
  }

  return json({ error: "unknown action" }, 400);
};

export const config = { path: "/api/dashboard-notice" };
