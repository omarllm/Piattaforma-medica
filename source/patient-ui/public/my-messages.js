// patient-ui/public/my-messages.js — CHAT PAZIENTE (verso patient-service 4002)

const API_PATIENT = 'http://localhost:4002';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`
});

const ui = {
  threadList: document.getElementById('threadList'),
  header:     document.getElementById('threadHeader'),
  messages:   document.getElementById('messages'),
  text:       document.getElementById('composerText'),
  send:       document.getElementById('sendBtn'),
};

let allMessages = [];
let grouped     = new Map();    // key: 'doc:<doctorId>' | 'rep:<reportId>'
let currentKey  = null;

const isDocKey = k => k && k.startsWith('doc:');
const isRepKey = k => k && k.startsWith('rep:');
const keyDoctor = did => `doc:${String(did)}`;
const keyReport = rid => `rep:${String(rid)}`;

const fmtDate = s => { try { return new Date(s).toLocaleString(); } catch { return s; } };
const calcUnread = list => list.filter(x => x.toMe && !x.readAt).length;

function groupMessages() {
  grouped = new Map();
  for (const m of allMessages) {
    const k = m.reportId ? keyReport(m.reportId) : (m.doctorId ? keyDoctor(m.doctorId) : null);
    if (!k) continue;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(m);
  }
  for (const arr of grouped.values()) arr.sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
}

function renderThreads() {
  if (!grouped.size) {
    ui.threadList.innerHTML = `<div class="thread-item muted">No messages yet.</div>`;
    return;
  }

  const html = [];
  for (const [key, arr] of grouped) {
    const last = arr[arr.length - 1];
    const unreadCount = calcUnread(arr);

    // badge: ci sono reminder/alert NON letti in questo thread?
    const hasUnreadReminder = arr.some(m => m.toMe && !m.readAt && m.type === 'reminder');
    const hasUnreadAlert    = arr.some(m => m.toMe && !m.readAt && m.type === 'alert');

    let title = 'Conversation';
    if (isDocKey(key)) {
      const withName = arr.find(x => x.doctorName);
      title = withName?.doctorName || 'Doctor';
    } else if (isRepKey(key)) {
      const first = arr[0];
      title = `Report: ${first?.reportName || first?.reportId || '…'}`;
    }

    const pills = [
      hasUnreadReminder ? `<span class="pill pill--rem">⏰</span>` : '',
      hasUnreadAlert    ? `<span class="pill pill--alert">⚠️</span>` : ''
    ].join(' ');

    html.push(`
      <div class="thread-item ${key===currentKey?'active':''} ${unreadCount ? 'unread' : ''}" data-key="${key}">
        <div class="thread-title">${title} ${pills}</div>
        <div class="thread-sub">
          ${last ? (last.text.length>40 ? last.text.slice(0,40)+'…' : last.text) : '—'}
          ${unreadCount ? ` &middot; <strong>${unreadCount} new</strong>` : ''}
        </div>
      </div>
    `);
  }

  ui.threadList.innerHTML = html.join('');
}


function renderCurrentThread() {
  if (!currentKey || !grouped.has(currentKey)) {
    ui.header.textContent = 'Select a conversation to start chatting.';
    ui.messages.innerHTML = '';
    ui.text.disabled = true; ui.send.disabled = true;
    return;
  }

  const arr = grouped.get(currentKey);

  let title = 'Conversation';
  if (isDocKey(currentKey)) {
    const withName = arr.find(x => x.doctorName);
    title = withName?.doctorName || 'Doctor';
  } else if (isRepKey(currentKey)) {
    const first = arr[0];
    title = `Thread for report ${first?.reportName || first?.reportId || ''}`;
  }
  ui.header.textContent = title;

  ui.messages.innerHTML = arr.map(m => {
    const mine = m.fromMe;
    const who  = mine ? 'You' : (m.doctorName || 'Doctor');
    const safe = String(m.text || '').replace(/</g,'&lt;');

    const isAlert    = m.type === 'alert';
    const isReminder = m.type === 'reminder';
    const sev        = m.severity || '';

    const styleAttr =
      isAlert ? ' style="border:2px solid #e53935;"' :
      (isReminder ? ' style="border:2px solid #1565c0;"' : '');

    const prefix =
      isAlert ? `<strong>⚠️ Alert${sev ? ` (${sev})` : ''}:</strong> ` :
      (isReminder ? `<strong>⏰ Reminder:</strong> ` : '');

    return `
      <div class="msg ${mine ? 'me' : 'doc'}">
        <div class="bubble"${styleAttr}>
          ${prefix}${safe}
        </div>
        <div class="msg-meta">${who} • ${fmtDate(m.createdAt)}</div>
      </div>
    `;
  }).join('');

  ui.text.disabled = false; ui.send.disabled = false;
  ui.messages.scrollTop = ui.messages.scrollHeight;
}

async function markThreadAsRead(key) {
  try {
    if (isRepKey(key)) {
      const rid = key.split(':',2)[1];
      await fetch(`${API_PATIENT}/my/read-thread/${rid}`, {
        method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }
      });
    } else if (isDocKey(key)) {
      const did = key.split(':',2)[1];
      await fetch(`${API_PATIENT}/my/read-doctor/${did}`, {
        method: 'PUT', headers: { 'Content-Type':'application/json', ...authHeaders() }
      });
    }
  } catch {}
}

async function loadMessages() {
  const res = await fetch(`${API_PATIENT}/my/messages`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load messages');
  const raw = await res.json();

  allMessages = raw.map(x => ({
    ...x,
    fromMe: x.senderRole === 'patient',
    toMe:   x.senderRole === 'doctor',
    type: x.type || null,
    severity: x.severity || null
  }));
  groupMessages();
  renderThreads();
}

ui.threadList.addEventListener('click', async (e) => {
  const item = e.target.closest('.thread-item');
  if (!item) return;
  currentKey = item.getAttribute('data-key');
  await markThreadAsRead(currentKey);
  renderThreads();
  renderCurrentThread();
});

ui.send.addEventListener('click', async () => {
  const text = ui.text.value.trim();
  if (!text || !currentKey) return;
  ui.send.disabled = true;
  try {
    const body = { text };

    if (isRepKey(currentKey)) {
      body.reportId = currentKey.split(':',2)[1];
    } else if (isDocKey(currentKey)) {
      body.toDoctorId = currentKey.split(':',2)[1];
    } else {
      alert('Select a doctor conversation first.');
      return;
    }

    const res = await fetch(`${API_PATIENT}/my/messages`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({}));
      alert(`Send failed: ${e.error || res.statusText}`);
      return;
    }
    ui.text.value = '';
    await loadMessages();
    renderCurrentThread();
  } finally { ui.send.disabled = false; }
});

// bootstrap
(async () => {
  try {
    await loadMessages();

    // Se arrivo con ?open=rep:<id> | doc:<id>, seleziona quel thread
    const params = new URLSearchParams(location.search);
    const openKey = params.get('open'); // es: "rep:..." oppure "doc:..."

    if (openKey) {
      const key = String(openKey);
      if (grouped.has(key)) {
        currentKey = key;
        await markThreadAsRead(currentKey);
        renderThreads();
        renderCurrentThread();
      } else {
        renderThreads(); // fallback
      }
    } else {
      renderThreads();
    }
  } catch (e) {
    console.error(e);
    ui.threadList.innerHTML = `<div class="thread-item muted">Error loading messages.</div>`;
  }
})();

