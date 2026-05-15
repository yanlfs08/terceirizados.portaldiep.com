import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle, renderCacheStatus } from "./layout.js";
import { db } from "./firebase-config.js";
import { showToast } from "./utils.js";
import { getEmpresas, getCargos, invalidateEmpresas, invalidateCargos } from "./firestore-cache.js";
import { cacheGet } from "./cache.js";
import {
  collection, doc, addDoc, updateDoc, getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
const { user, dados } = authResult;
const isAdmin = dados.perfil === "admin";

renderLayout("cargos", dados);
setPageTitle("Cargos e Empresas");

// ── Estado ────────────────────────────────────────────────────
let todasEmpresas = [];
let todosCargos   = [];
let cargoEditId   = null;
let empresaEditId = null;

// ── Modais Bootstrap ──────────────────────────────────────────
const modalEmpresaEl = document.getElementById("modal-empresa");
const modalCargoEl   = document.getElementById("modal-cargo");
const modalEmpresa   = new bootstrap.Modal(modalEmpresaEl);
const modalCargo     = new bootstrap.Modal(modalCargoEl);

// ── Botão Novo (só admin) ─────────────────────────────────────
if (isAdmin) {
  document.getElementById("btn-novo-container").innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-nova-empresa" style="display:none;">
      <i class="bi bi-building-add me-1"></i>Nova Empresa
    </button>
    <button class="btn btn-primary btn-sm" id="btn-novo-cargo" style="display:none;">
      <i class="bi bi-briefcase me-1"></i>Novo Cargo
    </button>`;
}

// ── Abas ──────────────────────────────────────────────────────
let abaAtiva = "empresas";
document.getElementById("abas").addEventListener("click", e => {
  const btn = e.target.closest("[data-aba]");
  if (!btn) return;
  document.querySelectorAll("[data-aba]").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  abaAtiva = btn.dataset.aba;
  document.getElementById("painel-empresas").style.display = abaAtiva === "empresas" ? "" : "none";
  document.getElementById("painel-cargos").style.display   = abaAtiva === "cargos"   ? "" : "none";
  if (isAdmin) {
    document.getElementById("btn-nova-empresa")?.style.setProperty("display", abaAtiva === "empresas" ? "" : "none");
    document.getElementById("btn-novo-cargo")?.style.setProperty("display", abaAtiva === "cargos"   ? "" : "none");
  }
});

// ── 1. Carregar dados ─────────────────────────────────────────
const foiCacheHit = !!(cacheGet("empresas") && cacheGet("cargos"));
const [empresas, cargos] = await Promise.all([getEmpresas(), getCargos()]);

todasEmpresas = empresas;
todosCargos   = cargos;

// Contar vagas por empresa para exibir na tabela
const vagasCache = cacheGet("vagas");
const vagasPorEmpresa = {};
if (vagasCache) {
  vagasCache.forEach(v => {
    if (v.empresaId) vagasPorEmpresa[v.empresaId] = (vagasPorEmpresa[v.empresaId] ?? 0) + 1;
  });
}

// Popular select filtro e select do modal
const selectFiltroEmp = document.getElementById("filtro-cargo-empresa");
const selectModalEmp  = document.getElementById("cargo-empresa");
todasEmpresas.forEach(e => {
  [selectFiltroEmp, selectModalEmp].forEach(sel => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = (e.nome ?? e.id).toUpperCase();
    sel.appendChild(opt);
  });
});

document.getElementById("loading-cargos").style.display = "none";
document.getElementById("painel-empresas").style.display = "";
document.getElementById("badge-empresas").textContent = todasEmpresas.length;
document.getElementById("badge-cargos").textContent = todosCargos.length;

// Mostrar botão correto para aba inicial
if (isAdmin) {
  document.getElementById("btn-nova-empresa")?.style.setProperty("display", "");
}

renderCacheStatus(foiCacheHit, ["empresas", "cargos"]);
renderEmpresas();
renderCargos();

// ── 2. Render Empresas ────────────────────────────────────────
function renderEmpresas() {
  const tbody = document.getElementById("tbody-empresas");
  if (!todasEmpresas.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Nenhuma empresa cadastrada.</td></tr>`;
    return;
  }
  tbody.innerHTML = todasEmpresas.map(e => `
    <tr>
      <td><code style="font-size:12px;">${e.id}</code></td>
      <td><strong>${(e.nome ?? e.id).toUpperCase()}</strong></td>
      <td><span class="badge bg-secondary">${vagasPorEmpresa[e.id] ?? 0} vagas</span></td>
      <td>
        ${isAdmin ? `
          <button class="btn btn-sm btn-outline-secondary btn-edit-emp" data-id="${e.id}" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>` : "—"}
      </td>
    </tr>`).join("");

  if (isAdmin) {
    tbody.querySelectorAll(".btn-edit-emp").forEach(btn => {
      btn.addEventListener("click", () => abrirModalEmpresa(btn.dataset.id));
    });
  }
}

