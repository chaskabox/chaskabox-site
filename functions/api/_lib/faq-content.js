export function storeFaqs(settings={}){
 const amount=Number(settings.cod_advance_amount_pkr??500),fee=Number(settings.cod_delivery_fee_pkr??300),prepaid=Number(settings.prepaid_delivery_fee_pkr??300),threshold=Number(settings.prepaid_free_delivery_threshold_pkr??5000);
 return [
  {q:'How does ChaskaBox source my order?',a:'We source and pack the listed retail products after receiving your order. Check the current pack size, price and availability before ordering.'},
  {q:'Is Cash on Delivery available?',a:settings.cod_enabled===false?'Cash on Delivery is currently paused. Checkout shows the available payment methods.':(settings.cod_advance_enabled===false?'Cash on Delivery is available.':'New COD orders require an advance of Rs. '+amount.toLocaleString('en-PK')+' before dispatch, capped at the order total. It is deducted from the total; pay the remaining amount on delivery.')+' COD delivery is Rs. '+fee.toLocaleString('en-PK')+'.'},
  {q:'What are the prepaid delivery charges?',a:(settings.prepaid_free_delivery_enabled===false?'Prepaid delivery is Rs. '+prepaid.toLocaleString('en-PK')+'.':'Prepaid orders of Rs. '+threshold.toLocaleString('en-PK')+' or more qualify for free delivery; below that, delivery is Rs. '+prepaid.toLocaleString('en-PK')+'.')+' Checkout confirms the applicable city rate and final total.'},
  {q:'When will my order arrive?',a:'The estimated Pakistan-wide delivery window is '+String(settings.delivery_estimate||'4–7 days')+'. This is an estimate; sourcing, destination and courier operations can affect delivery.'},
  {q:'What happens if an item is unavailable?',a:'We contact you before removing or substituting an unavailable item. We do not intentionally make silent substitutions.'},
  {q:'How do I ask about an order or damaged item?',a:'Use the Contact page and provide your order number. For damaged or incorrect items, include clear photos of the item and packaging. See the Refund & Resolution policy for the current process.'}
 ];
}
