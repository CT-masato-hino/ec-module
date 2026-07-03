const form = document.getElementById('register-form');
const submitButton = document.getElementById('register-button');
const errorEl = document.getElementById('register-error');

const ERROR_MESSAGES = {
  invalid_email: 'メールアドレスの形式が正しくありません。',
  password_too_short: 'パスワードは8文字以上で入力してください。',
  email_already_registered: 'このメールアドレスはすでに登録されています。',
};

const REGISTER_RULES = {
  email: ['required', 'email'],
  password: ['required', { type: 'minLength', arg: 8 }],
};

const validation = window.FormValidation ? window.FormValidation.attachValidation(form, REGISTER_RULES) : null;

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
      if (data.error === 'email_already_registered' && validation) {
        const emailField = form.elements.namedItem('email');
        validation.showFieldError(emailField, 'このメールアドレスは既に登録されています。');
        emailField.scrollIntoView({ behavior: 'smooth', block: 'center' });
        emailField.focus();
        submitButton.disabled = false;
        submitButton.textContent = originalButtonLabel;
        return;
      }
      throw new Error(ERROR_MESSAGES[data.error] || '登録に失敗しました。');
    }

    window.location.href = '/account';
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : '登録に失敗しました。';
    errorEl.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = originalButtonLabel;
  }
});
