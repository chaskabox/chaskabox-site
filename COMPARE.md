# ChaskaBox — Live Site vs Original Video: Detailed Comparison

**Date:** 2026-10-04
**Live site:** https://chaskabox.online/ (source: `~/workspace/chaskabox-static/`)
**Original:** video `workspace/user/media_library/video/ad/adbb2a1d0b4a49d26f2a9766cb820c77098ed0290105c2f5d22ab8184a1b1af0.mp4` (10 frames extracted, all reviewed)
**Status:** READ-ONLY comparison — no changes made.

---

## ✅ MATCH (live site matches original)

| # | Section | Detail |
|---|---------|--------|
| 1 | Header layout | Logo left · "Categories" / "Brands" text links · moon theme-toggle icon · dark "Bag" pill with gold count badge |
| 2 | Hero card | Dark navy rounded card with margins; kick pill "Fresh picks for every craving" (gold dot); gold small-caps eyebrow "PAKISTANI SNACKS ONLINE."; H1 "Crunch. Munch." white + "Chaska on." red/coral; subtext matches word-for-word |
| 3 | Hero CTA | Gold button "Explore bundle boxes ›" |
| 4 | Trust badges | INSIDE hero bottom, 4 columns with gold icons + subtitles: 100% Original (Original market brands) · Big variety (Sweet, salty & spicy) · Cash on Delivery (Pay when it arrives) · Nationwide Delivery (4–7 days across Pakistan) |
| 5 | SHOP BY CATEGORY band | Full-width green band (`#3d8b5f`), centered white bold "SHOP BY CATEGORY" |
| 6 | Category tiles (shape) | Simple circles with white wave/scallop at bottom, bold name below, "N items" count below that |
| 7 | Shelf bands | Full-width colored band, bold white UPPERCASE title left, "View all →" + two circular ← → arrow buttons right |
| 8 | Product card | Navy "PACK OF N" header over image · red small-caps category label · product name · bold pack line · mint-green "Delivery Details" box with green estimated dates · price left + red circular "+" button right · red "Sale" badge top-left of image |
| 9 | Cart drawer | Right slide-in "Your snack bag", product thumbnails, − qty + steppers, dark checkout button at bottom |
| 10 | AI button | Red pill "Ask ChaskaBox AI" fixed bottom-right (static version is FAQ-based — see Differences) |
| 11 | Dark mode | Moon-icon theme toggle exists in original header too; both support dark theme |
| 12 | Footer | Navy 4-column footer with contact / delivery / payment info (not visible in video — consistent with business data) |
| 13 | Checkout | COD + JazzCash, QR + Till ID 981716438, Rs.300/FREE delivery logic (not visible in video — user-approved) |

---

## ❌ DIFFERENT (live site differs from original)

| # | Section | Original | Live site |
|---|---------|----------|-----------|
| 1 | **Category tile artwork** | Custom flat illustrations per category (cookie stack, cupcake, mint leaves, chocolate bars, lollipops, jelly bowl, snack bowl, betel leaves, gift box) | Real product photos in circles, zoomed 1.25× to crop PACK text |
| 2 | **Tile order** | All · Biscuits & Wafers · Bunties & Cakes · Chews & Gums · Chocolates & Candies · Imli & Ice Lollies · Jellies & Marshmallow · Snacks & Nimco · Betel Nuts & Pan Masala · Bundles | Alphabetical: All · Betel Nuts… · Biscuits… · Bundles · Bunties… · Chews… · Chocolates… · Imli… · Jellies… · Snacks… |
| 3 | **Shelf order (homepage)** | Biscuits & Wafers first (after category section), then Bunties & Cakes, Chews & Gums… | Bundles first, then Snacks & Nimco, Chocolates & Candies… (`CAT_ORDER` in app.js) |
| 4 | **Band color: Biscuits & Wafers** | Brown (`#5d4037`-ish) | Green `#5f8f5b` — visibly wrong |
| 5 | **Band color: Bunties & Cakes** | Purple/mauve | Brown `#8a6d4a` — visibly wrong |
| 6 | **Hero right side** | Plain dark gradient, no imagery | 3-product-image floating collage (`#heroCollage`) |
| 7 | **Header logo size** | Small (~40px) | 60px (user already flagged header as too tall) |
| 8 | **Header search icon** | None (Categories/Brands links only) | Extra SVG search icon (user-requested — keep) |
| 9 | **"All" tile count** | "All — 243 items" | "All — 249 items" (6 bundles added) |
| 10 | **Cart line item** | "Rs. 450 each" (unit price only) | "Rs. 450 × 1 = Rs. 450" |
| 11 | **Cart footer** | Single row: "Total … Rs. 846" | Three rows: Subtotal / Delivery / Total |
| 12 | **Cart title** | "Your snack bag" | "Your Snack Bag 🛒" |
| 13 | **Cart CTA** | "Continue to checkout" | "Checkout →" |
| 14 | **PACK header sublabel** | Small red sublabel under "PACK OF 12" (e.g. "Egg & Chocolate Cookies") | Plain pack text only |
| 15 | **AI capability** | Conversational assistant | Static FAQ (14 Q&As) — honest static-site limitation |

---

## ⚠️ MISSING (in original, absent from live site)

| # | Section | What's missing |
|---|---------|----------------|
| 1 | Category page | Breadcrumb "Home / Biscuits & Wafers" |
| 2 | Category page | Dark banner with themed background image per category + big white category name + gold "N products" badge |
| 3 | Category page | Filters sidebar: "Filters / Clear all", Brand checkboxes with counts, Price range (Min–Max), Pack size dropdown |
| 4 | Category page | Search placeholder "Search {Category}" (live: generic "Search snacks...") |
| 5 | Category page | Sort default "Featured" (live: "Sort: Popular") |
| 6 | Category page | "N results" wording (live: "N products") |
| 7 | Product cards | "CHASKABOX — Photo coming soon" placeholder for imageless products (live: 🍪 emoji box) |
| 8 | Promo bar | No promo bar visible in any video frame (live has "100% original packs" bar) — possibly extra; unverifiable from video alone |

---

## 🔍 UNVERIFIABLE (not shown in video)

- Footer content/layout, quick-view modal, checkout page, admin panel, SEO tags — no video coverage; these are user-approved additions.

---

## 🎯 Suggested fix priority (for parent's planning — DO NOT implement without user approval)

1. **P0 — Band colors** (visually wrong): Biscuits & Wafers → brown; Bunties & Cakes → purple/mauve.
2. **P0 — Tile & shelf order**: match original category sequence.
3. **P1 — Category page**: breadcrumb + banner + filters sidebar (biggest structural gap).
4. **P1 — Hero**: remove product collage (original is clean gradient).
5. **P2 — Cart drawer**: "Rs. X each" line, single Total row, "Continue to checkout" label, title casing.
6. **P2 — Category tiles**: custom illustrations vs product photos (larger art task; current photos are an accepted approximation).
7. **P3 — Minor**: PACK sublabel, "Photo coming soon" placeholder, search placeholder, sort label, "N results" wording, logo size (user already discussing).

**Note on credits:** user explicitly forbade further deploys without his prior approval (Netlify credits at ~50%). Bundle all approved fixes into ONE deploy.
