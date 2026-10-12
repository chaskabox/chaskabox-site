/* Browser-safe public configuration. Private service-role/WAHA/Resend/Turnstile
 * credentials are never exposed here. */
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let SB = null;
let PUBLIC_CONFIG_PROMISE = null;
let SUPABASE_SDK_PROMISE = null;

async function loadPublicConfig(){
  if (PUBLIC_CONFIG_PROMISE) return PUBLIC_CONFIG_PROMISE;
  PUBLIC_CONFIG_PROMISE = fetch('/api/public-config', {cache:'no-cache'})
    .then(r => { if(!r.ok) throw new Error('Public config unavailable'); return r.json(); })
    .then(cfg => {
      SUPABASE_URL = String(cfg.supabaseUrl || '');
      SUPABASE_ANON_KEY = String(cfg.supabaseAnonKey || '');
      if (cfg.clarityProjectId) window.CHASKABOX_CLARITY_ID = String(cfg.clarityProjectId);
      return cfg;
    })
    .catch(err => { console.warn('Public config unavailable', err); return {}; });
  return PUBLIC_CONFIG_PROMISE;
}
function sbConfigured(){ return /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20; }
// On home/product routes the Auth SDK is intentionally not render-blocking.
// Explicit account routes already include the library, so both modes work.
function loadSupabaseSdk(){
  if (window.supabase?.createClient) return Promise.resolve(true);
  if (SUPABASE_SDK_PROMISE) return SUPABASE_SDK_PROMISE;
  SUPABASE_SDK_PROMISE = new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4';
    script.async=true;
    script.onload=()=>resolve(Boolean(window.supabase?.createClient));
    script.onerror=()=>resolve(false);
    document.head.appendChild(script);
  }).finally(()=>{if(!window.supabase?.createClient) SUPABASE_SDK_PROMISE=null;});
  return SUPABASE_SDK_PROMISE;
}
async function initSupabase(){
  if (SB) return true;
  await loadPublicConfig();
  if (!sbConfigured() || !(await loadSupabaseSdk())) return false;
  try { SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); return true; }
  catch(e){ console.warn('Supabase init failed', e); SB=null; return false; }
}
