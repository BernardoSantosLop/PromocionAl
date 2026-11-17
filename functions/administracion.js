const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const { normalizarFichaMovilizador } = require('./ficha-movilizador');

initializeApp();

exports.eliminarUsuario = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const db = getFirestore();
  const callerUid = request.auth.uid;
  const callerSnapshot = await db.collection('usuarios').doc(callerUid).get();
  const caller = callerSnapshot.data();
  if (!callerSnapshot.exists || caller?.activo !== true || caller?.rol !== 'coordinador') {
    throw new HttpsError('permission-denied', 'Solo el coordinador puede eliminar usuarios.');
  }

  const uid = String(request.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'Falta el UID del usuario.');
  if (uid === callerUid) throw new HttpsError('failed-precondition', 'No puedes eliminar tu propia cuenta.');

  const targetRef = db.collection('usuarios').doc(uid);
  const targetSnapshot = await targetRef.get();
  if (!targetSnapshot.exists) throw new HttpsError('not-found', 'El perfil ya no existe.');
  if (targetSnapshot.data()?.rol === 'coordinador') {
    throw new HttpsError('failed-precondition', 'No se permite eliminar usuarios coordinadores.');
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  await targetRef.delete();
  return { deleted: true };
});

function catalogId(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

exports.asegurarCatalogos = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const db = getFirestore();
  const callerSnapshot = await db.collection('usuarios').doc(request.auth.uid).get();
  const caller = callerSnapshot.data();
  const allowedRoles = new Set(['coordinador', 'seccional', 'movilizador']);
  if (!callerSnapshot.exists || caller?.activo !== true || !allowedRoles.has(caller?.rol)) {
    throw new HttpsError('permission-denied', 'Tu usuario no tiene permiso para registrar votantes.');
  }

  const section = Number(request.data?.seccion);
  const municipality = String(request.data?.municipio || '').trim();
  const colony = String(request.data?.colonia || '').trim();
  const confirmCreation = request.data?.confirmar === true;
  if (!Number.isInteger(section) || section <= 0 || !municipality || !colony) {
    throw new HttpsError('invalid-argument', 'Sección, municipio y colonia son obligatorios.');
  }

  const sectionRef = db.collection('seccionesElectorales').doc(String(section));
  const colonyRef = db.collection('colonias').doc(catalogId(`${municipality}-${colony}`));
  const [sectionSnapshot, colonySnapshot] = await Promise.all([sectionRef.get(), colonyRef.get()]);
  const missingSection = !sectionSnapshot.exists;
  const missingColony = !colonySnapshot.exists;

  if (confirmCreation && (missingSection || missingColony)) {
    const batch = db.batch();
    if (missingSection) {
      batch.set(sectionRef, {
        seccion: section,
        municipio: municipality,
        colonia: colony,
        activo: true,
        fechaActualizacion: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    if (missingColony) {
      batch.set(colonyRef, {
        nombre: colony.toUpperCase(),
        municipio: municipality,
        activo: true,
        fechaRegistro: FieldValue.serverTimestamp(),
        fechaActualizacion: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }

  return { faltaSeccion: missingSection, faltaColonia: missingColony };
});

exports.gestionarJerarquia = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const db = getFirestore();
  const callerSnapshot = await db.collection('usuarios').doc(request.auth.uid).get();
  const caller = callerSnapshot.data();
  if (!callerSnapshot.exists || caller?.activo !== true || !['coordinador', 'seccional', 'enlace'].includes(caller?.rol)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para administrar esta jerarquía.');
  }

  const action = String(request.data?.accion || '');
  if (caller.rol === 'seccional' && !['listar', 'guardar'].includes(action)) {
    throw new HttpsError('permission-denied', 'El delegado solo puede consultar y guardar sus enlaces.');
  }
  if (action === 'listarSimpatizantes') {
    const uid = String(request.data?.movilizadorUid || '').trim();
    if (!uid) throw new HttpsError('invalid-argument', 'Selecciona un movilizador.');
    const movilizador = await db.collection('usuarios').doc(uid).get();
    if (!movilizador.exists || movilizador.data()?.rol !== 'movilizador') throw new HttpsError('not-found', 'No se encontró el movilizador.');
    if (caller.rol !== 'coordinador' && (caller.rol !== 'enlace' || movilizador.data()?.enlaceUid !== request.auth.uid)) throw new HttpsError('permission-denied', 'Solo puedes consultar los simpatizantes de tus movilizadores.');
    const resultados = await Promise.all([
      db.collection('votantes').where('movilizadorUid', '==', uid).get(),
      db.collection('votantes').where('capturadoPorUid', '==', uid).get()
    ]);
    const unicos = new Map();
    resultados.forEach((resultado) => resultado.docs.forEach((documento) => {
      const datos = documento.data();
      if ((datos.movilizadorUid || datos.capturadoPorUid) !== uid) return;
      unicos.set(documento.id, {
        id: documento.id, nombreCompleto: datos.nombreCompleto || 'Sin nombre',
        telefono: datos.telefono || '', direccion: datos.direccion || '', colonia: datos.colonia || '',
        claveElector: datos.claveElector || '', seccion: Number(datos.seccion) || 0,
        municipio: datos.municipio || '', edad: Number(datos.edad) || 0,
        tieneFacebook: datos.tieneFacebook === true, usuarioFacebook: datos.usuarioFacebook || ''
      });
    }));
    return { simpatizantes: [...unicos.values()].sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es') || a.id.localeCompare(b.id)) };
  }
  if (action === 'listar') {
    if (caller.rol === 'seccional') {
      const resultados = await Promise.all([
        db.collection('usuarios').where('delegadoUid', '==', request.auth.uid).get(),
        db.collection('usuarios').where('seccionalUid', '==', request.auth.uid).get()
      ]);
      const unicos = new Map();
      resultados.forEach((resultado) => resultado.docs.forEach((documento) => {
        const datos = documento.data();
        if (datos.rol !== 'enlace' || (datos.delegadoUid || datos.seccionalUid) !== request.auth.uid) return;
        unicos.set(documento.id, {
          uid: documento.id, nombre: datos.nombre || '', correo: datos.correo || '',
          rol: 'enlace', activo: datos.activo !== false,
          seccionalUid: request.auth.uid, delegadoUid: request.auth.uid,
          seccionalNombre: caller.nombre || '', delegadoNombre: caller.nombre || '',
          fichaRegistro: datos.fichaRegistro || null
        });
      }));
      return { rolSolicitante: caller.rol, usuarios: [...unicos.values()], simpatizantesPorMovilizador: {} };
    }
    if (caller.rol !== 'coordinador') {
      const [mobilizersSnapshot, votersSnapshot] = await Promise.all([
        db.collection('usuarios').where('enlaceUid', '==', request.auth.uid).get(),
        db.collection('votantes').get()
      ]);
      const ownedMobilizers = mobilizersSnapshot.docs
        .map((document) => ({
          uid: document.id,
          nombre: document.data()?.nombre || '',
          correo: document.data()?.correo || '',
          fichaRegistro: document.data()?.fichaRegistro || null,
          rol: document.data()?.rol || '',
          activo: document.data()?.activo !== false,
          seccionalUid: document.data()?.seccionalUid || '',
          seccionalNombre: document.data()?.seccionalNombre || '',
          delegadoUid: document.data()?.delegadoUid || '',
          delegadoNombre: document.data()?.delegadoNombre || '',
          enlaceUid: document.data()?.enlaceUid || '',
          enlaceNombre: document.data()?.enlaceNombre || ''
        }))
        .filter((user) => user.activo && user.rol === 'movilizador');
      const ownedUids = new Set(ownedMobilizers.map((user) => user.uid));
      const voterCounts = {};
      votersSnapshot.docs.forEach((document) => {
        const mobilizerUid = document.data()?.movilizadorUid || '';
        if (ownedUids.has(mobilizerUid)) voterCounts[mobilizerUid] = (voterCounts[mobilizerUid] || 0) + 1;
      });
      return {
        rolSolicitante: caller.rol,
        usuarios: [{
          uid: request.auth.uid,
          nombre: caller.nombre || '',
          rol: caller.rol,
          activo: true,
          seccionalUid: caller.seccionalUid || '',
          seccionalNombre: caller.seccionalNombre || '',
          delegadoUid: caller.delegadoUid || '',
          delegadoNombre: caller.delegadoNombre || ''
        }, ...ownedMobilizers],
        simpatizantesPorMovilizador: voterCounts
      };
    }
    const [snapshot, votersSnapshot, authUsersResult] = await Promise.all([
      db.collection('usuarios').get(),
      db.collection('votantes').get(),
      getAuth().listUsers(1000)
    ]);
    const profileUids = new Set(snapshot.docs.map((document) => document.id));
    const voterCounts = {};
    votersSnapshot.docs.forEach((document) => {
      const mobilizerUid = document.data()?.movilizadorUid || '';
      if (mobilizerUid) voterCounts[mobilizerUid] = (voterCounts[mobilizerUid] || 0) + 1;
    });
    return {
      rolSolicitante: caller.rol,
      usuarios: snapshot.docs.map((document) => {
        const data = document.data();
        return {
          uid: document.id,
          nombre: data.nombre || '',
          correo: data.correo || '',
          fichaRegistro: data.rol === 'movilizador' ? data.fichaRegistro || null : null,
          rol: data.rol || '',
          activo: data.activo !== false,
          coordinadorUid: data.coordinadorUid || '',
          seccionalUid: data.seccionalUid || '',
          seccionalNombre: data.seccionalNombre || '',
          delegadoUid: data.delegadoUid || '',
          delegadoNombre: data.delegadoNombre || '',
          enlaceUid: data.enlaceUid || '',
          enlaceNombre: data.enlaceNombre || ''
        };
      }).filter((user) => user.activo),
      simpatizantesPorMovilizador: voterCounts,
      cuentasSinPerfil: authUsersResult.users
        .filter((user) => !profileUids.has(user.uid))
        .map((user) => ({ uid: user.uid, correo: user.email || '', nombre: user.displayName || '' }))
    };
  }

  if (action === 'asignarCuentaSinPerfil') {
    if (caller.rol !== 'coordinador') {
      throw new HttpsError('permission-denied', 'Solo el coordinador puede asignar cuentas sin perfil.');
    }
    const uid = String(request.data?.uid || '').trim();
    const linkUid = String(request.data?.enlaceUid || '').trim();
    const name = String(request.data?.nombre || '').trim();
    if (!uid || !linkUid || !name) throw new HttpsError('invalid-argument', 'Faltan datos para asignar la cuenta.');
    const [linkSnapshot, existingProfile, authUser] = await Promise.all([
      db.collection('usuarios').doc(linkUid).get(),
      db.collection('usuarios').doc(uid).get(),
      getAuth().getUser(uid)
    ]);
    if (existingProfile.exists) throw new HttpsError('already-exists', 'La cuenta ya tiene un perfil.');
    const link = linkSnapshot.data();
    if (!linkSnapshot.exists || link?.rol !== 'enlace' || link?.activo === false) {
      throw new HttpsError('failed-precondition', 'Selecciona un enlace activo.');
    }
    await db.collection('usuarios').doc(uid).set({
      nombre: name,
      correo: authUser.email || '',
      rol: 'movilizador',
      activo: true,
      coordinadorUid: '',
      coordinadorNombre: '',
      enlaceUid: linkUid,
      enlaceNombre: link.nombre || '',
      seccionalUid: link.seccionalUid || '',
      seccionalNombre: link.seccionalNombre || '',
      delegadoUid: link.delegadoUid || link.seccionalUid || '',
      delegadoNombre: link.delegadoNombre || link.seccionalNombre || '',
      fechaActualizacion: FieldValue.serverTimestamp()
    });
    return { guardado: true };
  }

  if (action === 'recuperarMovilizador') {
    if (caller.rol !== 'enlace') {
      throw new HttpsError('permission-denied', 'Solo un enlace puede recuperar uno de sus movilizadores.');
    }
    const name = String(request.data?.nombre || '').trim();
    const email = String(request.data?.correo || '').trim().toLowerCase();
    if (!name || !email) throw new HttpsError('invalid-argument', 'Captura el nombre y correo del movilizador.');
    let authUser;
    try {
      authUser = await getAuth().getUserByEmail(email);
    } catch (error) {
      if (error?.code === 'auth/user-not-found') {
        throw new HttpsError('not-found', 'No existe esa cuenta en Firebase Authentication.');
      }
      throw error;
    }
    const profileRef = db.collection('usuarios').doc(authUser.uid);
    const existingProfile = await profileRef.get();
    if (existingProfile.exists && existingProfile.data()?.enlaceUid !== request.auth.uid) {
      throw new HttpsError('already-exists', 'Ese correo ya pertenece a otro perfil de usuario.');
    }
    await profileRef.set({
      nombre: name,
      correo: email,
      rol: 'movilizador',
      activo: true,
      coordinadorUid: '',
      coordinadorNombre: '',
      enlaceUid: request.auth.uid,
      enlaceNombre: caller.nombre || '',
      seccionalUid: caller.seccionalUid || '',
      seccionalNombre: caller.seccionalNombre || '',
      delegadoUid: caller.delegadoUid || caller.seccionalUid || '',
      delegadoNombre: caller.delegadoNombre || caller.seccionalNombre || '',
      fechaActualizacion: FieldValue.serverTimestamp()
    }, { merge: true });
    return { guardado: true, uid: authUser.uid, recuperado: true };
  }

  if (action !== 'guardar') throw new HttpsError('invalid-argument', 'Acción no válida.');
  const uid = String(request.data?.uid || '').trim();
  const name = String(request.data?.nombre || '').trim();
  const email = String(request.data?.correo || '').trim().toLowerCase();
  const role = String(request.data?.rol || '').trim();
  const responsibleUid = ['enlace', 'seccional'].includes(caller.rol)
    ? request.auth.uid
    : String(request.data?.responsableUid || '').trim();
  if (!uid || !name || !email || !responsibleUid || !['enlace', 'movilizador'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Faltan datos obligatorios del usuario.');
  }
  if (caller.rol === 'seccional') {
    if (role !== 'enlace') throw new HttpsError('permission-denied', 'El delegado solo puede crear enlaces.');
    const existente = await db.collection('usuarios').doc(uid).get();
    if (existente.exists && (existente.data()?.rol !== 'enlace' || (existente.data()?.delegadoUid || existente.data()?.seccionalUid) !== request.auth.uid)) {
      throw new HttpsError('permission-denied', 'Solo puedes actualizar enlaces asignados a tu delegado.');
    }
  }
  if (caller.rol === 'enlace' && (role !== 'movilizador' || responsibleUid !== request.auth.uid)) {
    throw new HttpsError('permission-denied', 'Un enlace solo puede crear movilizadores vinculados a su propia cuenta.');
  }
  if (caller.rol === 'enlace') {
    const existente = await db.collection('usuarios').doc(uid).get();
    if (existente.exists && (existente.data()?.rol !== 'movilizador' || existente.data()?.enlaceUid !== request.auth.uid)) {
      throw new HttpsError('permission-denied', 'Solo puedes actualizar movilizadores asignados a tu enlace.');
    }
  }

  const responsibleSnapshot = await db.collection('usuarios').doc(responsibleUid).get();
  if (!responsibleSnapshot.exists || responsibleSnapshot.data()?.activo === false) {
    throw new HttpsError('failed-precondition', 'El responsable seleccionado no está activo.');
  }
  const responsible = responsibleSnapshot.data();
  const profile = {
    nombre: name,
    correo: email,
    rol: role,
    activo: true,
    coordinadorUid: '',
    coordinadorNombre: '',
    fechaActualizacion: FieldValue.serverTimestamp()
  };

  if (role === 'movilizador' && request.data?.fichaRegistro) {
    try { profile.fichaRegistro = normalizarFichaMovilizador(request.data.fichaRegistro); }
    catch (error) { throw new HttpsError('invalid-argument', error.message); }
  }
  if (role === 'enlace' && request.data?.fichaRegistro) {
    try {
      const datos = normalizarFichaMovilizador(request.data.fichaRegistro);
      for (const lado of ['ineFrente', 'ineReverso']) {
        const imagen = request.data.fichaRegistro[lado];
        if (typeof imagen !== 'string' || imagen.length > 240000 || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(imagen)) throw new Error('Carga ambas caras de la INE en formato válido.');
        datos[lado] = imagen;
      }
      profile.fichaRegistro = datos;
    } catch (error) { throw new HttpsError('invalid-argument', error.message); }
  }

  if (role === 'enlace') {
    if (responsible.rol !== 'seccional') {
      throw new HttpsError('failed-precondition', 'Selecciona un delegado válido.');
    }
    profile.seccionalUid = responsibleUid;
    profile.seccionalNombre = responsible.nombre || '';
    profile.delegadoUid = responsibleUid;
    profile.delegadoNombre = responsible.nombre || '';
    profile.enlaceUid = '';
    profile.enlaceNombre = '';
  } else {
    if (responsible.rol !== 'enlace') {
      throw new HttpsError('failed-precondition', 'Selecciona un enlace válido.');
    }
    profile.enlaceUid = responsibleUid;
    profile.enlaceNombre = responsible.nombre || '';
    profile.seccionalUid = responsible.seccionalUid || '';
    profile.seccionalNombre = responsible.seccionalNombre || '';
    profile.delegadoUid = responsible.seccionalUid || '';
    profile.delegadoNombre = responsible.seccionalNombre || '';
  }

  await db.collection('usuarios').doc(uid).set(profile, { merge: true });
  return { guardado: true };
});
