const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { FieldValue } = require('firebase-admin/firestore');

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
