/* Shared product-description renderer for existing and future storefront products. */
(function(){
  'use strict';
  var names=[
    ['highlights','Highlights'],['taste','Taste & texture'],['serving','Serving ideas'],
    ['ingredients','Ingredients'],['allergens','Allergen information'],['storage','Storage'],
    ['bestBefore','Best before']
  ];
  var aliases={'overview':'overview','highlights':'highlights','taste':'taste','taste & texture':'taste','serving':'serving','serving ideas':'serving','ingredients':'ingredients','allergen':'allergens','allergens':'allergens','allergen information':'allergens','storage':'storage','best before':'bestBefore'};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]});};
  function parse(raw){
    var out={overview:''},field='overview';
    String(raw||'').replace(/\r/g,'').slice(0,4000).split('\n').forEach(function(line){
      var m=line.match(/^\s*(?:#{1,3}\s*)?(?:\[)?(overview|highlights|taste(?:\s*&\s*texture)?|serving(?:\s+ideas)?|ingredients|allergen(?:s|\s+information)?|storage|best\s+before)(?:\])?\s*:\s*(.*)$/i);
      if(m){field=aliases[m[1].toLowerCase().replace(/\s+/g,' ').trim()]||'overview';if(m[2].trim())out[field]=(out[field]?out[field]+'\n':'')+m[2].trim();}
      else if(line.trim()){out[field]=(out[field]?out[field]+'\n':'')+line.trim();}
    });
    return out;
  }
  function summary(raw){
    var s=(parse(raw).overview||'').trim();
    if(!s)return 'See pack details below. Contact ChaskaBox for product-label information before ordering.';
    var match=s.match(/^.{1,235}?(?:[.!?](?=\s|$)|$)/s);
    return match?match[0].trim():s.slice(0,220).trim();
  }
  function paras(content){return String(content||'').split('\n').map(function(v){return v.replace(/^\s*[-•]\s*/,'').trim();}).filter(Boolean).map(function(v){return '<p>'+esc(v)+'</p>';}).join('');}
  function content(product){
    var p=product||{},data=parse(p.desc||p.description||'');
    var values=[['Brand',p.brand||'Not specified'],['Pack / size',p.pack||'See listed pack'],['Category',p.category||'Snacks']];
    var facts=values.map(function(pair){return '<div><dt>'+esc(pair[0])+'</dt><dd>'+esc(pair[1])+'</dd></div>';}).join('');
    var extras=names.filter(function(pair){return String(data[pair[0]]||'').trim();}).map(function(pair){return '<section class="pd-detail-item"><h3>'+esc(pair[1])+'</h3>'+paras(data[pair[0]])+'</section>';}).join('');
    return '<section class="pd-deep-dive" aria-label="Detailed product information"><div class="pd-deep-main"><span class="pd-detail-eyebrow">PRODUCT GUIDE</span><h2>About this snack</h2><div class="pd-story">'+paras(data.overview||'Product details are being reviewed. Refer to the pack or ask ChaskaBox before ordering.')+'</div>'+extras+'</div><aside class="pd-deep-aside"><h2>Product details</h2><dl class="pd-detail-specs">'+facts+'</dl><details class="pd-label-guide"><summary>Ingredients, allergens & best-before</summary><p>For information not listed above, please check the original sealed pack label or contact ChaskaBox before placing your order. Formulations and dates can vary by batch.</p></details><p class="pd-detail-note">Product information follows the listed pack and available verified details. No nutritional or allergen claims are assumed.</p></aside></section>';
  }
  window.ChaskaProductCopy={parse:parse,summary:summary,content:content};
})();