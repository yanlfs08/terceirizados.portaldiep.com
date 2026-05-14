import { logout } from "./auth.js";

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

export { renderLayout, setPageTitle };
