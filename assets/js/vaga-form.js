import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle, renderCacheStatus } from "./layout.js";
import { db } from "./firebase-config.js";
import { gerarIdVaga, showToast } from "./utils.js";
import { getEmpresas, getCargos, getVagaById, invalidateVagas } from "./firestore-cache.js";
import { cacheGet } from "./cache.js";
import {
  doc, collection, getDocs,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Auth ──────────────────────────────────────────────────────────
const authResult = await checkAuth("editor");
if (!authResult) throw new Error("Não autenticado");
const { user, dados } = authResult;

renderLayout("vagas", dados);

// ── Modo: criação ou edição ───────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const vagaId = params.get("id");
const modoEdicao = !!vagaId;

setPageTitle(modoEdicao ? "Editar Vaga" : "Nova Vaga");
document.getElementById("titulo-form").textContent = modoEdicao ? "Editar Vaga" : "Nova Vaga";
document.getElementById("subtitulo-form").textContent = modoEdicao
  ? "Altere os campos necessários e salve"
  : "Preencha os campos para cadastrar uma nova vaga";

// ── Estado ────────────────────────────────────────────────────────
let dadosOriginais = null;
let todosCargos    = [];

// ── Elementos DOM ─────────────────────────────────────────────────
const form         = document.getElementById("form-vaga");
const fEmpresa     = document.getElementById("f-empresa");
const fCargo       = document.getElementById("f-cargo");
const fSeq         = document.getElementById("f-seq");
const fCodigo      = document.getElementById("f-codigo");
const fSituacao    = document.getElementById("f-situacao");
const fNome        = document.getElementById("f-nome");
const fMatricula   = document.getElementById("f-matricula");
const fHierarquia  = document.getElementById("f-hierarquia");
const fSigla       = document.getElementById("f-sigla");
const fUnidade     = document.getElementById("f-unidade");
const fLocalidade  = document.getElementById("f-localidade");
const fResponsavel = document.getElementById("f-responsavel");
const fEmail       = document.getElementById("f-email");
const fObsNova     = document.getElementById("f-obs-nova");

// ── 1. Carregar empresas e cargos via cache ───────────────────────
// loading já está visível por padrão; form oculto por padrão (style no HTML)
const loadingEl = document.getElementById("loading-form");
const formEl    = document.getElementById("form-vaga");

const fUnidadeSelect = document.getElementById("f-unidade-select");

try {
  // Ambas as coleções são cacheadas por 1h — verifica antes de buscar
  const foiCacheHit = !!(cacheGet("empresas") && cacheGet("cargos"));

  const [empresas, cargos, snapUnidades] = await Promise.all([
    getEmpresas(),
    getCargos(),
    getDocs(collection(db, "unidades"))
  ]);

  todosCargos = cargos;
  const unidades = snapUnidades.docs.map(d => ({ id: d.id, ...d.data() }));
  unidades.sort((a, b) => a.sigla.localeCompare(b.sigla));
  window.unidadesCarregadas = unidades;

  // Popula select de empresas
  empresas.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = (e.nome ?? e.id).toUpperCase();
    fEmpresa.appendChild(opt);
  });

  // Popula select de unidades
  unidades.forEach(u => {
    if (u.ativo === false && !modoEdicao) return; // Oculta inativas para vagas novas
    const opt = document.createElement("option");
    opt.value = u.id; // Id (geralmente sigla)
    opt.textContent = `${u.sigla} - ${u.nome}`;
    fUnidadeSelect.appendChild(opt);
  });

  fUnidadeSelect.addEventListener("change", () => {
    const u = window.unidadesCarregadas.find(x => x.id === fUnidadeSelect.value);
    if (u) {
      fHierarquia.value  = u.hierarquia || "";
      fSigla.value       = u.sigla || "";
      fUnidade.value     = u.nome || "";
      fLocalidade.value  = u.localidade || "";
      fResponsavel.value = u.responsavel || "";
      fEmail.value       = u.email || "";
    } else {
      fHierarquia.value  = "";
      fSigla.value       = "";
      fUnidade.value     = "";
      fLocalidade.value  = "";
      fResponsavel.value = "";
      fEmail.value       = "";
    }
  });

  // ── 2. Carregar dados da vaga (modo edição) ───────────────────
  if (modoEdicao) {
    // getVagaById lê do cache de vagas se disponível — 0 ou 1 leitura
    const vaga = await getVagaById(vagaId);
    if (!vaga) {
      showToast("Vaga não encontrada.", "danger");
      setTimeout(() => window.location.href = "/vagas.html", 2000);
      throw new Error("Vaga não encontrada");
    }
    dadosOriginais = vaga;

    // Preencher campos
    fEmpresa.value    = dadosOriginais.empresaId             ?? "";
    fSeq.value        = dadosOriginais.numeroSequencial       ?? "";
    fSituacao.value   = dadosOriginais.situacao              ?? "";
    fNome.value       = dadosOriginais.nomeColaborador        ?? "";
    fMatricula.value  = dadosOriginais.matriculaColaborador   ?? "";
    
    // Tenta setar a unidade selecionada com base na sigla
    if (dadosOriginais.unidadeSigla) {
      const siglaId = dadosOriginais.unidadeSigla.replace(/[^A-Z0-9]/ig, '').toUpperCase();
      if (Array.from(fUnidadeSelect.options).some(opt => opt.value === siglaId)) {
        fUnidadeSelect.value = siglaId;
      }
    }

    fHierarquia.value = dadosOriginais.hierarquia            ?? "";
    fSigla.value      = dadosOriginais.unidadeSigla          ?? "";
    fUnidade.value    = dadosOriginais.unidadeNome           ?? "";
    fLocalidade.value = dadosOriginais.localidade            ?? "";
    fResponsavel.value= dadosOriginais.responsavel           ?? "";
    fEmail.value      = dadosOriginais.emailUnidade          ?? "";

    // Código readonly no modo edição
    fCodigo.value    = dadosOriginais.codigoVaga ?? "";
    fCodigo.readOnly = true;

    // Observações anteriores
    if (dadosOriginais.observacoes) {
      document.getElementById("obs-historico-wrapper").style.display = "";
      document.getElementById("obs-historico").textContent = dadosOriginais.observacoes;
    }

    // Acionar evento de seleção de empresa p/ popular cargos
    atualizarSelectCargos(dadosOriginais.empresaId, dadosOriginais.cargoId);
  }

  loadingEl.style.display = "none";
  formEl.style.display = "";

  // Indicador de cache
  renderCacheStatus(foiCacheHit, ["empresas", "cargos"]);

} catch (err) {
  if (!err.message.includes("não encontrada")) {
    loadingEl.innerHTML = `<p class="text-danger">Erro ao carregar: ${err.message}</p>`;
  }
}

