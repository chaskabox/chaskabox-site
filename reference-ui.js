/* Public navigation state only. All buying and account actions retain their original handlers. */
(()=>{
 function markNavigation(){
  const current=location.pathname.replace(/\/$/,'')||'/';
  document.querySelectorAll('.cb-subnav-links a,.cb-mobile-dock a').forEach(link=>{
   const url=new URL(link.href,location.origin),path=url.pathname.replace(/\/$/,'')||'/';
   const match=path===current&&url.search===location.search&&!link.hasAttribute('onclick')&&!link.classList.contains('cb-discover');
   if(match)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
 }
 document.addEventListener('click',()=>queueMicrotask(markNavigation));
 window.addEventListener('popstate',markNavigation);
 document.addEventListener('DOMContentLoaded',markNavigation);
 markNavigation();
})();
