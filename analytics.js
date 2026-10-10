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
    if (location.hostname === 'localhost' || location.hostname.includes('pages.dev')) {
      console.log('[track]', event, data);
    }
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', JSON.stringify(payload));
    }
    // Phase 2: funnel analytics — forward key events to /api/funnel-log
    const funnelMap={product_view:'product_view',add_to_cart:'add_to_cart',cart_viewed:'cart_viewed',checkout_started:'checkout_started',checkout_start:'checkout_started',order_created:'order_created',order_complete:'order_created'};
    const fe=funnelMap[event];
    if(fe){
      try{
        let sid=null; try{sid=localStorage.getItem('chaska_sid')||(localStorage.setItem('chaska_sid','s'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)),localStorage.getItem('chaska_sid'));}catch{}
        const body=JSON.stringify({event:fe,product_id:(data&&(data.id||data.product_id))||null,session_id:sid});
        if(navigator.sendBeacon) navigator.sendBeacon('/api/funnel-log',body);
        else fetch('/api/funnel-log',{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});
      }catch{}
    }
  } catch(e) {}
};