// ── 3. Render Cargos ──────────────────────────────────────────
function renderCargos() {
  const filtroEmp  = document.getElementById("filtro-cargo-empresa").value;
  const buscaTexto = document.getElementById("busca-cargo").value.trim().toLowerCase();
  const tbody      = document.getElementById("tbody-cargos");

  const lista = todosCargos.filter(c => {
    if (filtroEmp && c.empresaId !== filtroEmp) return false;
    if (buscaTexto) {
      const hay = `${c.codigo ?? ""} ${c.descricao ?? ""}`.toLowerCase();
      if (!hay.includes(buscaTexto)) return false;
    }
    return true;
  });

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Nenhum cargo encontrado.</td></tr>`;
    return;
  }

  const empMap = Object.fromEntries(todasEmpresas.map(e => [e.id, (e.nome ?? e.id).toUpperCase()]));
  tbody.innerHTML = lista.map(c => {
    const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase() || (c.descricao ?? "").toUpperCase();
    return `
      <tr>
        <td><code style="font-size:12px;">${c.codigo ?? c.id}</code></td>
        <td>${desc}</td>
        <td><span class="badge-empresa">${empMap[c.empresaId] ?? c.empresaId ?? "—"}</span></td>
        <td>
          ${isAdmin ? `
            <button class="btn btn-sm btn-outline-secondary btn-edit-cargo" data-id="${c.id}" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>` : "—"}
        </td>
      </tr>`;
  }).join("");

  if (isAdmin) {
    tbody.querySelectorAll(".btn-edit-cargo").forEach(btn => {
      btn.addEventListener("click", () => abrirModalCargo(btn.dataset.id));
    });
  }
}

// Filtros de cargos
document.getElementById("filtro-cargo-empresa").addEventListener("change", renderCargos);
let debounce;
document.getElementById("busca-cargo").addEventListener("input", () => {
  clearTimeout(debounce);
  debounce = setTimeout(renderCargos, 200);
});

// ── 4. Modal Empresa ──────────────────────────────────────────
function abrirModalEmpresa(id = null) {
  empresaEditId = id;
  const emp = id ? todasEmpresas.find(e => e.id === id) : null;
  document.getElementById("modal-empresa-titulo").textContent = id ? "Editar Empresa" : "Nova Empresa";
  document.getElementById("emp-id").value   = emp?.id   ?? "";
  document.getElementById("emp-nome").value = emp?.nome ?? "";
  document.getElementById("emp-id").readOnly = !!id;
  modalEmpresa.show();
}

document.getElementById("btn-nova-empresa")?.addEventListener("click", () => abrirModalEmpresa());

document.getElementById("btn-salvar-empresa").addEventListener("click", async () => {
  const empId  = document.getElementById("emp-id").value.trim().toUpperCase();
  const empNome = document.getElementById("emp-nome").value.trim().toUpperCase();
  if (!empId || !empNome) { showToast("Preencha todos os campos.", "warning"); return; }

  const btn = document.getElementById("btn-salvar-empresa");
  btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando...`;

  try {
    const batch = writeBatch(db);
    const empRef = doc(db, "empresas", empId);
    const dadosEmp = { nome: empNome, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid };
    if (!empresaEditId) dadosEmp.criadoEm = serverTimestamp();

    batch.set(empRef, dadosEmp, { merge: true });
    batch.set(doc(collection(db, "audit_log")), {
      usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
      acao: empresaEditId ? "UPDATE_EMPRESA" : "CREATE_EMPRESA",
      colecao: "empresas", documentoId: empId,
      dadosNovos: dadosEmp, timestamp: serverTimestamp()
    });
    await batch.commit();

    invalidateEmpresas();
    todasEmpresas = await getEmpresas();
    renderEmpresas();
    document.getElementById("badge-empresas").textContent = todasEmpresas.length;
    modalEmpresa.hide();
    showToast(empresaEditId ? "Empresa atualizada!" : "Empresa criada!", "success");
  } catch (err) {
    showToast("Erro: " + err.message, "danger");
  } finally {
    btn.disabled = false; btn.innerHTML = `<i class="bi bi-floppy-fill me-1"></i>Salvar`;
  }
});

