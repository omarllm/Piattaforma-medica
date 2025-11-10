// doctor-ui/public/patient-profile.js

// ====== Config ======
const API_BASE   = 'http://localhost:4001';
const FILES_BASE = 'http://localhost:4001'; // serve /files/...
const token = localStorage.getItem('token');

// ====== Guard auth ======
if (!token) {
  alert('Please log in.');
  window.location.href = 'http://localhost:9000/login.html';
}

// ====== Helpers ======
const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');


let allReports = []; // cache completa per filtrare in UI

if (!patientId) {
  alert('Missing patient ID.');
  window.history.back();
}

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${token}` };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]
  ));
}

function toFileHref(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/files/') ? `${FILES_BASE}${url}` : url;
}

async function setNavbarUser(){
  const el = document.getElementById('navUser');
  if (!el) return;
  try {
    const res = await fetch('http://localhost:4000/me', { headers: authHeaders() });
    if (!res.ok) return;
    const me = await res.json();
    const base = me.name ?? (me.email ? me.email.split('@')[0] : '');
    el.textContent = `Hi, ${me.role === 'doctor' ? 'Dr. ' : ''}${base}`;
  } catch {}
}

// ====== RENDER ======
function renderPatientCard(p, summary){
  const holder = document.getElementById('patient');
  const lines = [
    `<div><strong>Email:</strong> ${escapeHtml(p.email)}</div>`,
    `<div><strong>Name:</strong> ${escapeHtml(p.name ?? '')}</div>`,
    `<div><strong>Age:</strong> ${escapeHtml(p.age ?? '')}</div>`,
    `<div><strong>Total reports:</strong> <span id="totalReports">${summary?.totalReports ?? 0}</span></div>`
  ];
  holder.innerHTML = lines.join('\n');
}

function renderReports(list){
  const ul = document.getElementById('reports');
  if (!ul) return;

  if (!Array.isArray(list) || list.length === 0) {
    ul.innerHTML = '<li>No reports available.</li>';
    return;
  }

  ul.innerHTML = list.map(r => {
    const href     = toFileHref(r.url);
    const shared   = !!r.shared;
    const sharedAt = r.sharedAt ? new Date(r.sharedAt).toLocaleString() : null;

    // note di condivisione + nota di upload
    const shareNote  = (r.shareMessage || r.share_note || '').toString().trim();
    const uploadNote = (r.comment || r.note || r.notes || r.doctorNote || r.description || '').toString().trim();

    return `
      <li data-report-id="${escapeHtml(r._id)}" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="title">
            <strong>${escapeHtml(r.originalName || r.filename || 'Report')}</strong>
            ${href ? ` — <a href="${escapeHtml(href)}" target="_blank" rel="noopener">Open file</a>` : ''}
          </div>
          <div class="sub">
            ${r.sector ? `Sector: ${escapeHtml(r.sector)} • ` : ''}Uploaded: ${new Date(r.createdAt).toLocaleString()}
            ${shared ? ` • Shared${sharedAt ? ` (${escapeHtml(sharedAt)})` : ''}${shareNote ? ` — Note (from share): ${escapeHtml(shareNote)}` : ''}` : ''}
          </div>
          ${uploadNote ? `<div class="sub">Note (from upload): ${escapeHtml(uploadNote)}</div>` : ''}
        </div>

        <div class="actions">
          <button class="btn open-report" data-report="${escapeHtml(r._id)}" data-href="${escapeHtml(href || '')}">
            <i class="fa-regular fa-folder-open"></i>Open
          </button>
          <button class="btn btn--danger delete-report" data-report="${escapeHtml(r._id)}">
            <i class="fa-regular fa-trash-can"></i>Delete
          </button>
          <button class="btn share-report" data-report="${escapeHtml(r._id)}">
            <i class="fa-regular fa-share-from-square"></i>${shared ? 'Unshare' : 'Share'}
          </button>
          <button class="btn btn--primary open-chat" data-report="${escapeHtml(r._id)}">
            <i class="fa-regular fa-comment-dots"></i>Open chat
          </button>
          <button class="btn alert-patient" data-report="${escapeHtml(r._id)}">
            <i class="fa-solid fa-triangle-exclamation"></i>Notify bad findings
          </button>
        </div>
      </li>
    `;
  }).join('');
}



// ====== LOAD PROFILE ======
async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/profile`, { headers: authHeaders() });
    if (res.status === 401) { window.location.href = 'http://localhost:9000/login.html'; return; }
    if (res.status === 403) { alert('You are not allowed to view this patient.'); return; }
    if (!res.ok) { alert(`Error: ${res.status}`); return; }

    const data = await res.json();
    renderPatientCard(data.patient, data.summary);
    renderReports(data.reports);
    allReports = Array.isArray(data.reports) ? data.reports : [];
    buildSectorFilter(allReports);
    wireSectorFilter();
    wireOpenReport(); 
    wireDelete();
    wireShare();
    wireOpenChatButtons();
    wireAlertButtons();     // <— ADESSO ESISTE
    renderOtherDoctors([]);   // placeholder
    loadOtherDoctors();       // fetch effettivo
  } catch (err) {
    console.error(err);
    alert('Error loading profile');
  }
}

