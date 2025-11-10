// doctor-ui/public/my-messages.js — supporta: pat↔doc, thread di report, doc↔doc (peer) anche senza cronologia

const API = 'http://localhost:4001';
const token = localStorage.getItem('token');
const H = () => ({ Authorization: `Bearer ${token}` });

const ui = {
  list:  document.getElementById('threadList'),
  head:  document.getElementById('threadHeader'),
  box:   document.getElementById('messages'),
  text:  document.getElementById('composerText'),
  send:  document.getElementById('sendBtn'),
};

const q = new URLSearchParams(location.search);
const prePid  = q.get('patientId') || null;
const preRid  = q.get('reportId')  || null;
const prePeer = q.get('withDoctorId') || null;

let all = [];
let grouped = new Map();
let currentKey = null;

// chiavi thread
const K_PAT = pid => `pat:${pid}`;                // dottore ↔ paziente (general)
const K_REP = rid => `rep:${rid}`;                // thread report
const K_DD  = (pid,peer) => `dd:${pid}:${peer}`;  // dottore ↔ dottore (sullo stesso paziente)

const isPat = k => k?.startsWith('pat:');
const isRep = k => k?.startsWith('rep:');
const isDD  = k => k?.startsWith('dd:');

const fmt = s => { try { return new Date(s).toLocaleString(); } catch { return s; } };

function group() {
  grouped = new Map();
  for (const m of all) {
    let key;
    if (m.type === 'docdoc' && m.otherDoctorId) {
      key = K_DD(m.patientId, m.otherDoctorId);
    } else if (m.reportId) {
      key = K_REP(m.reportId);
    } else {
      key = K_PAT(m.patientId);
    }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(m);
  }
  for (const arr of grouped.values()) arr.sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
}

function unread(list){ return list.filter(m => m.toMe && !m.readAt).length; }

function renderThreads() {
  if (!grouped.size) { ui.list.innerHTML = `<div class="thread-item">No messages yet.</div>`; return; }
  const out = [];
  for (const [k, arr] of grouped) {
    const last = arr[arr.length-1];
    const u = unread(arr);

    let title = 'Conversation';
    if (isPat(k)) {
      const one = arr.find(x => x.patientName || x.patientEmail);
      title = (one?.patientName || one?.patientEmail || 'Patient');
    } else if (isRep(k)) {
      const first = arr[0];
      title = `Report: ${first?.reportName || first?.reportId || ''}`;
    } else if (isDD(k)) {
      const one = arr.find(x => x.otherDoctorName || x.otherDoctorEmail);
      const pat = arr.find(x => x.patientName || x.patientEmail);
      title = `Dr. ${one?.otherDoctorName || (one?.otherDoctorEmail || 'Doctor')}` +
              `${pat ? ` — ${pat.patientName || pat.patientEmail}` : ''}`;
    }

    out.push(`
      <div class="thread-item ${k===currentKey?'active':''} ${u?'unread':''}" data-key="${k}">
        <div class="thread-title">${title}</div>
        <div class="thread-sub">${last ? (last.text.length>40?last.text.slice(0,40)+'…':last.text) : '—'}
          ${u?` &middot; <strong>${u} new</strong>`:''}
        </div>
      </div>
    `);
  }
  ui.list.innerHTML = out.join('');
}

