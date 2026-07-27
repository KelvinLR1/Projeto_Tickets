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

// Validador de foto real do contato (evita URLs externas genéricas como ui-avatars.com)
function getValidAvatarUrl(avatar) {
  if (!avatar || typeof avatar !== 'string') return null;
  if (avatar.includes('ui-avatars.com') || avatar.includes('default-avatar')) return null;
  return avatar;
}

// Gerador centralizado do Avatar HTML respeitando o sistema de temas ativos e destaques
function renderContactAvatarHTML(chat) {
  const avatarUrl = getValidAvatarUrl(chat.cliente_avatar);
  const initials = (chat.cliente_nome || 'CL').substring(0, 2).toUpperCase();

  return `
    <div class="w-12 h-12 rounded-2xl avatar-inactive-theme flex items-center justify-center font-bold text-sm uppercase transition-all duration-300 shrink-0 overflow-hidden">
      ${avatarUrl 
        ? `<img src="${avatarUrl}" alt="${chat.cliente_nome || ''}" class="w-full h-full object-cover" onerror="this.outerHTML='${initials}'"/>`
        : initials
      }
    </div>
  `;
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
  const indicator = document.getElementById('tab-indicator');
  const container = document.getElementById('tabs-container');
  if (!indicator || !activeBtn || !container) return;

  const containerRect = container.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  
  const relativeLeft = btnRect.left - containerRect.left;
  const width = btnRect.width;
  
  if (width > 0) {
    indicator.style.left = `${relativeLeft}px`;
    indicator.style.width = `${width}px`;
    indicator.classList.remove('opacity-0', 'hidden');
  }
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
  
  if (width > 0) {
    indicator.style.left = `${relativeLeft}px`;
    indicator.style.width = `${width}px`;
    indicator.style.top = `${relativeTop}px`;
    indicator.style.height = `${height}px`;
    indicator.classList.remove('opacity-0');
  }
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

function getFilteredQueueCount(rows) {
  if (!rows || rows.length === 0) return 0;
  if (allowedSectors.length > 0) {
    return rows.filter(chat => {
      return chat.sector_id === null || chat.sector_id === undefined || selectedSectorsFilter.includes(chat.sector_id);
    }).length;
  }
  return rows.length;
}

// Recebe Lista de Fila
socket.on('queue_list', (rows) => {
  const previousFilteredCount = getFilteredQueueCount(queueChats);
  queueChats = rows;
  const currentFilteredCount = getFilteredQueueCount(rows);

  renderQueueList();
  checkReadOnlyBanner();
  refreshClientInfoDrawerIfOpen();

  // Se a fila filtrada estiver vazia, remove o efeito de piscar
  if (currentFilteredCount === 0 && tabQueueBtn) {
    tabQueueBtn.classList.remove('animate-flash-tab');
  } 
  // Piscar a aba de fila se novos clientes entrarem na fila e o atendente não estiver visualizando ela
  else if (currentFilteredCount > previousFilteredCount && currentSidebarTab !== 'queue' && tabQueueBtn) {
    tabQueueBtn.classList.add('animate-flash-tab');
  }
});

function checkReadOnlyBanner() {
  if (!selectedChatJid) return;

  const headerActions = document.getElementById('chat-header-actions');
  const inputWrapper = document.getElementById('chat-input-wrapper');
  const inputContainer = document.getElementById('chat-input-container');
  const readOnlyBanner = document.getElementById('chat-read-only-banner');
  const readOnlyText = document.getElementById('chat-read-only-text');
  const readOnlyTakeBtn = document.getElementById('btn-read-only-take');

  const isActive = activeChats.some(c => c.cliente_jid === selectedChatJid);
  const inQueue = queueChats.some(c => c.cliente_jid === selectedChatJid);
  const inBot = botChats.some(c => c.cliente_jid === selectedChatJid);

  if (isActive) {
    // Atendimento Ativo: exibe ações do cabeçalho e campo de resposta; oculta o banner de modo leitura
    if (headerActions) headerActions.classList.remove('hidden');
    if (inputWrapper) inputWrapper.classList.remove('hidden');
    if (inputContainer) inputContainer.classList.remove('hidden');
    if (readOnlyBanner) readOnlyBanner.classList.add('hidden');
  } else {
    // Atendimento Não Ativo (Fila, Bot, Histórico): oculta ações do cabeçalho e caixa de entrada; exibe modo leitura
    if (headerActions) headerActions.classList.add('hidden');
    if (inputWrapper) inputWrapper.classList.add('hidden');
    if (inputContainer) inputContainer.classList.add('hidden');
    if (readOnlyBanner) readOnlyBanner.classList.remove('hidden');

    const takeBtnText = document.getElementById('btn-read-only-take-text');
    if (inQueue) {
      if (readOnlyText) readOnlyText.textContent = "Modo de leitura (Fila de Espera). Para interagir com este cliente, assuma o atendimento.";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.remove('hidden');
      if (takeBtnText) takeBtnText.textContent = "Atender Cliente";
    } else if (inBot) {
      if (readOnlyText) readOnlyText.textContent = "Modo de leitura (Atendimento automatizado via Bot). Para interagir com este cliente, assuma o atendimento.";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.remove('hidden');
      if (takeBtnText) takeBtnText.textContent = "Assumir Atendimento";
    } else {
      // Histórico / Finalizado
      if (readOnlyText) readOnlyText.textContent = "Modo de leitura (Atendimento Finalizado).";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.remove('hidden');
      if (takeBtnText) takeBtnText.textContent = "Reabrir Atendimento";
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
    queueContainer.innerHTML = `
      <div class="text-center py-10 px-4 text-xs text-slate-500 font-medium space-y-3">
        <p>Nenhum cliente na fila de espera</p>
        <button onclick="fetch('/api/seed-mock-data?force=true').then(r=>r.json()).then(d=>{ if(typeof showToast==='function') showToast(d.message, 'Dados de Teste', 'success'); })" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer shadow-sm">
          + Inserir Exemplos de Teste
        </button>
      </div>`;
    return;
  }

  queueContainer.innerHTML = filtered.map(chat => `
    <div class="glass-card rounded-2xl p-4 flex flex-col gap-3 relative fade-in border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300">
      <div class="flex items-center gap-3">
        ${renderContactAvatarHTML(chat, false)}
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

  // Otimismo visual: move de queueChats para activeChats localmente
  const queueIndex = queueChats.findIndex(c => c.cliente_jid === clienteJid);
  if (queueIndex !== -1) {
    const chatItem = queueChats.splice(queueIndex, 1)[0];
    chatItem.status = 'atendimento';
    chatItem.atendente_id = currentOperator.id;
    activeChats.unshift(chatItem);
    renderQueueList();
    renderActiveChats();
  }

  socket.emit('take_chat', { cliente_jid: clienteJid, atendente_id: currentOperator.id });
  
  // Alterna automaticamente para a aba de Ativos e abre a conversa
  switchSidebarTab('active');
  const chatObj = activeChats.find(c => c.cliente_jid === clienteJid) || queueChats.find(c => c.cliente_jid === clienteJid);
  const clientName = chatObj ? chatObj.cliente_nome : 'Cliente';
  selectChat(clienteJid, clientName);

  // Atualiza imediatamente a gaveta de informações se estiver aberta para este cliente
  if (currentDrawerJid === clienteJid) {
    openClientInfoDrawer(clienteJid, clientName);
  }
}

let isInitialDataLoaded = false;

function dismissInitLoader() {
  if (isInitialDataLoaded) return;
  isInitialDataLoaded = true;

  requestAnimationFrame(() => {
    const mainEl = document.getElementById('whatsapp-app-main');
    if (mainEl) {
      mainEl.classList.remove('opacity-0');
    }
    const loader = document.getElementById('whatsapp-init-loader');
    if (loader) {
      loader.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => loader.remove(), 350);
    }
  });
}

// Recebe Lista de Conversas Ativas
socket.on('active_chats_list', (rows) => {
  activeChats = rows;
  updateBadge(activeCountBadge, rows.length);
  renderActiveChats();
  checkReadOnlyBanner();
  refreshClientInfoDrawerIfOpen();
  dismissInitLoader();
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
        ${renderContactAvatarHTML(chat, isSelected)}
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
      setTimeout(() => searchInput.focus(), 310);
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

let transferTargetJid = null;
let transferTargetName = '';
let transferSelectedSectorId = null;

let currentDrawerJid = null;
let currentDrawerName = '';

function refreshClientInfoDrawerIfOpen() {
  const drawer = document.getElementById('client-info-drawer');
  if (drawer && !drawer.classList.contains('w-0') && currentDrawerJid) {
    const chatObj = queueChats.find(c => c.cliente_jid === currentDrawerJid) || activeChats.find(c => c.cliente_jid === currentDrawerJid) || historyChats.find(c => c.cliente_jid === currentDrawerJid);
    const name = chatObj ? chatObj.cliente_nome : currentDrawerName;
    openClientInfoDrawer(currentDrawerJid, name);
  }
}

// Abre a bandeja lateral de informações do cliente (Fila / Ativos)
function openClientInfoDrawer(jid, name) {
  currentDrawerJid = jid;
  currentDrawerName = name;

  const drawer = document.getElementById('client-info-drawer');
  const avatarEl = document.getElementById('client-info-drawer-avatar');
  const nameEl = document.getElementById('client-info-drawer-name');
  const phoneEl = document.getElementById('client-info-drawer-phone');
  const statusEl = document.getElementById('client-info-drawer-status');
  const takeBtn = document.getElementById('btn-client-info-drawer-take');
  const activeActions = document.getElementById('client-info-drawer-active-actions');
  const returnBtn = document.getElementById('btn-client-info-drawer-return');
  const transferBtn = document.getElementById('btn-client-info-drawer-transfer');

  if (!drawer) return;

  nameEl.textContent = name;
  phoneEl.textContent = jid.split('@')[0];

  // Identificar se está na Fila ou Ativos
  const inQueue = queueChats.some(c => c.cliente_jid === jid);
  const chatObj = queueChats.find(c => c.cliente_jid === jid) || activeChats.find(c => c.cliente_jid === jid);
  const avatarUrl = getValidAvatarUrl(chatObj ? chatObj.cliente_avatar : null);

  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${name}" class="w-full h-full object-cover" onerror="this.outerHTML='${name.substring(0, 2).toUpperCase()}'"/>`;
    avatarEl.className = "w-28 h-28 rounded-2xl mx-auto border border-white/10 flex items-center justify-center shrink-0 overflow-hidden bg-slate-800 cursor-zoom-in hover:scale-105 active:scale-95 transition-all duration-200 shadow-md";
    avatarEl.onclick = () => openAvatarZoomModal(avatarUrl, name);
  } else {
    avatarEl.innerHTML = name.substring(0, 2).toUpperCase();
    avatarEl.className = "w-28 h-28 rounded-2xl mx-auto avatar-accent-theme flex items-center justify-center font-bold text-3xl uppercase text-white shadow-lg shrink-0 cursor-zoom-in hover:scale-105 active:scale-95 transition-all duration-200";
    avatarEl.onclick = () => openAvatarZoomModal(null, name);
  }

  if (inQueue) {
    statusEl.textContent = "Aguardando na Fila";
    statusEl.className = "font-bold text-amber-400";
    if (takeBtn) takeBtn.classList.remove('hidden');
    if (activeActions) activeActions.classList.add('hidden');

    if (takeBtn) {
      takeBtn.onclick = () => {
        takeChat(jid);
      };
    }
  } else {
    statusEl.textContent = "Em Atendimento";
    statusEl.className = "font-bold text-emerald-400";
    if (takeBtn) takeBtn.classList.add('hidden');
    if (activeActions) activeActions.classList.remove('hidden');

    if (returnBtn) {
      returnBtn.onclick = () => {
        returnChatToQueue(jid, name);
      };
    }

    if (transferBtn) {
      transferBtn.onclick = () => {
        openTransferModal(jid, name);
      };
    }
  }

  // Animar abertura da bandeja lateral (slide-in)
  drawer.classList.remove('hidden');
  requestAnimationFrame(() => {
    drawer.classList.remove('w-0', 'border-transparent');
    drawer.classList.add('w-[400px]', 'border-white/10');
  });
}

// Exibe notificação Toast flutuante com animação
function showToast(message, title = 'Notificação', type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  
  let bgClasses = 'bg-slate-900/90 border border-white/10 text-slate-200';
  let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-accent-theme"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

  if (type === 'amber' || type === 'warning' || type === 'return') {
    bgClasses = 'bg-slate-950/95 border border-amber-500/30 text-amber-300 shadow-amber-500/10';
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-amber-400 shrink-0"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
  } else if (type === 'blue' || type === 'transfer') {
    bgClasses = 'bg-slate-950/95 border border-blue-500/30 text-blue-300 shadow-blue-500/10';
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-blue-400 shrink-0"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;
  } else if (type === 'success') {
    bgClasses = 'bg-slate-950/95 border border-emerald-500/30 text-emerald-300 shadow-emerald-500/10';
    iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-400 shrink-0"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  toast.className = `toast-notification ${bgClasses}`;
  toast.innerHTML = `
    <div class="p-2 rounded-xl bg-white/5 shrink-0 flex items-center justify-center">${iconSvg}</div>
    <div class="flex-1 leading-tight text-left min-w-0">
      <h4 class="text-xs font-bold uppercase tracking-wider">${title}</h4>
      <p class="text-[11px] opacity-80 mt-0.5 truncate">${message}</p>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

// Oculta a área de chat ativa com animação suave e transição graciosa para o estado vazio
function closeActiveChatAreaWithAnimation(targetJid) {
  if (!activeChatArea) return;

  if (!targetJid || selectedChatJid === targetJid) {
    // 1. Aplica classe de saída suave
    activeChatArea.classList.add('chat-viewport-exit');

    // 2. Aguarda o encerramento fluido da transição
    setTimeout(() => {
      if (!targetJid || selectedChatJid === targetJid) {
        selectedChatJid = null;
        selectedChatName = '';

        activeChatArea.classList.add('hidden');
        activeChatArea.classList.remove('chat-viewport-exit');

        if (emptyChatState) {
          emptyChatState.classList.remove('hidden');
          emptyChatState.classList.add('empty-state-enter');
          setTimeout(() => {
            if (emptyChatState) emptyChatState.classList.remove('empty-state-enter');
          }, 450);
        }
      }
    }, 400);
  }
}

// Devolve o atendimento da lista de ativos de volta para a Fila de Espera
async function returnChatToQueue(jid, name) {
  const targetJid = jid || selectedChatJid;
  const targetName = name || selectedChatName || 'este cliente';
  if (!targetJid) return;

  const confirmed = await showCustomConfirm(
    'Devolver à Fila?',
    `Tem certeza que deseja devolver o atendimento de ${targetName} para a Fila de Espera?`,
    'warning'
  );

  if (confirmed) {
    // 1. Animar a saída do card na lista lateral de chats ativos
    const cardEl = document.querySelector(`[data-client-jid="${targetJid}"]`);
    if (cardEl) {
      cardEl.classList.add('card-return-exit');
    }

    // 2. Animar a saída da área de chat principal
    closeActiveChatAreaWithAnimation(targetJid);

    // 3. Emitir evento Socket para o servidor
    socket.emit('return_to_queue', { cliente_jid: targetJid, atendente_id: currentOperator.id });

    // 4. Exibir Toast de Notificação
    showToast(`O atendimento de ${targetName} foi devolvido para a Fila de Espera.`, 'Devolvido à Fila', 'return');

    closeClientInfoDrawer();
  }
}

// Abre Modal de Transferência de Atendimento
function openTransferModal(jid, name) {
  transferTargetJid = jid || selectedChatJid;
  transferTargetName = name || selectedChatName || 'este cliente';
  transferSelectedSectorId = null;

  if (!transferTargetJid) return;

  const modal = document.getElementById('transfer-modal');
  const clientNameEl = document.getElementById('transfer-modal-client-name');
  const sectorsContainer = document.getElementById('transfer-sectors-list');

  if (!modal || !sectorsContainer) return;

  if (clientNameEl) clientNameEl.textContent = `Cliente: ${transferTargetName}`;

  // Monta lista de setores disponíveis
  let html = `
    <div onclick="selectTransferSector(null)" id="transfer-sector-card-null" class="transfer-sector-option p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-white flex items-center justify-between cursor-pointer transition-all hover:bg-blue-500/20">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">F</div>
        <div>
          <p class="text-xs font-bold text-slate-200">Fila Geral</p>
          <p class="text-[9px] text-slate-400">Encaminha para a fila sem setor específico</p>
        </div>
      </div>
      <div class="w-4 h-4 rounded-full border-2 border-blue-400 bg-blue-400 flex items-center justify-center text-black text-[9px] font-bold">✓</div>
    </div>
  `;

  if (allowedSectors && allowedSectors.length > 0) {
    allowedSectors.forEach(sec => {
      html += `
        <div onclick="selectTransferSector(${sec.id})" id="transfer-sector-card-${sec.id}" class="transfer-sector-option p-3 rounded-xl border border-white/5 bg-white/[0.02] text-slate-300 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.05]">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 font-bold text-xs">S</div>
            <div>
              <p class="text-xs font-bold text-slate-200">${sec.name}</p>
              <p class="text-[9px] text-slate-500">Setor ID: ${sec.id}</p>
            </div>
          </div>
          <div class="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[9px] font-bold"></div>
        </div>
      `;
    });
  }

  sectorsContainer.innerHTML = html;
  modal.classList.remove('hidden');
}

// Seleciona um setor no modal de transferência
function selectTransferSector(sectorId) {
  transferSelectedSectorId = sectorId;

  document.querySelectorAll('.transfer-sector-option').forEach(el => {
    el.className = "transfer-sector-option p-3 rounded-xl border border-white/5 bg-white/[0.02] text-slate-300 flex items-center justify-between cursor-pointer transition-all hover:bg-white/[0.05]";
    const checkEl = el.querySelector('div:last-child');
    if (checkEl) {
      checkEl.className = "w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[9px] font-bold";
      checkEl.innerHTML = "";
    }
  });

  const targetId = sectorId === null ? 'null' : sectorId;
  const selectedEl = document.getElementById(`transfer-sector-card-${targetId}`);
  if (selectedEl) {
    selectedEl.className = "transfer-sector-option p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 text-white flex items-center justify-between cursor-pointer transition-all hover:bg-blue-500/20";
    const checkEl = selectedEl.querySelector('div:last-child');
    if (checkEl) {
      checkEl.className = "w-4 h-4 rounded-full border-2 border-blue-400 bg-blue-400 flex items-center justify-center text-black text-[9px] font-bold";
      checkEl.innerHTML = "✓";
    }
  }
}

// Confirma a transferência de atendimento
function confirmTransferChat() {
  if (!transferTargetJid) return;

  const targetJid = transferTargetJid;
  const targetName = transferTargetName || 'Cliente';

  // Identificar nome do setor de destino
  let sectorName = 'Fila Geral';
  if (transferSelectedSectorId !== null && allowedSectors) {
    const sec = allowedSectors.find(s => s.id === transferSelectedSectorId);
    if (sec) sectorName = sec.name;
  }

  // 1. Animar a saída do card na lista de ativos
  const cardEl = document.querySelector(`[data-client-jid="${targetJid}"]`);
  if (cardEl) {
    cardEl.classList.add('card-transfer-exit');
  }

  // 2. Animar a saída da área de chat principal
  closeActiveChatAreaWithAnimation(targetJid);

  // 3. Emitir evento Socket para o servidor
  socket.emit('transfer_chat', {
    cliente_jid: targetJid,
    atendente_id: currentOperator.id,
    sector_id: transferSelectedSectorId
  });

  // 4. Exibir Toast de Notificação
  showToast(`Atendimento de ${targetName} transferido para ${sectorName}.`, 'Transferência Concluída', 'transfer');

  closeTransferModal();
  closeClientInfoDrawer();
}

// Fecha Modal de Transferência
function closeTransferModal() {
  const modal = document.getElementById('transfer-modal');
  if (modal) modal.classList.add('hidden');
}

// Fecha a bandeja lateral de informações do cliente
function closeClientInfoDrawer() {
  currentDrawerJid = null;
  currentDrawerName = '';
  const drawer = document.getElementById('client-info-drawer');
  if (drawer) {
    drawer.classList.remove('w-[400px]', 'border-white/10');
    drawer.classList.add('w-0', 'border-transparent');
    setTimeout(() => {
      if (drawer.classList.contains('w-0')) {
        drawer.classList.add('hidden');
      }
    }, 300);
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
        ${renderContactAvatarHTML(chat, isSelected)}
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

  // Preserva nós do DOM se a lista de chats for idêntica (permite transição CSS fluida ao selecionar)
  const existingCards = Array.from(activeListContainer.querySelectorAll('.glass-card'));
  const existingJids = existingCards.map(c => c.getAttribute('data-client-jid'));
  const newJids = filtered.map(c => c.cliente_jid);

  const jidsMatch = existingJids.length === newJids.length && existingJids.every((jid, i) => jid === newJids[i]);

  if (jidsMatch) {
    existingCards.forEach((cardEl, index) => {
      const chat = filtered[index];
      const isSelected = selectedChatJid === chat.cliente_jid;
      if (isSelected) {
        cardEl.classList.add('active');
      } else {
        cardEl.classList.remove('active');
      }
    });
    return;
  }

  activeListContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    const isUnread = chat.unread === 1;
    const isGroup = chat.cliente_jid && chat.cliente_jid.endsWith('@g.us');
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer border ${isSelected ? 'active' : ''}">
        ${renderContactAvatarHTML(chat)}
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

// Atualiza o destaque ativo dos cards na sidebar sem destruir/recriar o DOM
function updateActiveCardSelection(selectedJid) {
  document.querySelectorAll('#active-chats-list .glass-card, #queue-list-container .glass-card, #history-list-container .glass-card').forEach(card => {
    const cardJid = card.getAttribute('data-client-jid');
    if (cardJid === selectedJid) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

// Seleciona um chat ativo
function selectChat(jid, name) {
  const isChanging = selectedChatJid !== jid;
  selectedChatJid = jid;
  selectedChatName = name;

  // 1. Limpar rascunho de texto e estado de áudio da conversa anterior ao trocar
  if (isChanging) {
    if (chatInput) chatInput.value = '';
    resetAudioState();
    cancelReply();
  }

  // 2. Atualizar visual dos cards na sidebar de forma fluida (sem recriar DOM)
  updateActiveCardSelection(jid);

  // 3. Animar transição de saída da área de chat se já houver uma conversa aberta
  if (isChanging && activeChatArea && !activeChatArea.classList.contains('hidden')) {
    activeChatArea.classList.remove('chat-switch-in');
    activeChatArea.classList.add('chat-switch-out');
  }

  setTimeout(() => {
    emptyChatState.classList.add('hidden');
    activeChatArea.classList.remove('hidden');
    
    chatClientName.textContent = name;
    chatClientJid.textContent = jid.split('@')[0];

    // Carrega e exibe avatar no cabeçalho
    const chatObj = activeChats.find(c => c.cliente_jid === jid) || queueChats.find(c => c.cliente_jid === jid);
    const avatarUrl = getValidAvatarUrl(chatObj ? chatObj.cliente_avatar : null);
    
    if (avatarUrl) {
      chatClientAvatar.innerHTML = `<img src="${avatarUrl}" alt="${name}" class="w-full h-full object-cover" onerror="this.innerHTML='${name.substring(0, 2).toUpperCase()}'"/>`;
      chatClientAvatar.className = "w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center shrink-0 overflow-hidden";
    } else {
      chatClientAvatar.innerHTML = name.substring(0, 2).toUpperCase();
      chatClientAvatar.className = "w-12 h-12 rounded-2xl avatar-accent-theme flex items-center justify-center font-bold text-sm uppercase text-white shadow-lg shrink-0";
    }

    // Solicita histórico de mensagens
    socket.emit('select_chat', { cliente_jid: jid, atendente_id: currentOperator.id });

    // Verifica se o chat está na fila de espera (modo de leitura)
    checkReadOnlyBanner();
  }, isChanging ? 120 : 0);
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

  // Executa animação de entrada graciosa e fluida do novo chat selecionado
  if (activeChatArea) {
    activeChatArea.classList.remove('chat-switch-out');
    void activeChatArea.offsetWidth; // Force reflow para reinício do keyframe
    activeChatArea.classList.add('chat-switch-in');
  }
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
    // Renderizador de Nota Interna (Privada para a equipe)
    const isInternalMsg = msg.is_internal || (msg.texto && msg.texto.startsWith('🔒 [NOTA INTERNA]'));
    if (isInternalMsg) {
      const cleanText = msg.texto ? msg.texto.replace('🔒 [NOTA INTERNA] ', '') : '';
      msgDiv.className = 'flex flex-col w-full items-center my-1.5';
      msgDiv.innerHTML = `
        <div class="w-full max-w-lg rounded-2xl p-3 bg-amber-950/40 border border-amber-500/40 text-amber-100 shadow-xl backdrop-blur-md flex flex-col gap-1 relative group">
          <div class="flex items-center justify-between border-b border-amber-500/20 pb-1.5 mb-1">
            <div class="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Nota Interna da Equipe</span>
            </div>
            <span class="text-[10px] text-amber-400/80 font-mono">${formattedTime}</span>
          </div>
          <p class="whitespace-pre-wrap leading-relaxed text-xs text-amber-100/90 font-medium">${cleanText}</p>
        </div>
      `;
      messagesContainer.appendChild(msgDiv);
      return;
    }

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

    // Renderizador de conteúdo (anexo, áudio de voz vs texto)
    let contentHTML = `<p class="whitespace-pre-wrap leading-relaxed">${textToShow}</p>`;
    
    if (textToShow && textToShow.startsWith('[ANEXO] ')) {
      // Parser para [ANEXO] url \n legenda
      const parts = textToShow.substring(8).split('\n');
      const url = parts[0].trim();
      const caption = parts.slice(1).join('\n').trim();
      
      const ext = url.split('.').pop().toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
      
      let mediaHtml = '';
      if (isImage) {
        mediaHtml = `<img src="${url}" class="max-w-[240px] md:max-w-xs max-h-64 rounded-lg object-contain cursor-pointer shadow-md mb-1 hover:brightness-110 transition-all" onclick="window.open('${url}', '_blank')" />`;
      } else if (isVideo) {
        mediaHtml = `<video src="${url}" controls class="max-w-[240px] md:max-w-xs max-h-64 rounded-lg shadow-md mb-1"></video>`;
      } else {
        const filename = url.split('/').pop();
        mediaHtml = `
          <a href="${url}" target="_blank" download class="flex items-center gap-2 p-2.5 rounded-lg bg-black/20 hover:bg-black/30 border border-white/10 transition-all text-slate-200 mb-1 no-underline max-w-[240px] md:max-w-xs cursor-pointer group/file">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 group-hover/file:scale-105 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="flex flex-col overflow-hidden w-full">
              <span class="text-xs font-bold truncate group-hover/file:text-white transition-colors">${filename}</span>
              <span class="text-[9px] opacity-70 uppercase tracking-wide">Documento</span>
            </div>
          </a>
        `;
      }
      
      contentHTML = `
        <div class="flex flex-col">
          ${mediaHtml}
          ${caption ? `<p class="whitespace-pre-wrap leading-relaxed text-[13px] mt-1.5">${caption}</p>` : ''}
        </div>
      `;
    } else if (msg.texto && (msg.texto.startsWith('data:audio/') || (msg.texto.startsWith('http') && (msg.texto.endsWith('.mp3') || msg.texto.endsWith('.ogg') || msg.texto.endsWith('.m4a') || msg.texto.endsWith('.webm'))))) {
      contentHTML = `
        <div class="flex flex-col gap-1.5 my-1 min-w-[220px]">
          <div class="flex items-center gap-1.5 opacity-80">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-accent-theme shrink-0"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            <span class="text-[9px] font-black uppercase tracking-wider text-slate-300">Mensagem de Voz</span>
          </div>
          <audio controls src="${msg.texto}" class="w-full h-8 rounded-xl outline-none"></audio>
        </div>
      `;
    }

    msgDiv.innerHTML = `
      <div class="${bubbleClass}">
        ${quoteHTML}
        ${contentHTML}
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

function cancelReply() {
  replyingToMessage = null;
  // Se futuramente houver um banner de UI de resposta, ele será escondido aqui.
}

// Ajusta dinamicamente a altura do textarea para expandir e contrair suavemente a cada linha
function adjustChatInputHeight() {
  if (!chatInput) return;

  const container = document.getElementById('chat-input-container');

  // 1. Reseta a altura para 'auto' para permitir que o navegador meça o scrollHeight real de todas as linhas
  chatInput.style.height = 'auto';

  // 2. Obtém a altura real do conteúdo
  const realScrollHeight = chatInput.scrollHeight;
  const targetHeight = Math.min(Math.max(realScrollHeight, 20), 160);

  // 3. Aplica a nova altura ao textarea
  chatInput.style.height = `${targetHeight}px`;
  chatInput.style.overflowY = realScrollHeight > 160 ? 'auto' : 'hidden';

  // 4. Expande o contêiner flutuante para cima acompanhando o número de linhas
  if (container) {
    container.style.minHeight = `${targetHeight + 24}px`;
  }
}

// ------------------------------------------------------------------------------
// 🛠️ OPÇÕES DE CHAT (RESPOSTA RÁPIDA & MENSAGEM INTERNA)
// ------------------------------------------------------------------------------
let isInternalNoteMode = false;

function toggleChatOptionsDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('chat-options-dropdown');
  const btn = document.getElementById('btn-chat-options');
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden', 'animate-popover-out');
    void dropdown.offsetWidth; // Force reflow for keyframe restart
    dropdown.classList.add('animate-popover-in');
    if (btn) btn.classList.add('btn-options-active');
  } else {
    closeChatOptionsDropdown();
  }
}

function closeChatOptionsDropdown() {
  const dropdown = document.getElementById('chat-options-dropdown');
  const btn = document.getElementById('btn-chat-options');
  if (!dropdown || dropdown.classList.contains('hidden')) return;

  dropdown.classList.remove('animate-popover-in');
  dropdown.classList.add('animate-popover-out');
  if (btn) btn.classList.remove('btn-options-active');

  setTimeout(() => {
    dropdown.classList.add('hidden');
    dropdown.classList.remove('animate-popover-out');
  }, 190);
}

// Fechar menu de opções ao clicar fora
window.addEventListener('click', (e) => {
  const dropdown = document.getElementById('chat-options-dropdown');
  const btn = document.getElementById('btn-chat-options');
  if (dropdown && !dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && (!btn || !btn.contains(e.target))) {
    closeChatOptionsDropdown();
  }
});

function selectChatOption(type) {
  closeChatOptionsDropdown();

  if (type === 'quick_reply') {
    openQuickRepliesModal();
  } else if (type === 'internal_note') {
    toggleInternalNoteMode();
  }
}

function openQuickRepliesModal() {
  const modal = document.getElementById('modal-quick-replies');
  if (!modal) return;
  modal.classList.remove('hidden');
  void modal.offsetWidth;
  modal.classList.remove('opacity-0');
  const content = modal.querySelector('div');
  if (content) content.classList.remove('scale-95');
}

function closeQuickRepliesModal() {
  const modal = document.getElementById('modal-quick-replies');
  if (!modal) return;
  modal.classList.add('opacity-0');
  const content = modal.querySelector('div');
  if (content) content.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300);
}

function insertQuickReply(text) {
  closeQuickRepliesModal();
  if (!chatInput) return;

  chatInput.value = text;
  adjustChatInputHeight();
  chatInput.focus();
}

function toggleInternalNoteMode() {
  isInternalNoteMode = !isInternalNoteMode;
  const container = document.getElementById('chat-input-container');
  const footer = document.getElementById('chat-input-footer');
  const badge = document.getElementById('internal-note-badge');
  const btnOptions = document.getElementById('btn-chat-options');

  // Remove ou cria o banner de aviso visual
  const existingBanner = document.getElementById('internal-mode-banner');

  if (isInternalNoteMode) {
    // Footer: fundo âmbar forte + borda dourada
    if (footer) {
      footer.style.cssText += '; background: linear-gradient(to top, rgba(120,53,15,0.6) 0%, rgba(92,40,5,0.3) 100%) !important; border-top: 2px solid rgba(245,158,11,0.8) !important;';
    }

    // Container do input: glow âmbar
    if (container) {
      container.style.cssText += '; border: 1.5px solid rgba(245,158,11,0.8) !important; background-color: rgba(120,53,15,0.4) !important; box-shadow: 0 0 32px rgba(245,158,11,0.35), inset 0 0 0 1px rgba(245,158,11,0.3) !important;';
    }

    // Banner de aviso: flutua acima do input com z-index ABAIXO do dropdown de opções
    if (!existingBanner && container) {
      const banner = document.createElement('div');
      banner.id = 'internal-mode-banner';
      // z-index: 15 — fica acima do footer mas ABAIXO do dropdown de opções (z-50 = 50)
      banner.style.cssText = 'position:absolute; bottom:calc(100% + 4px); left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:6px; background:rgba(120,53,15,0.92); backdrop-filter:blur(10px); border:1px solid rgba(245,158,11,0.6); border-radius:8px; padding:4px 14px; font-size:9px; font-weight:900; color:#fbbf24; letter-spacing:0.08em; text-transform:uppercase; z-index:15; pointer-events:none; white-space:nowrap; box-shadow:0 -2px 16px rgba(245,158,11,0.25);';
      banner.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Nota Interna — não será enviada ao cliente';
      container.appendChild(banner);
    }

    if (badge) badge.classList.remove('hidden');
    if (chatInput) {
      chatInput.placeholder = '🔒 Nota interna — visível apenas para atendentes...';
      chatInput.style.color = '#fcd34d';
    }
  } else {
    // Reverte tudo
    if (footer) {
      footer.style.background = '';
      footer.style.backgroundImage = '';
      footer.style.borderTop = '';
      footer.style.cssText = footer.style.cssText.replace(/background[^;]*;?/g, '').replace(/border-top[^;]*;?/g, '');
    }
    if (container) {
      container.style.border = '';
      container.style.boxShadow = '';
      container.style.cssText = container.style.cssText.replace(/border[^;]*;?/g, '').replace(/box-shadow[^;]*;?/g, '').replace(/background-color[^;]*;?/g, '');
    }
    if (existingBanner) existingBanner.remove();
    if (badge) badge.classList.add('hidden');
    if (chatInput) {
      chatInput.placeholder = 'Digite sua resposta...';
      chatInput.style.color = '';
    }
  }

  // Recalcula a altura imediatamente para refletir no novo modo
  adjustChatInputHeight();
}

// Variável global para armazenar anexos
let selectedAttachments = [];

// Envia mensagem pelo input do chat
async function sendMessage(e) {
  if (e) e.preventDefault();
  let text = chatInput ? chatInput.value.trim() : '';
  if ((!text && selectedAttachments.length === 0) || !selectedChatJid) return;

  const isInternal = isInternalNoteMode;

  if (replyingToMessage) {
    // Formatar como resposta usando markdown compatível
    text = `*Respondendo a:* _"${replyingToMessage.text}"_\n\n${text}`;
    cancelReply();
  }

  if (isInternal) {
    text = `🔒 [NOTA INTERNA] ${text}`;
  }

  let uploadedAttachments = [];
  
  if (selectedAttachments.length > 0) {
    const formData = new FormData();
    selectedAttachments.forEach(file => {
      formData.append('attachments', file);
    });

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.status === 'success') {
        uploadedAttachments = data.files;
      }
    } catch (err) {
      console.error('Erro ao fazer upload dos anexos:', err);
      showToast('Erro ao enviar anexos. Tente novamente.', 'Upload Falhou', 'error');
      return;
    }
  }

  socket.emit('send_message', {
    cliente_jid: selectedChatJid,
    texto: text,
    atendente_id: currentOperator.id,
    is_internal: isInternal,
    attachments: uploadedAttachments
  });

  if (chatInput) chatInput.value = '';
  
  selectedAttachments = [];
  renderAttachmentPreview();

  if (isInternalNoteMode) {
    toggleInternalNoteMode();
  } else {
    adjustChatInputHeight();
  }
}