// ── 5. Modal Cargo ────────────────────────────────────────────
function abrirModalCargo(id = null) {
  cargoEditId = id;
  const cargo = id ? todosCargos.find(c => c.id === id) : null;
  document.getElementById("modal-cargo-titulo").textContent = id ? "Editar Cargo" : "Novo Cargo";
  document.getElementById("cargo-empresa").value   = cargo?.empresaId  ?? "";
  document.getElementById("cargo-codigo").value    = cargo?.codigo     ?? "";
  document.getElementById("cargo-descricao").value = cargo?.descricao  ?? "";
  modalCargo.show();
}

document.getElementById("btn-novo-cargo")?.addEventListener("click", () => abrirModalCargo());

document.getElementById("btn-salvar-cargo").addEventListener("click", async () => {
  const empresaId = document.getElementById("cargo-empresa").value;
  const codigo    = document.getElementById("cargo-codigo").value.trim().toUpperCase();
  const descricao = document.getElementById("cargo-descricao").value.trim().toUpperCase();
  if (!empresaId || !codigo || !descricao) { showToast("Preencha todos os campos.", "warning"); return; }

  const btn = document.getElementById("btn-salvar-cargo");
  btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando...`;

  try {
    const dadosCargo = { empresaId, codigo, descricao, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid };
    const batch = writeBatch(db);
    let cargoRef;

    if (cargoEditId) {
      cargoRef = doc(db, "cargos", cargoEditId);
      batch.update(cargoRef, dadosCargo);
    } else {
      dadosCargo.criadoEm = serverTimestamp();
      cargoRef = doc(collection(db, "cargos"));
      batch.set(cargoRef, dadosCargo);
    }

    batch.set(doc(collection(db, "audit_log")), {
      usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
      acao: cargoEditId ? "UPDATE_CARGO" : "CREATE_CARGO",
      colecao: "cargos", documentoId: cargoRef.id,
      dadosNovos: dadosCargo, timestamp: serverTimestamp()
    });
    await batch.commit();

    invalidateCargos();
    todosCargos = await getCargos();
    renderCargos();
    document.getElementById("badge-cargos").textContent = todosCargos.length;
    modalCargo.hide();
    showToast(cargoEditId ? "Cargo atualizado!" : "Cargo criado!", "success");
  } catch (err) {
    showToast("Erro: " + err.message, "danger");
  } finally {
    btn.disabled = false; btn.innerHTML = `<i class="bi bi-floppy-fill me-1"></i>Salvar`;
  }
});
