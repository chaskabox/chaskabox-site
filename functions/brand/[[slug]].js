import {renderBrandPage} from '../api/_lib/catalogue-page.js';
import {catalogueUnavailable} from '../api/_lib/storefront-html.js';
export function onRequestGet(context){const parts=Array.isArray(context.params.slug)?context.params.slug:[context.params.slug];return parts.length===1&&/^[a-z0-9-]+$/.test(parts[0]||'')?renderBrandPage(context,parts[0]):catalogueUnavailable(404);}