// Alterna entre os 3 Modos da Barra de Envio (Texto, Gravando, Pré-visualizar) com transições graciosas
function setInputBarMode(mode) {
  const textModeEl = document.getElementById('chat-input-form');
  const recordingModeEl = document.getElementById('input-mode-recording');
  const previewModeEl = document.getElementById('input-mode-preview');

  const textBtns = document.getElementById('buttons-mode-text');
  const recordingBtns = document.getElementById('buttons-mode-recording');
  const previewBtns = document.getElementById('buttons-mode-preview');

  const container = document.getElementById('chat-input-container');

  // Resetar áreas de conteúdo da esquerda
  [textModeEl, recordingModeEl, previewModeEl].forEach(el => {
    if (el) {
      el.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
      el.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
  });

  // Ocultar grupos de botões da direita
  [textBtns, recordingBtns, previewBtns].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  if (mode === 'recording') {
    if (recordingModeEl) {
      recordingModeEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      recordingModeEl.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
    if (recordingBtns) recordingBtns.classList.remove('hidden');
    if (container) container.classList.add('border-red-500/40', 'bg-red-500/[0.04]');
    if (chatInput) chatInput.style.height = '20px';
  } else if (mode === 'preview') {
    if (previewModeEl) {
      previewModeEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      previewModeEl.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
    if (previewBtns) previewBtns.classList.remove('hidden');
    if (container) container.classList.remove('border-red-500/40', 'bg-red-500/[0.04]');
    if (chatInput) chatInput.style.height = '20px';
  } else {
    // Modo Texto por padrão
    if (textModeEl) {
      textModeEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      textModeEl.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
    if (textBtns) textBtns.classList.remove('hidden');
    if (container) container.classList.remove('border-red-500/40', 'bg-red-500/[0.04]');
    adjustChatInputHeight();
  }
}

// Helper para disparar envio de texto pelo botão do modo texto
function sendMessageFromInput() {
  const formEl = document.getElementById('chat-input-form');
  if (formEl) {
    const event = new Event('submit', { cancelable: true });
    formEl.dispatchEvent(event);
  }
}

// ==============================================================================
// 🎙️ RECURSO DE GRAVAÇÃO E PRE-VISUALIZAÇÃO DE ÁUDIO DE VOZ
// ==============================================================================
let mediaRecorder = null;
let audioChunks = [];
let recordingTimerInterval = null;
let recordingSeconds = 0;
let recordedAudioBlob = null;
let recordedAudioBase64 = null;
let isRecordingPaused = false;

let audioContext = null;
let audioAnalyser = null;
let audioSource = null;
let visualizerAnimationFrame = null;

let drawVisualizerLoop = null;

// Inicializa Visualizador de Espectro Real de Voz (Web Audio API)
function initAudioVisualizer(stream) {
  const visualizerContainer = document.getElementById('audio-waveform-visualizer');
  if (!visualizerContainer) return;

  // Criar 32 barras de espectro reativas ao longo da barra
  const barCount = 32;
  visualizerContainer.innerHTML = Array.from({ length: barCount }, () => `
    <div class="waveform-bar w-1 rounded-full bg-red-500/80 transition-all duration-75 shadow-[0_0_8px_rgba(239,68,68,0.4)]" style="height: 4px; min-height: 4px;"></div>
  `).join('');

  const bars = visualizerContainer.querySelectorAll('.waveform-bar');

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }

    audioContext = new AudioContextClass();
    audioSource = audioContext.createMediaStreamSource(stream);
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 64; // 32 bins de frequência

    audioSource.connect(audioAnalyser);

    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    drawVisualizerLoop = function() {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

      audioAnalyser.getByteFrequencyData(dataArray);

      bars.forEach((bar, index) => {
        const val = dataArray[index] || 0;
        const minHeight = 4;
        const maxHeight = 24;
        const height = Math.max(minHeight, Math.min(maxHeight, (val / 255) * maxHeight));
        const opacity = val > 20 ? 0.85 + (val / 255) * 0.15 : 0.45;
        
        bar.style.height = `${height}px`;
        bar.style.opacity = opacity;
      });

      visualizerAnimationFrame = requestAnimationFrame(drawVisualizerLoop);
    };

    drawVisualizerLoop();
  } catch (err) {
    console.warn('Visualizador de áudio não inicializado:', err);
  }
}

// Interrompe e limpa o visualizador de áudio
function stopAudioVisualizer() {
  if (visualizerAnimationFrame) {
    cancelAnimationFrame(visualizerAnimationFrame);
    visualizerAnimationFrame = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  audioAnalyser = null;
  audioSource = null;
  drawVisualizerLoop = null;

  const visualizerContainer = document.getElementById('audio-waveform-visualizer');
  if (visualizerContainer) {
    visualizerContainer.innerHTML = '';
  }
}

// Emite sinal sonoro suave (chime) indicando início exato de captação de voz
function playRecordingStartSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    // Ignorar se o áudio estiver desativado pelo navegador
  }
}

// Alterna entre Pausar e Retomar a gravação de áudio em andamento
function togglePauseAudioRecording() {
  if (!mediaRecorder) return;

  const pauseIcon = document.getElementById('icon-recording-pause');
  const resumeIcon = document.getElementById('icon-recording-resume');
  const statusLabel = document.getElementById('recording-status-label');
  const pulseDot = document.getElementById('recording-pulse-dot');

  if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    isRecordingPaused = true;

    if (pauseIcon) pauseIcon.classList.add('hidden');
    if (resumeIcon) resumeIcon.classList.remove('hidden');

    if (statusLabel) {
      statusLabel.textContent = 'Pausado';
      statusLabel.className = 'text-xs font-bold text-amber-400 tracking-wider';
    }
    if (pulseDot) {
      pulseDot.className = 'w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]';
    }

    // Parar animação e assentar as barras durante a pausa
    if (visualizerAnimationFrame) {
      cancelAnimationFrame(visualizerAnimationFrame);
      visualizerAnimationFrame = null;
    }
    const visualizerContainer = document.getElementById('audio-waveform-visualizer');
    if (visualizerContainer) {
      const bars = visualizerContainer.querySelectorAll('.waveform-bar');
      bars.forEach(bar => {
        bar.style.height = '4px';
        bar.style.opacity = '0.3';
      });
    }

  } else if (mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    isRecordingPaused = false;

    if (resumeIcon) resumeIcon.classList.add('hidden');
    if (pauseIcon) pauseIcon.classList.remove('hidden');

    if (statusLabel) {
      statusLabel.textContent = 'Gravando...';
      statusLabel.className = 'text-xs font-bold text-red-400 tracking-wider';
    }
    if (pulseDot) {
      pulseDot.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    }

    // Reinicia o loop do visualizador gráfico de barras de voz ao retomar!
    if (drawVisualizerLoop) {
      if (visualizerAnimationFrame) cancelAnimationFrame(visualizerAnimationFrame);
      drawVisualizerLoop();
    }
  }
}

