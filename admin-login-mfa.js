(() => {
  'use strict';
  // Shared second-step gate for password logins and previously saved AAL1 sessions.
  // Do not show the admin console until an enrolled factor was verified.
  function showChallenge(supabase, factors, onVerified, onCancelled) {
    const password = document.getElementById('livePassword');
    if (password) password.value = '';
    const login = document.getElementById('liveAdminLogin');
    if (login) login.hidden = true;
    const boot = document.getElementById('adminBoot');
    if (boot) boot.style.display = 'none';
    window.chaskaAdminBooted = true;
    let screen = document.getElementById('liveAdminMfa');
    if (!screen) {
      screen = document.createElement('div');
      screen.id = 'liveAdminMfa';
      screen.className = 'live-admin-login';
      document.body.appendChild(screen);
    }
    screen.hidden = false;
    screen.innerHTML =
      '<form class="live-login-card mfa-login-card" id="loginMfaForm" aria-labelledby="loginMfaHeading" novalidate>' +
      '<div class="mfa-brand"><img src="/images/logo-navy.png" alt="ChaskaBox">' +
        '<span class="mfa-brand-name">ADMIN CONSOLE<small>CHASKABOX</small></span></div>' +
      '<div class="mfa-security-icon" aria-hidden="true">✓</div>' +
      '<div class="mfa-stage"><span>SECURE SIGN-IN</span><span>STEP 2 OF 2</span></div>' +
      '<h1 id="loginMfaHeading">Confirm it\'s you</h1>' +
      '<p class="mfa-intro">Open your authenticator app and enter the current 6-digit code.</p>' +
      '<label id="loginMfaFactorLabel" class="mfa-factor-choice" for="loginMfaFactor">Choose authenticator' +
        '<select id="loginMfaFactor"></select></label>' +
      '<label class="mfa-code-label" id="loginMfaCodeLabel" for="loginMfaCode">Verification code</label>' +
      '<div class="mfa-code-control">' +
        '<input id="loginMfaCode" class="mfa-code-input" type="text" inputmode="numeric" ' +
          'autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" minlength="6" ' +
          'aria-labelledby="loginMfaCodeLabel" aria-describedby="loginMfaHint loginMfaError" required>' +
        '<div class="mfa-code-slots" aria-hidden="true">' +
          '<span class="mfa-code-slot"></span>'.repeat(6) +
        '</div></div>' +
      '<p id="loginMfaHint" class="mfa-hint">Code not working? Wait for a fresh code in your app.</p>' +
      '<div class="live-error mfa-error" role="alert" id="loginMfaError" hidden></div>' +
      '<button class="btn primary mfa-verify-btn" type="submit" id="loginMfaVerify">Verify &amp; continue <span aria-hidden="true">→</span></button>' +
      '<button class="btn secondary mfa-cancel-btn" type="button" id="loginMfaCancel">Cancel &amp; sign out</button>' +
      '<p class="mfa-trust-note"><span aria-hidden="true">◈</span> Keep your authenticator code private.</p>' +
      '</form>';
    const options = screen.querySelector('#loginMfaFactor');
    for (const factor of factors) {
      const option = document.createElement('option');
      option.value = factor.id;
      option.textContent = factor.friendly_name || factor.factor_type || 'Authenticator';
      options.appendChild(option);
    }
    if (factors.length === 1) screen.querySelector('#loginMfaFactorLabel').hidden = true;
    const codeInput = screen.querySelector('#loginMfaCode');
    // One native input preserves mobile OTP autofill and paste; six tiles are visual only.
    const tiles = screen.querySelectorAll?.('.mfa-code-slot') || [];
    function syncTiles() {
      const digits = codeInput.value.replace(/[^0-9]/g, '').slice(0, 6);
      if (codeInput.value !== digits) codeInput.value = digits;
      tiles.forEach((tile, index) => {
        tile.textContent = digits[index] || '';
        tile.classList?.toggle('filled', index < digits.length);
        tile.classList?.toggle('active', index === digits.length && digits.length < 6);
      });
    }
    codeInput.addEventListener?.('input', syncTiles);
    syncTiles();
    codeInput.focus();
    const form = screen.querySelector('#loginMfaForm');
    const errorBox = screen.querySelector('#loginMfaError');
    const verifyButton = screen.querySelector('#loginMfaVerify');
    const cancelButton = screen.querySelector('#loginMfaCancel');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      errorBox.hidden = true;
      syncTiles();
      const code = codeInput.value.trim();
      if (!/^\d{6}$/.test(code)) {
        errorBox.textContent = 'Enter a valid 6-digit code.';
        errorBox.hidden = false;
        return;
      }
      verifyButton.disabled = true;
      verifyButton.textContent = 'Verifying…';
      try {
        const factorId = options.value;
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        if (error) throw error;
        const { data: assurance, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (levelError) throw levelError;
        if (assurance?.currentLevel !== 'aal2') throw new Error('MFA verification incomplete. Please retry.');
        const ready = await onVerified();
        if (ready !== true) throw new Error('Admin session could not be verified. Please retry.');
        screen.hidden = true;
        codeInput.value = '';
        syncTiles();
      } catch (error) {
        errorBox.textContent = error.message || 'Invalid authenticator code. Please retry.';
        errorBox.hidden = false;
        codeInput.value = '';
        syncTiles();
        codeInput.focus();
      } finally {
        verifyButton.disabled = false;
        verifyButton.innerHTML = 'Verify &amp; continue <span aria-hidden="true">→</span>';
      }
    });
    cancelButton.addEventListener('click', async () => {
      cancelButton.disabled = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
        screen.hidden = true;
        await onCancelled();
      } catch (error) {
        errorBox.textContent = error.message || 'Unable to sign out.';
        errorBox.hidden = false;
      } finally {
        cancelButton.disabled = false;
      }
    });
  }

  async function gate(supabase, onVerified, onCancelled) {
    const { data: level, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levelError) throw levelError;
    if (level?.currentLevel === 'aal2') return true;
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factors = [...(data?.totp || []), ...(data?.phone || [])].filter(f => f.status === 'verified');
    if (!factors.length) return true; // Still allow staff with no factor to reach Security enrollment.
    showChallenge(supabase, factors, onVerified, onCancelled);
    return false;
  }
  window.chaskaAdminMfa = { gate };
})();
