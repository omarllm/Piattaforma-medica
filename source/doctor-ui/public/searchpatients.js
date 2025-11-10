
const listEl   = document.getElementById('patientList');
const searchEl = document.getElementById('searchBar');

let patients = [];       // elenco completo (normalizzato)
let mySet    = new Set(); // email già aggiunte

function normalize(data) {
  if (!Array.isArray(data)) return [];
  return data.map(x => (typeof x === 'string' ? { email: x } : x));
}

function renderList(filter = '') {
  listEl.innerHTML = '';

  const q = (filter || '').toLowerCase();
  const filtered = patients.filter(p => (p.email || '').toLowerCase().includes(q));

  if (filtered.length === 0) {
    listEl.innerHTML = `<li style="color:#999; padding:10px;">No patients</li>`;
    return;
  }

  filtered.forEach(p => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '10px';
    li.style.borderBottom = '1px solid #eee';

    const span = document.createElement('span');
    span.textContent = p.email;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--outline'; 

    // stato iniziale del bottone in base a mySet
    const already = mySet.has(p.email);
    addBtn.textContent = already ? 'Added' : 'Add to my patients';
    addBtn.disabled = already;

    addBtn.onclick = async () => {
      if (addBtn.disabled) return;
      addBtn.disabled = true;
      addBtn.textContent = 'Adding…';
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `http://localhost:4001/patients/${encodeURIComponent(p.email)}/add`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }
        );
        if (response.ok) {
          // aggiorna lo stato locale: da ora è “Added”
          mySet.add(p.email);
          addBtn.textContent = 'Added';
          addBtn.disabled = true;
        } else {
          const err = await response.json().catch(() => ({}));
          console.error('Backend error:', err);
          addBtn.textContent = 'Error';
          addBtn.disabled = false;
        }
      } catch (e) {
        console.error('Network error:', e);
        addBtn.textContent = 'Error';
        addBtn.disabled = false;
      }
    };

    li.append(span, addBtn);
    listEl.appendChild(li);
  });
}

async function loadData() {
  const token = localStorage.getItem('token');

  try {
    // 1) carico i MIEI pazienti (per sapere chi è già "Added")
    const myRes = await fetch('http://localhost:4001/my-patients', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (myRes.ok) {
      const mine = await myRes.json(); // array di email
      mySet = new Set(Array.isArray(mine) ? mine : []);
    } else {
      mySet = new Set();
    }

    // 2) carico TUTTI i pazienti ricercabili
    const res = await fetch('http://localhost:4001/patients/all', {   // <-- cambia in /patients/all
      headers: { 'Authorization': `Bearer ${token}` }
    });


    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = `Error loading patients: ${res.status} ${err.error || res.statusText}`;
      listEl.innerHTML = `<li style="color:red; padding:10px;">${msg}</li>`;
      patients = [];
      return;
    }

    const data = await res.json();
    patients = normalize(data);
    renderList(searchEl.value);
  } catch (err) {
    listEl.innerHTML = `<li style="color:red; padding:10px;">Network error: ${err.message}</li>`;
    patients = [];
  }
}

searchEl.addEventListener('input', e => renderList(e.target.value));
loadData();
