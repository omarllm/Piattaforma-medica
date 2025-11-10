(function () {
  // 1) Se arrivo dal login con ?token=&role= li salvo e pulisco l’URL
  const qs = new URLSearchParams(location.search);
  const t  = qs.get('token');
  const r  = qs.get('role');
  if (t && r) {
    localStorage.setItem('token', t);
    localStorage.setItem('role',  r);
    history.replaceState({}, '', location.pathname); // rimuove query dall'URL
  }

  // 2) Recupero credenziali
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const role  = localStorage.getItem('role')  || sessionStorage.getItem('role');

  // 3) Se mancano -> login
  if (!token || !role) {
    alert('Unauthorized access. Please log in.');
    location.href = 'http://localhost:9000/login.html';
    return;
  }

  // 4) Gate semplice: pagine "my-*" sono solo per pazienti
  const page = location.pathname.split('/').pop();
  if (page.startsWith('my-') && role !== 'patient') {
    alert('Patients only.');
    location.href = 'http://localhost:9000/login.html';
    return;
  }

  // 5) Helper globale per le fetch con Authorization
  window.getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`
  });
})();