// ====== UPLOAD ======
function wireUpload() {
  const form = document.getElementById('uploadForm');
  const msg  = document.getElementById('uploadMsg');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    const file = document.getElementById('file').files[0];
    const comment = document.getElementById('comment').value.trim();
    const sector = document.getElementById('sector')?.value || '';

    if (!file) {
      msg.textContent = 'Please choose a file.';
      return;
    }

    const doctorName = localStorage.getItem('username') || localStorage.getItem('email') || 'Unknown Doctor';

    const fd = new FormData();
    fd.append('file', file);
    if (comment) fd.append('comment', comment);
    if (sector) fd.append('sector', sector);
    fd.append('doctorName', doctorName);


    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/reports`, {
        method: 'POST',
        headers: authHeaders(),
        body: fd
      });

      if (!res.ok) {
        const e = await res.json().catch(()=>({}));
        msg.textContent = `Upload failed: ${e.error || res.statusText}`;
        return;
      }
      msg.textContent = 'Uploaded!';
      (document.getElementById('file').value = '');
      (document.getElementById('comment').value = '');
      await loadProfile();
    } catch (err) {
      console.error(err);
      msg.textContent = 'Upload error.';
    }
  });
}

// ====== OPEN REPORT ======
// (ora il bottone "Open" apre direttamente il file, quindi questa funzione non serve più)
function wireOpenReport(){
  const ul = document.getElementById('reports');
  if (!ul) return;
  if (ul._openWired) return;   // evita doppie bind
  ul._openWired = true;

  ul.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-report');
    if (!btn) return;

    // 1) usa data-href se presente
    let href = btn.getAttribute('data-href');
    // 2) fallback: cerca un link nella riga titolo
    if (!href) {
      const li = btn.closest('li');
      href = li?.querySelector('.title a')?.href || '';
    }

    if (href) {
      window.open(href, '_blank', 'noopener');
    } else {
      alert('No file URL for this report.');
    }
  });
}


// ====== DELETE ======
function wireDelete() {
  const ul = document.getElementById('reports');
  if (!ul) return;

  // evita doppi listener
  if (ul._deleteWired) return;
  ul._deleteWired = true;

  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-report');
    if (!btn) return;

    const li = e.target.closest('li');
    const reportId = li?.getAttribute('data-report-id');
    if (!reportId) return;

    if (!confirm('Delete this report?')) return;

    try {
      const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}`, {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Delete failed: ${err.error || res.statusText}`);
        return;
      }
      await loadProfile(); // ricarica lista
    } catch (err) {
      console.error(err);
      alert('Delete error.');
    }
  });
}


// ====== SHARE / UNSHARE ======
function wireShare(){
  const ul = document.getElementById('reports');
  if (!ul) return;

  // evita doppi listener
  if (ul._shareWired) return;
  ul._shareWired = true;

  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('.share-report');
    if (!btn) return;

    const li = e.target.closest('li');
    const reportId = li?.getAttribute('data-report-id');
    if (!reportId) return;

    // Toggle: se il bottone dice "Unshare" -> shared=false; se "Share" -> true
    const makeShared = btn.textContent.trim().toLowerCase() === 'share';

    let message = '';
    if (makeShared) {
      message = prompt('Optional: add a note to the patient (visible in patient app):', '') || '';
    }

    try {
      const res = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}/share`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ shared: makeShared, message })
      });
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        alert(`Update failed: ${err.error || res.statusText}`);
        return;
      }
      await loadProfile(); // ricarica lista
    } catch (err) {
      console.error(err);
      alert('Share error.');
    }
  });
}