async function startAudioRecording() {
  if (!selectedChatJid) {
    showToast('Selecione uma conversa ativa para gravar áudio.', 'Aviso', 'warning');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Seu navegador não suporta gravação de áudio ou a permissão de microfone foi negada.');
    return;
  }

  isRecordingPaused = false;
  const pauseIcon = document.getElementById('icon-recording-pause');
  const resumeIcon = document.getElementById('icon-recording-resume');
  if (pauseIcon) pauseIcon.classList.remove('hidden');
  if (resumeIcon) resumeIcon.classList.add('hidden');

  // ⚡ REATIVIDADE INSTANTÂNEA DA INTERFACE (0ms DELAY)
  setInputBarMode('recording');
  const timerEl = document.getElementById('recording-timer');
  const statusLabel = document.getElementById('recording-status-label');
  const pulseDot = document.getElementById('recording-pulse-dot');
  
  if (timerEl) timerEl.textContent = '00:00';
  if (statusLabel) {
    statusLabel.textContent = 'Conectando...';
    statusLabel.className = 'text-xs font-bold text-amber-400 tracking-wider';
  }
  if (pulseDot) {
    pulseDot.className = 'w-3 h-3 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.6)]';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    recordingSeconds = 0;
    recordedAudioBlob = null;
    recordedAudioBase64 = null;

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.start();

    // 🔔 Toca sinal sonoro sutil e altera estado para "Gravando..." exatamente no início real da gravação
    playRecordingStartSound();
    if (statusLabel) {
      statusLabel.textContent = 'Gravando...';
      statusLabel.className = 'text-xs font-bold text-red-400 tracking-wider';
    }
    if (pulseDot) {
      pulseDot.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    }

    // Inicializa o visualizador gráfico de voz real por Web Audio API
    initAudioVisualizer(stream);

    clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
      if (!isRecordingPaused) {
        recordingSeconds++;
        const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const secs = String(recordingSeconds % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      }
    }, 1000);

  } catch (err) {
    console.error('Erro ao acessar o microfone:', err);
    // Em caso de falha de permissão ou hardware, reverte graciosamente para o modo texto
    setInputBarMode('text');
    alert('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.');
  }
}

