# BOP Card Gateway — Safe Future Activation

Current production policy: **OFF**, no checkout card option, no card charging, no provider transactions. COD, JazzCash and Bank Transfer remain unchanged.

## What is already prepared
- Admin Panel → Payments & COD Ledger: owner card activation switch, expected settlement calendar days, agreed percentage fee (basis points) and fixed per-transaction PKR fee. Also a shortcut in Store Settings → Payment availability.
- Separate server-owned `card_gateway_control` (default `enabled=false`, `integration_verified=false`) and private `card_gateway_transactions` (provider reference, amounts, status, settlement evidence, no cardholder credentials). Owner updates have audit history.
- Enable attempt is rejected by **both** API and database unless the gateway integration is verified; API additionally requires live BOP credentials and explicit backend processor acceptance.
- Card processing is **NOT integrated**. Frontend checkout, order creation and refunds deliberately remain unchanged; reports show no card sales until there is a real gateway.

## Steps that still require a genuine BOP merchant integration
1. Get BOP merchant acquiring approval, merchant ID, authoritative API specification, test credentials and signed callback/hosted payment integration terms; confirm actual fees and settlement days.
2. Implement and review BOP server-side payment intent creation, hosted payment redirects or tokenized provider frames, signature verification, callback idempotency, amount/currency/order matching, refusal and replay protections, refund flow, cancellation/timeouts and reconciliation.
3. Verify end-to-end test transactions in BOP sandbox, including declined/duplicate/partial/refunded/chargeback scenarios. Test gateway return/callback failure, record correct paid statuses and test ledger settlement receipts.
4. Add BOP live secrets to Cloudflare using **private** environment secrets `BOP_CARD_GATEWAY_MERCHANT_ID`, `BOP_CARD_GATEWAY_SIGNING_KEY`, `BOP_CARD_GATEWAY_CALLBACK_SECRET`. Never put them in GitHub, site settings, client JavaScript or database.
5. **Only after** audited production review + provider verification, set the protected DB row's `integration_verified=true` via approved migration, and configure server-only `BOP_CARD_PROCESSOR_READY=true`.
6. At this stage an owner can use the Admin Panel to turn card payments ON or OFF. The separate checkout/card provider implementation must enforce the **effective** enabled state server-side and must never trust a browser toggle. Leave it OFF if readiness fails.

The current preparatory release performs **none** of steps 1–6 automatically, and does not claim card payments work.

## Finance interpretation
`authorized` or `captured` is not a confirmed bank settlement. Net settled requires a real settlement date and provider reference. Keep chargeback/refund and processing fees separate. Store only non-sensitive provider transaction references: never PAN, CVV, PIN or expiry.

## Releasing safely
- Run schema replay + unit/browser/security tests before applying migration.
- Check default `enabled=false` and `integration_verified=false`, 0 card transactions and unchanged order totals.
- Deploy owner interface manually to Cloudflare Pages without altering automatic production-deployment settings.
