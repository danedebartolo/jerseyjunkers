// Jersey Junkers — password gate for /dashboard/
// Team password  = DASHBOARD_PASSWORD (falls back to PROTECTED_PAGE_PASSWORD)
// Admin password = DASHBOARD_ADMIN_PASSWORD  → also unlocks editing the top message
// Fails closed if no team password is set. /dashboard/logout clears the login.

async function sha(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const loginPage = (msg = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Dashboard · Jersey Junkers</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#121210;font-family:system-ui,-apple-system,sans-serif;color:#fff}
form{background:#1a1a1a;border-top:4px solid #F5C400;padding:32px;border-radius:12px;width:min(340px,88vw)}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 20px;color:#aaa;font-size:14px}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #444;background:#0d0d0c;color:#fff;font-size:16px}
button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:8px;background:#F5C400;color:#1a1a1a;font-weight:700;font-size:16px;cursor:pointer}
.err{color:#ff8a7a;margin-top:12px;font-size:14px}
</style></head><body><form method="POST" action="/dashboard/">
<h1>Jersey Junkers Dashboard</h1><p>Team access only.</p>
<input type="password" name="password" placeholder="Password" autofocus required>
<button type="submit">Open dashboard</button>${msg ? `<div class="err">${msg}</div>` : ""}
</form></body></html>`;

const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store", ...extra } });

const cookie = (name, val, maxAge) => `${name}=${val}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export default async (request, context) => {
  const teamPw = Netlify.env.get("DASHBOARD_PASSWORD") || Netlify.env.get("PROTECTED_PAGE_PASSWORD");
  const adminPw = Netlify.env.get("DASHBOARD_ADMIN_PASSWORD");
  if (!teamPw) return html(loginPage("Dashboard password is not configured."), 503);
  const teamTok = await sha("jj-dash:" + teamPw);
  const adminTok = adminPw ? await sha("jj-admin:" + adminPw) : null;
  const path = new URL(request.url).pathname;

  if (path.startsWith("/dashboard/logout")) {
    const h = new Headers({ location: "/dashboard/" });
    h.append("set-cookie", cookie("jj_dash", "", 0));
    h.append("set-cookie", cookie("jj_admin", "", 0));
    return new Response(null, { status: 303, headers: h });
  }

  if (request.method === "POST") {
    const pw = (await request.formData()).get("password");
    const isAdmin = adminPw && pw === adminPw;
    if (isAdmin || pw === teamPw) {
      const h = new Headers({ location: "/dashboard/" });
      h.append("set-cookie", cookie("jj_dash", teamTok, 2592000));
      h.append("set-cookie", isAdmin ? cookie("jj_admin", adminTok, 2592000) : cookie("jj_admin", "", 0));
      return new Response(null, { status: 303, headers: h });
    }
    return html(loginPage("Wrong password."), 401);
  }

  if (context.cookies.get("jj_dash") === teamTok) {
    const res = await context.next();
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "no-store");
    return res;
  }
  return html(loginPage(), 401);
};

export const config = { path: ["/dashboard", "/dashboard/*"] };
