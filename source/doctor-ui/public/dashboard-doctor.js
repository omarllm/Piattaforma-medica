// doctor-ui/public/common.js (includilo in tutte le pagine)
(function() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  const role   = params.get('role');

  if (token && role) {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    // ripulisci la querystring per non mostrarla in URL
    window.history.replaceState({}, "", window.location.pathname);
  }
})();

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || !role || 
    (role !== 'doctor' && window.location.pathname.includes('doctor')) || 
    (role !== 'patient' && window.location.pathname.includes('patient'))) {
  alert("Unauthorized access. Please log in.");
  window.location.href = 'http://localhost:9000/login.html';
}

function logout() {
  localStorage.clear();
  Swal.fire({
    icon: 'info',
    title: 'Logged out',
    text: 'You have been logged out successfully!',
    confirmButtonText: 'OK'
  }).then(() => {
    window.location.href = 'http://localhost:9000/login.html';
  });
}

async function loadUser() {
  const res = await fetch("http://localhost:4000/me", {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    // imposta il nome nella navbar
    document.getElementById("navUser").innerText =
      `Hi, ${data.role === "doctor" ? "Dr. " : ""}${data.name}`;
    // imposta il nome anche nel welcome principale
    document.getElementById("welcomeName").innerText =
      `${data.role === "doctor" ? "Dr. " : ""}${data.name}`;
  } else {
    document.getElementById("navUser").innerText = "Hi, Guest";
  }
}

loadUser();
