# DOCUMENTO DE PLANEJAMENTO
# Sistema de Gestão de Terceirizados - DIEP
**Versão:** 2.0  
**Data:** Maio de 2026  
**Stack:** HTML + Bootstrap 5 + JavaScript (Vanilla) + Firebase (Firestore + Auth) + SheetJS  
**Hospedagem:** `terceirizados.portaldiep.com` (cPanel, sem Node.js, sem Composer, sem SSH)  
**Deploy:** FileZilla (upload direto de arquivos estáticos)

---

## 1. ANÁLISE DA PLANILHA-FONTE

### 1.1 Estrutura de Dados Identificada

A planilha contém **duas abas**:

**Aba principal (listagem de vagas)**  
Cada linha representa uma **vaga** (não necessariamente um colaborador), com os campos:

| Campo | Descrição | Exemplos |
|---|---|---|
| EMPRESA | Contratada | FGR, ARTEBRILHO, TR2 |
| CONTRATO/LOTE | Número do contrato ou lote | 095/2022, 3, 1 |
| CARGO | Título do cargo | CARGO 03 - AUXILIAR ADMINISTRATIVO |
| Nº | Número sequencial da vaga | 1, 2, 3... |
| CÓDIGO DA VAGA | Identificador único | FGR095.CARGO 03-1 |
| SITUAÇÃO | Status atual da vaga | ATIVA, EXTINÇÃO DE VAGA, LICENÇA, AGUARDANDO SUBSTITUIÇÃO, EM CONTRATAÇÃO, RESERVADA, UTILIZADA P/ ADITIVO, LIVRE |
| MATRÍCULA | Matrícula do colaborador | 3824-5 |
| NOME | Nome do colaborador | JOANA DA SILVA |
| HIERARQUIA | Caminho hierárquico da unidade | SMSA \| SUOGF \| DLOS \| GCOSE |
| UNIDADE (sigla) | Sigla da unidade de lotação | GCOSE |
| UNIDADE (nome completo) | Descrição da unidade | GERÊNCIA DE CONTRATAÇÃO DE SERVIÇOS |
| LOCALIDADE | Regional ou nível | NÍVEL CENTRAL, BARREIRO, NORTE... |
| RESPONSÁVEL | Gestor da unidade | LEONARDO VILETE MATOS |
| EMAIL | E-mail da unidade | servicosmsa@pbh.gov.br |
| OBSERVAÇÕES | Histórico de movimentações | "15.07.25 - FULANO foi substituído" |

**Aba "Cargos" (tabela de referência)**

| Campo | Descrição |
|---|---|
| EMPRESA | Nome da contratada |
| CARGO | Título do cargo |
| LOTE | Lote/contrato |
| SALARIO | Salário base |
| VALE-ALIMENTAÇÃO | Valor do VA |
| CUSTO DO POSTO | Custo total do posto |
| CARGA HORÁRIA DIÁRIA | Ex: 8 Horas, 12 Horas |
| CARGA HORÁRIA SEMANAL | Ex: 40 Horas, 42 Horas |
| QUANTITATIVO PREVISTO EM CONTRATO | Número contratual de vagas |

### 1.2 Empresas Contratadas Identificadas

| Empresa | Contrato/Lote | Tipos de Cargo |
|---|---|---|
| FGR | 095/2022 | CARGO 02 a CARGO 07 (Aux. Adm., Analista, Assessor) |
| ARTEBRILHO | Lote 3 | CARGO 01, 04, 05, 10, 11, 26–43 (Almoxarife, Porteiro, Manutenção...) |
| TR2 | Lote 1 | CARGO 01 - Copeira |

### 1.3 Status de Vagas (enumeração completa)

```
ATIVA
EXTINÇÃO DE VAGA
LICENÇA
AGUARDANDO SUBSTITUIÇÃO
EM CONTRATAÇÃO
RESERVADA
UTILIZADA P/ ADITIVO
LIVRE
```

---

## 2. AMBIENTE DE PRODUÇÃO

