import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle, renderCacheStatus } from "./layout.js";
import { badgeSituacao, showToast } from "./utils.js";
import { getVagas, getEmpresasMap, getCargosMap } from "./firestore-cache.js";
import { cacheGet } from "./cache.js";

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
renderLayout("relatorios", authResult.dados);
setPageTitle("Relatórios");

// ── Estado ────────────────────────────────────────────────────
let todasVagas    = [];
let vagasFiltradas = [];
let empresasMap   = {};
let cargosMap     = {};

// ── Carregar dados (com cache) ─────────────────────────────────
const foiCacheHit = !!(cacheGet("vagas") && cacheGet("empresas") && cacheGet("cargos"));
try {
  [todasVagas, empresasMap, cargosMap] = await Promise.all([
    getVagas(), getEmpresasMap(), getCargosMap()
  ]);

  // Popular selects de filtro
  const selEmp = document.getElementById("f-empresa");
  const selLoc = document.getElementById("f-localidade");
  const empsUnicas = [...new Set(todasVagas.map(v => v.empresaId).filter(Boolean))].sort();
  const locsUnicas = [...new Set(todasVagas.map(v => v.localidade).filter(Boolean))].sort();

  empsUnicas.forEach(id => {
    const opt = new Option((empresasMap[id] ?? id).toUpperCase(), id);
    selEmp.appendChild(opt);
  });
  locsUnicas.forEach(loc => {
    selLoc.appendChild(new Option(loc, loc));
  });

  document.getElementById("loading-rel").style.display = "none";
  document.getElementById("painel-rel").style.display = "";
  document.getElementById("btn-export-csv").disabled  = false;
  document.getElementById("btn-export-xlsx").disabled = false;
  renderCacheStatus(foiCacheHit, ["vagas", "empresas", "cargos"]);
  aplicarFiltros();

} catch (err) {
  document.getElementById("loading-rel").innerHTML =
    `<p class="text-danger">Erro ao carregar: ${err.message}</p>`;
}

// ── Aplicar filtros ────────────────────────────────────────────
function aplicarFiltros() {
  const emp    = document.getElementById("f-empresa").value;
  const situ   = document.getElementById("f-situacao").value;
  const loc    = document.getElementById("f-localidade").value;
  const sigla  = document.getElementById("f-sigla").value.trim().toUpperCase();

  vagasFiltradas = todasVagas.filter(v => {
    if (emp   && v.empresaId      !== emp)  return false;
    if (situ  && v.situacao       !== situ) return false;
    if (loc   && v.localidade     !== loc)  return false;
    if (sigla && !(v.unidadeSigla ?? "").toUpperCase().includes(sigla)) return false;
    return true;
  });

  atualizarStats();
  renderTabela();
}

function atualizarStats() {
  const criticas = ["AGUARDANDO SUBSTITUIÇÃO", "EXTINÇÃO DE VAGA", "EM CONTRATAÇÃO"];
  const livres   = ["LIVRE", "AGUARDANDO SUBSTITUIÇÃO", "RESERVADA", "UTILIZADA P/ ADITIVO"];
  document.getElementById("stat-total").textContent    = vagasFiltradas.length;
  document.getElementById("stat-ativas").textContent   = vagasFiltradas.filter(v => v.situacao === "ATIVA").length;
  document.getElementById("stat-livres").textContent   = vagasFiltradas.filter(v => livres.includes(v.situacao)).length;
  document.getElementById("stat-criticas").textContent = vagasFiltradas.filter(v => criticas.includes(v.situacao)).length;
  document.getElementById("rel-info").textContent =
    `Exibindo ${vagasFiltradas.length} de ${todasVagas.length} vagas`;
}

