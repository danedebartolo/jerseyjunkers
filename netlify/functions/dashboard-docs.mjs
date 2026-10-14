// Jersey Junkers — team documents on /dashboard/
// GET    /api/dashboard-docs            → { docs, isAdmin }           (team login)
// GET    /api/dashboard-docs?id=XYZ     → downloads the file          (team login)
// POST   /api/dashboard-docs            → upload (raw file body)      (admin only)
//          headers: x-file-name (URI-encoded), content-type, x-note (URI-encoded, optional)
// DELETE /api/dashboard-docs?id=XYZ     → remove                      (admin only)
// Storage: Netlify Blobs store "dashboard": "docs/index" (list) + "docs/file/<id>" (bytes).
import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const MAX_BYTES = 4.5 * 1024 * 1024; // Netlify function request limit is ~6 MB
const SAFE_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv", txt: "text/plain",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", heic: "image/heic", gif: "image/gif",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" } });
const tok = (prefix, pw) => (pw ? createHash("sha256").update(prefix + pw).digest("hex") : null);
const cookieVal = (req, name) => ((req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`)) || [])[1];
const dec = (s) => { try { return decodeURIComponent(s || ""); } catch { return s || ""; } };

export default async (req) => {
  const team = tok("jj-dash:", process.env.DASHBOARD_PASSWORD || process.env.PROTECTED_PAGE_PASSWORD);
  const admin = tok("jj-admin:", process.env.DASHBOARD_ADMIN_PASSWORD);
  if (!team || cookieVal(req, "jj_dash") !== team) return json({ error: "unauthorized" }, 401);
  const isAdmin = !!admin && cookieVal(req, "jj_admin") === admin;

  const store = getStore("dashboard");
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const index = async () => (await store.get("docs/index", { type: "json" })) || [];

  if (req.method === "GET" && id) {
    const doc = (await index()).find((d) => d.id === id);
    const bytes = doc && (await store.get(`docs/file/${id}`, { type: "arrayBuffer" }));
    if (!bytes) return json({ error: "File not found" }, 404);
    const ext = (doc.name.split(".").pop() || "").toLowerCase();
    return new Response(bytes, {
      headers: {
        "content-type": SAFE_TYPES[ext] || "application/octet-stream",
        "content-disposition": `attachment; filename="${doc.name.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  }

  if (req.method === "GET") return json({ docs: (await index()).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), isAdmin });

  if (!isAdmin) return json({ error: "Only the admin login can change documents" }, 403);

  if (req.method === "POST") {
    const name = dec(req.headers.get("x-file-name")).replace(/[\/\\]/g, "_").trim().slice(0, 150);
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (!name || !SAFE_TYPES[ext]) return json({ error: "Upload a PDF, Word, Excel, PowerPoint, CSV, text or image file" }, 400);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength) return json({ error: "That file is empty" }, 400);
    if (bytes.byteLength > MAX_BYTES) return json({ error: "File is over 4.5 MB — compress it or split it up" }, 413);
    const docId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await store.set(`docs/file/${docId}`, bytes);
    const list = await index();
    list.push({ id: docId, name, size: bytes.byteLength, note: dec(req.headers.get("x-note")).trim().slice(0, 200), uploadedAt: new Date().toISOString() });
    await store.setJSON("docs/index", list);
    return json({ docs: list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), isAdmin });
  }

  if (req.method === "DELETE" && id) {
    const list = (await index()).filter((d) => d.id !== id);
    await store.delete(`docs/file/${id}`);
    await store.setJSON("docs/index", list);
    return json({ docs: list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)), isAdmin });
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/dashboard-docs" };
