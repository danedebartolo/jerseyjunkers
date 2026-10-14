// Jersey Junkers — HCP dashboard data proxy
// GET /api/hcp-dashboard?range=ytd   (ytd | 12m | 90d | lastyear)
// Keeps HCP_API_KEY server-side, requires the dashboard login cookie,
// returns only aggregated numbers: revenue by month + week, revenue & job count per employee.
import { createHash } from "node:crypto";

const HCP = "https://api.housecallpro.com";
const TZ = "America/New_York";
const PAGE_SIZE = 100;
const MAX_PAGES = 60;            // safety cap (6,000 jobs per pull)
const PARALLEL = 8;
const CACHE_MS = 10 * 60 * 1000; // 10 min per range, per warm instance
const cache = new Map();

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" },
  });

// ---------- auth (same cookie the /dashboard/ edge gate sets) ----------
function authed(req) {
  const pw = process.env.DASHBOARD_PASSWORD || process.env.PROTECTED_PAGE_PASSWORD;
  if (!pw) return false; // fail closed
  const want = createHash("sha256").update("jj-dash:" + pw).digest("hex");
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)jj_dash=([a-f0-9]{64})/);
  return !!m && m[1] === want;
}

// ---------- dates (Eastern) ----------
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD
function startOfDayET(dateStr) {
  const guess = new Date(dateStr + "T05:00:00Z");
  const hourET = +new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(guess);
  return new Date(guess.getTime() - hourET * 3600e3);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const mondayOf = (day) => addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));

function resolveRange(range) {
  const today = ymd(new Date());
  const y = +today.slice(0, 4);
  if (range === "lastyear") return { key: range, start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
  if (range === "90d") return { key: range, start: addDays(today, -89), end: today };
  if (range === "12m") {
    const m = +today.slice(5, 7);
    const sm = m === 12 ? 1 : m + 1, sy = m === 12 ? y : y - 1; // first day of the month 11 months back
    return { key: range, start: `${sy}-${String(sm).padStart(2, "0")}-01`, end: today };
  }
  return { key: "ytd", start: `${y}-01-01`, end: today };
}

// ---------- HCP ----------
async function hcp(path, params) {
  const url = new URL(HCP + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: "Token " + process.env.HCP_API_KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HCP ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function jobsBetween(startStr, endStr) {
  const params = {
    scheduled_start_min: startOfDayET(startStr).toISOString(),
    scheduled_start_max: startOfDayET(addDays(endStr, 1)).toISOString(),
    page_size: PAGE_SIZE,
  };
  const first = await hcp("/jobs", { ...params, page: 1 });
  const out = [...(first.jobs || [])];
  const pages = Math.min(first.total_pages || 1, MAX_PAGES);
  for (let p = 2; p <= pages; p += PARALLEL) {
    const batch = [];
    for (let q = p; q < p + PARALLEL && q <= pages; q++) batch.push(hcp("/jobs", { ...params, page: q }));
    (await Promise.all(batch)).forEach((r) => out.push(...(r.jobs || [])));
  }
  return { jobs: out, truncated: (first.total_pages || 1) > MAX_PAGES };
}

// ---------- aggregation ----------
const dollars = (cents) => (+cents || 0) / 100;              // HCP amounts are in cents
const isDone = (j) => /complete/i.test(j.work_status || "");
const jobDay = (j) => ymd(new Date(j.schedule?.scheduled_start || j.work_timestamps?.completed_at || j.created_at));
// Review bonus: completed jobs carrying this tag pay REVIEW_BONUS, split evenly across the crew on the job.
const REVIEW_TAG = (process.env.REVIEW_TAG || "LEFT REVIEW").trim().toLowerCase();
const REVIEW_BONUS = +process.env.REVIEW_BONUS || 10;
const hasReviewTag = (j) => (j.tags || []).some((t) => String(typeof t === "string" ? t : t?.name || "").trim().toLowerCase() === REVIEW_TAG);
const empName = (e) => (e.first_name ? (e.first_name + (e.last_name ? " " + e.last_name[0] + "." : "")).trim() : "Unassigned");

function build(jobs, r, truncated) {
  const done = jobs.filter(isDone);

  // empty buckets for every week / month in range so gaps show as $0
  const weeks = new Map(), months = new Map();
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) {
    const w = mondayOf(d), m = d.slice(0, 7);
    if (!weeks.has(w)) weeks.set(w, { date: w, revenue: 0, jobs: 0 });
    if (!months.has(m)) months.set(m, { date: m, revenue: 0, jobs: 0 });
  }

  const emps = new Map();
  const reviewMap = new Map(); // review bonus per employee
  let revenue = 0, reviewJobs = 0;
  for (const j of done) {
    const amt = dollars(j.total_amount);
    const day = jobDay(j);
    revenue += amt;
    const w = weeks.get(mondayOf(day)), m = months.get(day.slice(0, 7));
    if (w) { w.revenue += amt; w.jobs++; }
    if (m) { m.revenue += amt; m.jobs++; }

    // Each assigned employee gets credit for the job; revenue is split evenly between them.
    const crew = j.assigned_employees?.length ? j.assigned_employees : [{}];
    for (const e of crew) {
      const key = e.id || empName(e);
      const cur = emps.get(key) || { name: empName(e), revenue: 0, jobs: 0 };
      cur.revenue += amt / crew.length;
      cur.jobs += 1;
      emps.set(key, cur);
    }

    if (hasReviewTag(j)) {
      reviewJobs++;
      const month = day.slice(0, 7);
      for (const e of crew) {
        const key = e.id || empName(e);
        const cur = reviewMap.get(key) || { name: empName(e), reviews: 0, bonus: 0, byMonth: {} };
        const m = cur.byMonth[month] || (cur.byMonth[month] = { reviews: 0, bonus: 0 });
        const share = REVIEW_BONUS / crew.length;
        cur.reviews++; cur.bonus += share; m.reviews++; m.bonus += share;
        reviewMap.set(key, cur);
      }
    }
  }

  return {
    range: r,
    generatedAt: new Date().toISOString(),
    truncated,
    totals: { revenue, jobs: done.length, avgTicket: done.length ? revenue / done.length : 0 },
    monthly: [...months.values()],
    weekly: [...weeks.values()],
    reviews: {
      tag: REVIEW_TAG.toUpperCase(),
      perJob: REVIEW_BONUS,
      jobs: reviewJobs,
      months: [...months.keys()],
      employees: [...reviewMap.values()],
    },
    employees: [...emps.values()].map((e) => ({ ...e, revenue: Math.round(e.revenue * 100) / 100 })),
  };
}

export default async (req) => {
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  if (!process.env.HCP_API_KEY) return json({ error: "HCP_API_KEY is not set in Netlify" }, 500);

  const url = new URL(req.url);
  const r = resolveRange(url.searchParams.get("range") || "ytd");
  const hit = cache.get(r.key);
  if (hit && url.searchParams.get("fresh") !== "1" && Date.now() - hit.t < CACHE_MS) return json(hit.data);

  try {
    const { jobs, truncated } = await jobsBetween(r.start, r.end);
    const data = build(jobs, r, truncated);
    cache.set(r.key, { t: Date.now(), data });
    return json(data);
  } catch (err) {
    console.error(err);
    return json({ error: String(err.message || err) }, 502);
  }
};

export const config = { path: "/api/hcp-dashboard" };
