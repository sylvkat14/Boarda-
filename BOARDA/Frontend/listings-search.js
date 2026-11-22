const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const FILTER_FORM = document.querySelector('#listing-filters');
const RESULTS_COUNT = document.querySelector('#listing-results-count');
const RESULTS_ITEMS = document.querySelector('#listing-results-items');
const CLEAR_FILTERS = document.querySelector('#clear-listing-filters');
const REQUESTED_LISTING = SEARCH_PARAMS.get('id');
let CURRENT_USER = null;
const SAVED_LISTING_IDS = new Set();

if (FILTER_FORM) {
  FILTER_FORM.elements.location.value = SEARCH_PARAMS.get('location') || '';
  FILTER_FORM.elements.min_price.value = SEARCH_PARAMS.get('min_price') || '';
  FILTER_FORM.elements.max_price.value = SEARCH_PARAMS.get('max_price') || '';
  FILTER_FORM.elements.room_type.value = SEARCH_PARAMS.get('room_type') || '';
  const SELECTED_AMENITIES = new Set([
    ...SEARCH_PARAMS.getAll('amenity'),
    ...(SEARCH_PARAMS.get('amenities') || '').split(',').filter(Boolean),
  ]);
  FILTER_FORM.querySelectorAll('input[name="amenity"]').forEach((INPUT) => {
    INPUT.checked = SELECTED_AMENITIES.has(INPUT.value);
  });
}

if (CLEAR_FILTERS) {
  CLEAR_FILTERS.hidden = SEARCH_PARAMS.size === 0;
  CLEAR_FILTERS.textContent = REQUESTED_LISTING ? 'View all listings' : 'Clear filters';
}

function createTextElement(TAG_NAME, CLASS_NAME, TEXT) {
  const ELEMENT = document.createElement(TAG_NAME);
  if (CLASS_NAME) ELEMENT.className = CLASS_NAME;
  ELEMENT.textContent = TEXT;
  return ELEMENT;
}

function formatMonthlyPrice(PRICE) {
  if (PRICE === null || PRICE === undefined || PRICE === '') return 'Price not listed';
  const AMOUNT = Number(PRICE);
  return Number.isFinite(AMOUNT) ? `K${AMOUNT.toLocaleString('en-ZM')} / month` : 'Price not listed';
}

function appendContactRow(LIST, LABEL, VALUE, LINK_PREFIX) {
  if (!VALUE) return;
  const TERM = document.createElement('dt');
  TERM.textContent = LABEL;
  const DETAIL = document.createElement('dd');
  if (LINK_PREFIX) {
    const LINK = document.createElement('a');
    LINK.href = `${LINK_PREFIX}${VALUE}`;
    LINK.textContent = VALUE;
    DETAIL.append(LINK);
  } else {
    DETAIL.textContent = VALUE;
  }
  LIST.append(TERM, DETAIL);
}

async function sendStudentRequest(URL, OPTIONS = {}) {
  const RESPONSE = await fetch(URL, {
    credentials: 'same-origin',
    ...OPTIONS,
    headers: { ...(OPTIONS.body ? { 'Content-Type': 'application/json' } : {}), ...OPTIONS.headers },
  });
  const DATA = await RESPONSE.json().catch(() => null);
  if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not complete that action.');
  return DATA;
}

