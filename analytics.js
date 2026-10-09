/* Optional free analytics bootstrap. Cloudflare Web Analytics should preferably
 * be enabled at zone level. Clarity is loaded only when CLARITY_PROJECT_ID is
 * supplied through /api/public-config. */
(async function(){
  try{
    if(typeof loadPublicConfig==='function') await loadPublicConfig();
    const id=window.CHASKABOX_CLARITY_ID;
    if(!id) return;
    // Never install behavioral recording inside privileged/admin pages.
    if(/^\/(admin|checkout(?:\.html)?|track-order(?:\.html)?|account)(?:\/|$)/.test(location.pathname)) return;
    window.clarity=window.clarity||function(){(window.clarity.q=window.clarity.q||[]).push(arguments)};
    const s=document.createElement('script'); s.async=true; s.src='https://www.clarity.ms/tag/'+encodeURIComponent(id); document.head.appendChild(s);
  }catch(e){ console.warn('analytics bootstrap skipped',e); }
})();

/* Conversion event tracking */
window.chaskaTrack = window.chaskaTrack || function(event, data){
  try {
    const payload = {event, data: data||{}, ts: Date.now(), path: location.pathname};
    // Log to console in dev, send to endpoint in prod
    if (location.hostname === 'localhost' || location.hostname.includes('pages.dev')) {
      console.log('[track]', event, data);
    }
    // Send to analytics endpoint (fire and forget)
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', JSON.stringify(payload));
    }
  } catch(e) {}
};
