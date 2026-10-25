import {SHOP_HERO_HTML} from './shop-reference-hero-markup-20261025.js';

const shopPath=()=>/^\/shop\/?$/.test(location.pathname);
let controller;

export function mountShopHero(){
  if(!shopPath())return;
  const view=document.getElementById('view-shop');
  if(!view)return;
  let root=document.getElementById('cb-shop-hero');
  if(!root){
    const template=document.createElement('template');
    template.innerHTML=SHOP_HERO_HTML;
    view.prepend(template.content);
    root=document.getElementById('cb-shop-hero');
  }
  if(!document.getElementById('cb-shop-hero-style')){
    const style=document.createElement('link');
    style.id='cb-shop-hero-style';style.rel='stylesheet';
    style.href='/shop-reference-hero-20261025.css?v=20261025-speed1';document.head.append(style);
  }
  if(controller){controller.setActive();return;}
  const words=['Meetha bhi.','Chatpata bhi.','Crunchy bhi.'];
  const flavour=root.querySelector('#cb-shop-flavour');
  const dots=[...root.querySelectorAll('button[data-slide]')];
  const pause=root.querySelector('.cb-pause');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let current=0,paused=reduce.matches,timer,inViewport=true;
  const visible=()=>shopPath()&&!view.hidden&&view.style.display!=='none';
  function schedule(){
    clearInterval(timer);
    const stopped=paused||reduce.matches||document.hidden||!visible()||!inViewport;
    root.classList.toggle('cb-paused',stopped);
    if(!stopped)timer=setInterval(()=>select(current+1),3000);
  }
  function select(index,animate=true){
    current=(index+words.length)%words.length;root.dataset.slide=String(current);
    flavour.textContent=words[current];
    dots.forEach((dot,i)=>dot.setAttribute('aria-current',String(i===current)));
    flavour.classList.remove('is-changing');
    if(animate&&!reduce.matches&&!paused){void flavour.offsetWidth;flavour.classList.add('is-changing');}
  }
  function updatePause(){
    pause.setAttribute('aria-pressed',String(paused));
    pause.setAttribute('aria-label',paused?'Play animations':'Pause animations');
    pause.querySelector('span').textContent=paused?'▶':'Ⅱ';
    if(paused)flavour.classList.remove('is-changing');
    schedule();
  }
  controller={setActive(){root.hidden=!visible();schedule();}};
  window.ChaskaShopHero=controller;
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>{select(i);schedule();}));
  pause.addEventListener('click',()=>{paused=!paused;updatePause();});
  reduce.addEventListener('change',event=>{paused=event.matches;updatePause();});
  document.addEventListener('visibilitychange',schedule);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
    inViewport=entries[0].isIntersecting;schedule();
  }).observe(root);
  root.querySelector('[data-shop-catalogue]').addEventListener('click',event=>{
    const target=document.getElementById('catTitle');if(!target)return;
    event.preventDefault();event.stopPropagation();
    target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
    target.scrollIntoView({behavior:reduce.matches?'auto':'smooth',block:'start'});
  });
  controller.setActive();updatePause();
}

mountShopHero();
