# ChaskaBox Static Site — Deployment Guide

## What's here
- `index.html` — homepage + shop (search, category filter, sort, product quick-view)
- `checkout.html` + `checkout.js` — cart checkout (COD / JazzCash QR + Till ID 981716438, Rs. 300 delivery / FREE on JazzCash 5000+)
- `admin.html` — password-protected product editor (default password: `chaska123` — change it)
- `products.json` — 243 active products with local images
- `images/` — 149 product photos + JazzCash QR
- `styles.css`, `app.js`

## Deploy to Netlify (free)
1. Push this folder to a GitHub repo (e.g. `chaskabox/chaskabox-site`)
2. Netlify → Add new site → Import from Git → select repo
3. Build settings: none needed (static). Publish directory: `.`
4. Deploy → you get `xxx.netlify.app`

## Connect chaskabox.online (Namecheap → Netlify)
1. Netlify → Site settings → Domain management → Add custom domain → `chaskabox.online` (also add `www.chaskabox.online`)
2. Netlify shows 4 DNS nameservers (dns1.p01.nsone.net etc.)
3. Namecheap → Domain List → chaskabox.online → Nameservers → Custom DNS → paste the 4 Netlify nameservers → Save
4. Wait 1–24h for DNS. Netlify auto-provisions HTTPS.

## Order emails (FormSubmit) — ONE-TIME activation
1. The checkout posts orders to `https://formsubmit.co/ajax/Chaskabox.mzg@gmail.com`
2. **First order triggers an activation email** to Chaskabox.mzg@gmail.com — Rameez must click "Activate" once
3. After that, every order emails automatically. Orders also save in the browser (Admin → Orders).

## Admin workflow (products/prices)
1. Open `/admin.html`, login (default `chaska123`)
2. Edit name/price/old price/pack, toggle Active
3. Click "Download products.json"
4. Replace `products.json` in the repo (or send to developer) → Netlify redeploys automatically

## Order numbers
Format `CB-DDMMYY-XXXXX` (e.g. CB-041026-48291). Random 5-digit suffix per order (no server-side counter on static).

## Notes / limits
- Admin password is a simple JS gate (deterrent, not bank-grade). Change `ADMIN_PASSWORD` in admin.html.
- `robots noindex` is set on admin.html.
- Inactive products are excluded from the storefront but kept in products.json (`active:false`).