| Item | Detalhe |
|---|---|
| **URL** | `https://terceirizados.portaldiep.com` |
| **Pasta no servidor** | `/home2/port2849/terceirizados.portaldiep.com/` |
| **Hospedagem** | cPanel compartilhado |
| **PHP** | Disponível (memory_limit 512M, upload_max 512M) |
| **SSL** | Ativo e funcionando ✅ |
| **SSH / Terminal** | Não disponível |
| **Composer** | Não disponível |
| **Deploy** | Upload via FileZilla |
| **Node.js** | Não disponível |

> O sistema é composto exclusivamente por arquivos estáticos (HTML, CSS, JS) que se comunicam diretamente com o Firebase via HTTPS. Não há backend PHP ativo — o PHP poderá ser usado pontualmente no futuro se necessário, mas não faz parte do escopo inicial.

---

## 3. ARQUITETURA DO SISTEMA

### 3.1 Visão Geral

```
┌──────────────────────────────────────────────────────┐
│              BROWSER (Cliente)                        │
│   HTML + Bootstrap 5 + Vanilla JS + Firebase SDK      │
│                                                       │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │  Login   │  │ Dashboard │  │  CRUD Vagas        │ │
│  │ Firebase │  │ Indicad.  │  │  Firestore queries │ │
│  │   Auth   │  │ Chart.js  │  │  SheetJS import/   │ │
│  └──────────┘  └───────────┘  │  export            │ │
│                                └────────────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │ HTTPS (Firebase SDK)
          ┌─────────────┴──────────────┐
          │       Firebase (Google)     │
          │  ┌────────────┐ ┌────────┐ │
          │  │ Firebase   │ │Firest- │ │
          │  │   Auth     │ │  ore   │ │
          │  └────────────┘ └────────┘ │
          └────────────────────────────┘
```

### 3.2 Estrutura de Arquivos

```
terceirizados.portaldiep.com/
├── index.html               ← Tela de login
├── dashboard.html           ← Painel principal com indicadores
├── vagas.html               ← Listagem e filtros de vagas
├── vaga-detalhe.html        ← Visualização + histórico da vaga
├── vaga-form.html           ← Cadastro e edição de vaga
├── cargos.html              ← Tabela de cargos por empresa
├── importar.html            ← Upload e importação de planilha XLSX
├── relatorios.html          ← Exportação de relatórios
├── usuarios.html            ← Gestão de usuários (admin only)
├── auditoria.html           ← Log de auditoria (admin only)
├── 403.html                 ← Tela de acesso negado
├── assets/
│   ├── css/
│   │   └── app.css          ← Estilos customizados
│   └── js/
│       ├── firebase-config.js   ← Inicialização Firebase
│       ├── auth.js              ← Autenticação e controle de acesso
│       ├── vagas.js             ← CRUD de vagas
│       ├── dashboard.js         ← Gráficos e indicadores
│       ├── importar.js          ← Leitura XLSX via SheetJS
│       ├── exportar.js          ← Geração XLSX via SheetJS
│       ├── usuarios.js          ← Gestão de usuários
│       └── utils.js             ← Funções auxiliares (datas, máscaras, etc.)
└── .htaccess                ← HTTPS forçado, headers de segurança
```

---

## 4. MODELAGEM DO BANCO DE DADOS (FIRESTORE)

### 4.1 Coleções

#### `users` — usuários do sistema
```json
{
  "uid": "firebase_uid",
  "email": "usuario@dominio.gov.br",
  "nome": "João Silva",
  "perfil": "admin | editor | visualizador",
  "ativo": true,
  "criadoEm": "timestamp",
  "criadoPor": "uid_admin",
  "ultimoAcesso": "timestamp"
}
```

#### `empresas` — contratadas
```json
{
  "id": "artebrilho",
  "nome": "ARTEBRILHO",
  "contrato": "Lote 3",
  "ativo": true
}
```

