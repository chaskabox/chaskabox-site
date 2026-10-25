import {mountShopHero} from './shop-reference-hero-20261025.js?v=20261025-editor1';
window.addEventListener('message',event=>{
 if(event.source!==window.parent||window.parent===window||event.origin!==location.origin||event.data?.type!=='CHASKABOX_SHOP_HERO_PREVIEW')return;
 mountShopHero(event.data.config);
});
window.parent.postMessage({type:'CHASKABOX_SHOP_HERO_READY'},location.origin);
