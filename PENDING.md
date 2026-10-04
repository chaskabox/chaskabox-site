# ChaskaBox — Pending Work List (2026-10-04)

**Rule:** Sab ek sath deploy hoga. Koi piecemeal deploy nahi.

## PENDING (not deployed yet)

### 1. Promo bar rotation
- **Status:** Code ready (app.js), not committed
- **What:** Promo bar har 4 sec mein message change karega
- **Messages:** "100% original packs" → "🚚 4-7 din mein delivery" → "💰 COD available" → "🎁 Bundle boxes par discount"

### 2. Product detail page
- **Status:** In progress (subagent working)
- **What:** Product click par full page — bari photo, description, reviews (likhne ka option)
- **Reviews:** localStorage mein save honge

## DEPLOYED ✅ (already live via Cloudflare)
- Hero: "Bachpan Ka Zaiqa" headline
- AI conversational replies (salam, kia hal hai, etc.)
- AI product search
- AI button right side
- Hero collage bigger
- Reveal animations
- Site wide 1400px, categories one line
- Side padding reduced
- PACK crop images (reverted - user will send new photos tomorrow)
- Netlify badge JS removal
- Mobile tiles horizontal scroll
- Category tiles custom illustrations
- Band colors, tile order, shelf order
- Hamburger menu
- Category page rebuild
- Cart drawer text fixes

## WAITING ON USER
- New product photos (tomorrow) — PACK text issue fix
- DNS propagation for chaskabox.online → Cloudflare (1-2 hours)
