import test from 'node:test';
import assert from 'node:assert/strict';
import {WHATSAPP_ON_HOLD,sendOwnerWhatsApp} from '../functions/api/_lib/waha-notify.js';
test('owner WhatsApp stays on hold even when provider configuration is present',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Provider must never be called during hold');};
 try{assert.equal(WHATSAPP_ON_HOLD,true);const result=await sendOwnerWhatsApp({WAHA_API_URL:'https://fixture.invalid',WAHA_API_KEY:'fixture',OWNER_WHATSAPP:'fixture'},{});assert.equal(result.skipped,true);assert.equal(result.sent,false);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
