// Hoarding cleanout landing page form -> Zapier ("HOARDING CLEANOUT REQUEST" zap)
// Builds both emails here so the Zap just maps single fields:
//   customer_subject / customer_html  -> Outlook (from info@) to the submitter
//   internal_subject / internal_html  -> Email by Zapier to info@jerseyjunkers.com
// The hook can be overridden with the Netlify env var ZAPIER_HOOK_HOARDING.
const HOOK_FALLBACK = 'https://hooks.zapier.com/hooks/catch/13137357/45w4klb/';
const FIELDS = ['name', 'email', 'phone', 'zip', 'service_option', 'timing', 'details', 'photos', 'source', 'gclid', 'wbraid', 'gbraid'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Y = '#F8D838', NAVY = '#003A70', INK = '#1a1a1a', FONT = 'Arial, Helvetica, sans-serif';

function step(n, html, last) {
  const pb = last ? 8 : 18;
  return `<tr>
          <td width="44" valign="top" style="padding:0 0 ${pb}px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" style="width:30px; height:30px; background:${INK}; border-radius:15px; font-family:${FONT}; font-size:14px; font-weight:bold; color:${Y};">${n}</td></tr></table>
          </td>
          <td valign="top" style="padding:3px 0 ${pb}px; font-family:${FONT}; font-size:15px; line-height:22px; color:${INK};">${html}</td>
        </tr>`;
}

function customerEmail(d) {
  const first = esc((d.name || '').trim().split(/\s+/)[0] || 'there');
  const opt = d.service_option || '';
  const isSession = /session|hourly/i.test(opt);
  const isCleanout = /cleanout/i.test(opt);
  const deadline = /deadline/i.test(d.timing || '');
  const hasPhotos = !!(d.photos && String(d.photos).trim());

  const label = isSession ? 'Hourly Session Request' : isCleanout ? 'Complete Cleanout Request' : 'Home Cleanout Request';

  let lead = isSession
    ? 'Thanks for reaching out about an hourly session. A real person from our team will call you within one business day to talk about the home and set up your first session.'
    : 'Thanks for reaching out about clearing the house. A real person from our team will call you within one business day to talk it through and get you a price.';
  if (deadline) lead += ' Since you mentioned a deadline, we&rsquo;ll move you to the front of the line.';

  const steps = isSession
    ? [
        '<strong>We&rsquo;ll call you</strong> to learn about the home, what you want to tackle first, and any questions you have.',
        '<strong>We&rsquo;ll book your first session</strong> &mdash; a 2-person crew, our truck, and bags show up ready to work.',
        '<strong>We work alongside you.</strong> You make the calls on what stays and what goes. Nothing leaves without your OK.',
      ]
    : [
        `<strong>We&rsquo;ll call you</strong> to learn about the home and your timeline.${hasPhotos ? ' Thanks for the photos &mdash; they help us get you an accurate number faster.' : ''}`,
        '<strong>We&rsquo;ll lock in one flat price</strong> from your photos or a free walkthrough. No on-site upcharges.',
        '<strong>We clear the whole house</strong> on a set start and finish date &mdash; every room, basement, attic and garage.',
      ];

  const recapTitle = isSession ? 'Your sessions at a glance' : 'Your cleanout at a glance';
  const recap = isSession
    ? [
        '<strong>$249/hour</strong> &middot; 2-hour minimum',
        '2-person crew, truck &amp; bags included',
        'You decide what stays &mdash; we do the heavy lifting',
        'Disposal priced by truck space used ($199&ndash;$949)',
        'Book more sessions anytime',
      ]
    : [
        '<strong>One flat price</strong>, locked before we start',
        'Every room cleared, floor to ceiling',
        'Valuables, photos &amp; papers set aside for you',
        'Donation &amp; recycling whenever possible',
        'Left clear and broom-swept',
      ];

  const fine = isSession
    ? 'Hourly sessions are billed at $249/hour with a 2-hour minimum. Disposal is billed separately based on how much truck space is used.'
    : 'Your flat price is confirmed after we review photos or walk the home, and it covers everything we agreed to remove. Licensed &amp; insured.';

  const preheader = isSession ? 'We got your session request. Here&rsquo;s what happens next.' : 'We got your request. Here&rsquo;s what happens next.';

  const summaryRows = [
    ['Option', esc(opt || 'Not sure yet')],
    ['Timing', esc(d.timing || 'Not specified')],
    ['ZIP', esc(d.zip || '&mdash;')],
    ['Photos', hasPhotos ? 'Received' : 'None yet &mdash; reply with a few anytime'],
  ]
    .map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0; font-family:${FONT}; font-size:13px; color:#6a6a6a; white-space:nowrap;" valign="top">${k}</td><td style="padding:3px 0; font-family:${FONT}; font-size:14px; color:${INK};">${v}</td></tr>`)
    .join('');

  const subject = isSession ? `We got your session request, ${first} | Jersey Junkers®` : `We got your request, ${first} | Jersey Junkers®`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>We received your request | Jersey Junkers®</title>
<style>
  body { margin:0; padding:0; background:#f2f2f2; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; display:block; outline:none; text-decoration:none; }
  a { text-decoration:none; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:26px !important; line-height:31px !important; }
    .cta a { font-size:15px !important; padding:15px 24px !important; white-space:nowrap !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#f2f2f2;">

<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f2f2f2;">
  ${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">
<tr><td align="center" style="padding:24px 10px;">

<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; background:#ffffff;">

  <!-- HEADER -->
  <tr><td style="height:6px; background:${Y}; font-size:0; line-height:0;">&nbsp;</td></tr>
  <tr>
    <td align="center" style="padding:22px 30px 18px;">
      <a href="https://www.jerseyjunkers.com" target="_blank">
        <img src="https://www.jerseyjunkers.com/images/jj-logo-banner.jpg" width="300" alt="Jersey Junkers® — New Jersey's Junk Removal Company" style="width:300px; max-width:100%; height:auto;">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" style="background:${NAVY}; padding:10px 20px; font-family:${FONT}; font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:#ffffff;">
      ${label}
    </td>
  </tr>

  <!-- HERO -->
  <tr>
    <td class="px" style="background:${INK}; padding:36px 44px 34px;">
      <h1 class="h1" style="margin:0; font-family:${FONT}; font-weight:900; font-size:30px; line-height:35px; text-transform:uppercase; color:#ffffff;">
        Thanks, ${first}.<br><span style="color:${Y};">We got your request.</span>
      </h1>
      <p style="margin:16px 0 0; font-family:${FONT}; font-size:16px; line-height:25px; color:#d6d6d6;">
        ${lead}
      </p>
    </td>
  </tr>

  <!-- WHAT HAPPENS NEXT -->
  <tr>
    <td class="px" style="padding:34px 44px 6px;">
      <div style="font-family:${FONT}; font-weight:900; font-size:20px; text-transform:uppercase; color:${NAVY}; padding-bottom:10px; border-bottom:3px solid ${Y};">What happens next</div>
    </td>
  </tr>
  <tr>
    <td class="px" style="padding:18px 44px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${steps.map((s, i) => step(i + 1, s, i === steps.length - 1)).join('\n        ')}
      </table>
    </td>
  </tr>

  <!-- RECAP -->
  <tr>
    <td class="px" style="padding:18px 44px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f5f0; border-radius:6px;">
        <tr>
          <td style="padding:20px 24px 6px; font-family:${FONT}; font-weight:bold; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${NAVY};">${recapTitle}</td>
        </tr>
        <tr>
          <td style="padding:4px 24px 20px; font-family:${FONT}; font-size:14.5px; line-height:24px; color:${INK};">
            ${recap.map((r) => `&#10003;&nbsp; ${r}`).join('<br>\n            ')}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- YOUR REQUEST -->
  <tr>
    <td class="px" style="padding:0 44px 30px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e2da; border-radius:6px;">
        <tr><td style="padding:16px 20px 4px; font-family:${FONT}; font-weight:bold; font-size:12px; letter-spacing:2px; text-transform:uppercase; color:${NAVY};">What you sent us</td></tr>
        <tr><td style="padding:4px 20px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${summaryRows}</table></td></tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td align="center" class="cta" style="padding:0 30px 14px;">
      <p style="margin:0 0 14px; font-family:${FONT}; font-size:15px; line-height:22px; color:${INK};">${deadline ? 'On a tight deadline? Call us now.' : 'Rather talk now? Give us a call.'}</p>
      <a href="tel:8885335865" style="display:inline-block; background:${Y}; color:${INK}; font-family:${FONT}; font-size:16px; font-weight:900; letter-spacing:1px; text-transform:uppercase; padding:16px 36px; border-radius:4px;">Call 888-533-5865</a>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:0 30px 30px; font-family:${FONT}; font-size:13px; line-height:20px; color:#5a5a5a;">
      Office hours: Mon–Fri 8AM–7PM &middot; Sat 8AM–12PM
    </td>
  </tr>

  <!-- FINE PRINT -->
  <tr>
    <td class="px" style="padding:0 44px 26px; font-family:${FONT}; font-size:11.5px; line-height:17px; color:#6a6a6a;">
      ${fine}
    </td>
  </tr>

  <!-- FOOTER -->
  <tr><td style="height:6px; background:${Y}; font-size:0; line-height:0;">&nbsp;</td></tr>
  <tr>
    <td align="center" style="background:${INK}; padding:26px 30px 28px; font-family:${FONT}; color:#cfcfcf;">
      <div style="font-weight:900; font-size:15px; letter-spacing:1px; color:#ffffff;">JERSEY JUNKERS®</div>
      <div style="margin-top:4px; font-size:13px; font-style:italic; color:${Y};">Your Junk, Our Mission: Simple, Fast, Gone!</div>
      <div style="margin-top:14px; font-size:13px; line-height:20px;">
        <a href="tel:8885335865" style="color:#ffffff; font-weight:bold;">888-533-5865</a> &nbsp;|&nbsp; <a href="https://www.jerseyjunkers.com" style="color:#ffffff;">www.jerseyjunkers.com</a>
      </div>
      <div style="margin-top:12px; font-size:11px; line-height:17px; color:#9a9a9a;">
        25 Railroad Ave #39, Atlantic Highlands, NJ 07716<br>
        You're receiving this because you requested service at jerseyjunkers.com.
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html };
}

function internalEmail(d) {
  const opt = d.service_option || 'Not selected';
  const isSession = /session|hourly/i.test(opt);
  const deadline = /deadline/i.test(d.timing || '');
  const digits = String(d.phone || '').replace(/\D/g, '');
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  const photos = String(d.photos || '').trim();
  const ads = d.gclid || d.wbraid || d.gbraid ? 'Yes (Google Ads click)' : 'No click ID';

  const row = (k, v) => `<tr><td style="padding:9px 0; border-bottom:1px solid #eeeeee; font-size:13px; color:#6a6a6a; width:120px;" valign="top">${k}</td><td style="padding:9px 0; border-bottom:1px solid #eeeeee; font-size:15px; color:${INK};">${v}</td></tr>`;

  const rows = [
    row('Name', `<strong>${esc(d.name)}</strong>`),
    row('Phone', digits ? `<a href="tel:${digits}" style="color:${NAVY}; font-weight:bold; text-decoration:none;">${esc(d.phone)}</a>` : '&mdash;'),
    row('Email', d.email ? `<a href="mailto:${esc(d.email)}" style="color:${NAVY};">${esc(d.email)}</a>` : '&mdash;'),
    row('ZIP', esc(d.zip || '—')),
    row('Option', `<strong>${esc(opt)}</strong>`),
    row('Timing', deadline ? `<strong style="color:#b00020;">${esc(d.timing)}</strong>` : esc(d.timing || '—')),
    row('Details', esc(d.details || '—').replace(/\n/g, '<br>')),
    row('Photos', photos ? `<a href="${esc(photos)}" style="color:${NAVY}; font-weight:bold;">View photos</a>` : 'None'),
    row('Source', `${esc(d.source || '—')}<br><span style="font-size:12px; color:#6a6a6a;">${ads}</span>`),
    row('Submitted', esc(when) + ' ET'),
  ].join('');

  const tag = isSession ? 'HOURLY SESSION' : /cleanout/i.test(opt) ? 'COMPLETE CLEANOUT' : 'HOARDING';
  const subject = `${deadline ? '⚠️ DEADLINE · ' : ''}HOARDING LEAD · ${tag} · ${d.name || ''}${d.zip ? ' (' + d.zip + ')' : ''}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New hoarding cleanout request</title>
</head>
<body style="margin:0; padding:0; background:#f2f2f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2;">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:100%; background:#ffffff; font-family:${FONT}; color:${INK};">

  <tr><td style="height:6px; background:${Y}; font-size:0; line-height:0;">&nbsp;</td></tr>
  <tr>
    <td style="background:${INK}; padding:22px 26px;">
      <div style="font-size:12px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; color:${Y};">Hoarding Cleanout &middot; ${isSession ? 'Hourly Session' : 'Complete Cleanout'}</div>
      <div style="margin-top:6px; font-size:22px; font-weight:900; text-transform:uppercase; color:#ffffff;">New request: ${esc(d.name || '')}</div>
      ${deadline ? `<div style="margin-top:8px; font-size:14px; font-weight:bold; color:${Y};">Has a deadline &mdash; call first.</div>` : ''}
    </td>
  </tr>
  <tr>
    <td style="padding:14px 26px 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${FONT};">${rows}</table>
    </td>
  </tr>
  ${digits ? `<tr><td align="center" style="padding:0 26px 26px;"><a href="tel:${digits}" style="display:inline-block; background:${Y}; color:${INK}; font-size:15px; font-weight:900; letter-spacing:1px; text-transform:uppercase; padding:14px 30px; border-radius:4px;">Call ${esc(d.name ? d.name.split(/\s+/)[0] : 'lead')}</a></td></tr>` : ''}
  <tr><td style="height:6px; background:${Y}; font-size:0; line-height:0;">&nbsp;</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { try { data = Object.fromEntries(new URLSearchParams(raw)); } catch { data = {}; } }
  if (data && typeof data.company === 'string' && data.company.trim() !== '') return new Response('ok', { status: 200 }); // honeypot

  const d = {};
  for (const k of FIELDS) if (data[k] != null) d[k] = String(data[k]).trim().slice(0, 4000);
  if (!d.name || !d.email || !d.phone) return new Response('Missing required fields', { status: 400 });

  const c = customerEmail(d);
  const i = internalEmail(d);
  const payload = {
    ...d,
    first_name: (d.name.split(/\s+/)[0] || ''),
    customer_subject: c.subject,
    customer_html: c.html,
    internal_subject: i.subject,
    internal_html: i.html,
    submitted_at: new Date().toISOString(),
  };

  const hook = process.env.ZAPIER_HOOK_HOARDING || HOOK_FALLBACK;
  try {
    await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {}
  return new Response('ok', { status: 200 });
};

