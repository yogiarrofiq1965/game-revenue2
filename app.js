'use strict';

/* ===== Konstanta domain ===== */
const FEE = 1800;
const RATE = { first: 0.5, repeat: 0.4 };
const STORE = 'game-revenue-v1';

/* ===== State ===== */
const blank = () => ({ admins: [], members: [], costs: [], payout: 0, lock: null });
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    const parsed = raw ? JSON.parse(raw) : blank();
    if (parsed.members) {
      parsed.members = parsed.members.map(m => ({ ...m, isPaid: m.isPaid || false }));
    }
    return { ...blank(), ...parsed };
  } catch { return blank(); }
}

const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch (err) { console.error('Gagal menyimpan state:', err); }
};

const id = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
const rp = n => 'Rp ' + (n || 0).toLocaleString('id-ID');
const isLocked = () => state.lock !== null;

/* ===== Helper escape HTML (mencegah XSS) ===== */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

/* ===== Rumus murni ===== */
const salaryOf = m => Math.round(m.deposit * RATE[m.type]);

function metrics() {
  const gross = state.members.reduce((s, m) => s + m.deposit, 0);
  const unpaidSalary = state.members.filter(m => !m.isPaid).reduce((s, m) => s + salaryOf(m), 0);
  const ops = state.costs.reduce((s, c) => s + c.amount, 0);
  const fee = state.payout > 0 ? FEE : 0;
  return { gross, salary: unpaidSalary, ops, fee, net: gross - fee - ops - unpaidSalary };
}

/* ===== Render helper ===== */
const $ = sel => document.querySelector(sel);
const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };

const charts = { deposit: null, composition: null };
const textColor = () => getComputedStyle(document.body).color;

