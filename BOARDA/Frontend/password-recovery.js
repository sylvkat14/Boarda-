const RECOVERY_REQUEST_FORM = document.querySelector('[data-password-reset-request]');
const RECOVERY_COMPLETE_FORM = document.querySelector('[data-password-reset-complete]');

function setRecoveryStatus(form, message, isError = false) {
  const status = form.querySelector('.auth-status');
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

if (RECOVERY_REQUEST_FORM) {
  RECOVERY_REQUEST_FORM.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!RECOVERY_REQUEST_FORM.reportValidity()) return;

    const submitButton = RECOVERY_REQUEST_FORM.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setRecoveryStatus(RECOVERY_REQUEST_FORM, 'Sending your request…');
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: RECOVERY_REQUEST_FORM.elements.email.value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not process the recovery request.');
      setRecoveryStatus(
        RECOVERY_REQUEST_FORM,
        data?.message || 'If an account exists for that email, a password reset link will be sent shortly.',
      );
    } catch (error) {
      setRecoveryStatus(
        RECOVERY_REQUEST_FORM,
        error instanceof TypeError ? 'Cannot reach Boarda. Please try again later.' : error.message,
        true,
      );
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (RECOVERY_COMPLETE_FORM) {
  const RESET_TOKEN = new URLSearchParams(window.location.search).get('token');
  const PASSWORD_INPUT = RECOVERY_COMPLETE_FORM.elements.password;
  const CONFIRM_PASSWORD_INPUT = RECOVERY_COMPLETE_FORM.elements.confirm_password;
  const SUBMIT_BUTTON = RECOVERY_COMPLETE_FORM.querySelector('button[type="submit"]');

  if (RESET_TOKEN) window.history.replaceState(null, '', window.location.pathname);
  if (!RESET_TOKEN) {
    setRecoveryStatus(RECOVERY_COMPLETE_FORM, 'This password reset link is invalid or expired.', true);
    SUBMIT_BUTTON.disabled = true;
  }

  RECOVERY_COMPLETE_FORM.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!RESET_TOKEN || !RECOVERY_COMPLETE_FORM.reportValidity()) return;
    if (PASSWORD_INPUT.value !== CONFIRM_PASSWORD_INPUT.value) {
      setRecoveryStatus(RECOVERY_COMPLETE_FORM, 'The passwords do not match.', true);
      CONFIRM_PASSWORD_INPUT.focus();
      return;
    }

    SUBMIT_BUTTON.disabled = true;
    setRecoveryStatus(RECOVERY_COMPLETE_FORM, 'Updating your password…');
    try {
      const response = await fetch('/api/auth/password-reset/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: RESET_TOKEN, password: PASSWORD_INPUT.value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not reset your password.');
      PASSWORD_INPUT.value = '';
      CONFIRM_PASSWORD_INPUT.value = '';
      RECOVERY_COMPLETE_FORM.querySelectorAll('input, button[type="submit"]').forEach((control) => {
        control.disabled = true;
      });
      setRecoveryStatus(RECOVERY_COMPLETE_FORM, data.message || 'Password updated. You can now sign in.');
    } catch (error) {
      setRecoveryStatus(
        RECOVERY_COMPLETE_FORM,
        error instanceof TypeError ? 'Cannot reach Boarda. Please try again later.' : error.message,
        true,
      );
      SUBMIT_BUTTON.disabled = false;
    }
  });
}
