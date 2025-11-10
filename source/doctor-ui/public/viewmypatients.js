const listEl = document.getElementById('myPatientList');

async function loadMyPatients() {
  try {
    const res = await fetch('http://localhost:4001/my-patients', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const patients = await res.json(); // array di email

    listEl.innerHTML = '';
    patients.forEach(email => {
const li = document.createElement('li');      // niente stili inline qui: ci pensa il CSS a fare la griglia

const span = document.createElement('span');
span.className = 'col-email';
span.textContent = email;
span.title = email;                            // tooltip + ellissi pulite

const btn = document.createElement('button');
btn.className = 'btn btn--outline col-view';  // fa parte della colonna 2
btn.textContent = 'View Profile';
btn.onclick = async () => {
  try {
    const resp = await fetch(
      `http://localhost:4001/patient-id-by-email/${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) { alert('Error finding patient ID'); return; }
    const { _id } = await resp.json();
    window.location.href = `patient-profile.html?id=${_id}`;
  } catch (err) {
    console.error('Error loading profile:', err);
    alert('Error loading profile');
  }
};

const btnRemove = document.createElement('button');
btnRemove.className = 'btn btn--danger col-remove'; // colonna 3, stile coerente
btnRemove.textContent = 'Remove';
btnRemove.onclick = async () => {
  if (!confirm(`Remove ${email} from your patients?`)) return;
  btnRemove.disabled = true;
  try {
    const token = localStorage.getItem('token');
    const r = await fetch(
      `http://localhost:4001/patients/${encodeURIComponent(email)}/remove`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) {
      const err = await r.json();
      console.error('Backend error:', err);
      btnRemove.disabled = false;
      return;
    }
    li.remove();
  } catch (e) {
    console.error('Network error:', e);
    btnRemove.disabled = false;
  }
};

li.append(span, btn, btnRemove);
listEl.appendChild(li);

      listEl.appendChild(li);
    });
  } catch (err) {
    listEl.innerHTML = `<li style="color:red; padding:10px;">Error: ${err.message}</li>`;
  }
}

document.addEventListener('DOMContentLoaded', loadMyPatients);