// ==============================================================================
// 🎧 PLAYER DE ÁUDIO CUSTOMIZADO DE PRÉ-VISUALIZAÇÃO (TEMA DARK GLASSMORPHISM)
// ==============================================================================

let previewAnimationFrame = null;
let isDraggingPreview = false;

function updateAudioScrubPosition(clientX) {
  const player = document.getElementById('audio-preview-player');
  const container = document.getElementById('preview-progress-container');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');
  const timerEl = document.getElementById('preview-audio-timer');

  if (!player || !player.duration || !container) return;

  const rect = container.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const width = rect.width;
  const targetTime = Math.max(0, Math.min(player.duration, (clickX / width) * player.duration));

  player.currentTime = targetTime;
  const progressPercent = (targetTime / player.duration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (progressPin) progressPin.style.left = `${progressPercent}%`;

  const curMins = String(Math.floor(targetTime / 60)).padStart(2, '0');
  const curSecs = String(Math.floor(targetTime % 60)).padStart(2, '0');
  const durMins = String(Math.floor(player.duration / 60)).padStart(2, '0');
  const durSecs = String(Math.floor(player.duration % 60)).padStart(2, '0');

  if (timerEl) {
    timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;
  }
}

function renderAudioPreviewFrame() {
  const player = document.getElementById('audio-preview-player');
  const timerEl = document.getElementById('preview-audio-timer');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');

  if (!player || !player.duration || player.paused) return;

  if (!isDraggingPreview) {
    const progressPercent = (player.currentTime / player.duration) * 100;
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressPin) progressPin.style.left = `${progressPercent}%`;

    const curMins = String(Math.floor(player.currentTime / 60)).padStart(2, '0');
    const curSecs = String(Math.floor(player.currentTime % 60)).padStart(2, '0');
    const durMins = String(Math.floor(player.duration / 60)).padStart(2, '0');
    const durSecs = String(Math.floor(player.duration % 60)).padStart(2, '0');

    if (timerEl) {
      timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;
    }
  }

  previewAnimationFrame = requestAnimationFrame(renderAudioPreviewFrame);
}

