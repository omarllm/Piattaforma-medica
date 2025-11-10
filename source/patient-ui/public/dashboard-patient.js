const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (
  !token ||
  !role ||
  (role !== 'doctor' && window.location.pathname.includes('doctor')) ||
  (role !== 'patient' && window.location.pathname.includes('patient'))
) {
  alert("Unauthorized access. Please log in.");
  window.location.href = "http://localhost:9000/login.html";
}

function logout() {
  localStorage.clear();
  Swal.fire({
    icon: 'info',
    title: 'Logged out',
    text: 'You have been logged out successfully!',
    confirmButtonText: 'OK'
  }).then(() => {
    window.location.href = 'http://localhost:9000/login.html';
  });
}

async function loadUser() {
  const res = await fetch("http://localhost:4000/me", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    const name = data.name ||
    (data.email ? data.email.split('@')[0] : '');

    document.getElementById("navUser").innerText = `Hi, ${name}`;
    document.getElementById("welcomeName").innerText = name;

  } else {
    document.getElementById("navUser").innerText = "Hi, Guest";
  }
}

loadUser();

// =================== Reminders (bell + popover) ===================
(function(){
  const API_PATIENT = 'http://localhost:4002';

  const bell    = document.getElementById('reminderBell');
  const badge   = document.getElementById('reminderBadge');
  const popover = document.getElementById('reminderPopover');

  if (!bell || !badge || !popover) return;

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });

  const esc = (s) => String(s||'').replace(/[&<>"']/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]
  ));

  // === [NEW] ALERTS (Report “notify bad things”) ===
  async function fetchUnreadAlertsCount() {
    try {
      const r = await fetch(`${API_PATIENT}/my/alerts-count`, { headers: authHeaders() });
      if (!r.ok) return 0;
      const j = await r.json();
      return Number(j.unreadAlerts || 0);
    } catch { return 0; }
  }

  async function fetchUnreadAlerts() {
    // Usiamo /my/messages e filtriamo solo gli alert non letti
    try {
      const r = await fetch(`${API_PATIENT}/my/messages`, { headers: authHeaders() });
      if (!r.ok) return [];
      const all = await r.json();
      return (Array.isArray(all) ? all : [])
        .filter(m => m?.type === 'alert' && !m.readAt)
        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch { return []; }
  }

  function alertSeverityPill(sev) {
    const s = String(sev || 'high').toLowerCase();
    const label = (s === 'low') ? 'LOW' : (s === 'medium' ? 'MED' : 'HIGH');
    return `<span class="pill pill--${s}">${label}</span>`;
  }

  function renderAlertItem(m){
    const when = new Date(m.createdAt).toLocaleString();
    const text = esc(m.text || 'Doctor alert');
    const to   = buildOpenUrl(m);
    const sevPill = alertSeverityPill(m.severity);

    return `
      <button class="item" data-open="${to}">
        <h4 class="title">⚠️ Alert ${sevPill}</h4>
        <div class="meta">${when}${m.doctorName ? ` · <strong>${esc(m.doctorName)}</strong>` : ''}</div>
        <div class="text">${text}</div>
      </button>
    `;
  }

    async function updateReminderBadge(){
    try{
      // Reminders
      let unreadReminders = 0;
      {
        const r = await fetch(`${API_PATIENT}/my/reminders-count`, { headers: authHeaders() });
        if (r.ok) {
          const j = await r.json();
          unreadReminders = Number(j.unreadReminders || 0);
        }
      }

      // Alerts (notify bad things)
      const unreadAlerts = await fetchUnreadAlertsCount();

      const total = unreadReminders + unreadAlerts;
      if (total > 0) {
        badge.textContent = String(total);
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
        badge.textContent = '';
      }
    }catch{
      badge.style.display = 'none';
      badge.textContent = '';
    }
  }

  // --- Carica solo i reminder non letti
  async function fetchUnreadReminders(){
    const r = await fetch(`${API_PATIENT}/my/messages`, { headers: authHeaders() });
    if (!r.ok) return [];
    const all = await r.json();
    return all
      .filter(m => m.type === 'reminder' && m.senderRole === 'doctor' && !m.readAt)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function buildOpenUrl(m){
    if (m?.reportId) return `http://localhost:9002/my-messages.html?open=${encodeURIComponent('rep:'+m.reportId)}`;
    if (m?.doctorId) return `http://localhost:9002/my-messages.html?open=${encodeURIComponent('doc:'+m.doctorId)}`;
    return `http://localhost:9002/my-messages.html`;
  }

  function renderReminderItem(m){
    const when = new Date(m.createdAt).toLocaleString();
    const text = esc(m.text || 'Reminder');
    const to   = buildOpenUrl(m);

    return `
      <button class="item" data-open="${to}">
        <h4 class="title">⏰ Reminder</h4>
        <div class="meta">${when}</div>
        <div class="text">${text}</div>
      </button>
    `;
  }

  function wireReminderClicks(container){
    container.querySelectorAll('.item[data-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const to = btn.getAttribute('data-open');
        window.location.href = to;
      });
    });
  }

  async function openPopover(){
    bell.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    popover.innerHTML = `<div class="empty">Loading…</div>`;

    try{
      const [unreadReminders, unreadAlerts] = await Promise.all([
        fetchUnreadReminders(),
        fetchUnreadAlerts()
      ]);

      if (!unreadReminders.length && !unreadAlerts.length){
        popover.innerHTML = `<div class="empty">No unread notifications.</div>`;
        return;
      }

      // Unifica, ordina per data e renderizza
      const unified = [
        ...unreadReminders.map(m => ({ when: new Date(m.createdAt).getTime(), html: renderReminderItem(m) })),
        ...unreadAlerts.map(m => ({ when: new Date(m.createdAt).getTime(), html: renderAlertItem(m) }))
      ].sort((a,b)=> b.when - a.when);

      popover.innerHTML = `<div class="list">${unified.map(x=>x.html).join('')}</div>`;
      wireReminderClicks(popover); // gestisce .item[data-open] per entrambi
    }catch(e){
      console.error(e);
      popover.innerHTML = `<div class="empty">Error loading notifications.</div>`;
    }
  }

  function closePopover(){
    bell.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
  }

  // Toggle popover
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    if (popover.hidden) openPopover(); else closePopover();
  });
  bell.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bell.click(); }
  });

  // Chiudi clic fuori
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && !bell.contains(e.target)) closePopover();
  });

  // Primo caricamento + refresh periodico del badge
  updateReminderBadge();
  setInterval(updateReminderBadge, 60000);
})();
// =================== My Messages ===================
