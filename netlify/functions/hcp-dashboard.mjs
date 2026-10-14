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

function isAdmin(req) {
  const pw = process.env.DASHBOARD_ADMIN_PASSWORD;
  if (!pw) return false;
  const want = createHash("sha256").update("jj-admin:" + pw).digest("hex");
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)jj_admin=([a-f0-9]{64})/);
  return !!m && m[1] === want;
}
// Admin-only raw sample: /api/hcp-dashboard?range=ytd&debug=1
function debugInfo(jobs, r) {
  const statuses = {};
  jobs.forEach((j) => (statuses[j.work_status || "none"] = (statuses[j.work_status || "none"] || 0) + 1));
  const money = (j) => Object.fromEntries(Object.entries(j).filter(([k, v]) => /amount|total|balance|price|subtotal|tax|discount/i.test(k) && typeof v !== "object"));
  return {
    range: r, fetched: jobs.length, statuses,
    revenueField: REVENUE_MODE,
    // Completed in this range but never put on the calendar — these were missing before the fix
    completedWithoutSchedule: uniqDone(jobs, r.start, r.end)
      .filter((j) => !j.schedule?.scheduled_start)
      .map((j) => ({
        invoice: j.invoice_number,
        customer: [j.customer?.first_name, j.customer?.last_name].filter(Boolean).join(" ") || j.customer?.company || "",
        completed: j.work_timestamps?.completed_at ? ymd(new Date(j.work_timestamps.completed_at)) : "",
        revenue: Math.round(revenueOf(j) * 100) / 100,
        crew: crewOf(j).map((e) => e.first_name).join(", "),
        description: (j.description || "").slice(0, 80),
      })),
    // dollars summed over the exact jobs the dashboard counts, for every money-looking field HCP sends
    fieldSums: (() => {
      const done = uniqDone(jobs, r.start, r.end), sums = {};
      for (const j of done) for (const [k, v] of Object.entries(j))
        if (typeof v === "number" && /amount|total|balance|price|subtotal|tax|discount/i.test(k)) sums[k] = (sums[k] || 0) + v / 100;
      sums["(dashboard revenue)"] = done.reduce((t, j) => t + revenueOf(j), 0);
      sums["(total_amount / 1.06625)"] = (sums.total_amount || 0) / 1.06625;
      return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round(v * 100) / 100]));
    })(),
    // Jobs whose total isn't simply subtotal + NJ tax — discounts, fees, tax-exempt, etc.
    oddJobs: (() => {
      const list = uniqDone(jobs, r.start, r.end)
        .filter((j) => typeof j.subtotal === "number" && Math.abs((+j.total_amount || 0) - Math.round(j.subtotal * (1 + NJ_TAX))) > 2)
        .map((j) => {
          const total = (+j.total_amount || 0) / 100, sub = j.subtotal / 100, expected = Math.round(j.subtotal * (1 + NJ_TAX)) / 100;
          return {
            invoice: j.invoice_number,
            customer: [j.customer?.first_name, j.customer?.last_name].filter(Boolean).join(" ") || j.customer?.company || "",
            completed: j.work_timestamps?.completed_at ? ymd(new Date(j.work_timestamps.completed_at)) : "",
            subtotal: sub, total, totalIfTaxed: expected,
            totalMinusTaxGuess: Math.round(total / (1 + NJ_TAX) * 100) / 100,
            looksLike: total === sub ? "no tax charged" : total < expected ? "less than subtotal + tax (discount?)" : "more than subtotal + tax (fee/tip?)",
          };
        });
      return { count: list.length, subtotalOfOddJobs: Math.round(list.reduce((t, x) => t + x.subtotal, 0) * 100) / 100, jobs: list };
    })(),
    sample: jobs.filter(isDone).slice(0, 8).map((j) => ({
      invoice: j.invoice_number, status: j.work_status,
      scheduled: j.schedule?.scheduled_start, completed: j.work_timestamps?.completed_at,
      ...money(j),
    })),
  };
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
// Jobs created since a date, newest first, regardless of schedule.
// Catches jobs that were completed without ever being put on the calendar.
async function jobsCreatedSince(startStr) {
  const cutoff = startOfDayET(startStr).getTime();
  const out = [];
  for (let p = 1; p <= MAX_PAGES; p += 4) {
    const batch = [];
    for (let q = p; q < p + 4; q++) batch.push(hcp("/jobs", { page: q, page_size: PAGE_SIZE, sort_by: "created_at", sort_direction: "desc" }));
    const res = await Promise.all(batch);
    let oldest = Infinity, empty = false;
    for (const r of res) {
      const list = r.jobs || [];
      if (!list.length) empty = true;
      out.push(...list);
      for (const j of list) oldest = Math.min(oldest, +new Date(j.created_at));
    }
    if (empty || oldest < cutoff || p + 3 >= (res[0].total_pages || 1)) break;
  }
  return out;
}

