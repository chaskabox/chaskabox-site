// POST /api/admin/brand-upload - upload brand logo/hero to Supabase Storage
// Body: multipart form with 'file' and 'type' (logo|hero)
import { withAdmin, sb, json, httpError } from './_lib/auth.js';

export const onRequestPost = withAdmin(['owner', 'manager'], async (context) => {
  try {
    const form = await context.request.formData();
    const file = form.get('file');
    const type = form.get('type') || 'logo';
    if (!file || typeof file.arrayBuffer !== 'function') {
      httpError('No file provided', 400, 'no_file');
    }
    if (!['logo','hero'].includes(type)) httpError('Invalid type', 400, 'invalid_type');
    if (file.size > 2 * 1024 * 1024) httpError('File too large (max 2MB)', 400, 'too_large');

    const ext = (file.name || '').split('.').pop().toLowerCase() || 'png';
    if (!['png','jpg','jpeg','webp','gif'].includes(ext)) httpError('Invalid file type', 400, 'invalid_type');

    const filename = `${type}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const buf = await file.arrayBuffer();

    // Upload via Supabase Storage REST API (service role)
    const url = `${context.env.SUPABASE_URL}/storage/v1/object/brand-assets/${filename}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': context.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${context.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': file.type || 'image/png',
      },
      body: buf,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      httpError('Upload failed: ' + t.slice(0, 200), 500, 'upload_failed');
    }
    const publicUrl = `${context.env.SUPABASE_URL}/storage/v1/object/public/brand-assets/${filename}`;
    return json({ ok: true, url: publicUrl });
  } catch (e) {
    if (e.status) throw e;
    httpError('Upload error: ' + (e.message || e), 500, 'upload_error');
  }
});
