# Supabase Setup — Customer Accounts (Email Login)

**Time:** ~15 minutes · **Cost:** FREE (50,000 users/month tak)

---

## Step 1: Supabase account banayein

1. **supabase.com** kholein
2. **"Start your project"** → GitHub se sign up karein (free)
3. Dashboard mein **"New Project"** dabayein
4. Project details:
   - **Name:** `chaskabox`
   - **Database Password:** koi strong password (save karke rakhein)
   - **Region:** `Southeast Asia (Singapore)` (Pakistan ke sab se qareeb)
5. **"Create new project"** — 2 minute wait karein

## Step 2: API keys copy karein

1. Left sidebar → **Settings (⚙️)** → **API**
2. Copy karein:
   - **Project URL** → jaise `https://xyzcompany.supabase.co`
   - **anon public key** → lambi key jo `eyJ...` se shuru hoti hai
3. `supabase-config.js` file kholein aur paste karein:
   ```js
   const SUPABASE_URL = 'https://xyzcompany.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   ⚠️ **`service_role` key KABHI paste na karein** — sirf `anon public` key!

## Step 3: Database tables banayein

1. Left sidebar → **SQL Editor** → **"New query"**
2. `supabase-schema.sql` file ka **poora content** copy karke paste karein
3. **"Run"** dabayein (neeche right corner)
4. ✅ Success message aana chahiye — 4 tables ban jayengi:
   - `profiles`, `orders`, `addresses`, `wishlist`

## Step 4: Email login ON karein

1. Left sidebar → **Authentication** → **Providers**
2. **Email** provider ON hona chahiye (default ON hota hai)
3. ✅ **"Confirm email"** OFF rakhein (OTP code se verify hoga, link se nahi)
4. Neeche **"Auth" → "Email Templates"** → **"Magic Link"** template mein OTP ka zikr hai — default theek hai

### Google login (optional, baad mein):
1. **Authentication → Providers → Google** → Enable
2. Google Cloud Console se Client ID/Secret chahiye hoga
3. Ye step skip kar sakte hain — email OTP kaafi hai shuru mein

## Step 5: Site URL set karein (zaroori!)

1. **Authentication → URL Configuration**
2. **Site URL:** `https://chaskabox.online` likhein
3. **Redirect URLs** mein add karein:
   - `https://chaskabox.online`
   - `https://chaskabox-site.pages.dev`

## Step 6: Test karein

1. Site kholein → header mein **👤 account icon** dabayein
2. Apna email likhein → **"Send Code"**
3. Email mein 6-digit code aayega → enter karein
4. ✅ Login! **My Account** page khulega

---

## Kya kya kaam karega?

| Feature | Kahan |
|---|---|
| 📧 Email OTP login (password nahi!) | Header 👤 icon |
| 🔵 Google login | Login modal mein button |
| 📦 Order history + "Dobara mangwao" | My Account → Orders |
| ♥ Wishlist (phone+laptop sync) | Product cards par ♥ / My Account |
| 📍 Saved addresses | My Account → Addresses |
| ✅ Checkout auto-fill | Checkout page par address pehle se bhara |
| 👤 Profile (naam, phone) | My Account → Profile |

**Guest checkout hamesha rahega** — bina login ke bhi order ho sakta hai!

## Troubleshooting

| Masla | Hal |
|---|---|
| "Setup pending" message | `supabase-config.js` mein keys paste nahi huin |
| Code email mein nahi aaya | Spam folder check karein; Supabase → Authentication → Logs dekhein |
| Google button error | Google provider enable nahi — Step 4 dekhein (optional hai) |
| Tables ka error | `supabase-schema.sql` dobara run karein |

## Cost

- **FREE:** 50,000 monthly users, 500MB database — ChaskaBox ke liye kaafi hai
- Email OTP: **Rs. 0** (bilkul free!)
- WhatsApp OTP (Phase 2): ~Rs. 1/SMS — baad mein jab zaroorat ho
