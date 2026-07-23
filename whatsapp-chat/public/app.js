// Detecta e aplica tema enviado via Query Parameter pelo Next.js
const urlParams = new URLSearchParams(window.location.search);
const currentTheme = urlParams.get('theme') || 'dark';
document.documentElement.className = `theme-${currentTheme}`;

// Conexão Socket.io (conecta-se automaticamente ao host que serve o arquivo)
const socket = io();

// Re-registrar atendente automaticamente em caso de reconexão do socket para garantir associação de salas
socket.on('connect', () => {
  const savedId = localStorage.getItem('tf_operator_id');
  const savedName = localStorage.getItem('tf_operator_name');
  if (savedId && savedName) {
    socket.emit('register_attendant', { atendente_id: savedId, nome: savedName });
  }
});

// Estado Global da Aplicação
let currentOperator = { id: '', name: '' };
let selectedChatJid = null;
let selectedChatName = '';
let activeChats = [];
let queueChats = [];
let botChats = [];
let currentChatMessages = [];
let isQrBypassed = sessionStorage.getItem('tf_qr_bypassed') === 'true';
let allowedSectors = [];
let selectedSectorsFilter = [];

// Elementos da DOM
const qrModal = document.getElementById('qr-modal');
const qrImage = document.getElementById('qr-image');
const qrSpinner = document.getElementById('qr-loading-spinner');
const qrStatusText = document.getElementById('qr-status-text');

const newChatModal = document.getElementById('new-chat-modal');
const inputNewChatName = document.getElementById('input-new-chat-name');
const inputNewChatPhone = document.getElementById('input-new-chat-phone');

const attendantModal = document.getElementById('attendant-modal');
const headerOpName = document.getElementById('header-operator-name');
const headerOpId = document.getElementById('header-operator-id');
const headerOpAvatar = document.getElementById('operator-avatar');

const queueContainer = document.getElementById('queue-list-container');
const queueCountBadge = document.getElementById('queue-count');

const activeContainer = document.getElementById('active-chats-container');
const activeCountBadge = document.getElementById('active-chats-count');

const activeChatArea = document.getElementById('active-chat-area');
const emptyChatState = document.getElementById('empty-chat-state');
const chatClientName = document.getElementById('chat-client-name');
const chatClientJid = document.getElementById('chat-client-jid');
const chatClientAvatar = document.getElementById('chat-client-avatar');
const messagesContainer = document.getElementById('chat-messages-container');
const chatInput = document.getElementById('chat-input');

