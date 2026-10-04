# FREE Hosting Research for ChaskaBox — Deep Research Report
**Date:** 2026-10-04
**Purpose:** Find completely FREE alternatives to Netlify for the ChaskaBox static e-commerce site.
**Research method:** Web research across official docs, 2026 pricing reviews, and real migration reports.

---

## 1. The Problem (Why Netlify Is Draining)

Netlify's free plan gives **300 credits/month**. Every production deploy consumes credits:
- Real-world example found: **~15 credits per production deploy** (a site deploying daily burned ~450 credits/month and got paused).
- ChaskaBox: 159 files / ~8MB per deploy → each push eats a big chunk.
- **When credits hit zero, Netlify PAUSES the site** until the next billing cycle (Nov 4). A paused store = zero sales.
- Rameez's usage: ~150 → 73.8 credits in a single day of active pushing. At this rate the site could go dark.

**Verdict:** Netlify free is no longer safe for an actively-developed store. Migration is strongly recommended.

---

## 2. Hosting Comparison (for a COMMERCIAL static store)

| Feature | **Cloudflare Pages** ⭐ | Netlify (current) | GitHub Pages | Vercel Hobby | Render Static |
|---|---|---|---|---|---|
| **Bandwidth** | **Unlimited** | 100 GB/mo (credits) | 100 GB/mo (soft) | 100 GB/mo | 100 GB/mo |
| **Builds/deploys** | **500/month** | 300 credits/mo (~15 per deploy) | ~10/hour | 6,000 min/mo, 100/day | Limited Git tracking on free |
| **Credit/pause system** | **None — never pauses** | **Yes — site pauses at 0** | No | No | No |
| **Commercial use (store)** | **✅ Allowed** | ✅ Allowed | **❌ PROHIBITED** (no e-commerce per ToS) | **❌ PROHIBITED** (suspends without warning) | ✅ Allowed |
| **Custom domain + free SSL** | ✅ (100 domains/project) | ✅ | ✅ | ✅ | ✅ |
| **Files per site** | 20,000 (ChaskaBox: 159 ✅) | — | 1 GB site cap | — | — |
| **Max file size** | 25 MB | — | 100 MB/repo file | — | — |
| **GitHub auto-deploy** | ✅ | ✅ | ✅ | ✅ | ⚠️ limited on free |
| **_redirects / _headers support** | ✅ (same format as Netlify) | ✅ | ❌ | ✅ | ⚠️ |
| **"Powered by" badge injected** | **No** | **Yes** (the annoying one!) | No | No | No |
| **CDN / speed** | 300+ edge cities (fastest) | Good | Good (Fastly) | 30 regions | CDN included |
| **Card required** | No | No | No | No | No |
| **Cost** | **$0 forever** | $0 until credits die | $0 | $0 (then $20/mo Pro) | $0 |

### Eliminated options (important!)
- **Vercel Hobby is OUT:** free plan explicitly bans ALL commercial use — "sites that sell products" are prohibited, and Vercel **suspends first without warning**. A store on Vercel free = risk of sudden takedown. Pro costs $20/month.
- **GitHub Pages is OUT:** GitHub's own docs say Pages is "not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site."
- **Render is weak:** 100 GB bandwidth cap + limited GitHub deploy tracking on free tier. No advantage over Cloudflare.

