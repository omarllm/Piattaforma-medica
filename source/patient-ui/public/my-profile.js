const API_PATIENT = 'http://localhost:4002';

function authHeaders(extra={}) {
  return { ...extra, Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
}

function setNavName(){
  const nav = document.getElementById('navUser');
  const name = localStorage.getItem('displayName');
  if (nav && name) nav.textContent = `Hi, ${name}`;
}

async function loadProfile(){
  const r = await fetch(`${API_PATIENT}/my/profile`, { headers: authHeaders() });
  if (!r.ok) return;

  const p = await r.json();
  // cache name for navbar
  localStorage.setItem('displayName', p.name || (p.email ? p.email.split('@')[0] : ''));
  setNavName();

  // contact
  document.getElementById('name').value     = p.name || '';
  document.getElementById('email').value    = p.email || '';
  document.getElementById('phone').value    = p.phone || '';
  document.getElementById('language').value = p.language || 'en';
  document.getElementById('timezone').value = p.timezone || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local');

  // prefs
  const prefs = p.notificationPrefs || {};
  document.getElementById('chanEmail').checked = !!(prefs.channels && prefs.channels.email);
  document.getElementById('chanSms').checked   = !!(prefs.channels && prefs.channels.sms);

  const mode = (prefs.digest && prefs.digest.mode) || 'immediate';
  [...document.querySelectorAll('input[name="digest"]')].forEach(r => r.checked = (r.value === mode));
  document.getElementById('dailyHour').value  = (prefs.digest && (prefs.digest.dailyHour ?? 9));
  document.getElementById('weeklyHour').value = (prefs.digest && (prefs.digest.weeklyHour ?? 9));

  const qh = prefs.quietHours || {};
  document.getElementById('qhEnabled').checked = !!qh.enabled;
  document.getElementById('qhStart').value     = qh.start || '22:00';
  document.getElementById('qhEnd').value       = qh.end || '07:00';
  document.getElementById('qhTz').value        = qh.timezone || 'local';
}

function wireSaves(){
  document.getElementById('saveContact').addEventListener('click', async ()=>{
    const msg = document.getElementById('contactMsg'); msg.textContent = '';
    const body = {
      name:     document.getElementById('name').value.trim(),
      phone:    document.getElementById('phone').value.trim(),
      language: document.getElementById('language').value,
      timezone: document.getElementById('timezone').value.trim()
    };
    const r = await fetch(`${API_PATIENT}/my/profile`, {
      method: 'PUT', headers: authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify(body)
    });
    msg.textContent = r.ok ? 'Saved.' : 'Error saving.';
    if (r.ok) localStorage.setItem('displayName', body.name || localStorage.getItem('displayName') || '');
    setNavName();
  });

  document.getElementById('savePrefs').addEventListener('click', async ()=>{
    const msg = document.getElementById('prefsMsg'); msg.textContent = '';
    const selectedMode = [...document.querySelectorAll('input[name="digest"]')].find(r=>r.checked)?.value || 'immediate';
    const body = {
      channels: {
        inApp: true,
        email: document.getElementById('chanEmail').checked,
        sms:   document.getElementById('chanSms').checked
      },
      digest: {
        mode: selectedMode,
        dailyHour:  Number(document.getElementById('dailyHour').value),
        weeklyDow:  1, // Monday (semplice per ora)
        weeklyHour: Number(document.getElementById('weeklyHour').value)
      },
      quietHours: {
        enabled: document.getElementById('qhEnabled').checked,
        start:   document.getElementById('qhStart').value,
        end:     document.getElementById('qhEnd').value,
        timezone: document.getElementById('qhTz').value.trim() || 'local'
      }
    };
    const r = await fetch(`${API_PATIENT}/my/notification-prefs`, {
      method: 'PUT', headers: authHeaders({ 'Content-Type':'application/json' }),
      body: JSON.stringify(body)
    });
    msg.textContent = r.ok ? 'Preferences saved.' : 'Error saving preferences.';
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{
  setNavName();
  await loadProfile();
  wireSaves();
});

// Espone la funzione al bottone onclick="logout()"
window.logout = function () {
  localStorage.clear();
  sessionStorage.clear();
  location.href = 'http://localhost:9000/login.html';
};
