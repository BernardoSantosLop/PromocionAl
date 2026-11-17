(() => {
  'use strict';

  const API_KEY = 'AIzaSyDY20bGhShRka1Z9ZGt1_6eSU4qwdFMSJA';
  const FIREBASE_CONFIG = {
    apiKey: API_KEY,
    authDomain: 'promocion-al-voto.firebaseapp.com',
    projectId: 'promocion-al-voto',
    appId: '1:735927435223:web:59b02e9999f6d4e1851592'
  };
  const preparedForms = new WeakSet();
  const preparedUserForms = new WeakSet();
  const approvedSubmissions = new WeakSet();

  const authErrors = {
    EMAIL_EXISTS: 'Ya existe una cuenta con ese correo.',
    INVALID_EMAIL: 'El correo no es válido.',
    OPERATION_NOT_ALLOWED: 'El registro con correo y contraseña no está habilitado en Firebase Authentication.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Se hicieron demasiados intentos. Intenta de nuevo más tarde.',
    WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres.'
  };

  function setAngularValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function showError(form, message) {
    let box = form.querySelector('[data-auth-registration-error]');
    if (!box) {
      box = document.createElement('div');
      box.dataset.authRegistrationError = 'true';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'margin:12px 0;color:#b91c1c;font-weight:600;';
      form.querySelector('.form-acciones')?.before(box) || form.appendChild(box);
    }
    box.textContent = message;
  }

  function clearError(form) {
    const box = form.querySelector('[data-auth-registration-error]');
    if (box) box.textContent = '';
  }

  function prepareForm(uidInput) {
    const form = uidInput.closest('form');
    if (!form || preparedForms.has(form)) return;
    preparedForms.add(form);

    const uidGroup = uidInput.parentElement;
    const recoveryMode = new URLSearchParams(window.location.search).has('recuperarUid');
    uidGroup.style.display = recoveryMode ? '' : 'none';
    uidInput.required = false;

    const article = form.closest('article');
    const description = article?.querySelector('h2 + p');
    if (description) {
      description.textContent = 'Registra un movilizador y asígnalo al seccional responsable. La cuenta de acceso y su UID se crearán automáticamente.';
    }

    const emailInput = form.querySelector('input[name="monitoreoMovilizadorCorreo"]');
    const emailGroup = emailInput?.parentElement;
    if (!emailGroup) return;

    const passwordGroup = emailGroup.cloneNode(false);
    const label = document.createElement('label');
    label.setAttribute('for', 'monitoreoMovilizadorPassword');
    label.textContent = 'Contraseña del movilizador';

    const passwordInput = document.createElement('input');
    for (const attribute of emailInput.attributes) {
      if (attribute.name.startsWith('_ngcontent')) {
        passwordInput.setAttribute(attribute.name, attribute.value);
      }
    }
    passwordInput.type = 'password';
    passwordInput.id = 'monitoreoMovilizadorPassword';
    passwordInput.name = 'monitoreoMovilizadorPassword';
    passwordInput.placeholder = 'Mínimo 6 caracteres';
    passwordInput.autocomplete = 'new-password';
    passwordInput.minLength = 6;
    passwordInput.required = true;

    passwordGroup.append(label, passwordInput);
    emailGroup.after(passwordGroup);
    if (recoveryMode) passwordGroup.style.display = 'none';

    form.addEventListener('submit', async (event) => {
      if (approvedSubmissions.has(form)) {
        approvedSubmissions.delete(form);
        return;
      }

      // Si Authentication ya creó el UID pero Firestore falló, permite reintentar
      // solamente el guardado del perfil sin crear una cuenta duplicada.
      if (uidInput.value.trim() && !passwordInput.value) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      clearError(form);

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || password.length < 6) {
        showError(form, 'Captura un correo válido y una contraseña de al menos 6 caracteres.');
        passwordInput.reportValidity();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: false })
        });
        const result = await response.json();
        if (!response.ok || !result.localId) {
          const code = String(result?.error?.message || 'UNKNOWN').split(' : ')[0];
          throw new Error(authErrors[code] || 'No se pudo crear la cuenta en Firebase Authentication.');
        }

        setAngularValue(uidInput, result.localId);
        approvedSubmissions.add(form);
        form.requestSubmit(submitButton || undefined);
        window.setTimeout(() => { passwordInput.value = ''; }, 1000);
      } catch (error) {
        showError(form, error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    }, true);
  }

  function prepareUserForm(uidInput) {
    const form = uidInput.closest('form');
    if (!form || preparedUserForms.has(form)) return;
    preparedUserForms.add(form);

    const uidGroup = uidInput.parentElement;
    uidGroup.style.display = 'none';
    uidInput.required = false;

    const article = form.closest('article');
    const description = article?.querySelector('h2 + p');
    if (description) {
      description.textContent = 'Captura los datos del usuario. La cuenta de acceso y su UID se crearán automáticamente al guardar.';
    }

    const emailInput = form.querySelector('input[name="correoUsuario"]');
    const emailGroup = emailInput?.parentElement;
    if (!emailGroup) return;

    const passwordGroup = emailGroup.cloneNode(false);
    passwordGroup.dataset.newUserPasswordGroup = 'true';
    const label = document.createElement('label');
    label.setAttribute('for', 'passwordUsuario');
    label.textContent = 'Contraseña del usuario';

    const passwordInput = document.createElement('input');
    for (const attribute of emailInput.attributes) {
      if (attribute.name.startsWith('_ngcontent')) {
        passwordInput.setAttribute(attribute.name, attribute.value);
      }
    }
    passwordInput.type = 'password';
    passwordInput.id = 'passwordUsuario';
    passwordInput.name = 'passwordUsuario';
    passwordInput.placeholder = 'Mínimo 6 caracteres';
    passwordInput.autocomplete = 'new-password';
    passwordInput.minLength = 6;

    passwordGroup.append(label, passwordInput);
    emailGroup.after(passwordGroup);

    const updateMode = () => {
      const editing = Boolean(uidInput.value.trim());
      passwordGroup.style.display = editing ? 'none' : '';
      if (editing) passwordInput.value = '';
    };
    form.addEventListener('click', () => window.setTimeout(updateMode));
    form.addEventListener('input', updateMode);
    updateMode();

    form.addEventListener('submit', async (event) => {
      if (approvedSubmissions.has(form)) {
        approvedSubmissions.delete(form);
        return;
      }

      // Un UID existente significa que se está editando un perfil; no se crea otra cuenta.
      if (uidInput.value.trim()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      clearError(form);

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || password.length < 6) {
        showError(form, 'Captura un correo válido y una contraseña de al menos 6 caracteres.');
        passwordInput.focus();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: false })
        });
        const result = await response.json();
        if (!response.ok || !result.localId) {
          const code = String(result?.error?.message || 'UNKNOWN').split(' : ')[0];
          throw new Error(authErrors[code] || 'No se pudo crear la cuenta en Firebase Authentication.');
        }

        setAngularValue(uidInput, result.localId);
        approvedSubmissions.add(form);
        form.requestSubmit(submitButton || undefined);
        window.setTimeout(() => {
          passwordInput.value = '';
          updateMode();
        }, 1000);
      } catch (error) {
        showError(form, error instanceof Error ? error.message : 'No se pudo crear la cuenta.');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    }, true);
  }

  async function getCurrentIdToken() {
    const [{ initializeApp }, { getAuth }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js')
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    const auth = getAuth(app);
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    return auth.currentUser.getIdToken();
  }

  async function deleteUser(uid) {
    const token = await getCurrentIdToken();
    const response = await fetch('https://us-central1-promocion-al-voto.cloudfunctions.net/eliminarUsuario', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: { uid } })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload?.error?.message || 'No se pudo eliminar el usuario.');
    }
  }

  function prepareDeleteButtons() {
    document.querySelectorAll('button.btn-mini.estado').forEach((button) => {
      if (button.dataset.deleteUserReady || button.textContent.trim() !== 'Desactivar') return;
      button.dataset.deleteUserReady = 'true';
      button.textContent = 'Eliminar';
      button.style.background = '#b91c1c';
      button.style.borderColor = '#b91c1c';
      button.style.color = '#fff';

      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const card = button.closest('.item-card');
        const cardText = card?.textContent || '';
        const uid = cardText.match(/UID:\s*([A-Za-z0-9_-]+)/)?.[1];
        const name = card?.querySelector('strong')?.textContent?.trim() || 'este usuario';
        if (!uid) {
          window.alert('No se pudo identificar el usuario que quieres eliminar.');
          return;
        }
        if (!window.confirm(`¿Eliminar definitivamente a ${name}? Esta acción borrará su acceso y su perfil, y no se puede deshacer.`)) return;

        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Eliminando...';
        try {
          await deleteUser(uid);
          window.alert(`${name} fue eliminado correctamente.`);
          window.location.reload();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el usuario.');
          button.disabled = false;
          button.textContent = originalText;
        }
      }, true);
    });
  }

  function scan() {
    document.querySelectorAll('input[name="monitoreoMovilizadorUid"]').forEach(prepareForm);
    document.querySelectorAll('input[name="uidUsuario"]').forEach(prepareUserForm);
    prepareDeleteButtons();
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
