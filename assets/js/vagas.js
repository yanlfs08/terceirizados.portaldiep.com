import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle } from "./layout.js";
import { db } from "./firebase-config.js";
import { badgeSituacao, showToast } from "./utils.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Mapa cargoId → descrição legível (ex: "PORTEIRO 12X36 DIURNO C/ INSALUBRIDADE")
let cargosMap = {};

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
const { dados } = authResult;
const isEditor = ["admin", "editor"].includes(dados.perfil);
renderLayout("vagas", dados);
setPageTitle("Lista de Vagas");

// ── Estado ─────────────────────────────────────────────────────
const POR_PAGINA = 50;
let todasVagas   = [];   // dados brutos do Firestore
let vagasFiltradas = []; // após aplicar filtros em memória
let paginaAtual  = 0;

// ── Elementos DOM ───────────────────────────────────────────────
const loadingOverlay  = document.getElementById("loading-overlay");
const tabelaVagas     = document.getElementById("tabela-vagas");
const tbody           = document.getElementById("tbody-vagas");
const semResultados   = document.getElementById("sem-resultados");
const paginacaoFooter = document.getElementById("paginacao-footer");
const paginacaoInfo   = document.getElementById("paginacao-info");
const btnAnterior     = document.getElementById("btn-anterior");
const btnProxima      = document.getElementById("btn-proxima");
const badgeTotal      = document.getElementById("badge-total");
const btnExportar     = document.getElementById("btn-exportar");
const btnLimpar       = document.getElementById("btn-limpar-filtros");
const filtroBusca     = document.getElementById("filtro-busca");
const filtroEmpresa   = document.getElementById("filtro-empresa");
const filtroSituacao  = document.getElementById("filtro-situacao");

// ── 1. Carregar vagas + cargos em paralelo ──────────────────────
try {
  const [snapVagas, snapCargos] = await Promise.all([
    getDocs(query(collection(db, "vagas"), where("deleted", "==", false))),
    getDocs(collection(db, "cargos"))
  ]);

  // Monta mapa cargoId → descrição (ignora o prefixo antes do hífen)
  snapCargos.docs.forEach(d => {
    const c = d.data();
    // descricao já vem sem o prefixo (gravado assim pelo importar.js)
    // mas garante remoção do prefixo "CARGO XX - " caso venha junto
    const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase();
    cargosMap[d.id] = desc || (c.descricao ?? "").toUpperCase();
  });

  todasVagas = snapVagas.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.codigoVaga ?? "").localeCompare(b.codigoVaga ?? "", "pt-BR"));

  // Popular select de Empresas
  const empresasUnicas = [...new Set(
    todasVagas.map(v => v.empresaId).filter(Boolean)
  )].sort();
  empresasUnicas.forEach(emp => {
    const opt = document.createElement("option");
    opt.value = emp;
    opt.textContent = emp.toUpperCase();
    filtroEmpresa.appendChild(opt);
  });

  // Exibir tabela e ocultar loading
  loadingOverlay.style.display = "none";
  tabelaVagas.style.display = "";
  paginacaoFooter.style.display = "";
  btnExportar.disabled = false;

  badgeTotal.textContent = `${todasVagas.length} vagas`;
  badgeTotal.style.opacity = "1";

  // Botão Nova Vaga (apenas editor/admin)
  if (isEditor) {
    document.getElementById("btn-nova-vaga-container").innerHTML = `
      <a href="/vaga-form.html" class="btn btn-primary btn-sm">
        <i class="bi bi-plus-lg me-1"></i>Nova Vaga
      </a>`;
  }

  // Aplicar filtros iniciais (nenhum)
  aplicarFiltros();

} catch (err) {
  loadingOverlay.innerHTML = `
    <i class="bi bi-exclamation-triangle-fill text-danger fs-1 mb-3"></i>
    <p class="text-danger">Erro ao carregar vagas: ${err.message}</p>`;
}

// ── 2. Aplicar Filtros ────────────────────────────────────────────
function aplicarFiltros() {
  const textoBusca    = filtroBusca.value.trim().toLowerCase();
  const empresaFiltro = filtroEmpresa.value;
  const situacaoFiltro = filtroSituacao.value;

  vagasFiltradas = todasVagas.filter(v => {
    // Filtro empresa
    if (empresaFiltro && v.empresaId !== empresaFiltro) return false;
    // Filtro situacao
    if (situacaoFiltro && v.situacao !== situacaoFiltro) return false;
    // Busca textual
    if (textoBusca) {
      const haystack = [
        v.codigoVaga,
        v.nomeColaborador,
        v.matriculaColaborador,
        v.unidadeSigla,
        v.unidadeNome,
        v.cargoId,
        v.empresaId
      ].join(" ").toLowerCase();
      if (!haystack.includes(textoBusca)) return false;
    }
    return true;
  });

  // Atualizar badge
  badgeTotal.textContent = textoBusca || empresaFiltro || situacaoFiltro
    ? `${vagasFiltradas.length} de ${todasVagas.length} vagas`
    : `${todasVagas.length} vagas`;

  paginaAtual = 0;
  renderPagina();
}

