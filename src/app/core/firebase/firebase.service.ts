import { Injectable } from '@angular/core';

import { FirebaseApp, initializeApp } from 'firebase/app';

import { Auth, getAuth } from 'firebase/auth';

import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

import { Functions, getFunctions } from 'firebase/functions';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private app: FirebaseApp;
  private auth: Auth;
  private firestore: Firestore;
  private functions: Functions;

  constructor() {
    this.app = initializeApp(environment.firebaseConfig);
    this.auth = getAuth(this.app);

    try {
      this.firestore = initializeFirestore(this.app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });

      console.log('Firestore offline habilitado.');
    } catch (error) {
      console.warn(
        'No se pudo habilitar la persistencia offline. Se usará Firestore normal.',
        error
      );

      this.firestore = getFirestore(this.app);
    }

    this.functions = getFunctions(this.app, 'us-central1');
  }

  obtenerAuth(): Auth {
    return this.auth;
  }

  obtenerFirestore(): Firestore {
    return this.firestore;
  }

  obtenerFunctions(): Functions {
    return this.functions;
  }
}