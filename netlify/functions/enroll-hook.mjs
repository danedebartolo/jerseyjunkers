// Commercial bulk pickup enrollment -> Zapier
// The Zapier URL lives ONLY in the Netlify env var ZAPIER_HOOK_ENROLL (never in page source).
const FIELDS = ['name', 'company', 'phone', 'email', 'zip', 'property_type', 'details', 'source', 'gclid', 'wbraid', 'gbraid'];

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const hook = process.env.ZAPIER_HOOK_ENROLL;
  if (!hook) {
    return { statusCode: 500, body: 'Enrollment hook not configured' };
  }
  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Bad request' };
  }
  const payload = {};
  for (const k of FIELDS) {
    if (data[k] != null) payload[k] = String(data[k]).trim().slice(0, 2000);
  }
  if (!payload.name || !payload.phone || !payload.email) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  payload.program = 'Commercial Monthly Bulk Pickup';
  payload.submitted_at = new Date().toISOString();
  try {
    const r = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { statusCode: r.ok ? 200 : 502, body: r.ok ? 'ok' : 'Upstream error' };
  } catch (e) {
    return { statusCode: 502, body: 'Upstream error' };
  }
};
