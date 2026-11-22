const ADMIN_STATUS = document.querySelector('#admin-dashboard-status');

const ADMIN_NAV_BUTTONS = [...document.querySelectorAll('[data-admin-section]')];
const ADMIN_SECTIONS = [...document.querySelectorAll('.admin-section')];
const USER_SEARCH = document.querySelector('#admin-user-search');
const USER_ROLE_FILTER = document.querySelector('#admin-user-role-filter');
const LISTING_SEARCH = document.querySelector('#admin-listing-search');
const LISTING_STATUS_FILTER = document.querySelector('#admin-listing-status-filter');

function setStatus(element, message) {
  if (element) element.textContent = message;
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'The admin request failed.');
  return data;
}

function activateAdminSection(sectionName) {
  ADMIN_NAV_BUTTONS.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminSection === sectionName);
  });
  ADMIN_SECTIONS.forEach((section) => {
    section.hidden = section.id !== `admin-${sectionName}-section`;
  });
}

ADMIN_NAV_BUTTONS.forEach((button) => {
  button.addEventListener('click', () => activateAdminSection(button.dataset.adminSection));
});

function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function formatPrice(value, currency) {
  if (value === null || value === undefined || value === '') return 'Price unknown';
  return `${currency || 'ZMW'} ${Number(value).toLocaleString()}`;
}

function createActionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

async function loadOverview() {
  const data = await adminRequest('/api/admin/overview');
  document.querySelector('#admin-total-users').textContent = data.users.total;
  document.querySelector('#admin-student-count').textContent = data.users.students;
  document.querySelector('#admin-landlord-count').textContent = data.users.landlords;
  document.querySelector('#admin-total-listings').textContent = data.listings.total;
  document.querySelector('#admin-published-count').textContent = data.listings.published;
  document.querySelector('#admin-draft-count').textContent = data.listings.drafts;
  document.querySelector('#admin-total-inquiries').textContent = data.inquiries.total;
  document.querySelector('#admin-new-inquiries-count').textContent = data.inquiries.new;
}

async function loadUsers() {
  const status = document.querySelector('#admin-users-status');
  const container = document.querySelector('#admin-users-list');
  setStatus(status, 'Loading users…');
  try {
    const params = new URLSearchParams();
    if (USER_SEARCH.value.trim()) params.set('search', USER_SEARCH.value.trim());
    if (USER_ROLE_FILTER.value) params.set('role', USER_ROLE_FILTER.value);
    const data = await adminRequest(`/api/admin/users?${params}`);
    if (!data.users.length) {
      container.innerHTML = '<p class="admin-empty-state">No users match these filters.</p>';
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead>
        <tbody></tbody>
      `;
      const body = table.tBodies[0];
      data.users.forEach((user) => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = user.name;
        const emailCell = document.createElement('td');
        emailCell.textContent = user.email;
        const roleCell = document.createElement('td');
        const roleSelect = document.createElement('select');
        roleSelect.className = 'admin-inline-select';
        ['student', 'landlord', 'admin'].forEach((role) => {
          const option = document.createElement('option');
          option.value = role;
          option.textContent = role === 'admin' ? 'Administrator' : role[0].toUpperCase() + role.slice(1);
          option.selected = user.role === role;
          roleSelect.append(option);
        });
        roleCell.append(roleSelect);
        const dateCell = document.createElement('td');
        dateCell.textContent = formatDate(user.created_at);
        const actionCell = document.createElement('td');
        const save = createActionButton('Save', 'admin-action-button', async () => {
          save.disabled = true;
          try {
            await adminRequest(`/api/admin/users/${user.id}/role`, {
              method: 'PATCH',
              body: JSON.stringify({ role: roleSelect.value }),
            });
            setStatus(status, 'User role updated.');
            await Promise.all([loadOverview(), loadUsers()]);
          } catch (error) {
            setStatus(status, error.message);
            save.disabled = false;
          }
        });
        actionCell.append(save);
        row.append(nameCell, emailCell, roleCell, dateCell, actionCell);
        body.append(row);
      });
      container.replaceChildren(table);
    }
    setStatus(status, '');
  } catch (error) {
    container.innerHTML = '';
    setStatus(status, error.message);
  }
}

async function loadListings() {
  const status = document.querySelector('#admin-listings-status');
  const container = document.querySelector('#admin-listings-list');
  setStatus(status, 'Loading listings…');
  try {
    const params = new URLSearchParams();
    if (LISTING_SEARCH.value.trim()) params.set('search', LISTING_SEARCH.value.trim());
    if (LISTING_STATUS_FILTER.value) params.set('status', LISTING_STATUS_FILTER.value);
    const data = await adminRequest(`/api/admin/listings?${params}`);
    if (!data.listings.length) {
      container.innerHTML = '<p class="admin-empty-state">No listings match these filters.</p>';
    } else {
      const table = document.createElement('table');
      table.className = 'admin-table';
      table.innerHTML = `
        <thead><tr><th>Listing</th><th>Owner</th><th>Price</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead>
        <tbody></tbody>
      `;
      const body = table.tBodies[0];
      data.listings.forEach((listing) => {
        const row = document.createElement('tr');
        const listingCell = document.createElement('td');
        const listingTitle = document.createElement('strong');
        listingTitle.textContent = listing.title;
        const listingLocation = document.createElement('small');
        listingLocation.textContent = listing.location || 'Location unknown';
        listingCell.append(listingTitle, listingLocation);
        const ownerCell = document.createElement('td');
        const ownerName = document.createElement('strong');
        ownerName.textContent = listing.owner_name || 'Unassigned';
        const ownerEmail = document.createElement('small');
        ownerEmail.textContent = listing.owner_email || '';
        ownerCell.append(ownerName, ownerEmail);
        const priceCell = document.createElement('td');
        priceCell.textContent = formatPrice(listing.monthly_price, listing.currency);
        const statusCell = document.createElement('td');
        const statusSelect = document.createElement('select');
        statusSelect.className = 'admin-inline-select';
        ['draft', 'published', 'archived'].forEach((statusName) => {
          const option = document.createElement('option');
          option.value = statusName;
          option.textContent = statusName[0].toUpperCase() + statusName.slice(1);
          option.selected = listing.status === statusName;
          statusSelect.append(option);
        });
        statusCell.append(statusSelect);
        const dateCell = document.createElement('td');
        dateCell.textContent = formatDate(listing.updated_at);
        const actionCell = document.createElement('td');
        const save = createActionButton('Update', 'admin-action-button', async () => {
          save.disabled = true;
          try {
            await adminRequest(`/api/admin/listings/${listing.id}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: statusSelect.value }),
            });
            setStatus(status, 'Listing status updated.');
            await Promise.all([loadOverview(), loadListings()]);
          } catch (error) {
            setStatus(status, error.message);
            save.disabled = false;
          }
        });
        actionCell.append(save);
        row.append(listingCell, ownerCell, priceCell, statusCell, dateCell, actionCell);
        body.append(row);
      });
      container.replaceChildren(table);
    }
    setStatus(status, '');
  } catch (error) {
    container.innerHTML = '';
    setStatus(status, error.message);
  }
}

