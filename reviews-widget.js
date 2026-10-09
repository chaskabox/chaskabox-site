/* ChaskaBox Reviews Widget — displays ONLY approved reviews, never fakes.
 * Usage: ReviewsWidget.mount('#reviewsMount', productId)
 * Fetches GET /api/reviews?product_id=X (approved only via public_reviews view).
 * Empty state is honest: "No reviews yet" — never invents ratings.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function stars(rating) {
    const full = Math.round(Number(rating) || 0);
    let out = '';
    for (let i = 1; i <= 5; i++) out += i <= full ? '★' : '☆';
    return `<span class="rw-stars" aria-label="${full} out of 5 stars">${out}</span>`;
  }

  function timeAgo(iso) {
    try {
      const d = new Date(iso), now = new Date();
      const days = Math.floor((now - d) / 86400000);
      if (days < 1) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 30) return days + ' days ago';
      const months = Math.floor(days / 30);
      if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
      return d.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return ''; }
  }

  function reviewHTML(r) {
    const verified = r.verified_purchase
      ? '<span class="rw-verified" title="This reviewer bought this product">✓ Verified purchase</span>'
      : '';
    const reply = r.admin_reply
      ? `<div class="rw-reply"><b>ChaskaBox reply:</b> ${esc(r.admin_reply)}</div>`
      : '';
    return `<article class="rw-item">
      <div class="rw-head">${stars(r.rating)} ${verified} <span class="rw-date">${esc(timeAgo(r.created_at))}</span></div>
      <p class="rw-text">${esc(r.review_text)}</p>
      ${reply}
    </article>`;
  }

  function formHTML(productId) {
    return `<form class="rw-form" data-rw-form="${esc(productId)}">
      <h3>Write a review</h3>
      <p class="rw-note">Reviews are published after moderation. Only real reviews — no fakes, ever.</p>
      <div class="rw-field">
        <label>Your rating</label>
        <div class="rw-rate" role="radiogroup" aria-label="Rating">
          ${[5, 4, 3, 2, 1].map(n => `<label><input type="radio" name="rating" value="${n}" ${n === 5 ? 'checked' : ''} required><span>${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span></label>`).join('')}
        </div>
      </div>
      <div class="rw-field">
        <label for="rwText">Your review</label>
        <textarea id="rwText" name="text" rows="3" minlength="3" maxlength="1000" required placeholder="Kaisa laga? Taste, packing, delivery..."></textarea>
      </div>
      <button type="submit" class="cta rw-submit">Submit review</button>
      <p class="rw-msg" aria-live="polite"></p>
    </form>`;
  }

  async function submitReview(form, productId) {
    const msg = form.querySelector('.rw-msg');
    const btn = form.querySelector('.rw-submit');
    const rating = Number(form.querySelector('input[name="rating"]:checked')?.value || 0);
    const text = form.querySelector('textarea[name="text"]').value.trim();
    if (!rating || text.length < 3) { msg.textContent = 'Please pick a rating and write a few words.'; return; }
    btn.disabled = true; msg.textContent = 'Submitting…';
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, rating, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'Could not submit');
      msg.textContent = '✓ ' + (data.note || 'Thanks! Your review is pending moderation.');
      form.querySelector('textarea[name="text"]').value = '';
    } catch (e) {
      msg.textContent = 'Error: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  async function mount(selector, productId) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root || !productId) return;
    root.innerHTML = '<div class="rw-loading">Loading reviews…</div>';
    try {
      const res = await fetch(`/api/reviews?product_id=${encodeURIComponent(productId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const reviews = Array.isArray(data.reviews) ? data.reviews : [];

      let html = '<section class="rw-wrap" aria-label="Customer reviews">';
      html += '<h2>Customer reviews</h2>';

      if (!reviews.length) {
        // Honest empty state — never invent ratings
        html += `<div class="rw-empty">
          <p>No reviews yet for this snack.</p>
          <p class="rw-empty-sub">Tried it? Be the first to share your honest opinion.</p>
        </div>`;
      } else {
        html += `<div class="rw-summary">${stars(data.avg_rating)}
          <b>${esc(data.avg_rating)} / 5</b>
          <span>· ${data.count} verified review${data.count === 1 ? '' : 's'}</span>
        </div>`;
        html += '<div class="rw-list">' + reviews.map(reviewHTML).join('') + '</div>';
      }

      html += formHTML(productId);
      html += '</section>';
      root.innerHTML = html;

      const form = root.querySelector('[data-rw-form]');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); submitReview(form, productId); });
    } catch (e) {
      root.innerHTML = '<section class="rw-wrap"><h2>Customer reviews</h2><p class="rw-error">Reviews are temporarily unavailable.</p></section>';
    }
  }

  window.ReviewsWidget = { mount };
})();
