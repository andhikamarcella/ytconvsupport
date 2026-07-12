import { formatDate, hideAlert, initShell, setButtonLoading, showAlert } from './common.js';

initShell('status');

const form = document.querySelector('#statusForm');
const input = document.querySelector('#statusTicketId');
const button = document.querySelector('#statusButton');
const alertBox = document.querySelector('#statusAlert');
const resultBox = document.querySelector('#statusResult');

const STATUS_ORDER = ['open', 'in_review', 'waiting_user', 'resolved'];
const STATUS_COPY = {
  open: ['Tiket diterima', 'Laporan berhasil masuk ke sistem.'],
  in_review: ['Sedang diperiksa', 'Tim support sedang meninjau laporan.'],
  waiting_user: ['Menunggu balasan', 'Tim support membutuhkan informasi tambahan.'],
  resolved: ['Selesai', 'Penanganan tiket telah diselesaikan.'],
  closed: ['Ditutup', 'Tiket telah ditutup oleh tim support.']
};

function normalized(value) {
  return String(value || '').trim().toUpperCase();
}

function validTicketId(value) {
  return /^TKT-[A-Z0-9]{10,16}$/.test(value);
}

function timelineHtml(ticket) {
  const current = ticket.status;
  if (current === 'closed') {
    return `
      <div class="timeline-item">
        <div class="timeline-dot active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg></div>
        <div class="timeline-copy"><strong>Tiket diterima</strong><span>${formatDate(ticket.createdAt)}</span></div>
      </div>
      <div class="timeline-item">
        <div class="timeline-dot active"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg></div>
        <div class="timeline-copy"><strong>Ditutup</strong><span>${formatDate(ticket.updatedAt)}</span></div>
      </div>`;
  }

  const currentIndex = Math.max(0, STATUS_ORDER.indexOf(current));
  return STATUS_ORDER.map((status, index) => {
    const active = index <= currentIndex;
    const [title, description] = STATUS_COPY[status];
    const date = index === 0 ? formatDate(ticket.createdAt) : (index === currentIndex ? formatDate(ticket.updatedAt) : description);
    return `
      <div class="timeline-item">
        <div class="timeline-dot ${active ? 'active' : ''}">${active ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 4 4L19 6"/></svg>' : ''}</div>
        <div class="timeline-copy"><strong>${title}</strong><span>${date}</span></div>
      </div>`;
  }).join('');
}

function renderTicket(ticket) {
  resultBox.hidden = false;
  resultBox.innerHTML = `
    <article class="status-card">
      <div class="status-card-head">
        <div>
          <h2></h2>
          <p>Terakhir diperbarui <span data-updated></span></p>
        </div>
        <span class="status-badge"></span>
      </div>
      <div class="status-card-body">
        <div class="status-meta">
          <div class="meta-box"><span>Kategori</span><strong data-category></strong></div>
          <div class="meta-box"><span>Dibuat</span><strong data-created></strong></div>
          <div class="meta-box"><span>Status</span><strong data-status></strong></div>
        </div>
        <div class="public-note" data-note-wrap hidden>
          <span>Catatan tim support</span>
          <p data-note></p>
        </div>
        <div class="timeline" data-timeline></div>
      </div>
    </article>`;

  resultBox.querySelector('h2').textContent = ticket.ticketId;
  resultBox.querySelector('[data-updated]').textContent = formatDate(ticket.updatedAt);
  resultBox.querySelector('[data-category]').textContent = ticket.categoryLabel;
  resultBox.querySelector('[data-created]').textContent = formatDate(ticket.createdAt);
  resultBox.querySelector('[data-status]').textContent = ticket.statusLabel;
  const badge = resultBox.querySelector('.status-badge');
  badge.textContent = ticket.statusLabel;
  badge.classList.add(ticket.status);
  resultBox.querySelector('[data-timeline]').innerHTML = timelineHtml(ticket);

  if (ticket.publicNote) {
    const wrap = resultBox.querySelector('[data-note-wrap]');
    wrap.hidden = false;
    resultBox.querySelector('[data-note]').textContent = ticket.publicNote;
  }
}

async function findTicket(ticketId, updateUrl = true) {
  hideAlert(alertBox);
  resultBox.hidden = true;
  resultBox.textContent = '';
  const id = normalized(ticketId);
  input.value = id;
  if (!validTicketId(id)) {
    showAlert(alertBox, 'Format ID tiket tidak valid. Gunakan format TKT-XXXXXXXXXXXX.', 'error');
    return;
  }

  setButtonLoading(button, true, 'Mencari...');
  try {
    const response = await fetch(`/api/ticket-status?ticket_id=${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Tiket tidak ditemukan.');
    renderTicket(data.ticket);
    if (updateUrl) history.replaceState({}, '', `/ticket-status.html?ticket_id=${encodeURIComponent(id)}`);
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showAlert(alertBox, error.message || 'Tiket tidak dapat diperiksa.', 'error');
  } finally {
    setButtonLoading(button, false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  findTicket(input.value);
});

input.addEventListener('input', () => {
  const caret = input.selectionStart;
  input.value = normalized(input.value);
  input.setSelectionRange(caret, caret);
});

const ticketFromUrl = new URLSearchParams(location.search).get('ticket_id');
if (ticketFromUrl) findTicket(ticketFromUrl, false);
