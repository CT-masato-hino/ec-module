/**
 * フォームのフィールド単位バリデーション共通基盤。
 * novalidate なフォームに対して blur時/送信時にチェックし、フィールド直下にインラインエラーを表示する。
 * ブラウザ標準のバリデーションポップアップや alert() は使わない(UI規約)。
 */
(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizePostalCode(value) {
    return String(value ?? '').trim().replace(/[‐－―ー]/g, '-');
  }

  function digitsOnly(value) {
    return String(value ?? '').replace(/[^0-9]/g, '');
  }

  const validators = {
    required(value) {
      return String(value ?? '').trim().length > 0 ? '' : 'この項目は必須です。';
    },
    email(value) {
      const v = String(value ?? '').trim();
      if (!v) return '';
      return EMAIL_RE.test(v) ? '' : 'メールアドレスの形式が正しくありません。';
    },
    postalCode(value) {
      const v = normalizePostalCode(value);
      if (!v) return '';
      const digits = digitsOnly(v);
      return digits.length === 7 ? '' : '郵便番号は7桁の数字で入力してください。';
    },
    phone(value) {
      const v = String(value ?? '').trim();
      if (!v) return '';
      const digits = digitsOnly(v);
      return digits.length >= 10 && digits.length <= 11 ? '' : '電話番号は10〜11桁の数字で入力してください。';
    },
    minLength(value, len) {
      const v = String(value ?? '');
      if (!v) return '';
      return v.length >= len ? '' : `${len}文字以上で入力してください。`;
    },
  };

  /**
   * @param {HTMLFormElement} form
   * @param {Record<string, Array<string|{type:string, arg?:any}>>} rules フィールド名 -> バリデータ定義の配列
   * @returns {{ validateField, validateAll, clearFieldError, showFieldError }}
   */
  function attachValidation(form, rules) {
    if (!form) return null;
    form.setAttribute('novalidate', 'novalidate');

    function getErrorEl(field) {
      let el = field.parentElement.querySelector(':scope > .field-error');
      if (!el) {
        el = document.createElement('p');
        el.className = 'field-error';
        field.insertAdjacentElement('afterend', el);
      }
      return el;
    }

    function clearFieldError(field) {
      field.classList.remove('is-invalid');
      const el = field.parentElement.querySelector(':scope > .field-error');
      if (el) {
        el.textContent = '';
        el.hidden = true;
      }
    }

    function showFieldError(field, message) {
      field.classList.add('is-invalid');
      const el = getErrorEl(field);
      el.textContent = message;
      el.hidden = false;
    }

    function runRule(rule, value) {
      if (typeof rule === 'string') {
        return validators[rule] ? validators[rule](value) : '';
      }
      if (rule && typeof rule === 'object' && rule.type) {
        const fn = validators[rule.type];
        return fn ? fn(value, rule.arg) : '';
      }
      return '';
    }

    function validateField(name) {
      const field = form.elements.namedItem(name);
      if (!field) return true;
      const fieldRules = rules[name] || [];
      const value = field.value;
      for (const rule of fieldRules) {
        const message = runRule(rule, value);
        if (message) {
          showFieldError(field, message);
          return false;
        }
      }
      clearFieldError(field);
      return true;
    }

    function validateAll() {
      let firstInvalid = null;
      let allValid = true;
      Object.keys(rules).forEach((name) => {
        const ok = validateField(name);
        if (!ok) {
          allValid = false;
          if (!firstInvalid) {
            firstInvalid = form.elements.namedItem(name);
          }
        }
      });
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid.focus();
      }
      return allValid;
    }

    Object.keys(rules).forEach((name) => {
      const field = form.elements.namedItem(name);
      if (!field) return;
      field.addEventListener('blur', () => validateField(name));
      field.addEventListener('input', () => {
        if (field.classList.contains('is-invalid')) validateField(name);
      });
    });

    return { validateField, validateAll, clearFieldError, showFieldError };
  }

  window.FormValidation = { attachValidation, validators, normalizePostalCode, digitsOnly };
})();
