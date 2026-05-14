import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEF-RBK1jdOgDvEZlhuhWqZmS3c31i9j0",
  authDomain: "acompanhamentodemandas.firebaseapp.com",
  projectId: "acompanhamentodemandas",
  storageBucket: "acompanhamentodemandas.firebasestorage.app",
  messagingSenderId: "652363820780",
  appId: "1:652363820780:web:6d07d198561a5da47b7fc9"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
