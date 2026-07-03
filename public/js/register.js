const form = document.getElementById('register-form');
const submitButton = document.getElementById('register-button');
const errorEl = document.getElementById('register-error');

const ERROR_MESSAGES = {
  invalid_email: 'メールアドレスの形式が正しくありません。',
  password_too_short: 'パスワードは8文字以上で入力してください。',
  email_already_registered: 'このメールアドレスはすでに登録されています。',
};

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  submitButton.disabled = true;

  const formData = new FormData(form);
  const name = formData.get('name');
  const email = formData.get('email');
  const password = formData.get('password');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(ERROR_MESSAGES[data.error] || '登録に失敗しました。');
    }

    window.location.href = '/account';
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : '登録に失敗しました。';
    errorEl.hidden = false;
    submitButton.disabled = false;
  }
});
