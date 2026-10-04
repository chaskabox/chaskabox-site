# YumTreats.pk — Competitor Deep Research
**Date:** 2026-10-04
**Purpose:** Analyze Pakistan's leading online snacks store to guide ChaskaBox UI/UX rebuild.
**Method:** Page-text fetches (homepage, /collections/all, /collections/croissants, 2 product pages), web search (reviews, policies, collections). Note: as a background agent I had no live-browser/screenshot access, so visual layout details are inferred from Shopify theme conventions + fetched content structure, not pixel-verified.

---

## 1. Site Overview

- **Platform:** Shopify (standard theme, `cdn.shop` assets)
- **Positioning:** "Pakistan's Favorite Online Snacks Store" / "Pakistan's No.1 Online Snacks Store 👑🍬"
- **Catalogue focus:** Nostalgic Pakistani childhood snacks (Top Pops, Winner, Zee Snacks, Candyland, etc.) — direct overlap with ChaskaBox's assortment
- **Pricing pattern:** Aggressive uniform discounting — nearly everything is **29–30% off**: Rs.199 (was Rs.284), Rs.349 (was Rs.499), Rs.249 (was Rs.356), Rs.375 (was Rs.536), Rs.649 (was Rs.927), Rs.699 (was Rs.999), Rs.999 (was Rs.1,427)
- **Policies:** Free shipping over **Rs.3,500** · **Minimum order Rs.599** · 7-day worry-free returns & exchanges · COD available · "100% Guaranteed Genuine Products"
- **Social proof engine:** heavy — homepage testimonials, per-product reviews, "sold in last X hours" counters, delivery countdown timers

---

## 2. Homepage (from fetched content)

**Structure (top → bottom):**
1. **Announcement bar** — 5 rotating trust messages (every page):
   - "Free Shipping on Orders Over Rs. 3,500! 🚚✨"
   - "100% Guaranteed Genuine Products – Your Trust Matters! 🍪"
   - "Experience Lightning-Fast Delivery Across Pakistan! 🚀📦"
   - "7-Day Worry-Free Returns & Exchanges! 🤝"
   - "Join Our Snack Lovers Club for Exclusive Discounts & Surprises! 🎁📬"
   - "A minimum of Rs. 599 is required to complete your order!"
2. **Hero: "SUMMER DEALS"** — single large promotional **image banner** (1500px wide), campaign-driven (currently summer deals; earlier: "Summer Special — 16% off"). No text-heavy hero, no product collage — just one bold sale banner.
3. **"Brand in Spotlight"** — brand-discovery section with intro copy ("Explore some of the brands we proudly offer…"), brand tiles/carousel
4. **Featured product card** — e.g. "Skiddi | Fruity Ice Pops – 100% Natural Mix Flavors", Rs.349 (was Rs.499), Sale + **Sold out** badges, Share button, "View full details" link
5. **"Snack Time, Anytime!"** — "Premium snacks delivered to your door" + **3 trust badges** (icon + title + one-liner):
   - Free shipping over Rs.3500 — "Get your favorite snacks delivered free when you spend Rs.3500 or more"
   - One-stop snack shop — "From savory to sweet, find all your favorite treats in one place"
   - Yum Treats exclusives — "Discover unique snacks and limited editions you won't find anywhere else"
6. **Customer testimonials** — review cards with names (Zainab Fatima, Ali Raza, Ayesha Khan…), emotional nostalgia copy ("treasure trove of childhood memories!")
7. **"Summer Special — Shop by"** — three-way browse: **Brands / Snacks / Flavours**

**Observations:**
- Hero is **one compact sale banner**, not a tall text hero — products/offers visible fast
- No "Shop by Category" circle-tile grid like ChaskaBox; discovery is via **Brands / Snacks / Flavours** taxonomy + deal collections
- Trust badges are **3 across with icons**, each with a supporting one-liner (more informative than icon-only)
- Testimonials are prominent and nostalgia-driven — matches the audience emotion

---

## 3. Category / Collection Pages (from /collections/all + filter URL evidence)

**Product card anatomy:**
- Product image (533px, consistent white-background pack shots)
- **Discount badge: "-29%" / "-30%"** on every card (top-left)
- Product name (brand + product + flavor)
- Price: "**From** Rs.199" (variant-aware) + old price struck through
- "Sale" badge; "Sold out" badge where applicable

**Filtering (evidence: `/collections/all?filter.p.m.custom.flavor=Creamy`):**
- Shopify **storefront filters** with custom product metafields (flavor filter confirmed: `filter.p.m.custom.flavor`)
- Standard Shopify behavior on mobile: filters collapse into a **"Filter" button opening a drawer/bottom sheet** — products stay visible; filters never consume the viewport (this is exactly the pattern ChaskaBox needs — see UX-RESEARCH.md)

