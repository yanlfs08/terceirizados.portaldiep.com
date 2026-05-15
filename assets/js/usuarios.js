import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle } from "./layout.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";
import {
  collection, doc, getDocs, setDoc, updateDoc,
  orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Auth (admin only) ─────────────────────────────────────────
const authResult = await checkAuth("admin");
if (!authResult) throw new Error("Não autenticado");
const { user, dados } = authResult;

renderLayout("usuarios", dados);
setPageTitle("Usuários");

// ── Config Firebase REST ───────────────────────────────────────
// Usamos a mesma apiKey pública já presente em firebase-config.js
const API_KEY = auth.app.options.apiKey;
const AUTH_REST = `https://identitytoolkit.googleapis.com/v1/accounts`;

// ── Estado ────────────────────────────────────────────────────
let todosUsuarios = [];
let usuarioEditId = null;

const modalEl   = document.getElementById("modal-usuario");
const modalBs   = new bootstrap.Modal(modalEl);

// ── 1. Carregar usuários ───────────────────────────────────────
async function carregarUsuarios() {
  try {
    const snap = await getDocs(
      query(collection(db, "users"), orderBy("nome"))
    );
    todosUsuarios = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    renderUsuarios();
    document.getElementById("loading-usuarios").style.display = "none";
    document.getElementById("painel-usuarios").style.display  = "";
  } catch (err) {
    document.getElementById("loading-usuarios").innerHTML =
      `<p class="text-danger">Erro ao carregar: ${err.message}</p>`;
  }
}

carregarUsuarios();

// ── 2. Render tabela ───────────────────────────────────────────
function badgePerfil(perfil) {
  const map = { admin: "adm", editor: "edi", visualizador: "vis" };
  const nomes = { admin: "Administrador", editor: "Editor", visualizador: "Visualizador" };
  return `<span class="badge-perfil-${map[perfil] ?? "vis"}">${nomes[perfil] ?? perfil}</span>`;
}

function avatarClass(perfil) {
  return `avatar-${perfil ?? "visualizador"}`;
}

function renderUsuarios() {
  const tbody = document.getElementById("tbody-usuarios");
  if (!todosUsuarios.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Nenhum usuário encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = todosUsuarios.map(u => {
    const iniciais = (u.nome ?? "?").split(" ").slice(0,2).map(n => n[0]).join("").toUpperCase();
    const ativo    = u.ativo !== false;
    const ultimoAcesso = u.ultimoAcesso?.toDate
      ? u.ultimoAcesso.toDate().toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})
      : "—";
    return `
      <tr>
        <td><span class="avatar-cell ${avatarClass(u.perfil)}">${iniciais}</span></td>
        <td><strong>${u.nome ?? "—"}</strong></td>
        <td style="font-size:12px;">${u.email ?? "—"}</td>
        <td>${badgePerfil(u.perfil)}</td>
        <td style="font-size:12px;">${ultimoAcesso}</td>
        <td>
          <span class="badge ${ativo ? 'bg-success' : 'bg-secondary'}" style="font-size:10px;">
            ${ativo ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-secondary btn-edit-user" data-uid="${u.uid}" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm ${ativo ? 'btn-outline-danger' : 'btn-outline-success'} btn-toggle-user"
              data-uid="${u.uid}" data-ativo="${ativo}" title="${ativo ? 'Desativar' : 'Ativar'}">
              <i class="bi ${ativo ? 'bi-person-x' : 'bi-person-check'}"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".btn-edit-user").forEach(btn => {
    btn.addEventListener("click", () => abrirModal(btn.dataset.uid));
  });
  tbody.querySelectorAll(".btn-toggle-user").forEach(btn => {
    btn.addEventListener("click", () => toggleAtivo(btn.dataset.uid, btn.dataset.ativo === "true"));
  });
}

// ── 3. Modal ──────────────────────────────────────────────────
function abrirModal(uid = null) {
  usuarioEditId = uid;
  const u = uid ? todosUsuarios.find(x => x.uid === uid) : null;

  document.getElementById("modal-usuario-titulo").textContent = uid ? "Editar Usuário" : "Novo Usuário";
  document.getElementById("u-nome").value   = u?.nome   ?? "";
  document.getElementById("u-email").value  = u?.email  ?? "";
  document.getElementById("u-perfil").value = u?.perfil ?? "visualizador";
  document.getElementById("u-senha").value  = "";

  // No modo edição: esconder e-mail (não pode mudar) e senha; mostrar toggle ativo
  document.getElementById("u-email-wrapper").style.display  = uid ? "none" : "";
  document.getElementById("u-senha-wrapper").style.display  = uid ? "none" : "";
  document.getElementById("u-ativo-wrapper").style.display  = uid ? ""     : "none";
  if (uid) document.getElementById("u-ativo").checked = u?.ativo !== false;

  modalBs.show();
}

document.getElementById("btn-novo-usuario").addEventListener("click", () => abrirModal());

// ── 4. Salvar usuário ─────────────────────────────────────────
document.getElementById("btn-salvar-usuario").addEventListener("click", async () => {
  const btn = document.getElementById("btn-salvar-usuario");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando...`;

  try {
    const nome   = document.getElementById("u-nome").value.trim();
    const perfil = document.getElementById("u-perfil").value;
    if (!nome) throw new Error("Nome é obrigatório.");

    if (usuarioEditId) {
      // Edição: só atualiza nome, perfil e ativo no Firestore
      const ativo = document.getElementById("u-ativo").checked;
      await updateDoc(doc(db, "users", usuarioEditId), {
        nome, perfil, ativo, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid
      });
      await setDoc(doc(collection(db, "audit_log")), {
        usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
        acao: "UPDATE_USER", colecao: "users", documentoId: usuarioEditId,
        dadosNovos: { nome, perfil, ativo }, timestamp: serverTimestamp()
      });
    } else {
      // Criação: cria via Firebase Auth REST API + registra no Firestore
      const email = document.getElementById("u-email").value.trim();
      const senha = document.getElementById("u-senha").value;
      if (!email || !senha) throw new Error("E-mail e senha são obrigatórios.");
      if (senha.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");

      // Criar conta no Firebase Auth
      const res = await fetch(`${AUTH_REST}:signUp?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: senha, returnSecureToken: true })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro ao criar usuário no Auth.");

      const novoUid = json.localId;
      await setDoc(doc(db, "users", novoUid), {
        nome, email, perfil, ativo: true,
        criadoEm: serverTimestamp(), criadoPor: user.uid
      });
      await setDoc(doc(collection(db, "audit_log")), {
        usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
        acao: "CREATE_USER", colecao: "users", documentoId: novoUid,
        dadosNovos: { nome, email, perfil }, timestamp: serverTimestamp()
      });
    }

    modalBs.hide();
    showToast(usuarioEditId ? "Usuário atualizado!" : "Usuário criado com sucesso!", "success");
    await carregarUsuarios();

  } catch (err) {
    showToast("Erro: " + err.message, "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-floppy-fill me-1"></i>Salvar`;
  }
});

// ── 5. Toggle ativo/inativo ───────────────────────────────────
async function toggleAtivo(uid, ativoAtual) {
  try {
    const novoStatus = !ativoAtual;
    await updateDoc(doc(db, "users", uid), {
      ativo: novoStatus, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid
    });
    await setDoc(doc(collection(db, "audit_log")), {
      usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
      acao: "UPDATE_USER", colecao: "users", documentoId: uid,
      dadosNovos: { ativo: novoStatus }, timestamp: serverTimestamp()
    });
    showToast(`Usuário ${novoStatus ? "ativado" : "desativado"} com sucesso.`, "success");
    await carregarUsuarios();
  } catch (err) {
    showToast("Erro: " + err.message, "danger");
  }
}