function addStudentActions(ARTICLE, LISTING) {
  if (CURRENT_USER?.role !== 'student') return;

  const ACTIONS = document.createElement('section');
  ACTIONS.className = 'listing-student-actions';
  ACTIONS.setAttribute('aria-label', `Student actions for ${LISTING.title}`);

  const SAVE_BUTTON = createTextElement('button', 'button-secondary', '');
  SAVE_BUTTON.type = 'button';
  const UPDATE_SAVE_LABEL = () => {
    const IS_SAVED = SAVED_LISTING_IDS.has(String(LISTING.id));
    SAVE_BUTTON.textContent = IS_SAVED ? 'Remove from saved' : 'Save this home';
    SAVE_BUTTON.setAttribute('aria-pressed', String(IS_SAVED));
  };
  UPDATE_SAVE_LABEL();
  SAVE_BUTTON.addEventListener('click', async () => {
    SAVE_BUTTON.disabled = true;
    try {
      const IS_SAVED = SAVED_LISTING_IDS.has(String(LISTING.id));
      if (IS_SAVED) {
        await sendStudentRequest(`/api/student/saved-listings/${encodeURIComponent(LISTING.id)}`, { method: 'DELETE' });
        SAVED_LISTING_IDS.delete(String(LISTING.id));
      } else {
        await sendStudentRequest('/api/student/saved-listings', {
          method: 'POST',
          body: JSON.stringify({ listingId: LISTING.id }),
        });
        SAVED_LISTING_IDS.add(String(LISTING.id));
      }
      UPDATE_SAVE_LABEL();
    } catch (ERROR) {
      ACTION_STATUS.textContent = ERROR.message;
    } finally {
      SAVE_BUTTON.disabled = false;
    }
  });
  ACTIONS.append(SAVE_BUTTON);

  const INQUIRY_FORM = document.createElement('form');
  INQUIRY_FORM.className = 'listing-inquiry-form';
  const MESSAGE_LABEL = createTextElement('label', '', 'Message the landlord');
  const MESSAGE = document.createElement('textarea');
  MESSAGE.name = 'message';
  MESSAGE.rows = 3;
  MESSAGE.maxLength = 2000;
  MESSAGE.required = true;
  MESSAGE.placeholder = 'Ask about availability, viewing times, or details.';
  MESSAGE_LABEL.append(MESSAGE);
  const SEND_BUTTON = createTextElement('button', '', 'Send inquiry');
  SEND_BUTTON.type = 'submit';
  INQUIRY_FORM.append(MESSAGE_LABEL, SEND_BUTTON);
  INQUIRY_FORM.addEventListener('submit', async (EVENT) => {
    EVENT.preventDefault();
    if (!INQUIRY_FORM.reportValidity()) return;
    SEND_BUTTON.disabled = true;
    try {
      await sendStudentRequest('/api/student/inquiries', {
        method: 'POST',
        body: JSON.stringify({ listingId: LISTING.id, message: MESSAGE.value }),
      });
      MESSAGE.value = '';
      ACTION_STATUS.textContent = 'Your inquiry was sent. You can track it from your dashboard.';
    } catch (ERROR) {
      ACTION_STATUS.textContent = ERROR.message;
    } finally {
      SEND_BUTTON.disabled = false;
    }
  });
  ACTIONS.append(INQUIRY_FORM);

  const ACTION_STATUS = createTextElement('p', 'listing-action-status', '');
  ACTION_STATUS.setAttribute('role', 'status');
  ACTIONS.append(ACTION_STATUS);
  ARTICLE.append(ACTIONS);
}

