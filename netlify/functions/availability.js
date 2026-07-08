// Netlify Function: /.netlify/functions/availability?date=YYYY-MM-DD
// Proxies Housecall Pro's booking-windows endpoint so the API key never reaches the browser.
// Requires env var HCP_API_KEY (Netlify -> Site settings -> Environment variables).

const WINDOW_MINUTES = 120;          // 2-hour arrival windows
const FIRST_START = 7 * 60;          // earliest window start: 7:00 AM ET
const LAST_START = 14 * 60 + 30;     // latest window start:  2:30 PM ET (mirrors HCP widget)
const MIN_LEAD_MINUTES = 120;        // same-day bookings must start at least this far from now

function etParts(iso) {
  // Returns {date:"YYYY-MM-DD", minutes: minutes-past-midnight} in America/New_York
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10)
  };
}

function label12(mins) {
  let h = Math.floor(mins / 60), mm = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return h + ":" + String(mm).padStart(2, "0") + " " + ap;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60"
  };

  const date = (event.queryStringParameters || {}).date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "date required (YYYY-MM-DD)" }) };
  }

  const KEY = process.env.HCP_API_KEY;
  if (!KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "HCP_API_KEY not configured" }) };
  }

  try {
    const r = await fetch(
      "https://api.housecallpro.com/company/schedule_availability/booking_windows?start_date=" + date,
      { headers: { "Authorization": "Bearer " + KEY, "Accept": "application/json" } }
    );
    if (!r.ok) throw new Error("HCP responded " + r.status);
    const data = await r.json();

    // Map every 30-min segment of the requested day: minutes-past-midnight -> {available, iso}
    const seg = new Map();
    for (const w of (data.booking_windows || [])) {
      const p = etParts(w.start_time);
      if (p.date !== date) continue;
      seg.set(p.minutes, { available: !!w.available, iso: w.start_time });
    }

    // HCP widget rule: a 2-hour arrival window is offered only if every existing
    // 30-min segment it spans is available (segments past schedule end are ignored).
    const slots = [];
    for (let m = FIRST_START; m <= LAST_START; m += 30) {
      const startSeg = seg.get(m);
      if (!startSeg || !startSeg.available) continue;
      // same-day lead time: hide windows starting too soon
      if (new Date(startSeg.iso).getTime() - Date.now() < MIN_LEAD_MINUTES * 60000) continue;
      let ok = true;
      for (let k = 30; k < WINDOW_MINUTES; k += 30) {
        const s = seg.get(m + k);
        if (s && !s.available) { ok = false; break; }
      }
      if (!ok) continue;
      slots.push({
        label: label12(m) + " \u2013 " + label12(m + WINDOW_MINUTES),
        start: startSeg.iso,
        end: new Date(new Date(startSeg.iso).getTime() + WINDOW_MINUTES * 60000).toISOString()
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ date, slots }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: String(e) }) };
  }
};