// ====== OPEN CHAT BUTTONS ======
function wireOpenChatButtons(){
  // Bottone in alto (sostituisce "Message patient")
  const top = document.getElementById('openChatBtn');
  if (top) {
    top.addEventListener('click', () => {
      window.location.href = `my-messages.html?patientId=${encodeURIComponent(patientId)}`;
    });
  }

  // Bottoni nelle card "Reports" — aprono il thread del report (se presente)
  const ul = document.getElementById('reports');
  ul?.addEventListener('click', (e) => {
    const btn = e.target.closest('.open-chat');
    if (!btn) return;
    const rep = btn.getAttribute('data-report');
    const url = rep
      ? `my-messages.html?patientId=${encodeURIComponent(patientId)}&reportId=${encodeURIComponent(rep)}`
      : `my-messages.html?patientId=${encodeURIComponent(patientId)}`;
    window.location.href = url;
  });
}

// ====== ALERT BUTTONS (FIX) ======
function wireAlertButtons(){
  const ul = document.getElementById('reports');
  if (!ul) return;

  // usa un flag dedicato, non _deleteWired
  if (ul._alertWired) return;
  ul._alertWired = true;

  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('.alert-patient');
    if (!btn) return;

    const li = e.target.closest('li');
    const reportId = li?.getAttribute('data-report-id');
    if (!reportId) return;

    const severity = (prompt('Severity? (low | medium | high)', 'high') || 'high').toLowerCase();
    if (!['low','medium','high'].includes(severity)) { alert('Invalid severity'); return; }
    const message = prompt('Optional message to the patient:', '') || '';

    try {
      const r = await fetch(`${API_BASE}/reports/${encodeURIComponent(reportId)}/alert`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ severity, message })
      });

      // fallback opzionale se l'endpoint non esistesse nel backend
      if (r.status === 404) {
        const text = `⚠️ ${severity.toUpperCase()} finding on a report.${message ? ` Note: ${message}` : ''}`;
        const rr = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/messages`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ text })
        });
        if (!rr.ok) {
          const ejson = await rr.json().catch(()=>({}));
          alert(`Notify failed: ${ejson.error || rr.statusText}`);
          return;
        }
        alert('Notification sent to patient (via chat).');
        return;
      }

      if (!r.ok) {
        const ejson = await r.json().catch(()=>({}));
        alert(`Notify failed: ${ejson.error || r.statusText}`);
        return;
      }

      alert('Notification sent to patient.');
    } catch (err) {
      console.error(err);
      alert('Notify error.');
    }
  });
}

function renderOtherDoctors(list){
  const ul = document.getElementById('otherDocs');
  if (!ul) return;
  if (!Array.isArray(list) || list.length === 0) {
    ul.innerHTML = '<li class="muted">No other doctors found.</li>';
    return;
  }

  ul.innerHTML = list.map(d => {
  const display = d.name || (d.email ? d.email.split('@')[0] : 'Doctor');
  const mailto = d.email ? `mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent('Patient case discussion')}` : null;
return `
  <li style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
    <div>
      <div class="title">${escapeHtml(d.name || (d.email ? d.email.split('@')[0] : 'Doctor'))}</div>
      <div class="sub">${escapeHtml(d.email || '')}</div>
    </div>
    <div class="actions">
      <button class="btn btn--soft copy-mail" data-mail="${escapeHtml(d.email)}">
        <i class="fa-regular fa-copy"></i>Copy
      </button>
      <a class="btn" href="mailto:${encodeURIComponent(d.email)}">
        <i class="fa-regular fa-envelope"></i>Email
      </a>
      <a class="btn" href="my-messages.html?patientId=${encodeURIComponent(patientId)}&withDoctorId=${encodeURIComponent(d._id)}">
        <i class="fa-regular fa-comment-dots"></i>Chat
      </a>
    </div>
  </li>
`;
}).join('');


  // wire "Copy email"
  ul.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy-mail');
    if (!b) return;
    const mail = b.getAttribute('data-mail');
    try { await navigator.clipboard.writeText(mail); b.textContent = 'Copied!'; setTimeout(()=>{ b.textContent='Copy email'; }, 1200); }
    catch { alert('Copy failed'); }
  }, { once: true });
}

async function loadOtherDoctors(){
  try{
    const r = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/other-doctors`, {
      headers: authHeaders()
    });
    if (!r.ok) {
      // 403 = non autorizzato a vedere questo paziente
      if (r.status !== 404) console.warn('other-doctors failed', r.status);
      renderOtherDoctors([]);
      return;
    }
    const list = await r.json();
    renderOtherDoctors(list);
  }catch(e){
    console.error(e);
    renderOtherDoctors([]);
  }
}

