# ChaskaBox Mobile E-Commerce UX Research Report
**Date:** 2026-10-04
**Purpose:** Deep research on mobile e-commerce UX best practices to guide a full UI/UX rebuild of ChaskaBox (Pakistani snack store).
**Problem:** Mobile category page shows filters (Brand checkboxes, Price slider) taking up entire screen. Products not visible without scrolling.

---

## 1. KEY FINDINGS

### 1.1 Mobile Filters — The Baymard Institute Standard

The Baymard Institute (leading e-commerce UX research firm) has extensively tested mobile filtering. Their findings:

**✅ DO:**
- **Use a full-screen or bottom-sheet drawer.** "Trying to squeeze a sidebar into a mobile viewport doesn't work. Filters should occupy their own layer — either a full-screen overlay or a bottom sheet — triggered by a clearly labeled button." (Source: baymard.com/blog/ecommerce-filter-ui)
- **Make the trigger button sticky.** "The 'Filter & Sort' button should remain visible as the user scrolls through results, not disappear off the top of the page. Users often want to adjust filters mid-scroll."
- **Include a prominent "Show X Results" button.** "On mobile, filters should require a deliberate apply action rather than updating results in real time (which causes jarring page refreshes mid-interaction). The CTA should dynamically update the result count."
- **Design for thumbs.** Minimum 44×44pt tap targets (Apple HIG). Filter groups should expand/collapse with one hand.
- **Show result count next to every option.** "Blue (34)", "Under Rs.500 (212)". This is "the single best defense against dead-end zero-result combinations."
- **Use checkboxes, never radio buttons** for multi-select. "Radios force single-select and break the OR-within-type model."
- **Faceted logic:** AND across filter types (Brand AND Price), OR within a type (Hilal OR Mayfair).
- **Active filters as removable chips** above the grid, plus "Clear All."
- **Prioritize 5–10 most relevant filters.** "Presenting 20+ filter categories at once overwhelms users."

**❌ DON'T:**
- Don't render filters inline taking up the full screen (ChaskaBox's current problem!)
- Don't use real-time updates on mobile (causes jarring refreshes)
- Don't bury sort inside the filter drawer — "give it its own affordance"
- Don't use horizontal filter toolbars (Baymard now advises caution — "they cause layout problems")

**How top sites do it:**
- **Amazon mobile:** "Filter" button at top → full-screen overlay with collapsible sections → "Show results" button at bottom
- **Daraz mobile:** Filter icon → bottom sheet slides up → Apply button
- **AliExpress mobile:** "Filter" button → full-screen page with "Done" button showing result count

### 1.2 Mobile Category Page — Above the Fold

**What must be visible without scrolling (Baymard + 2026 best practices):**
1. Category H1 (e.g., "Biscuits & Wafers")
2. Product count ("19 products")
3. Sort + Filter buttons (sticky)
4. **First row of products** (at least 2 product cards partially visible)

**Current ChaskaBox problem:** Filters take entire screen → ZERO products visible → users don't know products exist below.

**Product grid:**
- **Mobile: 2 columns** (industry standard — Amazon, Daraz, AliExpress all use 2)
- **Tablet: 3-4 columns**
- **Desktop: 4-5 columns**
- Load **15–30 products** initially on mobile (not all 249 at once)
- Use **"Load more"** button over infinite scroll (prevents memory issues)

**Sticky elements:**
- Sticky header (logo, search, cart)
- Sticky Filter/Sort bar below header
- These should persist during scroll

### 1.3 Mobile Hero Section

**Best practices (2025-2026):**
- **Compact on mobile.** "A big hero that looks good on desktop feels 'bhari bhari' (heavy) on mobile." Design mobile hero as a SEPARATE experience.
- **Headline:** 5-10 words, clear value proposition
- **One primary CTA.** "A hero with five buttons is not helpful." Keep button above the fold.
- **CTA size:** Minimum 48px height for thumb-tapping
- **Signal there's more below.** "Let content visibly continue past the viewport edge — a hard visual stop suppresses scrolling."
- **Mobile-specific:** Portrait aspect ratio, vertical text placement, large CTA

**ChaskaBox current:** Hero takes ~70% of mobile viewport (headline + collage + trust badges). Products not visible.

**Recommended mobile hero:**
- Compact headline (1-2 lines)
- Small CTA button
- Trust badges as a single horizontal scroll strip (not 2x2 grid)
- Total hero height: ~40% of viewport maximum
- Products should peek into viewport

### 1.4 Product Detail Page (PDP)

