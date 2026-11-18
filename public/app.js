let currentUser = null;
let allPrints = [];
let activeTab = 'waiting';
let toastTimeout = null;

// DOM Elements
const loadingView = document.getElementById('loadingView');
const authView = document.getElementById('authView');
const dashboardView = document.getElementById('dashboardView');
const userControls = document.getElementById('userControls');
const navUsername = document.getElementById('navUsername');
const navRoleBadge = document.getElementById('navRoleBadge');
const openModModalBtn = document.getElementById('openModModalBtn');
const logoutBtn = document.getElementById('logoutBtn');

const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

const modBanner = document.getElementById('modBanner');
const statWaiting = document.getElementById('statWaiting');
const statPickedUp = document.getElementById('statPickedUp');

const addPrintForm = document.getElementById('addPrintForm');
const waitingTabBtn = document.getElementById('waitingTabBtn');
const pickedUpTabBtn = document.getElementById('pickedUpTabBtn');
const waitingCountBadge = document.getElementById('waitingCountBadge');
const pickedUpCountBadge = document.getElementById('pickedUpCountBadge');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const printsGrid = document.getElementById('printsGrid');
const emptyState = document.getElementById('emptyState');
const emptyStateText = document.getElementById('emptyStateText');

const modModal = document.getElementById('modModal');
const closeModModalBtn = document.getElementById('closeModModalBtn');
const cancelModModalBtn = document.getElementById('cancelModModalBtn');
const modActivateForm = document.getElementById('modActivateForm');
const modCodeInput = document.getElementById('modCodeInput');
const toastEl = document.getElementById('toast');

function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 4000);
}

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function updateUIForUser() {
  loadingView.classList.add('hidden');

  if (!currentUser) {
    authView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    userControls.classList.add('hidden');
    return;
  }

  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  userControls.classList.remove('hidden');

  navUsername.textContent = currentUser.username;
  const isMod = currentUser.role === 'moderator';

  navRoleBadge.textContent = isMod ? 'Moderator' : 'User';
  navRoleBadge.className = `role-badge ${isMod ? 'moderator' : ''}`;

  if (isMod) {
    modBanner.classList.remove('hidden');
    openModModalBtn.classList.add('hidden');
  } else {
    modBanner.classList.add('hidden');
    openModModalBtn.classList.remove('hidden');
  }
}

function renderPrints() {
  const waitingPrints = allPrints.filter((p) => p.status === 'waiting');
  const pickedUpPrints = allPrints.filter((p) => p.status === 'picked_up');

  waitingCountBadge.textContent = waitingPrints.length;
  pickedUpCountBadge.textContent = pickedUpPrints.length;
  statWaiting.textContent = waitingPrints.length;
  statPickedUp.textContent = pickedUpPrints.length;

  const query = searchInput.value.trim().toLowerCase();
  const baseList = activeTab === 'waiting' ? waitingPrints : pickedUpPrints;
  const filtered = query
    ? baseList.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query)) ||
          p.added_by.toLowerCase().includes(query)
      )
    : baseList;

  printsGrid.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    emptyStateText.textContent =
      activeTab === 'waiting'
        ? 'No prints currently waiting for pickup.'
        : 'No prints have been picked up yet.';
    return;
  }

  emptyState.classList.add('hidden');
  const isMod = currentUser && currentUser.role === 'moderator';

  filtered.forEach((print) => {
    const card = document.createElement('article');
    card.className = 'print-card';

    const statusBadge =
      print.status === 'waiting'
        ? '<span class="status-pill status-waiting">Waiting</span>'
        : '<span class="status-pill status-picked-up">Picked Up</span>';

    const descHtml = print.description
      ? `<p class="print-desc">${escapeHtml(print.description)}</p>`
      : '';

    const pickedMeta =
      print.status === 'picked_up' && print.picked_up_at
        ? `<div>Picked up: <strong>${formatDate(print.picked_up_at)}</strong>${
            print.picked_up_by ? ` (by ${escapeHtml(print.picked_up_by)})` : ''
          }</div>`
        : '';

    let modButtons = '';
    if (isMod) {
      const pickupBtn =
        print.status === 'waiting'
          ? `<button class="btn btn-success btn-sm" data-action="pickup" data-id="${print.id}">Mark Picked Up</button>`
          : '';
      const deleteBtn = `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${print.id}">Delete</button>`;
      modButtons = `<div class="print-actions">${pickupBtn}${deleteBtn}</div>`;
    }

    card.innerHTML = `
      <div>
        <div class="print-header">
          <h4 class="print-title">${escapeHtml(print.name)}</h4>
          ${statusBadge}
        </div>
        ${descHtml}
      </div>
      <div>
        <div class="print-meta">
          <div>Added by: <strong>${escapeHtml(print.added_by)}</strong></div>
          <div>Added on: ${formatDate(print.created_at)}</div>
          ${pickedMeta}
        </div>
        ${modButtons}
      </div>
    `;

    printsGrid.appendChild(card);
  });
}

