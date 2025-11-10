const API_BASE   = 'http://localhost:4001';
const FILES_BASE = 'http://localhost:4001';

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) {
  alert('Please log in.');
  window.location.href = 'http://localhost:9000/login.html';
}

const params = new URLSearchParams(window.location.search);
const patientId = params.get('id');
if (!patientId) {
  alert('Missing patient ID.');
  window.history.back();
}

function toFileHref(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/files/') ? `${FILES_BASE}${url}` : url;
}

function renderReports(list) {
  const ul = document.getElementById('reports');
  ul.innerHTML =
    (list || []).map(r => {
      const href = toFileHref(r.url);
      return `
        <li style="margin-bottom:12px;" data-report-id="${r._id}">
          <div><strong>${r.filename || 'Report'}</strong> — ${new Date(r.createdAt).toLocaleString()}</div>
          <div>Comment: ${r.comment || '-'}</div>

          <div style="display:flex; gap:8px; margin-top:6px; align-items:center;">
            ${href ? `<a href="${href}" target="_blank" rel="noopener">Open</a>` : ''}
            <button class="delete-report"
                    style="background:#c62828;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;">
              🗑 Delete
            </button>
          </div>

          <div style="margin-top:10px;padding:10px;border:1px solid #eee;border-radius:8px;">
            <label style="display:inline-flex;gap:8px;align-items:center;">
              <input type="checkbox" class="shareToggle" data-id="${r._id}" ${r.shared ? 'checked' : ''}/>
              Share with patient
            </label>
            <div style="margin-top:6px;">
              <textarea class="shareMsg" data-id="${r._id}" rows="2" style="width:100%;"
                        placeholder="Add an explanation for the patient...">${r.shareMessage || ''}</textarea>
            </div>
            <button class="btnShare" data-id="${r._id}" style="margin-top:6px;">Save share</button>
            ${r.shared ? `<span class="shareInfo" style="margin-left:8px;color:green;">
              Shared ${r.sharedAt ? 'on ' + new Date(r.sharedAt).toLocaleString() : ''}
            </span>` : '<span class="shareInfo" style="margin-left:8px;color:#777;">Not shared</span>'}
          </div>
        </li>
      `;
    }).join('') || '<li>No reports available.</li>';

  wireDelete();
  wireShareHandlers();
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 401) { window.location.href = 'http://localhost:9000/login.html'; return; }
    if (res.status === 403) { alert('You are not allowed to view this patient.'); return; }
    if (!res.ok) { alert(`Error: ${res.status}`); return; }

    const data = await res.json();
    const p = data.patient;

    document.getElementById('patient').innerHTML = `
      <div><strong>Email:</strong> ${p.email}</div>
      <div><strong>Name:</strong> ${p.profile?.fullName ?? '-'}</div>
      <div><strong>Date of Birth:</strong> ${
        p.profile?.dob ? new Date(p.profile.dob).toLocaleDateString() : '-'
      }</div>
      <div><strong>Total reports:</strong> <span id="totalReports">${data.summary.totalReports}</span></div>
    `;

    renderReports(data.reports);
  } catch (err) {
    console.error(err);
    alert('Error loading profile');
  }
}

