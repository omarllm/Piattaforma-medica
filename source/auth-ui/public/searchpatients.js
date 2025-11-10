// source/auth-ui/public/searchpatients.js

const listEl   = document.getElementById('patientList');
const searchEl = document.getElementById('searchBar');
let patients   = [];

function renderList(filter = '') {
  listEl.innerHTML = '';
  patients
    .filter(email => email.toLowerCase().includes(filter.toLowerCase()))
    .forEach(email => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.padding = '10px';
      li.style.borderBottom = '1px solid #eee';

      const span = document.createElement('span');
      span.textContent = email;

      const btn = document.createElement('button');
      btn.textContent = 'Add to my patients';
      btn.style.marginLeft = '10px';
      btn.onclick = async () => {
      btn.disabled = true;
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `http://localhost:4000/patients/${encodeURIComponent(email)}/add`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (response.ok) {
          btn.textContent = 'Added';
        } else {
          const err = await response.json();
          console.error('Backend error:', err);
          btn.textContent = 'Error';
        }
      } catch (err) {
        console.error('Network error:', err);
        btn.textContent = 'Error';
      }
    };

      li.append(span, btn);
      listEl.appendChild(li);
    });
}

async function loadPatients() {
  try {
    const res = await fetch('http://localhost:4000/patients');
    patients = await res.json();
    renderList();
  } catch (err) {
    listEl.innerHTML = `<li style="color:red; padding:10px;">Error loading patients: ${err.message}</li>`;
  }
}

searchEl.addEventListener('input', e => renderList(e.target.value));
loadPatients();