async function loadInquiries() {
  const status = document.querySelector('#admin-inquiries-status');
  const container = document.querySelector('#admin-inquiries-list');
  setStatus(status, 'Loading inquiries…');
  try {
    const data = await adminRequest('/api/admin/inquiries');
    if (!data.inquiries.length) {
      container.innerHTML = '<p class="admin-empty-state">No student inquiries have been submitted.</p>';
    } else {
      container.replaceChildren(...data.inquiries.map((inquiry) => {
        const item = document.createElement('article');
        item.className = 'admin-inquiry-card';
        const heading = document.createElement('div');
        heading.className = 'admin-inquiry-heading';
        const headingText = document.createElement('div');
        const title = document.createElement('h3');
        title.textContent = inquiry.listing_title;
        const sender = document.createElement('p');
        sender.textContent = `${inquiry.student_name} · ${inquiry.student_email}`;
        headingText.append(title, sender);
        const statusPill = document.createElement('span');
        statusPill.className = `status-pill status-${inquiry.status}`;
        statusPill.textContent = inquiry.status;
        heading.append(headingText, statusPill);
        const message = document.createElement('p');
        message.className = 'admin-inquiry-message';
        message.textContent = inquiry.message;
        const meta = document.createElement('p');
        meta.className = 'admin-inquiry-meta';
        meta.textContent = `Landlord: ${inquiry.owner_name || 'Unassigned'} · ${formatDate(inquiry.created_at)}`;
        item.id = `inquiry-${inquiry.id}`;
        item.append(heading, message, meta, window.createInquiryChat({ id: inquiry.id }));
        return item;
      }));
    }
    setStatus(status, '');
  } catch (error) {
    container.innerHTML = '';
    setStatus(status, error.message);
  }
}

let userSearchTimer;
let listingSearchTimer;
USER_SEARCH.addEventListener('input', () => {
  window.clearTimeout(userSearchTimer);
  userSearchTimer = window.setTimeout(loadUsers, 300);
});
USER_ROLE_FILTER.addEventListener('change', loadUsers);
LISTING_SEARCH.addEventListener('input', () => {
  window.clearTimeout(listingSearchTimer);
  listingSearchTimer = window.setTimeout(loadListings, 300);
});
LISTING_STATUS_FILTER.addEventListener('change', loadListings);

async function initializeAdminDashboard() {
  try {
    const session = await adminRequest('/api/auth/me');
    if (session.user?.role !== 'admin') {
      window.location.replace(session.user?.role === 'landlord'
        ? 'landlord-dashboard.html'
        : session.user?.role === 'student'
          ? 'student-dashboard.html'
          : 'login.html');
      return;
    }
    await Promise.all([loadOverview(), loadUsers(), loadListings(), loadInquiries()]);
    setStatus(ADMIN_STATUS, '');
  } catch (error) {
    setStatus(ADMIN_STATUS, error instanceof TypeError
      ? 'Cannot reach the Boarda backend. Start it and refresh this page.'
      : error.message);
  }
}

initializeAdminDashboard();