// ── 3. Select dinâmico Empresa → Cargos ──────────────────────────
function atualizarSelectCargos(empresaId, cargoIdSelecionado = "") {
  fCargo.innerHTML = "";
  if (!empresaId) {
    fCargo.disabled = true;
    fCargo.innerHTML = `<option value="">Selecione a empresa primeiro</option>`;
    return;
  }

  const cargosFiltrados = todosCargos
    .filter(c => c.empresaId === empresaId)
    .sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "", "pt-BR"));

  if (cargosFiltrados.length === 0) {
    fCargo.innerHTML = `<option value="">Nenhum cargo cadastrado</option>`;
    fCargo.disabled = true;
    return;
  }

  fCargo.disabled = false;
  fCargo.innerHTML = `<option value="">Selecione o cargo...</option>`;
  cargosFiltrados.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase();
    opt.textContent = `${c.codigo} — ${desc || c.descricao}`;
    if (c.id === cargoIdSelecionado) opt.selected = true;
    fCargo.appendChild(opt);
  });

  atualizarCodigoAuto();
}

fEmpresa.addEventListener("change", () => {
  atualizarSelectCargos(fEmpresa.value);
});

// ── 4. Geração automática do código ──────────────────────────────
function atualizarCodigoAuto() {
  if (modoEdicao) return;
  const empresaOpt = fEmpresa.options[fEmpresa.selectedIndex];
  const cargoSel   = todosCargos.find(c => c.id === fCargo.value);
  const seq         = fSeq.value.trim();

  if (empresaOpt?.value && cargoSel && seq) {
    const empSigla = empresaOpt.textContent.split(/\s+/)[0];
    const codigoCargo = cargoSel.codigo ?? cargoSel.id;
    fCodigo.value = `${empSigla}.${codigoCargo}-${seq}`.toUpperCase();
  }
}

fCargo.addEventListener("change", atualizarCodigoAuto);
fSeq.addEventListener("input", atualizarCodigoAuto);

// ── 5. Preview data da observação ─────────────────────────────────
const hoje = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit" });
document.getElementById("preview-obs-data").textContent = `${hoje} - [seu texto]`;

// ── 6. Cancelar ───────────────────────────────────────────────────
document.getElementById("btn-cancelar").addEventListener("click", () => {
  if (modoEdicao) {
    window.location.href = `/vaga-detalhe.html?id=${vagaId}`;
  } else {
    window.location.href = "/vagas.html";
  }
});