// ---------- aggregation ----------
const dollars = (cents) => (+cents || 0) / 100;              // HCP amounts are in cents
// Revenue = job total WITHOUT sales tax, to match HCP's "Job revenue earned" report.
// Uses the job's tax field if HCP sends one, otherwise its subtotal, otherwise backs out NJ tax.
const NJ_TAX = +process.env.SALES_TAX_RATE || 0.06625;
let REVENUE_MODE = "unknown";
function revenueOf(j) {
  const total = +j.total_amount || 0;
  const taxKey = Object.keys(j).find((k) => /tax/i.test(k) && !/rate|percent|exempt|able/i.test(k) && typeof j[k] === "number");
  if (taxKey) { REVENUE_MODE = `total_amount - ${taxKey}`; return (total - j[taxKey]) / 100; }
  if (typeof j.subtotal === "number") { REVENUE_MODE = "subtotal"; return j.subtotal / 100; }
  REVENUE_MODE = "total_amount / (1 + tax rate)";
  return total / (1 + NJ_TAX) / 100;
}
const isDone = (j) => /complete/i.test(j.work_status || "");
// Revenue counts on the day the job was COMPLETED (falls back to scheduled date if HCP has no completion stamp).
const jobDay = (j) => ymd(new Date(j.work_timestamps?.completed_at || j.schedule?.scheduled_start || j.created_at));
// Review bonus: completed jobs carrying this tag pay REVIEW_BONUS, split evenly across the crew on the job.
const REVIEW_TAG = (process.env.REVIEW_TAG || "LEFT REVIEW").trim().toLowerCase();
const REVIEW_BONUS = +process.env.REVIEW_BONUS || 10;
const hasReviewTag = (j) => (j.tags || []).some((t) => String(typeof t === "string" ? t : t?.name || "").trim().toLowerCase() === REVIEW_TAG);
// Placeholder "employees" like "1st Route" / "2nd Route" are not people: never credited, never counted in splits.
const isRoute = (e) => /\broute\b/i.test(`${e.first_name || ""} ${e.last_name || ""}`);
// Only these first names appear in the per-employee revenue / job sections (env DASHBOARD_EMPLOYEES overrides).
const SHOWN = (process.env.DASHBOARD_EMPLOYEES || "Dane,Marcus,Dom,Christian,Anthony").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const isShown = (e) => { const f = String(e.first_name || "").trim().toLowerCase(); return SHOWN.some((n) => f === n || f.startsWith(n)); }; // "Dom" matches "Dominic"
const crewOf = (j) => (j.assigned_employees || []).filter((e) => !isRoute(e));
const empName = (e) => (e.first_name ? (e.first_name + (e.last_name ? " " + e.last_name[0] + "." : "")).trim() : "Unassigned");

function uniqDone(jobs, start, end) {
  const seen = new Set();
  return jobs.filter((j) => {
    if (!isDone(j) || (j.id && seen.has(j.id))) return false;
    if (j.id) seen.add(j.id);
    const d = jobDay(j);
    return d >= start && d <= end;
  });
}

