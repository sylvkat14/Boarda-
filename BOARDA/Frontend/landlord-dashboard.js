const LANDLORD_STATUS = document.querySelector('#landlord-dashboard-status');
const LANDLORD_LISTINGS = document.querySelector('#landlord-listings');
const LANDLORD_INQUIRIES = document.querySelector('#landlord-inquiries-list');
const LANDLORD_INQUIRIES_STATUS = document.querySelector('#landlord-inquiries-status');
const LISTING_FORM = document.querySelector('#landlord-listing-form');
const LISTING_FORM_HEADING = document.querySelector('#listing-form-heading');
const SAVE_LISTING_BUTTON = document.querySelector('#save-listing-button');
const CANCEL_LISTING_EDIT = document.querySelector('#cancel-listing-edit');
const LISTING_PHOTO_INPUT = document.querySelector('#listing-photo-files');
const LISTING_PHOTO_PREVIEW = document.querySelector('#listing-photo-preview');
const LISTING_FORM_STATUS = document.querySelector('#listing-form-status');
const PUBLISHED_LISTINGS_COUNT = document.querySelector('#landlord-published-count');
const DRAFT_LISTINGS_COUNT = document.querySelector('#landlord-draft-count');
const NEW_INQUIRIES_COUNT = document.querySelector('#landlord-new-inquiries-count');
const LANDLORD_TABLIST = document.querySelector('.landlord-dashboard-nav');
const LANDLORD_TABS = [...LANDLORD_TABLIST.querySelectorAll('[role="tab"]')];
let CURRENT_LANDLORD = null;
let LISTING_PHOTOS = [];

function landlordElement(TAG, CLASS_NAME, TEXT) {
  const ELEMENT = document.createElement(TAG);
  if (CLASS_NAME) ELEMENT.className = CLASS_NAME;
  if (TEXT !== undefined) ELEMENT.textContent = TEXT;
  return ELEMENT;
}

function activateLandlordTab(TAB_ID, FOCUS_TAB = false) {
  const ACTIVE_TAB = LANDLORD_TABS.find((TAB) => TAB.id === TAB_ID);
  if (!ACTIVE_TAB) return;

  LANDLORD_TABS.forEach((TAB) => {
    const IS_ACTIVE = TAB === ACTIVE_TAB;
    TAB.setAttribute('aria-selected', String(IS_ACTIVE));
    TAB.tabIndex = IS_ACTIVE ? 0 : -1;
    document.getElementById(TAB.getAttribute('aria-controls')).hidden = !IS_ACTIVE;
  });
  LANDLORD_TABLIST.setAttribute('aria-orientation', 'horizontal');
  if (FOCUS_TAB) ACTIVE_TAB.focus();
}

function moveLandlordTabFocus(CURRENT_TAB, KEY) {
  const FORWARD_KEY = 'ArrowRight';
  const BACKWARD_KEY = 'ArrowLeft';
  let NEXT_INDEX = LANDLORD_TABS.indexOf(CURRENT_TAB);

  if (KEY === FORWARD_KEY) NEXT_INDEX = (NEXT_INDEX + 1) % LANDLORD_TABS.length;
  else if (KEY === BACKWARD_KEY) NEXT_INDEX = (NEXT_INDEX - 1 + LANDLORD_TABS.length) % LANDLORD_TABS.length;
  else if (KEY === 'Home') NEXT_INDEX = 0;
  else if (KEY === 'End') NEXT_INDEX = LANDLORD_TABS.length - 1;
  else return;

  CURRENT_TAB = LANDLORD_TABS[NEXT_INDEX];
  activateLandlordTab(CURRENT_TAB.id, true);
}

LANDLORD_TABS.forEach((TAB) => {
  TAB.addEventListener('click', () => activateLandlordTab(TAB.id));
  TAB.addEventListener('keydown', (EVENT) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(EVENT.key)) {
      EVENT.preventDefault();
      moveLandlordTabFocus(TAB, EVENT.key);
    }
  });
});
LANDLORD_TABLIST.setAttribute('aria-orientation', 'horizontal');
document.querySelectorAll('[data-landlord-tab]').forEach((LINK) => {
  LINK.addEventListener('click', (EVENT) => {
    EVENT.preventDefault();
    activateLandlordTab(LINK.dataset.landlordTab, true);
  });
});

