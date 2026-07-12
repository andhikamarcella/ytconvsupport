import { formatDate, hideAlert, initShell, setButtonLoading, showAlert, toast } from './common.js';

initShell('admin');

const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginButton = document.querySelector('#loginButton');
const loginAlert = document.querySelector('#loginAlert');
const logoutButton = document.querySelector('#logoutButton');
const refreshButton = document.querySelector('#refreshTickets');
const ticketList = document.querySelector('#ticketList');
const ticketCount = document.querySelector('#ticketCount');
const dashboardAlert = document.querySelector('#dashboardAlert');
const searchInput = document.querySelector('#ticketSearch');
const statusFilter = document.querySelector('#statusFilter');
const pagination = document.querySelector('#pagination');
const previousPage = document.querySelector('#previousPage');
const nextPage = document.querySelector('#nextPage');
const pageInfo = document.querySelector('#pageInfo');
const modal = document.querySelector('#ticketModal');
const closeModal = document.querySelector('#closeModal');
const cancelModal = document.querySelector('#cancelModal');
const updateForm = document.querySelector('#updateForm');
const modalTicketId = document.querySelector('#modalTicketId');
const modalStatus = document.querySelector('#modalStatus');
const modalNote = document.querySelector('#modalNote');
const modalAlert = document.querySelector('#modalAlert');
const saveTicket = document.querySelector('#saveTicket');

const state = { page: 0, limit: 30, total: 0, loading: false, tickets: [] };
let searchTimer;

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  logoutButton.hidden = true;
  refreshButton.disabled = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutButton.hidden = false;
  refreshButton.disabled = false;
}

function statusBadge(ticket) {
  const badge = document.createElement('span');
  badge.className = `status-badge ${ticket.status}`;
  badge.textContent = ticket.statusLabel;
  return badge;
}

function createTicketCard(ticket) {
  const article = document.createElement('article');
  article.className = 'admin-ticket';

  const content = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'admin-ticket-head';
  const id = document.createElement('strong');
  id.textContent = ticket.ticketId;
  head.append(id, statusBadge(ticket));

  const meta = document.createElement('div');
  meta.className = 'admin-ticket-meta';
  const pieces = [
    ticket.name,
    ticket.email,
    ticket.categoryLabel,
    `Dibuat ${formatDate(ticket.createdAt)}`,
    ticket.emailSent ? 'Email terkirim' : 'Email belum terkirim'
  ];
  for (const value of pieces) {
    const span = document.createElement('span');
    span.textContent = value;
    meta.appendChild(span);
  }

  const description = document.createElement('p');
  description.className = 'admin-ticket-description';
  description.textContent = ticket.description;
  content.append(head, meta, description);

  if (ticket.publicNote) {
    const note = document.createElement('div');
    note.className = 'public-note';
    const label = document.createElement('span');
    label.textContent = 'Catatan publik';
    const text = document.createElement('p');
    text.textContent = ticket.publicNote;
    note.append(label, text);
    content.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'admin-ticket-actions';
  const edit = document.createElement('button');
  edit.className = 'secondary-button';
  edit.type = 'button';
  edit.textContent = 'Perbarui';
  edit.addEventListener('click', () => openTicketModal(ticket));
  actions.appendChild(edit);

  article.append(content, actions);
  return article;
}

function renderTickets() {
  ticketList.textContent = '';
  ticketCount.textContent = String(state.total);

  if (!state.tickets.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Belum ada tiket yang sesuai dengan filter.';
    ticketList.appendChild(empty);
  } else {
    state.tickets.forEach((ticket) => ticketList.appendChild(createTicketCard(ticket)));
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  pagination.hidden = state.total <= state.limit;
  pageInfo.textContent = `Halaman ${state.page + 1} dari ${pages}`;
  previousPage.disabled = state.page === 0;
  nextPage.disabled = state.page + 1 >= pages;
}

async function loadTickets(resetPage = false) {
  if (state.loading) return;
  if (resetPage) state.page = 0;
  state.loading = true;
  hideAlert(dashboardAlert);
  refreshButton.disabled = true;
  ticketList.innerHTML = '<div class="empty-state">Memuat tiket...</div>';

  const params = new URLSearchParams({ limit: String(state.limit), offset: String(state.page * state.limit) });
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  if (statusFilter.value) params.set('status', statusFilter.value);

  try {
    const response = await fetch(`/api/admin/tickets?${params}`, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      showLogin();
      throw new Error('Sesi admin sudah berakhir. Silakan masuk kembali.');
    }
    if (!response.ok) throw new Error(data.error || 'Daftar tiket tidak dapat dimuat.');
    state.tickets = data.tickets || [];
    state.total = Number(data.total || 0);
    showDashboard();
    renderTickets();
  } catch (error) {
    ticketList.textContent = '';
    showAlert(dashboardAlert, error.message || 'Daftar tiket tidak dapat dimuat.', 'error');
  } finally {
    state.loading = false;
    refreshButton.disabled = false;
  }
}

async function checkSession() {
  try {
    const response = await fetch('/api/admin/auth', { headers: { Accept: 'application/json' } });
    if (!response.ok) return showLogin();
    showDashboard();
    await loadTickets(true);
  } catch {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(loginAlert);
  const data = new FormData(loginForm);
  const username = String(data.get('username') || '').trim();
  const password = String(data.get('password') || '');
  if (!username || !password) return showAlert(loginAlert, 'Username dan password wajib diisi.', 'error');

  setButtonLoading(loginButton, true, 'Memeriksa...');
  try {
    const response = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Login gagal.');
    loginForm.reset();
    showDashboard();
    toast('Berhasil masuk.', 'success');
    await loadTickets(true);
  } catch (error) {
    showAlert(loginAlert, error.message || 'Login gagal.', 'error');
  } finally {
    setButtonLoading(loginButton, false);
  }
});

logoutButton.addEventListener('click', async () => {
  await fetch('/api/admin/auth', { method: 'DELETE' }).catch(() => {});
  showLogin();
  state.tickets = [];
  ticketList.textContent = '';
  toast('Kamu sudah keluar.', 'success');
});

refreshButton.addEventListener('click', () => loadTickets());
statusFilter.addEventListener('change', () => loadTickets(true));
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadTickets(true), 350);
});
previousPage.addEventListener('click', () => { if (state.page > 0) { state.page -= 1; loadTickets(); } });
nextPage.addEventListener('click', () => { state.page += 1; loadTickets(); });

function openTicketModal(ticket) {
  hideAlert(modalAlert);
  modalTicketId.value = ticket.ticketId;
  modalStatus.value = ticket.status;
  modalNote.value = ticket.publicNote || '';
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeTicketModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

closeModal.addEventListener('click', closeTicketModal);
cancelModal.addEventListener('click', closeTicketModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeTicketModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeTicketModal(); });

updateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(modalAlert);
  setButtonLoading(saveTicket, true, 'Menyimpan...');
  try {
    const response = await fetch('/api/admin/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ticketId: modalTicketId.value,
        status: modalStatus.value,
        publicNote: modalNote.value.trim()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Perubahan tidak dapat disimpan.');
    closeTicketModal();
    toast(data.notificationSent ? 'Status disimpan dan email dikirim.' : 'Status tiket berhasil disimpan.', 'success');
    await loadTickets();
  } catch (error) {
    showAlert(modalAlert, error.message || 'Perubahan tidak dapat disimpan.', 'error');
  } finally {
    setButtonLoading(saveTicket, false);
  }
});

checkSession();