async function loadPrints() {
  try {
    const data = await apiRequest('/api/prints');
    allPrints = data.prints;
    renderPrints();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function initApp() {
  try {
    const data = await apiRequest('/api/auth/me');
    currentUser = data.user;
    updateUIForUser();
    if (currentUser) {
      await loadPrints();
    }
  } catch (err) {
    currentUser = null;
    updateUIForUser();
  }
}

// Auth Tab Switching
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// Login Submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    currentUser = data.user;
    loginForm.reset();
    updateUIForUser();
    await loadPrints();
    showToast(`Welcome back, ${currentUser.username}!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Register Submit
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;

  try {
    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    currentUser = data.user;
    registerForm.reset();
    updateUIForUser();
    await loadPrints();
    showToast('Account created! You are now signed in.');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    allPrints = [];
    updateUIForUser();
    showToast('Signed out.');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Add Print
addPrintForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('printName');
  const descInput = document.getElementById('printDesc');

  try {
    const data = await apiRequest('/api/prints', {
      method: 'POST',
      body: JSON.stringify({
        name: nameInput.value,
        description: descInput.value
      })
    });
    allPrints.unshift(data.print);
    addPrintForm.reset();
    activeTab = 'waiting';
    waitingTabBtn.classList.add('active');
    pickedUpTabBtn.classList.remove('active');
    renderPrints();
    showToast('Print added to Waiting list!');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Queue Tabs
waitingTabBtn.addEventListener('click', () => {
  activeTab = 'waiting';
  waitingTabBtn.classList.add('active');
  waitingTabBtn.setAttribute('aria-selected', 'true');
  pickedUpTabBtn.classList.remove('active');
  pickedUpTabBtn.setAttribute('aria-selected', 'false');
  renderPrints();
});

pickedUpTabBtn.addEventListener('click', () => {
  activeTab = 'picked_up';
  pickedUpTabBtn.classList.add('active');
  pickedUpTabBtn.setAttribute('aria-selected', 'true');
  waitingTabBtn.classList.remove('active');
  waitingTabBtn.setAttribute('aria-selected', 'false');
  renderPrints();
});

searchInput.addEventListener('input', renderPrints);
refreshBtn.addEventListener('click', async () => {
  await loadPrints();
  showToast('Queue refreshed.');
});

// Moderator Actions (Event Delegation)
printsGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);

  if (action === 'pickup') {
    try {
      const data = await apiRequest(`/api/prints/${id}/pickup`, { method: 'PATCH' });
      allPrints = allPrints.map((p) => (p.id === id ? data.print : p));
      renderPrints();
      showToast('Print marked as Picked Up!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else if (action === 'delete') {
    if (!confirm('Are you sure you want to permanently delete this print?')) return;
    try {
      await apiRequest(`/api/prints/${id}`, { method: 'DELETE' });
      allPrints = allPrints.filter((p) => p.id !== id);
      renderPrints();
      showToast('Print deleted.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});

// Moderator Activation Modal
openModModalBtn.addEventListener('click', () => {
  modCodeInput.value = '';
  modModal.classList.remove('hidden');
  modCodeInput.focus();
});

function closeModModal() {
  modModal.classList.add('hidden');
}

closeModModalBtn.addEventListener('click', closeModModal);
cancelModModalBtn.addEventListener('click', closeModModal);
modModal.addEventListener('click', (e) => {
  if (e.target === modModal) closeModModal();
});

modActivateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await apiRequest('/api/auth/activate-moderator', {
      method: 'POST',
      body: JSON.stringify({ code: modCodeInput.value })
    });
    currentUser = data.user;
    closeModModal();
    updateUIForUser();
    renderPrints();
    showToast(data.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

initApp();
