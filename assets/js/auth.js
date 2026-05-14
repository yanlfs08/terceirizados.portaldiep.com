import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  browserSessionPersistence,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Hierarquia de perfis para comparação
const HIERARQUIA = ["visualizador", "editor", "admin"];

/**
 * Faz login com e-mail e senha.
 * Usa sessão por aba (encerra ao fechar o browser).
 */
async function login(email, senha) {
  await setPersistence(auth, browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, senha);
}

/**
 * Faz logout e redireciona para o login.
 */
async function logout() {
  await signOut(auth);
  window.location.href = "/index.html";
}

/**
 * Verifica se o usuário está autenticado e tem o perfil mínimo exigido.
 * Redireciona para login ou 403 conforme necessário.
 * Retorna { user, perfil, dados } em caso de sucesso.
 *
 * @param {string} perfilMinimo - "visualizador" | "editor" | "admin"
 */
function checkAuth(perfilMinimo = "visualizador") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      // Não autenticado
      if (!user) {
        window.location.href = "/index.html";
        return;
      }

      // Busca dados do usuário no Firestore
      const snap = await getDoc(doc(db, "users", user.uid));

      // Documento não existe ou usuário inativo
      if (!snap.exists() || snap.data().ativo === false) {
        await signOut(auth);
        window.location.href = "/index.html";
        return;
      }

      const dados = snap.data();
      const perfil = dados.perfil;

      // Verifica nível de acesso
      if (HIERARQUIA.indexOf(perfil) < HIERARQUIA.indexOf(perfilMinimo)) {
        window.location.href = "/403.html";
        return;
      }

      // Atualiza último acesso
      try {
        await updateDoc(doc(db, "users", user.uid), {
          ultimoAcesso: serverTimestamp()
        });
      } catch (_) {
        // Não crítico — ignora erros aqui
      }

      resolve({ user, perfil, dados });
    });
  });
}

/**
 * Retorna o usuário atual do Firebase Auth (síncrono).
 */
function getUsuarioAtual() {
  return auth.currentUser;
}

export { login, logout, checkAuth, getUsuarioAtual, HIERARQUIA };
