import {ingestAnalytics} from './_lib/analytics-ingest.js';
export const onRequestPost=c=>ingestAnalytics(c,'search_logs');
