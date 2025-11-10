// doctor-ui/public/bootstrap-auth.js
(function () {
  const qs = new URLSearchParams(location.search);
  const t  = qs.get('token');
  const r  = qs.get('role');

  // Se arriviamo dal login con ?token=...&role=...
  if (t && r) {
    localStorage.setItem('token', t);
    localStorage.setItem('role',  r);
    // pulisco la query per non lasciare il token in URL
    history.replaceState({}, '', location.pathname);
  }

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const role  = localStorage.getItem('role')  || sessionStorage.getItem('role');

  if (!token || !role) {
    alert('Unauthorized access. Please log in.');
    location.href = 'http://localhost:9000/login.html';
    return;
  }

  // Regola semplice: dashboard-doctor* solo per i medici
  const page = location.pathname.split('/').pop();
  if (page.startsWith('dashboard-doctor') && role !== 'doctor') {
    alert('Doctors only.');
    location.href = 'http://localhost:9000/login.html';
  }
})();
