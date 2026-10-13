/**
 * Resolution-case input validation. Records are not payment/refund transactions.
 * Never claim an actual refund was delivered based on this case status.
 */
import { httpError } from './auth.js';
const TYPES=new Set(['refund','replacement','complaint','damaged','missing_item','late_delivery','other']);
const STATES=new Set(['open','in_progress','resolved','rejected']);
const required=(x,min,max,field)=>{
  if(typeof x!=='string'||x.trim().length<min||x.trim().length>max)httpError('Invalid '+field,400,'invalid_field');
  return x.trim();
};
const optional=(x,max,field)=>{
  if(x==null||x==='')return null;
  if(typeof x!=='string'||x.trim().length>max)httpError('Invalid '+field,400,'invalid_field');
  return x.trim()||null;
};
const amount=x=>{
  if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0||x>1000000)httpError('Refund record must be a whole number from 0 to 1000000',400,'invalid_refund_record');
  return x;
};
function denyUnexpected(body,allowed){
  if(Object.keys(body).some(k=>!allowed.includes(k)))httpError('Unsupported resolution field',400,'invalid_field');
}
export function validateCaseCreate(body){
  denyUnexpected(body,['order_id','order_number','customer_name','customer_phone','issue_type','description','refund_amount']);
  if(!TYPES.has(body.issue_type))httpError('Invalid issue type',400,'invalid_issue_type');
  const description=required(body.description,3,2000,'description');
  const order_id=optional(body.order_id,36,'order_id');
  if(order_id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id))httpError('Invalid order ID',400,'invalid_order_id');
  if(body.refund_amount!==undefined&&body.refund_amount!==0)httpError('New cases cannot declare refunds',400,'invalid_refund_record');
  return {
    order_id,order_number:optional(body.order_number,80,'order_number'),
    customer_name:optional(body.customer_name,160,'customer_name'),
    customer_phone:optional(body.customer_phone,40,'customer_phone'),
    issue_type:body.issue_type,description,status:'open',refund_amount:0,
  };
}
export function validateCasePatch(body){
  denyUnexpected(body,['status','resolution','refund_amount']);
  const result={};
  if(body.status!==undefined){
    if(!STATES.has(body.status))httpError('Invalid case status',400,'invalid_status');
    result.status=body.status;
    result.resolved_at=['resolved','rejected'].includes(body.status)?new Date().toISOString():null;
  }
  if(body.resolution!==undefined)result.resolution=body.resolution===null?null:required(body.resolution,3,2000,'resolution');
  if(body.refund_amount!==undefined){
    if(result.status!=='resolved')httpError('Refund record updates require resolving the case',400,'invalid_refund_record');
    result.refund_amount=amount(body.refund_amount);
  }
  if(result.status==='resolved'&&(!result.resolution||result.resolution.length<3))httpError('Resolution notes are required',400,'invalid_resolution');
  if(!Object.keys(result).length)httpError('At least one change is required',400,'empty_patch');
  result.updated_at=new Date().toISOString();
  return result;
}