// ── 7. Submissão do formulário ────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  const btnSalvar = document.getElementById("btn-salvar");
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Salvando...`;

  try {
    const novoCodigoVaga = fCodigo.value.trim().toUpperCase();
    const novoId = modoEdicao ? vagaId : gerarIdVaga(novoCodigoVaga);

    // Construir observações acumulativas (append-only)
    const obsNova = fObsNova.value.trim();
    let obsAcumulada = dadosOriginais?.observacoes ?? "";
    if (obsNova) {
      const prefixo = `${hoje} - ${obsNova}`;
      obsAcumulada = obsAcumulada
        ? obsAcumulada + "\n\n" + prefixo
        : prefixo;
    }

    const dadosNovos = {
      codigoVaga:            novoCodigoVaga,
      empresaId:             fEmpresa.value,
      cargoId:               fCargo.value,
      numeroSequencial:      parseInt(fSeq.value, 10) || null,
      situacao:              fSituacao.value,
      nomeColaborador:       fNome.value.trim().toUpperCase() || "",
      matriculaColaborador:  fMatricula.value.trim(),
      hierarquia:            fHierarquia.value.trim(),
      unidadeSigla:          fSigla.value.trim().toUpperCase() || "",
      unidadeNome:           fUnidade.value.trim(),
      localidade:            fLocalidade.value,
      regional:              fLocalidade.value,
      responsavel:           fResponsavel.value.trim(),
      emailUnidade:          fEmail.value.trim(),
      observacoes:           obsAcumulada,
      deleted:               false,
      atualizadoEm:          serverTimestamp(),
      atualizadoPor:         user.uid
    };

    if (!modoEdicao) {
      dadosNovos.criadoEm  = serverTimestamp();
      dadosNovos.criadoPor = user.uid;
    }

    // Detectar tipo de evento
    let tipoEvento = modoEdicao ? "EDICAO" : "CRIACAO";
    let descricaoEvento = modoEdicao ? `Vaga editada por ${dados.nome}` : `Vaga criada por ${dados.nome}`;

    if (modoEdicao && dadosOriginais) {
      const mudouSituacao = dadosOriginais.situacao !== fSituacao.value;
      const mudouColab    = dadosOriginais.nomeColaborador !== dadosNovos.nomeColaborador
                         || dadosOriginais.matriculaColaborador !== dadosNovos.matriculaColaborador;

      if (mudouSituacao) {
        tipoEvento = "STATUS_ALTERADO";
        descricaoEvento = `Situação alterada de "${dadosOriginais.situacao}" para "${fSituacao.value}" por ${dados.nome}`;
      } else if (mudouColab) {
        tipoEvento = "SUBSTITUICAO";
        descricaoEvento = `Colaborador alterado de "${dadosOriginais.nomeColaborador || '—'}" para "${dadosNovos.nomeColaborador || '—'}" por ${dados.nome}`;
      }
    }

    // ── Gravação atômica ─────────────────────────────────────────
    const batch = writeBatch(db);

    // 1. Vaga
    batch.set(doc(db, "vagas", novoId), dadosNovos, { merge: true });

    // 2. Evento na subcoleção
    batch.set(doc(collection(db, "vagas", novoId, "eventos")), {
      tipoEvento,
      descricao: descricaoEvento + (obsNova ? ` | Obs: ${obsNova}` : ""),
      registradoEm: serverTimestamp(),
      registradoPor: user.uid,
      nomeUsuario: dados.nome
    });

    // 3. Audit log
    batch.set(doc(collection(db, "audit_log")), {
      usuarioId:      user.uid,
      usuarioEmail:   user.email,
      nomeUsuario:    dados.nome,
      acao:           modoEdicao ? "UPDATE_VAGA" : "CREATE_VAGA",
      colecao:        "vagas",
      documentoId:    novoId,
      dadosAnteriores: dadosOriginais ?? {},
      dadosNovos:      dadosNovos,
      timestamp:      serverTimestamp()
    });

    await batch.commit();

    // ── IMPORTANTE: invalida o cache de vagas ────────────────────
    // A próxima abertura da lista/dashboard vai buscar dados frescos do Firestore
    invalidateVagas();

    showToast(modoEdicao ? "Vaga atualizada com sucesso!" : "Vaga criada com sucesso!", "success");
    setTimeout(() => window.location.href = `/vaga-detalhe.html?id=${novoId}`, 1200);

  } catch (err) {
    showToast("Erro ao salvar: " + err.message, "danger");
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = `<i class="bi bi-floppy-fill me-1"></i>Salvar`;
  }
});
