import {json} from './admin/_lib/auth.js';
export function onRequestGet(){return json({loyalty:{available:false},referral:{available:false},birthday:{available:false},push:{available:false}},200,{'Cache-Control':'no-store'});}
