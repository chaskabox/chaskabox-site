import { withAdmin, sb, json, readJson, httpError, env, requireMfa } from '../_lib/auth.js';

const ROLES = new Set(['owner', 'manager', 'fulfilment', 'content']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// This service-role credential is strictly server-side. Never return Auth's full
// user records or expose the credential to the staff-management browser.
async function authAdmin(context, path, options = {}) {
  const e = env(context);
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    httpError('Staff identity service is not configured', 503, 'auth_unavailable');
  }
  let response;
  try {
    response = await fetch(String(e.SUPABASE_URL).replace(/\/+$/, '') + '/auth/v1/admin' + path, {
      method: options.method || 'GET',
      headers: {
        apikey: e.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
    });
  } catch {
    httpError('Staff identity service unavailable', 503, 'auth_unavailable');
  }
  if (response.status === 404 && options.allowMissing) return null;
  if (!response.ok) httpError('Staff identity lookup failed; please retry', 502, 'auth_unavailable');
  return response.json();
}

async function getStaffWithEmails(context, rows) {
  const staff = [];
  // Keep requests bounded even if staff count increases in the future.
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    const people = await Promise.all(chunk.map(row =>
      authAdmin(context, '/users/' + encodeURIComponent(row.user_id), { allowMissing: true })
    ));
    chunk.forEach((row, index) => {
      const person = people[index];
      staff.push({
        user_id: row.user_id,
        role: row.role,
        active: row.active,
        granted_at: row.granted_at,
        email: person?.email || null,
        invite_pending: Boolean(person?.invited_at && !person?.email_confirmed_at && !person?.confirmed_at && !person?.last_sign_in_at),
      });
    });
  }
  return staff;
}

// Reuse existing Supabase users rather than trying to invite an address that
// already has a customer account. AAL2 owner approval is still required.
async function findAuthUserByEmail(context, email) {
  for (let page = 1; page <= 10; page++) {
    const data = await authAdmin(context, '/users?page=' + page + '&per_page=1000');
    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find(user => String(user.email || '').toLowerCase() === email);
    if (match) return match;
    if (users.length < 1000) return null;
  }
  httpError('Too many accounts to safely search; contact support', 503, 'user_lookup_limit');
}

export const onRequestGet = withAdmin(['owner'], async context => {
  const rows = await sb(context, '/rest/v1/admin_roles?select=user_id,role,active,granted_at&order=granted_at.asc');
  return json({ staff: await getStaffWithEmails(context, rows || []) });
});

export const onRequestPost = withAdmin(['owner'], async (context, { user }) => {
  requireMfa(user);
  const body = await readJson(context.request);
  const email = String(body.email || '').trim().toLowerCase();
  const newRole = String(body.role || '');
  if (email.length > 254 || !EMAIL_RE.test(email) || !ROLES.has(newRole)) {
    httpError('A valid email and staff role are required', 400, 'invalid_staff');
  }
  const existing = await findAuthUserByEmail(context, email);
  let target = existing;
  if (!target) {
    const e = env(context);
    let response;
    try {
      response = await fetch(String(e.SUPABASE_URL).replace(/\/+$/, '') + '/auth/v1/invite', {
        method: 'POST',
        headers: {
          apikey: e.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: 'Bearer ' + e.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        cache: 'no-store',
      });
    } catch {
      httpError('Invitation service unavailable', 503, 'invite_unavailable');
    }
    try { target = await response.json(); } catch { target = null; }
    if (!response.ok || !target?.id) {
      httpError('Could not send invite; check Supabase email configuration', 502, 'invite_failed');
    }
  }
  const result = await sb(context, '/rest/v1/rpc/admin_staff_assign', {
    method: 'POST',
    body: { p_actor: user.id, p_target: target.id, p_role: newRole },
  });
  if (result?.error) httpError(result.error, result.status || 409, result.code || 'staff_assign_failed');
  return json({
    staff: result.staff,
    email,
    invitation_requested: !existing,
    message: existing ? 'Access updated for an existing account' : 'Invitation accepted by the email provider; delivery not yet confirmed',
  }, existing ? 200 : 201);
});

export const onRequestPatch = withAdmin(['owner'], async (context, { user }) => {
  requireMfa(user);
  const body = await readJson(context.request);
  const id = String(body.user_id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    httpError('Valid user ID required', 400, 'invalid_staff');
  }
  const patch = {};
  if (body.role !== undefined) patch.role = body.role;
  if (body.active !== undefined) patch.active = body.active;
  if (!Object.keys(patch).length) httpError('A change is required', 400);
  if (patch.role !== undefined && !ROLES.has(patch.role)) httpError('Invalid role', 400, 'invalid_staff');
  if (patch.active !== undefined && typeof patch.active !== 'boolean') httpError('Invalid active flag', 400, 'invalid_staff');
  const result = await sb(context, '/rest/v1/rpc/admin_staff_update', {
    method: 'POST', body: { p_actor: user.id, p_target: id, p_patch: patch },
  });
  if (result?.error) httpError(result.error, result.status || 409, result.code || 'staff_update_failed');
  return json(result);
});
