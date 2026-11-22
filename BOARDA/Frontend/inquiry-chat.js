(function () {
  const POLL_INTERVAL_MS = 5000;

  function chatElement(TAG, CLASS_NAME, TEXT) {
    const ELEMENT = document.createElement(TAG);
    if (CLASS_NAME) ELEMENT.className = CLASS_NAME;
    if (TEXT !== undefined) ELEMENT.textContent = TEXT;
    return ELEMENT;
  }

  async function chatRequest(URL, OPTIONS = {}) {
    const RESPONSE = await fetch(URL, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...OPTIONS,
      headers: {
        ...(OPTIONS.body ? { 'Content-Type': 'application/json' } : {}),
        ...OPTIONS.headers,
      },
    });
    const DATA = await RESPONSE.json().catch(() => null);
    if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not load this conversation.');
    return DATA;
  }

  function renderMessage(MESSAGE, CURRENT_USER_ID) {
    const OWN_MESSAGE = String(MESSAGE.senderUserId) === String(CURRENT_USER_ID);
    const ITEM = chatElement('article', `inquiry-chat-message${OWN_MESSAGE ? ' is-own' : ''}`);
    const ROLE = MESSAGE.senderRole === 'admin'
      ? 'Boarda admin'
      : MESSAGE.senderRole === 'landlord'
        ? 'Landlord'
        : 'Student';
    const META = chatElement('p', 'inquiry-chat-message-meta', `${OWN_MESSAGE ? 'You' : MESSAGE.senderName} · ${ROLE}`);
    const BODY = chatElement('p', 'inquiry-chat-message-body', MESSAGE.message);
    ITEM.append(META, BODY);
    if (MESSAGE.createdAt) {
      const DATE = new Date(MESSAGE.createdAt);
      if (!Number.isNaN(DATE.getTime())) {
        const TIME = chatElement('time', '', new Intl.DateTimeFormat('en-ZM', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(DATE));
        TIME.dateTime = DATE.toISOString();
        ITEM.append(TIME);
      }
    }
    return ITEM;
  }

  function createInquiryChat(INQUIRY) {
    const INQUIRY_ID = String(INQUIRY.id);
    const ROOT = chatElement('div', 'inquiry-chat');
    const TOGGLE = chatElement('button', 'button-secondary inquiry-chat-toggle', 'Open chat');
    TOGGLE.type = 'button';
    TOGGLE.setAttribute('aria-expanded', 'false');
    TOGGLE.setAttribute('aria-controls', `inquiry-chat-panel-${INQUIRY_ID}`);

    const PANEL = chatElement('section', 'inquiry-chat-panel');
    PANEL.id = `inquiry-chat-panel-${INQUIRY_ID}`;
    PANEL.hidden = true;
    const MESSAGES = chatElement('div', 'inquiry-chat-messages');
    MESSAGES.setAttribute('role', 'log');
    MESSAGES.setAttribute('aria-live', 'polite');
    MESSAGES.setAttribute('aria-relevant', 'additions');

    const STATUS = chatElement('p', 'inquiry-chat-status');
    STATUS.setAttribute('role', 'status');
    STATUS.setAttribute('aria-live', 'polite');

    const CLOSED_NOTICE = chatElement('p', 'inquiry-chat-closed', 'This inquiry is closed. You can still read the messages.');
    CLOSED_NOTICE.hidden = true;

    const FORM = chatElement('form', 'inquiry-chat-form');
    const LABEL = chatElement('label', '', 'Your message');
    const TEXTAREA = document.createElement('textarea');
    TEXTAREA.name = 'message';
    TEXTAREA.rows = 3;
    TEXTAREA.maxLength = 4000;
    TEXTAREA.required = true;
    TEXTAREA.placeholder = 'Write a message…';
    LABEL.append(TEXTAREA);
    const SEND = chatElement('button', 'button-primary', 'Send message');
    SEND.type = 'submit';
    FORM.append(LABEL, SEND);
    PANEL.append(MESSAGES, STATUS, CLOSED_NOTICE, FORM);
    ROOT.append(TOGGLE, PANEL);

    const SEEN_MESSAGE_IDS = new Set();
    let LAST_MESSAGE_ID = '';
    let CURRENT_USER_ID = '';
    let POLL_TIMER = null;
    let LOADING = false;
    let CAN_SEND = true;

    function appendMessage(MESSAGE) {
      const MESSAGE_ID = String(MESSAGE.id);
      if (SEEN_MESSAGE_IDS.has(MESSAGE_ID)) return false;
      MESSAGES.querySelector('.inquiry-chat-empty')?.remove();
      MESSAGES.append(renderMessage(MESSAGE, CURRENT_USER_ID));
      SEEN_MESSAGE_IDS.add(MESSAGE_ID);
      LAST_MESSAGE_ID = MESSAGE_ID;
      return true;
    }

    async function loadMessages(INITIAL = false) {
      if (LOADING) return;
      LOADING = true;
      const WAS_NEAR_BOTTOM = MESSAGES.scrollHeight - MESSAGES.scrollTop - MESSAGES.clientHeight < 60;
      try {
        const CURSOR = INITIAL || !LAST_MESSAGE_ID ? '' : `?after=${encodeURIComponent(LAST_MESSAGE_ID)}`;
        const DATA = await chatRequest(`/api/inquiries/${encodeURIComponent(INQUIRY_ID)}/messages${CURSOR}`);
        CURRENT_USER_ID = DATA.currentUserId;
        CAN_SEND = DATA.inquiry.canSend;
        FORM.hidden = !CAN_SEND;
        CLOSED_NOTICE.hidden = CAN_SEND;

        if (INITIAL) {
          MESSAGES.replaceChildren();
          SEEN_MESSAGE_IDS.clear();
          LAST_MESSAGE_ID = '';
        }
        for (const MESSAGE of DATA.messages) {
          appendMessage(MESSAGE);
        }
        if (MESSAGES.childElementCount === 0) {
          MESSAGES.append(chatElement('p', 'inquiry-chat-empty', 'No messages yet.'));
        }
        if (INITIAL || WAS_NEAR_BOTTOM) MESSAGES.scrollTop = MESSAGES.scrollHeight;
        if (INITIAL) STATUS.textContent = '';
      } catch (ERROR) {
        STATUS.textContent = ERROR.message;
      } finally {
        LOADING = false;
      }
    }

    function stopPolling() {
      if (POLL_TIMER !== null) {
        window.clearInterval(POLL_TIMER);
        POLL_TIMER = null;
      }
    }

    TOGGLE.addEventListener('click', () => {
      PANEL.hidden = !PANEL.hidden;
      TOGGLE.setAttribute('aria-expanded', String(!PANEL.hidden));
      TOGGLE.textContent = PANEL.hidden ? 'Open chat' : 'Close chat';
      if (PANEL.hidden) {
        stopPolling();
        return;
      }
      STATUS.textContent = 'Loading messages…';
      loadMessages(true);
      POLL_TIMER = window.setInterval(() => {
        if (!PANEL.hidden && ROOT.isConnected && !ROOT.closest('[hidden]') && document.visibilityState !== 'hidden') {
          loadMessages();
        }
      }, POLL_INTERVAL_MS);
      TEXTAREA.focus();
    });

    FORM.addEventListener('submit', async (EVENT) => {
      EVENT.preventDefault();
      if (!CAN_SEND || !TEXTAREA.value.trim()) return;
      SEND.disabled = true;
      STATUS.textContent = 'Sending message…';
      try {
        const WAS_NEAR_BOTTOM = MESSAGES.scrollHeight - MESSAGES.scrollTop - MESSAGES.clientHeight < 60;
        const DATA = await chatRequest(`/api/inquiries/${encodeURIComponent(INQUIRY_ID)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: TEXTAREA.value }),
        });
        TEXTAREA.value = '';
        CURRENT_USER_ID = DATA.currentUserId;
        appendMessage(DATA.message);
        if (WAS_NEAR_BOTTOM) MESSAGES.scrollTop = MESSAGES.scrollHeight;
        if (DATA.inquiryStatus) {
          const STATUS_PILL = ROOT.closest('.dashboard-list-item, .admin-inquiry-card')?.querySelector('.status-pill');
          if (STATUS_PILL) {
            STATUS_PILL.className = `status-pill status-${DATA.inquiryStatus}`;
            STATUS_PILL.textContent = DATA.inquiryStatus;
          }
        }
        STATUS.textContent = 'Message sent.';
        document.dispatchEvent(new Event('boarda:notifications-refresh'));
      } catch (ERROR) {
        STATUS.textContent = ERROR.message;
      } finally {
        SEND.disabled = false;
      }
    });

    return ROOT;
  }

  window.createInquiryChat = createInquiryChat;
}());
