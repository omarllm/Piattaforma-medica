const API_PATIENT = 'http://localhost:4002';
const FILES_BASE  = 'http://localhost:4001'; // files served by doctor-service

function getAuthHeaders(){
  return { Authorization: `Bearer ${localStorage.getItem('token')||''}` };
}
function toFileHref(url){
  if(!url) return null;
  if(/^https?:\/\//i.test(url)) return url;
  return url.startsWith('/files/') ? `${FILES_BASE}${url}` : url;
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function fmt(d){ try{ return new Date(d).toLocaleString(); }catch{ return d||''; } }

(async () => {
  const ul = document.getElementById('reportList');
  const badge = document.getElementById('unreadBadge');
  if(!ul){ console.warn('#reportList not found'); return; }

  try {
    const res = await fetch(`${API_PATIENT}/my/shared-reports`, { headers: getAuthHeaders() });
    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      ul.innerHTML = `<li class="muted" style="color:red;">Error: ${esc(err.error || res.statusText)}</li>`;
      if(badge) badge.style.display='none';
      return;
    }
    const list = await res.json();

    if(!Array.isArray(list) || list.length===0){
      ul.innerHTML = '<li class="muted">No shared reports yet.</li>';
      if(badge) badge.style.display='none';
      return;
    }

    const unreadCount = list.filter(r=>r.unread).length;
    if(badge){
      if(unreadCount>0){ badge.textContent = unreadCount; badge.style.display='inline-block'; }
      else badge.style.display='none';
    }

    ul.innerHTML = list.map(r=>{
      const href = toFileHref(r.url);
      const note = r.shareMessage ? esc(r.shareMessage) : '—';
      const when = r.sharedAt || r.createdAt;

      const openThreadBtn = `<a class="btn btn--secondary" href="my-messages.html?report=${encodeURIComponent(r._id)}">Open chat</a>`;
      const openFileBtn   = href ? `<a class="btn" href="${href}" target="_blank" rel="noopener">Open file</a>` : '';
      const pdfBtn        = `<a class="btn btn--light" data-pdf href="#">Download PDF</a>`;

      return `
        <li data-report-id="${r._id}">
          <div><strong>${esc(r.filename || r.name || 'Report')}</strong> — ${fmt(when)} ${r.unread ? '<span style="color:red;font-weight:bold;">(NEW)</span>' : ''}</div>
          <div class="muted">Doctor note: ${note}</div>
          <div class="report-actions">
            ${openThreadBtn}
            ${openFileBtn}
            ${pdfBtn}
            <button class="reply-btn">Reply</button>
          </div>
        </li>
      `;
    }).join('');

        // Works even if the list is re-rendered; shows errors if not a real PDF.
        document.addEventListener('click', async (ev) => {
          const btn = ev.target.closest('[data-pdf]');
          if (!btn) return;
          ev.preventDefault();

          const li  = btn.closest('[data-report-id]');
          const rid = li?.getAttribute('data-report-id');
          if (!rid) { alert('Error: reportId missing'); return; }

          // visual feedback
          const prevText = btn.textContent;
          btn.disabled = true; btn.textContent = 'Preparing...';

          try {
            const url = `${API_PATIENT}/my/reports/${encodeURIComponent(rid)}/pdf`;
            const r   = await fetch(url, { headers: getAuthHeaders() });
            const ct  = r.headers.get('content-type') || '';

            if (!r.ok || !ct.includes('application/pdf')) {
              let msg = `HTTP ${r.status}`;
              try { msg = (await r.json()).error || msg; } catch { try { msg = await r.text() || msg; } catch {} }
              alert(`Error: ${msg}`);
              return;
            }

            const blob = await r.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${rid}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch (e) {
            alert(`Download failed: ${e.message}`);
          } finally {
            btn.disabled = false; btn.textContent = prevText;
          }
        });



    ul.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.reply-btn');
      if(!btn) return;
      const li = btn.closest('li[data-report-id]');
      const reportId = li?.getAttribute('data-report-id');
      if(!reportId) return;

      const text = prompt('Write a message to your doctor:');
      if(text==null) return;
      if(!text.trim()){ alert('Message is empty'); return; }

      try{
        const r = await fetch(`${API_PATIENT}/my/messages`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ reportId, text })
        });
        if(!r.ok){
          const err = await r.json().catch(()=>({}));
          alert(`Error sending reply: ${err.error || r.statusText}`);
          return;
        }
        alert('Message sent!');
      }catch(err){
        alert(`Network error: ${err.message}`);
      }
    });

  } catch (e) {
    console.error(e);
    ul.innerHTML = `<li class="muted" style="color:red;">Network error</li>`;
    if(badge) badge.style.display='none';
  }
})();
