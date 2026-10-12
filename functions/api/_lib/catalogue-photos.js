// Exact-source aliases preserve newly edited product photos. Assets use the original uploaded pixels.
export const OPTIMIZED_PHOTOS={
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/b380995f-4e4f-46d1-832a-d7d5ee1fb0bd.png": "images/uploaded-p34-abf4d3ecbf.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/df9c9e5d-5429-46f4-aba0-d7ef9aa560b9.png": "images/uploaded-p39-94eb65dba4.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/bcd2fa39-159d-406b-89dc-a7c25be665af.png": "images/uploaded-p42-de917329fe.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/560b850b-3a0b-4164-b85e-c89823a8035c.png": "images/uploaded-p43-b2becdd1ac.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/4627d6cb-13ba-4793-9433-86cea19b2158.png": "images/uploaded-p46-a8420fa338.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/6022ab92-ecb4-4318-b9d6-1d4524cda635.png": "images/uploaded-p48-2ba2703410.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/21721ee7-84e4-498e-b85d-17b2ae8c11c1.png": "images/uploaded-p49-040aa62478.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/75f14bf5-f9ba-47ec-9f27-30faf824ced9.png": "images/uploaded-p80-4fc6da96a3.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/7ce021e0-3dcc-4100-9f64-9fb90d55408b.png": "images/uploaded-p163-e616036654.webp",
  "https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/33ac1690-0425-4c5e-91ca-e32b0c4400f7.png": "images/uploaded-p183-f96ec9f33c.webp"
};
const mismatched="https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/7ad390ca-1b87-4ef2-8086-34576726c0d7.png";
function samePhoto(a,b){try{const x=new URL(a),y=new URL(b);return x.origin===y.origin&&x.pathname===y.pathname;}catch{return a===b;}}
export function photoUnderReview(p){return Number(p.id)===186&&/^pack\s+of\s+12$/i.test(String(p.pack||'').trim())&&samePhoto(p.image_url,mismatched);}
export function cataloguePhoto(p){return photoUnderReview(p)?'':OPTIMIZED_PHOTOS[p.image_url]||p.image_url||'';}