**Category taxonomy:** product-type collections (`/collections/croissants`, `/collections/chickee`), brand collections, flavor filters, and **deal collections** (`/collections/psl-fever-deals`, "Chatori Special Summer Deal") — merchandising is deal/occasion-led, not just taxonomy-led.

**What's above the fold (inferred):** collection title + product grid starts immediately; filter/sort controls are compact buttons, not an open sidebar.

---

## 4. Product Detail Pages (from 2 fetched PDPs)

**Layout (Shopify standard, top → bottom):**
1. **Brand name** as small eyebrow ("Real Snax", "Zee Snacks", "Winner", "Sunder")
2. **Product title** — "[Brand] | [Product] – [Flavor] ([Pack info])", e.g. "Real Snax – Spicy Flavor Corn Puffs – Pack of 12"
3. **Price row:** Rs.349, ~~Rs.499~~ struck, "Sale" badge, "Sold out" badge if applicable
4. **Urgency widgets (JS):**
   - "🔥 145 sold in the last 3 hours" (social proof counter)
   - "🚚 Order within 33 hrs 51 mins 40 secs to get it by 7 October" (live delivery countdown)
5. **Description** — emoji headline ("Spice Up Your Snack Game! 🧨"), 2–3 short paragraphs, Roman-Urdu-friendly tone
6. **"Highlights" / "Why You'll Love It"** — bold-label bullet list (5 bullets: taste, texture, use-case, pack value, audience)
7. **Origin:** "Proudly made in Pakistan 🇵🇰"
8. **Storage Instructions** (1 line)
9. **"View full details"** expander (ingredients etc. hidden by default — keeps page compact)
10. **Share button**
11. **Customer Reviews section:**
    - Aggregate: "4.90 out of 5", "Based on 20 reviews", star-distribution bars (18★5, 2★4, 0…)
    - "See all reviews" + Sort dropdown
    - Individual reviews: date, reviewer name, title, body, "Review collected via store invitation"
    - Review tone is emotional/nostalgic and detailed (long-form, emoji-rich)
12. **Bundle products** add: "What's Included?" itemized list + "Why You'll Love It" bullets

**Notable:** variant selector ("From Rs.199" pricing), wishlist page exists (`/pages/wish-list`).

---

## 5. Mobile UX (inferred from Shopify conventions + content)

- Standard Shopify responsive theme: **hamburger menu**, sticky header with search + cart icons, announcement bar on top
- Filters = drawer/bottom sheet (never inline sidebar on mobile)
- Product grid = 2 columns on mobile (Shopify default)
- PDP = stacked layout: image → title/price → ATC → description → reviews; sticky add-to-cart is theme-dependent
- **Cannot verify pixel-level details** (no live browser in this environment) — recommend Rameez compare side-by-side on his phone

---

## 6. What ChaskaBox Should COPY ✅

| # | Pattern | Why it works | ChaskaBox action |
|---|---|---|---|
| 1 | **Compact sale-banner hero** (not tall text hero) | Offers visible immediately; page feels light on mobile | Replace/trim the tall hero; lead with a deal banner |
| 2 | **Filters in bottom sheet / drawer on mobile** | The exact fix for ChaskaBox's filter-eats-viewport problem | Implement per UX-RESEARCH.md |
| 3 | **Discount badge on EVERY card (-29%)** | Creates perpetual "deal" perception | ChaskaBox already has Sale badges — make % consistent/visible |
| 4 | **"🔥 X sold in last N hours" social proof** | Urgency + trust; cheap to implement (can start with honest counters) | Add to PDP (never fake numbers) |
| 5 | **Delivery countdown ("Order within X to get it by [date]")** | Converts browsers; answers the #1 question (when will it arrive?) | ChaskaBox already shows delivery dates — add countdown framing |
| 6 | **"Why You'll Love It" bullet format** | Scannable, benefit-led, fun tone | Template for ChaskaBox product descriptions |
| 7 | **Origin + Storage lines on PDP** | 2 lines that build trust, zero cost | Add to ChaskaBox PDP template |
| 8 | **"View full details" expander** | Keeps PDP compact; ingredients hidden until asked | Copy the pattern |
| 9 | **Review system with aggregate + distribution + invite-collected reviews** | +270–380% conversion lift (Baymard); ChaskaBox PDP already building this | Keep building; add "review collected" honesty label later |
| 10 | **Deal/bundle collections ("Chatori Special", "PSL Fever Deals")** | Occasion-led merchandising beyond plain categories | ChaskaBox "Bundles" category already exists — merchandise it as deals |
| 11 | **Announcement bar with rotating trust messages** | ChaskaBox has promo bar — expand message set (genuine products, 7-day returns equivalent, min order note) | Extend existing promo rotation |
| 12 | **Minimum-order + free-shipping threshold messaging** | Sets expectations upfront, reduces checkout abandonment | ChaskaBox: consider stating any minimum clearly if one exists |
| 13 | **Brand-eyebrow on PDP + "Shop by Brands/Snacks/Flavours"** | Extra discovery axis beyond categories | ChaskaBox has brand filter — surface "Shop by Brand" more prominently |

