const AUTH_API = '/api/auth';
const PRIMARY_NAV = document.querySelector('body > nav[aria-label="primary navigation"]');

const SHOW_SIGNED_IN_USER = (USER) => {
  if (!PRIMARY_NAV || !USER) return;

  const EXISTING_GREETING = PRIMARY_NAV.querySelector('.session-greeting');
  if (EXISTING_GREETING) {
    EXISTING_GREETING.textContent = `Hi, ${USER.name}`;
    return;
  }

  PRIMARY_NAV.querySelector('a[href="login.html"]')?.remove();
  PRIMARY_NAV.querySelector('a[href="register.html"]')?.remove();

  const GREETING = document.createElement('span');
  GREETING.className = 'session-greeting';
  GREETING.textContent = `Hi, ${USER.name}`;
  PRIMARY_NAV.append(GREETING);

  const LOGOUT_BUTTON = document.createElement('button');
  LOGOUT_BUTTON.className = 'nav-logout';
  LOGOUT_BUTTON.type = 'button';
  LOGOUT_BUTTON.textContent = 'Log out';
  LOGOUT_BUTTON.addEventListener('click', async () => {
    LOGOUT_BUTTON.disabled = true;
    try {
      const RESPONSE = await fetch(`${AUTH_API}/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!RESPONSE.ok) throw new Error('Sign-out failed. Try again.');
      window.location.reload();
    } catch (ERROR) {
      LOGOUT_BUTTON.disabled = false;
      LOGOUT_BUTTON.textContent = 'Try again';
    }
  });
  PRIMARY_NAV.append(LOGOUT_BUTTON);
};

const LOAD_SIGNED_IN_USER = async () => {
  if (!PRIMARY_NAV) return;
  try {
    const RESPONSE = await fetch(`${AUTH_API}/me`, { credentials: 'same-origin' });
    if (!RESPONSE.ok) return;
    const DATA = await RESPONSE.json();
    SHOW_SIGNED_IN_USER(DATA.user);
  } catch (ERROR) {
    // Keep public pages usable when the local backend is not running.
  }
};

LOAD_SIGNED_IN_USER();

const PASSWORD_TOGGLES = document.querySelectorAll('[data-password-toggle]');
PASSWORD_TOGGLES.forEach((BUTTON) => {
  BUTTON.addEventListener('click', () => {
    const PASSWORD_INPUT = document.getElementById(BUTTON.dataset.passwordToggle);
    if (!PASSWORD_INPUT) return;

    const SHOW_PASSWORD = PASSWORD_INPUT.type === 'password';
    PASSWORD_INPUT.type = SHOW_PASSWORD ? 'text' : 'password';
    BUTTON.textContent = SHOW_PASSWORD ? 'Hide' : 'Show';
    BUTTON.setAttribute('aria-label', `${SHOW_PASSWORD ? 'Hide' : 'Show'} password`);
    BUTTON.setAttribute('aria-pressed', String(SHOW_PASSWORD));
  });
});

const AUTH_FORM = document.querySelector('[data-auth-form]');
if (AUTH_FORM) {
  const PASSWORD_INPUT = AUTH_FORM.querySelector('#password');
  const CONFIRM_PASSWORD_INPUT = AUTH_FORM.querySelector('#confirm-password');
  const STATUS_MESSAGE = AUTH_FORM.querySelector('.auth-status');
  const SUBMIT_BUTTON = AUTH_FORM.querySelector('button[type="submit"]');

  const CHECK_PASSWORD_MATCH = () => {
    if (PASSWORD_INPUT && CONFIRM_PASSWORD_INPUT) {
      const DOES_NOT_MATCH = CONFIRM_PASSWORD_INPUT.value && PASSWORD_INPUT.value !== CONFIRM_PASSWORD_INPUT.value;
      CONFIRM_PASSWORD_INPUT.setCustomValidity(DOES_NOT_MATCH ? 'Passwords do not match.' : '');
    }
  };

  PASSWORD_INPUT?.addEventListener('input', CHECK_PASSWORD_MATCH);
  CONFIRM_PASSWORD_INPUT?.addEventListener('input', CHECK_PASSWORD_MATCH);
  AUTH_FORM.addEventListener('input', () => {
    if (STATUS_MESSAGE) STATUS_MESSAGE.hidden = true;
  });

  AUTH_FORM.addEventListener('submit', async (EVENT) => {
    EVENT.preventDefault();
    CHECK_PASSWORD_MATCH();
    if (!AUTH_FORM.reportValidity()) return;

    if (STATUS_MESSAGE) {
      STATUS_MESSAGE.hidden = true;
      STATUS_MESSAGE.textContent = '';
    }
    if (SUBMIT_BUTTON) SUBMIT_BUTTON.disabled = true;

    const IS_REGISTER = AUTH_FORM.dataset.authForm === 'register';
    const REQUEST_BODY = IS_REGISTER
      ? {
          name: AUTH_FORM.elements.full_name.value,
          email: AUTH_FORM.elements.email.value,
          password: PASSWORD_INPUT.value,
          role: AUTH_FORM.querySelector('input[name="role"]:checked')?.value || 'student',
        }
      : {
          email: AUTH_FORM.elements.email.value,
          password: AUTH_FORM.elements.password.value,
        };

    try {
      const RESPONSE = await fetch(`${AUTH_API}/${IS_REGISTER ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(REQUEST_BODY),
      });
      const DATA = await RESPONSE.json().catch(() => null);
      if (!RESPONSE.ok) {
        throw new Error(DATA?.error || 'Boarda API is unavailable. Run npm start from the BOARDA/backend folder.');
      }
      if (!DATA?.user) throw new Error('The server returned an incomplete account response.');

      SHOW_SIGNED_IN_USER(DATA.user);
      if (STATUS_MESSAGE) {
        STATUS_MESSAGE.hidden = false;
        STATUS_MESSAGE.textContent = IS_REGISTER
          ? `Your account is ready, ${DATA.user.name}. You are signed in.`
          : `You are signed in. Welcome back, ${DATA.user.name}.`;
      }
    } catch (ERROR) {
      if (STATUS_MESSAGE) {
        STATUS_MESSAGE.hidden = false;
        STATUS_MESSAGE.textContent = ERROR instanceof TypeError
          ? 'Cannot reach the Boarda server. Run npm start from the BOARDA/backend folder.'
          : ERROR.message;
      }
    } finally {
      if (SUBMIT_BUTTON) SUBMIT_BUTTON.disabled = false;
    }
  });
}
