/**
 * firestore-cache.js — Camada de acesso ao Firestore com cache embutido
 *
 * Todas as funções aqui são drop-in replacements para queries diretas ao Firestore.
 * Na primeira chamada lêem do banco e guardam em sessionStorage.
 * Nas chamadas seguintes retornam do cache sem tocar no Firestore.
 *
 * Hierarquia de TTLs:
 *   empresas  → 10 min  (coleção quase estática)
 *   cargos    → 10 min  (coleção quase estática)
 *   vagas     → 3 min   (invalidado manualmente após saves)
 */

import { db } from "./firebase-config.js";
import {
  collection, query, where,
  getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { cacheGet, cacheSet, cacheInvalidate } from "./cache.js";

const TTL_ESTATICO = 60 * 60 * 1000;  // 1 hora para empresas e cargos (coleções quase estáticas)
const TTL_VAGAS    =  3 * 60 * 1000;  // 3 minutos para vagas

// ── Empresas ────────────────────────────────────────────────────────────────

/**
 * Retorna todas as empresas. Usa cache de 10 minutos.
 * @returns {Promise<Array<{id, nome, ...}>>}
 */
export async function getEmpresas() {
  const cached = cacheGet("empresas");
  if (cached) return cached;

  const snap = await getDocs(collection(db, "empresas"));
  const data = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));

  cacheSet("empresas", data, TTL_ESTATICO);
  return data;
}

/**
 * Retorna mapa { empresaId → nome } para lookups rápidos.
 * @returns {Promise<Record<string, string>>}
 */
export async function getEmpresasMap() {
  const list = await getEmpresas();
  return Object.fromEntries(list.map(e => [e.id, (e.nome ?? e.id).toUpperCase()]));
}

// ── Cargos ───────────────────────────────────────────────────────────────────

/**
 * Retorna todos os cargos. Usa cache de 10 minutos.
 * @returns {Promise<Array<{id, empresaId, codigo, descricao, ...}>>}
 */
export async function getCargos() {
  const cached = cacheGet("cargos");
  if (cached) return cached;

  const snap = await getDocs(collection(db, "cargos"));
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  cacheSet("cargos", data, TTL_ESTATICO);
  return data;
}

/**
 * Retorna mapa { cargoId → descrição legível } para lookups rápidos.
 * Remove o prefixo antes do hífen (ex: "CARGO 01 - PORTEIRO" → "PORTEIRO").
 * @returns {Promise<Record<string, string>>}
 */
export async function getCargosMap() {
  const list = await getCargos();
  return Object.fromEntries(list.map(c => {
    const desc = (c.descricao ?? "").replace(/^[^-]+-\s*/, "").trim().toUpperCase();
    return [c.id, desc || (c.descricao ?? "").toUpperCase()];
  }));
}

// ── Vagas ────────────────────────────────────────────────────────────────────

/**
 * Retorna todas as vagas ativas. Usa cache de 3 minutos.
 * @returns {Promise<Array<{id, codigoVaga, ...}>>}
 */
export async function getVagas() {
  const cached = cacheGet("vagas");
  if (cached) return cached;

  const snap = await getDocs(
    query(collection(db, "vagas"), where("deleted", "==", false))
  );
  const data = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.codigoVaga ?? "").localeCompare(b.codigoVaga ?? "", "pt-BR"));

  cacheSet("vagas", data, TTL_VAGAS);
  return data;
}

/**
 * Retorna uma vaga pelo ID.
 * Primeiro tenta encontrá-la no cache de vagas (sem nova leitura).
 * Só faz getDoc() individual se o cache de vagas não estiver disponível.
 * @param {string} id
 * @returns {Promise<{id, codigoVaga, ...}|null>}
 */
export async function getVagaById(id) {
  // Tenta o cache de lista completa primeiro
  const cached = cacheGet("vagas");
  if (cached) {
    const found = cached.find(v => v.id === id);
    if (found) return found;
  }

  // Fallback: leitura individual (1 read)
  const snap = await getDoc(doc(db, "vagas", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Invalida o cache de vagas.
 * Deve ser chamado sempre que uma vaga for criada, editada ou excluída.
 */
export function invalidateVagas() {
  cacheInvalidate("vagas");
}

/**
 * Invalida o cache de empresas (após importação ou cadastro de empresa).
 */
export function invalidateEmpresas() {
  cacheInvalidate("empresas");
}

/**
 * Invalida o cache de cargos (após importação ou cadastro de cargo).
 */
export function invalidateCargos() {
  cacheInvalidate("cargos");
}
