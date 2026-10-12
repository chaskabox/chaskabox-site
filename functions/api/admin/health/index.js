/**
 * /api/admin/health
 * GET — system health dashboard (read-only, no secrets).
 * Roles: owner, manager.
 */
import { withAdmin, sb, json, env } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const e = env(context);
  const health = {
    timestamp: new Date().toISOString(),
    supabase: { status: 'unknown' },
    turnstile: { status: 'unknown' },
    resend: { status: 'unknown' },
    ai: { status: 'unknown' },
    functions: { status: 'ok', version: 'v4' },
  };

  // Supabase: try a simple query
  try {
    await sb(context, '/rest/v1/products?select=id&limit=1');
    health.supabase.status = 'connected';
  } catch { health.supabase.status = 'error'; }

  // Turnstile: check secret configured
  health.turnstile.status = e.TURNSTILE_SECRET_KEY ? 'configured' : 'missing';

  // Notification credentials live on the separate consumer, not Pages.
  // Report its recorded activity rather than treating Pages env as delivery health.
  try {
    const n=await sb(context,'/rest/v1/rpc/notification_summary',{method:'POST',body:{}}),s=n.dispatch||{};
    health.notifications={status:!s.enabled?'paused':!s.last_completed_at||Date.now()-Date.parse(s.last_completed_at)>5*60000?'no_recent_heartbeat':s.last_error||n.review_required||n.overdue||n.inactive_channel_pending?'degraded':'active',last_completed_at:s.last_completed_at||null,provider_results:n.provider_results};
    health.resend.status=(s.configured_targets||[]).includes('owner_email')?'consumer_configured':'not_confirmed';
  } catch { health.notifications={status:'unavailable'};health.resend.status='unknown'; }

  // AI: check binding
  try {
    health.ai.status = context.env.AI ? 'connected' : 'not_configured';
  } catch { health.ai.status = 'not_configured'; }

  // Last deployment info (from env if available)
  health.deployment = {
    commit: e.CF_PAGES_COMMIT_SHA || e.GITHUB_SHA || 'unknown',
    branch: e.CF_PAGES_BRANCH || 'unknown',
  };

  return json(health);
});