function setupAudioPreviewEvents() {
  const player = document.getElementById('audio-preview-player');
  const timerEl = document.getElementById('preview-audio-timer');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');
  const iconPlay = document.getElementById('icon-preview-play');
  const iconPause = document.getElementById('icon-preview-pause');
  const btnToggle = document.getElementById('btn-preview-play-toggle');
  const container = document.getElementById('preview-progress-container');

  if (!player) return;

  player.addEventListener('loadedmetadata', () => {
    updateAudioPreviewTimer();
  });

  player.addEventListener('play', () => {
    if (iconPlay) iconPlay.classList.add('hidden');
    if (iconPause) iconPause.classList.remove('hidden');
    if (btnToggle) btnToggle.classList.add('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (previewAnimationFrame) cancelAnimationFrame(previewAnimationFrame);
    renderAudioPreviewFrame();
  });

  player.addEventListener('pause', () => {
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (previewAnimationFrame) {
      cancelAnimationFrame(previewAnimationFrame);
      previewAnimationFrame = null;
    }
  });

  player.addEventListener('ended', () => {
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (previewAnimationFrame) {
      cancelAnimationFrame(previewAnimationFrame);
      previewAnimationFrame = null;
    }
    if (progressBar) progressBar.style.width = '0%';
    if (progressPin) progressPin.style.left = '0%';
    player.currentTime = 0;
    updateAudioPreviewTimer();
  });

  // 🖱️ / 📱 SUPORTE A ARRASTAR O PINO DA TRILHA DE ÁUDIO (MOUSE + TOUCH DRAG & SCRUB)
  if (container) {
    const handleStart = (e) => {
      isDraggingPreview = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateAudioScrubPosition(clientX);
    };

    const handleMove = (e) => {
      if (!isDraggingPreview) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateAudioScrubPosition(clientX);
    };

    const handleEnd = () => {
      isDraggingPreview = false;
    };

    container.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    container.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
  }
}

function updateAudioPreviewTimer() {
  const player = document.getElementById('audio-preview-player');
  const timerEl = document.getElementById('preview-audio-timer');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');
  if (!player || !timerEl) return;

  const duration = player.duration || 0;
  const durMins = String(Math.floor(duration / 60)).padStart(2, '0');
  const durSecs = String(Math.floor(duration % 60)).padStart(2, '0');
  timerEl.textContent = `00:00 / ${durMins}:${durSecs}`;
  if (progressBar) progressBar.style.width = '0%';
  if (progressPin) progressPin.style.left = '0%';
}

function toggleAudioPreviewPlay() {
  const player = document.getElementById('audio-preview-player');
  if (!player || !player.src) return;

  if (player.paused) {
    player.play().catch(err => console.error('Erro ao tocar áudio:', err));
  } else {
    player.pause();
  }
}

function seekAudioPreview(e) {
  const player = document.getElementById('audio-preview-player');
  const container = document.getElementById('preview-progress-container');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');
  if (!player || !player.duration || !container) return;

  const rect = container.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const targetTime = Math.max(0, Math.min(player.duration, (clickX / width) * player.duration));

  player.currentTime = targetTime;
  const progressPercent = (targetTime / player.duration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (progressPin) progressPin.style.left = `${progressPercent}%`;
}

// Parar gravação e liberar o áudio para escutar (Pré-visualização)
function finishAudioRecordingAndPreview() {
  clearInterval(recordingTimerInterval);
  stopAudioVisualizer();

  if (!mediaRecorder) return;

  const stream = mediaRecorder.stream;

  mediaRecorder.onstop = () => {
    // Parar faixas do microfone
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    recordedAudioBlob = new Blob(audioChunks, { type: mimeType });

    if (recordedAudioBlob.size === 0) {
      showToast('Áudio gravado está vazio.', 'Aviso', 'warning');
      cancelAudioRecording();
      return;
    }

    // Criar URL para o player escutar
    const audioUrl = URL.createObjectURL(recordedAudioBlob);
    const player = document.getElementById('audio-preview-player');
    if (player) {
      player.src = audioUrl;
      player.load();
      updateAudioPreviewTimer();
    }

    // Converter para Base64 para envio futuro
    const reader = new FileReader();
    reader.onloadend = () => {
      recordedAudioBase64 = reader.result;
    };
    reader.readAsDataURL(recordedAudioBlob);

    // Alternar suavemente para o Modo de Pré-visualização
    setInputBarMode('preview');
  };

  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// Confirmar e Enviar o Áudio após escutar na Pré-visualização
function sendRecordedAudio() {
  if (!selectedChatJid || (!recordedAudioBase64 && !recordedAudioBlob)) {
    showToast('Nenhum áudio disponível para envio.', 'Aviso', 'warning');
    cancelAudioRecording();
    return;
  }

  if (recordedAudioBase64) {
    socket.emit('send_message', {
      cliente_jid: selectedChatJid,
      texto: recordedAudioBase64,
      atendente_id: currentOperator.id
    });
    showToast('Mensagem de voz enviada com sucesso!', 'Áudio Enviado', 'success');
    resetAudioState();
  } else if (recordedAudioBlob) {
    const reader = new FileReader();
    reader.onloadend = () => {
      recordedAudioBase64 = reader.result;
      socket.emit('send_message', {
        cliente_jid: selectedChatJid,
        texto: recordedAudioBase64,
        atendente_id: currentOperator.id
      });
      showToast('Mensagem de voz enviada com sucesso!', 'Áudio Enviado', 'success');
      resetAudioState();
    };
    reader.readAsDataURL(recordedAudioBlob);
  }
}

// Exibe notificação flutuante contextual exatamente acima da barra de botões do rodapé
function showInputBarNotification(message) {
  const toast = document.getElementById('discarded-audio-toast');
  if (!toast) return;

  const textSpan = toast.querySelector('span');
  if (textSpan) textSpan.textContent = message;

  toast.classList.remove('hidden');
  void toast.offsetWidth; // Força reflow para disparar transição CSS
  toast.classList.remove('opacity-0', 'translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 1800);
}

// Cancelar / Descartar Gravação de Áudio
function cancelAudioRecording() {
  clearInterval(recordingTimerInterval);
  stopAudioVisualizer();

  if (mediaRecorder) {
    const stream = mediaRecorder.stream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  resetAudioState();
  showInputBarNotification('Áudio descartado com sucesso');
}

// Restaura estado inicial do formulário de chat
function resetAudioState() {
  mediaRecorder = null;
  audioChunks = [];
  recordedAudioBlob = null;
  recordedAudioBase64 = null;
  isRecordingPaused = false;

  stopAudioVisualizer();

  const player = document.getElementById('audio-preview-player');
  if (player) {
    player.pause();
    player.src = '';
  }

  setInputBarMode('text');
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
    const targetJid = selectedChatJid;
    socket.emit('finish_chat', { cliente_jid: targetJid, atendente_id: currentOperator.id });
    
    // Retorna ao estado vazio com transição suave
    closeActiveChatAreaWithAnimation(targetJid);
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
  setupAudioPreviewEvents();
  initAttachmentHandlers();

  if (chatInput) {
    chatInput.addEventListener('input', adjustChatInputHeight);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessageFromInput();
      }
    });
  }
  
  if (contextMenu) {
    contextMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Função global super-robusta para atualizar os indicadores
  window.forceUpdateIndicators = () => {
    // Busca os botões diretamente no DOM para ignorar qualquer cache de variável
    const activeBtn = document.getElementById(currentSidebarTab === 'active' ? 'tab-active' : `tab-${currentSidebarTab}`);
    const activeFilterBtn = document.getElementById(activeFilterType === 'all' ? 'btn-active-filter-all' : `btn-active-filter-${activeFilterType}`);
    
    if (activeBtn) updateTabIndicator(activeBtn);
    if (activeFilterBtn) updateActiveFilterIndicator(activeFilterBtn);
  };

  // Garante atualização agressiva nos primeiros segundos usando setInterval,
  // útil se a tela estiver num iframe (onde requestAnimationFrame pode não disparar).
  let initPollCount = 0;
  const initPollInterval = setInterval(() => {
    window.forceUpdateIndicators();
    initPollCount++;
    if (initPollCount > 30) clearInterval(initPollInterval); // Tenta por 7.5 segundos
  }, 250);

  // Garante que o indicador se ajuste perfeitamente após o carregamento de fontes
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => window.forceUpdateIndicators());
  }

  // Observa mudanças de layout (ex: scrollbars aparecendo, painéis redimensionando)
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => requestAnimationFrame(window.forceUpdateIndicators));
    if (tabActiveBtn) ro.observe(tabActiveBtn);
    if (btnActiveFilterAll) ro.observe(btnActiveFilterAll);
    const tabsContainerEl = document.getElementById('tabs-container');
    if (tabsContainerEl) ro.observe(tabsContainerEl);
  }

  setTimeout(window.forceUpdateIndicators, 100);
  setTimeout(window.forceUpdateIndicators, 500);
  setTimeout(window.forceUpdateIndicators, 1500);
  window.addEventListener('load', window.forceUpdateIndicators);

  // Encerra o loader após os dados ativos serem renderizados via socket (ou por timeout de segurança)
  setTimeout(() => {
    dismissInitLoader();
    window.forceUpdateIndicators();
  }, 1200);

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

