/* Add retail packs only after a fresh public catalogue check. Checkout is server-priced. */
(()=>{const button=document.getElementById('addOccasion'),status=document.getElementById('occasionStatus');if(!button||button.disabled)return;
 button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Checking current packs…';try{
  const ids=JSON.parse(document.getElementById('occasion-selection').textContent).ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>10||!ids.every(Number.isSafeInteger))throw Error('Please choose packs from the shop.');
  const response=await fetch('/api/products?fresh=1',{cache:'no-store'});if(!response.ok)throw Error('The catalogue is unavailable. Please try again.');
  const rows=await response.json();if(!Array.isArray(rows)||!ids.every(id=>rows.some(p=>Number(p.id)===id&&p.stockState!=='unavailable')))throw Error('A suggested pack changed availability. Please review the selection.');
  let bag=JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');if(!bag||Array.isArray(bag)||typeof bag!=='object')throw Error('Please review your bag first.');
  const next={};for(const [key,value] of Object.entries(bag)){if(!/^\d+$/.test(key)||!Number.isSafeInteger(value)||value<1||value>99)throw Error('Please review your bag first.');next[key]=value;}
  for(const id of ids){const current=next[id]||0;if(current>=99)throw Error('Reduce the quantity of this pack in your bag first.');next[id]=current+1;}
  if(Object.keys(next).length>50)throw Error('Your bag can contain up to 50 different snacks. Please review your bag first.');
  localStorage.setItem('chaskabox-cart',JSON.stringify(next));status.innerHTML='Packs added. <a href="/cart/">Review your Bag</a>';button.textContent='Add these packs again';
 }catch(error){status.textContent=error.message||'Could not update your bag. Please try again.';}finally{button.disabled=false;}});
})();
