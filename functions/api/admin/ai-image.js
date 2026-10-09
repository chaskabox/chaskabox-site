/**
 * POST /api/admin/ai-image
 * Generate images via Cloudflare Workers AI (secure, in-house, free tier).
 * Fallback: Pollinations.ai URL (free, no key, private=true).
 *
 * Security:
 * - Prompts are blocklisted for PII/sensitive content
 * - Generated images never auto-published
 * - Originals preserved (new files only)
 * - Every generation audited
 *
 * Body: { prompt, type: 'product'|'banner'|'social', style }
 */
import { withAdmin, json, httpError, readJson, audit, distributedRateLimit } from './_lib/auth.js';
import { aiAvailable } from '../_lib/ai.js';

const PROMPT_BLOCKLIST = [
  /password|secret|api.?key|token/i,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,  // card numbers
  /03\d{2}[-\s]?\d{7}/,  // Pakistani phone
];

const SIZES = {
  product: { width: 1024, height: 1024 },
  banner: { width: 1920, height: 640 },
  social: { width: 1080, height: 1080 },
};

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const prompt = String(body.prompt || '').trim();
  const type = body.type || 'product';
  const style = String(body.style || '').trim();

  if (!prompt || prompt.length < 10) httpError('Prompt too short (min 10 chars)', 400, 'invalid');
  if (prompt.length > 500) httpError('Prompt too long (max 500 chars)', 400, 'invalid');

  // Security: block PII/sensitive in prompts
  for (const rx of PROMPT_BLOCKLIST) {
    if (rx.test(prompt)) httpError('Prompt contains blocked sensitive content', 400, 'blocked');
  }

  await distributedRateLimit(context, `ai-image:${user.id}`, 10, 3600);  // 10/hour

  const fullPrompt = style ? `${prompt}, ${style}` : prompt;
  const size = SIZES[type] || SIZES.product;

  let imageUrl = null;
  let source = null;

  // Primary: Cloudflare Workers AI (secure, in-house)
  if (aiAvailable(context)) {
    try {
      const result = await context.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt: fullPrompt,
        width: size.width,
        height: size.height,
        num_steps: 20,
      });
      // Result is binary image data — convert to data URL or store
      // For now, return as base64 data URL
      if (result) {
        const bytes = new Uint8Array(result);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        }
        imageUrl = `data:image/png;base64,${btoa(binary)}`;
        source = 'cloudflare-workers-ai';
      }
    } catch (e) {
      console.error('[ai-image] Workers AI failed', e.message);
    }
  }

  // Fallback: Pollinations.ai (free, no key, private mode)
  if (!imageUrl) {
    const params = new URLSearchParams({
      width: size.width, height: size.height,
      model: 'flux', private: 'true', safe: 'true', nologo: 'false',
      seed: String(Math.floor(Math.random() * 999999)),
    });
    imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?${params}`;
    source = 'pollinations.ai (fallback, private mode)';
  }

  await audit(context, {
    actorId: user.id, actorRole: role,
    action: 'ai.image_generated',
    entityType: 'ai', entityId: 'n/a',
    after: { type, prompt_chars: prompt.length, source },
  });

  return json({
    ok: true,
    image_url: imageUrl,
    source,
    warnings: [
      'DRAFT ONLY — not published.',
      'AI images are for banners/decoration. Product photos must use real manufacturer images.',
      source.includes('pollinations') ? 'Fallback via Pollinations.ai (private mode, no PII in prompt).' : 'Generated securely via Cloudflare Workers AI.',
    ],
  });
});
