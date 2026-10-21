// Product copy is an editorial field, not a source for inferred ingredients or claims.
// Legacy paragraphs and structured sections render through the same presentation system.
export const FIELDS = Object.freeze([
  ['highlights','Highlights'],
  ['taste','Taste & texture'],
  ['serving','Serving ideas'],
  ['ingredients','Ingredients'],
  ['allergens','Allergen information'],
  ['storage','Storage'],
  ['bestBefore','Best before'],
]);
const headings={
  overview:'overview',highlights:'highlights',taste:'taste','taste & texture':'taste',
  serving:'serving','serving ideas':'serving',ingredients:'ingredients',
  allergen:'allergens',allergens:'allergens','allergen information':'allergens',
  storage:'storage','best before':'bestBefore'
};
export function parseDescription(raw){
  const sections={overview:''};
  let section='overview';
  for(const line of String(raw||'').replace(/\r/g,'').slice(0,4000).split('\n')){
    const match=line.match(/^\s*(?:#{1,3}\s*)?(?:\[)?(overview|highlights|taste(?:\s*&\s*texture)?|serving(?:\s+ideas)?|ingredients|allergen(?:s|\s+information)?|storage|best\s+before)(?:\])?\s*:\s*(.*)$/i);
    if(match){section=headings[match[1].toLowerCase().replace(/\s+/g,' ').trim()]||'overview';if(match[2].trim())sections[section]=(sections[section]||'')+(sections[section]?'\n':'')+match[2].trim();}
    else if(line.trim()){sections[section]=(sections[section]||'')+(sections[section]?'\n':'')+line.trim();}
  }
  return sections;
}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
export function descriptionSummary(raw){
  const overview=parseDescription(raw).overview.trim();
  if(!overview)return 'See pack details below. Contact ChaskaBox if you need product-label information before ordering.';
  const first=overview.match(/^.{1,235}?(?:[.!?](?=\s|$)|$)/s);
  return first?first[0].trim():overview.slice(0,220).trim();
}
const lines=content=>String(content||'').split('\n').map(x=>x.replace(/^\s*[-•]\s*/,'').trim()).filter(Boolean);
function paragraphs(value){
  return lines(value).map(t=>'<p>'+escapeHtml(t)+'</p>').join('');
}
export function renderProductContent(p){
  const parts=parseDescription(p.description??p.desc??'');
  const detail=FIELDS.filter(([key])=>String(parts[key]||'').trim());
  const common=[
    ['Brand',p.brand||'Not specified'],
    ['Pack / size',p.pack||'See listed pack'],
    ['Category',p.category||'Snacks'],
  ];
  const specs='<dl class="pd-detail-specs">'+common.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value)+'</dd></div>').join('')+'</dl>';
  const extra=detail.map(([key,label])=>'<section class="pd-detail-item"><h3>'+escapeHtml(label)+'</h3>'+paragraphs(parts[key])+'</section>').join('');
  return '<section class="pd-deep-dive" aria-label="Detailed product information"><div class="pd-deep-main"><span class="pd-detail-eyebrow">PRODUCT GUIDE</span><h2>About this snack</h2><div class="pd-story">'+paragraphs(parts.overview||'Product details are being reviewed. Refer to the pack or ask ChaskaBox before ordering.')+'</div>'+extra+'</div><aside class="pd-deep-aside"><h2>Product details</h2>'+specs+'<details class="pd-label-guide"><summary>Ingredients, allergens & best-before</summary><p>For information not listed above, please check the original sealed pack label or contact ChaskaBox before placing your order. Formulations and dates can vary by batch.</p></details><p class="pd-detail-note">Product information follows the listed pack and available verified details. No nutritional or allergen claims are assumed.</p></aside></section>';
}
