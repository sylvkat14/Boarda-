const AUTH_API = '/api/auth';
const PRIMARY_NAV = document.querySelector('body > nav[aria-label="primary navigation"]');

const DASHBOARD_PATH = (ROLE) => ROLE === 'admin'
  ? '/Frontend/admin-dashboard.html'
  : ROLE === 'landlord'
    ? '/Frontend/landlord-dashboard.html'
    : '/Frontend/student-dashboard.html';

const GET_HEADER_ACTIONS = () => {
  const HEADER = document.querySelector('body > header');
  if (!HEADER) return null;
  let ACTIONS = HEADER.querySelector('.header-actions');
  if (!ACTIONS) {
    ACTIONS = document.createElement('div');
    ACTIONS.className = 'header-actions';
    HEADER.append(ACTIONS);
  }
  return ACTIONS;
};

const ADD_MOBILE_MENU = () => {
  if (!PRIMARY_NAV) return;
  if (!PRIMARY_NAV.id) PRIMARY_NAV.id = 'primary-navigation';
  const HEADER_ACTIONS = GET_HEADER_ACTIONS();
  if (!HEADER_ACTIONS || HEADER_ACTIONS.querySelector('.nav-menu-toggle')) return;

  const MENU_BUTTON = document.createElement('button');
  MENU_BUTTON.className = 'nav-menu-toggle';
  MENU_BUTTON.type = 'button';
  MENU_BUTTON.setAttribute('aria-label', 'Open navigation menu');
  MENU_BUTTON.setAttribute('aria-expanded', 'false');
  MENU_BUTTON.setAttribute('aria-controls', PRIMARY_NAV.id);
  for (let INDEX = 0; INDEX < 3; INDEX += 1) {
    const LINE = document.createElement('span');
    LINE.setAttribute('aria-hidden', 'true');
    MENU_BUTTON.append(LINE);
  }

  const SET_MENU_OPEN = (IS_OPEN) => {
    PRIMARY_NAV.classList.toggle('is-open', IS_OPEN);
    document.querySelector('body > header')?.classList.toggle('is-menu-open', IS_OPEN);
    MENU_BUTTON.setAttribute('aria-expanded', String(IS_OPEN));
    MENU_BUTTON.setAttribute('aria-label', IS_OPEN ? 'Close navigation menu' : 'Open navigation menu');
  };

  MENU_BUTTON.addEventListener('click', () => {
    SET_MENU_OPEN(!PRIMARY_NAV.classList.contains('is-open'));
  });
  document.addEventListener('click', (EVENT) => {
    if (!PRIMARY_NAV.contains(EVENT.target) && !MENU_BUTTON.contains(EVENT.target)) SET_MENU_OPEN(false);
  });
  document.addEventListener('keydown', (EVENT) => {
    if (EVENT.key === 'Escape') SET_MENU_OPEN(false);
  });
  HEADER_ACTIONS.append(MENU_BUTTON);
};

