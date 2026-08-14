// Netlify Edge Function — real password gate for /pages-access/
// The password lives in the PROTECTED_PAGE_PASSWORD environment variable
// (Netlify dashboard → Site configuration → Environment variables).
// It is NEVER sent to the browser or stored in any file a visitor can read.

const COOKIE_NAME = "pa_session";

// Build a signed session token from the password + a fixed salt.
// We store a hash so the raw password is never written to the cookie.
async function makeToken(password) {
  const data = new TextEncoder().encode("jj-pages-access::" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — Jersey Junkers Page Directory</title>
<style>
  :root{--navy:#003A70;--gold:#F5C400;--ink:#16181d;--cloud:#f4f6f9;--line:#e2e7ec;--muted:#5c6773}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--cloud);color:var(--ink);min-height:100vh;display:flex;flex-direction:column}
  .bar{background:var(--navy);color:#fff;padding:16px 0}
  .bar .in{max-width:1000px;margin:0 auto;padding:0 20px;font-family:'Arial Black',sans-serif;font-weight:900;font-size:19px}
  .bar span{color:var(--gold)}
  .wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:380px;width:100%;background:#fff;border:1px solid var(--line);border-radius:16px;padding:32px 28px;box-shadow:0 12px 40px rgba(0,0,0,.08)}
  h1{font-family:'Arial Black',sans-serif;font-size:22px;margin-bottom:6px}
  p{color:var(--muted);font-size:14px;margin-bottom:20px}
  label{display:block;font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:6px}
  input{width:100%;font-size:15px;padding:11px 13px;border:1.5px solid var(--line);border-radius:9px;margin-bottom:16px}
  input:focus{outline:none;border-color:var(--navy)}
  button{width:100%;background:var(--gold);color:var(--ink);font-family:'Arial Black',sans-serif;font-weight:900;font-size:15px;padding:13px;border:none;border-radius:9px;cursor:pointer}
  button:hover{background:#e0b400}
  .err{color:#d64545;font-size:13.5px;margin-bottom:14px;font-weight:600}
</style></head><body>
<div class="bar"><div class="in">JERSEY JUNKERS<span>&reg;</span> · Page Directory</div></div>
<div class="wrap"><div class="card">
  <h1>Sign in</h1>
  <p>Enter the password to view the site page directory.</p>
  ${error ? `<div class="err">${error}</div>` : ""}
  <form method="POST" action="/pages-access/">
    <label>Password</label>
    <input type="password" name="password" autofocus required>
    <button type="submit">View Pages &rarr;</button>
  </form>
</div></div>
</body></html>`;
}

export default async (request, context) => {
  const password = Deno.env.get("PROTECTED_PAGE_PASSWORD");

  // If no password is configured, fail closed (deny) rather than exposing the page.
  if (!password) {
    return new Response(loginPage("Password protection is not configured yet."), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const validToken = await makeToken(password);

  // 1) Handle a login submission (POST with the password form)
  if (request.method === "POST") {
    const form = await request.formData();
    const submitted = form.get("password");
    if (submitted && (await makeToken(String(submitted))) === validToken) {
      // Correct password — set a secure, HttpOnly session cookie and reload the page.
      const headers = new Headers();
      headers.set("location", "/pages-access/");
      headers.append(
        "set-cookie",
        `${COOKIE_NAME}=${validToken}; Path=/pages-access/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
      );
      return new Response(null, { status: 303, headers });
    }
    // Wrong password — show the form again with an error.
    return new Response(loginPage("Incorrect password. Try again."), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // 2) For GET requests, check the session cookie
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]+)`));
  if (match && match[1] === validToken) {
    // Authenticated — let the real /pages-access/ page load.
    return context.next();
  }

  // 3) Not authenticated — show the login form.
  return new Response(loginPage(), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const config = { path: "/pages-access/*" };