const statusBadge = document.getElementById('connection-status-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// Helper para atualizar badge de contagem (esconde se for <= 0)
function updateBadge(badge, count) {
  if (!badge) return;
  badge.textContent = count;
  if (count > 0) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ==============================================================================
// 👤 CONTROLE DE LOGIN / IDENTIFICAÇÃO DO OPERADOR
// ==============================================================================

// Carrega o operador salvo ou exibe modal
function initOperator() {
  // Tentar ler dos parâmetros da URL (caso esteja incorporado no iframe do portal principal)
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('operator_id');
  const paramName = urlParams.get('operator_name');
  const paramSectors = urlParams.get('sectors');

  if (paramId && paramName) {
    localStorage.setItem('tf_operator_id', paramId.trim());
    localStorage.setItem('tf_operator_name', paramName.trim());
  }

  if (paramSectors) {
    localStorage.setItem('tf_operator_sectors', paramSectors.trim());
  }

  const savedId = localStorage.getItem('tf_operator_id');
  const savedName = localStorage.getItem('tf_operator_name');

  if (savedId && savedName) {
    currentOperator.id = savedId;
    currentOperator.name = savedName;
    
    // Atualiza cabeçalho se elementos existirem
    if (headerOpName) headerOpName.textContent = savedName;
    if (headerOpId) headerOpId.textContent = `id: ${savedId}`;
    if (headerOpAvatar) headerOpAvatar.textContent = savedName.substring(0, 2).toUpperCase();
    
    // Registra no Socket
    socket.emit('register_attendant', { atendente_id: savedId, nome: savedName });
    // Garante que o modal fique ocultado
    attendantModal.classList.add('hidden');
  } else {
    // Exibe modal
    attendantModal.classList.remove('hidden');
  }

  // Inicializa os setores
  initSectors();
}

function initSectors() {
  const savedSectors = localStorage.getItem('tf_operator_sectors');
  if (savedSectors) {
    try {
      allowedSectors = JSON.parse(savedSectors).map(s => ({
        id: parseInt(s.id, 10),
        name: s.name
      }));
    } catch (e) {
      console.error('Error parsing sectors:', e);
      allowedSectors = [];
    }
  }

  const savedFilter = localStorage.getItem('tf_selected_sectors_filter');
  if (savedFilter) {
    try {
      selectedSectorsFilter = JSON.parse(savedFilter).map(id => parseInt(id, 10));
      // Garante que apenas setores válidos continuem selecionados
      selectedSectorsFilter = selectedSectorsFilter.filter(id => allowedSectors.some(s => s.id === id));
    } catch (e) {
      selectedSectorsFilter = allowedSectors.map(s => s.id);
    }
  } else {
    selectedSectorsFilter = allowedSectors.map(s => s.id);
  }
}

function toggleSectorFilter(sectorId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const idNum = parseInt(sectorId, 10);
  const idx = selectedSectorsFilter.indexOf(idNum);
  if (idx > -1) {
    selectedSectorsFilter.splice(idx, 1);
  } else {
    selectedSectorsFilter.push(idNum);
  }
  
  localStorage.setItem('tf_selected_sectors_filter', JSON.stringify(selectedSectorsFilter));
  
  // Atualiza a renderização
  renderSectorsDropdown();
  renderActiveChats();
  renderQueueList();
  renderBotChats();
  renderHistoryChats();
}

// Salva informações do operador a partir do formulário
function saveOperator(e) {
  e.preventDefault();
  const nameInput = document.getElementById('input-operator-name').value.trim();
  const idInput = document.getElementById('input-operator-id').value.trim();

  if (nameInput && idInput) {
    localStorage.setItem('tf_operator_id', idInput);
    localStorage.setItem('tf_operator_name', nameInput);
    
    attendantModal.classList.add('hidden');
    initOperator();
  }
}

// Limpa credenciais do operador
async function logoutOperator() {
  const confirmed = await showCustomConfirm(
    'Sair do Painel?',
    'Tem certeza que deseja sair deste painel de atendente? Você precisará entrar novamente.',
    'danger'
  );
  if (confirmed) {
    localStorage.removeItem('tf_operator_id');
    localStorage.removeItem('tf_operator_name');
    window.location.reload();
  }
}

// ==============================================================================
// 🗂️ CONTROLE DE ABAS DA SIDEBAR
// ==============================================================================
let currentSidebarTab = 'active';

const tabActiveBtn = document.getElementById('tab-active');
const tabQueueBtn = document.getElementById('tab-queue');
const tabBotBtn = document.getElementById('tab-bot');
const tabHistoryBtn = document.getElementById('tab-history');

const activeChatsContainer = document.getElementById('active-chats-container');
const activeListContainer = document.getElementById('active-list');
const inputActiveSearch = document.getElementById('input-active-search');
const btnActiveFilterAll = document.getElementById('btn-active-filter-all');
const btnActiveFilterUnread = document.getElementById('btn-active-filter-unread');
const btnActiveFilterGroups = document.getElementById('btn-active-filter-groups');

let activeFilterType = 'all'; // 'all', 'unread', 'groups'
let activeSearchQuery = '';
let activeChatsSortOrder = 'desc'; // 'desc' (novas primeiro) ou 'asc' (antigas primeiro)
let customFilters = (() => {
  try {
    const saved = localStorage.getItem('tf_custom_filters');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
})();
let activeCustomFilterId = null;
let activeFilterTimeout = null;

const queueChatsContainer = document.getElementById('queue-list-container');
const botChatsContainer = document.getElementById('bot-chats-container');
const historyChatsContainer = document.getElementById('history-chats-container');
const historyListContainer = document.getElementById('history-list');
const inputHistorySearch = document.getElementById('input-history-search');
const btnSearchTypeChat = document.getElementById('btn-search-type-chat');
const btnSearchTypeMessage = document.getElementById('btn-search-type-message');

let historyChats = [];
let historySearchType = 'chat';

const tabIndicator = document.getElementById('tab-indicator');
const tabsContainer = document.getElementById('tabs-container');

function updateTabIndicator(activeBtn) {
  if (!tabIndicator || !activeBtn || !tabsContainer) return;
  const containerRect = tabsContainer.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  
  const relativeLeft = btnRect.left - containerRect.left;
  const width = btnRect.width;
  
  tabIndicator.style.left = `${relativeLeft}px`;
  tabIndicator.style.width = `${width}px`;
}

function updateActiveFilterIndicator(activeBtn) {
  const container = document.getElementById('active-filters-container');
  const indicator = document.getElementById('active-filter-indicator');
  if (!container || !indicator) return;

  if (!activeBtn) {
    indicator.style.width = '0px';
    indicator.classList.add('opacity-0');
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  
  const relativeLeft = btnRect.left - containerRect.left;
  const width = btnRect.width;
  const height = btnRect.height;
  const relativeTop = btnRect.top - containerRect.top;
  
  indicator.style.left = `${relativeLeft}px`;
  indicator.style.width = `${width}px`;
  indicator.style.top = `${relativeTop}px`;
  indicator.style.height = `${height}px`;
  indicator.classList.remove('opacity-0');
}

function switchSidebarTab(tab) {
  currentSidebarTab = tab;
  
  // Remove piscar ao selecionar a aba de fila
  if (tab === 'queue' && tabQueueBtn) {
    tabQueueBtn.classList.remove('animate-flash-tab');
  }
  
  const buttons = [
    { name: 'active', btn: tabActiveBtn, container: activeChatsContainer },
    { name: 'queue', btn: tabQueueBtn, container: queueChatsContainer },
    { name: 'bot', btn: tabBotBtn, container: botChatsContainer },
    { name: 'history', btn: tabHistoryBtn, container: historyChatsContainer }
  ];

  buttons.forEach(item => {
    if (item.name === tab) {
      item.btn.classList.remove('text-slate-400', 'hover:text-slate-200', 'hover:scale-[1.01]', 'active:scale-[0.98]');
      item.btn.classList.add('text-white', 'scale-[1.02]');
      item.container.classList.remove('hidden');
      void item.container.offsetWidth; // Force browser reflow to restart keyframe animation
      item.container.classList.add('tab-content-active');
      updateTabIndicator(item.btn);
    } else {
      item.btn.classList.remove('text-white', 'scale-[1.02]');
      item.btn.classList.add('text-slate-400', 'hover:text-slate-200', 'hover:scale-[1.01]', 'active:scale-[0.98]');
      item.container.classList.add('hidden');
      item.container.classList.remove('tab-content-active');
    }
  });
}

// ==============================================================================
// 💬 CONTROLE DE NOVO CHAT (INICIAR CONVERSA ATIVA)
// ==============================================================================

function openNewChatModal() {
  newChatModal.classList.remove('hidden');
  inputNewChatName.value = '';
  inputNewChatPhone.value = '';
  inputNewChatName.focus();
}

function closeNewChatModal() {
  newChatModal.classList.add('hidden');
}

function bypassQR() {
  isQrBypassed = true;
  sessionStorage.setItem('tf_qr_bypassed', 'true');
  qrModal.classList.add('hidden');
}

async function handleNewChatSubmit(e) {
  e.preventDefault();
  const name = inputNewChatName.value.trim();
  const phone = inputNewChatPhone.value.trim();

  if (!name || !phone || !currentOperator.id) return;

  // Formatar JID
  let formattedJid = phone;
  if (!formattedJid.includes('@')) {
    formattedJid = `${formattedJid}@c.us`;
  }

  try {
    // 1. Obter configurações de segurança no backend FastAPI para decidir se exibe aviso
    let warnNewNumber = true;
    try {
      const res = await fetch('http://localhost:8080/system-settings');
      if (res.ok) {
        const settings = await res.json();
        warnNewNumber = settings.whatsapp_warn_new_number !== undefined ? settings.whatsapp_warn_new_number : true;
      }
    } catch (err) {
      console.error('Erro ao ler configurações de aviso do backend:', err);
    }

    // 2. Se aviso de segurança estiver ativo, exibir confirmação
    if (warnNewNumber) {
      const confirmed = await showCustomConfirm(
        'Aviso de Segurança',
        `Iniciar conversas ativas com números que não falaram com a empresa antes aumenta o risco de banimento do número do WhatsApp.\n\nDeseja mesmo iniciar este chat com ${name} (${phone})?`,
        'danger'
      );
      if (!confirmed) return;
    }

    // 3. Fechar modal e enviar evento via socket
    closeNewChatModal();
    socket.emit('start_chat', {
      cliente_jid: formattedJid,
      cliente_nome: name,
      atendente_id: currentOperator.id
    });

  } catch (err) {
    console.error('Erro no envio de novo chat:', err);
    alert(`Erro ao iniciar conversa: ${err.message}`);
  }
}

// Sucesso ao iniciar novo chat (abre a conversa automaticamente na tela)
socket.on('start_chat_success', ({ cliente_jid, cliente_nome }) => {
  selectChat(cliente_jid, cliente_nome);
});

// ==============================================================================
// 🔌 GESTÃO DOS EVENTOS WEBSOCKET DO WHATSAPP
// ==============================================================================

// Atualização de Status da Conexão do WhatsApp
socket.on('whatsapp_status', ({ status, qr }) => {
  console.log(`Status do WhatsApp: ${status}`);
  
  if (status === 'pronto' || status === 'autenticado') {
    // Esconde Modal do QR Code e reseta o bypass
    isQrBypassed = false;
    sessionStorage.removeItem('tf_qr_bypassed');
    qrModal.classList.add('hidden');
    
    // Badge do Header -> Verde
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    statusText.textContent = 'Conectado';
  } else if (status === 'aguardando_qr') {
    // Exibe Modal do QR Code se não estiver em bypass
    if (!isQrBypassed) {
      qrModal.classList.remove('hidden');
    }
    qrSpinner.classList.add('hidden');
    qrImage.classList.remove('hidden');
    
    if (qr) {
      qrImage.src = qr;
    }
    qrStatusText.textContent = 'Aguardando leitura pelo celular...';
    
    // Badge do Header -> Laranja
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse';
    statusText.textContent = 'QR Code Pendente';
  } else {
    // Desconectado / Carregando
    if (!isQrBypassed) {
      qrModal.classList.remove('hidden');
    }
    qrSpinner.classList.remove('hidden');
    qrImage.classList.add('hidden');
    qrStatusText.textContent = 'Inicializando WhatsApp local...';
    
    // Badge do Header -> Vermelho
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
    statusText.textContent = 'Desconectado';
  }
});

// ==============================================================================
// 📋 RENDERIZAÇÃO DA FILA DE ESPERA E CONVERSAS ATIVAS
// ==============================================================================

// Recebe Lista de Fila
socket.on('queue_list', (rows) => {
  const previousQueueCount = queueChats.length;
  queueChats = rows;
  updateBadge(queueCountBadge, rows.length);
  renderQueueList();
  checkReadOnlyBanner();

  // Piscar a aba de fila se novos clientes entrarem na fila e o atendente não estiver visualizando ela
  if (rows.length > previousQueueCount && currentSidebarTab !== 'queue' && tabQueueBtn) {
    tabQueueBtn.classList.add('animate-flash-tab');
  }
});

function checkReadOnlyBanner() {
  if (selectedChatJid) {
    const isActive = activeChats.some(c => c.cliente_jid === selectedChatJid);
    const readOnlyBanner = document.getElementById('chat-read-only-banner');
    if (readOnlyBanner) {
      if (isActive) {
        readOnlyBanner.classList.add('hidden');
      } else {
        readOnlyBanner.classList.remove('hidden');
      }
    }
  }
}

function renderQueueList() {
  let filtered = [...queueChats];
  if (allowedSectors.length > 0) {
    filtered = filtered.filter(chat => {
      return chat.sector_id === null || chat.sector_id === undefined || selectedSectorsFilter.includes(chat.sector_id);
    });
  }

  // Update badge to match filtered list
  updateBadge(queueCountBadge, filtered.length);

  if (filtered.length === 0) {
    queueContainer.innerHTML = `<div class="text-center py-10 text-xs text-slate-500 font-medium">Nenhum cliente na fila</div>`;
    return;
  }

  queueContainer.innerHTML = filtered.map(chat => `
    <div class="glass-card rounded-2xl p-4 flex flex-col gap-3 relative fade-in border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl avatar-inactive-theme flex items-center justify-center font-bold text-sm uppercase transition-all shrink-0 overflow-hidden">
          ${chat.cliente_avatar 
            ? `<img src="${chat.cliente_avatar}" alt="${chat.cliente_nome}" class="w-full h-full object-cover" onerror="this.outerHTML='${chat.cliente_nome.substring(0, 2).toUpperCase()}'"/>` 
            : chat.cliente_nome.substring(0, 2).toUpperCase()
          }
        </div>
        <div class="leading-tight text-left flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-100 truncate" title="${chat.cliente_nome}">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <!-- Ícones de Ação da Fila -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- Ícone de Informações -->
          <button onclick="openClientInfoDrawer('${chat.cliente_jid}', '${chat.cliente_nome}')" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer shadow-sm" title="Informações do contato">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </button>
          <!-- Ícone de Mensagens (Modo Leitura) -->
          <button onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer shadow-sm" title="Visualizar conversa (Modo Leitura)">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>
      
      <button onclick="takeChat('${chat.cliente_jid}')" class="w-full h-9 rounded-xl bg-amber-500/10 hover:bg-amber-500 hover:text-black border border-amber-500/20 hover:border-transparent text-amber-400 text-xs font-bold transition-all duration-200 active:scale-[0.98]">
        Atender Cliente
      </button>
    </div>
  `).join('');
}

// Assume conversa da fila
function takeChat(clienteJid) {
  if (!currentOperator.id) return;
  socket.emit('take_chat', { cliente_jid: clienteJid, atendente_id: currentOperator.id });
  
  // Alterna automaticamente para a aba de Ativos para o atendente acompanhar o chat
  switchSidebarTab('active');
}

// Recebe Lista de Conversas Ativas
socket.on('active_chats_list', (rows) => {
  activeChats = rows;
  updateBadge(activeCountBadge, rows.length);
  renderActiveChats();
  checkReadOnlyBanner();
});

// Recebe Lista de Conversas do Histórico
socket.on('history_chats_list', (rows) => {
  historyChats = rows;
  renderHistoryChats();
});

function renderHistoryChats() {
  if (!historyListContainer) return;

  let filtered = [...historyChats];
  if (allowedSectors.length > 0) {
    filtered = filtered.filter(chat => {
      return chat.sector_id === null || chat.sector_id === undefined || selectedSectorsFilter.includes(chat.sector_id);
    });
  }

  if (filtered.length === 0) {
    historyListContainer.innerHTML = `<div class="text-center py-10 text-xs text-slate-500 font-medium">Nenhum atendimento no histórico</div>`;
    return;
  }

  historyListContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 border ${isSelected ? 'active' : ''} hover:border-white/[0.08]">
        <div class="w-12 h-12 rounded-2xl ${isSelected ? 'avatar-accent-theme text-white' : 'avatar-inactive-theme'} flex items-center justify-center font-bold text-sm uppercase transition-all shrink-0 overflow-hidden">
          ${chat.cliente_avatar 
            ? `<img src="${chat.cliente_avatar}" alt="${chat.cliente_nome}" class="w-full h-full object-cover" onerror="this.outerHTML='${chat.cliente_nome.substring(0, 2).toUpperCase()}'"/>` 
            : chat.cliente_nome.substring(0, 2).toUpperCase()
          }
        </div>
        <div class="leading-tight text-left flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-200 truncate" title="${chat.cliente_nome}">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0 text-right">
          <span class="text-[8px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">Finalizado</span>
          <span class="text-[7px] text-slate-600 font-mono">${chat.started_at ? new Date(chat.started_at).toLocaleDateString([], {day: '2-digit', month: '2-digit'}) : ''}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Envia busca do histórico ao servidor
function handleHistorySearch() {
  if (!currentOperator) return;
  const query = inputHistorySearch ? inputHistorySearch.value.trim() : '';
  socket.emit('search_history', { query, type: historySearchType, atendente_id: currentOperator.id });
}

// Controla o tipo de busca selecionado no histórico
function setHistorySearchType(type) {
  if (historySearchType === type) return;
  historySearchType = type;

  const buttons = [
    { name: 'chat', btn: btnSearchTypeChat },
    { name: 'message', btn: btnSearchTypeMessage }
  ];

  buttons.forEach(item => {
    if (item.name === type) {
      item.btn.className = "w-8 h-8 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center scale-[1.05] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer";
    } else {
      item.btn.className = "w-8 h-8 rounded-xl bg-transparent border border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer";
    }
  });

  handleHistorySearch();
}

// Controla a busca na aba de Ativos
function handleActiveSearch() {
  activeSearchQuery = inputActiveSearch ? inputActiveSearch.value.trim() : '';
  renderActiveChats();
}

// Controla o filtro rápido selecionado nos Ativos
function setActiveFilter(filter) {
  // Limpar filtro personalizado se houver
  activeCustomFilterId = null;

  if (activeFilterType === filter) {
    // Se o filtro selecionado for o mesmo, apenas garanta o alinhamento do indicador
    const activeBtn = filter === 'all' ? btnActiveFilterAll : (filter === 'unread' ? btnActiveFilterUnread : btnActiveFilterGroups);
    updateActiveFilterIndicator(activeBtn);
    return;
  }
  activeFilterType = filter;

  const filters = [
    { name: 'all', btn: btnActiveFilterAll },
    { name: 'unread', btn: btnActiveFilterUnread },
    { name: 'groups', btn: btnActiveFilterGroups }
  ];

  filters.forEach(item => {
    if (item.btn) {
      if (item.name === filter) {
        item.btn.className = "px-2.5 py-1 rounded-lg text-white text-[9px] font-bold uppercase tracking-wider transition-all scale-[1.02] cursor-pointer z-10";
        updateActiveFilterIndicator(item.btn);
      } else {
        item.btn.className = "px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 hover:scale-[1.01] active:scale-[0.98] text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer z-10";
      }
    }
  });

  renderActiveChats();
}

// Alterna a exibição entre a barra de busca e as pílulas de filtros na aba de Ativos
function toggleActiveSearch(show) {
  const pillsRow = document.getElementById('active-pills-row');
  const searchRow = document.getElementById('active-search-row');
  const searchInput = document.getElementById('input-active-search');

  if (!pillsRow || !searchRow) return;

  if (show) {
    pillsRow.classList.remove('translate-x-0', 'opacity-100');
    pillsRow.classList.add('-translate-x-full', 'opacity-0', 'pointer-events-none');

    searchRow.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
    searchRow.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');

    if (searchInput) {
      setTimeout(() => searchInput.focus(), 150);
    }
  } else {
    searchRow.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    searchRow.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none');

    pillsRow.classList.remove('-translate-x-full', 'opacity-0', 'pointer-events-none');
    pillsRow.classList.add('translate-x-0', 'opacity-100');

    if (searchInput) {
      searchInput.value = '';
    }
    activeSearchQuery = '';
    renderActiveChats();
  }
}

// Abre a bandeja lateral de informações do cliente (Fila / Ativos)
function openClientInfoDrawer(jid, name) {
  const drawer = document.getElementById('client-info-drawer');
  const avatarEl = document.getElementById('client-info-drawer-avatar');
  const nameEl = document.getElementById('client-info-drawer-name');
  const phoneEl = document.getElementById('client-info-drawer-phone');
  const statusEl = document.getElementById('client-info-drawer-status');
  const takeBtn = document.getElementById('btn-client-info-drawer-take');

  if (!drawer) return;

  nameEl.textContent = name;
  phoneEl.textContent = jid.split('@')[0];

  // Identificar se está na Fila ou Ativos
  const inQueue = queueChats.some(c => c.cliente_jid === jid);
  const chatObj = queueChats.find(c => c.cliente_jid === jid) || activeChats.find(c => c.cliente_jid === jid);
  const avatar = chatObj ? chatObj.cliente_avatar : null;

  if (avatar) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="${name}" class="w-full h-full object-cover" onerror="this.outerHTML='${name.substring(0, 2).toUpperCase()}'"/>`;
    avatarEl.className = "w-28 h-28 rounded-2xl mx-auto border border-white/10 flex items-center justify-center shrink-0 overflow-hidden bg-slate-800 cursor-zoom-in hover:scale-105 active:scale-95 transition-all duration-200 shadow-md";
    avatarEl.onclick = () => openAvatarZoomModal(avatar, name);
  } else {
    avatarEl.innerHTML = name.substring(0, 2).toUpperCase();
    avatarEl.className = "w-28 h-28 rounded-2xl mx-auto avatar-accent-theme flex items-center justify-center font-bold text-3xl uppercase text-white shadow-lg shrink-0 cursor-zoom-in hover:scale-105 active:scale-95 transition-all duration-200";
    avatarEl.onclick = () => openAvatarZoomModal(null, name);
  }

  if (inQueue) {
    statusEl.textContent = "Aguardando na Fila";
    statusEl.className = "font-bold text-amber-400";
    takeBtn.className = "w-full h-11 premium-gradient text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all active:scale-95 shadow-lg cursor-pointer";
    takeBtn.removeAttribute('disabled');
    takeBtn.onclick = () => {
      takeChat(jid);
      closeClientInfoDrawer();
    };
  } else {
    statusEl.textContent = "Em Atendimento";
    statusEl.className = "font-bold text-emerald-400";
    takeBtn.className = "w-full h-11 bg-white/5 border border-white/5 text-slate-500 rounded-xl text-xs font-bold tracking-wider uppercase cursor-not-allowed opacity-50";
    takeBtn.setAttribute('disabled', 'true');
    takeBtn.onclick = null;
  }

  // Animar abertura da bandeja lateral (slide-in)
  drawer.classList.remove('w-0', 'border-transparent');
  drawer.classList.add('w-[400px]', 'border-white/10');
}

// Fecha a bandeja lateral de informações do cliente
function closeClientInfoDrawer() {
  const drawer = document.getElementById('client-info-drawer');
  if (drawer) {
    drawer.classList.remove('w-[400px]', 'border-white/10');
    drawer.classList.add('w-0', 'border-transparent');
  }
}

// Abre a bandeja ao clicar no cabeçalho da conversa
function handleChatHeaderClick() {
  if (selectedChatJid && selectedChatName) {
    openClientInfoDrawer(selectedChatJid, selectedChatName);
  }
}

// Abre o modal de zoom do avatar
function openAvatarZoomModal(imgUrl, name) {
  const modal = document.getElementById('avatar-zoom-modal');
  const container = document.getElementById('zoomed-avatar-container');
  const nameEl = document.getElementById('zoomed-avatar-name');
  const wrapper = document.getElementById('avatar-zoom-content-wrapper');
  if (!modal || !container || !nameEl || !wrapper) return;

  nameEl.textContent = name;

  if (imgUrl) {
    container.innerHTML = `<img src="${imgUrl}" alt="${name}" class="w-full h-full object-cover" />`;
    container.className = "w-80 h-80 sm:w-96 sm:h-96 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center bg-slate-800";
  } else {
    container.innerHTML = name.substring(0, 2).toUpperCase();
    container.className = "w-80 h-80 sm:w-96 sm:h-96 rounded-3xl border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center avatar-accent-theme text-7xl font-black uppercase text-white";
  }

  // Ativar transições de fade e escala
  modal.classList.remove('opacity-0', 'pointer-events-none');
  modal.classList.add('opacity-100', 'pointer-events-auto');
  wrapper.classList.remove('scale-95');
  wrapper.classList.add('scale-100');
}

// Fecha o modal de zoom do avatar
function closeAvatarZoomModal() {
  const modal = document.getElementById('avatar-zoom-modal');
  const wrapper = document.getElementById('avatar-zoom-content-wrapper');
  if (modal && wrapper) {
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
    wrapper.classList.remove('scale-100');
    wrapper.classList.add('scale-95');
  }
}

// Abre o modal de cadastro de novo filtro personalizado
function openCustomFilterModal() {
  const modal = document.getElementById('custom-filter-modal');
  if (modal) {
    // Resetar campos
    document.getElementById('input-filter-name').value = '';
    document.getElementById('input-filter-keyword').value = '';
    document.getElementById('select-filter-type').value = 'all';
    document.getElementById('checkbox-filter-unread').checked = false;
    modal.classList.remove('hidden');
  }
}

// Fecha o modal de cadastro de novo filtro
function closeCustomFilterModal() {
  const modal = document.getElementById('custom-filter-modal');
  if (modal) modal.classList.add('hidden');
}

// Salva o filtro personalizado configurado no localStorage
function saveCustomFilter(e) {
  e.preventDefault();
  const name = document.getElementById('input-filter-name').value.trim();
  const keyword = document.getElementById('input-filter-keyword').value.trim();
  const type = document.getElementById('select-filter-type').value;
  const unreadOnly = document.getElementById('checkbox-filter-unread').checked;

  if (!name) return;

  const newFilter = {
    id: 'filter_' + Date.now(),
    name: name,
    keyword: keyword,
    type: type,
    unreadOnly: unreadOnly
  };

  customFilters.push(newFilter);
  localStorage.setItem('tf_custom_filters', JSON.stringify(customFilters));
  
  closeCustomFilterModal();
  renderCustomFiltersDropdown();
}

// Deleta um filtro personalizado existente
function deleteCustomFilter(filterId, event) {
  if (event) event.stopPropagation();
  customFilters = customFilters.filter(f => f.id !== filterId);
  localStorage.setItem('tf_custom_filters', JSON.stringify(customFilters));
  
  if (activeCustomFilterId === filterId) {
    applyCustomFilter(null);
  } else {
    renderCustomFiltersDropdown();
  }
}

// Aplica um filtro personalizado na listagem
function applyCustomFilter(filterId) {
  activeCustomFilterId = filterId;
  
  // Limpar os filtros rápidos tradicionais se for um filtro ativo
  if (filterId) {
    activeFilterType = 'custom';
    
    // Atualizar estilo visual das abas normais (remover classe active de Tudo/Não Lidas/Grupos)
    const pills = [btnActiveFilterAll, btnActiveFilterUnread, btnActiveFilterGroups];
    pills.forEach(btn => {
      if (btn) {
        btn.className = "px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 hover:scale-[1.01] active:scale-[0.98] text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer z-10";
      }
    });
    // Apagar indicador deslizante
    updateActiveFilterIndicator(null);
  } else {
    // Se limpar, volta para o Tudo
    setActiveFilter('all');
    return;
  }

  const dropdown = document.getElementById('active-filter-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  
  renderActiveChats();
}

// Desenha a lista de filtros personalizados no menu suspenso
function renderCustomFiltersDropdown() {
  const container = document.getElementById('custom-filters-list');
  if (!container) return;

  if (customFilters.length === 0) {
    container.innerHTML = `<div class="px-3 py-3.5 text-[8px] font-semibold text-slate-600 text-center select-none">Nenhum filtro criado.</div>`;
    return;
  }

  container.innerHTML = customFilters.map(filter => {
    const isSelected = activeCustomFilterId === filter.id;
    return `
      <div onclick="applyCustomFilter('${filter.id}')" class="group flex items-center justify-between px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer transition-all shrink-0 ${isSelected ? 'bg-white/5 text-white' : ''}">
        <span class="truncate flex-1 pr-2 text-left">${filter.name}</span>
        <div class="flex items-center gap-1.5">
          ${isSelected ? '<span class="text-blue-400">✓</span>' : ''}
          <button onclick="deleteCustomFilter('${filter.id}', event)" class="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 rounded transition-all cursor-pointer" title="Excluir filtro">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Desenha a lista de setores no menu suspenso
function renderSectorsDropdown() {
  const container = document.getElementById('sectors-filter-list');
  if (!container) return;

  if (allowedSectors.length === 0) {
    container.innerHTML = `<div class="px-3 py-3.5 text-[8px] font-semibold text-slate-600 text-center select-none">Nenhum setor disponível.</div>`;
    return;
  }

  container.innerHTML = allowedSectors.map(sector => {
    const isChecked = selectedSectorsFilter.includes(sector.id);
    return `
      <div onclick="toggleSectorFilter(${sector.id}, event)" class="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer rounded-xl select-none transition-all">
        <div class="w-3.5 h-3.5 rounded border border-white/20 bg-slate-950/60 flex items-center justify-center transition-all shrink-0 ${isChecked ? 'bg-accent-theme border-accent-theme text-white shadow-sm shadow-accent-theme/20' : 'text-transparent'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <span class="text-[9px] font-bold uppercase tracking-wider text-slate-300 truncate">${sector.name}</span>
      </div>
    `;
  }).join('');
}

// Alterna a exibição do dropdown de filtros por clique
function toggleActiveFilterDropdown(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropdown = document.getElementById('active-filter-dropdown');
  if (!dropdown) return;

  if (dropdown.classList.contains('hidden')) {
    // Renderiza a lista antes de exibir
    renderCustomFiltersDropdown();
    renderSectorsDropdown();

    const targetBtn = document.getElementById('btn-active-extra-filter') || e.currentTarget;
    const rect = targetBtn.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.classList.remove('hidden');

    // Fechar ao clicar fora
    document.addEventListener('click', closeActiveFilterDropdownOutside);
  } else {
    hideActiveFilterDropdown();
  }
}

function hideActiveFilterDropdown() {
  const dropdown = document.getElementById('active-filter-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  document.removeEventListener('click', closeActiveFilterDropdownOutside);
}

function closeActiveFilterDropdownOutside(e) {
  const dropdown = document.getElementById('active-filter-dropdown');
  const button = document.getElementById('btn-active-extra-filter');
  if (!dropdown) return;

  // Se o clique for fora do dropdown e fora do botão de filtro, fecha
  if (!dropdown.contains(e.target) && (!button || !button.contains(e.target))) {
    hideActiveFilterDropdown();
  }
}

// Altera a ordenação dos Ativos e atualiza a exibição
function setActiveSort(order) {
  if (activeChatsSortOrder === order) return;
  activeChatsSortOrder = order;

  const descCheck = document.getElementById('sort-desc-check');
  const ascCheck = document.getElementById('sort-asc-check');

  if (descCheck && ascCheck) {
    if (order === 'desc') {
      descCheck.classList.remove('hidden');
      ascCheck.classList.add('hidden');
    } else {
      ascCheck.classList.remove('hidden');
      descCheck.classList.add('hidden');
    }
  }

  renderActiveChats();
}

// Recebe Lista de Conversas do Bot
socket.on('bot_chats_list', (rows) => {
  botChats = rows;
  renderBotChats();
});

function renderBotChats() {
  if (!botChatsContainer) return;

  let filtered = [...botChats];
  if (allowedSectors.length > 0) {
    filtered = filtered.filter(chat => {
      return chat.sector_id === null || chat.sector_id === undefined || selectedSectorsFilter.includes(chat.sector_id);
    });
  }

  // Update badge to match filtered list
  const botCountBadge = document.getElementById('bot-chats-count') || document.querySelector('#tab-bot span');
  if (botCountBadge) {
    botCountBadge.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    botChatsContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-10 h-10 rounded-xl bot-placeholder-icon flex items-center justify-center mb-3.5 shadow-md shadow-blue-500/5">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <p class="text-xs font-semibold text-slate-300">Nenhum cliente no Bot</p>
        <p class="text-[10px] text-slate-500 mt-1.5 max-w-[170px] mx-auto leading-normal">Os clientes interagindo com o Chatbot aparecerão aqui.</p>
      </div>
    `;
    return;
  }

  botChatsContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 border ${isSelected ? 'active' : ''} hover:border-white/[0.08]">
        <div class="w-12 h-12 rounded-2xl ${isSelected ? 'avatar-accent-theme text-white' : 'avatar-inactive-theme'} flex items-center justify-center font-bold text-sm uppercase transition-all shrink-0 overflow-hidden">
          ${chat.cliente_avatar 
            ? `<img src="${chat.cliente_avatar}" alt="${chat.cliente_nome}" class="w-full h-full object-cover" onerror="this.outerHTML='${chat.cliente_nome.substring(0, 2).toUpperCase()}'"/>` 
            : chat.cliente_nome.substring(0, 2).toUpperCase()
          }
        </div>
        <div class="leading-tight text-left flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-200 truncate">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <div class="relative flex h-2 w-2 shrink-0">
          <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </div>
      </div>
    `;
  }).join('');
}

function renderActiveChats() {
  if (!activeListContainer) return;

  // 1. Filtrar com base no tipo de filtro selecionado
  let filtered = [...activeChats];
  if (activeFilterType === 'unread') {
    filtered = filtered.filter(chat => chat.unread === 1);
  } else if (activeFilterType === 'groups') {
    filtered = filtered.filter(chat => chat.cliente_jid && chat.cliente_jid.endsWith('@g.us'));
  } else if (activeFilterType === 'custom' && activeCustomFilterId) {
    const filter = customFilters.find(f => f.id === activeCustomFilterId);
    if (filter) {
      if (filter.type === 'private') {
        filtered = filtered.filter(chat => chat.cliente_jid && !chat.cliente_jid.endsWith('@g.us'));
      } else if (filter.type === 'groups') {
        filtered = filtered.filter(chat => chat.cliente_jid && chat.cliente_jid.endsWith('@g.us'));
      }
      
      if (filter.unreadOnly) {
        filtered = filtered.filter(chat => chat.unread === 1);
      }
      
      if (filter.keyword) {
        const kw = filter.keyword.toLowerCase();
        filtered = filtered.filter(chat => 
          (chat.cliente_nome && chat.cliente_nome.toLowerCase().includes(kw)) ||
          (chat.cliente_jid && chat.cliente_jid.includes(kw))
        );
      }
    }
  }

  // 2. Filtrar com base na query de busca
  if (activeSearchQuery) {
    const query = activeSearchQuery.toLowerCase();
    filtered = filtered.filter(chat => 
      (chat.cliente_nome && chat.cliente_nome.toLowerCase().includes(query)) ||
      (chat.cliente_jid && chat.cliente_jid.includes(query))
    );
  }

  // Filtrar por setores selecionados
  if (allowedSectors.length > 0) {
    filtered = filtered.filter(chat => {
      return chat.sector_id === null || chat.sector_id === undefined || selectedSectorsFilter.includes(chat.sector_id);
    });
  }

  // 3. Ordenar os resultados
  filtered.sort((a, b) => {
    return activeChatsSortOrder === 'desc' ? b.id - a.id : a.id - b.id;
  });

  if (filtered.length === 0) {
    activeListContainer.innerHTML = `<div class="text-center py-10 text-xs text-slate-500 font-medium">Nenhum atendimento encontrado</div>`;
    return;
  }

  activeListContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    const isUnread = chat.unread === 1;
    const isGroup = chat.cliente_jid && chat.cliente_jid.endsWith('@g.us');
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 border ${isSelected ? 'active' : ''} hover:border-white/[0.08]">
        <div class="w-12 h-12 rounded-2xl ${isSelected ? 'avatar-accent-theme text-white' : 'avatar-inactive-theme'} flex items-center justify-center font-bold text-sm uppercase transition-all shrink-0 overflow-hidden">
          ${chat.cliente_avatar 
            ? `<img src="${chat.cliente_avatar}" alt="${chat.cliente_nome}" class="w-full h-full object-cover" onerror="this.outerHTML='${chat.cliente_nome.substring(0, 2).toUpperCase()}'"/>` 
            : chat.cliente_nome.substring(0, 2).toUpperCase()
          }
        </div>
        <div class="leading-tight text-left flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="text-xs font-semibold text-slate-200 truncate flex-1">${chat.cliente_nome}</p>
            ${isGroup ? `
              <span class="text-[8px] bg-slate-800 text-slate-400 font-black px-1.5 py-0.5 rounded-md uppercase shrink-0">Grupo</span>
            ` : ''}
          </div>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${isUnread ? `
            <div class="relative flex h-2 w-2" title="Mensagem não lida">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </div>
          ` : ''}
          <div class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Seleciona um chat ativo
function selectChat(jid, name) {
  selectedChatJid = jid;
  selectedChatName = name;

  // Atualiza UI
  emptyChatState.classList.add('hidden');
  activeChatArea.classList.remove('hidden');
  activeChatArea.classList.remove('opacity-0');
  activeChatArea.classList.add('fade-in');
  
  chatClientName.textContent = name;
  chatClientJid.textContent = jid.split('@')[0];

  // Carrega e exibe avatar no cabeçalho
  const chatObj = activeChats.find(c => c.cliente_jid === jid) || queueChats.find(c => c.cliente_jid === jid);
  const avatar = chatObj ? chatObj.cliente_avatar : null;
  
  if (avatar) {
    chatClientAvatar.innerHTML = `<img src="${avatar}" alt="${name}" class="w-full h-full object-cover" onerror="this.innerHTML='${name.substring(0, 2).toUpperCase()}'"/>`;
    chatClientAvatar.className = "w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center shrink-0 overflow-hidden";
  } else {
    chatClientAvatar.innerHTML = name.substring(0, 2).toUpperCase();
    chatClientAvatar.className = "w-12 h-12 rounded-2xl avatar-accent-theme flex items-center justify-center font-bold text-sm uppercase text-white shadow-lg shrink-0";
  }

  // Solicita histórico de mensagens
  socket.emit('select_chat', { cliente_jid: jid, atendente_id: currentOperator.id });

  // Verifica se o chat está na fila de espera (modo de leitura)
  checkReadOnlyBanner();

  // Re-renderiza para destacar o chat selecionado
  renderActiveChats();
}

// ==============================================================================
// 💬 RENDERIZAÇÃO DE MENSAGENS E HISTÓRICO
// ==============================================================================

// Recebe Histórico do Chat Selecionado
socket.on('chat_history', ({ cliente_jid, messages }) => {
  if (selectedChatJid !== cliente_jid) return;

  currentChatMessages = messages;
  messagesContainer.innerHTML = '';
  messages.forEach(msg => {
    appendMessageHTML(msg);
  });
  
  scrollToBottom();
});

// Recebe Nova Mensagem
socket.on('new_message', (msg) => {
  // Se for mensagem do chat selecionado
  if (selectedChatJid === msg.cliente_jid) {
    currentChatMessages.push(msg);
    appendMessageHTML(msg);
    scrollToBottom();
    // Avisa o servidor que já visualizamos a mensagem para limpar o status "não lido"
    if (currentOperator) {
      socket.emit('select_chat', { cliente_jid: selectedChatJid, atendente_id: currentOperator.id });
    }
  }
});

// Adiciona HTML de mensagem à tela
function appendMessageHTML(msg) {
  const isSystem = msg.remetente === 'sistema';
  const isClient = msg.remetente === 'cliente';
  
  let bubbleClass = 'msg-bubble msg-system';
  if (!isSystem) {
    bubbleClass = isClient ? 'msg-bubble msg-client' : 'msg-bubble msg-attendant';
  }

  // Parse robusto de data para o SQLite
  let dateStr = msg.timestamp;
  if (dateStr && dateStr.includes(' ') && !dateStr.includes('T')) {
    dateStr = dateStr.replace(' ', 'T');
  }
  const date = new Date(dateStr);
  const formattedTime = isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex flex-col w-full ${isSystem ? 'items-center' : (isClient ? 'items-start' : 'items-end')}`;
  msgDiv.setAttribute('data-message-id', msg.id);
  
  if (isSystem) {
    msgDiv.innerHTML = `<span class="${bubbleClass}">${msg.texto}</span>`;
  } else {
    // Parser de citação de resposta
    let textToShow = msg.texto;
    let quoteHTML = '';
    if (msg.texto && msg.texto.startsWith('*Respondendo a:*')) {
      const match = msg.texto.match(/^\*Respondendo a:\*\s*_"([\s\S]*?)"_\n\n([\s\S]*)$/);
      if (match) {
        const quotedText = match[1];
        const replyText = match[2];
        quoteHTML = `
          <div class="mb-2 p-2 rounded-lg bg-black/20 border-l-4 border-white/40 text-[11px] opacity-80 italic max-h-16 overflow-y-auto custom-scrollbar text-left text-slate-100">
            ${quotedText}
          </div>
        `;
        textToShow = replyText;
      }
    }

    // Renderizador de reação
    let reactionHTML = '';
    if (msg.reacao) {
      reactionHTML = `
        <div class="absolute -bottom-2.5 right-4 msg-reaction-badge rounded-full px-1.5 py-0.5 text-[10px] flex items-center justify-center shadow-md cursor-pointer hover:scale-110 transition-all z-10" onclick="removeReaction(${msg.id})">
          ${msg.reacao}
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <div class="${bubbleClass}">
        ${quoteHTML}
        <p class="whitespace-pre-wrap leading-relaxed">${textToShow}</p>
        <span class="msg-time">${formattedTime}</span>
        ${reactionHTML}
      </div>
    `;
  }

  messagesContainer.appendChild(msgDiv);
}

// Váriáveis globais de controle do Menu de Contexto e Citações
let activeContextMessage = null;
let replyingToMessage = null;

// Envia mensagem pelo input do chat
function sendMessage(e) {
  e.preventDefault();
  let text = chatInput.value.trim();
  if (!text || !selectedChatJid) return;

  if (replyingToMessage) {
    // Formatar como resposta usando markdown compatível
    text = `*Respondendo a:* _"${replyingToMessage.text}"_\n\n${text}`;
    cancelReply();
  }

  socket.emit('send_message', {
    cliente_jid: selectedChatJid,
    texto: text,
    atendente_id: currentOperator.id
  });

  chatInput.value = '';
}

// Finaliza Atendimento atual
async function finishCurrentChat() {
  if (!selectedChatJid) return;
  
  const confirmed = await showCustomConfirm(
    'Finalizar Atendimento?',
    `Tem certeza que deseja finalizar o atendimento de ${selectedChatName}? A conversa será fechada.`,
    'info'
  );
  
  if (confirmed) {
    socket.emit('finish_chat', { cliente_jid: selectedChatJid, atendente_id: currentOperator.id });
    
    // Retorna ao estado vazio
    selectedChatJid = null;
    selectedChatName = '';
    
    activeChatArea.classList.add('hidden');
    emptyChatState.classList.remove('hidden');
  }
}

// Scroll automático para a última mensagem
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Erros de Envio vindos do servidor
socket.on('error_message', (msg) => {
  alert(`⚠️ Erro: ${msg}`);
});

// Listener de exclusão de mensagem do SQLite
socket.on('message_deleted', ({ message_id, cliente_jid }) => {
  if (selectedChatJid === cliente_jid) {
    const element = document.querySelector(`[data-message-id="${message_id}"]`);
    if (element) {
      element.remove();
    }
  }
});

// ==============================================================================
// 📋 LÓGICA DO MENU DE CONTEXTO E MODAL DE ENCAMINHAMENTO
// ==============================================================================
const contextMenu = document.getElementById('message-context-menu');
const contextMainView = document.getElementById('context-main-view');
const contextEmojiView = document.getElementById('context-emoji-view');
const contextEmojiGrid = document.getElementById('context-emoji-grid');
const forwardModal = document.getElementById('forward-modal');
const forwardChatsList = document.getElementById('forward-chats-list');
const inputForwardPhone = document.getElementById('input-forward-phone');

// Menu de contexto dos cards de chat ativos
const chatContextMenu = document.getElementById('chat-context-menu');
let activeChatContextJid = null;

// Interceptar clique com o botão direito nos cards de chat ativos
activeContainer.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('.glass-card');
  if (!card) return;

  e.preventDefault();

  const clientJid = card.getAttribute('data-client-jid');
  if (!clientJid) return;

  activeChatContextJid = clientJid;
  showChatContextMenu(e.clientX, e.clientY);
});

// Interceptar clique com o botão direito nas mensagens do chat
messagesContainer.addEventListener('contextmenu', (e) => {
  const bubble = e.target.closest('.msg-bubble');
  if (!bubble) return;

  e.preventDefault();

  // Impedir abertura do menu de contexto se o atendimento não estiver ativo com o atendente atual
  const isActiveChat = activeChats.some(c => c.cliente_jid === selectedChatJid);
  if (!isActiveChat) return;

  const msgDiv = bubble.closest('[data-message-id]');
  if (!msgDiv) return;

  const messageId = msgDiv.getAttribute('data-message-id');
  const paragraph = bubble.querySelector('p');
  const messageText = paragraph ? paragraph.textContent : '';
  const messageSender = bubble.classList.contains('msg-client') ? 'cliente' : (bubble.classList.contains('msg-attendant') ? 'atendente' : 'sistema');

  if (messageSender === 'sistema') return; // impede ações em mensagens de sistema

  // Achar mensagem correspondente na memória local do chat
  const msgIdNum = parseInt(messageId, 10);
  const foundMsg = currentChatMessages.find(m => m.id === msgIdNum);

  activeContextMessage = {
    id: messageId,
    text: messageText,
    sender: messageSender,
    fullMsg: foundMsg
  };

  // Exibir ou ocultar a opção de excluir baseado no remetente (apenas atendente pode excluir suas próprias mensagens)
  const deleteBtn = document.getElementById('context-delete-btn');
  const deleteDivider = document.getElementById('context-delete-divider');
  if (deleteBtn && deleteDivider) {
    if (messageSender === 'atendente') {
      deleteBtn.classList.remove('hidden');
      deleteDivider.classList.remove('hidden');
    } else {
      deleteBtn.classList.add('hidden');
      deleteDivider.classList.add('hidden');
    }
  }

  showContextMenu(e.clientX, e.clientY);
});

const popularEmojis = [
  '👍', '👎', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏', '🎉', '✨', '💡',
  '😀', '😍', '😊', '😉', '😎', '🥳', '🤔', '🤫', '🥺', '😭', '😡', '🤯',
  '😴', '🤮', '🤢', '🤡', '💩', '👻', '💀', '👽', '🤖', '👑', '💯', '✔️',
  '❌', '⚠️', '🔔', '💬', '✉️', '📞', '📌', '📍', '🔍', '⚙️', '🔒', '🔑',
  '🚀', '✈️', '🚗', '🛵', '🚲', '🏠', '🏢', '💼', '💻', '📱', '⌚', '💵',
  '🎁', '🎈', '🎨', '🎬', '🎧', '🎵', '⚽', '🏆', '⭐', '🌈', '☀️', '❄️'
];

function renderRecentReactions() {
  const container = document.getElementById('context-recent-reactions');
  if (!container) return;
  
  let recent = localStorage.getItem('tf_recent_reactions');
  recent = recent ? JSON.parse(recent) : ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  
  container.innerHTML = recent.map(emoji => `
    <button onclick="handleContextReact('${emoji}')">${emoji}</button>
  `).join('');
}

function recordReactionUsage(emoji) {
  let recent = localStorage.getItem('tf_recent_reactions');
  recent = recent ? JSON.parse(recent) : ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  
  recent = recent.filter(e => e !== emoji);
  recent.unshift(emoji);
  recent = recent.slice(0, 6);
  
  localStorage.setItem('tf_recent_reactions', JSON.stringify(recent));
  renderRecentReactions();
}

function initEmojiGrid() {
  if (!contextEmojiGrid) return;
  contextEmojiGrid.innerHTML = popularEmojis.map(emoji => `
    <button onclick="handleContextReact('${emoji}')">${emoji}</button>
  `).join('');
}

function showContextMenu(x, y) {
  if (!contextMenu) return;

  // Resetar para visão principal do menu
  if (contextMainView) contextMainView.classList.remove('hidden');
  if (contextEmojiView) contextEmojiView.classList.add('hidden');
  
  renderRecentReactions();

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');

  // Ajusta a posição caso ultrapasse o limite inferior/direito da tela
  const rect = contextMenu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = `${y - rect.height}px`;
  }
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = `${x - rect.width}px`;
  }

  document.addEventListener('click', closeContextMenu);
}

function closeContextMenu() {
  if (contextMenu) contextMenu.classList.add('hidden');
  document.removeEventListener('click', closeContextMenu);
}

// Lógica de exibição e ações do menu de contexto de chat
function showChatContextMenu(x, y) {
  if (!chatContextMenu) return;

  chatContextMenu.style.left = `${x}px`;
  chatContextMenu.style.top = `${y}px`;
  chatContextMenu.classList.remove('hidden');

  // Ajusta a posição caso ultrapasse o limite inferior/direito da tela
  const rect = chatContextMenu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    chatContextMenu.style.top = `${y - rect.height}px`;
  }
  if (rect.right > window.innerWidth) {
    chatContextMenu.style.left = `${x - rect.width}px`;
  }

  document.addEventListener('click', closeChatContextMenu);
}

function closeChatContextMenu() {
  if (chatContextMenu) chatContextMenu.classList.add('hidden');
  document.removeEventListener('click', closeChatContextMenu);
}

function handleChatContextMarkUnread(e) {
  e.stopPropagation();
  closeChatContextMenu();
  if (!activeChatContextJid || !currentOperator) return;

  socket.emit('mark_unread', { 
    cliente_jid: activeChatContextJid, 
    atendente_id: currentOperator.id 
  });
}

function handleChatContextFinishSilently(e) {
  e.stopPropagation();
  closeChatContextMenu();
  if (!activeChatContextJid || !currentOperator) return;

  socket.emit('finish_chat_silently', { 
    cliente_jid: activeChatContextJid, 
    atendente_id: currentOperator.id 
  });
}

// Ação: Dados da Mensagem
function handleContextInfo() {
  if (!activeContextMessage || !activeContextMessage.fullMsg) return;
  const msg = activeContextMessage.fullMsg;
  
  const content = document.getElementById('message-info-content');
  if (!content) return;
  
  const senderType = msg.remetente === 'cliente' ? 'Cliente' : (msg.remetente === 'sistema' ? 'Sistema' : 'Atendente');
  const date = new Date(msg.timestamp);
  const formattedDate = isNaN(date.getTime()) ? msg.timestamp : date.toLocaleString('pt-BR');
  
  content.innerHTML = `
    <div class="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
      <p><strong>ID da Mensagem:</strong> <span class="font-mono text-accent-theme">${msg.id}</span></p>
      <p><strong>Remetente:</strong> ${senderType} (${msg.remetente})</p>
      <p><strong>Destinatário (JID):</strong> <span class="font-mono">${msg.cliente_jid}</span></p>
      <p><strong>Data/Hora de Envio:</strong> ${formattedDate}</p>
      <p><strong>Reação Atual:</strong> ${msg.reacao || 'Nenhuma'}</p>
      <div class="border-t border-white/5 pt-2 mt-2">
        <p class="font-bold mb-1">Conteúdo da Mensagem:</p>
        <p class="whitespace-pre-wrap bg-black/20 p-2.5 rounded-xl border border-white/5 max-h-32 overflow-y-auto font-mono text-[11px]">${msg.texto}</p>
      </div>
    </div>
  `;
  
  closeContextMenu();
  const infoModal = document.getElementById('message-info-modal');
  if (infoModal) infoModal.classList.remove('hidden');
}

function closeMessageInfoModal() {
  const infoModal = document.getElementById('message-info-modal');
  if (infoModal) infoModal.classList.add('hidden');
}

// Ação: Responder
function handleContextReply() {
  if (!activeContextMessage) return;

  replyingToMessage = activeContextMessage;

  const previewContainer = document.getElementById('reply-preview-container');
  const previewTitle = document.getElementById('reply-preview-title');
  const previewText = document.getElementById('reply-preview-text');

  if (previewContainer && previewTitle && previewText) {
    previewTitle.textContent = replyingToMessage.sender === 'cliente'
      ? `Respondendo a ${selectedChatName}`
      : 'Respondendo a Você';
    
    previewText.textContent = replyingToMessage.text;
    previewContainer.classList.remove('hidden');
  }

  closeContextMenu();
  if (chatInput) chatInput.focus();
}

function cancelReply() {
  replyingToMessage = null;
  const previewContainer = document.getElementById('reply-preview-container');
  if (previewContainer) {
    previewContainer.classList.add('hidden');
  }
}

// Ação: Copiar
function handleContextCopy() {
  if (!activeContextMessage) return;
  navigator.clipboard.writeText(activeContextMessage.text)
    .then(() => {
      alert('Mensagem copiada para a área de transferência!');
    })
    .catch(err => {
      console.error('Erro ao copiar mensagem:', err);
    });
  closeContextMenu();
}

// Ação: Reagir
function handleContextReact(emoji) {
  if (!activeContextMessage) return;
  
  socket.emit('react_message', {
    message_id: activeContextMessage.id,
    reacao: emoji,
    atendente_id: currentOperator.id,
    cliente_jid: selectedChatJid
  });

  recordReactionUsage(emoji);
  closeContextMenu();
}

// Ação: Reagir via menu (abre o seletor expandido de emojis)
function handleContextReactMenu(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (contextMainView) contextMainView.classList.add('hidden');
  if (contextEmojiView) contextEmojiView.classList.remove('hidden');
}

// Retorna para visualização principal do menu
function showContextMainView(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (contextEmojiView) contextEmojiView.classList.add('hidden');
  if (contextMainView) contextMainView.classList.remove('hidden');
}

// Remover Reação
window.removeReaction = function(messageId) {
  const isActiveChat = activeChats.some(c => c.cliente_jid === selectedChatJid);
  if (!isActiveChat) return;

  socket.emit('react_message', {
    message_id: messageId,
    reacao: null,
    atendente_id: currentOperator.id,
    cliente_jid: selectedChatJid
  });
};

// Ação: Encaminhar
function handleContextForward() {
  if (!activeContextMessage || !forwardModal) return;

  if (activeChats.length === 0) {
    forwardChatsList.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Nenhum atendimento ativo disponível</p>';
  } else {
    forwardChatsList.innerHTML = activeChats.map(chat => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
        <div class="leading-tight text-left flex-1 min-w-0 pr-3">
          <p class="text-xs font-semibold text-slate-200 truncate">${chat.cliente_nome}</p>
          <p class="text-[9px] text-slate-500 font-mono mt-0.5 truncate">${chat.cliente_jid.split('@')[0]}</p>
        </div>
        <button onclick="submitForwardToJid('${chat.cliente_jid}', '${chat.cliente_nome}')" class="px-3.5 py-1.5 btn-accent-theme rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95 shadow-md">
          Encaminhar
        </button>
      </div>
    `).join('');
  }

  if (inputForwardPhone) inputForwardPhone.value = '';
  forwardModal.classList.remove('hidden');
}

function closeForwardModal() {
  if (forwardModal) forwardModal.classList.add('hidden');
}

function submitForwardToJid(jid, name) {
  if (!activeContextMessage) return;

  socket.emit('send_message', {
    cliente_jid: jid,
    texto: `_Mensagem encaminhada:_\n\n${activeContextMessage.text}`,
    atendente_id: currentOperator.id
  });

  closeForwardModal();
  alert(`Mensagem encaminhada para ${name}!`);
}

function submitForwardToPhone() {
  if (!activeContextMessage || !inputForwardPhone) return;
  const phone = inputForwardPhone.value.trim();
  if (!phone) return;

  let jid = phone;
  if (!jid.includes('@')) {
    jid = `${jid}@c.us`;
  }

  socket.emit('send_message', {
    cliente_jid: jid,
    texto: `_Mensagem encaminhada:_\n\n${activeContextMessage.text}`,
    atendente_id: currentOperator.id
  });

  closeForwardModal();
  alert(`Mensagem encaminhada para o número ${phone}!`);
}

// Ação: Apagar (excluir)
async function handleContextDelete() {
  if (!activeContextMessage) return;
  const confirmed = await showCustomConfirm(
    'Apagar Mensagem?',
    'Tem certeza que deseja apagar esta mensagem? Ela será removida permanentemente do histórico local.',
    'danger'
  );
  if (confirmed) {
    socket.emit('delete_message', {
      message_id: activeContextMessage.id,
      atendente_id: currentOperator.id,
      cliente_jid: selectedChatJid
    });
    closeContextMenu();
  }
}

// Listener de reação de mensagem do socket
socket.on('message_reacted', ({ message_id, reacao, cliente_jid }) => {
  // Atualizar o array local
  const msgIdNum = parseInt(message_id, 10);
  const msg = currentChatMessages.find(m => m.id === msgIdNum);
  if (msg) {
    msg.reacao = reacao;
  }

  if (selectedChatJid === cliente_jid) {
    // Atualizar visualmente o balão na tela
    const element = document.querySelector(`[data-message-id="${message_id}"]`);
    if (element) {
      // Remover o badge existente se houver
      const existingBadge = element.querySelector('.msg-reaction-badge');
      if (existingBadge) {
        existingBadge.remove();
      }
      
      // Adicionar novo se reacao não for nula
      if (reacao) {
        const bubble = element.querySelector('.msg-bubble');
        if (bubble) {
          const badgeDiv = document.createElement('div');
          badgeDiv.className = 'absolute -bottom-2.5 right-4 msg-reaction-badge rounded-full px-1.5 py-0.5 text-[10px] flex items-center justify-center shadow-md cursor-pointer hover:scale-110 transition-all z-10';
          badgeDiv.setAttribute('onclick', `removeReaction(${message_id})`);
          badgeDiv.textContent = reacao;
          bubble.appendChild(badgeDiv);
        }
      }
    }
  }
});

// ==============================================================================
// 🚀 INICIALIZAÇÃO
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initOperator();
  initEmojiGrid();
  
  if (contextMenu) {
    contextMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Initialize sliding indicators
  setTimeout(() => {
    updateTabIndicator(tabActiveBtn);
    updateActiveFilterIndicator(btnActiveFilterAll);
  }, 150);

  // Update indicators position on window resize
  window.addEventListener('resize', () => {
    const activeBtn = currentSidebarTab === 'active' ? tabActiveBtn : (currentSidebarTab === 'queue' ? tabQueueBtn : (currentSidebarTab === 'bot' ? tabBotBtn : tabHistoryBtn));
    updateTabIndicator(activeBtn);
    
    const activeFilterBtn = activeFilterType === 'all' ? btnActiveFilterAll : (activeFilterType === 'unread' ? btnActiveFilterUnread : (activeFilterType === 'groups' ? btnActiveFilterGroups : null));
    updateActiveFilterIndicator(activeFilterBtn);
  });
});

// ==============================================================================
// 💬 DIÁLOGO DE CONFIRMAÇÃO CUSTOMIZADO (SISTEMA)
// ==============================================================================
function showCustomConfirm(title, message, type = 'danger') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const cancelBtn = document.getElementById('confirm-modal-cancel');
    const confirmBtn = document.getElementById('confirm-modal-confirm');
    const iconContainer = document.getElementById('confirm-modal-icon-container');
    const iconSvg = document.getElementById('confirm-modal-icon');

    // Textos
    titleEl.textContent = title;
    messageEl.textContent = message;

    // Estilos do contêiner do ícone e do botão de confirmação baseados no tipo (danger vs info)
    if (type === 'danger') {
      iconContainer.className = 'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500';
      confirmBtn.className = 'flex-1 h-11 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all active:scale-95 shadow-lg shadow-red-600/20 cursor-pointer';
      // Ícone de triângulo de aviso
      iconSvg.innerHTML = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    } else {
      iconContainer.className = 'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 badge-accent-theme';
      confirmBtn.className = 'flex-1 h-11 btn-accent-theme text-white rounded-xl text-xs font-bold tracking-wider uppercase transition-all active:scale-95 shadow-lg cursor-pointer';
      // Ícone de informação (círculo com 'i')
      iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
    }

    const handleCancel = () => {
      modal.classList.add('hidden');
      cleanup();
      resolve(false);
    };

    const handleConfirm = () => {
      modal.classList.add('hidden');
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    modal.classList.remove('hidden');
  });
}