const ADD_NOTIFICATION_CENTER = () => {
  if (!PRIMARY_NAV || document.querySelector('.nav-notifications')) return;

  const ELEMENT = (TAG, CLASS_NAME, TEXT) => {
    const NODE = document.createElement(TAG);
    if (CLASS_NAME) NODE.className = CLASS_NAME;
    if (TEXT !== undefined) NODE.textContent = TEXT;
    return NODE;
  };

  const WIDGET = ELEMENT('div', 'nav-notifications');
  const BUTTON = ELEMENT('button', 'notification-toggle');
  BUTTON.type = 'button';
  BUTTON.setAttribute('aria-label', 'Notifications');
  BUTTON.setAttribute('aria-expanded', 'false');
  BUTTON.setAttribute('aria-controls', 'site-notification-panel');

  const ICON = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ICON.setAttribute('aria-hidden', 'true');
  ICON.setAttribute('viewBox', '0 0 24 24');
  ICON.setAttribute('fill', 'none');
  const ICON_PATH = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ICON_PATH.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4');
  ICON_PATH.setAttribute('stroke', 'currentColor');
  ICON_PATH.setAttribute('stroke-width', '1.8');
  ICON_PATH.setAttribute('stroke-linecap', 'round');
  ICON_PATH.setAttribute('stroke-linejoin', 'round');
  ICON.append(ICON_PATH);

  const COUNT = ELEMENT('span', 'notification-count');
  COUNT.hidden = true;
  BUTTON.append(ICON, COUNT);

  const PANEL = ELEMENT('section', 'notification-panel');
  PANEL.id = 'site-notification-panel';
  PANEL.setAttribute('aria-label', 'Notifications');
  PANEL.hidden = true;
  const PANEL_HEADER = ELEMENT('div', 'notification-panel-heading');
  PANEL_HEADER.append(ELEMENT('h2', '', 'Notifications'));
  const MARK_READ = ELEMENT('button', 'notification-mark-read', 'Mark all read');
  MARK_READ.type = 'button';
  MARK_READ.disabled = true;
  PANEL_HEADER.append(MARK_READ);
  const STATUS = ELEMENT('p', 'notification-status');
  STATUS.setAttribute('role', 'status');
  STATUS.setAttribute('aria-live', 'polite');
  const LIST = ELEMENT('div', 'notification-list');
  PANEL.append(PANEL_HEADER, STATUS, LIST);
  WIDGET.append(BUTTON, PANEL);

  const RENDER = (NOTIFICATIONS) => {
    LIST.replaceChildren();
    if (!NOTIFICATIONS.length) {
      LIST.append(ELEMENT('p', 'notification-empty', 'You are all caught up. New account and housing activity will appear here.'));
      return;
    }

    NOTIFICATIONS.forEach((NOTIFICATION) => {
      const IS_UNREAD = !NOTIFICATION.readAt;
      const ITEM = ELEMENT('article', `notification-item${IS_UNREAD ? ' is-unread' : ''}`);
      const HEADING = ELEMENT('div', 'notification-item-heading');
      HEADING.append(ELEMENT('h3', '', NOTIFICATION.title || 'Boarda update'));
      if (IS_UNREAD) HEADING.append(ELEMENT('span', 'notification-unread-label', 'New'));
      ITEM.append(HEADING);
      ITEM.append(ELEMENT('p', 'notification-message', NOTIFICATION.message || 'You have a new update.'));

      const DATE = new Date(NOTIFICATION.createdAt);
      const TIME = ELEMENT('time', 'dashboard-meta', Number.isNaN(DATE.getTime())
        ? ''
        : new Intl.DateTimeFormat('en-ZM', { dateStyle: 'medium', timeStyle: 'short' }).format(DATE));
      if (!Number.isNaN(DATE.getTime())) TIME.dateTime = DATE.toISOString();
      ITEM.append(TIME);

      if (typeof NOTIFICATION.targetUrl === 'string' && NOTIFICATION.targetUrl.startsWith('/Frontend/')) {
        const LINK = ELEMENT('a', 'notification-link', 'View');
        LINK.href = NOTIFICATION.targetUrl;
        ITEM.append(LINK);
      }
      LIST.append(ITEM);
    });
  };

  const LOAD = async () => {
    try {
      const RESPONSE = await fetch('/api/notifications', { credentials: 'same-origin' });
      const DATA = await RESPONSE.json().catch(() => null);
      if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not load notifications.');
      const UNREAD_COUNT = Number(DATA.unreadCount) || 0;
      COUNT.textContent = UNREAD_COUNT > 99 ? '99+' : String(UNREAD_COUNT);
      COUNT.hidden = UNREAD_COUNT === 0;
      BUTTON.setAttribute('aria-label', UNREAD_COUNT
        ? `Notifications, ${UNREAD_COUNT} unread`
        : 'Notifications');
      MARK_READ.disabled = UNREAD_COUNT === 0;
      STATUS.textContent = '';
      RENDER(Array.isArray(DATA.notifications) ? DATA.notifications : []);
      return true;
    } catch (ERROR) {
      COUNT.hidden = true;
      BUTTON.setAttribute('aria-label', 'Notifications');
      MARK_READ.disabled = true;
      STATUS.textContent = ERROR.message;
      RENDER([]);
      return false;
    }
  };

  document.addEventListener('boarda:notifications-refresh', () => LOAD());

  BUTTON.addEventListener('click', async () => {
    const OPENING = PANEL.hidden;
    PANEL.hidden = !OPENING;
    BUTTON.setAttribute('aria-expanded', String(OPENING));
    if (OPENING) await LOAD();
  });

  MARK_READ.addEventListener('click', async () => {
    MARK_READ.disabled = true;
    STATUS.textContent = 'Marking notifications as read…';
    try {
      const RESPONSE = await fetch('/api/notifications/read', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const DATA = await RESPONSE.json().catch(() => null);
      if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not update notifications.');
      if (await LOAD()) STATUS.textContent = 'Notifications marked as read.';
    } catch (ERROR) {
      STATUS.textContent = ERROR.message;
      MARK_READ.disabled = false;
    }
  });

  document.addEventListener('click', (EVENT) => {
    if (!PANEL.hidden && !WIDGET.contains(EVENT.target)) {
      PANEL.hidden = true;
      BUTTON.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (EVENT) => {
    if (EVENT.key === 'Escape' && !PANEL.hidden) {
      PANEL.hidden = true;
      BUTTON.setAttribute('aria-expanded', 'false');
      BUTTON.focus();
    }
  });

  const MOBILE_QUERY = window.matchMedia('(max-width: 767px)');
  const PLACE_WIDGET = () => {
    const HEADER_ACTIONS = GET_HEADER_ACTIONS();
    if (MOBILE_QUERY.matches && HEADER_ACTIONS) {
      const MENU_BUTTON = HEADER_ACTIONS.querySelector('.nav-menu-toggle');
      HEADER_ACTIONS.insertBefore(WIDGET, MENU_BUTTON);
      return;
    }

    const HOW_IT_WORKS_LINK = [...PRIMARY_NAV.querySelectorAll('a')].find((LINK) => {
      const PATH = new URL(LINK.getAttribute('href'), window.location.href).pathname.toLowerCase();
      return PATH.endsWith('/howitworks.html');
    });
    if (HOW_IT_WORKS_LINK) HOW_IT_WORKS_LINK.insertAdjacentElement('afterend', WIDGET);
    else PRIMARY_NAV.append(WIDGET);
  };
  PLACE_WIDGET();
  if (MOBILE_QUERY.addEventListener) MOBILE_QUERY.addEventListener('change', PLACE_WIDGET);
  else MOBILE_QUERY.addListener(PLACE_WIDGET);
  LOAD();
  window.setInterval(() => {
    if (!document.hidden) LOAD();
  }, 60000);
};

const GET_DASHBOARD_LINK = () => {
  if (!PRIMARY_NAV) return null;
  let DASHBOARD_LINK = PRIMARY_NAV.querySelector('.dashboard-nav-link');
  if (!DASHBOARD_LINK) {
    DASHBOARD_LINK = document.createElement('a');
    DASHBOARD_LINK.className = 'dashboard-nav-link';
    DASHBOARD_LINK.textContent = 'Dashboard';
    DASHBOARD_LINK.href = '/Frontend/login.html';
  }
  PRIMARY_NAV.append(DASHBOARD_LINK);
  return DASHBOARD_LINK;
};

const SHOW_SIGNED_IN_USER = (USER) => {
  if (!PRIMARY_NAV || !USER) return;

  PRIMARY_NAV.querySelectorAll('a').forEach((LINK) => {
    const PATH = new URL(LINK.getAttribute('href'), window.location.href).pathname.toLowerCase();
    if (PATH.endsWith('/login.html') || PATH.endsWith('/register.html')) LINK.remove();
  });

  const DASHBOARD_LINK = GET_DASHBOARD_LINK();
  DASHBOARD_LINK.remove();

  let ACCOUNT_MENU = PRIMARY_NAV.querySelector('.account-menu');
  if (!ACCOUNT_MENU) {
    ACCOUNT_MENU = document.createElement('div');
    ACCOUNT_MENU.className = 'account-menu';

    const TRIGGER = document.createElement('button');
    TRIGGER.className = 'account-menu-trigger';
    TRIGGER.type = 'button';
    TRIGGER.setAttribute('aria-haspopup', 'true');
    TRIGGER.setAttribute('aria-expanded', 'false');

    const USER_LABEL = document.createElement('span');
    USER_LABEL.className = 'account-menu-user-name';
    const CARET = document.createElement('span');
    CARET.className = 'account-menu-caret';
    CARET.setAttribute('aria-hidden', 'true');
    CARET.textContent = '▾';
    TRIGGER.append(USER_LABEL, CARET);

    const PANEL = document.createElement('div');
    PANEL.className = 'account-menu-panel';
    PANEL.id = 'account-menu-panel';
    PANEL.setAttribute('role', 'menu');
    PANEL.hidden = true;

    const MENU_DASHBOARD = document.createElement('a');
    MENU_DASHBOARD.className = 'account-menu-item account-dashboard-link';
    MENU_DASHBOARD.setAttribute('role', 'menuitem');
    MENU_DASHBOARD.textContent = 'Dashboard';
    PANEL.append(MENU_DASHBOARD);

    const MENU_PROFILE = document.createElement('a');
    MENU_PROFILE.className = 'account-menu-item';
    MENU_PROFILE.href = '/Frontend/profile.html';
    MENU_PROFILE.setAttribute('role', 'menuitem');
    MENU_PROFILE.textContent = 'Profile';
    PANEL.append(MENU_PROFILE);

    const LOGOUT_BUTTON = document.createElement('button');
    LOGOUT_BUTTON.className = 'account-menu-item account-logout-button';
    LOGOUT_BUTTON.type = 'button';
    LOGOUT_BUTTON.setAttribute('role', 'menuitem');
    LOGOUT_BUTTON.textContent = 'Log out';
    PANEL.append(LOGOUT_BUTTON);

    TRIGGER.setAttribute('aria-controls', PANEL.id);
    TRIGGER.addEventListener('click', () => {
      const IS_OPEN = TRIGGER.getAttribute('aria-expanded') !== 'true';
      TRIGGER.setAttribute('aria-expanded', String(IS_OPEN));
      PANEL.hidden = !IS_OPEN;
    });
    PANEL.addEventListener('click', (EVENT) => {
      if (EVENT.target.closest('a')) {
        PANEL.hidden = true;
        TRIGGER.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('click', (EVENT) => {
      if (!ACCOUNT_MENU.contains(EVENT.target)) {
        PANEL.hidden = true;
        TRIGGER.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (EVENT) => {
      if (EVENT.key === 'Escape' && !PANEL.hidden) {
        PANEL.hidden = true;
        TRIGGER.setAttribute('aria-expanded', 'false');
        TRIGGER.focus();
      }
    });
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

    ACCOUNT_MENU.append(TRIGGER, PANEL);
  }

  ACCOUNT_MENU.querySelector('.account-menu-user-name').textContent = `Hi, ${USER.name}`;
  ACCOUNT_MENU.querySelector('.account-dashboard-link').href = DASHBOARD_PATH(USER.role);
  PRIMARY_NAV.append(ACCOUNT_MENU);
  ADD_NOTIFICATION_CENTER();
};

const LOAD_SIGNED_IN_USER = async () => {
  if (!PRIMARY_NAV) return;
  ADD_MOBILE_MENU();
  GET_DASHBOARD_LINK();
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
  const PASSWORD_INPUT = AUTH_FORM.querySelector('#password, #login-password');
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
      window.location.assign(DASHBOARD_PATH(DATA.user.role));
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
