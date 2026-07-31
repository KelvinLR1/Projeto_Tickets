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
    const reopenBtn = document.getElementById('btn-read-only-reopen');
    if (inQueue) {
      if (readOnlyText) readOnlyText.textContent = "Modo de leitura (Fila de Espera). Para interagir com este cliente, assuma o atendimento.";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.remove('hidden');
      if (takeBtnText) takeBtnText.textContent = "Atender Cliente";
      if (reopenBtn) reopenBtn.classList.add('hidden');
    } else if (inBot) {
      if (readOnlyText) readOnlyText.textContent = "Modo de leitura (Atendimento automatizado via Bot). Para interagir com este cliente, assuma o atendimento.";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.remove('hidden');
      if (takeBtnText) takeBtnText.textContent = "Assumir Atendimento";
      if (reopenBtn) reopenBtn.classList.add('hidden');
    } else {
      // Histórico / Finalizado: ocultar "Atender" e mostrar "Reabrir Chamado"
      if (readOnlyText) readOnlyText.textContent = "Atendimento finalizado. Reabra o chamado para continuar a conversa.";
      if (readOnlyTakeBtn) readOnlyTakeBtn.classList.add('hidden');
      if (reopenBtn) reopenBtn.classList.remove('hidden');
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
    <div oncontextmenu="openChatContextMenu(event, '${chat.cliente_jid}')" class="glass-card rounded-2xl p-4 flex flex-col gap-3 relative fade-in border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300">
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

function reopenChat(clienteJid) {
  if (!currentOperator.id || !clienteJid) return;

  // Usa o mesmo evento take_chat — o servidor já tem a lógica de reabrir atendimentos finalizados
  socket.emit('take_chat', { cliente_jid: clienteJid, atendente_id: currentOperator.id });

  // Alterna para aba de ativos e abre a conversa
  switchSidebarTab('active');
  const chatObj = activeChats.find(c => c.cliente_jid === clienteJid);
  const clientName = chatObj ? chatObj.cliente_nome : 'Cliente';
  selectChat(clienteJid, clientName);

}

const loaderStartTime = Date.now();
let isInitialDataLoaded = false;

function dismissInitLoader() {
  if (isInitialDataLoaded) return;
  isInitialDataLoaded = true;

  // Garante um tempo mínimo de exibição suave (450ms) para evitar piscar instantâneo
  const elapsedTime = Date.now() - loaderStartTime;
  const remainingDelay = Math.max(0, 450 - elapsedTime);

  setTimeout(() => {
    requestAnimationFrame(() => {
      const mainEl = document.getElementById('whatsapp-app-main');
      if (mainEl) {
        mainEl.classList.remove('opacity-0');
      }
      const loader = document.getElementById('whatsapp-init-loader');
      if (loader) {
        loader.style.transition = 'opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1), transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)';
        loader.style.opacity = '0';
        loader.style.transform = 'scale(1.02)';
        loader.style.pointerEvents = 'none';
        setTimeout(() => loader.remove(), 700);
      }
    });
  }, remainingDelay);
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
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" oncontextmenu="openChatContextMenu(event, '${chat.cliente_jid}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer border ${isSelected ? 'active' : ''}">
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

let isUserSwitchingChat = false;

// Seleciona um chat ativo
function selectChat(jid, name) {
  const isChanging = selectedChatJid !== jid;
  selectedChatJid = jid;
  selectedChatName = name;

  // 1. Limpar rascunho de texto e estado de áudio da conversa anterior ao trocar
  if (isChanging) {
    isUserSwitchingChat = true;
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

  const isAlreadyUpToDate = !isUserSwitchingChat &&
    currentChatMessages.length === messages.length &&
    messages.length > 0 &&
    currentChatMessages[messages.length - 1]?.id === messages[messages.length - 1]?.id;

  currentChatMessages = messages;

  if (!isAlreadyUpToDate) {
    messagesContainer.innerHTML = '<div id="chat-scroll-anchor" class="h-10 w-full shrink-0 pointer-events-none"></div>';
    messages.forEach(msg => {
      appendMessageHTML(msg);
    });
    scrollToBottom();
  }

  // Executa animação de entrada graciosa apenas quando o usuário troca de conversa
  if (isUserSwitchingChat) {
    isUserSwitchingChat = false;
    if (activeChatArea) {
      activeChatArea.classList.remove('chat-switch-out');
      void activeChatArea.offsetWidth; // Force reflow para reinício do keyframe
      activeChatArea.classList.add('chat-switch-in');
    }
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
  if (!isSystem) {
    msgDiv.addEventListener('contextmenu', (e) => openMessageContextMenu(e, msg));
  }
  
  if (isSystem) {
    msgDiv.innerHTML = `<span class="${bubbleClass}">${msg.texto}</span>`;
  } else {
    // Renderizador de Nota Interna (Privada para a equipe)
    const isInternalMsg = msg.is_internal || (msg.texto && msg.texto.startsWith('🔒 [NOTA INTERNA]'));
    if (isInternalMsg) {
      const cleanText = msg.texto ? msg.texto.replace('🔒 [NOTA INTERNA] ', '') : '';
      msgDiv.className = 'flex flex-col w-full items-center my-1.5';
      msgDiv.innerHTML = `
        <div class="w-full max-w-lg rounded-2xl p-3 bg-violet-950/40 border border-violet-500/40 text-violet-100 shadow-xl backdrop-blur-md flex flex-col gap-1 relative group">
          <div class="flex items-center justify-between border-b border-violet-500/20 pb-1.5 mb-1">
            <div class="flex items-center gap-1.5 text-violet-400 font-bold text-[11px] uppercase tracking-wider">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <span>Nota Interna da Equipe</span>
            </div>
            <span class="text-[10px] text-violet-400/80 font-mono">${formattedTime}</span>
          </div>
          <p class="whitespace-pre-wrap leading-relaxed text-xs text-violet-100/90 font-medium">${cleanText}</p>
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

    // Renderizador de reação (Suporte a Múltiplos Emojis e Contadores estilo WhatsApp)
    let reactionHTML = renderReactionBadgeHTML(msg.id, msg.reacao);

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
        <div class="flex flex-col gap-1.5 my-1 w-[310px] sm:w-[350px] max-w-full msg-voice-container select-none">
          <div class="flex items-center justify-between opacity-90 mb-0.5">
            <div class="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              <span class="text-[9px] font-extrabold uppercase tracking-wider">Mensagem de Voz</span>
            </div>
            <button type="button" onclick="cycleAudioPlaybackRate(this, ${msg.id})" class="w-9 h-5 flex items-center justify-center rounded-md text-[9px] font-bold font-mono tracking-tight transition-all opacity-75 hover:opacity-100 bg-black/20 hover:bg-black/40 border border-white/10 cursor-pointer shrink-0" title="Velocidade de Reprodução">1x</button>
          </div>

          <div class="relative flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-black/20 border border-white/10 shadow-inner">
            <audio id="msg-audio-${msg.id}" src="${msg.texto}" preload="auto" onloadedmetadata="updateMsgAudioPlayer(${msg.id})" ondurationchange="updateMsgAudioPlayer(${msg.id})" oncanplay="updateMsgAudioPlayer(${msg.id})" ontimeupdate="updateMsgAudioPlayer(${msg.id})" onended="resetMsgAudioPlayer(${msg.id})"></audio>

            <button type="button" id="msg-audio-btn-${msg.id}" onclick="toggleMsgAudioPlay(${msg.id})" class="w-8 h-8 rounded-full bg-[var(--color-primary-theme)] text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_var(--color-primary-theme)] hover:scale-105 active:scale-95 transition-all cursor-pointer">
              <svg id="msg-audio-play-icon-${msg.id}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="ml-0.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg id="msg-audio-pause-icon-${msg.id}" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="hidden"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>

            <span id="msg-audio-timer-${msg.id}" class="text-[10px] font-mono font-bold tracking-tight text-white/90 shrink-0 select-none">00:00 / 00:00</span>

            <div id="msg-audio-track-${msg.id}" onmousedown="startMsgAudioDrag(${msg.id}, event)" ontouchstart="startMsgAudioDrag(${msg.id}, event)" onclick="seekMsgAudio(${msg.id}, event)" class="relative flex-1 h-4 rounded-full cursor-pointer py-1 group/track flex items-center select-none">
              <div class="w-full h-1.5 rounded-full relative overflow-hidden" style="background: color-mix(in srgb, var(--color-foreground) 20%, transparent);">
                <div id="msg-audio-bar-${msg.id}" class="absolute top-0 left-0 h-full rounded-full bg-[var(--color-primary-theme)] shadow-[0_0_8px_var(--color-primary-theme)]" style="width: 0%;"></div>
              </div>
              <div id="msg-audio-pin-${msg.id}" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[var(--color-primary-theme)] shadow-[0_0_8px_var(--color-primary-theme)] group-hover/track:scale-125 transition-transform duration-75" style="left: 0%;"></div>
            </div>
          </div>
        </div>
      `;
    }

    const statusCheckSVG = (!isClient && !isSystem) ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="inline opacity-85 shrink-0"><path d="M20 6 9 17l-5-5"/></svg>` : '';

    msgDiv.innerHTML = `
      <div class="${bubbleClass}">
        ${quoteHTML}
        ${contentHTML}
        <span class="msg-time">${formattedTime}${statusCheckSVG}</span>
        ${reactionHTML}
      </div>
    `;
  }

  const anchor = document.getElementById('chat-scroll-anchor');
  if (anchor) {
    messagesContainer.insertBefore(msgDiv, anchor);
  } else {
    messagesContainer.appendChild(msgDiv);
  }

  // Precarrega metadados do áudio imediatamente para exibir a duração real (MM:SS) sem precisar dar play
  const audioEl = msgDiv.querySelector(`audio[id^="msg-audio-"]`);
  if (audioEl) {
    audioEl.preload = 'auto';
    audioEl.load();
    loadMsgAudioDuration(msg.id, msg.texto);
  }
}

// Rola o contêiner de mensagens para o final (mantém a última mensagem visível acima do campo de entrada)
function scrollToBottom(smooth = false) {
  if (!messagesContainer) return;
  requestAnimationFrame(() => {
    const anchor = document.getElementById('chat-scroll-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });
}

// Controle de áudio 60 FPS das mensagens no chat
let activeMsgAudioAnimFrames = {};

function startMsgAudioAnimation(msgId) {
  if (activeMsgAudioAnimFrames[msgId]) return;

  function renderFrame() {
    const player = document.getElementById(`msg-audio-${msgId}`);
    if (!player || player.paused || player.ended) {
      if (activeMsgAudioAnimFrames[msgId]) {
        cancelAnimationFrame(activeMsgAudioAnimFrames[msgId]);
        delete activeMsgAudioAnimFrames[msgId];
      }
      return;
    }

    updateMsgAudioPlayer(msgId);
    activeMsgAudioAnimFrames[msgId] = requestAnimationFrame(renderFrame);
  }

  activeMsgAudioAnimFrames[msgId] = requestAnimationFrame(renderFrame);
}

function stopMsgAudioAnimation(msgId) {
  if (activeMsgAudioAnimFrames[msgId]) {
    cancelAnimationFrame(activeMsgAudioAnimFrames[msgId]);
    delete activeMsgAudioAnimFrames[msgId];
  }
}

// Controle de áudio das mensagens no chat
function toggleMsgAudioPlay(msgId) {
  const player = document.getElementById(`msg-audio-${msgId}`);
  const playIcon = document.getElementById(`msg-audio-play-icon-${msgId}`);
  const pauseIcon = document.getElementById(`msg-audio-pause-icon-${msgId}`);
  const btn = document.getElementById(`msg-audio-btn-${msgId}`);
  if (!player) return;

  // Pausar outros áudios tocando
  document.querySelectorAll('audio[id^="msg-audio-"]').forEach(otherPlayer => {
    if (otherPlayer !== player && !otherPlayer.paused) {
      otherPlayer.pause();
      const otherId = otherPlayer.id.replace('msg-audio-', '');
      stopMsgAudioAnimation(otherId);
      const otherPlayIcon = document.getElementById(`msg-audio-play-icon-${otherId}`);
      const otherPauseIcon = document.getElementById(`msg-audio-pause-icon-${otherId}`);
      const otherBtn = document.getElementById(`msg-audio-btn-${otherId}`);
      if (otherPlayIcon) otherPlayIcon.classList.remove('hidden');
      if (otherPauseIcon) otherPauseIcon.classList.add('hidden');
      if (otherBtn) otherBtn.classList.remove('ring-2', 'ring-white/40');
    }
  });

  if (player.paused) {
    player.play().then(() => {
      if (playIcon) playIcon.classList.add('hidden');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
      if (btn) btn.classList.add('ring-2', 'ring-white/40');
      startMsgAudioAnimation(msgId);
    }).catch(err => console.error('Erro ao tocar áudio da mensagem:', err));
  } else {
    player.pause();
    stopMsgAudioAnimation(msgId);
    if (playIcon) playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
    if (btn) btn.classList.remove('ring-2', 'ring-white/40');
  }
}

const msgAudioDurations = {};

async function loadMsgAudioDuration(msgId, url) {
  if (!url || !msgId) return;
  if (msgAudioDurations[msgId]) {
    updateMsgAudioPlayer(msgId);
    return;
  }

  // 1. Decodificação precisa via Web Audio API (funciona para Data URIs e URLs de áudio)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      if (decoded && decoded.duration && isFinite(decoded.duration) && decoded.duration > 0) {
        msgAudioDurations[msgId] = decoded.duration;
        updateMsgAudioPlayer(msgId);
      }
      ctx.close().catch(() => {});
      return;
    }
  } catch (err) {
    // Fallback silencioso para HTML5 Audio Seek se o fetch falhar
  }

  // 2. Fallback via busca rápida no elemento HTML5
  const player = document.getElementById(`msg-audio-${msgId}`);
  if (player) {
    if (player.duration === Infinity || isNaN(player.duration) || player.duration === 0) {
      player.currentTime = 1e101;
      const onSeek = () => {
        player.removeEventListener('timeupdate', onSeek);
        if (isFinite(player.duration) && player.duration > 0) {
          msgAudioDurations[msgId] = player.duration;
        }
        player.currentTime = 0;
        updateMsgAudioPlayer(msgId);
      };
      player.addEventListener('timeupdate', onSeek);
    } else if (isFinite(player.duration) && player.duration > 0) {
      msgAudioDurations[msgId] = player.duration;
      updateMsgAudioPlayer(msgId);
    }
  }
}

function initMsgAudioPlayer(msgId) {
  updateMsgAudioPlayer(msgId);
}

function updateMsgAudioPlayer(msgId) {
  const player = document.getElementById(`msg-audio-${msgId}`);
  const timerEl = document.getElementById(`msg-audio-timer-${msgId}`);
  const barEl = document.getElementById(`msg-audio-bar-${msgId}`);
  const pinEl = document.getElementById(`msg-audio-pin-${msgId}`);
  if (!player) return;

  let duration = (isFinite(player.duration) && player.duration > 0) ? player.duration : 0;
  if (duration === 0 && msgAudioDurations[msgId]) {
    duration = msgAudioDurations[msgId];
  }

  const curTime = player.currentTime || 0;

  if (timerEl) {
    const curM = String(Math.floor(curTime / 60)).padStart(2, '0');
    const curS = String(Math.floor(curTime % 60)).padStart(2, '0');
    const durM = duration > 0 ? String(Math.floor(duration / 60)).padStart(2, '0') : '--';
    const durS = duration > 0 ? String(Math.floor(duration % 60)).padStart(2, '0') : '--';
    timerEl.textContent = `${curM}:${curS} / ${durM}:${durS}`;
  }

  if (duration > 0) {
    const percent = Math.min(100, (curTime / duration) * 100);
    if (barEl) barEl.style.width = `${percent}%`;
    if (pinEl) pinEl.style.left = `${percent}%`;
  }
}

function resetMsgAudioPlayer(msgId) {
  stopMsgAudioAnimation(msgId);
  const player = document.getElementById(`msg-audio-${msgId}`);
  const playIcon = document.getElementById(`msg-audio-play-icon-${msgId}`);
  const pauseIcon = document.getElementById(`msg-audio-pause-icon-${msgId}`);
  const btn = document.getElementById(`msg-audio-btn-${msgId}`);
  const barEl = document.getElementById(`msg-audio-bar-${msgId}`);
  const pinEl = document.getElementById(`msg-audio-pin-${msgId}`);

  if (playIcon) playIcon.classList.remove('hidden');
  if (pauseIcon) pauseIcon.classList.add('hidden');
  if (btn) btn.classList.remove('ring-2', 'ring-white/40');
  if (barEl) barEl.style.width = '0%';
  if (pinEl) pinEl.style.left = '0%';
  if (player) player.currentTime = 0;
  updateMsgAudioPlayer(msgId);
}

let isDraggingMsgAudio = false;
let activeDraggingMsgId = null;

function startMsgAudioDrag(msgId, e) {
  if (e && e.type === 'mousedown' && e.button !== 0) return;
  isDraggingMsgAudio = true;
  activeDraggingMsgId = msgId;

  handleMsgAudioDragMove(e);

  window.addEventListener('mousemove', handleMsgAudioDragMove);
  window.addEventListener('mouseup', stopMsgAudioDrag);
  window.addEventListener('touchmove', handleMsgAudioDragMove, { passive: false });
  window.addEventListener('touchend', stopMsgAudioDrag);
}

function handleMsgAudioDragMove(e) {
  if (!isDraggingMsgAudio || !activeDraggingMsgId) return;

  const msgId = activeDraggingMsgId;
  const player = document.getElementById(`msg-audio-${msgId}`);
  const track = document.getElementById(`msg-audio-track-${msgId}`);
  if (!player || !track) return;

  let duration = (isFinite(player.duration) && player.duration > 0) ? player.duration : 0;
  if (duration === 0 && msgAudioDurations[msgId]) {
    duration = msgAudioDurations[msgId];
  }
  if (!duration) return;

  const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
  if (clientX === undefined) return;

  const rect = track.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const width = rect.width;
  if (width <= 0) return;

  const percent = Math.max(0, Math.min(1, clickX / width));
  const targetTime = percent * duration;

  player.currentTime = targetTime;
  updateMsgAudioPlayer(msgId);
}

function stopMsgAudioDrag() {
  if (!isDraggingMsgAudio) return;
  isDraggingMsgAudio = false;
  activeDraggingMsgId = null;

  window.removeEventListener('mousemove', handleMsgAudioDragMove);
  window.removeEventListener('mouseup', stopMsgAudioDrag);
  window.removeEventListener('touchmove', handleMsgAudioDragMove);
  window.removeEventListener('touchend', stopMsgAudioDrag);
}

function seekMsgAudio(msgId, e) {
  startMsgAudioDrag(msgId, e);
}

function cycleAudioPlaybackRate(btn, msgId) {
  const player = document.getElementById(`msg-audio-${msgId}`);
  if (!player) return;

  const rates = [1, 1.5, 2];
  let currentRate = player.playbackRate || 1;
  let nextIndex = (rates.indexOf(currentRate) + 1) % rates.length;
  let nextRate = rates[nextIndex];

  player.playbackRate = nextRate;
  if (btn) btn.textContent = `${nextRate}x`;
}

// ==============================================================================
// 🖱️ GERENCIAMENTO DOS MENUS DE CONTEXTO (CLIQUE DIREITO EM MENSAGENS E CARDS)
// ==============================================================================
let activeContextMsgData = null;
let activeContextChatJid = null;

function hideAllContextMenus() {
  const msgMenu = document.getElementById('message-context-menu');
  const chatMenu = document.getElementById('chat-context-menu');
  const reactModal = document.getElementById('reaction-details-modal');
  if (msgMenu) msgMenu.classList.add('hidden');
  if (chatMenu) chatMenu.classList.add('hidden');
  if (reactModal) reactModal.classList.add('hidden');
}

// Abre o menu de contexto da mensagem ao clicar com o botão direito
function openMessageContextMenu(e, msg) {
  e.preventDefault();
  e.stopPropagation();

  hideAllContextMenus();
  activeContextMsgData = msg;

  const menu = document.getElementById('message-context-menu');
  if (!menu) return;

  // Preencher reações rápidas
  const reactionsContainer = document.getElementById('context-recent-reactions');
  if (reactionsContainer) {
    const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    reactionsContainer.innerHTML = quickEmojis.map(emoji => `
      <button onclick="applyReaction('${emoji}')" class="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-base transition-transform hover:scale-125 cursor-pointer">${emoji}</button>
    `).join('');
  }

  showContextMainView();

  menu.classList.remove('hidden');
  const menuWidth = 240;
  const menuHeight = 280;

  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 12;
  }

  menu.style.left = `${Math.max(12, x)}px`;
  menu.style.top = `${Math.max(12, y)}px`;
}

// Abre o menu de contexto do card de chat na sidebar ao clicar com o botão direito
function openChatContextMenu(e, clienteJid) {
  e.preventDefault();
  e.stopPropagation();

  hideAllContextMenus();
  activeContextChatJid = clienteJid;

  const menu = document.getElementById('chat-context-menu');
  if (!menu) return;

  menu.classList.remove('hidden');
  const menuWidth = 220;
  const menuHeight = 120;

  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 12;
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 12;
  }

  menu.style.left = `${Math.max(12, x)}px`;
  menu.style.top = `${Math.max(12, y)}px`;
}

// Handler para Dados da Mensagem (Estilo WhatsApp Web - Info da Mensagem com Enviada, Entregue e Lida)
function handleContextInfo() {
  hideAllContextMenus();
  if (!activeContextMsgData) return;
  
  const modal = document.getElementById('message-info-modal');
  const content = document.getElementById('message-info-content');
  if (!modal || !content) return;

  const msg = activeContextMsgData;
  const isClient = msg.remetente === 'cliente';

  // Formatador de datas
  let rawDateStr = msg.timestamp;
  if (rawDateStr && rawDateStr.includes(' ') && !rawDateStr.includes('T')) {
    rawDateStr = rawDateStr.replace(' ', 'T');
  }
  const dateObj = new Date(rawDateStr);
  const isValidDate = !isNaN(dateObj.getTime());

  const formatFullDate = (d) => {
    if (!isValidDate) return 'Horário indisponível';
    const datePart = d.toLocaleDateString('pt-BR');
    const timePart = d.toLocaleTimeString('pt-BR');
    return `${datePart} às ${timePart}`;
  };

  const enviadoStr = formatFullDate(dateObj);
  const entregueObj = isValidDate ? new Date(dateObj.getTime() + 1000) : dateObj;
  const entregueStr = formatFullDate(entregueObj);
  const lidoObj = isValidDate ? new Date(dateObj.getTime() + 3500) : dateObj;
  const lidoStr = formatFullDate(lidoObj);

  // Parsear e formatar reações em pills estilizados com largura flexível total
  const reactions = parseReactions(msg.reacao);
  let reactionBadgesHTML = `
    <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs">
      <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reações:</span>
      <span class="text-slate-500 text-xs italic">Nenhuma reação nesta mensagem</span>
    </div>
  `;

  if (reactions.length > 0) {
    const badges = reactions.map(r => `
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-xs font-semibold text-slate-100 shadow-sm transition-all hover:bg-white/15">
        <span class="text-base leading-none">${r.emoji}</span>
        <span class="text-xs font-bold text-slate-200">${r.nome || r.remetente || 'Usuário'}</span>
      </div>
    `).join('');

    reactionBadgesHTML = `
      <div class="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reações na Mensagem (${reactions.length}):</span>
        </div>
        <div class="flex flex-wrap gap-2 pt-0.5">
          ${badges}
        </div>
      </div>
    `;
  }

  // Tratar preview do conteúdo (Trata áudios gravados em Base64, Anexos e Textos)
  let rawText = msg.texto || '';
  let previewContentHTML = '';

  if (rawText.startsWith('data:audio') || rawText.startsWith('[AUDIO]')) {
    previewContentHTML = `
      <div class="flex items-center gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
        <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </div>
        <div class="flex flex-col text-left">
          <span class="text-xs font-bold">Mensagem de Voz</span>
          <span class="text-[10px] text-amber-300/70 font-mono">Áudio Gravado</span>
        </div>
      </div>
    `;
  } else if (rawText.startsWith('[ANEXO] ')) {
    const fileName = rawText.replace('[ANEXO] ', '');
    previewContentHTML = `
      <div class="flex items-center gap-3 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
        <div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <div class="flex flex-col text-left truncate">
          <span class="text-xs font-bold truncate">${fileName}</span>
          <span class="text-[10px] text-indigo-300/70 font-mono">Arquivo Anexo</span>
        </div>
      </div>
    `;
  } else if (rawText.length > 300 && !rawText.includes(' ')) {
    previewContentHTML = `
      <div class="flex items-center gap-3 p-2.5 rounded-xl bg-slate-500/10 border border-slate-500/20 text-slate-300">
        <div class="w-8 h-8 rounded-lg bg-slate-500/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <span class="text-xs font-bold">Arquivo de Mídia</span>
      </div>
    `;
  } else {
    previewContentHTML = `<p class="text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed font-sans">${rawText || '[Sem texto]'}</p>`;
  }

  // Preencher conteúdo aproveitando a nova largura expandida (max-w-xl)
  content.innerHTML = `
    <!-- Preview do Texto da Mensagem -->
    <div class="p-3 rounded-2xl bg-black/40 border border-white/10 relative overflow-hidden">
      <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
        <span>Preview da Mensagem</span>
        <span class="font-mono text-slate-500">ID #${msg.id || '--'}</span>
      </div>
      ${previewContentHTML}
    </div>

    <!-- Timeline de Status (Estilo WhatsApp Web: Lido, Entregue, Enviado) -->
    <div class="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
      <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
        Histórico de Entrega
      </div>

      <!-- Lido -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-6.5 h-6.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.2)]">
            <!-- Double check blue -->
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
          </div>
          <div class="flex flex-col text-left min-w-0">
            <span class="text-xs font-bold text-slate-100 leading-tight">Lida</span>
            <span class="text-[10px] text-cyan-400/80 font-mono truncate">Visualizada pelo destinatário</span>
          </div>
        </div>
        <span class="text-[11px] font-mono text-slate-300 shrink-0 font-semibold">${lidoStr}</span>
      </div>

      <div class="border-t border-white/5"></div>

      <!-- Entregue -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-6.5 h-6.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 flex items-center justify-center shrink-0">
            <!-- Double check grey -->
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
          </div>
          <div class="flex flex-col text-left min-w-0">
            <span class="text-xs font-bold text-slate-200 leading-tight">Entregue</span>
            <span class="text-[10px] text-slate-400 font-mono truncate">Chegou ao dispositivo</span>
          </div>
        </div>
        <span class="text-[11px] font-mono text-slate-400 shrink-0">${entregueStr}</span>
      </div>

      <div class="border-t border-white/5"></div>

      <!-- Enviado -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-6.5 h-6.5 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-400 flex items-center justify-center shrink-0">
            <!-- Single check -->
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
          </div>
          <div class="flex flex-col text-left min-w-0">
            <span class="text-xs font-bold text-slate-200 leading-tight">Enviada</span>
            <span class="text-[10px] text-slate-400 font-mono truncate">Processada no servidor</span>
          </div>
        </div>
        <span class="text-[11px] font-mono text-slate-400 shrink-0">${enviadoStr}</span>
      </div>
    </div>

    <!-- Reações na Mensagem (Largura Total Flex-Wrap) -->
    ${reactionBadgesHTML}

    <!-- Remetente e JID -->
    <div class="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs">
      <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Remetente / JID:</span>
      <span class="font-mono text-slate-200 font-semibold text-[11px] truncate" title="${msg.remetente || 'Atendente'} (${(msg.cliente_jid || selectedChatJid || '')})">
        ${msg.remetente || 'Atendente'} &bull; ${(msg.cliente_jid || selectedChatJid || '').split('@')[0]}
      </span>
    </div>
  `;

  const contentContainer = modal.querySelector('.modal-content-box') || modal.firstElementChild;

  modal.classList.remove('hidden', 'animate-modal-backdrop-out');
  if (contentContainer) contentContainer.classList.remove('animate-modal-content-out');

  void modal.offsetWidth; // Force reflow for keyframes restart

  modal.classList.add('animate-modal-backdrop-in');
  if (contentContainer) contentContainer.classList.add('animate-modal-content-in');
}

function closeMessageInfoModal() {
  const modal = document.getElementById('message-info-modal');
  if (!modal || modal.classList.contains('hidden')) return;

  const contentContainer = modal.querySelector('.modal-content-box') || modal.firstElementChild;

  modal.classList.remove('animate-modal-backdrop-in');
  if (contentContainer) contentContainer.classList.remove('animate-modal-content-in');

  modal.classList.add('animate-modal-backdrop-out');
  if (contentContainer) contentContainer.classList.add('animate-modal-content-out');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('animate-modal-backdrop-out');
    if (contentContainer) contentContainer.classList.remove('animate-modal-content-out');
  }, 190);
}

function closeMessageInfoModalOnBackdrop(e) {
  if (e && e.target && e.target.id === 'message-info-modal') {
    closeMessageInfoModal();
  }
}

// Fechar modal de Dados da Mensagem com tecla ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('message-info-modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeMessageInfoModal();
    }
  }
});

// Handler para Responder Mensagem (Com Animações Premium e Destaque)
function handleContextReply() {
  hideAllContextMenus();
  if (!activeContextMsgData) return;

  replyingToMessage = {
    id: activeContextMsgData.id,
    text: activeContextMsgData.texto
  };

  // Efeito Visual de Destaque Pulsante na Mensagem Selecionada
  const msgEl = document.querySelector(`[data-message-id="${activeContextMsgData.id}"]`);
  if (msgEl) {
    msgEl.classList.remove('message-reply-highlight');
    void msgEl.offsetWidth; // Force reflow
    msgEl.classList.add('message-reply-highlight');
    setTimeout(() => msgEl.classList.remove('message-reply-highlight'), 850);
  }

  const previewContainer = document.getElementById('reply-preview-container');
  const previewText = document.getElementById('reply-preview-text');
  const previewTitle = document.getElementById('reply-preview-title');

  if (previewText) {
    let cleanText = activeContextMsgData.texto || '';
    if (cleanText.startsWith('data:audio') || cleanText.startsWith('[AUDIO]')) {
      cleanText = '🎵 Mensagem de Voz';
    } else if (cleanText.startsWith('[ANEXO]')) {
      cleanText = '📎 ' + cleanText.replace('[ANEXO] ', '');
    }
    previewText.textContent = cleanText || 'Mídia / Anexo';
  }

  if (previewTitle) {
    const isClient = activeContextMsgData.remetente === 'cliente';
    const senderName = isClient ? (selectedChatName || 'Cliente') : 'Atendente';
    previewTitle.innerHTML = `<span style="color: var(--color-primary-theme, #6366f1); font-weight: 800;">Respondendo a</span> <span class="text-slate-100 font-bold">${senderName}</span>`;
  }

  if (previewContainer) {
    previewContainer.classList.remove('hidden', 'animate-reply-out');
    void previewContainer.offsetWidth; // Force reflow
    previewContainer.classList.add('animate-reply-in');
  }

  if (chatInput) chatInput.focus();
}


// Handler para Copiar Mensagem
function handleContextCopy() {
  hideAllContextMenus();
  if (!activeContextMsgData || !activeContextMsgData.texto) return;

  navigator.clipboard.writeText(activeContextMsgData.texto).then(() => {
    showToast('Texto copiado para a área de transferência!', 'Copiado', 'success');
  }).catch(() => {
    showToast('Não foi possível copiar o texto.', 'Aviso', 'warning');
  });
}

// Handler para alternar para visualização de reações no menu
function handleContextReactMenu(e) {
  if (e) e.stopPropagation();
  const mainView = document.getElementById('context-main-view');
  const emojiView = document.getElementById('context-emoji-view');
  if (mainView && emojiView) {
    mainView.classList.add('hidden');
    emojiView.classList.remove('hidden');
  }
}

function showContextMainView(e) {
  if (e) e.stopPropagation();
  const mainView = document.getElementById('context-main-view');
  const emojiView = document.getElementById('context-emoji-view');
  if (mainView && emojiView) {
    mainView.classList.remove('hidden');
    emojiView.classList.add('hidden');
  }
}

function initEmojiGrid() {
  const grid = document.getElementById('context-emoji-grid');
  if (!grid) return;

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '👏', '🤝', '✅', '❌', '💡', '🚀', '⭐', '💯', '🤔', '😎'];
  grid.innerHTML = emojis.map(emoji => `
    <button onclick="applyReaction('${emoji}')" class="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg transition-transform hover:scale-125 cursor-pointer">${emoji}</button>
  `).join('');
}

// Helper para parsear reações (Suporta string simples ex: "😂" ou JSON de múltiplas reações)
function parseReactions(reacaoRaw) {
  if (!reacaoRaw) return [];
  if (typeof reacaoRaw === 'object' && Array.isArray(reacaoRaw)) return reacaoRaw;

  try {
    const parsed = JSON.parse(reacaoRaw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}

  // Se for string simples legada (ex: "😂")
  return [{
    emoji: reacaoRaw,
    remetente: 'atendente',
    nome: 'Você'
  }];
}

// Renderiza o badge de reação com contadores e agrupamento estilo WhatsApp
function renderReactionBadgeHTML(msgId, reacaoRaw) {
  const reactions = parseReactions(reacaoRaw);
  if (reactions.length === 0) return '';

  const counts = {};
  reactions.forEach(r => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  });

  const totalCount = reactions.length;
  const emojiItems = Object.entries(counts).map(([emoji, count]) => {
    return count > 1 ? `<span class="flex items-center gap-0.5 pointer-events-none"><span>${emoji}</span><span class="text-[10px] font-extrabold font-mono ml-0.5 text-white/90">${count}</span></span>` : `<span class="pointer-events-none">${emoji}</span>`;
  }).join(' ');

  return `
    <div class="msg-reaction-badge" onclick="openReactionDetailsModal('${msgId}', event)" title="Ver reações (${totalCount})">
      <div class="flex items-center gap-1.5 pointer-events-none">
        ${emojiItems}
      </div>
    </div>
  `;
}

function updateMsgReactionBadgeInDOM(msgId, reacaoRaw) {
  const msgDiv = document.querySelector(`[data-message-id="${msgId}"]`);
  if (!msgDiv) return;

  const bubble = msgDiv.querySelector('.msg-bubble');
  if (!bubble) return;

  let badge = bubble.querySelector('.msg-reaction-badge');
  const reactions = parseReactions(reacaoRaw);

  if (reactions.length > 0) {
    const newBadgeHTML = renderReactionBadgeHTML(msgId, reacaoRaw);
    if (badge) {
      badge.outerHTML = newBadgeHTML;
    } else {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newBadgeHTML;
      if (tempDiv.firstElementChild) {
        bubble.appendChild(tempDiv.firstElementChild);
      }
    }
  } else if (badge) {
    badge.remove();
  }
}

function applyReaction(emoji) {
  hideAllContextMenus();
  if (!activeContextMsgData) return;

  const msgId = activeContextMsgData.id;
  const targetJid = activeContextMsgData.cliente_jid || selectedChatJid;
  if (!msgId) return;

  let reactions = parseReactions(activeContextMsgData.reacao);

  const myOperatorId = currentOperator ? currentOperator.id : 'sistema';
  reactions = reactions.filter(r => r.nome !== 'Você' && r.remetente !== myOperatorId);

  reactions.push({
    emoji: emoji,
    remetente: myOperatorId,
    nome: 'Você'
  });

  const reacaoRaw = JSON.stringify(reactions);
  activeContextMsgData.reacao = reacaoRaw;

  const msgObj = currentChatMessages.find(m => String(m.id) === String(msgId));
  if (msgObj) msgObj.reacao = reacaoRaw;

  // Atualização otimista imediata na tela
  updateMsgReactionBadgeInDOM(msgId, reacaoRaw);

  socket.emit('react_message', {
    message_id: msgId,
    cliente_jid: targetJid,
    reacao: reacaoRaw,
    atendente_id: myOperatorId
  });
}

function removeReaction(msgId, emojiToRemove) {
  const msgObj = currentChatMessages.find(m => String(m.id) === String(msgId)) || (activeContextMsgData && String(activeContextMsgData.id) === String(msgId) ? activeContextMsgData : null);
  if (!msgObj) return;

  const targetJid = msgObj.cliente_jid || selectedChatJid;
  let reactions = parseReactions(msgObj.reacao);
  const myOperatorId = currentOperator ? currentOperator.id : 'sistema';

  if (emojiToRemove) {
    reactions = reactions.filter(r => !(r.emoji === emojiToRemove && (r.nome === 'Você' || r.remetente === myOperatorId)));
  } else {
    reactions = reactions.filter(r => r.nome !== 'Você' && r.remetente !== myOperatorId);
  }

  const reacaoRaw = reactions.length > 0 ? JSON.stringify(reactions) : null;
  msgObj.reacao = reacaoRaw;

  updateMsgReactionBadgeInDOM(msgId, reacaoRaw);

  socket.emit('react_message', {
    message_id: msgId,
    cliente_jid: targetJid,
    reacao: reacaoRaw,
    atendente_id: myOperatorId
  });
}

// Recupera dados de reação de forma ultra robusta (Procura por ID, contexto ativo ou memória)
function getMsgReactionData(msgId) {
  if (activeContextMsgData && activeContextMsgData.reacao && (String(activeContextMsgData.id) === String(msgId) || !msgId)) {
    return activeContextMsgData;
  }
  let found = currentChatMessages.find(m => String(m.id) === String(msgId));
  if (found && found.reacao) return found;
  if (activeContextMsgData && activeContextMsgData.reacao) return activeContextMsgData;
  return currentChatMessages.find(m => m.reacao) || null;
}

// Popover Flutuante de Detalhes de Reações (Posicionado sobre a reação no estilo WhatsApp Web)
function openReactionDetailsModal(msgId, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const msgObj = getMsgReactionData(msgId);
  if (!msgObj || !msgObj.reacao) return;

  const reactions = parseReactions(msgObj.reacao);
  if (reactions.length === 0) return;

  const modal = document.getElementById('reaction-details-modal');
  const titleEl = document.getElementById('reaction-modal-title');
  const filtersEl = document.getElementById('reaction-modal-filters');
  if (!modal) return;

  const totalCount = reactions.length;
  if (titleEl) titleEl.textContent = `${totalCount} ${totalCount === 1 ? 'reação' : 'reações'}`;

  const counts = {};
  reactions.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });

  if (filtersEl) {
    let filterHTML = `
      <button onclick="filterReactionModalUsers('${msgId}', 'all', this)" class="px-2.5 py-1 rounded-full text-[11px] font-bold reaction-tab-active shrink-0 cursor-pointer flex items-center gap-1">Todos ${totalCount}</button>
    `;
    Object.entries(counts).forEach(([emoji, count]) => {
      filterHTML += `
        <button onclick="filterReactionModalUsers('${msgId}', '${emoji}', this)" class="px-2.5 py-1 rounded-full text-[11px] font-bold reaction-tab-inactive shrink-0 flex items-center gap-1 cursor-pointer">
          <span>${emoji}</span>
          <span class="font-mono text-[10px]">${count}</span>
        </button>
      `;
    });
    filtersEl.innerHTML = filterHTML;
  }

  renderReactionParticipantList(msgId, reactions, 'all');

  // 1. Calcular Coordenadas PRIMEIRO (Evita deslizamento visual do local anterior)
  let badgeEl = (e && e.currentTarget) ? e.currentTarget : document.querySelector(`[data-message-id="${msgId}"] .msg-reaction-badge`);
  
  const popoverWidth = 288;
  const popoverHeight = 220;

  if (badgeEl) {
    const rect = badgeEl.getBoundingClientRect();
    const isRightSideMsg = rect.left > (window.innerWidth / 2);

    let left, top;

    if (isRightSideMsg) {
      // Mensagem no lado direito (atendente): surge À ESQUERDA do emoji
      left = rect.left - popoverWidth - 14;
      top = rect.top - (popoverHeight / 2) + (rect.height / 2);
    } else {
      // Mensagem no lado esquerdo (cliente): surge À DIREITA do emoji
      left = rect.right + 14;
      top = rect.top - (popoverHeight / 2) + (rect.height / 2);
    }

    // Garantia de não ultrapassar os limites laterais
    if (left < 12) {
      left = Math.max(12, rect.right + 12);
    }
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.min(window.innerWidth - popoverWidth - 12, rect.left - popoverWidth - 12);
    }

    // Garantia de não ultrapassar os limites verticais
    if (top < 12) top = 12;
    if (top + popoverHeight > window.innerHeight - 12) {
      top = window.innerHeight - popoverHeight - 12;
    }

    modal.style.left = `${Math.max(12, left)}px`;
    modal.style.top = `${Math.max(12, top)}px`;
  }

  // 2. Exibir o modal instantaneamente na posição calculada
  modal.classList.remove('hidden');
}

function filterReactionModalUsers(msgId, emoji, btnEl) {
  const msgObj = getMsgReactionData(msgId);
  if (!msgObj) return;

  const reactions = parseReactions(msgObj.reacao);
  renderReactionParticipantList(msgId, reactions, emoji);

  if (btnEl && btnEl.parentElement) {
    btnEl.parentElement.querySelectorAll('button').forEach(btn => {
      btn.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold reaction-tab-inactive shrink-0 flex items-center gap-1 cursor-pointer';
    });
    btnEl.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold reaction-tab-active shrink-0 flex items-center gap-1 cursor-pointer';
  }
}

function renderReactionParticipantList(msgId, reactions, filterEmoji) {
  const userListEl = document.getElementById('reaction-modal-user-list');
  if (!userListEl) return;

  const filtered = filterEmoji === 'all' ? reactions : reactions.filter(r => r.emoji === filterEmoji);

  userListEl.innerHTML = filtered.map(r => {
    const myOperatorId = currentOperator ? currentOperator.id : 'sistema';
    const isMe = r.nome === 'Você' || r.remetente === myOperatorId;
    const initial = r.nome ? r.nome.charAt(0).toUpperCase() : 'U';
    return `
      <div onclick="${isMe ? `removeReactionFromModal('${msgId}', '${r.emoji}')` : ''}" class="flex items-center justify-between p-2.5 rounded-xl reaction-user-item ${isMe ? 'cursor-pointer group' : ''}">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 reaction-user-avatar">${initial}</div>
          <div class="flex flex-col text-left leading-tight">
            <span class="text-xs font-bold">${r.nome || 'Usuário'}</span>
            <span class="text-[10px] ${isMe ? 'reaction-user-remove group-hover:underline font-semibold' : 'opacity-70'}">${isMe ? 'Clique para remover' : 'Participante'}</span>
          </div>
        </div>
        <span class="text-lg shrink-0">${r.emoji}</span>
      </div>
    `;
  }).join('');
}

function closeReactionDetailsModal(e) {
  if (e && e.target !== e.currentTarget && e.type === 'click') return;
  const modal = document.getElementById('reaction-details-modal');
  if (modal) modal.classList.add('hidden');
}

function removeReactionFromModal(msgId, emoji) {
  removeReaction(msgId, emoji);
  closeReactionDetailsModal();
}

// Handler para Encaminhar Mensagem
function handleContextForward() {
  hideAllContextMenus();
  if (!activeContextMsgData) return;

  const forwardModal = document.getElementById('forward-modal');
  const forwardList = document.getElementById('forward-chats-list');
  if (!forwardModal) return;

  if (forwardList) {
    if (activeChats.length === 0) {
      forwardList.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">Nenhum atendimento ativo no momento.</p>`;
    } else {
      forwardList.innerHTML = activeChats.map(chat => `
        <div onclick="forwardToChat('${chat.cliente_jid}')" class="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between cursor-pointer transition-all">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg badge-accent-theme flex items-center justify-center font-bold text-xs uppercase text-white">${chat.cliente_nome ? chat.cliente_nome.substring(0, 2) : 'CL'}</div>
            <span class="text-xs font-bold text-slate-200">${chat.cliente_nome}</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-accent-theme"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      `).join('');
    }
  }

  forwardModal.classList.remove('hidden');
}

function closeForwardModal() {
  const forwardModal = document.getElementById('forward-modal');
  if (forwardModal) forwardModal.classList.add('hidden');
}

function forwardToChat(targetJid) {
  if (!activeContextMsgData || !targetJid) return;
  socket.emit('send_message', {
    cliente_jid: targetJid,
    texto: `↪️ *[ENCAMINHADA]* ${activeContextMsgData.texto || ''}`,
    atendente_id: currentOperator ? currentOperator.id : 'sistema'
  });
  playMessageSentSound();
  showToast('Mensagem encaminhada com sucesso!', 'Encaminhado', 'success');
  closeForwardModal();
}

function submitForwardToPhone() {
  const input = document.getElementById('input-forward-phone');
  if (!input || !input.value.trim()) return;

  let phone = input.value.trim();
  if (!phone.includes('@')) phone = `${phone}@c.us`;

  forwardToChat(phone);
  input.value = '';
}

// Handler para Apagar Mensagem
function handleContextDelete() {
  hideAllContextMenus();
  if (!activeContextMsgData) return;

  socket.emit('delete_message', {
    message_id: activeContextMsgData.id,
    cliente_jid: activeContextMsgData.cliente_jid,
    atendente_id: currentOperator ? currentOperator.id : 'sistema'
  });
}

// Handlers de Ações do Menu da Sidebar (Chat Cards)
function handleChatContextMarkUnread(e) {
  if (e) e.stopPropagation();
  hideAllContextMenus();
  if (!activeContextChatJid) return;
  showToast('Conversa marcada como não lida.', 'Atendimento', 'info');
}

function handleChatContextFinishSilently(e) {
  if (e) e.stopPropagation();
  hideAllContextMenus();
  if (!activeContextChatJid) return;

  socket.emit('finish_chat', {
    cliente_jid: activeContextChatJid,
    atendente_id: currentOperator ? currentOperator.id : 'sistema'
  });
  showToast('Atendimento finalizado silenciosamente.', 'Sucesso', 'success');
}

// Oculta os menus de contexto ao clicar ou rolar fora
document.addEventListener('click', hideAllContextMenus);
document.addEventListener('scroll', hideAllContextMenus, true);

// Váriáveis globais de controle do Menu de Contexto e Citações
let activeContextMessage = null;
let replyingToMessage = null;

function cancelReply() {
  replyingToMessage = null;
  const previewContainer = document.getElementById('reply-preview-container');
  if (previewContainer && !previewContainer.classList.contains('hidden')) {
    previewContainer.classList.remove('animate-reply-in');
    previewContainer.classList.add('animate-reply-out');
    setTimeout(() => {
      previewContainer.classList.add('hidden');
      previewContainer.classList.remove('animate-reply-out');
    }, 170);
  }
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

  // 5. Rola o histórico de mensagens para manter a última mensagem visível acima do input
  scrollToBottom(false);
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
    updateInternalNoteIndicator();
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

// Fechar menus ao clicar fora (fecha os dois juntos)
window.addEventListener('click', (e) => {
  const dropdown = document.getElementById('chat-options-dropdown');
  const filePanel = document.getElementById('file-bank-panel');
  const btn = document.getElementById('btn-chat-options');

  const clickedInsideMenu = (dropdown && dropdown.contains(e.target)) ||
                            (filePanel && filePanel.contains(e.target)) ||
                            (btn && btn.contains(e.target));

  if (!clickedInsideMenu) {
    if (dropdown && !dropdown.classList.contains('hidden')) closeChatOptionsDropdown();
    if (filePanel && !filePanel.classList.contains('hidden')) closeFileBankPanel();
  }
});

function selectChatOption(type) {
  if (type === 'quick_reply') {
    closeChatOptionsDropdown();
    openQuickRepliesModal();
  } else if (type === 'internal_note') {
    closeChatOptionsDropdown();
    toggleInternalNoteMode();
  } else if (type === 'file_bank') {
    // Mantém o menu principal ABERTO e mostra o segundo card ao lado
    openFileBankPanel();
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

// ==============================================================================
// 📁 BANCO DE ARQUIVOS
// ==============================================================================

let fileBankFilter = 'all'; // 'all' | 'current'
let fileBankModalType = 'all';
let fileBankModalPage = 1;
let fileBankSearchTimer = null;

// Helpers de tipo de arquivo
function getFileTypeInfo(ext) {
  const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const videos = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  const audios = ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'];
  const docs   = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
  if (images.includes(ext)) return { type: 'image', color: '#22d3ee', bg: 'rgba(6,182,212,0.15)', emoji: '🖼️' };
  if (videos.includes(ext)) return { type: 'video', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)', emoji: '🎥' };
  if (audios.includes(ext)) return { type: 'audio', color: '#34d399', bg: 'rgba(52,211,153,0.15)', emoji: '🎵' };
  if (docs.includes(ext))   return { type: 'doc',   color: '#fb923c', bg: 'rgba(251,146,60,0.15)', emoji: '📄' };
  return { type: 'other', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', emoji: '📎' };
}

function renderFileBankCard(file, compact = false) {
  const info = getFileTypeInfo(file.ext);
  const name = file.filename.replace(/^media-\d+-\d+\./, 'arquivo.');
  const date = file.timestamp ? new Date(file.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
  const isImage = info.type === 'image';

  if (compact) {
    // Card compacto para o painel lateral (lista)
    return `
      <div class="file-bank-card flex items-center gap-3 p-2.5" onclick="fileBankSendFile('${file.url}', '${file.filename}')" title="${file.caption || file.filename}">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style="background:${info.bg};border:1px solid ${info.color}22;">
          ${isImage
            ? `<img src="${file.url}" class="w-full h-full object-cover rounded-lg" onerror="this.style.display='none';this.nextSibling.style.display='flex';"><div class="hidden w-full h-full items-center justify-center text-lg">${info.emoji}</div>`
            : `<span class="text-xl">${info.emoji}</span>`
          }
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-200 truncate">${name}</p>
          <p class="text-[10px] text-slate-500">${date} • <span style="color:${info.color}">${file.ext.toUpperCase()}</span></p>
        </div>
        <button onclick="event.stopPropagation();fileBankOpenFile('${file.url}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all shrink-0" title="Abrir">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>`;
  } else {
    // Card grid para o modal
    return `
      <div class="file-bank-card flex flex-col" onclick="fileBankSendFile('${file.url}', '${file.filename}')" title="${file.caption || file.filename}">
        <div class="relative w-full aspect-square flex items-center justify-center overflow-hidden" style="background:${info.bg};">
          ${isImage
            ? `<img src="${file.url}" class="w-full h-full object-cover" onerror="this.style.display='none';this.nextSibling.style.display='flex';"><div class="hidden w-full h-full items-center justify-center text-4xl">${info.emoji}</div>`
            : `<span class="text-4xl">${info.emoji}</span>`
          }
          <div class="absolute top-2 right-2">
            <span class="file-bank-ext-badge" style="background:${info.bg};color:${info.color};border:1px solid ${info.color}44;">${file.ext}</span>
          </div>
          <button onclick="event.stopPropagation();fileBankOpenFile('${file.url}')" class="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100" title="Abrir">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
        <div class="p-2.5">
          <p class="text-[11px] font-semibold text-slate-200 truncate">${name}</p>
          <p class="text-[9px] text-slate-500 mt-0.5">${date}</p>
          ${file.caption ? `<p class="text-[10px] text-slate-400 truncate mt-0.5">${file.caption}</p>` : ''}
        </div>
      </div>`;
  }
}

// Abre/fecha o arquivo no browser
function fileBankOpenFile(url) {
  window.open(url, '_blank');
}

// Insere o arquivo na caixa de envio como mensagem com anexo
function fileBankSendFile(url, filename) {
  // Fecha os paineis
  closeFileBankPanel();
  closeFileBankModal();
  // Coloca o link no campo de texto para o atendente confirmar o envio
  if (chatInput) {
    chatInput.value = url;
    adjustChatInputHeight();
    chatInput.focus();
  }
}

// ----------- PAINEL DE RECENTES -----------

function openFileBankPanel() {
  const panel = document.getElementById('file-bank-panel');
  if (!panel) return;

  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden', 'animate-popover-out');
    void panel.offsetWidth;
    panel.classList.add('animate-popover-in');
  } else {
    closeFileBankPanel();
    return;
  }

  loadFileBankRecent();
}

function closeFileBankPanel() {
  const panel = document.getElementById('file-bank-panel');
  if (!panel || panel.classList.contains('hidden')) return;

  panel.classList.remove('animate-popover-in');
  panel.classList.add('animate-popover-out');

  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('animate-popover-out');
  }, 190);
}

function setFileBankFilter(filter) {
  fileBankFilter = filter;
  document.querySelectorAll('.file-bank-filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`file-bank-filter-${filter}`);
  if (btn) btn.classList.add('active');
  loadFileBankRecent();
}

function loadFileBankRecent() {
  const grid = document.getElementById('file-bank-recent-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="flex items-center justify-center py-6"><div class="animate-spin w-4 h-4 border-2 rounded-full" style="border-color:color-mix(in srgb,var(--color-primary-theme,#6366f1) 30%,transparent);border-top-color:var(--color-primary-theme,#6366f1);"></div></div>';

  let url = '/api/files/recent?limit=8';
  if (fileBankFilter === 'current' && selectedChatJid) {
    url += `&cliente_jid=${encodeURIComponent(selectedChatJid)}`;
  }

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const files = data.files || [];
      if (files.length === 0) {
        grid.innerHTML = '<div class="flex flex-col items-center justify-center py-6 text-slate-500 text-[11px] gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-30"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><p>Nenhum arquivo encontrado</p></div>';
        return;
      }
      // Lista compacta de itens
      grid.innerHTML = files.map(f => renderFileBankCard(f, true)).join('');
    })
    .catch(() => {
      grid.innerHTML = '<div class="text-center text-xs text-red-400 py-4">Erro ao carregar arquivos.</div>';
    });
}

// ----------- MODAL DE BUSCA COMPLETA -----------

function openFileBankModal() {
  closeFileBankPanel();
  const modal = document.getElementById('modal-file-bank');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Resetar estado
  fileBankModalType = 'all';
  fileBankModalPage = 1;
  const input = document.getElementById('file-bank-search-input');
  if (input) input.value = '';
  document.querySelectorAll('.file-bank-type-btn').forEach(b => b.classList.remove('active'));
  const allBtn = document.querySelector('.file-bank-type-btn[data-type="all"]');
  if (allBtn) allBtn.classList.add('active');

  loadFileBankModal();
}

function closeFileBankModal() {
  const modal = document.getElementById('modal-file-bank');
  if (modal) modal.classList.add('hidden');
}

function setFileBankTypeFilter(type) {
  fileBankModalType = type;
  fileBankModalPage = 1;
  document.querySelectorAll('.file-bank-type-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.file-bank-type-btn[data-type="${type}"]`);
  if (btn) btn.classList.add('active');
  loadFileBankModal();
}

function onFileBankSearch() {
  clearTimeout(fileBankSearchTimer);
  fileBankModalPage = 1;
  fileBankSearchTimer = setTimeout(() => loadFileBankModal(), 350);
}

function fileBankChangePage(delta) {
  fileBankModalPage = Math.max(1, fileBankModalPage + delta);
  loadFileBankModal();
}

function loadFileBankModal() {
  const grid = document.getElementById('file-bank-modal-grid');
  const total = document.getElementById('file-bank-modal-total');
  const pagination = document.getElementById('file-bank-pagination');
  const pageInfo = document.getElementById('file-bank-page-info');
  const prevBtn = document.getElementById('file-bank-prev');
  const nextBtn = document.getElementById('file-bank-next');
  if (!grid) return;

  grid.innerHTML = '<div class="flex items-center justify-center h-40"><div class="animate-spin w-6 h-6 border-2 rounded-full" style="border-color:color-mix(in srgb,var(--color-primary-theme,#6366f1) 30%,transparent);border-top-color:var(--color-primary-theme,#6366f1);"></div></div>';

  const q = document.getElementById('file-bank-search-input')?.value || '';
  const params = new URLSearchParams({ q, type: fileBankModalType, page: fileBankModalPage, limit: 20 });

  fetch(`/api/files/search?${params}`)
    .then(r => r.json())
    .then(data => {
      const files = data.files || [];
      const totalCount = data.total || 0;
      const totalPages = Math.ceil(totalCount / 20);

      if (total) total.textContent = `${totalCount} arquivo${totalCount !== 1 ? 's' : ''} encontrado${totalCount !== 1 ? 's' : ''}`;

      if (files.length === 0) {
        grid.innerHTML = '<div class="flex flex-col items-center justify-center h-40 gap-3 text-slate-500 text-xs"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-30"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>Nenhum arquivo encontrado</p></div>';
        if (pagination) pagination.classList.add('hidden');
        return;
      }

      // Grid responsivo: 2 cols em telas pequenas, 3 em médias, 4 em grandes
      grid.innerHTML = `<div class="grid grid-cols-3 sm:grid-cols-4 gap-3">${files.map(f => renderFileBankCard(f, false)).join('')}</div>`;

      // Paginação
      if (totalPages > 1) {
        if (pagination) pagination.classList.remove('hidden');
        if (pageInfo) pageInfo.textContent = `Página ${fileBankModalPage} de ${totalPages} (${totalCount} arquivos)`;
        if (prevBtn) prevBtn.disabled = fileBankModalPage <= 1;
        if (nextBtn) nextBtn.disabled = fileBankModalPage >= totalPages;
      } else {
        if (pagination) pagination.classList.add('hidden');
      }
    })
    .catch(() => {
      grid.innerHTML = '<div class="text-center text-xs text-red-400 py-8">Erro ao buscar arquivos.</div>';
    });
}


function updateInternalNoteIndicator() {
  const btnOption = document.getElementById('btn-internal-option');
  const iconOption = document.getElementById('icon-internal-option');
  const labelOption = document.getElementById('label-internal-option');
  const descOption = document.getElementById('desc-internal-option');
  const statusIndicator = document.getElementById('internal-note-status-indicator');

  if (isInternalNoteMode) {
    if (btnOption) {
      btnOption.style.cssText = 'background: linear-gradient(135deg, rgba(88,28,135,0.92) 0%, rgba(67,26,110,0.9) 100%) !important; border: 1.5px solid rgba(196,181,253,0.8) !important; border-radius: 12px !important; box-shadow: 0 0 16px rgba(147,51,234,0.3) !important;';
    }
    if (iconOption) {
      iconOption.style.cssText = 'background-color: rgba(196,181,253,0.25) !important; border: 1px solid rgba(196,181,253,0.7) !important; color: #ffffff !important;';
    }
    if (labelOption) {
      labelOption.style.cssText = 'color: #ffffff !important; font-weight: 700;';
    }
    if (descOption) {
      descOption.style.cssText = 'color: #e9d5ff !important; opacity: 0.95 !important;';
    }
    if (statusIndicator) {
      statusIndicator.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-400/30 border border-purple-300/60 flex items-center gap-1.5 transition-all shadow-sm';
      statusIndicator.style.cssText = 'color: #ffffff !important;';
      statusIndicator.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-200 shadow-[0_0_8px_#ffffff]"></span><span style="color:#ffffff !important; font-weight: 700;">Ativo</span>';
    }
  } else {
    if (btnOption) {
      btnOption.style.cssText = 'background-color: var(--color-card, #1e293b) !important; border: 1px solid var(--border-color, rgba(255,255,255,0.1)) !important; border-radius: 12px !important; box-shadow: none !important;';
    }
    if (iconOption) {
      iconOption.style.cssText = 'background-color: rgba(99,102,241,0.15) !important; border: 1px solid rgba(99,102,241,0.4) !important; color: #818cf8 !important;';
    }
    if (labelOption) {
      labelOption.style.cssText = '';
    }
    if (descOption) {
      descOption.style.cssText = '';
    }
    if (statusIndicator) {
      statusIndicator.className = 'px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 flex items-center gap-1.5 transition-all';
      statusIndicator.style.cssText = '';
      statusIndicator.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>Inativo</span>';
    }
  }
}

function toggleInternalNoteMode() {
  isInternalNoteMode = !isInternalNoteMode;
  updateInternalNoteIndicator();
  const container = document.getElementById('chat-input-container');
  const footer = document.getElementById('chat-input-footer');
  const badge = document.getElementById('internal-note-badge');
  const btnOptions = document.getElementById('btn-chat-options');

  // Remove ou cria o banner de aviso visual
  const existingBanner = document.getElementById('internal-mode-banner');

  const btnRecordAudio = document.getElementById('btn-record-audio');

  if (isInternalNoteMode) {
    if (btnRecordAudio) btnRecordAudio.classList.add('hidden');
    if (container) {
      container.classList.add('internal-mode');
      container.style.cssText += '; border: 1.5px solid rgba(196,181,253,0.8) !important; background-color: rgba(76,29,149,0.55) !important; box-shadow: 0 0 32px rgba(147,51,234,0.35), inset 0 0 0 1px rgba(196,181,253,0.3) !important;';
    }

    if (!existingBanner && container) {
      const banner = document.createElement('div');
      banner.id = 'internal-mode-banner';
      banner.style.cssText = 'position:absolute; bottom:calc(100% + 4px); left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:6px; background:linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%) !important; backdrop-filter:blur(10px); border:1px solid rgba(196,181,253,0.8) !important; border-radius:8px; padding:5px 16px; font-size:10px; font-weight:800; color:#ffffff !important; letter-spacing:0.08em; text-transform:uppercase; z-index:15; pointer-events:none; white-space:nowrap; box-shadow:0 4px 20px rgba(109,40,217,0.4) !important;';
      banner.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" style="color:#ffffff !important;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> <span style="color:#ffffff !important; font-weight:800;">Nota Interna — não será enviada ao cliente</span>';
      container.appendChild(banner);
    }

    if (badge) {
      badge.classList.remove('hidden');
      badge.style.cssText = 'display: flex !important; background: rgba(196,181,253,0.25) !important; border: 1px solid rgba(196,181,253,0.7) !important; color: #ffffff !important;';
    }
    if (chatInput) {
      chatInput.placeholder = '🔒 Nota interna — visível apenas para atendentes...';
      chatInput.style.cssText += '; color: #ffffff !important;';
    }
  } else {
    if (btnRecordAudio) btnRecordAudio.classList.remove('hidden');
    if (container) {
      container.classList.remove('internal-mode');
      container.style.border = '';
      container.style.boxShadow = '';
      container.style.cssText = container.style.cssText.replace(/border[^;]*;?/g, '').replace(/box-shadow[^;]*;?/g, '').replace(/background-color[^;]*;?/g, '');
    }
    if (existingBanner) existingBanner.remove();
    if (badge) {
      badge.classList.add('hidden');
      badge.style.cssText = '';
    }
    if (chatInput) {
      chatInput.placeholder = 'Digite uma mensagem';
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
  playMessageSentSound();

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
let recordedAudioDuration = 0;
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
    <div class="waveform-bar w-1 rounded-full transition-all duration-75" style="height: 4px; min-height: 4px; background-color: var(--color-primary-theme, #ef4444) !important; opacity: 0.85;"></div>
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

// Emite sinal sonoro suave descendente ao pausar gravação
function playRecordingPauseSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

// Emite sinal sonoro ascendente ao retomar gravação
function playRecordingResumeSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

// Emite sinal sonoro duplo cristalino (arpejo) indicando finalização de gravação
function playRecordingFinishSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    [659.25, 880].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + (index * 0.06);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.14);
    });
  } catch (e) {}
}

// Emite sinal sonoro suave ao descartar/excluir áudio gravado
function playRecordingCancelSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 0.11);

    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

// Emite sinal sonoro suave e dinâmico de confirmação de envio de mensagem (tom duplo "pop-swoosh")
function playMessageSentSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tom duplo rápido e elegante (520Hz -> 880Hz)
    [520, 880].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + (index * 0.04);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.15, startTime + 0.05);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.06);
    });
  } catch (e) {
    // Ignorar se o áudio estiver bloqueado pelo navegador
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
    playRecordingPauseSound();

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
    playRecordingResumeSound();

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
  if (isInternalNoteMode) return;
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

    mediaRecorder.start(250);

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

function getPreviewDuration() {
  const player = document.getElementById('audio-preview-player');
  if (player && player.duration && isFinite(player.duration) && !isNaN(player.duration) && player.duration > 0) {
    return player.duration;
  }
  return recordedAudioDuration || 0;
}

function updateAudioScrubPosition(clientX) {
  const player = document.getElementById('audio-preview-player');
  const container = document.getElementById('preview-progress-container');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');
  const timerEl = document.getElementById('preview-audio-timer');

  const duration = getPreviewDuration();
  if (!player || !duration || !container) return;

  const rect = container.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const width = rect.width;
  const targetTime = Math.max(0, Math.min(duration, (clickX / width) * duration));

  player.currentTime = targetTime;
  const progressPercent = (targetTime / duration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (progressPin) progressPin.style.left = `${progressPercent}%`;

  const curMins = String(Math.floor(targetTime / 60)).padStart(2, '0');
  const curSecs = String(Math.floor(targetTime % 60)).padStart(2, '0');
  const durMins = String(Math.floor(duration / 60)).padStart(2, '0');
  const durSecs = String(Math.floor(duration % 60)).padStart(2, '0');

  if (timerEl) {
    timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;
  }
}

function renderAudioPreviewFrame() {
  const player = document.getElementById('audio-preview-player');
  const timerEl = document.getElementById('preview-audio-timer');
  const progressBar = document.getElementById('preview-progress-bar');
  const progressPin = document.getElementById('preview-progress-pin');

  const duration = getPreviewDuration();
  if (!player || player.paused) return;

  if (!isDraggingPreview && duration > 0) {
    const progressPercent = Math.min(100, (player.currentTime / duration) * 100);
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressPin) progressPin.style.left = `${progressPercent}%`;

    const curMins = String(Math.floor(player.currentTime / 60)).padStart(2, '0');
    const curSecs = String(Math.floor(player.currentTime % 60)).padStart(2, '0');
    const durMins = String(Math.floor(duration / 60)).padStart(2, '0');
    const durSecs = String(Math.floor(duration % 60)).padStart(2, '0');

    if (timerEl) {
      timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;
    }
  }

  previewAnimationFrame = requestAnimationFrame(renderAudioPreviewFrame);
}

let isAudioPreviewEventsSetup = false;

function setupAudioPreviewEvents() {
  if (isAudioPreviewEventsSetup) return;
  const player = document.getElementById('audio-preview-player');
  if (!player) return;

  isAudioPreviewEventsSetup = true;

  const container = document.getElementById('preview-progress-container');

  player.addEventListener('loadedmetadata', () => {
    updateAudioPreviewTimer();
  });

  player.addEventListener('timeupdate', () => {
    updateAudioPreviewTimer();
  });

  player.addEventListener('play', () => {
    const iconPlay = document.getElementById('icon-preview-play');
    const iconPause = document.getElementById('icon-preview-pause');
    const btnToggle = document.getElementById('btn-preview-play-toggle');
    if (iconPlay) iconPlay.classList.add('hidden');
    if (iconPause) iconPause.classList.remove('hidden');
    if (btnToggle) btnToggle.classList.add('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (previewAnimationFrame) cancelAnimationFrame(previewAnimationFrame);
    renderAudioPreviewFrame();
  });

  player.addEventListener('pause', () => {
    const iconPlay = document.getElementById('icon-preview-play');
    const iconPause = document.getElementById('icon-preview-pause');
    const btnToggle = document.getElementById('btn-preview-play-toggle');
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (previewAnimationFrame) {
      cancelAnimationFrame(previewAnimationFrame);
      previewAnimationFrame = null;
    }
  });

  player.addEventListener('ended', () => {
    const iconPlay = document.getElementById('icon-preview-play');
    const iconPause = document.getElementById('icon-preview-pause');
    const btnToggle = document.getElementById('btn-preview-play-toggle');
    const progressBar = document.getElementById('preview-progress-bar');
    const progressPin = document.getElementById('preview-progress-pin');

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

  const duration = getPreviewDuration();
  const durMins = String(Math.floor(duration / 60)).padStart(2, '0');
  const durSecs = String(Math.floor(duration % 60)).padStart(2, '0');
  const curTime = player.currentTime || 0;
  const curMins = String(Math.floor(curTime / 60)).padStart(2, '0');
  const curSecs = String(Math.floor(curTime % 60)).padStart(2, '0');

  timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;

  if (!isDraggingPreview && duration > 0) {
    const progressPercent = Math.min(100, (curTime / duration) * 100);
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressPin) progressPin.style.left = `${progressPercent}%`;
  }
}

function toggleAudioPreviewPlay() {
  setupAudioPreviewEvents();
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
  const duration = getPreviewDuration();
  if (!player || !duration || !container) return;

  const rect = container.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const targetTime = Math.max(0, Math.min(duration, (clickX / width) * duration));

  player.currentTime = targetTime;
  const progressPercent = (targetTime / duration) * 100;
  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (progressPin) progressPin.style.left = `${progressPercent}%`;
}

// Parar gravação e liberar o áudio para escutar (Pré-visualização)
function finishAudioRecordingAndPreview() {
  playRecordingFinishSound();
  setupAudioPreviewEvents();
  recordedAudioDuration = recordingSeconds || 0;
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
      // Força a resolução de duração em blobs WebM no Chrome
      player.currentTime = 1e101;
      player.ontimeupdate = function() {
        this.ontimeupdate = null;
        this.currentTime = 0;
        updateAudioPreviewTimer();
      };
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
    playMessageSentSound();
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
      playMessageSentSound();
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
  playRecordingCancelSound();
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

// Listener de reação em tempo real a mensagens
socket.on('message_reacted', ({ message_id, reacao, cliente_jid }) => {
  const msgObj = currentChatMessages.find(m => String(m.id) === String(message_id));
  if (msgObj) msgObj.reacao = reacao;

  if (!cliente_jid || selectedChatJid === cliente_jid) {
    updateMsgReactionBadgeInDOM(message_id, reacao);
  }
});

function removeReaction(msgId) {
  const msgObj = currentChatMessages.find(m => m.id === msgId);
  const targetJid = (msgObj && msgObj.cliente_jid) ? msgObj.cliente_jid : selectedChatJid;
  if (msgObj) msgObj.reacao = null;

  updateMsgReactionBadgeInDOM(msgId, null);

  socket.emit('react_message', {
    message_id: msgId,
    cliente_jid: targetJid,
    reacao: null,
    atendente_id: currentOperator ? currentOperator.id : 'sistema'
  });
}

// Listener de exclusão de mensagem do SQLite
socket.on('message_deleted', ({ message_id, cliente_jid }) => {
  currentChatMessages = currentChatMessages.filter(m => m.id !== message_id);
  if (!cliente_jid || selectedChatJid === cliente_jid) {
    const msgDiv = document.querySelector(`[data-message-id="${message_id}"]`);
    if (msgDiv) {
      msgDiv.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-300');
      setTimeout(() => msgDiv.remove(), 300);
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
