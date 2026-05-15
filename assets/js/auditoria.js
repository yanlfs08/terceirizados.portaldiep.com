import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle } from "./layout.js";
import { db } from "./firebase-config.js";
import { showToast } from "./utils.js";
import {
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const authResult = await checkAuth("admin");
if (!authResult) throw new Error("Não autenticado");
renderLayout("auditoria", authResult.dados);
setPageTitle("Auditoria");

const POR_PAG = 50;
let todosLogs     = [];
let logsFiltrados = [];
let paginaAtual   = 0;

// ── Carregar audit_log ────────────────────────────────────────
try {
  const snap = await getDocs(
    query(collection(db, "audit_log"), orderBy("timestamp", "desc"), limit(500))
  );
  todosLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  document.getElementById("loading-audit").style.display = "none";
  document.getElementById("painel-audit").style.display  = "";
  document.getElementById("badge-audit-total").textContent = `${todosLogs.length} registros`;

  const usuariosUnicos = [...new Map(todosLogs.map(l => [l.usuarioId, l.nomeUsuario])).entries()];
  const sel = document.getElementById("f-audit-usuario");
  usuariosUnicos.forEach(([uid, nome]) => sel.appendChild(new Option(nome ?? uid, uid)));

  aplicarFiltros();
} catch (err) {
  document.getElementById("loading-audit").innerHTML =
    `<i class="bi bi-exclamation-triangle-fill text-danger fs-1 d-block mb-2"></i>
     <p class="text-danger">Erro ao carregar: ${err.message}</p>`;
}

// ── Filtros ────────────────────────────────────────────────────
function aplicarFiltros() {
  const usuario = document.getElementById("f-audit-usuario").value;
  const acao    = document.getElementById("f-audit-acao").value;
  const busca   = document.getElementById("f-audit-busca").value.trim().toLowerCase();
  const inicio  = document.getElementById("f-audit-inicio").value;
  const fim     = document.getElementById("f-audit-fim").value;
  const tsIni   = inicio ? new Date(inicio).getTime() : null;
  const tsFim   = fim    ? new Date(fim + "T23:59:59").getTime() : null;

  logsFiltrados = todosLogs.filter(l => {
    if (usuario && l.usuarioId !== usuario) return false;
    if (acao    && l.acao      !== acao)    return false;
    if (busca   && !(l.documentoId ?? "").toLowerCase().includes(busca)) return false;
    if (tsIni || tsFim) {
      const ts = l.timestamp?.toDate?.()?.getTime?.() ?? 0;
      if (tsIni && ts < tsIni) return false;
      if (tsFim && ts > tsFim) return false;
    }
    return true;
  });

  paginaAtual = 0;
  document.getElementById("audit-info").textContent =
    `Exibindo ${logsFiltrados.length} de ${todosLogs.length} registros`;
  renderPagina();
}

["f-audit-usuario","f-audit-acao","f-audit-inicio","f-audit-fim"].forEach(id =>
  document.getElementById(id).addEventListener("change", aplicarFiltros)
);
let deb;
document.getElementById("f-audit-busca").addEventListener("input", () => {
  clearTimeout(deb); deb = setTimeout(aplicarFiltros, 250);
});
document.getElementById("btn-limpar-audit").addEventListener("click", () => {
  ["f-audit-usuario","f-audit-acao","f-audit-inicio","f-audit-fim"].forEach(id =>
    document.getElementById(id).value = "");
  document.getElementById("f-audit-busca").value = "";
  aplicarFiltros();
});

// ── Render página ──────────────────────────────────────────────
function badgeAcao(acao = "") {
  if (acao.startsWith("CREATE")) return `<span class="badge-acao acao-create">${acao}</span>`;
  if (acao.startsWith("UPDATE")) return `<span class="badge-acao acao-update">${acao}</span>`;
  if (acao.startsWith("DELETE")) return `<span class="badge-acao acao-delete">${acao}</span>`;
  return `<span class="badge-acao acao-other">${acao}</span>`;
}

function renderPagina() {
  const ini    = paginaAtual * POR_PAG;
  const fim    = Math.min(ini + POR_PAG, logsFiltrados.length);
  const pagina = logsFiltrados.slice(ini, fim);
  const tbody  = document.getElementById("tbody-audit");

  if (!pagina.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>`;
    atualizarPaginacao();
    return;
  }

  tbody.innerHTML = pagina.map((l, i) => {
    const dataStr = l.timestamp?.toDate
      ? l.timestamp.toDate().toLocaleString("pt-BR", {day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})
      : "—";
    const idx = ini + i;
    return `
      <tr class="audit-row" data-idx="${idx}">
        <td style="font-size:11px;white-space:nowrap;">${dataStr}</td>
        <td>${l.nomeUsuario ?? "—"}</td>
        <td>${badgeAcao(l.acao)}</td>
        <td style="font-size:11px;">${l.colecao ?? "—"}</td>
        <td><code style="font-size:11px;">${l.documentoId ?? "—"}</code></td>
        <td><i class="bi bi-chevron-down" style="font-size:11px;opacity:.5;"></i></td>
      </tr>
      <tr id="detail-${idx}" style="display:none;">
        <td colspan="6" class="audit-detail-row">
          <div class="audit-detail-inner">${formatDiff(l)}</div>
        </td>
      </tr>`;
  }).join("");

  tbody.querySelectorAll(".audit-row").forEach(row => {
    row.addEventListener("click", () => {
      const idx    = row.dataset.idx;
      const detail = document.getElementById(`detail-${idx}`);
      const icon   = row.querySelector("i");
      const shown  = detail.style.display !== "none";
      detail.style.display = shown ? "none" : "";
      icon.className = shown ? "bi bi-chevron-down" : "bi bi-chevron-up";
      row.classList.toggle("expanded", !shown);
    });
  });

  atualizarPaginacao();
}

function formatDiff(l) {
  const ant  = l.dadosAnteriores ? JSON.stringify(l.dadosAnteriores, null, 2) : "{}";
  const novo = l.dadosNovos      ? JSON.stringify(l.dadosNovos, null, 2) : "{}";
  return `ANTES:\n${ant}\n\nDEPOIS:\n${novo}`;
}

function atualizarPaginacao() {
  const total = Math.ceil(logsFiltrados.length / POR_PAG);
  const ini   = paginaAtual * POR_PAG;
  const fim   = Math.min(ini + POR_PAG, logsFiltrados.length);
  document.getElementById("audit-pag-info").textContent =
    logsFiltrados.length ? `${ini + 1}–${fim} de ${logsFiltrados.length}` : "0 registros";
  document.getElementById("btn-audit-ant").disabled  = paginaAtual === 0;
  document.getElementById("btn-audit-prox").disabled = paginaAtual >= total - 1;
}

document.getElementById("btn-audit-ant").addEventListener("click", () => {
  if (paginaAtual > 0) { paginaAtual--; renderPagina(); window.scrollTo(0,0); }
});
document.getElementById("btn-audit-prox").addEventListener("click", () => {
  const total = Math.ceil(logsFiltrados.length / POR_PAG);
  if (paginaAtual < total - 1) { paginaAtual++; renderPagina(); window.scrollTo(0,0); }
});
