/* Product-specific draft generator for authenticated catalogue editors.
 * Uses ONLY confirmed ChaskaBox name, brand, category and pack fields.
 * Never publishes or guesses ingredients, allergens, dates, formulations, stock or exact box contents.
 * Source-linked researched drafts take precedence. Every generated draft needs staff review.
 */
(function(global){
  'use strict';
  const tidy=s=>String(s||'').replace(/\s+/g,' ').trim();
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const flavorSignals=[
    [/\bdouble chocolate\b/i,'double chocolate'],
    [/\bstrawberry\b/i,'strawberry'],[/\bblue ?berry\b/i,'blueberry'],[/\bblack ?currant\b/i,'blackcurrant'],
    [/\bras(p)?berry\b/i,'raspberry'],[/\blychee\b/i,'lychee'],[/\bpeach\b/i,'peach'],
    [/\bmango\b|\baamrus\b/i,'mango'],[/\bgreen mango\b|\bkacha mango\b|\bkairi\b/i,'green mango'],
    [/\borange\b/i,'orange'],[/\bapple\b/i,'apple'],[/\bpineapple\b/i,'pineapple'],
    [/\bpomegranate\b|\banar\b/i,'pomegranate'],[/\bapricot\b/i,'apricot'],
    [/\bcherry\b/i,'cherry'],[/\bcola\b/i,'cola'],[/\bvanilla\b/i,'vanilla'],
    [/\bcaramel\b/i,'caramel'],[/\bbutter ?scotch\b/i,'butterscotch'],
    [/\bkhopra\b|\bcoconut\b/i,'coconut'],[/\bguava\b|\bamrood\b/i,'guava'],
    [/\bpeanut\b/i,'peanut'],[/\bcashew\b/i,'cashew'],[/\bwalnut\b/i,'walnut'],
    [/\bhazelnut\b/i,'hazelnut'],[/\bcoffee\b/i,'coffee'],[/\bkulfi\b|\bkulfa\b/i,'kulfi'],
    [/\bchicken\b|\bmurgh\b/i,'chicken'],[/\bbarbeque\b|\bbbq\b/i,'BBQ'],
    [/\bcheese\b|\bcheezy\b/i,'cheese'],[/\bpizza\b|\bpizzo\b/i,'pizza'],
    [/\bketchup\b/i,'ketchup'],[/\bsalsa\b/i,'salsa'],[/\bgarlic mayo\b/i,'garlic mayo'],
    [/\bspicy\b|\bhot\b/i,'spicy'],[/\bsour\b|\bkhatta\b/i,'sour'],
    [/\bimli\b|\btamarind\b/i,'tamarind'],[/\bchilli\b|\bchili\b/i,'chilli'],
    [/\bmint\b/i,'mint'],[/\bchocolate\b|\bchoco\b/i,'chocolate'],[/\bfruit\b|\bfruity\b/i,'fruit']
  ];
  function inferredVariant(name){
    const exact=tidy(name);
    // Longer specific forms before broad chocolate/mango identifiers.
    const special=[[/\bgreen mango\b|\bkacha mango\b|\bkairi\b/i,'green mango'],[/\bdouble chocolate\b/i,'double chocolate'],[/\bgarlic mayo\b/i,'garlic mayo'],[/\bblack ?currant\b/i,'blackcurrant']];
    if(/\bmango\b/i.test(exact)&&/\bchocolate\b/i.test(exact))return 'mango and chocolate';
    if(/\bpeanut\b/i.test(exact)&&/\bcaramel\b/i.test(exact))return 'peanut and caramel';
    for(const [re,v] of special)if(re.test(exact))return v;
    for(const [re,v] of flavorSignals)if(re.test(exact))return v;
    return '';
  }
  function productType(name,category){
    const n=tidy(name).toLowerCase(),c=tidy(category).toLowerCase();
    if(/bundle|\bbox\b|mega mix|family pack|mix plate/.test(n))return 'assortment';
    if(/pan masala|pan bahar|betel nut|supari/.test(n))return 'pan masala';
    if(/wafer|wafees|rolli|love letter/.test(n))return 'wafer';
    if(/croissant|puff pastry/.test(n))return 'baked pastry';
    if(/biscuit|canteen|cookies|cafe\b|cremo\b/.test(n))return 'biscuit';
    if(/bubble|bubble gum|\bgum\b|speckle gum/.test(n))return 'chewing gum';
    if(/marshmallow|puff rainbow|puff party/.test(n))return 'marshmallow';
    if(/jelly|jellies|wobbly|twisto/.test(n))return 'jelly';
    if(/cake|kake|cupkake|creamfillz|bake time|swiss roll|jam roll/.test(n))return 'cake';
    if(/ice pop|ice lolly/.test(n))return 'ice pop';
    if(/lavashak|fruit bar|fruit stick|imista|tamarind|\bimli\b|chatni ball/.test(n))return 'fruit and tangy sweet';
    if(/chocolate|\bchoco\b|calibar|milky choc|cubes\b|chocolates/.test(n))return 'chocolate confectionery';
    if(/candy|toffee|eclairs|fudge|butter scotch|frooto|fruit gala|creamer|kulfa/.test(n))return 'candy';
    if(/rolls strawberry|mint\b/.test(n)&&c.includes('pan masala'))return 'confectionery';
    if(c.includes('snacks')||/pop|namak|daal|stick|frip|puri|nimco|masala|bhujya|snack/.test(n))return 'savoury snack';
    if(c.includes('jellies'))return 'confectionery';
    if(c.includes('chews'))return 'confectionery';
    if(c.includes('cakes'))return 'sweet snack';
    if(c.includes('candies'))return 'confectionery';
    return 'packaged snack';
  }
  const categories={
    'wafer':{category:'wafer snack',lead:'a wafer-style snack',why:'The wafer format distinguishes this item from ordinary biscuits.',serve:'Arrange alongside biscuits for a snack platter or keep the listed pack ready for tea breaks.'},
    'baked pastry':{category:'baked snack',lead:'a baked pastry snack',why:'This listing is for the named pastry variety rather than a conventional biscuit.',serve:'Set out with other baked snacks at tea-time, or serve alongside coffee.'},
    'biscuit':{category:'biscuit',lead:'a biscuit snack',why:'The title identifies the exact biscuit variety, helping distinguish it from related flavours.',serve:'Offer on a biscuit tray with tea or include in a mixed biscuit selection.'},
    'chewing gum':{category:'chewing gum',lead:'a chewing-gum product',why:'This is the specific gum style named in the listing, not an interchangeable flavour.',serve:'Keep the sealed packs together in a mixed chewing-gum selection; see packaging for usage advice.'},
    'marshmallow':{category:'marshmallow treat',lead:'a marshmallow-style sweet',why:'The listed marshmallow format makes this distinct from jelly and hard candy.',serve:'Add to an assorted sweets tray; read the original wrapper for ingredients and allergen information.'},
    'jelly':{category:'jelly confectionery',lead:'a jelly-style confectionery item',why:'The named jelly variant is distinct from the other flavours and shapes in the range.',serve:'Mix with other packaged jellies for a confectionery selection or offer the stated pack at gatherings.'},
    'cake':{category:'cake snack',lead:'a packed cake snack',why:'The title identifies this particular cake style or flavour in the range.',serve:'Serve with tea or combine with other packaged cakes for a sweet snack selection.'},
    'ice pop':{category:'ice pop',lead:'an ice-pop listing',why:'The title identifies the specific ice-pop flavour option.',serve:'Check the original packaging for preparation, serving and storage instructions.'},
    'fruit and tangy sweet':{category:'tangy confectionery',lead:'a fruit- or tangy-style confectionery listing',why:'The named fruit, bar or imli-style format helps distinguish this variety.',serve:'Include alongside other sour and fruity sweets in a mixed assortment.'},
    'chocolate confectionery':{category:'chocolate treat',lead:'a chocolate-style confectionery item',why:'This is the particular chocolate variety shown in the product title.',serve:'Arrange with other packed chocolates for gifting or a small snack assortment.'},
    'candy':{category:'candy or toffee',lead:'a confectionery item',why:'The named flavour and candy or toffee format help identify the correct variant.',serve:'Place the packaged sweets in a candy tray or add to a mixed treat selection.'},
    'pan masala':{category:'pan masala product',lead:'a pan masala listing',why:'The exact named pan masala variety matters when comparing flavour and pack options.',serve:'Review the original package for product composition, warnings and directions before use.'},
    'confectionery':{category:'confectionery item',lead:'a packaged confectionery item',why:'The variety named in this listing is the relevant option within its product family.',serve:'Add this variant to a mixed sweets selection; consult the pack for storage and ingredients.'},
    'savoury snack':{category:'savoury snack',lead:'a packaged savoury snack',why:'The name identifies the specific snack format or seasoning-style variety.',serve:'Serve in a snack bowl alongside other savoury packs, or keep the listed format ready for casual gatherings.'},
    'sweet snack':{category:'sweet snack',lead:'a packaged sweet snack',why:'The named product is a specific variety within the sweet-snack selection.',serve:'Include in an assorted dessert snack tray or set out for tea-time.'},
    'packaged snack':{category:'snack item',lead:'a packaged snack listing',why:'The original product title is preserved so the precise variety remains identifiable.',serve:'Check the original package for exact ingredients, allergen warnings and any serving instructions.'},
    'assortment':{category:'assorted snack selection',lead:'a snack assortment or bundle',why:'Bundle contents can vary by listing; only the pack format shown here is confirmed.',serve:'Check the current product listing or contact ChaskaBox to confirm the exact selection before placing an order.'}
  };
  function shorten(s,max){
    if(s.length<=max)return s;
    const cut=s.slice(0,max+1);
    return cut.slice(0,Math.max(1,cut.lastIndexOf(' '))).replace(/[\s,|\-]+$/,'');
  }
  function make(input){
    if(!input||typeof input!=='object')return null;
    const name=tidy(input.name),packRaw=tidy(input.pack),brand=tidy(input.brand),category=tidy(input.category);
    const pack=tidy(packRaw.replace(/\s*\(\s*Rs\.?\s*[\d,.]+\s*\)/gi,''));
    if(name.length<3||name.length>180||!pack)return null;
    const cleaned=tidy(name.replace(/^(?:[^|]{1,35}\s*\|\s*)/,'')).replace(/\s*[\(\[]Rs\.?\s*\d+[\)\]]/gi,'').replace(/\s+[—-]\s+Pack\s+Of\s+\d+$/i,'').trim();
    const label=cleaned||name;
    const type=productType(name,category),style=categories[type];
    const variety=inferredVariant(cleaned);
    const variantSentence=variety?
      'The product name identifies the '+variety+' variety.':
      'The listed name identifies this specific '+style.category+' within the catalogue.';
    const branded=brand?brand+' '+label:label;
    const intro=branded+' is '+style.lead+' available in the listed '+pack+' format. '+variantSentence;

    const features=[
      'Named product: '+label,
      variety?'Variety shown in title: '+cap(variety):'Product type: '+style.category,
      'ChaskaBox listing format: '+pack
    ];
    const description=intro+'\n\nHighlights:\n'+features.map(f=>'- '+f).join('\n')+
      '\n\nServing ideas:\n'+style.serve;
    // Admin and publication limits are stricter than search engine field maxima.
    const suffix=' | '+(pack==='Contents under review'?'':pack+' | ')+'ChaskaBox';
    const seoName=shorten(branded.replace(/\s+-\s+Pack\s+Of\s+\d+$/i,''),60-suffix.length);
    const seo_title=seoName+suffix;
    const seoLead=shorten(branded,72);
    const seo_description=shorten('Shop '+seoLead+', '+(pack==='Contents under review'?'details to be confirmed':pack)+', at ChaskaBox Pakistan. See this product listing for current details.',155).replace(/[ ,]+$/,'')+'.';
    return {name,brand,category,pack,description,seo_title,seo_description,
      review:pack==='Contents under review'?'block-unverified-bundle':'manual-label-check-required',source_kind:'chaskabox_catalogue',
      source_note:'Draft based only on authenticated ChaskaBox product name, brand, category and pack. Not manufacturer- or original-wrapper-verified. Review the exact SKU, flavour and label before saving.',
      source:''};
  }
  global.ChaskaDraftFromCatalog=make;
})(window);
