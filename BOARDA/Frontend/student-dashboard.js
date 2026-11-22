const STUDENT_API = '/api';
const STUDENT_STATUS = document.querySelector('#student-dashboard-status');
const SAVED_LISTINGS = document.querySelector('#student-saved-listings');
const STUDENT_INQUIRIES = document.querySelector('#student-inquiries');

function dashboardElement(TAG, CLASS_NAME, TEXT) {
  const ELEMENT = document.createElement(TAG);
  if (CLASS_NAME) ELEMENT.className = CLASS_NAME;
  if (TEXT !== undefined) ELEMENT.textContent = TEXT;
  return ELEMENT;
}

async function studentRequest(URL, OPTIONS = {}) {
  const RESPONSE = await fetch(URL, {
    credentials: 'same-origin',
    ...OPTIONS,
    headers: { ...(OPTIONS.body ? { 'Content-Type': 'application/json' } : {}), ...OPTIONS.headers },
  });
  const DATA = await RESPONSE.json().catch(() => null);
  if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not load your dashboard.');
  return DATA;
}

function emptyDashboardState(TEXT, LINK_TEXT, LINK_HREF) {
  const EMPTY = dashboardElement('div', 'dashboard-empty-state');
  EMPTY.append(dashboardElement('p', '', TEXT));
  if (LINK_TEXT && LINK_HREF) {
    const LINK = dashboardElement('a', 'dashboard-text-link', LINK_TEXT);
    LINK.href = LINK_HREF;
    EMPTY.append(LINK);
  }
  return EMPTY;
}

function renderSavedListing(LISTING) {
  const CARD = dashboardElement('article', 'dashboard-card saved-listing-card');
  const IMAGE = document.createElement('img');
  IMAGE.className = 'dashboard-card-image';
  IMAGE.src = LISTING.photos?.[0]?.url || '/Images/logo.png';
  IMAGE.alt = LISTING.photos?.[0]?.altText || `${LISTING.title} photo`;
  IMAGE.loading = 'lazy';
  CARD.append(IMAGE);

  const CONTENT = dashboardElement('div', 'dashboard-card-content');
  const TITLE = dashboardElement('h3');
  const LINK = dashboardElement('a', '', LISTING.title);
  LINK.href = `listings.html?id=${encodeURIComponent(LISTING.slug || LISTING.id)}`;
  TITLE.append(LINK);
  CONTENT.append(TITLE);
  CONTENT.append(dashboardElement('p', 'dashboard-card-location', LISTING.location || 'Location not listed'));
  const PRICE = LISTING.monthlyPrice === null || LISTING.monthlyPrice === undefined
    ? 'Price not listed'
    : `K${Number(LISTING.monthlyPrice).toLocaleString('en-ZM')} / month`;
  CONTENT.append(dashboardElement('p', 'dashboard-card-price', PRICE));

  const ACTIONS = dashboardElement('div', 'dashboard-card-actions');
  const REMOVE = dashboardElement('button', 'button-secondary', 'Remove saved home');
  REMOVE.type = 'button';
  REMOVE.addEventListener('click', async () => {
    REMOVE.disabled = true;
    try {
      await studentRequest(`/api/student/saved-listings/${encodeURIComponent(LISTING.id)}`, { method: 'DELETE' });
      await loadStudentDashboard();
      STUDENT_STATUS.textContent = 'Saved home removed.';
    } catch (ERROR) {
      STUDENT_STATUS.textContent = ERROR.message;
      REMOVE.disabled = false;
    }
  });
  ACTIONS.append(REMOVE);
  CONTENT.append(ACTIONS);
  CARD.append(CONTENT);
  return CARD;
}

function renderInquiry(INQUIRY) {
  const ITEM = dashboardElement('article', 'dashboard-list-item');
  const HEADER = dashboardElement('div', 'dashboard-list-item-heading');
  const TITLE = dashboardElement('h3');
  const LINK = dashboardElement('a', '', INQUIRY.listingTitle || 'Boarding house');
  LINK.href = `listings.html?id=${encodeURIComponent(INQUIRY.listingSlug || INQUIRY.listingId)}`;
  TITLE.append(LINK);
  HEADER.append(TITLE, dashboardElement('span', `status-pill status-${INQUIRY.status}`, INQUIRY.status));
  ITEM.append(HEADER);
  ITEM.append(dashboardElement('p', 'dashboard-inquiry-message', INQUIRY.message));
  const DATE = INQUIRY.createdAt ? new Date(INQUIRY.createdAt).toLocaleDateString('en-ZM', {
    year: 'numeric', month: 'short', day: 'numeric',
  }) : '';
  ITEM.append(dashboardElement('p', 'dashboard-meta', DATE));
  return ITEM;
}

async function loadStudentDashboard() {
  STUDENT_STATUS.textContent = 'Loading your account…';
  try {
    const SESSION = await studentRequest('/api/auth/me');
    if (SESSION.user?.role !== 'student') {
      window.location.replace(
        SESSION.user?.role === 'admin' ? 'admin-dashboard.html'
          : SESSION.user?.role === 'landlord' ? 'landlord-dashboard.html'
            : 'login.html',
      );
      return;
    }
    document.querySelector('#student-name').textContent = SESSION.user.name;
    const DATA = await studentRequest(`${STUDENT_API}/student/dashboard`);
    SAVED_LISTINGS.replaceChildren();
    STUDENT_INQUIRIES.replaceChildren();

    if (DATA.savedListings?.length) {
      DATA.savedListings.forEach((LISTING) => SAVED_LISTINGS.append(renderSavedListing(LISTING)));
    } else {
      SAVED_LISTINGS.append(emptyDashboardState('You have not saved any homes yet.', 'Browse boarding houses', 'listings.html'));
    }

    if (DATA.inquiries?.length) {
      DATA.inquiries.forEach((INQUIRY) => STUDENT_INQUIRIES.append(renderInquiry(INQUIRY)));
    } else {
      STUDENT_INQUIRIES.append(emptyDashboardState('You have not contacted a landlord yet.', 'Explore homes', 'listings.html'));
    }
    STUDENT_STATUS.textContent = '';
  } catch (ERROR) {
    if (ERROR.message.includes('Sign in') || ERROR.message.includes('session has expired')) {
      window.location.replace('login.html');
      return;
    }
    STUDENT_STATUS.textContent = ERROR instanceof TypeError
      ? 'Cannot reach Boarda. Start the backend and refresh this page.'
      : ERROR.message;
  }
}

loadStudentDashboard();
