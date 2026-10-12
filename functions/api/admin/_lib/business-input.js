import { httpError } from './auth.js';
export function businessInput(body,kind,create=false) {
  const keys=kind==='coupon'?['code','discount_type','discount_value','min_order','max_uses','valid_from','valid_until','is_active']:['name','cities','fee','free_above','is_active','position'];
  const out={};
  for(const key of Object.keys(body)) {
    if(!keys.includes(key))httpError('Unsupported field: '+key,400,'invalid_field');
    const v=body[key];
    if(key==='is_active'){if(typeof v!=='boolean')httpError('is_active must be boolean',400);out[key]=v;}
    else if(['discount_value','min_order','max_uses','fee','free_above','position'].includes(key)){
      if(v===null&&['max_uses','free_above'].includes(key)){out[key]=null;continue;}
      if(!Number.isSafeInteger(v)||v<0||v>10000000||(['discount_value','max_uses'].includes(key)&&v===0))httpError('Invalid '+key,400);
      out[key]=v;
    } else if(['valid_from','valid_until'].includes(key)){
      if(v===null){out[key]=null;continue;}
      if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))httpError('Invalid date',400);
      out[key]=new Date(v).toISOString();
    } else if(key==='cities'){
      if(!Array.isArray(v)||v.length>200||v.some(x=>typeof x!=='string'||x.trim().length<2||x.length>100))httpError('Invalid cities',400);
      out[key]=[...new Set(v.map(x=>x.trim().toLowerCase()))];
    } else {
      if(typeof v!=='string'||v.length>160)httpError('Invalid '+key,400);
      out[key]=v.trim();
    }
  }
  if(out.code!==undefined){out.code=out.code.toUpperCase();if(!/^[A-Z0-9]{1,32}$/.test(out.code))httpError('Invalid coupon code',400);}
  if(out.discount_type!==undefined&&!['percent','fixed'].includes(out.discount_type))httpError('Invalid discount type',400);
  if(out.discount_type==='percent'&&out.discount_value>90)httpError('Percent discount max 90%',400);
  if(out.name!==undefined&&!out.name)httpError('Name required',400);
  if(create&&(kind==='coupon'?(!out.code||!out.discount_type||!out.discount_value):(!out.name||out.fee===undefined)))httpError('Required fields missing',400);
  return out;
}
