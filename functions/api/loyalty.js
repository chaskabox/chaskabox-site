/** Paused until verified ownership and an atomic order/discount ledger exist. */
import { json } from './admin/_lib/auth.js';
function unavailable(){return json({error:{code:'FEATURE_UNAVAILABLE',message:'Loyalty rewards are currently unavailable.'}},503);}
export const onRequestGet=unavailable;
export const onRequestPost=unavailable;
export async function creditLoyaltyPoints(){return 0;}
export async function redeemLoyaltyPoints(){return {ok:false,error:'unavailable'};}