function renderListing(LISTING) {
  const ARTICLE = document.createElement('article');
  ARTICLE.className = 'listing-entry';
  ARTICLE.id = `listing-${LISTING.id}`;

  const PHOTOS = Array.isArray(LISTING.photos) ? LISTING.photos : [];
  const FIGURE = document.createElement('figure');
  const PHOTO_FRAME = createTextElement('div', 'listing-photo', '');
  PHOTO_FRAME.setAttribute('role', 'button');
  PHOTO_FRAME.setAttribute('tabindex', '0');
  PHOTO_FRAME.setAttribute('aria-haspopup', 'dialog');
  PHOTO_FRAME.setAttribute('aria-label', `View photos of ${LISTING.title}`);
  PHOTO_FRAME.dataset.photoIndex = '0';
  const MAIN_PHOTO = document.createElement('img');
  MAIN_PHOTO.src = PHOTOS[0]?.url || '/Images/logo.png';
  MAIN_PHOTO.alt = PHOTOS[0]?.altText || `${LISTING.title} photo`;
  PHOTO_FRAME.dataset.galleryUrl = MAIN_PHOTO.src;
  PHOTO_FRAME.dataset.galleryAlt = MAIN_PHOTO.alt;
  MAIN_PHOTO.loading = 'lazy';
  PHOTO_FRAME.append(MAIN_PHOTO);
  const CAPTION = createTextElement('figcaption', '', LISTING.title);
  FIGURE.append(PHOTO_FRAME, CAPTION);
  ARTICLE.append(FIGURE);

  if (PHOTOS.length > 1) {
    const THUMBNAILS = document.createElement('div');
    THUMBNAILS.className = 'thumbnails listing-thumbnails';
    THUMBNAILS.setAttribute('role', 'group');
    THUMBNAILS.setAttribute('aria-label', `More photos of ${LISTING.title}`);
    PHOTOS.slice(1).forEach((PHOTO, INDEX) => {
      const BUTTON = document.createElement('button');
      BUTTON.type = 'button';
      BUTTON.setAttribute('aria-pressed', 'false');
      BUTTON.dataset.photoIndex = String(INDEX + 1);
      BUTTON.dataset.photoUrl = PHOTO.url;
      BUTTON.dataset.photoAlt = PHOTO.altText || `${LISTING.title} photo ${INDEX + 2}`;
      const THUMBNAIL = document.createElement('img');
      THUMBNAIL.src = PHOTO.url;
      THUMBNAIL.alt = BUTTON.dataset.photoAlt;
      THUMBNAIL.loading = 'lazy';
      BUTTON.setAttribute('aria-label', `Show photo ${INDEX + 2} of ${LISTING.title}`);
      BUTTON.append(THUMBNAIL);
      THUMBNAILS.append(BUTTON);
    });
    ARTICLE.append(THUMBNAILS);
  }

  const SUMMARY = document.createElement('div');
  SUMMARY.className = 'listing-summary';
  SUMMARY.append(createTextElement('p', 'listing-price', formatMonthlyPrice(LISTING.monthlyPrice)));
  SUMMARY.append(createTextElement('p', 'listing-location', LISTING.location || 'Location not listed'));
  if (LISTING.roomType) {
    const ROOM_LABEL = LISTING.roomType === 'self-contained'
      ? 'Self-contained'
      : `${LISTING.roomType[0].toUpperCase()}${LISTING.roomType.slice(1)}`;
    SUMMARY.append(createTextElement('p', 'listing-room-type', `${ROOM_LABEL} room`));
  }
  if (LISTING.description) SUMMARY.append(createTextElement('p', 'listing-description', LISTING.description));
  ARTICLE.append(SUMMARY);

  const AMENITIES = Array.isArray(LISTING.amenities) ? LISTING.amenities : [];
  const AMENITIES_SECTION = document.createElement('section');
  AMENITIES_SECTION.className = 'listing-amenities';
  AMENITIES_SECTION.setAttribute('aria-label', 'Amenities');
  AMENITIES_SECTION.append(createTextElement('h3', '', 'Amenities'));
  if (AMENITIES.length) {
    const AMENITY_LIST = document.createElement('ul');
    AMENITIES.forEach((AMENITY) => AMENITY_LIST.append(createTextElement('li', '', AMENITY.name)));
    AMENITIES_SECTION.append(AMENITY_LIST);
  } else {
    AMENITIES_SECTION.append(createTextElement('p', '', 'No amenities listed.'));
  }
  ARTICLE.append(AMENITIES_SECTION);

  const CONTACT = document.createElement('section');
  CONTACT.className = 'listing-contact';
  CONTACT.setAttribute('aria-label', 'Contact landlord');
  CONTACT.append(createTextElement('h3', '', 'Contact Landlord'));
  const CONTACT_DETAILS = document.createElement('dl');
  appendContactRow(CONTACT_DETAILS, 'Name:', LISTING.landlordName);
  appendContactRow(CONTACT_DETAILS, 'Phone:', LISTING.contactPhone, 'tel:');
  appendContactRow(CONTACT_DETAILS, 'Email:', LISTING.contactEmail, 'mailto:');
  if (CONTACT_DETAILS.childElementCount) CONTACT.append(CONTACT_DETAILS);
  else CONTACT.append(createTextElement('p', '', 'Contact details not listed.'));
  ARTICLE.append(CONTACT);

  addStudentActions(ARTICLE, LISTING);

  return ARTICLE;
}

