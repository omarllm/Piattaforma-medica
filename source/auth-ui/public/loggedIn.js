// Funzione per ottenere valore da localStorage o sessionStorage
function getStorageItem(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

const token = getStorageItem('token');
const role = getStorageItem('role');

// Se non c'è token, redirect al login
if (!token) {
  window.location.href = 'login.html';
} else {
  const username = role === 'doctor' ? 'Doctor' : 'Patient'; // oppure usa username se salvato
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('welcome-user').innerText = 'Hi, ' + username;
    document.getElementById('user-role').innerText = 'Logged in as: ' + username;
  });
}

function logout() {
  localStorage.clear();
  sessionStorage.clear();
  window.location.href = 'login.html';
}