// --- upload handler ---
function wireUpload() {
  const form = document.getElementById('uploadForm');
  const msg  = document.getElementById('uploadMsg');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('file');
    if (!fileInput || !fileInput.files[0]) {
      alert('Choose a file');
      return;
    }

    const fd = new FormData(form);
    msg.style.color = '#666';
    msg.textContent = 'Uploading...';

    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        msg.style.color = 'red';
        msg.textContent = `Upload failed: ${err.error || res.statusText}`;
        return;
      }

      const { report } = await res.json();
      msg.style.color = 'green';
      msg.textContent = 'Uploaded ✔';

      const ul = document.getElementById('reports');
      const li = document.createElement('li');
      li.style.marginBottom = '10px';
      li.setAttribute('data-report-id', report._id || '');
      const href = toFileHref(report.url);
      li.innerHTML = `
        <div><strong>${report.filename || 'Report'}</strong> — ${new Date(report.createdAt).toLocaleString()}</div>
        <div>Comment: ${report.comment || '-'}</div>
        <div style="display:flex; gap:8px; margin-top:6px; align-items:center;">
          ${href ? `<a href="${href}" target="_blank" rel="noopener">Open</a>` : ''}
          <button class="delete-report" style="background:#c62828;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;">
            🗑 Delete
          </button>
        </div>
        <div style="margin-top:10px;padding:10px;border:1px solid #eee;border-radius:8px;">
          <label style="display:inline-flex;gap:8px;align-items:center;">
            <input type="checkbox" class="shareToggle" data-id="${report._id}" ${report.shared ? 'checked' : ''}/>
            Share with patient
          </label>
          <div style="margin-top:6px;">
            <textarea class="shareMsg" data-id="${report._id}" rows="2" style="width:100%;"
                      placeholder="Add an explanation for the patient...">${report.shareMessage || ''}</textarea>
          </div>
          <button class="btnShare" data-id="${report._id}" style="margin-top:6px;">Save share</button>
          <span class="shareInfo" style="margin-left:8px;color:${report.shared ? 'green' : '#777'};">
            ${report.shared ? `Shared on ${new Date(report.sharedAt || Date.now()).toLocaleString()}` : 'Not shared'}
          </span>
        </div>
      `;
      ul.prepend(li);

      // attacca anche i listener al nuovo elemento
      wireShareHandlers();

      // aggiorna il contatore
      const totalEl = document.getElementById('totalReports');
      if (totalEl) totalEl.textContent = String(parseInt(totalEl.textContent || '0', 10) + 1);

      form.reset();
    } catch (e) {
      console.error(e);
      msg.style.color = 'red';
      msg.textContent = 'Network error during upload';
    }
  });
}

// Delega per i pulsanti Delete
function wireDelete() {
  const ul = document.getElementById('reports');
  if (!ul) return;

  ul.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-report');
    if (!btn) return;

    const li = btn.closest('li[data-report-id]');
    const reportId = li?.getAttribute('data-report-id');
    if (!reportId) return;

    if (!confirm('Delete this report?')) return;

    try {
      const resp = await fetch(`${API_BASE}/reports/${reportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return alert(`Error: ${err.error || resp.statusText}`);
      }

      li.remove();
      const totalEl = document.getElementById('totalReports');
      if (totalEl) totalEl.textContent = String(Math.max(0, parseInt(totalEl.textContent || '0', 10) - 1));
      if (!ul.children.length) ul.innerHTML = '<li>No reports available.</li>';
    } catch (err) {
      console.error(err);
      alert('Network error while deleting');
    }
  });
}

// Handler per Share/Unshare + messaggio
function wireShareHandlers() {
  document.querySelectorAll('.btnShare').forEach(btn => {
    if (btn._wired) return; btn._wired = true;

    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const toggle   = document.querySelector(`.shareToggle[data-id="${id}"]`);
      const textarea = document.querySelector(`.shareMsg[data-id="${id}"]`);
      const infoSpan = btn.parentElement.querySelector('.shareInfo');

      const shared  = !!toggle?.checked;
      const message = (textarea?.value || '').trim();

      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Saving...';

      try {
        const res = await fetch(`${API_BASE}/reports/${id}/share`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ shared, message })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`Share failed: ${err.error || res.statusText}`);
          return;
        }

        if (shared) {
          infoSpan.style.color = 'green';
          infoSpan.textContent = `Shared on ${new Date().toLocaleString()}`;
        } else {
          infoSpan.style.color = '#777';
          infoSpan.textContent = 'Not shared';
        }

        btn.textContent = 'Saved ✔';
        setTimeout(() => btn.textContent = old, 1000);
      } catch (e) {
        console.error(e);
        alert('Network error');
        btn.textContent = old;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  wireUpload();
});
