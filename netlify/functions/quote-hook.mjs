export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const hook = process.env.ZAPIER_HOOK;
  if (!hook) {
    return new Response("Not configured", { status: 500 });
  }
  const body = await req.text();
  try {
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  } catch (e) {
    // swallow — lead capture must never block the user
  }
  return new Response("ok", { status: 200 });
};
