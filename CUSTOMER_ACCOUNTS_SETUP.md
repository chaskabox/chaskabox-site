# Customer Accounts — SQL to Run (Supabase SQL Editor)

Run these ONE AT A TIME (one paste = one statement).
Order matters. All use $func$ delimiter (not $$).

## Files in database/migrations/039/:

1. **01-wishlists-table.sql** — Creates wishlists table
2. **02-wishlists-index.sql** — Index on user_id
3. **03-wishlists-rls.sql** — Enable RLS
4. **04-wishlists-grants.sql** — Grant to authenticated
5. **05-wishlists-policy.sql** — Drop old policy (if exists)
6. **06-wishlists-policy-create.sql** — Create RLS policy (own rows only)
7. **07-link-guest-orders-func.sql** — Function to link guest orders via phone
8. **08-link-guest-orders-grant.sql** — Grant execute to authenticated

## What was built:

### Database
- `wishlists` table: user_id, product_id, created_at (RLS: users see only own)
- `link_guest_orders()` function: links past guest orders via phone number match

### Frontend
- `/account/` page: full customer dashboard
- Login/signup modal (email + password)
- Order history with Track, Re-order, Write Review (for delivered)
- Profile: name, phone, email (password reset via email)
- Saved addresses: add, set default, delete
- Wishlist: syncs across devices (localStorage + DB)
- My Reviews: shows all submitted reviews with status
- "Link past orders" button: connects guest orders via phone
- Post-checkout: "Create free account" offer for guests (optional)

### Security
- Supabase Auth only (no custom password storage)
- RLS mandatory on all customer tables
- Customers see ONLY their own data (auth.uid() checks)
- Admin roles separate (admin_roles table untouched)
- Guest checkout preserved (user_id NULL for guests)

## Deploy order:
1. Run SQL 039 (8 files) in Supabase
2. Deploy code (git push)
3. Test: signup → login → order history → wishlist → addresses