// ── 3. Renderizar Página Atual ───────────────────────────────────
function renderPagina() {
  const total = vagasFiltradas.length;
  const inicio = paginaAtual * POR_PAGINA;
  const fim = Math.min(inicio + POR_PAGINA, total);
  const paginaItems = vagasFiltradas.slice(inicio, fim);
  const textoBusca = filtroBusca.value.trim().toLowerCase();

  if (total === 0) {
    tbody.innerHTML = "";
    tabelaVagas.style.display = "none";
    semResultados.style.display = "";
    paginacaoFooter.style.display = "none";
    return;
  }

  tabelaVagas.style.display = "";
  semResultados.style.display = "none";
  paginacaoFooter.style.display = "";

  // Renderizar linhas
  tbody.innerHTML = paginaItems.map(v => {
    const badgeClass = badgeSituacao(v.situacao);
    const codigo = highlight(v.codigoVaga ?? "—", textoBusca);
    const colaborador = highlight(v.nomeColaborador || "—", textoBusca);
    const matricula = highlight(v.matriculaColaborador || "—", textoBusca);
    const unidade = highlight(v.unidadeSigla || "—", textoBusca);
    const empresa = (v.empresaId || "—").toUpperCase();
    // Usa a descrição legível do mapa; fallback para o próprio cargoId
    const cargo = cargosMap[v.cargoId] || (v.cargoId || "—").toUpperCase();

    return `
      <tr>
        <td><span class="codigo-vaga">${codigo}</span></td>
        <td><small>${empresa}</small></td>
        <td class="nome-col" title="${cargo}">${cargo}</td>
        <td>
          <span class="badge bg-${badgeClass} text-uppercase" style="font-size:10px; letter-spacing:.04em;">
            ${v.situacao ?? "—"}
          </span>
        </td>
        <td class="nome-col" title="${v.nomeColaborador || ''}">${colaborador}</td>
        <td><code style="font-size:11px;">${matricula}</code></td>
        <td>${unidade}</td>
        <td>
          <div class="d-flex gap-1">
            <a href="/vaga-detalhe.html?id=${v.id}" class="btn btn-sm btn-outline-secondary" title="Ver detalhes">
              <i class="bi bi-eye"></i>
            </a>
            ${isEditor ? `<a href="/vaga-form.html?id=${v.id}" class="btn btn-sm btn-outline-primary" title="Editar">
              <i class="bi bi-pencil"></i>
            </a>` : ''}
          </div>
        </td>
      </tr>`;
  }).join("");

  // Atualizar paginação
  const totalPaginas = Math.ceil(total / POR_PAGINA);
  paginacaoInfo.textContent = `Exibindo ${inicio + 1}–${fim} de ${total} vagas`;
  btnAnterior.disabled = paginaAtual === 0;
  btnProxima.disabled  = paginaAtual >= totalPaginas - 1;
}

// ── 4. Highlight de texto ────────────────────────────────────────
function highlight(texto, termo) {
  if (!termo || !texto) return texto ?? "—";
  const re = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return String(texto).replace(re, "<mark>$1</mark>");
}

// ── 5. Eventos de filtro e paginação ─────────────────────────────
let debounceTimer;
filtroBusca.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(aplicarFiltros, 220);
});
filtroEmpresa.addEventListener("change", aplicarFiltros);
filtroSituacao.addEventListener("change", aplicarFiltros);

btnLimpar.addEventListener("click", () => {
  filtroBusca.value = "";
  filtroEmpresa.value = "";
  filtroSituacao.value = "";
  aplicarFiltros();
});

btnAnterior.addEventListener("click", () => {
  if (paginaAtual > 0) { paginaAtual--; renderPagina(); window.scrollTo(0, 0); }
});
btnProxima.addEventListener("click", () => {
  const totalPaginas = Math.ceil(vagasFiltradas.length / POR_PAGINA);
  if (paginaAtual < totalPaginas - 1) { paginaAtual++; renderPagina(); window.scrollTo(0, 0); }
});

// ── 6. Exportar CSV ──────────────────────────────────────────────
btnExportar.addEventListener("click", () => {
  if (vagasFiltradas.length === 0) {
    showToast("Nenhuma vaga para exportar com os filtros atuais.", "warning");
    return;
  }

  const cabecalho = ["Código", "Empresa", "Cargo", "Situação", "Colaborador", "Matrícula", "Unidade Sigla", "Unidade Nome", "Hierarquia", "Localidade", "Responsável", "Observações"];
  const linhas = vagasFiltradas.map(v => [
    v.codigoVaga ?? "",
    (v.empresaId ?? "").toUpperCase(),
    v.cargoId ?? "",
    v.situacao ?? "",
    v.nomeColaborador ?? "",
    v.matriculaColaborador ?? "",
    v.unidadeSigla ?? "",
    v.unidadeNome ?? "",
    v.hierarquia ?? "",
    v.localidade ?? "",
    v.responsavel ?? "",
    v.observacoes ?? ""
  ].map(cel => `"${String(cel).replace(/"/g, '""')}"`).join(";"));

  const bom = "\uFEFF"; // BOM para Excel reconhecer UTF-8
  const csv = bom + [cabecalho.map(c => `"${c}"`).join(";"), ...linhas].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `vagas_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast(`${vagasFiltradas.length} vagas exportadas com sucesso.`, "success");
});
