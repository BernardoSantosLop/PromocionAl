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
  const preparedVoterForms = new WeakSet();
  const approvedSubmissions = new WeakSet();
  let hierarchyRenderStarted = false;
  let hierarchyRenderInFlight = false;

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
    const currentRole = localStorage.getItem('rolUsuario') || '';
    if (description) {
      description.textContent = currentRole === 'enlace'
        ? 'Registra un movilizador vinculado a tu cuenta de enlace. La cuenta de acceso y su UID se crearán automáticamente.'
        : 'Registra un movilizador y asígnalo al delegado responsable. La cuenta de acceso y su UID se crearán automáticamente.';
    }
    if (currentRole === 'enlace' && article) {
      const heading = article.querySelector('h2');
      if (heading) heading.textContent = 'Agregar movilizador a enlace';
      const readonlyGroup = form.querySelector('input[readonly]')?.parentElement;
      const readonlyLabel = readonlyGroup?.querySelector('label');
      const readonlyHelp = readonlyGroup?.querySelector('small, p');
      if (readonlyLabel) readonlyLabel.textContent = 'Enlace responsable';
      if (readonlyHelp) readonlyHelp.textContent = 'El movilizador quedará vinculado a tu cuenta de enlace.';
      const intro = article.parentElement?.querySelector('h2 + p');
      if (intro && intro !== description) intro.textContent = 'Desde aquí solo puedes agregar movilizadores vinculados a tu cuenta de enlace.';
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
          if (code === 'EMAIL_EXISTS' && currentRole === 'enlace') {
            await callHierarchyFunction('recuperarMovilizador', {
              nombre: form.querySelector('input[name="monitoreoMovilizadorNombre"]')?.value.trim() || '',
              correo: email
            });
            window.alert('La cuenta existente fue recuperada y vinculada correctamente a tu enlace.');
            window.location.reload();
            return;
          }
          throw new Error(authErrors[code] || 'No se pudo crear la cuenta en Firebase Authentication.');
        }

        setAngularValue(uidInput, result.localId);
        if (currentRole === 'enlace') {
          await callHierarchyFunction('guardar', {
            uid: result.localId,
            nombre: form.querySelector('input[name="monitoreoMovilizadorNombre"]')?.value.trim() || '',
            correo: email,
            rol: 'movilizador',
            responsableUid: 'cuenta-actual'
          });
          window.alert('Movilizador vinculado correctamente a tu cuenta de enlace.');
          window.location.reload();
          return;
        }
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
    if (!form) return;
    if (preparedUserForms.has(form)) {
      const hasDelegateResponsibility = Boolean(form.querySelector('[data-hierarchy-responsibility="delegadoResponsableNuevo"]'));
      const hasLinkResponsibility = Boolean(form.querySelector('[data-hierarchy-responsibility="enlaceResponsableNuevo"]'));
      if (hasDelegateResponsibility && hasLinkResponsibility) {
        if (typeof form.__updateHierarchyMode === 'function') form.__updateHierarchyMode();
        return;
      }
      preparedUserForms.delete(form);
      form.querySelectorAll('[data-hierarchy-responsibility], [data-new-user-password-group]').forEach((element) => element.remove());
    }
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
    const nameInput = form.querySelector('input[name="nombreUsuario"]');
    const roleSelect = form.querySelector('select[name="rolUsuario"]');
    if (!nameInput || !roleSelect) return;

    if (!roleSelect.querySelector('option[value="enlace"]')) {
      const linkOption = document.createElement('option');
      linkOption.value = 'enlace';
      linkOption.textContent = 'Enlace - Solo registro';
      const mobilizerOption = roleSelect.querySelector('option[value="movilizador"]');
      roleSelect.insertBefore(linkOption, mobilizerOption);
    }

    const createResponsibilityGroup = (name, labelText) => {
      const group = emailGroup.cloneNode(false);
      group.dataset.hierarchyResponsibility = name;
      group.style.display = 'none';
      const groupLabel = document.createElement('label');
      groupLabel.textContent = labelText;
      const select = document.createElement('select');
      select.name = name;
      for (const attribute of roleSelect.attributes) {
        if (attribute.name.startsWith('_ngcontent')) {
          groupLabel.setAttribute(attribute.name, attribute.value);
          select.setAttribute(attribute.name, attribute.value);
        }
      }
      select.className = 'ng-untouched ng-pristine ng-valid';
      select.appendChild(new Option('Selecciona una opción', ''));
      group.append(groupLabel, select);
      return { group, select };
    };
    const delegateResponsibility = createResponsibilityGroup('delegadoResponsableNuevo', 'Delegado responsable');
    const linkResponsibility = createResponsibilityGroup('enlaceResponsableNuevo', 'Enlace responsable');

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
    passwordGroup.after(delegateResponsibility.group, linkResponsibility.group);

    const refreshHierarchyOptions = async () => {
      try {
        const hierarchy = await callHierarchyFunction('listar');
        const currentDelegate = delegateResponsibility.select.value;
        const currentLink = linkResponsibility.select.value;
        delegateResponsibility.select.replaceChildren(new Option('Selecciona delegado', ''));
        linkResponsibility.select.replaceChildren(new Option('Selecciona enlace', ''));
        hierarchy.usuarios.filter((user) => user.rol === 'seccional').forEach((user) => {
          delegateResponsibility.select.appendChild(new Option(user.nombre, user.uid));
        });
        hierarchy.usuarios.filter((user) => user.rol === 'enlace').forEach((user) => {
          linkResponsibility.select.appendChild(new Option(`${user.nombre}${user.seccionalNombre ? ` · ${user.seccionalNombre}` : ''}`, user.uid));
        });
        delegateResponsibility.select.value = currentDelegate;
        linkResponsibility.select.value = currentLink;
      } catch (error) {
        console.warn('No se pudo cargar la jerarquía:', error);
      }
    };

    let lastHierarchyRole = '';
    const updateHierarchyMode = () => {
      const role = roleSelect.value;
      delegateResponsibility.group.style.display = role === 'enlace' ? '' : 'none';
      linkResponsibility.group.style.display = role === 'movilizador' ? '' : 'none';
      const nativeDelegateGroup = form.querySelector('select[name="seccionalResponsable"]')?.parentElement;
      if (nativeDelegateGroup) nativeDelegateGroup.style.display = role === 'movilizador' ? 'none' : '';
      const activeResponsibility = role === 'enlace' ? delegateResponsibility.select : linkResponsibility.select;
      const shouldRefresh = (role === 'enlace' || role === 'movilizador')
        && (lastHierarchyRole !== role || activeResponsibility.options.length <= 1);
      lastHierarchyRole = role;
      if (shouldRefresh) refreshHierarchyOptions();
    };
    form.__updateHierarchyMode = updateHierarchyMode;
    roleSelect.addEventListener('change', () => window.setTimeout(updateHierarchyMode));

    const updateMode = () => {
      const editing = Boolean(uidInput.value.trim());
      passwordGroup.style.display = editing ? 'none' : '';
      if (editing) passwordInput.value = '';
    };
    form.addEventListener('click', () => window.setTimeout(updateMode));
    form.addEventListener('input', updateMode);
    updateMode();
    updateHierarchyMode();

    form.addEventListener('submit', async (event) => {
      if (approvedSubmissions.has(form)) {
        approvedSubmissions.delete(form);
        return;
      }

      const selectedRole = roleSelect.value;
      const isNewHierarchyRole = selectedRole === 'enlace' || selectedRole === 'movilizador';
      const responsibilityUid = selectedRole === 'enlace'
        ? delegateResponsibility.select.value
        : linkResponsibility.select.value;

      // Los roles nuevos se guardan mediante la función protegida de jerarquía.
      if (uidInput.value.trim() && !isNewHierarchyRole) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      clearError(form);

      if (isNewHierarchyRole && !responsibilityUid) {
        showError(form, selectedRole === 'enlace' ? 'Selecciona el delegado responsable.' : 'Selecciona el enlace responsable.');
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!uidInput.value.trim() && (!email || password.length < 6)) {
        showError(form, 'Captura un correo válido y una contraseña de al menos 6 caracteres.');
        passwordInput.focus();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        if (uidInput.value.trim() && isNewHierarchyRole) {
          await callHierarchyFunction('guardar', {
            uid: uidInput.value.trim(),
            nombre: nameInput.value.trim(),
            correo: email,
            rol: selectedRole,
            responsableUid: responsibilityUid
          });
          window.alert('Usuario actualizado correctamente.');
          window.location.reload();
          return;
        }

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
        if (isNewHierarchyRole) {
          await callHierarchyFunction('guardar', {
            uid: result.localId,
            nombre: nameInput.value.trim(),
            correo: email,
            rol: selectedRole,
            responsableUid: responsibilityUid
          });
          window.alert(`${selectedRole === 'enlace' ? 'Enlace' : 'Movilizador'} guardado correctamente.`);
          window.location.reload();
          return;
        }
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

  async function callCatalogFunction(data) {
    const token = await getCurrentIdToken();
    const response = await fetch('https://us-central1-promocion-al-voto.cloudfunctions.net/asegurarCatalogos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload?.error?.message || 'No se pudieron validar los catálogos.');
    }
    return payload.result;
  }

  async function callHierarchyFunction(action, data = {}) {
    const token = await getCurrentIdToken();
    const response = await fetch('https://us-central1-promocion-al-voto.cloudfunctions.net/gestionarJerarquia', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: { accion: action, ...data } })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload?.error?.message || 'No se pudo actualizar la jerarquía.');
    }
    return payload.result;
  }

  function replaceTerminology(root = document.body) {
    if (!root) return;
    const replacements = [
      [/SECCIONALES/g, 'DELEGADOS'], [/Seccionales/g, 'Delegados'], [/seccionales/g, 'delegados'],
      [/SECCIONAL/g, 'DELEGADO'], [/Seccional/g, 'Delegado'], [/seccional/g, 'delegado'],
      [/VOTANTES/g, 'SIMPATIZANTES'], [/Votantes/g, 'Simpatizantes'], [/votantes/g, 'simpatizantes'],
      [/VOTANTE/g, 'SIMPATIZANTE'], [/Votante/g, 'Simpatizante'], [/votante/g, 'simpatizante']
    ];
    const replaceText = (value) => replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'SCRIPT' || parentTag === 'STYLE') continue;
      const next = replaceText(node.nodeValue || '');
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach((element) => {
      for (const attribute of ['placeholder', 'title', 'aria-label']) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, replaceText(value));
      }
    });
  }

  function ensureEnlaceNavigation() {
    if ((localStorage.getItem('rolUsuario') || '') !== 'enlace') return;
    if (!document.documentElement.dataset.enlaceNavigationReady) {
      document.documentElement.dataset.enlaceNavigationReady = 'true';
      document.addEventListener('click', (event) => {
        const link = event.target.closest?.('a');
        if (!link || link.textContent.trim() !== 'Estructura') return;
        if ((localStorage.getItem('rolUsuario') || '') !== 'enlace') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.assign(`/estructura?acceso-enlace=${Date.now()}`);
      }, true);
    }
    const existing = document.querySelector('a[href^="/estructura"], a[href*="/estructura?"]');
    if (existing) return;
    const registerLink = document.querySelector('a[href="/registro-votante"], a[href$="/registro-votante"]');
    if (!registerLink) return;
    const structureLink = document.createElement('a');
    structureLink.className = registerLink.className;
    for (const attribute of registerLink.attributes) {
      if (attribute.name.startsWith('_ngcontent')) {
        structureLink.setAttribute(attribute.name, attribute.value);
      }
    }
    structureLink.href = '/estructura?acceso=enlace-v15';
    structureLink.textContent = 'Estructura';
    registerLink.parentElement?.insertBefore(structureLink, registerLink);
  }

  function setAngularSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareVoterCatalogs(sectionInput) {
    const form = sectionInput.closest('form');
    if (!form || preparedVoterForms.has(form)) return;
    const colonySelect = form.querySelector('select[name="colonia"]');
    const municipalityInput = form.querySelector('input[name="municipio"]');
    if (!colonySelect || !municipalityInput) return;
    preparedVoterForms.add(form);

    const otherOption = document.createElement('option');
    otherOption.value = '__agregar_colonia__';
    otherOption.textContent = '+ Agregar colonia no registrada';
    colonySelect.appendChild(otherOption);

    const colonyGroup = colonySelect.parentElement;
    const newColonyGroup = colonyGroup.cloneNode(false);
    newColonyGroup.dataset.newColonyGroup = 'true';
    newColonyGroup.style.display = 'none';
    const label = document.createElement('label');
    label.setAttribute('for', 'coloniaNueva');
    label.textContent = 'Nombre de la colonia nueva *';
    const newColonyInput = document.createElement('input');
    newColonyInput.type = 'text';
    newColonyInput.id = 'coloniaNueva';
    newColonyInput.name = 'coloniaNueva';
    newColonyInput.placeholder = 'Escribe el nombre de la colonia';
    newColonyInput.autocomplete = 'off';
    for (const attribute of sectionInput.attributes) {
      if (attribute.name.startsWith('_ngcontent')) {
        newColonyInput.setAttribute(attribute.name, attribute.value);
      }
    }
    newColonyGroup.append(label, newColonyInput);
    colonyGroup.after(newColonyGroup);

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'buscarColoniaVotante';
    searchInput.name = 'buscarColoniaVotante';
    searchInput.placeholder = 'Escribe para buscar o agregar una colonia';
    searchInput.autocomplete = 'off';
    searchInput.setAttribute('list', 'coloniasDisponiblesVotante');
    for (const attribute of sectionInput.attributes) {
      if (attribute.name.startsWith('_ngcontent')) {
        searchInput.setAttribute(attribute.name, attribute.value);
      }
    }
    const colonyList = document.createElement('datalist');
    colonyList.id = 'coloniasDisponiblesVotante';
    const refreshColonySuggestions = () => {
      colonyList.replaceChildren();
      Array.from(colonySelect.options)
        .filter((option) => option.value && option.value !== '__agregar_colonia__')
        .forEach((option) => {
          const suggestion = document.createElement('option');
          suggestion.value = option.textContent.trim();
          colonyList.appendChild(suggestion);
        });
    };
    refreshColonySuggestions();
    const searchHint = document.createElement('small');
    searchHint.style.cssText = 'display:block;margin-top:6px;color:#64748b;';
    searchHint.textContent = 'Escribe el nombre y selecciona una coincidencia.';
    colonySelect.before(searchInput, colonyList);
    colonySelect.after(searchHint);
    colonySelect.style.display = 'none';

    const normalizeColony = (value) => String(value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();

    searchInput.addEventListener('input', () => {
      const typed = searchInput.value.trim();
      const normalized = normalizeColony(typed);
      const match = Array.from(colonySelect.options).find((option) =>
        option.value && option.value !== '__agregar_colonia__'
        && normalizeColony(option.textContent) === normalized
      );
      if (match) {
        setAngularSelectValue(colonySelect, match.value);
        newColonyInput.value = '';
        newColonyGroup.style.display = 'none';
        searchHint.textContent = 'Colonia encontrada en el catálogo.';
        searchHint.style.color = '#166534';
      } else if (typed) {
        newColonyInput.value = typed;
        newColonyGroup.style.display = 'none';
        searchHint.textContent = 'No hay coincidencia exacta. Se pedirá confirmación para agregarla.';
        searchHint.style.color = '#b45309';
      } else {
        newColonyInput.value = '';
        newColonyGroup.style.display = 'none';
        searchHint.textContent = 'Escribe el nombre y selecciona una coincidencia.';
        searchHint.style.color = '#64748b';
      }
    });
    searchInput.addEventListener('focus', refreshColonySuggestions);

    colonySelect.addEventListener('change', () => {
      const isNew = colonySelect.value === '__agregar_colonia__';
      newColonyGroup.style.display = isNew ? '' : 'none';
      if (isNew) newColonyInput.focus();
      else newColonyInput.value = '';
    });

    form.addEventListener('submit', async (event) => {
      if (approvedSubmissions.has(form)) {
        approvedSubmissions.delete(form);
        return;
      }

      const section = Number(sectionInput.value);
      const municipality = municipalityInput.value.trim();
      const typedColony = searchInput.value.trim();
      const exactOption = typedColony ? Array.from(colonySelect.options).find((option) =>
        option.value && option.value !== '__agregar_colonia__'
        && normalizeColony(option.textContent) === normalizeColony(typedColony)
      ) : null;
      const addingColony = Boolean(typedColony && !exactOption)
        || colonySelect.value === '__agregar_colonia__';
      const colony = (exactOption?.value || (addingColony ? typedColony || newColonyInput.value : colonySelect.value)).trim();
      if (!section || !municipality || !colony) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      clearError(form);
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        const check = await callCatalogFunction({
          seccion: section,
          municipio: municipality,
          colonia: colony,
          confirmar: false
        });
        const missing = [];
        if (check.faltaSeccion) missing.push(`la sección electoral ${section}`);
        if (check.faltaColonia) missing.push(`la colonia “${colony}”`);

        if (missing.length) {
          const accepted = window.confirm(`${missing.join(' y ')} no existe${missing.length > 1 ? 'n' : ''} en el catálogo. ¿Deseas agregar ${missing.length > 1 ? 'los registros' : 'el registro'} automáticamente y continuar?`);
          if (!accepted) return;
          await callCatalogFunction({
            seccion: section,
            municipio: municipality,
            colonia: colony,
            confirmar: true
          });
        }

        if (addingColony) {
          const option = document.createElement('option');
          option.value = colony;
          option.textContent = colony.toUpperCase();
          colonySelect.appendChild(option);
          setAngularSelectValue(colonySelect, colony);
          newColonyGroup.style.display = 'none';
        }

        approvedSubmissions.add(form);
        form.requestSubmit(submitButton || undefined);
        window.setTimeout(() => {
          searchInput.value = '';
          searchHint.textContent = 'Escribe el nombre y selecciona una coincidencia.';
          searchHint.style.color = '#64748b';
        }, 1000);
      } catch (error) {
        showError(form, error instanceof Error ? error.message : 'No se pudieron agregar los catálogos.');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    }, true);
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

  async function renderHierarchyWithLinks() {
    let currentRole = (localStorage.getItem('rolUsuario') || '').toLowerCase();
    if (hierarchyRenderStarted || hierarchyRenderInFlight) return;
    const original = document.querySelector('.jerarquia-section');
    if (!original) return;
    hierarchyRenderStarted = true;
    hierarchyRenderInFlight = true;

    try {
      const data = await callHierarchyFunction('listar');
      currentRole = String(data.rolSolicitante || currentRole).toLowerCase();
      if (!['coordinador', 'enlace'].includes(currentRole)) {
        hierarchyRenderStarted = false;
        hierarchyRenderInFlight = false;
        return;
      }
      const users = data.usuarios || [];
      const counts = data.simpatizantesPorMovilizador || {};
      const coordinators = users.filter((user) => user.rol === 'coordinador');
      const delegates = users.filter((user) => user.rol === 'seccional');
      const links = users.filter((user) => user.rol === 'enlace');
      const mobilizers = users.filter((user) => user.rol === 'movilizador');
      const orphanAccounts = data.cuentasSinPerfil || [];

      const section = document.createElement('section');
      section.dataset.linkHierarchy = 'true';
      section.style.cssText = 'margin-top:22px;display:grid;gap:16px;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;gap:14px;align-items:end;justify-content:space-between;flex-wrap:wrap;';
      const titleBox = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = 'Jerarquía completa';
      const subtitle = document.createElement('p');
      subtitle.textContent = 'Coordinador → Delegado → Enlace → Movilizador → Simpatizantes';
      titleBox.append(title, subtitle);
      const searchBox = document.createElement('div');
      searchBox.style.cssText = 'min-width:260px;flex:1;max-width:430px;';
      const searchLabel = document.createElement('label');
      searchLabel.textContent = 'Buscar en la jerarquía';
      const search = document.createElement('input');
      search.type = 'search';
      search.placeholder = 'Delegado, enlace o movilizador';
      search.style.cssText = 'width:100%;height:44px;padding:0 12px;border:1px solid #d1d5db;border-radius:10px;font:15px Arial;background:#fff;';
      searchBox.append(searchLabel, search);
      header.append(titleBox, searchBox);

      const tree = document.createElement('div');
      tree.style.cssText = 'display:grid;gap:16px;';
      const makeCard = (label, name, color) => {
        const card = document.createElement('article');
        card.style.cssText = `border:1px solid #dbe2ea;border-left:5px solid ${color};border-radius:12px;padding:14px;background:#fff;display:grid;gap:10px;`;
        const cardHeader = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = name;
        const badge = document.createElement('span');
        badge.textContent = label;
        badge.style.cssText = 'margin-left:8px;font-size:12px;color:#475569;';
        cardHeader.append(strong, badge);
        card.appendChild(cardHeader);
        return card;
      };

      if (currentRole === 'coordinador' && orphanAccounts.length) {
        const recovery = makeCard('Recuperación', 'Cuentas sin perfil', '#dc2626');
        const help = document.createElement('small');
        help.textContent = 'Estas cuentas existen en Authentication, pero todavía no están vinculadas a un enlace.';
        recovery.appendChild(help);
        orphanAccounts.forEach((account) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:minmax(160px,1fr) minmax(160px,1fr) auto;gap:8px;align-items:center;';
          const nameInput = document.createElement('input');
          nameInput.placeholder = 'Nombre del movilizador';
          nameInput.value = account.nombre || (account.correo ? account.correo.split('@')[0] : '');
          const linkSelect = document.createElement('select');
          linkSelect.appendChild(new Option('Selecciona enlace', ''));
          links.forEach((link) => linkSelect.appendChild(new Option(link.nombre, link.uid)));
          const assign = document.createElement('button');
          assign.type = 'button';
          assign.textContent = `Vincular ${account.correo || account.uid}`;
          assign.addEventListener('click', async () => {
            if (!nameInput.value.trim() || !linkSelect.value) {
              window.alert('Captura el nombre y selecciona el enlace responsable.');
              return;
            }
            assign.disabled = true;
            try {
              await callHierarchyFunction('asignarCuentaSinPerfil', {
                uid: account.uid,
                nombre: nameInput.value.trim(),
                enlaceUid: linkSelect.value
              });
              window.alert('Movilizador recuperado y vinculado correctamente.');
              window.location.reload();
            } catch (error) {
              window.alert(error instanceof Error ? error.message : 'No se pudo vincular la cuenta.');
              assign.disabled = false;
            }
          });
          row.append(nameInput, linkSelect, assign);
          recovery.appendChild(row);
        });
        tree.appendChild(recovery);
      }

      if (currentRole === 'enlace') {
        const currentLink = links[0];
        if (currentLink) {
          const linkCard = makeCard('Enlace', currentLink.nombre, '#0f766e');
          mobilizers.filter((mobilizer) => mobilizer.enlaceUid === currentLink.uid).forEach((mobilizer) => {
            const mobilizerCard = makeCard('Movilizador', mobilizer.nombre, '#d97706');
            mobilizerCard.style.marginLeft = '16px';
            const count = document.createElement('small');
            count.textContent = `${counts[mobilizer.uid] || 0} simpatizante(s)`;
            mobilizerCard.appendChild(count);
            linkCard.appendChild(mobilizerCard);
          });
          if (!mobilizers.some((mobilizer) => mobilizer.enlaceUid === currentLink.uid)) {
            const empty = document.createElement('small');
            empty.textContent = 'Sin movilizadores vinculados.';
            linkCard.appendChild(empty);
          }
          tree.appendChild(linkCard);
        }
      }

      coordinators.forEach((coordinator) => {
        const coordinatorCard = makeCard('Coordinador', coordinator.nombre, '#1d4ed8');
        const coordinatorDelegates = delegates.filter((delegate) => !delegate.coordinadorUid || delegate.coordinadorUid === coordinator.uid);
        coordinatorDelegates.forEach((delegate) => {
          const delegateCard = makeCard('Delegado', delegate.nombre, '#7c3aed');
          delegateCard.style.marginLeft = '16px';
          const delegateLinks = links.filter((link) => link.seccionalUid === delegate.uid || link.delegadoUid === delegate.uid);
          delegateLinks.forEach((link) => {
            const linkCard = makeCard('Enlace', link.nombre, '#0f766e');
            linkCard.style.marginLeft = '16px';
            const linkMobilizers = mobilizers.filter((mobilizer) => mobilizer.enlaceUid === link.uid);
            if (!linkMobilizers.length) {
              const empty = document.createElement('small');
              empty.textContent = 'Sin movilizadores vinculados.';
              linkCard.appendChild(empty);
            }
            linkMobilizers.forEach((mobilizer) => {
              const mobilizerCard = makeCard('Movilizador', mobilizer.nombre, '#d97706');
              mobilizerCard.style.marginLeft = '16px';
              const count = document.createElement('small');
              count.textContent = `${counts[mobilizer.uid] || 0} simpatizante(s)`;
              mobilizerCard.appendChild(count);
              linkCard.appendChild(mobilizerCard);
            });
            delegateCard.appendChild(linkCard);
          });

          const legacyMobilizers = mobilizers.filter((mobilizer) => mobilizer.seccionalUid === delegate.uid && !mobilizer.enlaceUid);
          if (legacyMobilizers.length) {
            const legacyCard = makeCard('Compatibilidad', 'Movilizadores sin enlace', '#64748b');
            legacyCard.style.marginLeft = '16px';
            legacyMobilizers.forEach((mobilizer) => {
              const mobilizerCard = makeCard('Movilizador', mobilizer.nombre, '#d97706');
              const count = document.createElement('small');
              count.textContent = `${counts[mobilizer.uid] || 0} simpatizante(s)`;
              mobilizerCard.appendChild(count);
              legacyCard.appendChild(mobilizerCard);
            });
            delegateCard.appendChild(legacyCard);
          }
          coordinatorCard.appendChild(delegateCard);
        });
        tree.appendChild(coordinatorCard);
      });

      search.addEventListener('input', () => {
        const query = search.value.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        tree.querySelectorAll('article').forEach((card) => {
          const text = card.textContent.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          card.style.display = !query || text.includes(query) ? 'grid' : 'none';
        });
      });

      section.append(header, tree);
      original.before(section);
      original.style.setProperty('display', 'none', 'important');
      hierarchyRenderInFlight = false;
    } catch (error) {
      hierarchyRenderStarted = false;
      hierarchyRenderInFlight = false;
      console.warn('No se pudo renderizar la jerarquía con enlaces:', error);
    }
  }

  function scan() {
    const customHierarchies = [...document.querySelectorAll('[data-link-hierarchy="true"]')];
    customHierarchies.slice(1).forEach((duplicate) => duplicate.remove());
    const customHierarchy = customHierarchies[0] || null;
    if (hierarchyRenderStarted && !hierarchyRenderInFlight && !customHierarchy) hierarchyRenderStarted = false;
    if (customHierarchy) {
      document.querySelectorAll('.jerarquia-section').forEach((section) => {
        section.style.setProperty('display', 'none', 'important');
      });
    }
    document.querySelectorAll('input[name="monitoreoMovilizadorUid"]').forEach(prepareForm);
    document.querySelectorAll('input[name="uidUsuario"]').forEach(prepareUserForm);
    document.querySelectorAll('input[name="seccion"]').forEach(prepareVoterCatalogs);
    prepareDeleteButtons();
    replaceTerminology();
    ensureEnlaceNavigation();
    renderHierarchyWithLinks();
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