// ==============================================================================
// 📎 ANEXOS (IMAGENS, VÍDEOS, ARQUIVOS) E DRAG AND DROP
// ==============================================================================

function initAttachmentHandlers() {
  const attachmentInput = document.getElementById('chat-attachment-input');
  if (attachmentInput) {
    attachmentInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        selectedAttachments = [...selectedAttachments, ...Array.from(e.target.files)];
        renderAttachmentPreview();
        if (chatInput) chatInput.focus();
      }
      e.target.value = '';
    });
  }

  // Lógica de Drag and Drop (Arrastar e Soltar)
  const chatArea = document.getElementById('active-chat-area');
  const overlay = document.getElementById('drag-drop-overlay');

  if (chatArea && overlay) {
    let dragCounter = 0; // Previne flickers ao arrastar sobre filhos

    chatArea.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.remove('opacity-0', 'pointer-events-none');
    });

    chatArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        overlay.classList.add('opacity-0', 'pointer-events-none');
      }
    });

    chatArea.addEventListener('dragover', (e) => {
      e.preventDefault(); // Necessário para permitir o drop
    });

    chatArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.add('opacity-0', 'pointer-events-none');
      
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        selectedAttachments = [...selectedAttachments, ...Array.from(e.dataTransfer.files)];
        renderAttachmentPreview();
        if (chatInput) chatInput.focus();
      }
    });
  }
}

