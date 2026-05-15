import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle, renderCacheStatus } from "./layout.js";
import { db } from "./firebase-config.js";
import { badgeSituacao, showToast } from "./utils.js";
import { cacheGet } from "./cache.js";
import {
  doc, getDoc, getDocs, collection, query,
  orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Auth ──────────────────────────────────────────────────────
const authResult = await checkAuth("visualizador");
if (!authResult) throw new Error("Não autenticado");
const { user, dados } = authResult;
const isAdmin  = dados.perfil === "admin";
const isEditor = ["admin", "editor"].includes(dados.perfil);

renderLayout("vagas", dados);

// ── Ler ?id= da URL ───────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const vagaId = params.get("id");
if (!vagaId) { window.location.href = "/vagas.html"; throw new Error("Sem ID"); }

setPageTitle("Detalhe da Vaga");

// ── Elementos DOM ─────────────────────────────────────────────
const loadingEl  = document.getElementById("loading-detalhe");
const conteudoEl = document.getElementById("conteudo-detalhe");
const acoesEl    = document.getElementById("acoes-header");
const timelineEl = document.getElementById("timeline-eventos");
const badgeEv    = document.getElementById("badge-eventos");

// ── Helper ────────────────────────────────────────────────────
function setVal(id, valor) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!valor || valor === "—") {
    el.innerHTML = `<span class="vazio">—</span>`;
  } else {
    el.textContent = valor;
  }
}

// ── 1. Carregar dados ─────────────────────────────────────────
// Tenta ler vaga do cache de lista (se vier de vagas.html, 0 leituras extras).
// Para cargos e empresas usa o sessionStorage se disponível.
// Caso contrário faz as queries diretas ao Firestore (comportamento original).
let vagaData;
try {
  // Detecta cache hit ANTES de buscar (para o indicador visual)
  const vagasCache  = cacheGet("vagas");
  const cargosCache = cacheGet("cargos");
  const empresasCache = cacheGet("empresas");
  const foiCacheHit = !!(vagasCache && cargosCache && empresasCache);

  // ── Vaga: do cache de lista ou leitura direta ─────────────
  let vagaObj = null;
  if (vagasCache) {
    vagaObj = vagasCache.find(v => v.id === vagaId) ?? null;
  }
  if (!vagaObj) {
    // Fallback: leitura direta (como o original)
    const vagaSnap = await getDoc(doc(db, "vagas", vagaId));
    if (vagaSnap.exists()) {
      vagaObj = { id: vagaSnap.id, ...vagaSnap.data() };
    }
  }

  if (!vagaObj) {
    showToast("Vaga não encontrada.", "danger");
    setTimeout(() => window.location.href = "/vagas.html", 2000);
    throw new Error("Vaga não encontrada");
  }
  vagaData = vagaObj;

  // ── Cargos: do cache ou query ─────────────────────────────
  const cargosMap = {};
  if (cargosCache) {
    cargosCache.forEach(c => {
      const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase();
      cargosMap[c.id] = desc || (c.descricao ?? "").toUpperCase();
    });
  } else {
    const snap = await getDocs(collection(db, "cargos"));
    snap.docs.forEach(d => {
      const c = d.data();
      const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase();
      cargosMap[d.id] = desc || (c.descricao ?? "").toUpperCase();
    });
  }

  // ── Empresas: do cache ou query ───────────────────────────
  const empresasMap = {};
  if (empresasCache) {
    empresasCache.forEach(e => { empresasMap[e.id] = (e.nome ?? e.id).toUpperCase(); });
  } else {
    const snap = await getDocs(collection(db, "empresas"));
    snap.docs.forEach(d => { empresasMap[d.id] = (d.data().nome ?? d.id).toUpperCase(); });
  }

  // ── 2. Preencher campos ────────────────────────────────────
  document.getElementById("titulo-vaga").textContent = vagaData.codigoVaga ?? "Vaga";
  document.getElementById("subtitulo-vaga").textContent =
    `${empresasMap[vagaData.empresaId] ?? vagaData.empresaId ?? "—"} · ${cargosMap[vagaData.cargoId] ?? vagaData.cargoId ?? "—"}`;

  setVal("d-codigoVaga", vagaData.codigoVaga);
  setVal("d-numSeq", vagaData.numeroSequencial?.toString());
  setVal("d-nome", vagaData.nomeColaborador);
  setVal("d-matricula", vagaData.matriculaColaborador);
  setVal("d-hierarquia", vagaData.hierarquia);
  setVal("d-sigla", vagaData.unidadeSigla);
  setVal("d-unidade", vagaData.unidadeNome);
  setVal("d-localidade", vagaData.localidade);
  setVal("d-responsavel", vagaData.responsavel);
  setVal("d-email", vagaData.emailUnidade);
  setVal("d-empresa", empresasMap[vagaData.empresaId] ?? vagaData.empresaId);
  setVal("d-cargo", cargosMap[vagaData.cargoId] ?? vagaData.cargoId);

  // Badge de situação
  const situEl = document.getElementById("d-situacao");
  situEl.innerHTML = `<span class="badge bg-${badgeSituacao(vagaData.situacao)} text-uppercase" style="font-size:12px; letter-spacing:.04em;">${vagaData.situacao ?? "—"}</span>`;

  // Observações
  const obsEl = document.getElementById("d-observacoes");
  obsEl.textContent = vagaData.observacoes || "—";

  // ── 3. Botões de ação ──────────────────────────────────────
  const btnDetalheHtml = [];
  if (isEditor) {
    btnDetalheHtml.push(`
      <a href="/vaga-form.html?id=${vagaId}" class="btn btn-primary">
        <i class="bi bi-pencil-fill me-1"></i>Editar
      </a>`);
  }
  if (isAdmin) {
    btnDetalheHtml.push(`
      <button class="btn btn-outline-danger" id="btn-inativar">
        <i class="bi bi-trash3 me-1"></i>Inativar
      </button>`);
  }
  acoesEl.innerHTML = btnDetalheHtml.join("");

  // Configurar soft delete
  const btnInativar = document.getElementById("btn-inativar");
  if (btnInativar) {
    document.getElementById("modal-codigo-vaga").textContent = vagaData.codigoVaga;
    const modal = new bootstrap.Modal(document.getElementById("modal-inativar"));
    btnInativar.addEventListener("click", () => modal.show());

    document.getElementById("btn-confirmar-inativar").addEventListener("click", async () => {
      const btn = document.getElementById("btn-confirmar-inativar");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Inativando...`;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, "vagas", vagaId), {
          deleted: true, atualizadoEm: serverTimestamp(), atualizadoPor: user.uid
        });
        batch.set(doc(collection(db, "vagas", vagaId, "eventos")), {
          tipoEvento: "INATIVACAO",
          descricao: `Vaga inativada (soft delete) por ${dados.nome}`,
          registradoEm: serverTimestamp(),
          registradoPor: user.uid,
          nomeUsuario: dados.nome
        });
        batch.set(doc(collection(db, "audit_log")), {
          usuarioId: user.uid, usuarioEmail: user.email, nomeUsuario: dados.nome,
          acao: "DELETE_VAGA", colecao: "vagas", documentoId: vagaId,
          dadosAnteriores: { deleted: false }, dadosNovos: { deleted: true },
          timestamp: serverTimestamp()
        });
        await batch.commit();

        // Invalida cache de vagas
        try {
          const { invalidateVagas } = await import("./firestore-cache.js");
          invalidateVagas();
        } catch (_) { /* noop */ }

        showToast("Vaga inativada com sucesso.", "success");
        setTimeout(() => window.location.href = "/vagas.html", 1500);
      } catch (err) {
        showToast("Erro ao inativar: " + err.message, "danger");
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-trash3 me-1"></i>Confirmar Inativação`;
      }
    });
  }

  // Mostrar conteúdo
  loadingEl.style.display = "none";
  conteudoEl.style.display = "";

  // Indicador de cache
  renderCacheStatus(foiCacheHit, ["vagas", "cargos", "empresas"]);

} catch (err) {
  if (!err.message.includes("não encontrada") && !err.message.includes("Sem ID")) {
    loadingEl.innerHTML = `
      <i class="bi bi-exclamation-triangle-fill text-danger fs-1 mb-3 d-block"></i>
      <p class="text-danger">Erro ao carregar: ${err.message}</p>`;
  }
}

