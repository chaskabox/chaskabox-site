import {ingestAnalytics} from './_lib/analytics-ingest.js';
export const onRequestPost=c=>ingestAnalytics(c,'box_events');
