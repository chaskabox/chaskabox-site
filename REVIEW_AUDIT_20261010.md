# Reviews System Deep Audit — 2026-10-10

## 🐛 BUGS FOUND

### HIGH PRIORITY

**1. WhatsApp review links use OLD URL format** 
- File: `functions/api/_lib/notify.js:251`
- Current: `https://chaskabox.online/product/?id=${pid}#reviews`
- Should be: `https://chaskabox.online/product/${pid}/#reviews`
- Impact: Delivered order review links may be broken/wrong

**2. "Write Review" dead link in Customer Account**
- File: `account.js:67`
- Links to: `/track-order.html?order=...#reviews`
- Problem: `track-order.html` has NO review form
- Impact: Clicking "Write Review" does nothing useful

**3. Reviews not linked to user_id**
- File: `functions/api/reviews.js` (POST)
- Problem: Doesn't accept/set `user_id` from auth token
- Impact: "My Reviews" in account (`account.js:91`) always empty
- Impact: Can't tell who wrote which review

### MEDIUM PRIORITY

**4. verified_purchase never set to true**
- File: `functions/api/reviews.js:13` (comment says "back-office job flips it")
- Problem: This job DOES NOT EXIST
- Impact: No review ever shows "✓ Verified purchase" badge
- Impact: Customers can't trust reviews as much

**5. Admin can't reply to reviews (UI missing)**
- API: `functions/api/admin/reviews/[id].js` supports `reply` param
- UI: `admin-live.js:298` has NO reply input/button
- Impact: Feature exists in backend but unusable

### LOW PRIORITY

**6. Admin review list missing product name**
- File: `admin-live.js:298`
- Shows: rating, text, status — but NOT which product
- Impact: Hard to moderate without product context

**7. Admin can't see reviewer identity**
- File: `admin-live.js:298`
- Shows: no user_id, email, or order info
- Impact: Can't verify if reviewer is real customer

---

## 📋 PENDING WORK LIST

### Reviews System Fixes
- [ ] Fix WhatsApp review link URL format (notify.js)
- [ ] Fix "Write Review" link in account (point to product page)
- [ ] Link reviews to user_id (auth token in POST)
- [ ] Implement verified_purchase logic (check delivered orders)
- [ ] Add admin reply UI in admin panel
- [ ] Show product name in admin review list
- [ ] Show reviewer info in admin review list

### Previously Identified (from summary)
- [ ] Guest-order linking security (link_guest_orders links by unverified phone)
- [ ] Customer password reset incomplete (no set-new-password screen)
- [ ] Signup/profile phone persistence (RLS may reject upsert)
- [ ] Site Preview root cause (only fallback added, not real fix)
- [ ] Turnstile on pages.dev (domain restriction)

### Awaiting Rameez
- [ ] Test checkout on chaskabox.online (not pages.dev)
- [ ] Test customer account signup/login
- [ ] Confirm Cloudflare Turnstile domains setting
- [ ] 12 Chaska Box contents (products + quantities)
- [ ] Product photos (Rameez photographing himself)