#### `cargos` — referência por empresa
```json
{
  "id": "art3-cargo01",
  "empresaId": "artebrilho",
  "codigo": "CARGO 01",
  "descricao": "ALMOXARIFE",
  "salario": 2296.16,
  "valeAlimentacao": 27.24,
  "custoPostoMensal": 5351.39,
  "cargaHorariaDiaria": "8 Horas",
  "cargaHorariaSemanal": "40 Horas",
  "quantitativoPrevisto": 36
}
```

#### `vagas` — coleção principal (~1.100 documentos)
```json
{
  "id": "fgr095-cargo03-001",
  "codigoVaga": "FGR095.CARGO 03-1",
  "empresaId": "fgr",
  "cargoId": "fgr-cargo03",
  "numeroSequencial": 1,
  "situacao": "ATIVA",
  "matriculaColaborador": "3824-5",
  "nomeColaborador": "JOANA DA SILVA",
  "hierarquia": "SMSA | SUOGF | DLOS | GCOSE",
  "unidadeSigla": "GCOSE",
  "unidadeNome": "GERÊNCIA DE CONTRATAÇÃO DE SERVIÇOS GERAIS E DE ENGENHARIA",
  "localidade": "NÍVEL CENTRAL",
  "regional": "NÍVEL CENTRAL",
  "responsavel": "LEONARDO VILETE MATOS",
  "emailUnidade": "servicosmsa@pbh.gov.br",
  "observacoes": "Texto acumulado de histórico...",
  "deleted": false,
  "criadoEm": "timestamp",
  "atualizadoEm": "timestamp",
  "criadoPor": "uid_usuario",
  "atualizadoPor": "uid_usuario"
}
```

#### `historico_vagas/{vagaId}/eventos` — subcoleção imutável
```json
{
  "tipoEvento": "SUBSTITUICAO | STATUS_ALTERADO | CRIACAO | EDICAO",
  "descricao": "Situação alterada de ATIVA para LICENÇA",
  "dataEvento": "15/07/2025",
  "registradoEm": "timestamp",
  "registradoPor": "uid_usuario",
  "nomeUsuario": "João Silva"
}
```

#### `audit_log` — trilha de auditoria completa (imutável)
```json
{
  "usuarioId": "uid_usuario",
  "usuarioEmail": "usuario@gov.br",
  "nomeUsuario": "João Silva",
  "acao": "UPDATE_VAGA | DELETE_VAGA | LOGIN | IMPORT | EXPORT",
  "colecao": "vagas",
  "documentoId": "fgr095-cargo03-001",
  "dadosAnteriores": { "situacao": "ATIVA" },
  "dadosNovos": { "situacao": "LICENÇA" },
  "timestamp": "timestamp"
}
```

