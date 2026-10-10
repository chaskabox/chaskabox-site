# Brand Normalization Audit — 2026-10-10

Source: `products.json` (249 products, storefront fallback snapshot).
Brand extraction rule (matches `tools/gen-product-pages.py::brand_of` and storefront):
brand = text before first `|` in product name, trimmed; fallback `"ChaskaBox"` when no `|`.

> NOTE: Live production data lives in Supabase (`products.brand` text column + `products.brand_id` FK).
> This audit ran against the repo snapshot. Re-run against the DB before any merge.

## Summary

- Distinct brand strings: **50**
- Case-duplicate groups: **1**

## Case duplicates (action required)

### 1. `gfi` — SAFE TO MERGE (case-only variant)
| Variant | Products | IDs |
|---|---|---|
| `GFI` | 1 | 226 — "GFI \| Tringo Chicken Chatpata Jumbo Snacks" (Rs. 399) |
| `Gfi` | 2 | 251 — "Gfi \| Namak Paray Chicken Chatpata" (Rs. 250), 261 — "Gfi \| Humtum Chocolate Pan Masala Jumbo" (Rs. 399) |

Recommendation: consolidate to **`Gfi`** (majority variant, 2 of 3 products) or canonical **`GFI`**.
Preserve product assignments; update the `brand` text on the minority rows only.
No other case/whitespace duplicates were found (Unicode NFKC casefold comparison).

## Non-duplicate anomalies (do NOT merge — informational)

### Products with no `|` separator → fall back to brand `"ChaskaBox"`
10 bundle/house products have no brand prefix; their full name becomes the "brand":
IDs 1, 53, 122, 259, 267, 268, 269, 270, 271, 272
(e.g. "ChaskaBox Wafer Box", "ChaskaBox Mega Mix").

Recommendation: give these an explicit brand (e.g. `ChaskaBox` house brand) via `brand_id`
instead of relying on the name-prefix fallback, so they don't appear as 10 fake brands
in the directory. Do NOT auto-rename — owner decision.

### Single-product brands (28)
Skiddi, Metro, Sholay Snacks, Junoon Snacks, Lunch Time, Snack World, Kolson,
S.N Foods, Roll Balls Jumbo, Power Full Jumbo, Gulzar Foods, Mix Plate, Mr.Maker,
Imli (10 products — not single), etc. Full list in audit script output.
These are legitimate small brands; keep as-is. Verify `Kolson` (1 product) — may be
under-listed vs catalogue reality; owner to confirm.

## Merge safety rules applied
- Only exact case/whitespace variants flagged as safe.
- No fuzzy/alias merging performed (e.g. "AP" vs "Ap" not present; "S.N Foods" vs
  "Sunny" left alone).
- Nothing was modified. All merges require owner confirmation + DB backup.