function drawStats() {
  const m = state.lock || metrics();
  
  setText('#sGross', rp(m.gross));
  setText('#sFee', rp(m.fee));
  setText('#sOps', rp(m.ops));
  setText('#sSalary', rp(m.salary));
  setText('#sNet', rp(m.net));

  const badge = $('#lockBadge');
  if (badge) badge.classList.toggle('hidden', !isLocked());
  
  setText('#pageDate', new Date().toLocaleDateString('id-ID',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

function drawSalaryRows() {
  const rows = state.members.map(m => {
    const admin = state.admins.find(a => a.id === m.adminId);
    const status = m.isPaid ? '<span style="color:#10b981">Lunas</span>' : '<span style="color:#f59e0b">Pending</span>';
    return `<tr style="${m.isPaid ? 'opacity: 0.5' : ''}">
      <td>${escapeHtml(admin?.name ?? '—')}</td>
      <td>${escapeHtml(m.name)}</td>
      <td>${m.type === 'first' ? 'Deposit Pertama' : 'Redeposit'}</td>
      <td class="num">${rp(m.deposit)}</td>
      <td class="num">${rp(salaryOf(m))}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
  
  const el = $('#salaryRows');
  if (el) el.innerHTML = rows || '<tr><td colspan="6" class="muted">Belum ada member.</td></tr>';
}

function drawReferral() {
  /* Sinkronisasi select admin tanpa menghapus pilihan user */
  const memberAdmin = $('#memberAdmin');
  if (memberAdmin) {
    const currentValue = memberAdmin.value;
    const admins = state.admins;

    const expectedOptions = admins.map(a => a.id).join('|');
    const currentOptions = Array.from(memberAdmin.options)
      .filter(o => o.value && o.value !== '')
      .map(o => o.value).join('|');

    if (expectedOptions !== currentOptions) {
      memberAdmin.innerHTML =
        `<option value="" disabled ${admins.length ? '' : 'selected'}>-- Pilih Admin --</option>` +
        admins.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      
      if (currentValue && admins.some(a => a.id === currentValue)) {
        memberAdmin.value = currentValue;
      }
    }
  }

  const list = $('#referralList');
  if (!list) return;
  
  list.innerHTML = state.admins.length
    ? state.admins.map(a => {
        const members = state.members.filter(m => m.adminId === a.id);
        const total = members.reduce((s, m) => s + m.deposit, 0);
        const unpaid = members.filter(m => !m.isPaid).reduce((s, m) => s + salaryOf(m), 0);

        const rows = members.map(m => {
          const isPaid = m.isPaid;
          return `<div class="member-row ${isPaid ? 'paid' : ''}">
            <span class="member-name">
              <button type="button" class="check-btn ${isPaid ? 'active' : ''}" data-toggle-paid="${m.id}" title="${isPaid ? 'Batal Lunas' : 'Tandai Lunas'}">
                ${isPaid ? '✓' : ''}
              </button>
              ${escapeHtml(m.name)}
            </span>
            <span class="member-type ${m.type}">
              ${m.type === 'first' ? 'Deposit Pertama' : 'Redeposit'}
            </span>
            <span class="muted">${rp(m.deposit)}</span>
            <span class="member-salary">${rp(salaryOf(m))}</span>
            <button type="button" class="mini" data-del-member="${m.id}">Hapus</button>
          </div>`;
        }).join('');

        return `<div class="ref-admin">
          <header>
            <div>
              <strong>${escapeHtml(a.name)}</strong>
              <div style="font-size:12px; color:var(--muted); margin-top:4px;">
                ${members.length} member · Total Deposit: ${rp(total)}
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">Sisa Gaji</div>
              <strong style="color:${unpaid > 0 ? 'var(--accent)' : '#10b981'}">${rp(unpaid)}</strong>
              <br>
              <button type="button" class="mini" style="margin-top:8px" data-del-admin="${a.id}">Hapus admin</button>
            </div>
          </header>
          <div class="members">${rows || '<span class="muted">Belum ada member.</span>'}</div>
        </div>`;
      }).join('')
    : '<p class="muted">Belum ada admin referral.</p>';
}

function drawCosts() {
  const rows = state.costs.map(c => `<tr>
    <td>${escapeHtml(c.desc)}</td>
    <td class="num">${rp(c.amount)}</td>
    <td><button type="button" class="mini" data-del-cost="${c.id}">Hapus</button></td>
  </tr>`).join('');
  
  const el = $('#costRows');
  if (el) el.innerHTML = rows || '<tr><td colspan="3" class="muted">Belum ada biaya.</td></tr>';
}

function drawPayout() {
  /* Jangan override input saat user sedang mengetik */
  const count = $('#payoutCount');
  if (count && document.activeElement !== count) {
    count.value = state.payout;
  }
  
  setText('#payoutInfo',
    state.payout > 0
      ? `${state.payout}x pencairan · fee flat ${rp(FEE)}`
      : 'Belum ada pencairan hari ini.');
}

function drawCharts() {
  const m = state.lock || metrics();
  const color = textColor();
  const labels = state.admins.map(a => a.name);
  const data = state.admins.map(a =>
    state.members.filter(x => x.adminId === a.id)
      .reduce((s, x) => s + x.deposit, 0));

  const depositCanvas = $('#chartDeposit');
  if (depositCanvas && typeof Chart !== 'undefined') {
    charts.deposit?.destroy();
    charts.deposit = new Chart(depositCanvas, {
      type: 'bar',
      data: { labels, datasets: [{
        data, borderRadius: 8,
        backgroundColor: 'rgba(99, 102, 241, .6)', borderColor: '#6366f1', borderWidth: 1
      }]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color }, grid: { color: 'transparent' } },
          y: { ticks: { color }, grid: { color: 'rgba(148,163,184,.15)' } }
        }
      }
    });
  }

  const compositionCanvas = $('#chartComposition');
  if (compositionCanvas && typeof Chart !== 'undefined') {
    charts.composition?.destroy();
    charts.composition = new Chart(compositionCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Sisa Gaji', 'Biaya Ops', 'Fee', 'Bersih'],
        datasets: [{
          data: [m.salary, m.ops, m.fee, Math.max(m.net, 0)],
          backgroundColor: ['#a855f7', '#f59e0b', '#f472b6', '#22c55e'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color } } }
      }
    });
  }
}

function render() {
  drawStats(); drawSalaryRows(); drawReferral();
  drawCosts(); drawPayout(); drawCharts();
}

/* ================= NAVIGASI & SIDEBAR ================= */
const PAGE_TITLE = {
  dashboard: 'Dashboard', referral: 'Referral & Member',
  costs: 'Biaya Operasional', payout: 'Pencairan'
};

const menuToggle = document.getElementById('menuToggle');
const closeSidebar = document.getElementById('closeSidebar');
const drawerOverlay = document.getElementById('drawerOverlay');
const sidebar = document.getElementById('sidebar');

function toggleSidebar(open) {
  if (!sidebar) return;
  if (open) {
    sidebar.classList.add('open');
    drawerOverlay?.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    drawerOverlay?.classList.remove('active');
  }
}

if (menuToggle) menuToggle.addEventListener('click', e => {
  e.preventDefault();
  toggleSidebar(true);
});
if (closeSidebar) closeSidebar.addEventListener('click', e => {
  e.preventDefault();
  toggleSidebar(false);
});
if (drawerOverlay) drawerOverlay.addEventListener('click', () => toggleSidebar(false));

/* Tutup sidebar dengan tombol Escape */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') toggleSidebar(false);
});

function setPage(name) {
  document.querySelectorAll('#nav button[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
  
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.dataset.page === name));
  
  setText('#pageTitle', PAGE_TITLE[name] || 'Dashboard');

  /* Tutup sidebar di mobile setelah render */
  if (window.innerWidth <= 900) {
    requestAnimationFrame(() => toggleSidebar(false));
  }

  /* Chart harus di-render ulang saat halaman dashboard kembali aktif
     karena ukuran canvas berubah dari display:none */
  if (name === 'dashboard') {
    requestAnimationFrame(() => drawCharts());
  }
}

/* ================= EVENT DELEGATION GLOBAL (TERPADU) ================= */
/*
 * Semua klik ditangani di SATU listener dengan prioritas berurutan.
 * Navigasi diproses PERTAMA dengan stopPropagation agar tidak bentrok
 * dengan handler hapus/toggle-paid.
 */
document.addEventListener('click', e => {
  /* --- PRIORITAS 1: Navigasi sidebar --- */
  const navBtn = e.target.closest('button[data-view]');
  if (navBtn) {
    e.preventDefault();
    e.stopPropagation();
    setPage(navBtn.dataset.view);
    return;
  }

  /* --- PRIORITAS 2: Toggle paid --- */
  const toggleBtn = e.target.closest('[data-toggle-paid]');
  if (toggleBtn) {
    e.preventDefault();
    if (blocked()) return;
    const member = state.members.find(m => m.id === toggleBtn.dataset.togglePaid);
    if (member) {
      member.isPaid = !member.isPaid;
      save(); render();
    }
    return;
  }

  /* --- PRIORITAS 3: Aksi hapus --- */
  const t = e.target.closest('[data-del-admin], [data-del-member], [data-del-cost]');
  if (!t) return;

  if (blocked()) return;

  if (t.dataset.delAdmin) {
    state.admins = state.admins.filter(a => a.id !== t.dataset.delAdmin);
    state.members = state.members.filter(m => m.adminId !== t.dataset.delAdmin);
  } else if (t.dataset.delMember) {
    state.members = state.members.filter(m => m.id !== t.dataset.delMember);
  } else if (t.dataset.delCost) {
    state.costs = state.costs.filter(c => c.id !== t.dataset.delCost);
  } else {
    return;
  }
  save(); render();
});

/* ================= Tema ================= */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(STORE + '-theme', t); } catch {}

  const isDark = t === 'dark';
  document.getElementById('themeDark')?.classList.toggle('active', isDark);
  document.getElementById('themeLight')?.classList.toggle('active', !isDark);

  /* Delay render chart agar browser sempat apply warna baru */
  requestAnimationFrame(() => render());
}

document.getElementById('themeLight')?.addEventListener('click', () => applyTheme('light'));
document.getElementById('themeDark')?.addEventListener('click', () => applyTheme('dark'));

/* ===== Guard saat terkunci ===== */
function blocked() {
  if (isLocked()) {
    alert('Hari ini terkunci. Klik "Hari Baru" untuk reset.');
    return true;
  }
  return false;
}

/* ===== Forms ===== */
$('#adminForm')?.addEventListener('submit', e => {
  e.preventDefault();
  if (blocked()) return;
  const name = $('#adminName').value.trim();
  if (!name) return;
  state.admins.push({ id: id(), name });
  $('#adminName').value = '';
  save(); render();
});

$('#memberForm')?.addEventListener('submit', e => {
  e.preventDefault();
  if (blocked()) return;
  const name = $('#memberName').value.trim();
  const adminId = $('#memberAdmin').value;
  const type = $('#memberType').value;
  const deposit = Number($('#memberDeposit').value);
  if (!name || !adminId || !(deposit > 0)) return;
  state.members.push({ id: id(), name, adminId, type, deposit, isPaid: false });
  $('#memberName').value = '';
  $('#memberDeposit').value = '';
  save(); render();
});

$('#costForm')?.addEventListener('submit', e => {
  e.preventDefault();
  if (blocked()) return;
  const desc = $('#costDesc').value.trim();
  const amount = Number($('#costAmount').value);
  if (!desc || !(amount > 0)) return;
  state.costs.push({ id: id(), desc, amount });
  $('#costDesc').value = '';
  $('#costAmount').value = '';
  save(); render();
});

$('#payoutForm')?.addEventListener('submit', e => {
  e.preventDefault();
  if (blocked()) return;
  state.payout = Math.max(0, Number($('#payoutCount').value) || 0);
  save(); render();
});

/* ===== Snapshot & Reset ===== */
$('#lockBtn')?.addEventListener('click', () => {
  if (isLocked() || !confirm('Kunci angka hari ini?')) return;
  state.lock = metrics();
  save(); render();
  if (window.innerWidth <= 900) toggleSidebar(false);
});

$('#resetBtn')?.addEventListener('click', () => {
  if (!confirm('Reset data harian? Admin referral tetap disimpan.')) return;
  const admins = state.admins;
  state = { ...blank(), admins };
  save(); render();
  if (window.innerWidth <= 900) toggleSidebar(false);
});

/* Auto-lock saat 00:00 */
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0 && !isLocked()) {
    state.lock = metrics(); save(); render();
  }
}, 60_000);

/* ===== Init ===== */
applyTheme(localStorage.getItem(STORE + '-theme') || 'dark');
setPage('dashboard');
render();
