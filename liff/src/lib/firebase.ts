import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-northeast1");

// Cloud Functions の型付き呼び出しヘルパー
export const callGenerateMenu = (data: { date?: string }) =>
  httpsCallable<{ date?: string }, { messageText: string; menuPlanId: string | null }>(
    functions,
    "generateMenu"
  )(data);

export const callGetMenuHistory = (data: { limit?: number }) =>
  httpsCallable<{ limit?: number }, any[]>(functions, "getMenuHistory")(data);
