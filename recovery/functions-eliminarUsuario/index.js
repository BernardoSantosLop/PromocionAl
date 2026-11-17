const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

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
