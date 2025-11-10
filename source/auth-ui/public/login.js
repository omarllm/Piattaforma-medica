document.addEventListener("DOMContentLoaded", () => {
  const loginForm   = document.getElementById('loginForm');
  const responseBox = document.getElementById('response');
  const spinner     = document.getElementById('spinner');

  loginForm.addEventListener('submit', async (e) => {
    console.log('*** login handler running on host ***', window.location.host);
    e.preventDefault();
    spinner.style.display = 'block';
    responseBox.innerText = '';

    const email      = e.target.email.value;
    const password   = e.target.password.value;
    const rememberMe = e.target.remember.checked;

    try {
      const res  = await fetch("http://localhost:4000/login", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json(); // leggi sempre prima il body

      if (!res.ok) {
        responseBox.innerText = `Login failed: ${data.error || res.statusText}`;
        return;
      }

      // ✅ salva sempre in localStorage (le tue UI leggono da lì)
      localStorage.setItem('token', data.token);
      localStorage.setItem('role',  data.role);
      localStorage.setItem('email', data.email || email);

      // opzionale: se vuoi rispettare "remember", duplica anche in sessionStorage
      if (!rememberMe) {
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('role',  data.role);
        sessionStorage.setItem('email', data.email || email);
      }

      // ✅ redirect al portale corretto
       if (data.role === 'doctor') {
          window.location.href =
            `http://localhost:9001/dashboard-doctor.html?token=${encodeURIComponent(data.token)}&role=${encodeURIComponent(data.role)}`;
        } else if (data.role === 'patient') {
          window.location.href =
            `http://localhost:9002/dashboard-patient.html?token=${encodeURIComponent(data.token)}&role=${encodeURIComponent(data.role)}`;
        } else {
          window.location.href = 'http://localhost:9000/homepage.html';
        }

    } catch (err) {
      responseBox.innerText = `Login error: ${err.message}`;
    } finally {
      spinner.style.display = 'none';
    }
  });
});