**Baymard findings:**
- **Sticky Add to Cart:** "Becomes sticky (bottom bar on mobile) once the user scrolls past the original position." A/B test showed **+7.9% completed orders** with sticky CTA.
- **Reviews = massive lift:** "270–380% conversion lift per Baymard" from adding customer reviews/ratings.
- **Layout:** Gallery (top on mobile) + info below. Sticky info bar on scroll.
- **Price block:** Current price largest/boldest. Discount as fact ("20% off").
- **Shipping/returns micro-copy** directly under Add to Cart button.
- **One dominant CTA.** "Competing call-to-action buttons are distracting."
- **Mobile:** Swipeable gallery (not tiny thumbnails), 44px+ tap targets, fewer elements.

**ChaskaBox PDP needs:**
1. Large product image (swipeable if multiple)
2. Product name, brand, pack size
3. Price (bold) + old price + save %
4. Star rating (from reviews)
5. Quantity selector + Add to Bag (sticky on scroll)
6. Delivery info (4-7 days, COD/JazzCash)
7. Description (expandable if long)
8. Reviews section (list + write review form)
9. Related products

### 1.5 Mobile Navigation

- **Bottom nav** for 3-5 primary destinations (Home, Categories, Search, Cart, Account)
- **Hamburger menu** for secondary navigation
- **Sticky header** with logo, search icon, cart icon
- **Breadcrumbs** on category/product pages (36% of sites fail to provide these on mobile per Baymard)

### 1.6 Product Cards

**Must show (Baymard):**
- Product image
- Product name (2 lines max, truncated)
- Price (bold, prominent)
- Old price (strikethrough, if on sale)
- Rating stars (if available)
- Add button (thumb-friendly, 44px+)

**Don't:**
- Don't hide price behind hover (mobile has no hover)
- Don't overcrowd with badges
- Don't make the entire card a tiny tap target

---

## 2. SPECIFIC RECOMMENDATIONS FOR CHASKABOX

### 2.1 Fix the Filter Issue (P0 — Critical)

**Current (BAD):**
```
┌─────────────────────┐
│ Biscuits & Wafers   │
│ [19 products]       │
├─────────────────────┤
│ BRAND               │
│ ☐ Ap               │
│ ☐ Candyland        │
│ ☐ ChaskaBox        │
│ ☐ ... (15 more)    │
│                     │
│ MAX PRICE           │
│ ━━━━━━━●━━━━       │
│ Rs. 3,150          │
│                     │
│ (products way      │
│  below, invisible) │
└─────────────────────┘
```

**Recommended (GOOD):**
```
┌─────────────────────┐
│ ← Biscuits & Wafers │
│ 19 products         │
├─────────────────────┤
│ [🔍 Filter] [Sort ▾]│ ← sticky bar
├─────────────────────┤
│ [Product] [Product] │ ← visible!
│ [Product] [Product] │
│ [Product] [Product] │
└─────────────────────┘

Tapping [Filter] opens:
┌─────────────────────┐
│ Filters          ✕  │
├─────────────────────┤
│ Brand            ›  │ ← collapsible
│ Price            ›  │
│ Pack Size        ›  │
├─────────────────────┤
│ Clear all           │
│ [Show 19 results]   │ ← sticky bottom
└─────────────────────┘
```

**Implementation:**
1. Hide all filters behind a "Filter" button on mobile
2. Filter opens as bottom sheet (slides up from bottom, 85% height)
3. Each filter group is collapsible (accordion)
4. Sticky bottom bar: "Clear all" + "Show N results" (count updates live)
5. Active filters shown as removable chips above product grid
6. Sort gets its own button (separate from Filter)
7. Desktop keeps sidebar (unchanged)

### 2.2 Mobile Homepage Layout

**Current issues:**
- Hero too tall (~70% viewport)
- Category tiles in grid (should be horizontal scroll)
- Trust badges take too much space

**Recommended:**
```
┌─────────────────────┐
│ [Logo] [🔍][🛒]     │ ← slim header
├─────────────────────┤
│ Bachpan Ka Zaiqa,   │ ← compact hero
│ Ab Ghar Baithe.     │   (30-35% viewport)
│ [Shop Now →]        │
├─────────────────────┤
│ 🛡️ Original │ 🚚 COD │ ← horizontal scroll
├─────────────────────┤
│ SHOP BY CATEGORY    │
│ (○) (○) (○) (○) →  │ ← horizontal scroll
├─────────────────────┤
│ BISCUITS & WAFERS   │
│ [Prod][Prod]        │ ← products visible!
│ [Prod][Prod]        │
└─────────────────────┘
```

### 2.3 Product Detail Page

Build as specified in the subagent task, plus:
- Sticky bottom "Add to Bag" bar on mobile (appears on scroll)
- Image gallery with swipe
- Reviews with photos (future)
- "Frequently bought together" (future)

