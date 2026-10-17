/* Keep the shipping policy consistent with owner-controlled checkout fees. */
(async()=>{
 try{
  const r=await fetch('/api/storefront-config',{cache:'no-cache'});
  if(!r.ok)return;
  const {settings:s={}}=await r.json();
  const money=n=>'Rs. '+Number(n).toLocaleString('en-PK');
  const fee=n=>Number.isInteger(Number(n))&&Number(n)>=0?Number(n):300;
  const cod=document.getElementById('policyCodFee');
  const prepaid=document.getElementById('policyPrepaidFee');
  if(cod)cod.textContent=money(fee(s.cod_delivery_fee_pkr))+' delivery charge.';
  if(prepaid){
   const prepaidFee=money(fee(s.prepaid_delivery_fee_pkr));
   if(s.prepaid_free_delivery_enabled===false){
    prepaid.textContent='Delivery is '+prepaidFee+'; the free-delivery promotion is currently disabled.';
   }else{
    const threshold=Number.isInteger(Number(s.prepaid_free_delivery_threshold_pkr))?Number(s.prepaid_free_delivery_threshold_pkr):5000;
    prepaid.textContent='Orders of '+money(threshold)+' or more qualify for free delivery; below that threshold the delivery charge is '+prepaidFee+'.';
   }
  }
 }catch{ /* Keep safe default policy copy if configuration cannot be loaded. */ }
})();
