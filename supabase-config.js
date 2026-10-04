/* ChaskaBox — Supabase configuration
 * Rameez: apni Supabase Project URL aur anon key yahan paste karein.
 * (SUPABASE-SETUP.md mein step-by-step guide hai)
 */
const SUPABASE_URL = 'https://jtvswuvnasqqzrjysgfd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wOAqZSbVYRrJdNHVostPzg_BWvovIgU';

/* Do not edit below unless you know what you are doing */
let SB = null;
function sbConfigured(){
  return SUPABASE_URL.indexOf('PASTE_YOUR') !== 0 && SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') !== 0
      && SUPABASE_URL.indexOf('http') === 0 && SUPABASE_ANON_KEY.length > 20;
}
function initSupabase(){
  if (sbConfigured() && window.supabase && window.supabase.createClient){
    try{
      SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return true;
    }catch(e){ console.warn('Supabase init failed', e); SB = null; }
  }
  return false;
}
