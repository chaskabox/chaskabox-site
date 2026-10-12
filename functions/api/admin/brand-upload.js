import {withAdmin} from './_lib/auth.js';
import {uploadMedia} from './_lib/media.js';
export const onRequestPost=withAdmin(['owner','manager'],(context,{user})=>uploadMedia(context,user,'brand-assets','logo'));