function renderCurrent() {
  if (!currentKey) {
    ui.head.textContent = 'Select a conversation.'; ui.box.innerHTML=''; ui.text.disabled=true; ui.send.disabled=true; return;
  }
  // anche se il thread non esiste ancora, prepariamo una vista vuota
  const arr = grouped.get(currentKey) || [];

  // header
  if (isPat(currentKey)) {
    // senza dati, mostra titolo generico
    const one = arr.find(x => x.patientName || x.patientEmail);
    ui.head.textContent = one?.patientName || one?.patientEmail || 'Patient conversation';
  } else if (isRep(currentKey)) {
    const first = arr[0];
    ui.head.textContent = `Thread for report ${first?.reportName || first?.reportId || preRid || ''}`;
  } else if (isDD(currentKey)) {
    const one = arr.find(x => x.otherDoctorName || x.otherDoctorEmail);
    ui.head.textContent = `Doctor-to-doctor chat ${one ? `with Dr. ${one.otherDoctorName || one.otherDoctorEmail}` : ''}`;
  }

  // messaggi (vuoto = nessuna cronologia)
  ui.box.innerHTML = arr.map(m=>{
    const mine = !!m.fromMe;
    const who = mine
      ? 'You'
      : (m.type==='docdoc'
          ? (`Dr. ${m.otherDoctorName || m.otherDoctorEmail || 'Doctor'}`)
          : (m.patientName || m.patientEmail || 'Patient'));
    const text = String(m.text||'').replace(/</g,'&lt;');
    const isAlert = m.type === 'alert';
    const sev = m.severity || '';
    return `
      <div class="msg ${mine?'me':'pat'}">
        <div class="bubble" ${isAlert ? 'style="border:2px solid #e53935;"' : ''}>
          ${isAlert ? `<strong>⚠️ Alert${sev?` (${sev})`:''}:</strong> ` : ''}${text}
        </div>
        <div class="msg-meta">${who} • ${fmt(m.createdAt)}</div>
      </div>
    `;
  }).join('');

  // abilita composer ANCHE senza history
  ui.text.disabled=false; ui.send.disabled=false;
  ui.box.scrollTop = ui.box.scrollHeight;
}

async function markRead(k){
  try{
    if (!grouped.has(k)) return; // niente da marcare se non esiste cronologia
    if (isRep(k)) {
      const rid = k.split(':',2)[1];
      await fetch(`${API}/my/read-thread/${rid}`, { method:'PUT', headers: H() });
    } else if (isPat(k)) {
      const pid = k.split(':',2)[1];
      await fetch(`${API}/my/read-patient/${pid}`, { method:'PUT', headers: H() });
    } else if (isDD(k)) {
      const [,pid,peer] = k.split(':');
      await fetch(`${API}/my/read-doctor-peer/${pid}/${peer}`, { method:'PUT', headers: H() });
    }
  } catch {}
}

async function load() {
  const r = await fetch(`${API}/my/messages`, { headers: H() });
  if (!r.ok) throw new Error('load failed');
  const rows = await r.json();
  all = rows; // fromMe / toMe già calcolati dal backend
  group();

  // preselezione: preferisci parametri espliciti anche se non esiste history
  if (preRid) currentKey = K_REP(preRid);
  else if (prePid && prePeer) currentKey = K_DD(prePid, prePeer);
  else if (prePid) currentKey = K_PAT(prePid);
  else if (grouped.size) currentKey = [...grouped.keys()][0];
  else currentKey = null;

  renderThreads();
  if (currentKey){
    await markRead(currentKey);
    renderThreads();
    renderCurrent();
  } else {
    renderCurrent();
  }
}

ui.list.addEventListener('click', async e=>{
  const it = e.target.closest('.thread-item');
  if(!it) return;
  currentKey = it.getAttribute('data-key');
  await markRead(currentKey);
  renderThreads();
  renderCurrent();
});

ui.send.addEventListener('click', async ()=>{
  const text = ui.text.value.trim();
  if (!text || !currentKey) return;
  ui.send.disabled=true;
  try{
    let url, body={ text };

    if (isRep(currentKey)) {
      const rid = currentKey.split(':',2)[1];
      // ricava patientId: prima dalla history, altrimenti dai parametri
      const any = (grouped.get(currentKey)||[])[0];
      const pid = any?.patientId || prePid;
      if (!pid) { alert('No patient context'); return; }
      url = `${API}/patients/${pid}/messages`;
      body = { text, reportId: rid };
    } else if (isPat(currentKey)) {
      const pid = currentKey.split(':',2)[1] || prePid;
      if (!pid) { alert('No patient selected'); return; }
      url = `${API}/patients/${pid}/messages`;
      body = { text };
    } else if (isDD(currentKey)) {
      const [,pid,peer] = currentKey.split(':');
      url = `${API}/patients/${pid}/doctors/${peer}/messages`;
      body = { text };
    }

    const r = await fetch(url, {
      method:'POST',
      headers: { 'Content-Type':'application/json', ...H() },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({})); alert(`Send failed: ${e.error || r.statusText}`); return;
    }
    ui.text.value='';
    await load();
    renderCurrent();
  } finally { ui.send.disabled=false; }
});

(async ()=>{ try{ await load(); } catch(e){ console.error(e); ui.list.innerHTML='<div class="thread-item">Error loading.</div>'; renderCurrent(); }})();