### 2.4 Product Cards (Mobile)

- 2 columns, compact
- Image (square, white background)
- Name (2 lines, 12px)
- Price (bold, 14px)
- Old price (strikethrough, 11px, grey)
- Add button (full-width or circle +, 40px+)
- Sale badge (top-left, small)

---

## 3. PRIORITY LIST

### P0 — Fix Immediately (blocking sales)
1. **Mobile filters → bottom sheet** (products invisible = zero sales from category pages)
2. **Mobile hero compact** (products must peek above fold on homepage)
3. **Sticky Filter/Sort bar** on category pages

### P1 — High Impact
4. **Product detail page** (currently missing entirely)
5. **Sticky Add to Cart** on PDP (+7.9% orders)
6. **Reviews system** (+270-380% conversion per Baymard)
7. **2-column product grid** on mobile (verify current)

### P2 — Polish
8. **Active filter chips** (removable, above grid)
9. **Result counts** on filter options ("Hilal (12)")
10. **Breadcrumbs** on mobile (currently missing on 36% of sites — don't be one)
11. **"Load more"** instead of loading all products
12. **Search autocomplete** with product images

### P3 — Future
13. Bottom navigation bar (Home, Categories, Search, Cart)
14. Wishlist/favorites
15. Recently viewed products
16. Personalized recommendations

---

## 4. BEFORE/AFTER MOCKUP DESCRIPTIONS

### Category Page — Before (Current)
- User opens "Biscuits & Wafers" on phone
- Sees: breadcrumb, dark banner, "19 products" badge
- Then: BRAND heading with 15+ checkboxes filling the screen
- Then: MAX PRICE slider
- Products are 2-3 screens down — user may never find them
- No sticky filter button — if user scrolls down, can't easily change filters

### Category Page — After (Recommended)
- User opens "Biscuits & Wafers" on phone
- Sees: slim header, breadcrumb, "Biscuits & Wafers (19)" title
- Sees: sticky bar with [Filter] [Sort: Featured ▾]
- Sees: first 4 products in 2-column grid (immediately visible!)
- Taps [Filter] → bottom sheet slides up with collapsible Brand/Price/Pack sections
- Selects "Hilal" → button updates to "Show 5 results"
- Taps button → sheet closes, sees 5 Hilal products, chip "Hilal ✕" above grid
- Taps chip ✕ → filter removed, back to 19 products

### Homepage Hero — Before (Current)
- 70% of viewport: large headline, 3-product collage, 2x2 trust badges
- User must scroll significantly to see any products
- Feels "bhari bhari" (heavy)

### Homepage Hero — After (Recommended)
- 35% of viewport: compact headline, single CTA button, small product visual
- Trust badges as slim horizontal scroll strip
- First category tiles visible without scrolling
- First products peek into viewport → signals "scroll for more"

---

## 5. SOURCES

- Baymard Institute: https://baymard.com/blog/ecommerce-filter-ui
- Baymard Ecommerce UX Best Practices: https://baymard.com/blog/ecommerce-ux-best-practices
- Shift8 Web: https://shift8web.ca/ecommerce-web-design-best-practices-in-2026/
- Keytomic Category Page SEO: https://keytomic.com/blog/ecommerce-category-page-seo-best-practices
- MageCom Category Page UX: https://magecom.net/ecommerce-category-page-best-practices/
- Medusa Hero Best Practices: https://github.com/medusajs/medusa-agent-skills/blob/HEAD/plugins/ecommerce-storefront/skills/storefront-best-practices/reference/components/hero.md
- NN/g on Bottom Sheets: https://www.nngroup.com/articles/bottom-sheet/
- ConvertCart Above Fold: https://convertcart.com/blog/ecommerce-above-the-fold-optimization/

---

## 6. KEY STATISTICS TO REMEMBER

| Finding | Impact | Source |
|---|---|---|
| Sticky add-to-cart on mobile | +7.9% completed orders | GrowthRock A/B test |
| Adding reviews/ratings | +270-380% conversion lift | Baymard |
| Mobile traffic share | 68% of e-commerce traffic | Industry 2026 |
| Mobile conversion rate | 1.53% vs 3.36% desktop | Industry 2026 |
| Sites missing mobile breadcrumbs | 36% | Baymard |
| Each second of load delay | -7-10% conversions | Industry |
| Min tap target size | 44×44pt | Apple HIG |
| Mobile products to load initially | 15-30 | Baymard/MageCom |

---

*This report should guide the full UI/UX rebuild of ChaskaBox mobile experience. Start with P0 items — they directly block sales.*
