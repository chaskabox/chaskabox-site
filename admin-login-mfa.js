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
      '<form class="live-login-card" id="loginMfaForm">' +
      '<img src="/images/logo-navy.png" alt="ChaskaBox">' +
      '<span class="eyebrow">SECURE ADMIN</span>' +
      '<h1>Verify your sign-in</h1>' +
      '<p>Enter the 6-digit code from your authenticator app to open the Admin Panel.</p>' +
      '<label id="loginMfaFactorLabel">Authenticator<select id="loginMfaFactor"></select></label>' +
      '<label>Authenticator code<input id="loginMfaCode" type="text" inputmode="numeric" autocomplete="one-time-code" ' +
      'pattern="[0-9]{6}" maxlength="6" minlength="6" placeholder="000000" required></label>' +
      '<div class="live-error" role="alert" id="loginMfaError" hidden></div>' +
      '<button class="btn primary" type="submit" id="loginMfaVerify">Verify &amp; open Admin Panel</button>' +
      '<button class="btn secondary" type="button" id="loginMfaCancel">Cancel &amp; sign out</button>' +
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
    codeInput.focus();
    const form = screen.querySelector('#loginMfaForm');
    const errorBox = screen.querySelector('#loginMfaError');
    const verifyButton = screen.querySelector('#loginMfaVerify');
    const cancelButton = screen.querySelector('#loginMfaCancel');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      errorBox.hidden = true;
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
      } catch (error) {
        errorBox.textContent = error.message || 'Invalid authenticator code. Please retry.';
        errorBox.hidden = false;
        codeInput.value = '';
        codeInput.focus();
      } finally {
        verifyButton.disabled = false;
        verifyButton.textContent = 'Verify & open Admin Panel';
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