function renderTabela() {
  const tbody = document.getElementById("tbody-rel");
  if (!vagasFiltradas.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma vaga encontrada com os filtros aplicados.</td></tr>`;
    return;
  }
  tbody.innerHTML = vagasFiltradas.slice(0, 200).map(v => `
    <tr>
      <td><code style="font-size:11px;">${v.codigoVaga ?? "—"}</code></td>
      <td style="font-size:11px;">${(empresasMap[v.empresaId] ?? v.empresaId ?? "—")}</td>
      <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${cargosMap[v.cargoId] ?? ''}">${cargosMap[v.cargoId] ?? v.cargoId ?? "—"}</td>
      <td><span class="badge bg-${badgeSituacao(v.situacao)}" style="font-size:10px;">${v.situacao ?? "—"}</span></td>
      <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${v.nomeColaborador || "—"}</td>
      <td><code style="font-size:11px;">${v.matriculaColaborador || "—"}</code></td>
      <td>${v.unidadeSigla || "—"}</td>
      <td>${v.localidade || "—"}</td>
    </tr>`).join("");

  if (vagasFiltradas.length > 200) {
    tbody.innerHTML += `<tr><td colspan="8" class="text-center text-muted" style="font-size:12px;">
      Prévia limitada a 200 linhas. O arquivo exportado conterá todos os ${vagasFiltradas.length} registros.
    </td></tr>`;
  }
}

// ── Eventos de filtro ──────────────────────────────────────────
["f-empresa","f-situacao","f-localidade"].forEach(id => {
  document.getElementById(id).addEventListener("change", aplicarFiltros);
});
let debounce;
document.getElementById("f-sigla").addEventListener("input", () => {
  clearTimeout(debounce); debounce = setTimeout(aplicarFiltros, 250);
});
document.getElementById("btn-limpar-rel").addEventListener("click", () => {
  ["f-empresa","f-situacao","f-localidade"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("f-sigla").value = "";
  aplicarFiltros();
});

// ── Helpers de exportação ──────────────────────────────────────
function buildLinhas() {
  return vagasFiltradas.map(v => ({
    "Código Vaga":   v.codigoVaga ?? "",
    "Empresa":       (empresasMap[v.empresaId] ?? v.empresaId ?? "").toUpperCase(),
    "Cargo":         cargosMap[v.cargoId] ?? v.cargoId ?? "",
    "Situação":      v.situacao ?? "",
    "Colaborador":   v.nomeColaborador ?? "",
    "Matrícula":     v.matriculaColaborador ?? "",
    "N° Sequencial": v.numeroSequencial ?? "",
    "Hierarquia":    v.hierarquia ?? "",
    "Sigla":         v.unidadeSigla ?? "",
    "Unidade":       v.unidadeNome ?? "",
    "Localidade":    v.localidade ?? "",
    "Responsável":   v.responsavel ?? "",
    "E-mail":        v.emailUnidade ?? "",
    "Observações":   v.observacoes ?? ""
  }));
}

// ── Exportar XLSX ──────────────────────────────────────────────
document.getElementById("btn-export-xlsx").addEventListener("click", () => {
  if (!vagasFiltradas.length) { showToast("Nenhuma vaga para exportar.", "warning"); return; }
  try {
    const linhas = buildLinhas();
    const ws = XLSX.utils.json_to_sheet(linhas);

    // Largura das colunas
    ws["!cols"] = [
      {wch:18},{wch:14},{wch:22},{wch:22},{wch:30},{wch:12},{wch:6},
      {wch:25},{wch:12},{wch:25},{wch:14},{wch:22},{wch:24},{wch:40}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vagas");
    const hoje = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `relatorio_vagas_${hoje}.xlsx`);
    showToast(`${vagasFiltradas.length} vagas exportadas para XLSX!`, "success");
  } catch (err) {
    showToast("Erro ao gerar XLSX: " + err.message, "danger");
  }
});

// ── Exportar CSV ──────────────────────────────────────────────
document.getElementById("btn-export-csv").addEventListener("click", () => {
  if (!vagasFiltradas.length) { showToast("Nenhuma vaga para exportar.", "warning"); return; }
  const linhas = buildLinhas();
  const cabecalho = Object.keys(linhas[0]);
  const csv = "\uFEFF" + [
    cabecalho.map(c => `"${c}"`).join(";"),
    ...linhas.map(l => cabecalho.map(k => `"${String(l[k]).replace(/"/g,'""')}"`).join(";"))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url, download: `relatorio_vagas_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${vagasFiltradas.length} vagas exportadas para CSV!`, "success");
});
