#!/usr/bin/env node
// M05 source-based safety gate. Never deploys or reads production secrets.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const paths=[
 'database/migrations/20261014170000_m0_internal_table_grants.sql',
 'database/migrations/20261014200000_m01_agent_infrastructure.sql',
 'database/migrations/20261014210000_m02_monitoring_snapshots.sql',
 'database/migrations/20261014220000_m03_insight_signals.sql',
 'database/migrations/20261014230000_m04_marketing_draft_approvals.sql',
 'functions/api/admin/agents/status.js','functions/api/admin/agents/preview.js',
 'functions/api/admin/agents/insights.js','functions/api/admin/agents/marketing.js',
 'admin-agents.js','tests/m05-consolidated-safety.test.mjs'
];
const content=new Map();
for(const p of paths)content.set(p,await readFile(new URL('../'+p,import.meta.url),'utf8'));
const m01=content.get(paths[1]),marketing=content.get(paths[4]);
assert.match(m01,/enabled boolean NOT NULL DEFAULT false/);
assert.match(m01,/mode text NOT NULL DEFAULT 'observe'/);
assert.doesNotMatch(marketing,/https?:\/\/.*api\.(?:resend|waha)|sendEmail|publishCampaign/);
for(const f of ['preview','insights','marketing','status']){
 const c=content.get('functions/api/admin/agents/'+f+'.js');
 assert.match(c,/withAdmin\(\['owner'\]/);
}
if(process.argv.includes('--production')){
 console.error('PRODUCTION BLOCKED: approvals, staging restore, branch controls and token security must be verified outside this static check.');
 process.exitCode=2;
}else console.log('M05 source safety gate passed. Production authorization NOT granted.');
