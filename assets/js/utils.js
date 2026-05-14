/**
 * Formata um Firestore Timestamp ou Date para DD/MM/AAAA
 */
function formatarData(valor) {
  if (!valor) return "—";
  const d = valor.toDate ? valor.toDate() : new Date(valor);
  return d.toLocaleDateString("pt-BR");
}

/**
 * Formata um Firestore Timestamp para DD/MM/AAAA HH:mm
 */
function formatarDataHora(valor) {
  if (!valor) return "—";
  const d = valor.toDate ? valor.toDate() : new Date(valor);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/**
 * Gera um ID seguro para Firestore a partir do código da vaga.
 * Ex: "FGR095.CARGO 03-1" → "fgr095-cargo03-1"
 */
function gerarIdVaga(codigoVaga) {
  return codigoVaga
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Divide um array em chunks de tamanho máximo.
 * Usado para batch writes no Firestore (máx 500, usamos 450).
 */
function chunks(arr, size = 450) {
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size)
  );
}

/**
 * Retorna a classe Bootstrap do badge por situação da vaga.
 */
function badgeSituacao(situacao) {
  const mapa = {
    "ATIVA":                    "success",
    "EXTINÇÃO DE VAGA":         "danger",
    "AGUARDANDO SUBSTITUIÇÃO":  "warning",
    "EM CONTRATAÇÃO":           "primary",
    "LICENÇA":                  "warning",
    "RESERVADA":                "secondary",
    "LIVRE":                    "secondary",
    "UTILIZADA P/ ADITIVO":     "secondary"
  };
  return mapa[situacao] ?? "secondary";
}

/**
 * Exibe um toast de notificação (requer #toast-container no DOM).
 * @param {string} mensagem
 * @param {"success"|"danger"|"warning"|"info"} tipo
 */
function showToast(mensagem, tipo = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const id = "toast-" + Date.now();
  const html = `
    <div id="${id}" class="toast align-items-center text-bg-${tipo} border-0" role="alert" aria-live="assertive">
      <div class="d-flex">
        <div class="toast-body">${mensagem}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

export { formatarData, formatarDataHora, gerarIdVaga, chunks, badgeSituacao, showToast };