---

## 7. What to AVOID ❌

| # | Anti-pattern | Reason |
|---|---|---|
| 1 | **Uniform -29% on literally everything** | When everything is "on sale", nothing is — erodes price trust long-term. ChaskaBox should keep Sale badges honest (real discounts only) |
| 2 | **"Sold out" badges on featured homepage products** | Featuring a product you can't buy wastes the slot; ChaskaBox's no-stock model should avoid spotlighting unavailable items |
| 3 | **Fake urgency counters** | "145 sold in 3 hours" only works if true; never invent — ChaskaBox rule already prohibits this |
| 4 | **Emoji/flag overload** | "🇵🇰", "🧨", "🔥" everywhere is their brand voice; ChaskaBox should keep its own cleaner navy/gold/red voice — borrow structure, not style |
| 5 | **Relying on Shopify apps for everything** | Their reviews/urgency are apps; ChaskaBox static site must build lightweight equivalents (already doing: localStorage reviews) |
| 6 | **Text-only trust badges** | Their badges pair icon + one-liner explanation — ChaskaBox's icon-only badges could add one-liners too |

---

## 8. Side-by-Side: YumTreats vs ChaskaBox (current)

| Area | YumTreats | ChaskaBox (current) | Gap / Action |
|---|---|---|---|
| Hero | Compact sale image banner | Tall text hero ("Bachpan Ka Zaiqa…") + product collage | **Trim mobile hero** (already in progress) |
| Category display | Brands / Snacks / Flavours browse + deal collections | 10 illustrated circle tiles, horizontal scroll | ChaskaBox tiles are distinctive — keep; add a "Deals" entry point |
| Filters (mobile) | Drawer/bottom sheet, products first | Inline sidebar eats viewport | **P0 fix** — bottom sheet (planned) |
| Product cards | Image, -29% badge, name, From-price, old price | Image, PACK header, category, name, price, red add btn | ChaskaBox cards richer; consider % badge; fix PACK duplication w/ new photos |
| PDP | Brand eyebrow, price+sale, urgency widgets, highlights, origin/storage, expander, reviews w/ aggregate | Being built: image, name, price, description, reviews (localStorage) | Add: brand eyebrow, urgency (honest), origin/storage lines, "View full details" expander |
| Reviews | Aggregate 4.9/5 + distribution + 20 reviews + invite label | localStorage per-browser (not shared) | Honest limitation; consider shared backend later |
| Trust signals | 5-message announcement bar, 3 badges w/ one-liners, testimonials | Promo bar (4 msgs), 4 trust badges, no testimonials | Add one-liners to badges; testimonials section later |
| Pricing | Rs.199/349 uniform -29% | Real varied PKR prices | ChaskaBox more honest — keep |
| Min order / shipping | Rs.599 min, free ship Rs.3500, stated upfront | Rs.300 COD / free JazzCash 5000+ | ChaskaBox logic is in place; surface thresholds earlier (announcement bar) |
| AI assistant | None visible | FAQ+product-search+conversational AI | **ChaskaBox differentiator** — YumTreats has nothing like it |

---

## 9. Priority Recommendations for the Rebuild

**P0 (do first):**
1. Mobile filters → bottom sheet (matches YumTreats/Amazon/Daraz standard)
2. Compact mobile hero (~35% viewport, deal-led)
3. PDP: brand eyebrow + "Why You'll Love It" bullets + origin/storage + reviews aggregate display

**P1:**
4. Announcement bar: expand to 5–6 rotating trust messages (genuine products, delivery, returns, payment)
5. % discount badges on sale cards
6. Honest urgency: delivery countdown framing on PDP/cart
7. "Shop by Brand" discovery surface

**P2:**
8. Testimonials section (collect real ones first — never fake)
9. Bundle/deal merchandising ("Chatori"-style occasion deals using existing Bundles category)
10. Wishlist (YumTreats has it; nice-to-have)

**Never:**
- Fake "sold" counters, fake discounts, fake reviews — YumTreats' tactics only work because (presumably) real; ChaskaBox's standing no-invention rule stays.
