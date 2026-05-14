import { checkAuth } from "./auth.js";
import { renderLayout, setPageTitle } from "./layout.js";
import { db } from "./firebase-config.js";
import { gerarIdVaga, chunks, showToast } from "./utils.js";
import {
  writeBatch,
  doc,
  serverTimestamp,
  collection
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Exigir perfil de editor ou superior
const authResult = await checkAuth("editor");
if (authResult) {
  const { user, dados } = authResult;
  renderLayout("importar", dados);
  setPageTitle("Importar Planilha");

  // Elementos do DOM
  const uploadZone = document.getElementById("upload-zone");
  const fileInput = document.getElementById("file-input");
  const previewContainer = document.getElementById("preview-container");
  const progressContainer = document.getElementById("progress-container");
  const btnImportar = document.getElementById("btn-importar");
  const btnCancelar = document.getElementById("btn-cancelar");

  let vagasParaImportar = [];
  let cargosParaImportar = [];
  let empresasParaImportar = [];

  // ────────────────────────────────────────────────────────
  // 1. Interações de Drag & Drop e Upload
  // ────────────────────────────────────────────────────────
  uploadZone.addEventListener("click", () => fileInput.click());
  
  uploadZone.addEventListener("dragover", (e) => { 
    e.preventDefault(); 
    uploadZone.classList.add("dragover"); 
  });
  
  uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
  });
  
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
  });
  
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) processFile(e.target.files[0]);
  });

  function logInfo(msg, type = "info") {
    const container = document.getElementById("log-container");
    const el = document.createElement("div");
    el.className = `log-${type}`;
    el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function normalizeKey(key) {
    return key.trim().toUpperCase();
  }

  // Converte string para float, retornando 0 se não for um número válido
  function safeFloat(str) {
    if (!str || str.trim() === '' || str.trim() === '-') return 0;
    const n = parseFloat(str.trim().replace(/,/g, '.'));
    return isNaN(n) ? 0 : n;
  }

  // Converte string para int, retornando null se vazio ou não numérico
  function safeInt(str) {
    if (!str || str.trim() === '') return null;
    const n = parseInt(str.trim(), 10);
    return isNaN(n) ? null : n;
  }

  // ────────────────────────────────────────────────────────
  // 2. Leitura da Planilha com SheetJS
  // ────────────────────────────────────────────────────────
  function processFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        
        // 2.1 Processar aba "Cargos" (se existir)
        const nomeAbaCargos = workbook.SheetNames.find(n => n.toUpperCase().includes("CARGO"));
        if (nomeAbaCargos) {
          const sheetCargos = workbook.Sheets[nomeAbaCargos];
          const jsonCargos = XLSX.utils.sheet_to_json(sheetCargos, { raw: false, defval: "" });
          processarCargos(jsonCargos);
        }
        
        // 2.2 Processar aba "Vagas" (Tenta achar aba com Vaga no nome, senao pega a 1a aba)
        const nomeAbaVagas = workbook.SheetNames.find(n => n.toUpperCase().includes("VAGA")) || workbook.SheetNames[0];
        const sheetVagas = workbook.Sheets[nomeAbaVagas];
        const jsonVagas = XLSX.utils.sheet_to_json(sheetVagas, { raw: false, defval: "" });
        processarVagas(jsonVagas);

      } catch (err) {
        showToast("Erro ao ler o arquivo: " + err.message, "danger");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ────────────────────────────────────────────────────────
  // 3. Transformação e Mapeamento de Cargos e Empresas
  // ────────────────────────────────────────────────────────
  function processarCargos(rows) {
    empresasParaImportar = [];
    cargosParaImportar = [];
    const empresasSet = new Set();
    
    rows.forEach(r => {
      const keys = Object.keys(r);
      const getVal = (possibleKeys) => {
        const key = keys.find(k => possibleKeys.some(pk => normalizeKey(k).includes(pk)));
        return key ? String(r[key]).trim() : "";
      };
      
      const empresaNome = getVal(["EMPRESA"]);
      const cargoNome = getVal(["CARGO"]);
      if (!empresaNome || !cargoNome) return;
      
      const empresaId = gerarIdVaga(empresaNome);
      
      if (!empresasSet.has(empresaId)) {
        empresasSet.add(empresaId);
        empresasParaImportar.push({
          id: empresaId,
          nome: empresaNome.toUpperCase(),
          contrato: getVal(["LOTE", "CONTRATO"]),
          ativo: true
        });
      }
      
      const partesCargo = cargoNome.split("-");
      const codigoCargo = partesCargo[0].trim();
      const descricaoCargo = partesCargo.slice(1).join("-").trim() || cargoNome;
      const cargoId = gerarIdVaga(empresaId + "-" + codigoCargo);
      
      cargosParaImportar.push({
        id: cargoId,
        empresaId: empresaId,
        codigo: codigoCargo,
        descricao: descricaoCargo,
        salario: safeFloat(getVal(["SALARIO", "SALÁRIO"])),
        valeAlimentacao: safeFloat(getVal(["VALE", "ALIMENTAÇÃO", "ALIMENTACAO"])),
        custoPostoMensal: safeFloat(getVal(["CUSTO"])),
        cargaHorariaDiaria: getVal(["DIÁRIA", "DIARIA"]),
        cargaHorariaSemanal: getVal(["SEMANAL"]),
        quantitativoPrevisto: safeInt(getVal(["QUANTITATIVO", "PREVISTO"])) ?? 0
      });
    });
  }

  // ────────────────────────────────────────────────────────
  // 4. Transformação e Mapeamento de Vagas
  // ────────────────────────────────────────────────────────
  function processarVagas(rows) {
    vagasParaImportar = [];
    
    rows.forEach(r => {
      const keys = Object.keys(r);
      const getVal = (possibleKeys) => {
        const key = keys.find(k => possibleKeys.some(pk => normalizeKey(k).includes(pk)));
        return key ? String(r[key]).trim() : "";
      };

      const codigoVaga = getVal(["CÓDIGO DA VAGA", "CODIGO DA VAGA"]);
      if (!codigoVaga) return; // Obrigatório p/ criar doc
      
      const empresa = getVal(["EMPRESA"]);
      const cargo = getVal(["CARGO"]);
      const empresaId = empresa ? gerarIdVaga(empresa) : "";
      const codigoCargo = cargo ? cargo.split("-")[0].trim() : "";
      const cargoId = (empresaId && codigoCargo) ? gerarIdVaga(empresaId + "-" + codigoCargo) : "";

      const situacao = getVal(["SITUAÇÃO", "SITUACAO", "STATUS"]) || "LIVRE";

      const vaga = {
        id: gerarIdVaga(codigoVaga),
        codigoVaga: codigoVaga,
        empresaId: empresaId,
        cargoId: cargoId,
        numeroSequencial: safeInt(getVal(["Nº", "NUMERO SEQUENCIAL", "SEQ", "NUMERO"])),
        situacao: situacao.toUpperCase(),
        matriculaColaborador: getVal(["MATRÍCULA", "MATRICULA"]),
        nomeColaborador: getVal(["NOME"]),
        hierarquia: getVal(["HIERARQUIA"]),
        unidadeSigla: getVal(["SIGLA"]) || getVal(["UNIDADE (SIGLA)"]),
        unidadeNome: getVal(["NOME COMPLETO", "UNIDADE (NOME COMPLETO)"]) || getVal(["UNIDADE"]),
        localidade: getVal(["LOCALIDADE"]),
        regional: getVal(["LOCALIDADE", "REGIONAL"]),
        responsavel: getVal(["RESPONSÁVEL", "RESPONSAVEL"]),
        emailUnidade: getVal(["EMAIL", "E-MAIL"]),
        observacoes: getVal(["OBSERVAÇÕES", "OBSERVACOES"]),
        deleted: false,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user.uid
      };
      
      vagasParaImportar.push(vaga);
    });
    
    if (vagasParaImportar.length > 0) {
      document.getElementById("total-vagas-badge").textContent = `${vagasParaImportar.length} Vagas detectadas`;
      document.getElementById("upload-card").style.display = "none";
      previewContainer.style.display = "block";
      renderPreview();
    } else {
      showToast("Nenhuma vaga identificada com 'CÓDIGO DA VAGA'. Verifique o cabeçalho.", "warning");
    }
  }

  // ────────────────────────────────────────────────────────
  // 5. Exibir Preview
  // ────────────────────────────────────────────────────────
  function renderPreview() {
    const head = document.getElementById("preview-head");
    const body = document.getElementById("preview-body");
    
    head.innerHTML = `
      <tr>
        <th>Código</th>
        <th>Empresa</th>
        <th>Situação</th>
        <th>Colaborador</th>
        <th>Unidade</th>
      </tr>`;
      
    body.innerHTML = vagasParaImportar.slice(0, 10).map(v => `
      <tr>
        <td><strong>${v.codigoVaga}</strong></td>
        <td>${v.empresaId ? v.empresaId.toUpperCase() : "—"}</td>
        <td><span class="badge bg-secondary">${v.situacao}</span></td>
        <td>${v.nomeColaborador || "—"}</td>
        <td>${v.unidadeSigla || "—"}</td>
      </tr>
    `).join("");
  }

  // Cancelar upload
  btnCancelar.addEventListener("click", () => {
    vagasParaImportar = [];
    cargosParaImportar = [];
    empresasParaImportar = [];
    fileInput.value = "";
    previewContainer.style.display = "none";
    document.getElementById("upload-card").style.display = "block";
  });

  // ────────────────────────────────────────────────────────
  // 6. Efetivar Importação (Batch do Firestore)
  // ────────────────────────────────────────────────────────
  btnImportar.addEventListener("click", async () => {
    btnImportar.disabled = true;
    btnCancelar.disabled = true;
    previewContainer.style.display = "none";
    progressContainer.style.display = "block";
    
    document.getElementById("prog-total").textContent = vagasParaImportar.length;
    
    try {
      // 6.1 Salvar Empresas e Cargos (se houver)
      if (empresasParaImportar.length > 0 || cargosParaImportar.length > 0) {
        logInfo(`Importando ${empresasParaImportar.length} empresas e ${cargosParaImportar.length} cargos...`);
        const batchRefConfig = writeBatch(db);
        
        empresasParaImportar.forEach(emp => {
          batchRefConfig.set(doc(db, "empresas", emp.id), emp, { merge: true });
        });
        cargosParaImportar.forEach(c => {
          batchRefConfig.set(doc(db, "cargos", c.id), c, { merge: true });
        });
        
        await batchRefConfig.commit();
        document.getElementById("prog-cargos").textContent = (empresasParaImportar.length + cargosParaImportar.length);
        logInfo("Empresas e Cargos importados com sucesso.", "success");
      }
      
      // 6.2 Salvar Vagas em lotes de 400 (Limite é 500 ops)
      let processadas = 0;
      let erros = 0;
      const lotes = chunks(vagasParaImportar, 400); 
      
      for (let i = 0; i < lotes.length; i++) {
        const lote = lotes[i];
        const batch = writeBatch(db);
        
        lote.forEach(vaga => {
          // Mantém a data de criação se já existir (merge: true não apaga dados omitidos)
          // Mas garante que tenha criadoEm se for novo.
          const vData = { ...vaga };
          vData.criadoEm = vData.atualizadoEm; // No primeiro save, será igual
          vData.criadoPor = user.uid;
          
          batch.set(doc(db, "vagas", vaga.id), vData, { merge: true });
        });
        
        try {
          await batch.commit();
          processadas += lote.length;
          document.getElementById("prog-atual").textContent = processadas;
          
          const porcentagem = Math.round((processadas / vagasParaImportar.length) * 100);
          const bar = document.getElementById("progress-bar");
          bar.style.width = `${porcentagem}%`;
          bar.textContent = `${porcentagem}%`;
          
          logInfo(`Lote ${i+1}/${lotes.length} sincronizado (${lote.length} vagas).`);
        } catch (err) {
          erros += lote.length;
          document.getElementById("prog-erros").textContent = erros;
          logInfo(`Erro no lote ${i+1}: ${err.message}`, "error");
        }
      }
      
      // 6.3 Gravar Log de Auditoria
      try {
        const auditBatch = writeBatch(db);
        auditBatch.set(doc(collection(db, "audit_log")), {
          usuarioId: user.uid,
          usuarioEmail: user.email,
          nomeUsuario: dados.nome,
          acao: "IMPORT",
          colecao: "vagas",
          documentoId: "MULTIPLE",
          dadosAnteriores: {},
          dadosNovos: { importadas: processadas, erros: erros, total: vagasParaImportar.length },
          timestamp: serverTimestamp()
        });
        await auditBatch.commit();
      } catch (err) {
        logInfo("Falha ao salvar auditoria. " + err.message, "warning");
      }
      
      // Conclusão
      document.getElementById("progress-status").textContent = "Importação Concluída!";
      document.getElementById("progress-bar").classList.remove("progress-bar-animated");
      document.getElementById("progress-bar").classList.add("bg-success");
      
      document.getElementById("btn-voltar-container").style.display = "flex";
      logInfo("Processo de importação finalizado.", "success");
      
    } catch (error) {
      logInfo("Erro fatal: " + error.message, "error");
      document.getElementById("progress-status").textContent = "Erro na Importação";
      document.getElementById("btn-voltar-container").style.display = "flex";
    }
  });
}