function buildSectorFilter(list){
  const sel = document.getElementById('sectorFilter');
  if (!sel) return;
  // raccogli i settori distinti (escludi null/empty)
  const set = new Set();
  list.forEach(r => { if (r.sector && String(r.sector).trim()) set.add(String(r.sector).trim()); });
  const current = sel.value;
  sel.innerHTML = `<option value="">All sectors</option>` +
    [...set].sort().map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  // ripristina eventuale selezione
  if ([...set].includes(current)) sel.value = current;
}

function wireSectorFilter(){
  const sel = document.getElementById('sectorFilter');
  const reset = document.getElementById('resetFilter');
  if (!sel) return;

  sel.addEventListener('change', () => {
    const v = sel.value;
    const filtered = v ? allReports.filter(r => (r.sector||'').toLowerCase() === v.toLowerCase()) : allReports;
    renderReports(filtered);
    // riattiva i listener dei pulsanti dopo il re-render
    wireOpenReport(); wireDelete(); wireShare(); wireOpenChatButtons(); wireAlertButtons?.();
  });

  reset?.addEventListener('click', () => {
    sel.value = '';
    renderReports(allReports);
    wireOpenReport(); wireDelete(); wireShare(); wireOpenChatButtons(); wireAlertButtons?.();
  });
}

// ====== REMINDERS (follow-up) ======
function renderReminders(list){
  const ul = document.getElementById('reminders');
  if (!ul) return;
  if (!Array.isArray(list) || list.length === 0) {
    ul.innerHTML = '<li class="muted">No follow-up plans.</li>';
    return;
  }
  ul.innerHTML = list.map(r => `
    <li 
    data-rid="${r._id}" 
    data-title="${escapeHtml(r.title)}"
    data-sector="${escapeHtml(r.sector || '')}"
    data-frequency-days="${r.frequencyDays}"
    data-next-due-at="${r.nextDueAt || ''}"
    data-last-completed-at="${r.lastCompletedAt || ''}"
    data-active="${r.active ? '1' : '0'}"
    data-notes="${escapeHtml(r.notes || '')}"
    style="margin-bottom:10px;">
      <div><strong>${escapeHtml(r.title)}</strong> — ${escapeHtml(r.sector || 'General')}</div>
      <div>Every <strong>${r.frequencyDays}</strong> days • Next due: <strong>${r.nextDueAt ? new Date(r.nextDueAt).toLocaleString() : '-'}</strong></div>
      <div>Last completed: ${r.lastCompletedAt ? new Date(r.lastCompletedAt).toLocaleString() : '—'} • Status: ${r.active ? '<i class="fa-regular fa-circle-check"></i> Active' : '⏸ Paused'}</div>
      ${r.notes ? `<div class="muted">Notes: ${escapeHtml(r.notes)}</div>` : ''}
      <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
        <button class="r-sendnow btn btn--secondary">Send now</button>
        <button class="r-edit btn">Edit</button>
        <button class="r-complete btn btn--success">Complete</button>
        <button class="r-toggle btn">${r.active ? 'Pause' : 'Resume'}</button>
        <button class="r-delete btn btn--danger">Delete</button>
      </div>
    </li>
  `).join('');
}


async function loadReminders(){
  try{
    const r = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/reminders`, { headers: authHeaders() });
    if (!r.ok) { renderReminders([]); return; }
    const list = await r.json();
    renderReminders(list);
  }catch(e){ console.error(e); renderReminders([]); }
}

function wireCreateReminder(){
  const f = document.getElementById('reminderForm');
  const msg = document.getElementById('rMsg');
  if (!f) return;

  f.addEventListener('submit', async (e)=>{
    e.preventDefault(); msg.textContent='';
    const title = document.getElementById('rTitle').value.trim();
    const sector= document.getElementById('rSector').value.trim();
    const freq  = Number(document.getElementById('rFreq').value);
    const first = document.getElementById('rFirstDue').value ? new Date(document.getElementById('rFirstDue').value).toISOString() : null;
    const notes = document.getElementById('rNotes').value.trim();

    try{
      const r = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/reminders`, {
        method:'POST',
        headers: authHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ title, sector, frequencyDays: freq, firstDueAt: first, notes, sendNow: true })
      });
      if (!r.ok){ const e = await r.json().catch(()=>({})); msg.textContent = `Error: ${e.error || r.statusText}`; return; }
      // reset form
      f.reset();
      msg.textContent = 'Plan created.';
      await loadReminders();
    }catch(err){ console.error(err); msg.textContent='Error creating plan.'; }
  });
}

