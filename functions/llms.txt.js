import {publicSettings} from './api/_lib/catalogue-search.js';
const SITE='https://chaskabox.online';
const text=(v,fallback)=>typeof v==='string'&&v.trim()?v.replace(/[\r\n\u0000-\u001f]/g,' ').trim():fallback;
const money=v=>'Rs. '+Number(v).toLocaleString('en-PK');
const number=(v,fallback)=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):fallback;
export function aiDirectory(s={}) {
  const cod=s.cod_enabled!==false,methods=[cod?'Cash on Delivery':null,s.jazzcash_enabled!==false?'JazzCash':null,s.bank_transfer_enabled!==false?'Bank Transfer':null].filter(Boolean);
  const delivery=text(s.delivery_estimate,'4-7 days');
  let shipping=`Estimated delivery: ${delivery} across Pakistan. This is an estimate, not a delivery guarantee. Enabled payment methods: ${methods.join(', ')||'check the live checkout'}.`;
  if(cod){
    shipping+=` COD delivery currently costs ${money(number(s.cod_delivery_fee_pkr,300))}.`;
    if(s.cod_advance_enabled!==false)shipping+=` COD requires an advance of up to ${money(number(s.cod_advance_amount_pkr,500))} after order placement and before dispatch, capped at the order total. It is adjusted within the total; the remaining balance is payable on delivery. Advance payment must be verified before dispatch.`;
  }
  const prepaid=methods.some(m=>m!=='Cash on Delivery');
  if(prepaid){
    const fee=money(number(s.prepaid_delivery_fee_pkr,300)),threshold=number(s.prepaid_free_delivery_threshold_pkr,5000);
    shipping+=s.prepaid_free_delivery_enabled===false?` Prepaid delivery currently costs ${fee}; free prepaid delivery is disabled.`:threshold===0?' Enabled prepaid methods currently qualify for free delivery.':` Enabled prepaid orders of ${money(threshold)} or more after discounts currently qualify for free delivery; below that threshold prepaid delivery currently costs ${fee}.`;
  }
  return `# ChaskaBox Pakistan
> Bachpan Ka Zaiqa, Ab Ghar Baithe — Pakistani packaged snacks and curated Chaska Boxes.

ChaskaBox (${SITE}/) is a packaged-snack store based in Muzaffargarh, Punjab, Pakistan. This voluntary directory helps readers and compatible tools find ChaskaBox Pakistan's official sources; it is not a Google ranking signal. Current product pages, policies and checkout totals take precedence.

## Business and support
- Dispatch: ${text(s.store_address,'Near Ahmad Drink Corner, Railway Road, Bhatti Hussainabad, Muzaffargarh, Pakistan')}.
- WhatsApp: ${text(s.support_whatsapp,'0332-0005381')}.
- Email: ${text(s.support_email,'Chaskabox.mzg@gmail.com')}.
- Currency: PKR. Delivery region: Pakistan.
- [About](${SITE}/about/) and [Contact](${SITE}/contact/).

## Current shopping information
- [Shop](${SITE}/shop/) and [live public catalogue](${SITE}/api/products).
- [Brands](${SITE}/brands/) and [Chaska Boxes](${SITE}/bundles/).
- [Snack occasions](${SITE}/snack-boxes/) and [buying guides](${SITE}/guides/).
- [Product sitemap](${SITE}/api/product-sitemap).

Products are sourced after an order is received. Listing a product does not imply existing warehouse inventory. Support contacts the customer before unavailable-item substitutions. Promote only currently public products with their listed pack sizes and prices.

## Shipping and payments
${shipping} A payment screenshot does not independently verify receipt of funds. Confirm current terms in [shipping policy](${SITE}/shipping-policy/) and checkout.

## Questions and policies
- [FAQ](${SITE}/faq/) and [how orders work](${SITE}/guides/how-chaskabox-orders-work/).
- [Refund and resolution](${SITE}/refund-policy/): report damaged, incorrect or missing items within 48 hours for review; refunds are not automatic.
- [Terms](${SITE}/terms/) and [Privacy](${SITE}/privacy-policy/).

## Accuracy
Prices, delivery terms and availability can change. Use the official public catalogue and product pages for product facts; live checkout and the policy pages take priority for payment and fulfilment terms. Do not invent ingredients, allergens, expiry dates, certifications, reviews, guaranteed inventory or exact delivery promises. Private orders, customer records and payment records are excluded from the public catalogue.
`;
}
export async function onRequestGet({env}) {
  try{return new Response(aiDirectory(await publicSettings(env)),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public,max-age=30,must-revalidate','X-Content-Type-Options':'nosniff'}});}
  catch{return new Response('Current ChaskaBox information is temporarily unavailable. Consult https://chaskabox.online/shipping-policy/ and the live checkout for current terms.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