function renderAttachmentPreview() {
  const container = document.getElementById('attachment-preview-container');
  if (!container) return;

  container.innerHTML = '';

  if (selectedAttachments.length === 0) {
    container.classList.remove('show');
    container.classList.add('hidden', 'opacity-0', 'translate-y-4', 'pointer-events-none');
    return;
  }

  container.classList.remove('hidden', 'opacity-0', 'translate-y-4', 'pointer-events-none');
  container.classList.add('show');

  selectedAttachments.forEach((file, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'attachment-preview-item';

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (isImage) {
      const url = URL.createObjectURL(file);
      itemEl.innerHTML = `<img src="${url}" alt="Preview" onload="URL.revokeObjectURL(this.src)" />`;
    } else if (isVideo) {
      const url = URL.createObjectURL(file);
      itemEl.innerHTML = `<video src="${url}" muted autoplay loop></video>`;
    } else {
      // Documento Genérico
      itemEl.innerHTML = `
        <div class="flex flex-col items-center justify-center p-1 text-center">
          <svg class="file-icon mb-1" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="text-[8px] font-bold text-slate-300 truncate w-full px-1" title="${file.name}">${file.name}</span>
        </div>
      `;
    }

    const removeBtn = document.createElement('div');
    removeBtn.className = 'attachment-preview-remove';
    removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      selectedAttachments.splice(index, 1);
      renderAttachmentPreview();
    };

    itemEl.appendChild(removeBtn);
    container.appendChild(itemEl);
  });
}
