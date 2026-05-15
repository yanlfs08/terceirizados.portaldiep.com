import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle } from "./layout.js";
import { db } from "./firebase-config.js";
import { showToast } from "./utils.js";
import {
  collection, doc, getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
const { user, dados } = authResult;

// Apenas Admin tem acesso à gestão de unidades
if (dados.perfil !== "admin") {
  window.location.href = "/403.html";
  throw new Error("Acesso negado");
}

renderLayout("unidades", dados);
setPageTitle("Gestão de Unidades");

// ── Estado ────────────────────────────────────────────────────
let todasUnidades = [];
let unidadeEditId = null;

// ── Modais Bootstrap ──────────────────────────────────────────
const modalUnidadeEl = document.getElementById("modal-unidade");
const modalUnidade   = new bootstrap.Modal(modalUnidadeEl);

// ── Eventos ───────────────────────────────────────────────────
document.getElementById("btn-nova-unidade").addEventListener("click", () => abrirModalUnidade());
document.getElementById("btn-salvar-unidade").addEventListener("click", salvarUnidade);

// Oculta loading
document.getElementById("loading-unidades").style.display = "none";
document.getElementById("painel-unidades").style.display = "block";

carregarUnidades();

// ── Funções ───────────────────────────────────────────────────
async function carregarUnidades() {
  try {
    const snap = await getDocs(collection(db, "unidades"));
    todasUnidades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Ordena por sigla
    todasUnidades.sort((a, b) => a.sigla.localeCompare(b.sigla));
    renderUnidades();
  } catch (e) {
    showToast("Erro ao carregar unidades: " + e.message, "danger");
  }
}

function renderUnidades() {
  const tbody = document.getElementById("tbody-unidades");
  if (!todasUnidades.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
      Nenhuma unidade cadastrada.
      <br><br>
      <button class="btn btn-sm btn-outline-primary" onclick="migrarUnidades()">
        <i class="bi bi-cloud-download me-1"></i>Importar Lotações das Vagas Existentes
      </button>
    </td></tr>`;
    return;
  }
  
  tbody.innerHTML = todasUnidades.map(u => `
    <tr>
      <td><strong>${u.sigla}</strong></td>
      <td>${u.nome}</td>
      <td><span class="text-muted" style="font-size:11px;">${u.hierarquia || "—"}</span></td>
      <td>${u.localidade || "—"}</td>
      <td>
        ${u.ativo !== false 
          ? '<span class="badge-ativo"><i class="bi bi-check-circle-fill me-1"></i>Ativa</span>' 
          : '<span class="badge-inativo"><i class="bi bi-x-circle-fill me-1"></i>Inativa</span>'}
      </td>
      <td>
        <button class="btn btn-sm btn-outline-secondary btn-edit-unidade" data-id="${u.id}" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
      </td>
    </tr>`).join("");

  tbody.querySelectorAll(".btn-edit-unidade").forEach(btn => {
    btn.addEventListener("click", () => abrirModalUnidade(btn.dataset.id));
  });
}

function abrirModalUnidade(id = null) {
  unidadeEditId = id;
  const u = id ? todasUnidades.find(x => x.id === id) : null;
  
  document.getElementById("modal-unidade-titulo").textContent = id ? "Editar Unidade" : "Nova Unidade";
  document.getElementById("u-sigla").value = u?.sigla || "";
  document.getElementById("u-nome").value = u?.nome || "";
  document.getElementById("u-hierarquia").value = u?.hierarquia || "";
  document.getElementById("u-localidade").value = u?.localidade || "";
  document.getElementById("u-responsavel").value = u?.responsavel || "";
  document.getElementById("u-email").value = u?.email || "";
  
  if (id) {
    document.getElementById("u-ativo-wrapper").style.display = "";
    document.getElementById("u-ativo").checked = u?.ativo !== false;
    document.getElementById("u-sigla").readOnly = true; // Sigla não deve mudar facilmente se for ID/chave
  } else {
    document.getElementById("u-ativo-wrapper").style.display = "none";
    document.getElementById("u-ativo").checked = true;
    document.getElementById("u-sigla").readOnly = false;
  }
  
  modalUnidade.show();
}

async function salvarUnidade() {
  const sigla = document.getElementById("u-sigla").value.trim().toUpperCase();
  const nome = document.getElementById("u-nome").value.trim().toUpperCase();
  const hierarquia = document.getElementById("u-hierarquia").value.trim().toUpperCase();
  const localidade = document.getElementById("u-localidade").value.trim().toUpperCase();
  const responsavel = document.getElementById("u-responsavel").value.trim().toUpperCase();
  const email = document.getElementById("u-email").value.trim().toLowerCase();
  const ativo = document.getElementById("u-ativo").checked;

  if (!sigla || !nome || !localidade) {
    showToast("Preencha Sigla, Nome Completo e Localidade.", "warning");
    return;
  }

  const btn = document.getElementById("btn-salvar-unidade");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando...`;

  try {
    const batch = writeBatch(db);
    // Usaremos a própria sigla como ID do documento para facilitar (removendo espaços/caracteres especiais se necessário, mas sigla costuma ser curta)
    const docId = unidadeEditId || sigla.replace(/[^A-Z0-9]/g, '');
    const ref = doc(db, "unidades", docId);
    
    const dadosUnidade = {
      sigla, nome, hierarquia, localidade, responsavel, email, ativo,
      atualizadoEm: serverTimestamp(), atualizadoPor: user.uid
    };

    if (!unidadeEditId) dadosUnidade.criadoEm = serverTimestamp();

    batch.set(ref, dadosUnidade, { merge: true });
    batch.set(doc(collection(db, "audit_log")), {
      usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
      acao: unidadeEditId ? "UPDATE_UNIDADE" : "CREATE_UNIDADE",
      colecao: "unidades", documentoId: docId,
      dadosNovos: dadosUnidade, timestamp: serverTimestamp()
    });

    await batch.commit();
    await carregarUnidades();
    modalUnidade.hide();
    showToast(unidadeEditId ? "Unidade atualizada!" : "Unidade cadastrada!", "success");
  } catch (err) {
    showToast("Erro: " + err.message, "danger");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-floppy-fill me-1"></i>Salvar`;
  }
}

// ── Migração temporária (para rodar via console) ────────────────
window.migrarUnidades = async function() {
  console.log("Iniciando migração de unidades a partir de vagas...");
  try {
    const snap = await getDocs(collection(db, "vagas"));
    const vagas = snap.docs.map(d => d.data());
    const unidadesMap = {};
    
    vagas.forEach(v => {
      if (v.unidadeSigla && !unidadesMap[v.unidadeSigla]) {
        unidadesMap[v.unidadeSigla] = {
          sigla: v.unidadeSigla.toUpperCase(),
          nome: v.unidadeNome ? v.unidadeNome.toUpperCase() : v.unidadeSigla.toUpperCase(),
          hierarquia: (v.hierarquia || "").toUpperCase(),
          localidade: (v.localidade || "").toUpperCase(),
          responsavel: (v.responsavel || "").toUpperCase(),
          email: (v.emailUnidade || "").toLowerCase(),
          ativo: true
        };
      }
    });

    const chaves = Object.keys(unidadesMap);
    console.log(`Encontradas ${chaves.length} unidades únicas.`);
    
    // Batch de gravação
    const batch = writeBatch(db);
    chaves.forEach(sigla => {
      const docId = sigla.replace(/[^A-Z0-9]/g, '');
      const ref = doc(db, "unidades", docId);
      const dados = unidadesMap[sigla];
      dados.criadoEm = serverTimestamp();
      dados.atualizadoEm = serverTimestamp();
      dados.criadoPor = "MIGRACAO";
      batch.set(ref, dados);
    });

    await batch.commit();
    console.log("Migração concluída com sucesso!");
    showToast(`Migração concluída: ${chaves.length} unidades cadastradas.`, "success");
    carregarUnidades();
  } catch (e) {
    console.error("Erro na migração:", e);
    showToast("Erro na migração: " + e.message, "danger");
  }
};
