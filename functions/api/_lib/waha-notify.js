/* ChaskaBox — WhatsApp owner notifications via self-hosted WAHA
 *
 * WhatsApp-only notification module (restored 2026-10-14).
 * Call after an order is committed. Never throws.
 *
 * Env vars:
 *   WAHA_API_URL    WAHA base URL, e.g. https://waha.example.com
 *   WAHA_API_KEY    WAHA X-Api-Key
 *   WAHA_SESSION    WAHA session, defaults to "default"
 *   OWNER_WHATSAPP  owner number, international digits; + accepted
 *   ADMIN_BASE_URL  optional admin base URL
 */

function cleanBaseUrl(value, fallback) {
  return String(value || fallback || '').replace(/\/+$/, '');
}

function adminOrderUrl(env, order) {
  const base = cleanBaseUrl(env.ADMIN_BASE_URL, 'https://chaskabox.online');
  const id = order?.id ?? order?.order_id;
  return id ? `${base}/admin.html#order-${encodeURIComponent(id)}` : `${base}/admin.html`;
}

function itemLines(order) {
  return (order?.items || []).map((it) => {
    const qty = Number(it.qty ?? it.quantity ?? 0);
    const price = Number(it.unit_price ?? 0);
    const pack = it.product_pack ?? it.pack ?? '';
    return `• ${it.product_name || 'Item'}${pack ? ` (${pack})` : ''} x${qty} — Rs.${price * qty}`;
  }).join('\n');
}

function normalizeWhatsAppChatId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.endsWith('@c.us') || raw.endsWith('@g.us')) return raw;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) digits = `92${digits.slice(1)}`;
  return digits ? `${digits}@c.us` : '';
}

function ownerText(env, order) {
  const items = itemLines(order);
  return `🛒 *New ChaskaBox Order*\n` +
    `Order: #${order.order_number}\n` +
    `Customer: ${order.customer_name}\n` +
    `Phone: ${order.customer_phone}\n` +
    `Total: Rs.${order.total}\n` +
    `Payment: ${order.payment_method} (${order.payment_status})\n` +
    (items ? `\nItems:\n${items}\n` : '') +
    `\nOpen Admin: ${adminOrderUrl(env, order)}`;
}

export async function sendOwnerWhatsApp(env, order) {
  const baseUrl = cleanBaseUrl(env.WAHA_API_URL);
  const apiKey = env.WAHA_API_KEY;
  const session = env.WAHA_SESSION || 'default';
  const chatId = normalizeWhatsAppChatId(env.OWNER_WHATSAPP);

  if (!baseUrl || !apiKey || !chatId) {
    return { sent: false, skipped: true, error: 'WAHA not fully configured' };
  }

  try {
    const endpoint = baseUrl.endsWith('/api') ? `${baseUrl}/sendText` : `${baseUrl}/api/sendText`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        session,
        chatId,
        text: ownerText(env, order),
        linkPreview: false,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[waha-notify] WAHA failed: ${resp.status} ${errText.slice(0, 500)}`);
      return { sent: false, skipped: false, error: `WAHA ${resp.status}` };
    }
    return { sent: true, skipped: false, error: null };
  } catch (err) {
    console.error(`[waha-notify] WAHA error: ${err?.message || err}`);
    return { sent: false, skipped: false, error: String(err?.message || err) };
  }
}
