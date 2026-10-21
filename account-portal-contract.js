// Shared, public-safe portal presentation and input rules. No account credentials.
export const PORTAL_DEFAULTS = Object.freeze({
  heading:'Your ChaskaBox, all in one place.',
  message:'Track your snack orders, save your favourites and keep your delivery details ready.',
  show_addresses:true, show_wishlist:true, show_reviews:true, show_reorder:true, show_link_orders:true,
});
export const PORTAL_FLAGS = Object.freeze(['show_addresses','show_wishlist','show_reviews','show_reorder','show_link_orders']);
export function portalConfig(input={},strict=false){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Portal settings must be an object.');
  const out={...PORTAL_DEFAULTS};
  if(strict&&(Object.keys(input).length!==Object.keys(out).length||Object.keys(input).some(key=>!Object.hasOwn(out,key))))throw Error('Provide all portal options with no unknown settings.');
  for(const [key,max] of [['heading',90],['message',240]]){
    if(!Object.hasOwn(input,key))continue;
    if(typeof input[key]!=='string'||!input[key].trim()||input[key].trim().length>max){if(strict)throw Error(key+' is invalid.');continue;}
    out[key]=input[key].trim();
  }
  for(const key of PORTAL_FLAGS)if(Object.hasOwn(input,key)){
    if(typeof input[key]!=='boolean'){if(strict)throw Error(key+' must be on or off.');continue;}
    out[key]=input[key];
  }
  return out;
}
export function profileInput(value){
  const name=String(value.name??'').trim(),phone=String(value.phone??'').trim();
  if(name.length<2||name.length>100)throw Error('Enter a name between 2 and 100 characters.');
  if(phone&&!/^[+0-9 ()-]{7,25}$/.test(phone))throw Error('Enter a valid phone number, or leave it blank.');
  return {name,phone};
}
export function addressInput(value){
  const out={label:String(value.label??'').trim()||'Home',city:String(value.city??'').trim(),address:String(value.address??'').trim()};
  if(out.label.length>40)throw Error('Use a label of 40 characters or fewer.');
  if(out.city.length<2||out.city.length>100)throw Error('Enter a city between 2 and 100 characters.');
  if(out.address.length<5||out.address.length>440)throw Error('Enter an address between 5 and 440 characters.');
  return out;
}
export const ORDER_LABELS = Object.freeze({new:'Order received',sourcing:'Sourcing your snacks',packing:'Being packed',packed:'Ready for dispatch',dispatched:'On the way',delivered:'Delivered',cancelled:'Cancelled'});
export const PAYMENT_LABELS = Object.freeze({cod_due:'Cash on delivery',awaiting_payment:'Awaiting payment',payment_submitted:'Payment under review',payment_verified:'Payment verified',payment_rejected:'Payment needs attention',refunded:'Refunded',unpaid:'Awaiting payment'});
export const orderLabel = value => ORDER_LABELS[value]||'Order update available';
export const paymentLabel = value => PAYMENT_LABELS[value]||'View payment details';
export function productIds(value){return Array.isArray(value)?[...new Set(value.filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,500):[];}
export function reorderCart(existing,items,products){
  const cart={};
  if(existing&&typeof existing==='object'&&!Array.isArray(existing))for(const [id,qty] of Object.entries(existing)){
    if(/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(qty)&&qty>0)cart[id]=Math.min(99,qty);
  }
  const available=new Map(products.filter(p=>p.visibility==='visible'&&p.stock_state!=='unavailable').map(p=>[Number(p.id),p]));
  let added=0,skipped=0;
  for(const item of items){
    const id=Number(item.product_id),qty=Number(item.quantity);
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(qty)||qty<1||!available.has(id)){skipped++;continue;}
    if(!Object.hasOwn(cart,String(id))&&Object.keys(cart).length>=50){skipped++;continue;}
    const before=cart[id]||0,after=Math.min(99,before+qty);
    cart[id]=after;added+=after-before;
  }
  return {cart,added,skipped};
}
