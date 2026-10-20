import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const lazy of [false,true])test(lazy?'hero mounted after Brands navigation keeps controls, timer and accessibility pauses':'home hero advances every 5 seconds, with controls and accessibility pauses',()=>{
  const code=readFileSync(new URL('../home-hero-carousel.js',import.meta.url),'utf8');
  const events={}; const rootEvents={}; const docEvents={}; const windowEvents={};
  const media={matches:false,addEventListener(_name,fn){this.onChange=fn;}};
  let hover=false,scheduled=null,sequence=0;
  const title={replaceChildren(){},append(){}};
  const dots=Array.from({length:3},()=>({setAttribute(){}}));
  const label={textContent:''},icon={textContent:''};
  const autoplay={
    dataset:{},disabled:false,attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    querySelector(selector){return selector.includes('label')?label:icon;}
  };
  const controls={
    querySelector(){return autoplay;},
    querySelectorAll(){return dots;},
    addEventListener(name,fn){events[name]=fn;},
    contains(){return true;}
  };
  const imageRequests=[],artEvents={};
  const art={src:'',complete:false,naturalWidth:0,getAttribute(){return this.src;},setAttribute(_key,value){this.src=value;},addEventListener(name,fn){artEvents[name]=fn;}};
  const elements={
    '.herotxt h1':title,
    '.herotxt > p':{textContent:''},
    '.hero-eyebrow':{textContent:''},
    '.kick':null,
    '.hero-actions .cta':{firstChild:{nodeType:3,textContent:''},href:''},
    '.hero-actions .cta.ghost':{textContent:'',href:''},
    '.hero-slider-controls':controls,
    '.hero-scene':art,
    '#heroCollage':null
  };
  const root={
    dataset:{},hidden:false,
    querySelector(selector){return elements[selector]??null;},
    getClientRects(){return [1];},
    matches(){return hover;},
    contains(element){return Boolean(element?.isHeroChild);},
    addEventListener(name,fn){rootEvents[name]=fn;}
  };
  let mounted=!lazy;
  const doc={
    hidden:false,activeElement:null,
    querySelector(){return mounted?root:null;},
    createTextNode(text){return {text};},
    createElement(){return {className:'',textContent:''};},
    addEventListener(name,fn){docEvents[name]=fn;}
  };
  const sandbox={
    document:doc,
    window:{matchMedia(){return media;},addEventListener(name,fn){windowEvents[name]=fn;},requestIdleCallback(fn){fn();}},
    Image:class{set src(value){imageRequests.push({src:value,priority:this.fetchPriority});}},
    setInterval(fn,delay){scheduled={fn,delay,id:++sequence};return sequence;},
    clearInterval(id){if(scheduled?.id===id)scheduled=null;}
  };
  vm.runInNewContext(code,sandbox,{filename:'home-hero-carousel.js'});
  if(lazy){
    assert.equal(scheduled,null,'an inactive Home template starts no timer');
    mounted=true;docEvents['chaskabox:home-mounted']();
  }
  assert.equal(root.dataset.heroSlide,'1');
  assert.equal(imageRequests.length,0,'next artwork waits for the initial scene load');
  art.complete=true;art.naturalWidth=1600;artEvents.load();
  assert.equal(imageRequests.length,1);
  assert.equal(imageRequests[0].src,'/images/chaskabox-approved-hero-02-20261018.avif');
  assert.equal(imageRequests[0].priority,'low');
  assert.equal(scheduled?.delay,5000);
  assert.equal(label.textContent,'Pause');
  scheduled.fn();assert.equal(root.dataset.heroSlide,'2');
  scheduled.fn();assert.equal(root.dataset.heroSlide,'3');
  scheduled.fn();assert.equal(root.dataset.heroSlide,'1');
  hover=true;rootEvents.mouseenter();assert.equal(scheduled,null,'hover pauses');
  hover=false;rootEvents.mouseleave();assert.equal(scheduled?.delay,5000,'mouseleave resumes');
  doc.activeElement={isHeroChild:true};rootEvents.focusin();assert.equal(scheduled,null,'focus pauses');
  doc.activeElement=null;rootEvents.focusout({relatedTarget:null});assert.equal(scheduled?.delay,5000,'blur resumes');
  media.matches=true;media.onChange();assert.equal(scheduled,null,'reduced motion pauses');
  media.matches=false;media.onChange();assert.equal(scheduled?.delay,5000,'normal motion resumes');
  doc.hidden=true;docEvents.visibilitychange();assert.equal(scheduled,null,'hidden tab pauses');
  doc.hidden=false;docEvents.visibilitychange();assert.equal(scheduled?.delay,5000,'visible tab resumes');
  hover=true;rootEvents.mouseenter();
  events.click({target:{closest(){return {dataset:{heroDirection:'next'}};}}});
  assert.equal(root.dataset.heroSlide,'2','manual next works while paused');
  assert.equal(scheduled,null,'manual navigation while hovered remains paused');
  assert.equal(label.textContent,'Play','manual selection offers explicit resumption');
  hover=false;rootEvents.mouseleave();
  assert.equal(scheduled,null,'manual selection remains paused after mouseleave');
  doc.activeElement=null;rootEvents.focusout({relatedTarget:null});
  assert.equal(scheduled,null,'manual selection remains paused after blur');
  doc.hidden=true;docEvents.visibilitychange();
  doc.hidden=false;docEvents.visibilitychange();
  assert.equal(scheduled,null,'tab revisit preserves the deliberate pause');
  windowEvents['chaskabox:home-config']({detail:{heading:'CMS heading'}});
  assert.equal(scheduled,null,'CMS updates do not erase the deliberate pause');
  events.click({target:{closest(){return autoplay;}}});
  assert.equal(scheduled?.delay,5000,'Play explicitly resumes the five-second timer');
  assert.equal(label.textContent,'Pause');
  events.click({target:{closest(){return autoplay;}}});
  assert.equal(scheduled,null,'Pause stops the timer');
  media.matches=true;media.onChange();
  assert.equal(autoplay.disabled,true,'reduced motion disables autoplay control');
  assert.equal(label.textContent,'Paused');
  media.matches=false;media.onChange();
  assert.equal(autoplay.disabled,false);
  assert.equal(scheduled,null,'leaving reduced motion preserves a user pause');
  const selected=root.dataset.heroSlide;
  docEvents['chaskabox:home-mounted']();
  assert.equal(root.dataset.heroSlide,selected,'repeated initialization preserves the selected slide');
  assert.equal(scheduled,null,'repeated initialization preserves the deliberate pause');
});