function wireReminderActions(){
  const ul = document.getElementById('reminders');
  if (!ul) return;

  ul.addEventListener('click', async (e)=>{
    const li = e.target.closest('li[data-rid]');
    if (!li) return;
    const rid = li.getAttribute('data-rid');

    // INVIA ORA
// INVIA ORA (usa /patients/:id/messages)
if (e.target.closest('.r-sendnow')){
  // prendo titolo/settore dai data-* (fallback: parsing se mancassero)
  const title  = li.getAttribute('data-title')
               || (li.querySelector('strong')?.textContent || '').trim();
  const sector = li.getAttribute('data-sector')
               || ((li.innerHTML.match(/—\s([^<]+)/)?.[1] || '').trim());
  if (!title) { alert('Missing title'); return; }

  // costruisci testo 
  const sectorPart = sector ? ` (${sector})` : '';
  const alertMsg = `You are about to send an immediate reminder to the patient:\n\n"${title}${sectorPart}"\n\nProceed?`;
  if (!confirm(alertMsg)) return;

  // POST /patients/:id/messages { text }

  const text = `È il momento di fare: ${title}${sector ? ` (${sector})` : ''}`;

  const resp = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ text })
  });

  if (!resp.ok) {
    const ej = await resp.json().catch(()=>({}));
    alert(`Send now failed${ej.error ? `: ${ej.error}` : ''}`);
    return;
  }

  alert('Reminder sent.');
  return;
}


    // EDIT
    if (e.target.closest('.r-edit')){
      // leggi i valori correnti dall’HTML
      const title = (li.querySelector('strong')?.textContent || '').trim();
      const sectorText = (li.innerHTML.match(/—\s([^<]+)/)?.[1] || 'General').trim();
      const freqText = (li.innerHTML.match(/Every <strong>(\d+)<\/strong> days/)?.[1] || '180');

      // prompt semplice (se hai sweetalert2 puoi usare una modal più bella)
      const newTitle  = prompt('Title', title);              if (newTitle == null) return;
      const newSector = prompt('Sector', sectorText);        if (newSector == null) return;
      const newFreq   = prompt('Frequency days', freqText);  if (newFreq == null) return;

      const res = await fetch(`${API_BASE}/reminders/${encodeURIComponent(rid)}`, {
        method:'PUT',
        headers: authHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ title: newTitle.trim(), sector: newSector.trim(), frequencyDays: Number(newFreq) })
      });
      if (!res.ok){ alert('Update failed'); return; }
      await loadReminders();
      return;
    }

    // COMPLETE
    if (e.target.closest('.r-complete')){
      const r = await fetch(`${API_BASE}/reminders/${encodeURIComponent(rid)}/complete`, {
        method:'POST', headers: authHeaders({ 'Content-Type':'application/json' })
      });
      if (!r.ok){ alert('Complete failed'); return; }
      await loadReminders();
      return;
    }

    // TOGGLE
    if (e.target.closest('.r-toggle')){
      const isPaused = li.textContent.includes('Paused');
      const r = await fetch(`${API_BASE}/reminders/${encodeURIComponent(rid)}`, {
        method:'PUT', headers: authHeaders({ 'Content-Type':'application/json' }),
        body: JSON.stringify({ active: isPaused })
      });
      if (!r.ok){ alert('Update failed'); return; }
      await loadReminders();
      return;
    }

    // DELETE
    if (e.target.closest('.r-delete')){
      if (!confirm('Delete this follow-up plan?')) return;
      const r = await fetch(`${API_BASE}/reminders/${encodeURIComponent(rid)}`, {
        method:'DELETE', headers: authHeaders()
      });
      if (!r.ok){ alert('Delete failed'); return; }
      await loadReminders();
      return;
    }
  });
}




// ====== BOOT ======
document.addEventListener('DOMContentLoaded', () => {
  setNavbarUser();
  loadProfile();
  wireUpload();

  // NEW
  wireCreateReminder();
  wireReminderActions();
  loadReminders();
});
