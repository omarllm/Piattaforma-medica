document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.target;

  const body = {
    name: form.name.value,
    email: form.email.value,
    password: form.password.value,
    passwordConfirm: (form.passwordConfirm || form.confirm).value,
    age: form.age.value,
    role: form.role.value
  };

  // Validazione dei campi obbligatori
  if (!body.name || !body.email || !body.password || !body.passwordConfirm || !body.age || !body.role) {
    alert('Please fill in all required fields');
    return;
  }
  if (body.password !== body.passwordConfirm) {
    alert('Passwords do not match');
    return;
  }

  try {
    const res = await fetch('http://localhost:4000/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (res.ok) {
      // (opzionale) memorizzo il token per le chiamate future
      localStorage.setItem('token', data.token);
      // redirect immediato alla login
      window.location.href = 'login.html';
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error('Network error:', error);
    alert('Network error. Try again.');
  }
});