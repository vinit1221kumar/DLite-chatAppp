import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];

function ensureClient() {
  if (typeof window === 'undefined') {
    throw new Error('Client auth SDK is only available in the browser runtime.');
  }
}

export function isFirebaseConfigured() {
  return requiredKeys.every((key) => Boolean(firebaseConfig[key]));
}

export function createFirebaseConfigError() {
  const error = new Error('Authentication configuration is missing. Set NEXT_PUBLIC_FIREBASE_* environment variables.');
  error.code = 'auth/firebase-not-configured';
  return error;
}

function ensureFirebaseConfigured() {
  if (!isFirebaseConfigured()) {
    throw createFirebaseConfigError();
  }
}

function getFirebaseApp() {
  ensureClient();
  ensureFirebaseConfigured();
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getRealtimeDb() {
  return getDatabase(getFirebaseApp());
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseStorage() {
  return getStorage(getFirebaseApp());
}