function setResultsMessage(LISTINGS, IS_DETAIL) {
  if (!RESULTS_COUNT) return;
  const HAS_SEARCH = [...SEARCH_PARAMS.keys()].some((KEY) => KEY !== 'id');
  if (IS_DETAIL) {
    RESULTS_COUNT.textContent = 'Listing details';
  } else if (HAS_SEARCH) {
    RESULTS_COUNT.textContent = `${LISTINGS.length} ${LISTINGS.length === 1 ? 'listing' : 'listings'} match your filters.`;
  } else {
    RESULTS_COUNT.textContent = `Showing ${LISTINGS.length} listed ${LISTINGS.length === 1 ? 'home' : 'homes'}.`;
  }
  if (HAS_SEARCH || IS_DETAIL) RESULTS_COUNT.append(' ');
  if (CLEAR_FILTERS && !CLEAR_FILTERS.hidden) RESULTS_COUNT.append(CLEAR_FILTERS.cloneNode(true));
}

async function loadListings() {
  if (!RESULTS_ITEMS || !RESULTS_COUNT) return;
  const API_URL = REQUESTED_LISTING
    ? `/api/listings/${encodeURIComponent(REQUESTED_LISTING)}`
    : `/api/listings${window.location.search}`;

  try {
    try {
      const SESSION_RESPONSE = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (SESSION_RESPONSE.ok) {
        const SESSION_DATA = await SESSION_RESPONSE.json();
        CURRENT_USER = SESSION_DATA.user || null;
        if (CURRENT_USER?.role === 'student') {
          const DASHBOARD_RESPONSE = await fetch('/api/student/dashboard', { credentials: 'same-origin' });
          if (DASHBOARD_RESPONSE.ok) {
            const DASHBOARD_DATA = await DASHBOARD_RESPONSE.json();
            DASHBOARD_DATA.savedListings?.forEach((LISTING) => SAVED_LISTING_IDS.add(String(LISTING.id)));
          }
        }
      }
    } catch (SESSION_ERROR) {
      // Browsing published listings remains available when the session API is unavailable.
    }

    const RESPONSE = await fetch(API_URL, { credentials: 'same-origin' });
    const DATA = await RESPONSE.json().catch(() => null);
    if (!RESPONSE.ok) throw new Error(DATA?.error || 'Could not load the listings.');
    const LISTINGS = REQUESTED_LISTING ? [DATA.listing] : DATA.listings;
    if (!Array.isArray(LISTINGS)) throw new Error('The server returned an invalid listings response.');

    RESULTS_ITEMS.replaceChildren();
    if (!LISTINGS.length) {
      RESULTS_ITEMS.append(createTextElement('p', 'listing-empty-state', 'No boarding houses match those filters yet.'));
      setResultsMessage(LISTINGS, false);
      return;
    }
    LISTINGS.forEach((LISTING) => RESULTS_ITEMS.append(renderListing(LISTING)));
    setResultsMessage(LISTINGS, Boolean(REQUESTED_LISTING));
  } catch (ERROR) {
    RESULTS_COUNT.textContent = ERROR instanceof TypeError
      ? 'Cannot reach Boarda. Start the backend from the BOARDA/backend folder and refresh this page.'
      : ERROR.message;
    RESULTS_ITEMS.replaceChildren();
  }
}

loadListings();
