/* ChaskaBox accessible admin form controller. API remains the authorization boundary. */
(() => {
 'use strict';
 const typeChoices=['refund','replacement','complaint','damaged','missing_item','late_delivery','other'];
 const defs={
  coupon:[['code','Coupon code','text',true],['discount_type','Discount type','select',true,['percent','fixed']],['discount_value','Discount value','number',true],['min_order','Minimum order (PKR)','number',true],['max_uses','Max uses (empty = unlimited)','number'],['valid_from','Start date','date'],['valid_until','End date','date'],['is_active','Active at checkout','checkbox']],
  zone:[['name','Zone name','text',true],['fee','Delivery fee (PKR)','number',true],['free_above','Free delivery above (blank = none)','number'],['cities','Cities (comma separated; blank = all)','textarea'],['is_active','Active at checkout','checkbox']],
  resolution:[['issue_type','Issue type','select',true,typeChoices],['description','Issue description','textarea',true],['order_number','Order number','text'],['customer_name','Customer name','text'],['customer_phone','Customer phone','text']],
  resolve:[['resolution','Resolution notes','textarea',true],['refund_amount','Refund amount recorded (PKR)','number',true]]
 };
 const str=(x,k)=>String(x?.[k]??'').trim();
 function whole(s,name,min,max,optional=false){
  s=String(s??'').trim();
  if(optional&&!s)return null;
  if(!/^(0|[1-9]\d*)$/.test(s))throw new Error(name+' must be a whole number');
  const n=Number(s);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(name+' must be between '+min+' and '+max);
  return n;
 }
 function date(s,end=false){
  if(!s)return null;
  if(!/^\d{4}-\d\d-\d\d$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('Invalid date');
  return s+(end?'T23:59:59.999Z':'T00:00:00.000Z');
 }
 function build(kind,v){
  if(kind==='coupon'){
   const code=str(v,'code').toUpperCase(),discount_type=str(v,'discount_type');
   if(!/^[A-Z0-9]{1,32}$/.test(code))throw new Error('Coupon code must use 1–32 letters/numbers');
   if(!['fixed','percent'].includes(discount_type))throw new Error('Choose a discount type');
   const valid_from=date(str(v,'valid_from')),valid_until=date(str(v,'valid_until'),true);
   if(valid_from&&valid_until&&valid_from>valid_until)throw new Error('End date precedes start date');
   return {code,discount_type,discount_value:whole(v.discount_value,'Discount',1,discount_type==='percent'?90:10000000),
    min_order:whole(v.min_order,'Minimum order',0,10000000),
    max_uses:whole(v.max_uses,'Maximum uses',1,10000000,true),valid_from,valid_until,is_active:v.is_active===true};
  }
  if(kind==='zone'){
   const name=str(v,'name');if(!name||name.length>160)throw new Error('Enter a zone name (up to 160 characters)');
   const cities=str(v,'cities').split(/[,\n]+/).map(s=>s.trim()).filter(Boolean);
   if(cities.length>200||cities.some(s=>s.length<2||s.length>100))throw new Error('Invalid city names');
   return {name,fee:whole(v.fee,'Fee',0,10000000),free_above:whole(v.free_above,'Free-delivery threshold',0,10000000,true),
    cities:[...new Set(cities.map(s=>s.toLowerCase()))],is_active:v.is_active===true};
  }
  if(kind==='resolution'){
   const issue_type=str(v,'issue_type'),description=str(v,'description');
   if(!typeChoices.includes(issue_type))throw new Error('Invalid issue type');
   if(description.length<3||description.length>2000)throw new Error('Description must be 3–2000 characters');
   const output={issue_type,description};
   for(const [k,max] of [['order_number',80],['customer_name',160],['customer_phone',40]]){
    const value=str(v,k);if(value.length>max)throw new Error(k+' too long');output[k]=value||null;
   }
   return output;
  }
  if(kind==='resolve'){
   const resolution=str(v,'resolution');
   if(resolution.length<3||resolution.length>2000)throw new Error('Resolution notes must be 3–2000 characters');
   return {status:'resolved',resolution,refund_amount:whole(v.refund_amount,'Refund record',0,1000000)};
  }
  throw new Error('Unknown form');
 }
 function show(kind,initial={}){
  if(!defs[kind])return Promise.reject(new Error('Unknown form'));
  if(document.querySelector('[data-chaska-ops]'))return Promise.reject(new Error('Close the current form first'));
  return new Promise(resolve=>{
   const dialog=document.createElement('dialog');dialog.dataset.chaskaOps=kind;dialog.className='admin-ops-dialog';
   const form=document.createElement('form');form.noValidate=true;
   const heading=document.createElement('h2');heading.textContent=({coupon:'Coupon',zone:'Shipping zone',resolution:'New case',resolve:'Resolve case'})[kind];
   form.append(heading);
   const desc=document.createElement('p');desc.className='muted';
   desc.textContent=kind==='resolve'?'Recording a refund amount does NOT transfer money. Confirm any actual refund separately.':kind==='zone'?'Delivery fees affect checkout; verify a test order after saving.':'Only authorized staff can save; all values are validated by the server.';
   form.append(desc);
   const controls=new Map();
   for(const [key,label,type,required,choices] of defs[kind]){
    const wrap=document.createElement('label');wrap.textContent=label;wrap.className='admin-ops-field';
    const node=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');
    node.name=key;if(type!=='textarea'&&type!=='select')node.type=type;
    if(required)node.required=true;
    if(type==='number'){node.min=(key==='min_order'||key==='fee'||key==='free_above'||key==='refund_amount')?'0':'1';node.max=(key==='refund_amount')?'1000000':'10000000';node.step='1';}
    if(key==='code')node.maxLength=32;
    if(type==='textarea')node.rows=3;
    if(choices)for(const choice of choices){const o=document.createElement('option');o.value=choice;o.textContent=choice.replaceAll('_',' ');node.append(o);}
    if(type==='checkbox')node.checked=initial[key]===undefined?true:initial[key]===true;
    else if(type==='date')node.value=String(initial[key]||'').slice(0,10);
    else if(key==='cities')node.value=Array.isArray(initial[key])?initial[key].join(', '):String(initial[key]||'');
    else node.value=String(initial[key]??(key==='min_order'||key==='refund_amount'?'0':''));
    wrap.append(node);form.append(wrap);controls.set(key,node);
   }
   const err=document.createElement('p');err.hidden=true;err.className='admin-ops-error';err.setAttribute('role','alert');form.append(err);
   const actions=document.createElement('div');actions.className='admin-ops-actions';
   const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='Cancel';
   const save=document.createElement('button');save.type='submit';save.className='btn primary';save.textContent='Save';
   actions.append(cancel,save);form.append(actions);dialog.append(form);document.body.append(dialog);
   let closed=false;
   const done=value=>{if(closed)return;closed=true;dialog.remove();resolve(value);};
   cancel.onclick=()=>done(null);
   dialog.oncancel=e=>{e.preventDefault();done(null);};
   form.onsubmit=e=>{
    e.preventDefault();err.hidden=true;
    if(!form.reportValidity())return;
    const raw={};for(const [key,node] of controls)raw[key]=node.type==='checkbox'?node.checked:node.value;
    try{done(build(kind,raw));}catch(e){err.textContent=e.message;err.hidden=false;}
   };
   if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
   controls.values().next().value?.focus();
  });
 }
 window.chaskaAdminOpsForms={show,build};
})();