// ── 4. Carregar Timeline — sempre do Firestore ────────────────
try {
  const eventosSnap = await getDocs(query(
    collection(db, "vagas", vagaId, "eventos"),
    orderBy("registradoEm", "desc")
  ));

  badgeEv.textContent = eventosSnap.size;

  if (eventosSnap.empty) {
    timelineEl.innerHTML = `
      <div class="timeline-empty">
        <i class="bi bi-clock-history fs-2 mb-2 d-block opacity-25"></i>
        Nenhum evento registrado.<br>
        <small>O histórico cresce a partir das próximas edições.</small>
      </div>`;
    return;
  }

  const iconePorTipo = {
    "CRIACAO":        { cls: "dot-criacao",      icon: "bi-plus-lg" },
    "EDICAO":         { cls: "dot-edicao",        icon: "bi-pencil" },
    "STATUS_ALTERADO":{ cls: "dot-status",        icon: "bi-arrow-left-right" },
    "SUBSTITUICAO":   { cls: "dot-substituicao",  icon: "bi-person-fill-gear" },
    "INATIVACAO":     { cls: "dot-outros",        icon: "bi-trash3" }
  };

  timelineEl.innerHTML = eventosSnap.docs.map(d => {
    const ev = d.data();
    const meta = iconePorTipo[ev.tipoEvento] ?? { cls: "dot-outros", icon: "bi-circle" };
    const dataStr = ev.registradoEm?.toDate
      ? ev.registradoEm.toDate().toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })
      : "—";

    return `
      <div class="timeline-item">
        <div class="timeline-dot ${meta.cls}">
          <i class="bi ${meta.icon}"></i>
        </div>
        <div class="timeline-data">${dataStr}</div>
        <div class="timeline-desc">${ev.descricao ?? "—"}</div>
        <div class="timeline-usuario"><i class="bi bi-person me-1"></i>${ev.nomeUsuario ?? "—"}</div>
      </div>`;
  }).join("");

} catch (err) {
  timelineEl.innerHTML = `<p class="text-danger small">Erro ao carregar eventos: ${err.message}</p>`;
}