### 🏆 Winner: Cloudflare Pages
- Truly free, **no credit system, site can never be paused for usage**
- Unlimited bandwidth (traffic spikes cost $0 — on Netlify/Vercel they'd cost real money)
- Commercial use explicitly allowed
- **No "Powered by" badge** — the Netlify badge problem disappears permanently
- 500 builds/month is ~16 deploys/day — more than enough
- Same `_redirects`/`_headers` file format as Netlify (near-zero code changes)

---

## 3. Other Free Services

### 3a. Form-to-email (order emails)
ChaskaBox currently uses **FormSubmit** (free, unlimited submissions, already activated and working).
- **Recommendation: KEEP FormSubmit.** It works from ANY host — no change needed on migration.
- **Backup option:** Web3Forms — 250 submissions/month free, unlimited forms, spam protection, no account needed (key sent by email). Only switch if FormSubmit ever fails.

### 3b. Analytics (optional)
- **Cloudflare Web Analytics** — free, **unlimited pageviews**, cookieless (no cookie banner needed), auto-injects on Pages projects. Enable with one toggle in the dashboard. Only downside: 30-day data retention.
- Alternative: Umami Cloud free hobby tier (100K events/month, 3 sites).

### 3c. Uptime monitoring (optional)
- ⚠️ **UptimeRobot free is now NON-COMMERCIAL** (since Dec 2024) — not suitable for a business site.
- **Better Stack free:** 10 monitors, 3-minute checks, email/Slack/Discord alerts, commercial use OK. Good enough to know if the store goes down.

---

## 4. Migration Guide: Netlify → Cloudflare Pages (Step by Step)

**Time needed:** ~30–60 minutes (mostly waiting for DNS).
**Cost:** $0. **Risk:** Low — keep Netlify live as backup until Cloudflare is verified.

### What you need
- A Cloudflare account (free, signup at dash.cloudflare.com — email only, no card)
- Access to Namecheap (where chaskabox.online was bought)
- The GitHub repo `chaskabox/chaskabox-site` (already exists)

### Step 0 — Clean up the repo (do this BEFORE migrating)
1. Delete the test file `ai-test.html` from the repo (it was a scratch test page, must not go public).
2. The `netlify.toml` file will be replaced (see Step 5).

### Step 1 — Create Cloudflare account
1. Go to **dash.cloudflare.com** → Sign up (free).
2. No credit card asked.

### Step 2 — Add the domain to Cloudflare DNS
1. Dashboard → **"+ Add" → "Connect a domain"** → enter `chaskabox.online`.
2. Choose **"Quick scan for DNS records"** (imports existing records) → select **Free plan**.
3. Cloudflare gives you **2 nameservers** (like `adam.ns.cloudflare.com`, `bella.ns.cloudflare.com`). **Write them down.**

### Step 3 — Create the Pages project
1. Dashboard → **Workers & Pages → "Create" → "Pages" → "Connect to Git"**.
2. Authorize GitHub → select repo **`chaskabox/chaskabox-site`** → branch `main`.
3. Build settings (ChaskaBox has NO build step — it's plain HTML/CSS/JS):
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (repo root, where index.html lives)
4. **"Save and Deploy"** → you get a URL like `chaskabox-site.pages.dev`.
5. Open it and verify: homepage, categories, cart, checkout, images all load.

### Step 4 — Convert Netlify config to Cloudflare format
In the repo root, create a file named **`_headers`** with this content (replaces netlify.toml):
```
# Cache rules (same as old netlify.toml)
/products.json
  Cache-Control: public, max-age=300
/images/*
  Cache-Control: public, max-age=86400
```
Then **delete `netlify.toml`** (Cloudflare ignores it; removing avoids confusion).
Optional cleanup: the Netlify-badge-hiding CSS in styles.css is now unnecessary (Cloudflare injects no badge) — harmless to leave, remove when convenient.
Commit + push → Cloudflare auto-redeploys.

### Step 5 — Add the custom domain
1. Pages project → **Custom domains → "Set up a custom domain"** → enter `chaskabox.online`.
2. (Cloudflare wires DNS + free SSL automatically once nameservers point to it.)

### Step 6 — Switch nameservers at Namecheap ⚠️ (the only "scary" step)
1. Namecheap → **Domain List → Manage** `chaskabox.online`.
2. **Nameservers** section → change to **"Custom DNS"**.
3. Replace Netlify's 4 nameservers (`dns1–4.p09.nsone.net`) with Cloudflare's **2 nameservers** from Step 2.
4. Save. Propagation: usually 1–2 hours (up to 48h max).
5. During propagation some visitors hit Netlify, some hit Cloudflare — **both serve the same site**, so nothing breaks.
6. Check status at **dnschecker.org** (search `chaskabox.online`, type NS) until Cloudflare's nameservers show worldwide.

### Step 7 — Verify, then retire Netlify
1. Open `https://chaskabox.online` → padlock ✅, **no "Powered by Netlify" badge** ✅.
2. Test on phone: homepage, category tiles, cart, checkout, AI button.
3. Check `https://chaskabox.online/sitemap.xml` and `/robots.xml` load.
4. Keep the Netlify site untouched for ~30 days as rollback insurance, then delete the Netlify site (frees the Netlify account entirely).
5. Optional: enable **Cloudflare Web Analytics** (one toggle in Pages project settings) for free visitor stats.

### What does NOT need to change
- **FormSubmit order emails:** work from any host. No change.
- **GitHub workflow:** push to `main` → Cloudflare auto-deploys (same as Netlify did).
- **Domain registration:** stays at Namecheap (only nameservers change). Auto-renew stays OFF as Rameez set it.
- **sitemap.xml / robots.txt / SEO tags:** domain unchanged, keep as-is.
- **JazzCash QR, Till ID, delivery logic, admin panel:** all static files, unaffected.

---

## 5. Credit Math (why this can't wait)

| Item | Number |
|---|---|
| Netlify free credits/month | 300 |
| Cost per production deploy (observed) | ~15 credits |
| Rameez's remaining (2026-10-04) | **73.8** |
| Deploys left before site PAUSES | **~4–5** |
| Credit reset date | **Nov 4, 2026** |
| Cloudflare Pages builds/month | 500 (each deploy = 1, **$0**) |
| Cloudflare bandwidth | Unlimited (**$0** even if site goes viral) |

Every deploy from now on must be batched and deliberate. After migration, this entire worry disappears.

---

## 6. Sources
- Cloudflare Pages free-tier limits: developers.cloudflare.com (500 builds/mo, unlimited bandwidth, 20k files/site, commercial use allowed)
- Netlify credit system: netlify.com/pricing + real migration report (tallgibbs/2026_mens_world_cup_tracker — 300 credits exhausted by daily deploys at ~15 credits each)
- Vercel Hobby commercial ban: vercel.com/docs/plans/hobby + vercel.com/docs/limits/fair-use-guidelines
- GitHub Pages e-commerce ban: docs.github.com — "GitHub Pages limits"
- `_headers`/`_redirects` format: developers.cloudflare.com/pages/configuration/headers/
- Form backends 2026: dev.to comparisons (Web3Forms 250/mo free, Formspree 50/mo, Basin 100/mo)
- UptimeRobot free non-commercial: uptimerobot.com ToS change Dec 2024; Better Stack free tier as alternative
- Cloudflare Web Analytics: free, unlimited pageviews, cookieless

*Free-tier details change over time — re-verify on the provider's official pricing page before migrating.*
