const form = document.getElementById('login-form');
const submitButton = document.getElementById('login-button');
const errorEl = document.getElementById('login-error');

const LOGIN_RULES = {
  email: ['required', 'email'],
  password: ['required'],
};

const validation = window.FormValidation ? window.FormValidation.attachValidation(form, LOGIN_RULES) : null;

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  if (validation && !validation.validateAll()) {
    return;
  }

  submitButton.disabled = true;
  const originalButtonLabel = submitButton.textContent;
  submitButton.textContent = '送信中…';

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
    submitButton.textContent = originalButtonLabel;
  }
});
