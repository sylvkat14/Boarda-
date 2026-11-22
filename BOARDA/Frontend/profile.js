const PROFILE_STATUS = document.querySelector('#profile-status');

async function loadProfile() {
  try {
    const RESPONSE = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const DATA = await RESPONSE.json().catch(() => null);
    if (RESPONSE.status === 401) {
      window.location.replace('/Frontend/login.html');
      return;
    }
    if (!RESPONSE.ok || !DATA?.user) throw new Error(DATA?.error || 'Could not load your profile.');

    const USER = DATA.user;
    document.querySelector('#profile-name').textContent = USER.name;
    document.querySelector('#profile-email').textContent = USER.email;
    document.querySelector('#profile-role').textContent = USER.role === 'landlord' ? 'Landlord' : 'Student';
    const DASHBOARD_LINK = document.querySelector('#profile-dashboard-link');
    DASHBOARD_LINK.href = USER.role === 'landlord' ? 'landlord-dashboard.html' : 'student-dashboard.html';
    DASHBOARD_LINK.hidden = false;
    document.querySelector('#profile-details').hidden = false;
    PROFILE_STATUS.hidden = true;
  } catch (ERROR) {
    PROFILE_STATUS.textContent = ERROR instanceof TypeError
      ? 'Cannot reach Boarda. Start the backend and refresh this page.'
      : ERROR.message;
  }
}

loadProfile();