function build(jobs, r, truncated) {
  const done = uniqDone(jobs, r.start, r.end);

  // empty bucket for every month in range so gaps show as $0
  const months = new Map();
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) {
    const m = d.slice(0, 7);
    if (!months.has(m)) months.set(m, { date: m, revenue: 0, jobs: 0 });
  }

  const emps = new Map();
  const reviewMap = new Map(); // review bonus per employee
  let revenue = 0, reviewJobs = 0;
  for (const j of done) {
    const amt = revenueOf(j);
    const day = jobDay(j);
    revenue += amt;
    const m = months.get(day.slice(0, 7));
    if (m) { m.revenue += amt; m.jobs++; }

    // Real crew on the job (routes removed). Revenue + review bonus split evenly between them.
    const crew = crewOf(j);
    for (const e of crew) {
      if (!isShown(e)) continue; // still counts in the split, just not displayed
      const key = e.id || empName(e);
      const cur = emps.get(key) || { name: empName(e), revenue: 0, jobs: 0 };
      cur.revenue += amt / crew.length;
      cur.jobs += 1;
      emps.set(key, cur);
    }

    if (hasReviewTag(j)) {
      reviewJobs++;
      const month = day.slice(0, 7);
      for (const e of crew.length ? crew : [{}]) {
        const key = e.id || empName(e);
        const cur = reviewMap.get(key) || { name: empName(e), reviews: 0, bonus: 0, byMonth: {} };
        const mm = cur.byMonth[month] || (cur.byMonth[month] = { reviews: 0, bonus: 0 });
        const share = REVIEW_BONUS / Math.max(crew.length, 1);
        cur.reviews++; cur.bonus += share; mm.reviews++; mm.bonus += share;
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

// Current week, Monday through Saturday (Sunday shows only if there was Sunday work), plus last week's total.
function buildWeek(jobs) {
  const today = ymd(new Date());
  const mon = mondayOf(today), lastMon = addDays(mon, -7);
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ date: addDays(mon, i), revenue: 0, jobs: 0 });
  let lastWeek = 0, lastWeekJobs = 0, lastWeekToDate = 0;
  const dow = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = Monday
  for (const j of uniqDone(jobs, lastMon, today)) {
    const d = jobDay(j), amt = revenueOf(j);
    if (d >= mon) { const slot = days.find((x) => x.date === d); if (slot) { slot.revenue += amt; slot.jobs++; } }
    else {
      lastWeek += amt; lastWeekJobs++;
      if (d <= addDays(lastMon, dow)) lastWeekToDate += amt;
    }
  }
  if (!days[6].revenue) days.pop(); // hide Sunday unless worked
  return {
    start: mon, today, days,
    revenue: days.reduce((s, x) => s + x.revenue, 0),
    jobs: days.reduce((s, x) => s + x.jobs, 0),
    lastWeek, lastWeekJobs, lastWeekToDate,
  };
}

export default async (req) => {
  if (!authed(req)) return json({ error: "unauthorized" }, 401);
  if (!process.env.HCP_API_KEY) return json({ error: "HCP_API_KEY is not set in Netlify" }, 500);

  const url = new URL(req.url);
  const r = resolveRange(url.searchParams.get("range") || "ytd");
  const debug = url.searchParams.get("debug") === "1" && isAdmin(req);
  const hit = cache.get(r.key);
  if (!debug && hit && url.searchParams.get("fresh") !== "1" && Date.now() - hit.t < CACHE_MS) return json(hit.data);

  try {
    const today = ymd(new Date());
    // look back 60 days: a job scheduled earlier can be completed inside the range
    const [{ jobs: scheduled, truncated }, created, recent] = await Promise.all([
      jobsBetween(addDays(r.start, -60), r.end),
      jobsCreatedSince(addDays(r.start, -60)),
      jobsBetween(addDays(mondayOf(today), -30), today),
    ]);
    const jobs = [...scheduled, ...created]; // uniqDone() de-dupes by job id
    const recentAll = [...recent.jobs, ...created];
    if (debug) return json(debugInfo(jobs, r));
    const data = { ...build(jobs, r, truncated), week: buildWeek(recentAll) };
    cache.set(r.key, { t: Date.now(), data });
    return json(data);
  } catch (err) {
    console.error(err);
    return json({ error: String(err.message || err) }, 502);
  }
};

export const config = { path: "/api/hcp-dashboard" };
