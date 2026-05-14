import { logout } from "./auth.js";
import { cacheGet, cacheInvalidateAll } from "./cache.js";

/**
 * Injeta o layout padrão (header + sidebar) na página.
 * Chamar após checkAuth() para ter os dados do usuário disponíveis.
 *
 * @param {string} paginaAtiva - slug da página para destacar no menu
 * @param {object} dadosUsuario - { nome, perfil } do usuário logado
 */
function renderLayout(paginaAtiva, dadosUsuario) {
  const isAdmin  = dadosUsuario.perfil === "admin";
  const isEditor = ["admin", "editor"].includes(dadosUsuario.perfil);

  const sidebar = `
  <nav id="sidebar" class="sidebar d-flex flex-column">
    <div class="sidebar-brand">
      <span class="sidebar-brand-icon"><i class="bi bi-people-fill"></i></span>
      <span class="sidebar-brand-text">SGT<span class="text-accent">·</span>DIEP</span>
    </div>

    <ul class="sidebar-menu flex-grow-1">
      <li class="menu-label">Principal</li>
      <li>
        <a href="/dashboard.html" class="${paginaAtiva === 'dashboard' ? 'active' : ''}">
          <i class="bi bi-grid-1x2-fill"></i> Dashboard
        </a>
      </li>
      <li>
        <a href="/vagas.html" class="${paginaAtiva === 'vagas' ? 'active' : ''}">
          <i class="bi bi-card-list"></i> Vagas
        </a>
      </li>
      <li>
        <a href="/cargos.html" class="${paginaAtiva === 'cargos' ? 'active' : ''}">
          <i class="bi bi-briefcase-fill"></i> Cargos
        </a>
      </li>

      <li class="menu-label">Operações</li>
      ${isEditor ? `
      <li>
        <a href="/importar.html" class="${paginaAtiva === 'importar' ? 'active' : ''}">
          <i class="bi bi-file-earmark-arrow-up-fill"></i> Importar Planilha
        </a>
      </li>` : ""}
      <li>
        <a href="/relatorios.html" class="${paginaAtiva === 'relatorios' ? 'active' : ''}">
          <i class="bi bi-file-earmark-spreadsheet-fill"></i> Relatórios
        </a>
      </li>

      ${isAdmin ? `
      <li class="menu-label">Administração</li>
      <li>
        <a href="/usuarios.html" class="${paginaAtiva === 'usuarios' ? 'active' : ''}">
          <i class="bi bi-person-fill-gear"></i> Usuários
        </a>
      </li>
      <li>
        <a href="/auditoria.html" class="${paginaAtiva === 'auditoria' ? 'active' : ''}">
          <i class="bi bi-shield-fill-check"></i> Auditoria
        </a>
      </li>` : ""}
    </ul>

    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${dadosUsuario.nome.charAt(0).toUpperCase()}</div>
        <div class="user-meta">
          <span class="user-name">${dadosUsuario.nome.split(" ")[0]}</span>
          <span class="user-role">${traduzirPerfil(dadosUsuario.perfil)}</span>
        </div>
      </div>
      <button class="btn-logout" id="btn-logout" title="Sair">
        <i class="bi bi-box-arrow-right"></i>
      </button>
    </div>
  </nav>`;

  const header = `
  <header class="topbar">
    <button class="sidebar-toggle" id="sidebar-toggle">
      <i class="bi bi-list"></i>
    </button>
    <div class="topbar-title" id="topbar-title"></div>
    <div class="topbar-right">
      <div id="cache-status-badge"></div>
      <span class="badge-perfil badge-perfil--${dadosUsuario.perfil}">
        ${traduzirPerfil(dadosUsuario.perfil)}
      </span>
    </div>
  </header>`;

  // Injeta no DOM
  document.getElementById("layout-sidebar").innerHTML = sidebar;
  document.getElementById("layout-header").innerHTML  = header;

  // Toast container (para notificações)
  if (!document.getElementById("toast-container")) {
    const tc = document.createElement("div");
    tc.id = "toast-container";
    tc.className = "toast-container position-fixed bottom-0 end-0 p-3";
    tc.style.zIndex = "9999";
    document.body.appendChild(tc);
  }

  // Evento de logout
  document.getElementById("btn-logout").addEventListener("click", async () => {
    if (confirm("Deseja sair do sistema?")) await logout();
  });

  // Toggle sidebar (mobile)
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}

/**
 * Define o título exibido no topbar.
 */
function setPageTitle(titulo) {
  const el = document.getElementById("topbar-title");
  if (el) el.textContent = titulo;
  document.title = `${titulo} — SGT DIEP`;
}