### 4.2 Regras de Segurança Firestore (`firestore.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }
    function userDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function isAdmin() {
      return isAuthenticated() && userDoc().perfil == 'admin' && userDoc().ativo == true;
    }
    function isEditor() {
      return isAuthenticated() && userDoc().perfil in ['admin','editor'] && userDoc().ativo == true;
    }
    function isActiveUser() {
      return isAuthenticated() && userDoc().ativo == true;
    }

    match /users/{userId} {
      allow read: if request.auth.uid == userId || isAdmin();
      allow create, update, delete: if isAdmin();
    }

    match /vagas/{vagaId} {
      allow read: if isActiveUser();
      allow create, update: if isEditor();
      allow delete: if false;

      match /eventos/{eventoId} {
        allow read: if isActiveUser();
        allow create: if isEditor();
        allow update, delete: if false;
      }
    }

    match /empresas/{id} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    match /cargos/{id} {
      allow read: if isActiveUser();
      allow write: if isAdmin();
    }

    match /audit_log/{id} {
      allow read: if isAdmin();
      allow create: if isAuthenticated();
      allow update, delete: if false;
    }
  }
}
```

---

## 5. PERFIS DE ACESSO

| Perfil | Quem cria | Permissões |
|---|---|---|
| **Admin** | Apenas via Firebase Console (1º admin) | CRUD completo, criar/desativar usuários, importar planilha, exportar, ver auditoria |
| **Editor** | Admin dentro do sistema | Visualizar + criar + editar vagas, registrar movimentações, exportar |
| **Visualizador** | Admin dentro do sistema | Somente leitura, exportar relatórios |

> Não existe auto-cadastro. Todos os ~20 usuários são criados pelo admin dentro da tela de usuários do sistema. O admin usa a Firebase Auth REST API para criar a conta e registra o perfil no Firestore.

---

## 6. FUNCIONALIDADES DO SISTEMA

### 6.1 Autenticação (`index.html`)

- Login com e-mail e senha via Firebase Authentication
- Ao autenticar, verifica se o usuário existe em `users/{uid}` e se `ativo == true`
- Se `ativo == false`, faz logout imediato com mensagem de acesso bloqueado
- Sessão com `browserSessionPersistence` (encerra ao fechar o browser)
- Todas as páginas verificam autenticação no carregamento via `auth.js`
- Redirecionamento automático para `index.html` se não autenticado

### 6.2 Layout Padrão

- Header fixo com o nome: **"Sistema de Gestão de Terceirizados - DIEP"**
- Sidebar com menu de navegação (recolhível no mobile)
- Nome e perfil do usuário logado no header
- Botão de logout
- Responsivo via Bootstrap 5

### 6.3 Dashboard (`dashboard.html`)

- Cards de resumo: total de vagas, ativas, aguardando substituição, em contratação
- Gráfico de rosca: distribuição por situação (Chart.js)
- Gráfico de barras: vagas por empresa
- Tabela de alertas: vagas com status crítico (AGUARDANDO SUBSTITUIÇÃO, EM CONTRATAÇÃO, LICENÇA)
- Filtro rápido por empresa e regional

### 6.4 Listagem de Vagas (`vagas.html`)

- Tabela paginada (50 registros por página, cursor Firestore)
- Filtros combinados: empresa, cargo, situação, regional, busca por nome/matrícula/código
- Badge Bootstrap colorida por status:
  - 🟢 `ATIVA`
  - 🔴 `EXTINÇÃO DE VAGA`
  - 🟡 `AGUARDANDO SUBSTITUIÇÃO`
  - 🔵 `EM CONTRATAÇÃO`
  - 🟠 `LICENÇA`
  - ⚪ `RESERVADA` / `LIVRE` / `UTILIZADA P/ ADITIVO`
- Botões por linha: Ver / Editar (editor+) / Inativar (admin)
- Botão exportar filtro atual → gera XLSX via SheetJS

### 6.5 Detalhe da Vaga (`vaga-detalhe.html`)

- Todos os dados da vaga em layout de card
- Timeline de histórico (subcoleção `eventos`)
- Botão editar (editor+)

### 6.6 Formulário de Vaga (`vaga-form.html`)

Usado para criação e edição (parâmetro `?id=` para edição):

- Select empresa → filtra dinamicamente os cargos disponíveis
- Código da vaga gerado automaticamente ou inserido manualmente
- Campo observações: textarea acumulativa com data e usuário a cada edição
- Validações client-side: campos obrigatórios, formato de matrícula
- Ao salvar: grava em `vagas` + cria entrada em `historico_vagas/{id}/eventos` se houve mudança de situação ou colaborador + grava em `audit_log`
- Inativação (soft delete, admin only): modal de confirmação, define `deleted: true`

### 6.7 Cargos e Empresas (`cargos.html`)

- Listagem de empresas com seus cargos e valores
- Quantitativo contratual vs. vagas cadastradas
- CRUD de empresas e cargos (admin only)

### 6.8 Importação de Planilha (`importar.html`)

**100% no browser via SheetJS — sem PHP:**

1. Admin faz upload do `.xlsx`
2. SheetJS lê o arquivo localmente
3. JS mapeia colunas → campos do modelo
4. Preview em tabela antes de confirmar
5. Importação em batches de 450 via `writeBatch` (merge: atualiza se existir)
6. Barra de progresso e relatório final (criados, atualizados, erros)

### 6.9 Exportação de Relatórios (`relatorios.html`)

**100% no browser via SheetJS — sem PHP:**

- Filtros: empresa, situação, regional, cargo, período
- Consulta Firestore com os filtros selecionados
- Gera `.xlsx` e dispara download direto no browser
- Nome do arquivo: `terceirizados_DDMMAAAA_HHmm.xlsx`
- Colunas idênticas à planilha original

### 6.10 Gestão de Usuários (`usuarios.html`) — Admin only

- Listagem de todos os usuários com perfil e status
- Criar usuário: Firebase Auth REST API → cria conta + doc em `users/{uid}`
- Editar perfil: altera campo `perfil` no Firestore
- Bloquear/desbloquear: altera campo `ativo`
- Sem deleção de usuários (preserva histórico)
- Sem auto-cadastro em nenhuma parte do sistema

### 6.11 Auditoria (`auditoria.html`) — Admin only

- Tabela de registros do `audit_log`
- Filtros: usuário, ação, período, documento
- Exibição de dados anteriores vs. novos

---

## 7. SEGURANÇA

### 7.1 Firebase Authentication
- Senhas com mínimo 10 caracteres (Authentication → Settings → Password policy)
- Sem auto-cadastro — contas criadas exclusivamente pelo admin
- Token JWT expira em 1 hora, renovado automaticamente pelo SDK
- Campo `ativo: false` bloqueia acesso mesmo com conta Firebase válida

### 7.2 Firestore Security Rules
- Nenhuma leitura ou escrita sem autenticação
- `ativo: false` impede qualquer operação mesmo autenticado
- Deleção física bloqueada por regra
- Histórico e audit log imutáveis após criação

### 7.3 Frontend
- Firebase `apiKey` é segura no browser — é chave pública de identificação, não de acesso
- Segurança real está nas Firestore Security Rules
- Nenhum dado sensível em `localStorage`
- Verificação de autenticação e perfil no carregamento de cada página

### 7.4 `.htaccess`

```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

