export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const hook = process.env.ZAPIER_CALLLOG_HOOK;
  if (!hook) {
    return new Response("Not configured", { status: 500 });
  }
  const raw = await req.text();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    try { data = Object.fromEntries(new URLSearchParams(raw)); } catch { data = {}; }
  }
  if (data && typeof data.company === "string" && data.company.trim() !== "") {
    return new Response("ok", { status: 200 });
  }
  if (data && "company" in data) { delete data.company; }

  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) {}
  return new Response("ok", { status: 200 });
};
