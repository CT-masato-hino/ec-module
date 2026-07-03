const form = document.getElementById('login-form');
const submitButton = document.getElementById('login-button');
const errorEl = document.getElementById('login-error');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitButton.disabled = true;

  const formData = new FormData(form);
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'メールアドレスまたはパスワードが正しくありません。');
    }

    window.location.href = '/account';
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : 'ログインに失敗しました。';
    errorEl.hidden = false;
    submitButton.disabled = false;
  }
});
