# ChaskaBox Fix List — PENDING (do NOT execute yet)

User instruction (2026-10-04): Fix everything EXCEPT #5 (hero collage stays for now).
Wait for user's "go" before starting. Bundle ALL fixes into ONE deploy.

## P0 — Critical (updated 2026-10-04 after careful video comparison)
1. **Band colors fix:**
   - Biscuits & Wafers: `#5f8f5b` (green) → BROWN (original)
   - Bunties & Cakes: `#8a6d4a` (brown) → PURPLE/MAUVE (original)
   - Verify all other band colors against video frames

2. **Tile order fix:**
   - Current: alphabetical
   - Target: All → Biscuits → Bunties → Chews → Chocolates → Imli → Jellies → Snacks → Betel Nuts → Bundles

3. **Shelf order fix:**
   - Current: Bundles first
   - Target: Biscuits & Wafers first (match tile order)

14. **Category tiles — custom illustrations (BIGGEST visual gap):**
   - Current: product photos in circles (PACK text visible, cluttered)
   - Original: clean custom illustrations per category:
     - All: colorful snack bowl (cookies, candies, chips)
     - Biscuits & Wafers: biscuit/cookie stack (brown bg)
     - Bunties & Cakes: pink cupcake with sprinkles (purple bg)
     - Chews & Gums: mint leaves (teal bg)
     - Chocolates & Candies: (red bg)
     - Imli & Ice Lollies: (orange bg)
     - Jellies & Marshmallow: (pink bg)
     - Snacks & Nimco: (tan bg)
     - Betel Nuts & Pan Masala: betel leaves (green bg)
     - Bundles: gift box (gold bg)
   - Action: Generate clean SVG/CSS illustrations for each (no product photos, no PACK text)

15. **Header — hamburger menu:**
   - Original mobile header has hamburger (☰) menu
   - Current: search icon instead
   - Action: Add hamburger menu on mobile that opens category nav drawer
   - Keep search icon too (user requested it)

## P1 — Major
4. **Category page rebuild:**
   - Add breadcrumb
   - Dark themed banner with gold "N products" badge
   - Filters sidebar: Brand checkboxes, Price range, Pack size
   - Search placeholder text fix
   - Sort: "Featured" (not "Popular")
   - "N products" (not "N results")
   - "Photo coming soon" placeholder (not 🍪 emoji)

5. ~~Hero collage removal~~ — SKIPPED per user (keep for now)

## Mobile Comparison (2026-10-04)

**Issues found on mobile (max-width:760px):**
1. Category tiles: 3 per row → 10 tiles = last row mein 1 akela (odd lagta hai)
2. Header logo 60px mobile par bara lag sakta hai
3. Hero collage 220px — chhoti screen par zyada jagah leta hai
4. No hamburger menu (Categories/Brands hidden on mobile — tiles se accessible hai, so OK)

**Fixes:**
- Tiles: 2 per row ya better spacing
- Logo: mobile par 48px
- Hero collage: mobile par chhota (160px)

---

## P2 — Medium
13. **Netlify badge hide:**
   - "Powered by Netlify" badge AI button ko dhak raha hai
   - CSS ready hai (styles.css mein added, not pushed): `div[class*="netlify"], a[href*="netlify.com"] img{display:none!important}`
   - Include in next deploy

6. **Cart drawer text:**
   - "Rs. 450 × 1 = Rs. 450" → "Rs. 450 each"
   - 3-row footer (Subtotal/Delivery/Total) → single "Total" row
   - "Your Snack Bag 🛒" → "Your snack bag"
   - "Checkout →" → "Continue to checkout"

7. **PACK header sublabel:**
   - Add small red sublabel under PACK (e.g. "Egg & Chocolate Cookies")

8. **Category tiles:**
   - Current: product photos (zoomed)
   - Target: closer to original custom illustrations
   - (Full custom illustrations not feasible on static; improve as much as possible)

9. **"All" tile count:** "249 items" — verify correct (243 + 6 bundles)

## P3 — Minor / Notes
10. AI button stays FAQ-based (static-site limitation, cannot make conversational)
11. Header logo already at 60px per user
12. Search icon in header — keep (user-requested)

## Deploy rule
- ONE deploy only. Batch all fixes. Get user approval before pushing.
- Netlify credits: ~150 left. Muse limits: 4% left — be efficient.
