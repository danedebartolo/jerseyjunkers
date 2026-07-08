# Jersey Junkers — Site

Static site, deploys on Netlify.

## URL structure
- `/our-services/<service>/` — full service pages (indexed, in nav)
- `/<service>/` — ad landing twins (no nav, noindexed, canonical to the service page)
- `/locations/<county>-service/` — county pages
- `/book/` — booking wizard (all ZIP bars route here)

## First deploy
1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from GitHub → pick the repo.
3. No build command, publish directory = repo root. Deploy.
4. Site Settings → Domain management → add jerseyjunkers.com, follow the DNS instructions.
5. `_redirects` is picked up automatically — verify one (e.g. /see-prices) after deploy.

## Launch-day checklist
- Update Google Ads final URLs from the old `-nj` pages to the new `/<service>/` landing twins.
- Verify the domain in Google Search Console and resubmit the sitemap.
- Wire the booking wizard: in /book/index.html, find `BOOKING PAYLOAD` — send that object to a Zapier
  webhook or the HousecallPro API instead of console.log.
- Replace the Customer Portal `#` link in the header with the HCP portal URL.

## Updating the site
Edit → commit → push. Netlify redeploys automatically in ~30 seconds.
