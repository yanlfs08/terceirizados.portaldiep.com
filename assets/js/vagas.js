import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle, renderCacheStatus } from "./layout.js";
import { badgeSituacao, showToast } from "./utils.js";
import { getVagas, getCargosMap } from "./firestore-cache.js";
import { cacheGet } from "./cache.js";

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
const { dados } = authResult;
const isEditor = ["admin", "editor"].includes(dados.perfil);
renderLayout("vagas", dados);
setPageTitle("Lista de Vagas");

// ── Estado ─────────────────────────────────────────────────────
const POR_PAGINA = 50;
let todasVagas   = [];
let vagasFiltradas = [];
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

// ── 1. Carregar vagas + cargos (via cache) ──────────────────────────
try {
  // Verifica se os dados já estão em cache ANTES de buscar
  const foiCacheHit = !!(cacheGet("vagas") && cacheGet("cargos"));
  const [vagas, cargosMap] = await Promise.all([
    getVagas(),
    getCargosMap()
  ]);

  todasVagas = vagas;

  // Fechar mapa de cargos para uso no render
  window._cargosMap = cargosMap;

  // Popular select de Empresas a partir dos dados já carregados
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

  // Exibe indicador de cache no topbar
  renderCacheStatus(foiCacheHit, ["vagas", "cargos"]);

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
    if (empresaFiltro && v.empresaId !== empresaFiltro) return false;
    if (situacaoFiltro && v.situacao !== situacaoFiltro) return false;
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

  badgeTotal.textContent = textoBusca || empresaFiltro || situacaoFiltro
    ? `${vagasFiltradas.length} de ${todasVagas.length} vagas`
    : `${todasVagas.length} vagas`;

  paginaAtual = 0;
  renderPagina();
}

// ── 3. Renderizar Página Atual ───────────────────────────────────
function renderPagina() {
  const cargosMap = window._cargosMap ?? {};
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

  tbody.innerHTML = paginaItems.map(v => {
    const badgeClass = badgeSituacao(v.situacao);
    const codigo = highlight(v.codigoVaga ?? "—", textoBusca);
    const colaborador = highlight(v.nomeColaborador || "—", textoBusca);
    const matricula = highlight(v.matriculaColaborador || "—", textoBusca);
    const unidade = highlight(v.unidadeSigla || "—", textoBusca);
    const empresa = (v.empresaId || "—").toUpperCase();
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

  const bom = "\uFEFF";
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