async function landlordRequest(URL, OPTIONS = {}) {
  const RESPONSE = await fetch(URL, {
    credentials: 'same-origin',
    ...OPTIONS,
    headers: {
      ...(OPTIONS.body && !(OPTIONS.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...OPTIONS.headers,
    },
  });
  const DATA = await RESPONSE.json().catch(() => null);
  if (!RESPONSE.ok) throw new Error(DATA?.error || `Could not complete that listing action (HTTP ${RESPONSE.status}).`);
  return DATA;
}

function setLandlordStatus(MESSAGE) {
  LANDLORD_STATUS.textContent = MESSAGE;
  LISTING_FORM_STATUS.textContent = MESSAGE;
}

function renderListingPhotoPreviews() {
  LISTING_PHOTO_PREVIEW.replaceChildren();
  LISTING_PHOTOS.forEach((PHOTO, INDEX) => {
    const FIGURE = landlordElement('figure');
    const IMAGE = document.createElement('img');
    IMAGE.src = PHOTO.previewUrl || PHOTO.url;
    IMAGE.alt = PHOTO.altText || `Property photo ${INDEX + 1}`;
    FIGURE.append(IMAGE);

    const CAPTION = landlordElement('figcaption', '', PHOTO.file?.name || PHOTO.altText || `Photo ${INDEX + 1}`);
    FIGURE.append(CAPTION);
    const REMOVE = landlordElement('button', 'listing-photo-remove', '×');
    REMOVE.type = 'button';
    REMOVE.setAttribute('aria-label', `Remove ${PHOTO.file?.name || PHOTO.altText || `photo ${INDEX + 1}`}`);
    REMOVE.addEventListener('click', () => {
      if (PHOTO.previewUrl) URL.revokeObjectURL(PHOTO.previewUrl);
      LISTING_PHOTOS.splice(INDEX, 1);
      renderListingPhotoPreviews();
    });
    FIGURE.append(REMOVE);
    LISTING_PHOTO_PREVIEW.append(FIGURE);
  });
}

function clearListingForm() {
  LISTING_FORM.reset();
  LISTING_PHOTOS.forEach((PHOTO) => {
    if (PHOTO.previewUrl) URL.revokeObjectURL(PHOTO.previewUrl);
  });
  LISTING_PHOTOS = [];
  renderListingPhotoPreviews();
  delete LISTING_FORM.dataset.editId;
  LISTING_FORM_HEADING.textContent = 'Create a listing';
  SAVE_LISTING_BUTTON.textContent = 'Publish listing';
  CANCEL_LISTING_EDIT.hidden = true;
  if (CURRENT_LANDLORD) {
    LISTING_FORM.elements.namedItem('contact_name').value = CURRENT_LANDLORD.name;
    LISTING_FORM.elements.namedItem('contact_email').value = CURRENT_LANDLORD.email;
  }
}

function editListing(LISTING) {
  activateLandlordTab('landlord-create-tab');
  LISTING_FORM.dataset.editId = LISTING.id;
  LISTING_FORM.elements.namedItem('title').value = LISTING.title || '';
  LISTING_FORM.elements.namedItem('location').value = LISTING.location || '';
  LISTING_FORM.elements.namedItem('monthly_price').value = LISTING.monthlyPrice ?? '';
  LISTING_FORM.elements.namedItem('room_type').value = LISTING.roomType || '';
  LISTING_FORM.elements.namedItem('status').value = LISTING.status === 'draft' ? 'draft' : 'published';
  LISTING_FORM.elements.namedItem('contact_name').value = LISTING.contactName || LISTING.landlordName || CURRENT_LANDLORD.name;
  LISTING_FORM.elements.namedItem('contact_phone').value = LISTING.contactPhone || '';
  LISTING_FORM.elements.namedItem('contact_email').value = LISTING.contactEmail || CURRENT_LANDLORD.email;
  LISTING_FORM.elements.namedItem('description').value = LISTING.description || '';
  LISTING_PHOTOS.forEach((PHOTO) => {
    if (PHOTO.previewUrl) URL.revokeObjectURL(PHOTO.previewUrl);
  });
  LISTING_PHOTOS = (Array.isArray(LISTING.photos) ? LISTING.photos : []).map((PHOTO) => ({ ...PHOTO }));
  renderListingPhotoPreviews();
  const AMENITIES = new Set((LISTING.amenities || []).map((AMENITY) => AMENITY.slug));
  LISTING_FORM.querySelectorAll('input[name="amenities"]').forEach((INPUT) => {
    INPUT.checked = AMENITIES.has(INPUT.value);
  });
  LISTING_FORM_HEADING.textContent = `Edit ${LISTING.title}`;
  SAVE_LISTING_BUTTON.textContent = 'Save changes';
  CANCEL_LISTING_EDIT.hidden = false;
  LISTING_FORM.scrollIntoView({ behavior: 'smooth', block: 'start' });
  LISTING_FORM.elements.namedItem('title').focus({ preventScroll: true });
}

function renderLandlordListing(LISTING) {
  const CARD = landlordElement('article', 'dashboard-card landlord-listing-card');
  const IMAGE = document.createElement('img');
  IMAGE.className = 'dashboard-card-image';
  IMAGE.src = LISTING.photos?.[0]?.url || '/Images/logo.png';
  IMAGE.alt = LISTING.photos?.[0]?.altText || `${LISTING.title} photo`;
  IMAGE.loading = 'lazy';
  CARD.append(IMAGE);

  const CONTENT = landlordElement('div', 'dashboard-card-content');
  const TITLE = landlordElement('h3');
  const LINK = landlordElement('a', '', LISTING.title);
  LINK.href = LISTING.status === 'published'
    ? `listings.html?id=${encodeURIComponent(LISTING.slug || LISTING.id)}`
    : '#listing-form-heading';
  if (LISTING.status !== 'published') {
    LINK.addEventListener('click', (EVENT) => {
      EVENT.preventDefault();
      editListing(LISTING);
    });
  }
  TITLE.append(LINK);
  const HEADING = landlordElement('div', 'dashboard-card-heading');
  HEADING.append(TITLE, landlordElement('span', `status-pill status-${LISTING.status}`, LISTING.status));
  CONTENT.append(HEADING);
  CONTENT.append(landlordElement('p', 'dashboard-card-location', LISTING.location || 'Location not listed'));
  const PRICE = LISTING.monthlyPrice === null || LISTING.monthlyPrice === undefined
    ? 'Price not listed'
    : `K${Number(LISTING.monthlyPrice).toLocaleString('en-ZM')} / month`;
  CONTENT.append(landlordElement('p', 'dashboard-card-price', PRICE));

  const ACTIONS = landlordElement('div', 'dashboard-card-actions');
  const EDIT = landlordElement('button', 'button-secondary', 'Edit');
  EDIT.type = 'button';
  EDIT.addEventListener('click', () => editListing(LISTING));
  ACTIONS.append(EDIT);
  if (LISTING.status !== 'archived') {
    const ARCHIVE = landlordElement('button', 'button-quiet', 'Archive');
    ARCHIVE.type = 'button';
    ARCHIVE.addEventListener('click', async () => {
      ARCHIVE.disabled = true;
      setLandlordStatus(`Archiving “${LISTING.title}”…`);
      try {
        await landlordRequest(`/api/listings/${encodeURIComponent(LISTING.id)}`, { method: 'DELETE' });
        setLandlordStatus('Listing archived.');
        await loadLandlordListings();
      } catch (ERROR) {
        setLandlordStatus(ERROR.message);
        ARCHIVE.disabled = false;
      }
    });
    ACTIONS.append(ARCHIVE);
  }
  CONTENT.append(ACTIONS);
  CARD.append(CONTENT);
  return CARD;
}

async function loadLandlordListings() {
  try {
    const DATA = await landlordRequest('/api/landlord/listings');
    LANDLORD_LISTINGS.replaceChildren();
    const LISTINGS = DATA.listings || [];
    PUBLISHED_LISTINGS_COUNT.textContent = String(LISTINGS.filter((LISTING) => LISTING.status === 'published').length);
    DRAFT_LISTINGS_COUNT.textContent = String(LISTINGS.filter((LISTING) => LISTING.status === 'draft').length);
    if (DATA.listings?.length) {
      DATA.listings.forEach((LISTING) => LANDLORD_LISTINGS.append(renderLandlordListing(LISTING)));
    } else {
      const EMPTY = landlordElement('div', 'dashboard-empty-state');
      EMPTY.append(landlordElement('p', '', 'You have not created a listing yet. Add your first boarding house using the form above.'));
      LANDLORD_LISTINGS.append(EMPTY);
    }
  } catch (ERROR) {
    setLandlordStatus(ERROR.message);
  }
}

function renderLandlordInquiry(INQUIRY) {
  const ITEM = landlordElement('article', 'dashboard-list-item landlord-inquiry-item');
  ITEM.id = `inquiry-${INQUIRY.id}`;
  const HEADER = landlordElement('div', 'dashboard-list-item-heading');
  HEADER.append(
    landlordElement('h3', '', INQUIRY.listingTitle || 'Boarding house'),
    landlordElement('span', `status-pill status-${INQUIRY.status}`, INQUIRY.status),
  );
  ITEM.append(HEADER);

  const CONTACT = landlordElement('p', 'landlord-inquiry-contact');
  CONTACT.append(document.createTextNode(`${INQUIRY.studentName || 'Student'} · `));
  CONTACT.append(document.createTextNode(INQUIRY.studentEmail || 'Email unavailable'));
  ITEM.append(CONTACT);
  ITEM.append(landlordElement('p', 'dashboard-inquiry-message', INQUIRY.message || 'No message provided.'));

  const DATE = INQUIRY.createdAt ? new Date(INQUIRY.createdAt) : null;
  const TIME = landlordElement('time', 'dashboard-meta', DATE && !Number.isNaN(DATE.getTime())
    ? new Intl.DateTimeFormat('en-ZM', { dateStyle: 'medium', timeStyle: 'short' }).format(DATE)
    : '');
  if (DATE && !Number.isNaN(DATE.getTime())) TIME.dateTime = DATE.toISOString();
  ITEM.append(TIME);

  const ACTIONS = landlordElement('div', 'dashboard-card-actions landlord-inquiry-actions');
  ACTIONS.append(window.createInquiryChat(INQUIRY));

  const ADD_STATUS_ACTION = (STATUS, LABEL, CLASS_NAME) => {
    const BUTTON = landlordElement('button', CLASS_NAME, LABEL);
    BUTTON.type = 'button';
    BUTTON.addEventListener('click', async () => {
      BUTTON.disabled = true;
      try {
        await landlordRequest(`/api/landlord/inquiries/${encodeURIComponent(INQUIRY.id)}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: STATUS }),
        });
        document.dispatchEvent(new Event('boarda:notifications-refresh'));
        await loadLandlordInquiries();
        LANDLORD_INQUIRIES_STATUS.textContent = STATUS === 'read' ? 'Inquiry marked as read.' : 'Inquiry closed.';
      } catch (ERROR) {
        LANDLORD_INQUIRIES_STATUS.textContent = ERROR.message;
        BUTTON.disabled = false;
      }
    });
    ACTIONS.append(BUTTON);
  };

  if (INQUIRY.status === 'new') ADD_STATUS_ACTION('read', 'Mark as read', 'button-secondary');
  if (INQUIRY.status !== 'closed') ADD_STATUS_ACTION('closed', 'Close inquiry', 'button-quiet');
  if (ACTIONS.childElementCount) ITEM.append(ACTIONS);
  return ITEM;
}

async function loadLandlordInquiries() {
  LANDLORD_INQUIRIES_STATUS.textContent = 'Loading student inquiries…';
  try {
    const DATA = await landlordRequest('/api/landlord/inquiries');
    const INQUIRIES = DATA.inquiries || [];
    NEW_INQUIRIES_COUNT.textContent = String(INQUIRIES.filter((INQUIRY) => INQUIRY.status === 'new').length);
    LANDLORD_INQUIRIES.replaceChildren();
    if (DATA.inquiries?.length) {
      DATA.inquiries.forEach((INQUIRY) => LANDLORD_INQUIRIES.append(renderLandlordInquiry(INQUIRY)));
      LANDLORD_INQUIRIES_STATUS.textContent = '';
    } else {
      LANDLORD_INQUIRIES.append(landlordElement('div', 'dashboard-empty-state', ''));
      const EMPTY = LANDLORD_INQUIRIES.lastElementChild;
      EMPTY.append(landlordElement('p', '', 'No student inquiries yet. New messages about your listings will appear here.'));
      LANDLORD_INQUIRIES_STATUS.textContent = '';
    }
    if (window.location.hash === '#landlord-inquiries') activateLandlordTab('landlord-inquiries-tab');
  } catch (ERROR) {
    LANDLORD_INQUIRIES.replaceChildren();
    LANDLORD_INQUIRIES_STATUS.textContent = ERROR.message;
  }
}

function makeListingPayload() {
  const TITLE_VALUE = LISTING_FORM.elements.namedItem('title').value.trim();

  return {
    title: TITLE_VALUE,
    location: LISTING_FORM.elements.namedItem('location').value.trim(),
    monthly_price: Number(LISTING_FORM.elements.namedItem('monthly_price').value),
    room_type: LISTING_FORM.elements.namedItem('room_type').value || null,
    status: LISTING_FORM.elements.namedItem('status').value,
    contact_name: LISTING_FORM.elements.namedItem('contact_name').value.trim() || null,
    contact_phone: LISTING_FORM.elements.namedItem('contact_phone').value.trim() || null,
    contact_email: LISTING_FORM.elements.namedItem('contact_email').value.trim() || null,
    description: LISTING_FORM.elements.namedItem('description').value.trim() || null,
    amenities: [...LISTING_FORM.querySelectorAll('input[name="amenities"]:checked')].map((INPUT) => INPUT.value),
    photos: LISTING_PHOTOS.map((PHOTO, INDEX) => ({
      url: PHOTO.url,
      altText: PHOTO.altText || `${TITLE_VALUE} photo ${INDEX + 1}`,
    })),
  };
}

LISTING_PHOTO_INPUT.addEventListener('change', () => {
  const CHOSEN_FILES = [...LISTING_PHOTO_INPUT.files];
  LISTING_PHOTO_INPUT.value = '';
  const AVAILABLE_SLOTS = Math.max(0, 10 - LISTING_PHOTOS.length);
  let ADDED_COUNT = 0;
  const REJECTED = [];

  CHOSEN_FILES.forEach((FILE) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(FILE.type)) {
      REJECTED.push(`${FILE.name}: choose a JPEG, PNG, or WebP image.`);
      return;
    }
    if (FILE.size > 5 * 1024 * 1024) {
      REJECTED.push(`${FILE.name}: the maximum size is 5 MB.`);
      return;
    }
    if (ADDED_COUNT >= AVAILABLE_SLOTS) {
      REJECTED.push('A listing can have up to 10 photos.');
      return;
    }

    const ALT_TEXT = FILE.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    LISTING_PHOTOS.push({ file: FILE, previewUrl: URL.createObjectURL(FILE), altText: ALT_TEXT });
    ADDED_COUNT += 1;
  });

  renderListingPhotoPreviews();
  if (REJECTED.length) setLandlordStatus(REJECTED[0]);
  else if (ADDED_COUNT) setLandlordStatus(`${LISTING_PHOTOS.length} photo${LISTING_PHOTOS.length === 1 ? '' : 's'} selected.`);
});

LISTING_FORM.addEventListener('submit', async (EVENT) => {
  EVENT.preventDefault();
  if (!LISTING_FORM.reportValidity()) {
    setLandlordStatus('Complete the required listing fields before publishing.');
    return;
  }
  const ORIGINAL_BUTTON_LABEL = SAVE_LISTING_BUTTON.textContent;
  SAVE_LISTING_BUTTON.disabled = true;
  SAVE_LISTING_BUTTON.textContent = 'Publishing…';
  const EDIT_ID = LISTING_FORM.dataset.editId;
  setLandlordStatus(EDIT_ID ? 'Saving listing changes…' : 'Creating your listing…');
  try {
    const NEW_PHOTOS = LISTING_PHOTOS.filter((PHOTO) => PHOTO.file);
    if (NEW_PHOTOS.length) {
      setLandlordStatus(`Uploading ${NEW_PHOTOS.length} photo${NEW_PHOTOS.length === 1 ? '' : 's'}…`);
      SAVE_LISTING_BUTTON.textContent = 'Uploading photos…';
      const UPLOAD_BODY = new FormData();
      NEW_PHOTOS.forEach((PHOTO) => UPLOAD_BODY.append('photos', PHOTO.file));
      const UPLOAD_RESULT = await landlordRequest('/api/listings/photos', { method: 'POST', body: UPLOAD_BODY });
      const UPLOADED_PHOTOS = UPLOAD_RESULT.photos || [];
      if (UPLOADED_PHOTOS.length !== NEW_PHOTOS.length) throw new Error('Some photos could not be uploaded. Please try again.');

      let UPLOAD_INDEX = 0;
      LISTING_PHOTOS = LISTING_PHOTOS.map((PHOTO) => {
        if (!PHOTO.file) return PHOTO;
        const UPLOADED = UPLOADED_PHOTOS[UPLOAD_INDEX++];
        URL.revokeObjectURL(PHOTO.previewUrl);
        return { url: UPLOADED.url, altText: PHOTO.altText || UPLOADED.altText };
      });
      renderListingPhotoPreviews();
    }

    const PAYLOAD = makeListingPayload();
    SAVE_LISTING_BUTTON.textContent = 'Saving listing…';
    await landlordRequest(EDIT_ID ? `/api/listings/${encodeURIComponent(EDIT_ID)}` : '/api/listings', {
      method: EDIT_ID ? 'PATCH' : 'POST',
      body: JSON.stringify(PAYLOAD),
    });
    clearListingForm();
    setLandlordStatus(EDIT_ID ? 'Listing updated.' : 'Listing created.');
    await Promise.all([loadLandlordListings(), loadLandlordInquiries()]);
    activateLandlordTab('landlord-listings-tab');
  } catch (ERROR) {
    setLandlordStatus(ERROR instanceof TypeError
      ? 'Cannot reach the Boarda backend. Start it with “npm run dev” from BOARDA/backend, then refresh this page.'
      : ERROR.message);
  } finally {
    SAVE_LISTING_BUTTON.disabled = false;
    SAVE_LISTING_BUTTON.textContent = ORIGINAL_BUTTON_LABEL;
  }
});

CANCEL_LISTING_EDIT.addEventListener('click', clearListingForm);

async function startLandlordDashboard() {
  try {
    const SESSION = await landlordRequest('/api/auth/me');
    if (SESSION.user?.role !== 'landlord') {
      window.location.replace(
        SESSION.user?.role === 'admin' ? 'admin-dashboard.html'
          : SESSION.user?.role === 'student' ? 'student-dashboard.html'
            : 'login.html',
      );
      return;
    }
    CURRENT_LANDLORD = SESSION.user;
    document.querySelector('#landlord-name').textContent = CURRENT_LANDLORD.name;
    clearListingForm();
    setLandlordStatus('');
    await Promise.all([loadLandlordListings(), loadLandlordInquiries()]);
  } catch (ERROR) {
    if (ERROR.message.includes('Sign in') || ERROR.message.includes('session has expired')) {
      window.location.replace('login.html');
      return;
    }
    setLandlordStatus(ERROR instanceof TypeError
      ? 'Cannot reach Boarda. Start the backend and refresh this page.'
      : ERROR.message);
  }
}

startLandlordDashboard();