Options -Indexes

Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
```

---

## 8. BIBLIOTECAS E DEPENDÊNCIAS

Todas via CDN — nenhuma instalação no servidor:

```html
<!-- Bootstrap 5.3 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<!-- Bootstrap Icons -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">

<!-- Firebase SDK 10 (modular) -->
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
  import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
</script>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- SheetJS (importação e exportação XLSX) -->
<script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
```

---

## 9. PONTOS DE ATENÇÃO PARA O AGENTE DE IA

### 9.1 Paginação no Firestore (sem OFFSET)
```javascript
let lastDoc = null;

async function carregarPagina(filtros) {
  let q = query(
    collection(db, 'vagas'),
    where('deleted', '==', false),
    ...filtros,
    orderBy('codigoVaga'),
    limit(50)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  const snap = await getDocs(q);
  lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

### 9.2 Busca Textual
O Firestore não tem busca full-text nativa. Carregar registros filtrados pelos campos indexados e aplicar filtro de texto client-side via `toLowerCase().includes()`. Viável para ~1.100 registros.

### 9.3 Importação em Batch
```javascript
function chunks(arr, size) {
  return Array.from({ length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size));
}

async function importarLote(vagas) {
  for (const lote of chunks(vagas, 450)) {
    const batch = writeBatch(db);
    lote.forEach(vaga => {
      const id = gerarId(vaga.codigoVaga);
      const ref = doc(db, 'vagas', id);
      batch.set(ref, vaga, { merge: true });
    });
    await batch.commit();
  }
}
```

### 9.4 Criar Usuário (sem Admin SDK no browser)
```javascript
async function criarUsuario(email, senha, nome, perfil) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      body: JSON.stringify({ email, password: senha, returnSecureToken: true })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  await setDoc(doc(db, 'users', data.localId), {
    email, nome, perfil, ativo: true,
    criadoEm: serverTimestamp(),
    criadoPor: auth.currentUser.uid
  });
}
```

### 9.5 Formato de Datas (DD/MM/AAAA)
```javascript
function formatarData(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('pt-BR');
}
```

### 9.6 Geração de IDs para Firestore
```javascript
function gerarId(codigoVaga) {
  return codigoVaga.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
// "FGR095.CARGO 03-1" → "fgr095-cargo03-1"
```

### 9.7 Soft Delete
```javascript
await updateDoc(doc(db, 'vagas', id), {
  deleted: true,
  deletedAt: serverTimestamp(),
  deletedBy: auth.currentUser.uid
});
```
Todas as queries incluem `where('deleted', '==', false)`.

### 9.8 Verificação de Perfil em Cada Página
```javascript
async function checkAuth(perfilMinimo = 'visualizador') {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = '/index.html'; return; }
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists() || !snap.data().ativo) {
        await signOut(auth);
        window.location.href = '/index.html';
        return;
      }
      const perfil = snap.data().perfil;
      const hierarquia = ['visualizador', 'editor', 'admin'];
      if (hierarquia.indexOf(perfil) < hierarquia.indexOf(perfilMinimo)) {
        window.location.href = '/403.html';
        return;
      }
      resolve({ user, perfil, dados: snap.data() });
    });
  });
}
```

### 9.9 Encoding
A planilha contém caracteres especiais (ã, ç, é, etc.). O SheetJS lida corretamente por padrão. Todos os arquivos HTML devem ser salvos em UTF-8 com `<meta charset="UTF-8">`.

---

## 10. ETAPAS DE DESENVOLVIMENTO

### ETAPA 1 — Configuração Firebase e Infraestrutura
**Duração estimada: 1 dia**

- [ ] Criar projeto no Firebase Console
- [ ] Habilitar Firebase Authentication (e-mail/senha)
- [ ] Configurar política de senha mínima em Authentication → Settings
- [ ] Criar banco Firestore (modo produção)
- [ ] Implantar Firestore Security Rules
- [ ] Popular coleções `empresas` e `cargos` com dados da aba "Cargos" da planilha
- [ ] Criar o primeiro usuário admin no Firebase Console
- [ ] Criar doc `users/{uid}` manualmente no Firestore para esse admin
- [ ] Criar `.htaccess` e fazer upload via FileZilla
- [ ] Confirmar que `https://terceirizados.portaldiep.com` responde corretamente

**Entregável:** Firebase configurado, estrutura base no servidor, HTTPS confirmado.

---

### ETAPA 2 — Autenticação e Layout Base
**Duração estimada: 1 dia**

- [ ] Criar `firebase-config.js`
- [ ] Criar `auth.js` com `checkAuth()`, login, logout e `onAuthStateChanged`
- [ ] Criar `index.html` — tela de login
- [ ] Criar `_layout.js` — injeta header e sidebar via JS em todas as páginas
- [ ] Criar `403.html`
- [ ] Testar login, redirecionamento e bloqueio de acesso

**Entregável:** Login funcional, proteção de páginas ativa, layout reutilizável.

---

### ETAPA 3 — Importação da Planilha (Carga Inicial)
**Duração estimada: 1–2 dias**

- [ ] Criar `importar.html` e `importar.js`
- [ ] Implementar leitura XLSX via SheetJS
- [ ] Mapear colunas → campos do modelo de dados
- [ ] Preview antes de confirmar
- [ ] Importação em batches com barra de progresso
- [ ] Executar importação com a planilha real
- [ ] Validar dados no Firestore Console

**Entregável:** Todos os dados importados e validados.

---

### ETAPA 4 — Dashboard
**Duração estimada: 1 dia**

- [ ] Criar `dashboard.html` e `dashboard.js`
- [ ] Cards de resumo por situação
- [ ] Gráfico de rosca (Chart.js) por situação
- [ ] Gráfico de barras por empresa
- [ ] Tabela de alertas (vagas críticas)
- [ ] Filtro por empresa e regional

**Entregável:** Dashboard com indicadores em tempo real.

---

### ETAPA 5 — Listagem de Vagas
**Duração estimada: 1–2 dias**

> **Decisão arquitetural:** Todas as vagas são carregadas de uma vez (client-side) para garantir busca textual instantânea em toda a base.

- [ ] Criar `vagas.html` e lógica em `vagas.js`
- [ ] Carregar todas as vagas do Firestore em memória (getDocs única)
- [ ] Paginação visual client-side (50/página) com controles Anterior/Próximo
- [ ] Filtros por Empresa e Situação (client-side, sem nova query)
- [ ] Busca textual em memória (nome, código, matrícula, unidade)
- [ ] Badges por status
- [ ] Botões de ação por linha (Ver Detalhes)
- [ ] Botão exportar CSV da visão atual (dados filtrados)

**Entregável:** Listagem paginada e filtrável com busca instantânea.

---

### ETAPA 6 — CRUD de Vagas
**Duração estimada: 2 dias**

- [ ] Criar `vaga-detalhe.html` com timeline de histórico
- [ ] Criar `vaga-form.html` para criação e edição
- [ ] Select dinâmico empresa → cargos
- [ ] Observações acumulativas
- [ ] Gravação com histórico e audit log automáticos
- [ ] Soft delete com modal de confirmação (admin only)

**Entregável:** CRUD completo com histórico automático.

---

### ETAPA 7 — Cargos, Empresas e Relatórios
**Duração estimada: 1–2 dias**

- [ ] Criar `cargos.html` — CRUD de cargos e empresas (admin)
- [ ] Criar `relatorios.html` — filtros + exportação XLSX via SheetJS

**Entregável:** Gestão de cargos e exportação de relatórios.

---

### ETAPA 8 — Gestão de Usuários e Auditoria
**Duração estimada: 1–2 dias**

- [ ] Criar `usuarios.html` — CRUD de usuários (admin only)
- [ ] Integrar criação via Firebase Auth REST API
- [ ] Criar `auditoria.html` — log filtrável (admin only)
- [ ] Garantir registro no `audit_log` em todo CRUD de vagas

**Entregável:** Controle de acesso e auditoria completos.

---

### ETAPA 9 — Testes, Ajustes e Entrega
**Duração estimada: 1–2 dias**

- [ ] Testar os 3 perfis: admin, editor, visualizador
- [ ] Testar importação com a planilha real completa
- [ ] Testar exportação com filtros variados
- [ ] Verificar responsividade mobile
- [ ] Revisão final das Security Rules
- [ ] Testar fluxo completo: login → vaga → edição → histórico → logout

**Entregável:** Sistema em produção no subdomínio.

---

## 11. CRONOGRAMA RESUMIDO

| Etapa | Descrição | Dias Estimados |
|---|---|---|
| 1 | Configuração Firebase e infraestrutura | 1 |
| 2 | Autenticação e layout base | 1 |
| 3 | Importação da planilha | 2 |
| 4 | Dashboard | 1 |
| 5 | Listagem de vagas | 2 |
| 6 | CRUD de vagas | 2 |
| 7 | Cargos, empresas e relatórios | 2 |
| 8 | Gestão de usuários e auditoria | 2 |
| 9 | Testes e entrega | 2 |
| **Total** | | **~15 dias úteis** |

---

## 12. CHECKLIST DE SEGURANÇA

- [ ] HTTPS forçado e funcionando no subdomínio
- [ ] Firestore Security Rules implantadas e testadas com os 3 perfis
- [ ] Campo `ativo` bloqueia usuários desativados mesmo com conta Firebase válida
- [ ] Sem auto-cadastro — contas criadas apenas pelo admin
- [ ] Soft delete implementado — sem deleção física em nenhuma tela
- [ ] Audit log gravando todas as ações sensíveis
- [ ] Histórico de vagas imutável após criação
- [ ] Nenhum dado sensível em `localStorage`
- [ ] Headers de segurança HTTP no `.htaccess`
- [ ] Listagem de diretórios desabilitada (`Options -Indexes`)
- [ ] `firebase-config.js` usa apenas chave pública (API Key)

---

*Documento consolidado com todas as decisões de arquitetura, ambiente e produto — maio de 2026. Pronto para uso como guia por agente de IA ou desenvolvedor.*