function traduzirPerfil(perfil) {
  const mapa = { admin: "Administrador", editor: "Editor", visualizador: "Visualizador" };
  return mapa[perfil] ?? perfil;
}

/**
 * Exibe o indicador de cache no topbar.
 * Deve ser chamado APÓS carregar os dados da página.
 *
 * @param {boolean} cacheHit - true se os dados vieram do cache, false se do Firestore
 * @param {string[]} chavesCacheadas - chaves que estão no cache (ex: ['vagas', 'cargos'])
 */
function renderCacheStatus(cacheHit, chavesCacheadas = []) {
  const container = document.getElementById("cache-status-badge");
  if (!container) return;

  // Calcula menor TTL restante entre as chaves informadas
  let menorExpiracao = null;
  const PREFIX = "sgt_cache_";
  chavesCacheadas.forEach(k => {
    try {
      const raw = sessionStorage.getItem(PREFIX + k);
      if (!raw) return;
      const { ts, ttl } = JSON.parse(raw);
      const restante = Math.round((ts + ttl - Date.now()) / 1000);
      if (restante > 0 && (menorExpiracao === null || restante < menorExpiracao)) {
        menorExpiracao = restante;
      }
    } catch { /* noop */ }
  });

  function formatarTempo(seg) {
    if (seg >= 3600) return `${Math.floor(seg / 3600)}h ${Math.floor((seg % 3600) / 60)}min`;
    if (seg >= 60)   return `${Math.floor(seg / 60)}min`;
    return `${seg}s`;
  }

  if (cacheHit && menorExpiracao !== null) {
    // Dados vieram do cache — exibe badge verde com tooltip e botão de atualização
    container.innerHTML = `
      <div class="cache-badge cache-badge--hit" id="cache-badge-wrapper">
        <i class="bi bi-lightning-charge-fill"></i>
        <span class="cache-badge-text">Cache ativo</span>
        <span class="cache-badge-expiry">expira em ${formatarTempo(menorExpiracao)}</span>
        <button class="cache-badge-refresh" id="btn-cache-refresh" title="Forçar atualização dos dados">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>
      <div class="cache-tooltip" id="cache-tooltip" style="display:none;">
        <div class="cache-tooltip-title">
          <i class="bi bi-shield-check text-success me-1"></i>
          Dados carregados do cache local
        </div>
        <p class="cache-tooltip-desc">
          O sistema reutiliza dados já carregados nesta sessão para <strong>economizar leituras</strong>
          no banco de dados. O plano gratuito do Firebase permite <strong>50.000 leituras/dia</strong>
          — o cache reduz o consumo em até <strong>95%</strong> durante a navegação.
        </p>
        <p class="cache-tooltip-desc mb-0">
          Empresas e cargos ficam em cache por <strong>1 hora</strong>.
          Vagas ficam em cache por <strong>3 minutos</strong> e são atualizadas automaticamente após edições.
        </p>
        <button class="btn btn-sm btn-outline-primary w-100 mt-2" id="btn-cache-refresh-full">
          <i class="bi bi-arrow-clockwise me-1"></i>Forçar atualização agora
        </button>
      </div>`;
  } else {
    // Dados vieram do Firestore (leitura fresca)
    container.innerHTML = `
      <div class="cache-badge cache-badge--miss">
        <i class="bi bi-cloud-download-fill"></i>
        <span class="cache-badge-text">Dados frescos</span>
      </div>`;
    // Esconde após 4 segundos
    setTimeout(() => { container.innerHTML = ""; }, 4000);
  }

  // Eventos do tooltip e botão de refresh
  setTimeout(() => {
    const badge  = document.getElementById("cache-badge-wrapper");
    const tooltip = document.getElementById("cache-tooltip");
    const btnRefresh = document.getElementById("btn-cache-refresh");
    const btnRefreshFull = document.getElementById("btn-cache-refresh-full");

    if (badge && tooltip) {
      badge.addEventListener("click", (e) => {
        if (e.target.closest("#btn-cache-refresh")) return;
        tooltip.style.display = tooltip.style.display === "none" ? "block" : "none";
      });
      document.addEventListener("click", (e) => {
        if (!badge.contains(e.target)) tooltip.style.display = "none";
      }, { once: false });
    }

    function refreshAll() {
      cacheInvalidateAll();
      window.location.reload();
    }

    if (btnRefresh)     btnRefresh.addEventListener("click", refreshAll);
    if (btnRefreshFull) btnRefreshFull.addEventListener("click", refreshAll);
  }, 50);
}

export { renderLayout, setPageTitle, renderCacheStatus };
