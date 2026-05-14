/**
 * cache.js — Cache em sessionStorage com TTL
 *
 * Todas as chaves são prefixadas com "sgt_" para evitar colisões.
 * O cache é compartilhado entre páginas da mesma aba/sessão e
 * limpo automaticamente ao fechar o navegador.
 *
 * TTLs recomendados:
 *   empresas / cargos → 10 minutos  (raramente mudam)
 *   vagas             → 3 minutos   (invalidado manualmente ao salvar)
 */

const PREFIX = "sgt_cache_";

/**
 * Recupera um item do cache.
 * Retorna null se não existir ou se tiver expirado.
 * @param {string} key
 * @returns {any|null}
 */
export function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { data, ts, ttl } = JSON.parse(raw);
    if (Date.now() - ts > ttl) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Armazena um item no cache com TTL em milissegundos.
 * @param {string} key
 * @param {any} data
 * @param {number} ttlMs — tempo de vida em ms (default: 5 minutos)
 */
export function cacheSet(key, data, ttlMs = 5 * 60 * 1000) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({
      data,
      ts: Date.now(),
      ttl: ttlMs
    }));
  } catch {
    // Ignora erros de quota do sessionStorage (navegador em modo privado, etc.)
  }
}

/**
 * Remove um item específico do cache.
 * @param {string} key
 */
export function cacheInvalidate(key) {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch { /* noop */ }
}

/**
 * Remove todos os itens do cache SGT.
 */
export function cacheInvalidateAll() {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
  } catch { /* noop */ }
}

/**
 * Retorna informações sobre o estado atual do cache (para debug).
 * @returns {Array<{key, expiresIn, sizeKb}>}
 */
export function cacheDebugInfo() {
  try {
    return Object.keys(sessionStorage)
      .filter(k => k.startsWith(PREFIX))
      .map(k => {
        const raw = sessionStorage.getItem(k);
        const { ts, ttl } = JSON.parse(raw);
        const expiresIn = Math.round((ts + ttl - Date.now()) / 1000);
        return {
          key: k.replace(PREFIX, ""),
          expiresIn: expiresIn > 0 ? `${expiresIn}s` : "expirado",
          sizeKb: (raw.length / 1024).toFixed(1) + " KB"
        };
      });
  } catch {
    return [];
  }
}
