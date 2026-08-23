// Detecta e aplica tema enviado via Query Parameter pelo Next.js
const urlParams = new URLSearchParams(window.location.search);
const currentTheme = urlParams.get('theme') || 'dark';
const isInternalOnly = urlParams.get('internal_only') === '1' || urlParams.get('view') === 'internal';
document.documentElement.className = `theme-${currentTheme}` + (isInternalOnly ? ' internal-only-view' : '');
if (isInternalOnly && document.body) {
  document.body.classList.add('internal-only-view');
}

// Conexão Socket.io (conecta-se automaticamente ao host que serve o arquivo)
const socket = io();

// Função utilitária para sanitizar HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Re-registrar atendente automaticamente em caso de reconexão do socket para garantir associação de salas
socket.on('connect', () => {
  const savedId = localStorage.getItem('tf_operator_id');
  const savedName = localStorage.getItem('tf_operator_name');
  const savedManualStatus = localStorage.getItem('tf_operator_manual_status') || 'auto';
  if (savedId && savedName) {
    socket.emit('register_attendant', { atendente_id: savedId, nome: savedName });
    socket.emit('internal_set_status', { atendente_id: savedId, status: savedManualStatus });
  }
  if (typeof currentInternalRoomId !== 'undefined' && currentInternalRoomId) {
    socket.emit('internal_join_room', { sala_id: currentInternalRoomId, atendente_id: savedId || 'admin' });
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
let isSignatureToClientEnabled = localStorage.getItem('tf_signature_to_client') !== 'false';

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

if (messagesContainer) {
  messagesContainer.addEventListener('scroll', handleChatScroll, { passive: true });

  messagesContainer.addEventListener('mousemove', (e) => {
    const trigger = messagesContainer.querySelector('.chat-top-history-trigger');
    if (!trigger) return;
    const rect = messagesContainer.getBoundingClientRect();
    const distanceFromTop = e.clientY - rect.top;
    if (distanceFromTop >= 0 && distanceFromTop <= 55) {
      trigger.classList.add('is-near-top');
    } else {
      trigger.classList.remove('is-near-top');
    }
  });

  messagesContainer.addEventListener('mouseleave', () => {
    const trigger = messagesContainer.querySelector('.chat-top-history-trigger');
    if (trigger) trigger.classList.remove('is-near-top');
  });
}

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
  if (typeof window.forceUpdateIndicators === 'function') {
    requestAnimationFrame(window.forceUpdateIndicators);
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
    
    // Sincroniza status manual do atendente
    const savedManualStatus = localStorage.getItem('tf_operator_manual_status') || 'auto';
    currentUserManualStatus = savedManualStatus;
    socket.emit('internal_set_status', { atendente_id: savedId, status: savedManualStatus });

    // Garante que o modal fique ocultado
    attendantModal.classList.add('hidden');
  } else {
    // Exibe modal
    attendantModal.classList.remove('hidden');
  }

  // Inicializa os setores
  initSectors();

  // Sincroniza a configuração global de assinatura do backend (apenas se não houver preferência local)
  if (localStorage.getItem('tf_signature_to_client') === null) {
    fetch('http://localhost:8080/system-settings')
      .then(r => r.ok ? r.json() : null)
      .then(settings => {
        if (settings && typeof settings.whatsapp_send_signature === 'boolean') {
          isSignatureToClientEnabled = settings.whatsapp_send_signature;
        }
        updateSignatureOptionUI();
      })
      .catch(() => updateSignatureOptionUI());
  } else {
    // Inicializa estado visual da opção de assinatura
    updateSignatureOptionUI();
  }

  // Se estiver incorporado em iframe no portal principal, esconde o botão de gatilho interno local (pois a janela pai Next.js já tem o gatilho global)
  if (window.parent && window.parent !== window) {
    const trigger = document.getElementById('btn-internal-chat-trigger');
    if (trigger) trigger.style.display = 'none';
  }

  // Verifica se está rodando em modo dedicado de Chat Interno Global
  const isInternalOnly = urlParams.get('internal_only') === '1' || urlParams.get('view') === 'internal';
  if (isInternalOnly) {
    document.body.classList.add('internal-only-view');
    const trigger = document.getElementById('btn-internal-chat-trigger');
    if (trigger) trigger.style.display = 'none';
    const backdrop = document.getElementById('internal-chat-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    const drawer = document.getElementById('internal-chat-drawer');
    if (drawer) {
      drawer.className = 'fixed inset-0 w-full h-full z-50 flex flex-col overflow-hidden !translate-x-0';
    }
    setTimeout(() => {
      openInternalChatDrawer();
    }, 120);
  }
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
  const height = btnRect.height;
  const relativeTop = btnRect.top - containerRect.top;
  
  if (width > 0) {
    indicator.style.left = `${relativeLeft}px`;
    indicator.style.width = `${width}px`;
    indicator.style.top = `${relativeTop}px`;
    indicator.style.height = `${height}px`;
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
      if (item.btn) {
        item.btn.classList.remove('text-slate-400', 'hover:text-slate-200', 'hover:scale-[1.01]', 'active:scale-[0.98]');
        item.btn.classList.add('text-white', 'scale-[1.02]');
      }
      if (item.container) {
        item.container.classList.remove('hidden');
        void item.container.offsetWidth; // Force browser reflow to restart keyframe animation
        item.container.classList.add('tab-content-active');
      }
      if (item.btn) updateTabIndicator(item.btn);
    } else {
      if (item.btn) {
        item.btn.classList.remove('text-white', 'scale-[1.02]');
        item.btn.classList.add('text-slate-400', 'hover:text-slate-200', 'hover:scale-[1.01]', 'active:scale-[0.98]');
      }
      if (item.container) {
        item.container.classList.add('hidden');
        item.container.classList.remove('tab-content-active');
      }
    }
  });

  if (tab === 'active') {
    const activeFilterBtn = activeFilterType === 'all' ? btnActiveFilterAll : (activeFilterType === 'unread' ? btnActiveFilterUnread : (activeFilterType === 'groups' ? btnActiveFilterGroups : null));
    if (activeFilterBtn) updateActiveFilterIndicator(activeFilterBtn);
  }

  if (selectedChatJid) {
    updateActiveCardSelection(selectedChatJid);
  }
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
  setTimeout(() => {
    if (typeof window.forceUpdateIndicators === 'function') {
      window.forceUpdateIndicators();
    }
  }, 50);
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
  
  // No modo isolado de chat interno, não deve exibir nem bloquear a tela com o modal de QR code do WhatsApp
  if (isInternalOnly) {
    if (qrModal) qrModal.classList.add('hidden');
    return;
  }

  if (status === 'pronto' || status === 'autenticado') {
    // Esconde Modal do QR Code e reseta o bypass
    isQrBypassed = false;
    sessionStorage.removeItem('tf_qr_bypassed');
    qrModal.classList.add('hidden');
    
    // Badge do Header -> Verde
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    if (statusText) statusText.textContent = 'Conectado';
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
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse';
    if (statusText) statusText.textContent = 'QR Code Pendente';
  } else {
    // Desconectado / Carregando
    if (!isQrBypassed) {
      qrModal.classList.remove('hidden');
    }
    qrSpinner.classList.remove('hidden');
    qrImage.classList.add('hidden');
    qrStatusText.textContent = 'Inicializando WhatsApp local...';
    
    // Badge do Header -> Vermelho
    if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse';
    if (statusText) statusText.textContent = 'Desconectado';
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

  queueContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    return `
      <div oncontextmenu="openChatContextMenu(event, '${chat.cliente_jid}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex flex-col gap-3 relative fade-in border ${isSelected ? 'active' : 'border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03]'} transition-all duration-300">
        <div class="flex items-center gap-3">
          ${renderContactAvatarHTML(chat, isSelected)}
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
    `;
  }).join('');
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

// Fallback de segurança para garantir fechamento do loader
setTimeout(dismissInitLoader, 2000);

// Recebe Lista de Conversas Ativas
socket.on('active_chats_list', (rows) => {
  activeChats = rows || [];
  updateBadge(activeCountBadge, activeChats.length);
  renderActiveChats();
  checkReadOnlyBanner();
  refreshClientInfoDrawerIfOpen();
  dismissInitLoader();

  // Sincroniza status dinâmico do operador se estiver em modo automático
  if (currentUserManualStatus === 'auto') {
    const effectiveStatus = activeChats.length > 0 ? 'atendendo' : 'online';
    updateUserStatusUI(effectiveStatus, 'auto');
  }
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
    const dateVal = chat.finished_at || chat.started_at || chat.created_at || chat.timestamp;
    const formattedDate = dateVal ? new Date(dateVal).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition-all duration-200 border ${isSelected ? 'active' : ''} hover:border-white/[0.08]">
        ${renderContactAvatarHTML(chat, isSelected)}
        <div class="leading-tight text-left flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-200 truncate" title="${chat.cliente_nome}">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0 text-right">
          <span class="text-[9px] bg-slate-800/80 text-slate-400 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border border-white/5">Finalizado</span>
          <span class="text-[11px] font-semibold text-slate-300 font-mono tracking-tight">${formattedDate}</span>
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
    selectedChatJid = null;
    selectedChatName = '';
    updateActiveCardSelection(null);

    // 1. Aplica classe de saída suave
    activeChatArea.classList.add('chat-viewport-exit');

    // 2. Aguarda o encerramento fluido da transição
    setTimeout(() => {
      activeChatArea.classList.add('hidden');
      activeChatArea.classList.remove('chat-viewport-exit');

      if (emptyChatState) {
        emptyChatState.classList.remove('hidden');
        emptyChatState.classList.add('empty-state-enter');
        setTimeout(() => {
          if (emptyChatState) emptyChatState.classList.remove('empty-state-enter');
        }, 450);
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

// ==============================================================================
// 👥 GERENCIAMENTO DE PARTICIPANTES / CO-ATENDIMENTO
// ==============================================================================
let participantsTargetJid = null;
let participantsTargetName = '';
let currentChatParticipantsData = null;
let currentParticipantsTab = 'active';
let currentInviteSearchFilter = '';

function openParticipantsModal(jid, name) {
  participantsTargetJid = jid || selectedChatJid;
  participantsTargetName = name || selectedChatName || 'este cliente';

  if (!participantsTargetJid) return;

  const modal = document.getElementById('participants-modal');
  const clientNameEl = document.getElementById('participants-modal-client-name');
  if (clientNameEl) clientNameEl.textContent = `Cliente: ${participantsTargetName}`;

  // Reset tab to 'active' on open
  currentInviteSearchFilter = '';
  const searchInput = document.getElementById('input-search-invite-attendants');
  if (searchInput) searchInput.value = '';

  const modalBox = modal ? (modal.querySelector('.modal-card') || modal.firstElementChild) : null;

  if (modal) {
    modal.classList.remove('hidden', 'animate-modal-backdrop-out');
    if (modalBox) modalBox.classList.remove('animate-modal-content-out');

    void modal.offsetWidth; // Force reflow for keyframe animation restart

    modal.classList.add('animate-modal-backdrop-in');
    if (modalBox) modalBox.classList.add('animate-modal-content-in');
  }

  switchParticipantsTab('active', true);

  // Solicita dados atualizados ao servidor
  socket.emit('get_chat_participants', { cliente_jid: participantsTargetJid });
}

function closeParticipantsModal() {
  const modal = document.getElementById('participants-modal');
  if (!modal || modal.classList.contains('hidden')) return;

  const modalBox = modal.querySelector('.modal-card') || modal.firstElementChild;

  modal.classList.remove('animate-modal-backdrop-in');
  if (modalBox) modalBox.classList.remove('animate-modal-content-in');

  void modal.offsetWidth; // Force reflow so exit animation starts reliably

  modal.classList.add('animate-modal-backdrop-out');
  if (modalBox) modalBox.classList.add('animate-modal-content-out');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('animate-modal-backdrop-out');
    if (modalBox) modalBox.classList.remove('animate-modal-content-out');
  }, 250);
}

function closeParticipantsModalOnBackdrop(e) {
  if (e && e.target && e.target.id === 'participants-modal') {
    closeParticipantsModal();
  }
}

function syncParticipantsModalHeight(immediate = false) {
  requestAnimationFrame(() => {
    const wrapper = document.getElementById('participants-panels-wrapper');
    const panelActive = document.getElementById('participants-panel-active');
    const panelInvite = document.getElementById('participants-panel-invite');
    if (!wrapper || !panelActive || !panelInvite) return;

    const targetPanel = currentParticipantsTab === 'active' ? panelActive : panelInvite;
    if (!targetPanel || targetPanel.classList.contains('hidden')) return;

    const targetHeight = targetPanel.offsetHeight || targetPanel.scrollHeight;
    if (targetHeight > 0) {
      if (immediate) {
        const prevTransition = wrapper.style.transition;
        wrapper.style.transition = 'none';
        wrapper.style.height = `${targetHeight}px`;
        void wrapper.offsetHeight; // Force reflow
        wrapper.style.transition = prevTransition;
      } else {
        wrapper.style.height = `${targetHeight}px`;
      }
    }
  });
}

function switchParticipantsTab(tab, isInitial = false) {
  const prevTab = currentParticipantsTab;
  currentParticipantsTab = tab;
  const pill = document.getElementById('participants-tab-pill');
  const tabActive = document.getElementById('tab-participants-active');
  const tabInvite = document.getElementById('tab-participants-invite');
  const panelActive = document.getElementById('participants-panel-active');
  const panelInvite = document.getElementById('participants-panel-invite');
  const wrapper = document.getElementById('participants-panels-wrapper');

  if (wrapper && !isInitial) {
    const currentH = wrapper.offsetHeight;
    if (currentH > 0) {
      wrapper.style.height = `${currentH}px`;
    }
  }

  if (tab === 'active') {
    if (pill) pill.style.transform = 'translateX(0%)';
    if (tabActive) {
      tabActive.className = "relative z-10 h-8 rounded-xl text-xs transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer tab-btn-active";
    }
    if (tabInvite) {
      tabInvite.className = "relative z-10 h-8 rounded-xl text-xs transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer tab-btn-inactive";
    }
    if (panelActive) {
      panelActive.classList.remove('hidden', 'panel-tab-enter-right', 'panel-tab-enter-left');
      if (!isInitial && prevTab !== 'active') {
        void panelActive.offsetWidth; // Trigger reflow for animation restart
        panelActive.classList.add('panel-tab-enter-left');
      }
    }
    if (panelInvite) {
      panelInvite.classList.add('hidden');
      panelInvite.classList.remove('panel-tab-enter-right', 'panel-tab-enter-left');
    }
  } else {
    if (pill) pill.style.transform = 'translateX(calc(100% + 2px))';
    if (tabInvite) {
      tabInvite.className = "relative z-10 h-8 rounded-xl text-xs font-bold transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer tab-btn-active";
    }
    if (tabActive) {
      tabActive.className = "relative z-10 h-8 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer tab-btn-inactive";
    }
    if (panelActive) {
      panelActive.classList.add('hidden');
      panelActive.classList.remove('panel-tab-enter-right', 'panel-tab-enter-left');
    }
    if (panelInvite) {
      panelInvite.classList.remove('hidden', 'panel-tab-enter-right', 'panel-tab-enter-left');
      void panelInvite.offsetWidth; // Trigger reflow for animation restart
      panelInvite.classList.add('panel-tab-enter-right');
    }

    const searchInput = document.getElementById('input-search-invite-attendants');
    if (searchInput) {
      setTimeout(() => {
        if (currentParticipantsTab === 'invite') {
          searchInput.focus({ preventScroll: true });
        }
      }, 250);
    }
  }

  syncParticipantsModalHeight(isInitial);
}

function handleSearchAvailableAttendants(query) {
  currentInviteSearchFilter = (query || '').toLowerCase().trim();
  renderAvailableAttendantsList();
}

function renderAvailableAttendantsList() {
  const container = document.getElementById('participants-available-list');
  if (!container || !currentChatParticipantsData) return;

  const available = currentChatParticipantsData.available_attendants || [];
  let filtered = available;

  if (currentInviteSearchFilter) {
    filtered = available.filter(u => {
      const name = (u.nome || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      return name.includes(currentInviteSearchFilter) || id.includes(currentInviteSearchFilter);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 px-4 rounded-2xl border border-white/5 bg-slate-900/40 text-xs opacity-70">
        <p class="font-bold">Nenhum atendente encontrado</p>
        <p class="text-[10px] opacity-60 mt-1">Todos os atendentes disponíveis já estão na conversa ou não correspondem à busca.</p>
      </div>
    `;
    syncParticipantsModalHeight();
    return;
  }

  container.innerHTML = filtered.map(u => {
    const initials = (u.nome || u.id).substring(0, 2).toUpperCase();
    return `
      <div class="p-2.5 rounded-2xl participant-item-card flex items-center justify-between gap-3 transition-all">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-xl participant-avatar-theme font-bold text-xs flex items-center justify-center shrink-0">
            ${initials}
          </div>
          <div class="min-w-0 text-left">
            <p class="text-xs font-bold truncate">${u.nome || u.id}</p>
            <p class="text-[10px] opacity-70 font-mono">id: ${u.id}</p>
          </div>
        </div>
        <button onclick="inviteAttendantToChat('${u.id}', '${(u.nome || u.id).replace(/'/g, "\\'")}')" class="px-3 h-8 rounded-xl btn-invite-theme active:scale-95 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          <span>Convidar</span>
        </button>
      </div>
    `;
  }).join('');

  syncParticipantsModalHeight();
}

function renderParticipantsModal(data) {
  if (!data || data.cliente_jid !== participantsTargetJid) return;
  currentChatParticipantsData = data;

  const clientNameEl = document.getElementById('participants-modal-client-name');
  const primaryNameEl = document.getElementById('participants-primary-name');
  const primaryIdEl = document.getElementById('participants-primary-id');
  const primaryAvatarEl = document.getElementById('participants-primary-avatar');
  const primaryYouEl = document.getElementById('participants-primary-you');
  const listContainer = document.getElementById('participants-list-container');
  const totalBadge = document.getElementById('participants-total-badge');
  const tabCount = document.getElementById('participants-tab-count');
  const availableCount = document.getElementById('participants-available-count');
  const coCountLabel = document.getElementById('participants-co-count-label');

  if (clientNameEl) clientNameEl.textContent = `Cliente: ${participantsTargetName}`;

  const participants = data.participants || [];
  const available = data.available_attendants || [];
  const totalInChat = 1 + participants.length;

  if (totalBadge) totalBadge.textContent = totalInChat;
  if (tabCount) tabCount.textContent = totalInChat;
  if (availableCount) availableCount.textContent = available.length;
  if (coCountLabel) coCountLabel.textContent = `${participants.length} participante(s)`;

  // 1. Atendente Principal
  if (data.primary) {
    if (primaryNameEl) primaryNameEl.textContent = data.primary.nome || 'Atendente Principal';
    if (primaryIdEl) primaryIdEl.textContent = `id: ${data.primary.id}`;
    if (primaryAvatarEl) primaryAvatarEl.textContent = (data.primary.nome || 'OP').substring(0, 2).toUpperCase();
    if (primaryYouEl) {
      if (currentOperator && currentOperator.id === data.primary.id) {
        primaryYouEl.classList.remove('hidden');
      } else {
        primaryYouEl.classList.add('hidden');
      }
    }
  }

  // 2. Lista de Participantes Convidados (Aba 1)
  if (listContainer) {
    if (participants.length === 0) {
      listContainer.innerHTML = `
        <div class="text-center py-5 px-4 rounded-2xl border border-white/5 bg-slate-900/30 text-xs opacity-80">
          <p class="font-semibold">Nenhum co-atendente convidado</p>
          <p class="text-[10px] opacity-60 mt-0.5">Apenas o atendente responsável está nesta conversa.</p>
          <button type="button" onclick="switchParticipantsTab('invite')" class="mt-3 px-3 py-1.5 rounded-xl btn-secondary-theme font-bold text-[11px] inline-flex items-center gap-1.5 transition-all cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>+ Convidar Membro da Equipe</span>
          </button>
        </div>
      `;
    } else {
      listContainer.innerHTML = participants.map(p => {
        const initials = (p.atendente_nome || 'OP').substring(0, 2).toUpperCase();
        const isSelf = currentOperator && currentOperator.id === p.atendente_id;
        return `
          <div class="p-2.5 rounded-2xl participant-item-card flex items-center justify-between gap-2.5 transition-all">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-xl participant-avatar-theme flex items-center justify-center font-bold text-xs shrink-0">${initials}</div>
              <div class="min-w-0 text-left">
                <div class="flex items-center gap-1.5">
                  <p class="text-xs font-bold truncate">${p.atendente_nome || p.atendente_id}</p>
                  ${isSelf ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/10 opacity-90">Você</span>' : ''}
                </div>
                <div class="flex items-center gap-2 text-[9px] opacity-70 mt-0.5">
                  <span class="font-mono">id: ${p.atendente_id}</span>
                  ${p.adicionado_por ? `<span class="truncate">• Convite: ${p.adicionado_por}</span>` : ''}
                </div>
              </div>
            </div>
            <button onclick="handleRemoveParticipantClick('${p.atendente_id}', '${(p.atendente_nome || p.atendente_id).replace(/'/g, "\\'")}')" class="px-2.5 h-7 rounded-xl bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-transparent text-red-400 text-[10px] font-bold transition-all cursor-pointer active:scale-95 shrink-0 flex items-center gap-1" title="${isSelf ? 'Sair desta conversa' : 'Remover da conversa'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>${isSelf ? 'Sair' : 'Remover'}</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 3. Renderiza a lista de atendentes disponíveis (Aba 2)
  renderAvailableAttendantsList();

  syncParticipantsModalHeight();
}

function inviteAttendantToChat(selId, selName) {
  if (!participantsTargetJid || !selId) return;

  socket.emit('add_chat_participant', {
    cliente_jid: participantsTargetJid,
    atendente_id: selId,
    atendente_nome: selName,
    added_by_id: currentOperator.id,
    added_by_name: currentOperator.name || currentOperator.id
  });

  if (typeof showToast === 'function') {
    showToast(`${selName} foi adicionado(a) à conversa!`, 'Equipe Convidada', 'success');
  }

  // Switch back to active tab smoothly
  switchParticipantsTab('active');
}

async function handleRemoveParticipantClick(atendenteId, atendenteNome) {
  if (!participantsTargetJid || !atendenteId) return;

  const isSelf = currentOperator && currentOperator.id === atendenteId;
  const confirmTitle = isSelf ? 'Sair da Conversa?' : 'Remover Participante?';
  const confirmMsg = isSelf
    ? 'Deseja realmente sair do atendimento desta conversa?'
    : `Deseja remover ${atendenteNome || atendenteId} do atendimento desta conversa?`;

  const confirmed = await showCustomConfirm(confirmTitle, confirmMsg, 'danger');
  if (confirmed) {
    socket.emit('remove_chat_participant', {
      cliente_jid: participantsTargetJid,
      atendente_id: atendenteId,
      atendente_nome: atendenteNome,
      removed_by_id: currentOperator.id,
      removed_by_name: currentOperator.name || currentOperator.id
    });

    if (typeof showToast === 'function') {
      showToast(`${atendenteNome || atendenteId} foi removido(a) da conversa.`, 'Participante Removido', 'info');
    }
  }
}

// Atualiza os badges de participantes no cabeçalho do chat ativo
function updateChatHeaderParticipantsUI(data) {
  const badgeEl = document.getElementById('chat-header-participants-badge');
  const coBadgeEl = document.getElementById('chat-header-co-badge');
  const summaryEl = document.getElementById('chat-header-participants-summary');

  if (!data || !data.cliente_jid || data.cliente_jid !== selectedChatJid) {
    if (badgeEl) badgeEl.classList.add('hidden');
    if (coBadgeEl) coBadgeEl.classList.add('hidden');
    if (summaryEl) summaryEl.classList.add('hidden');
    return;
  }

  const participantsCount = data.participants ? data.participants.length : 0;
  const isCoAttendant = currentOperator && data.primary && data.primary.id !== currentOperator.id;

  if (badgeEl) {
    badgeEl.textContent = participantsCount;
    if (participantsCount > 0) {
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  if (coBadgeEl) {
    if (isCoAttendant || participantsCount > 0) {
      coBadgeEl.classList.remove('hidden');
      coBadgeEl.textContent = isCoAttendant ? 'Co-atendimento' : `${participantsCount + 1} Atendentes`;
    } else {
      coBadgeEl.classList.add('hidden');
    }
  }

  if (summaryEl) {
    if (participantsCount > 0) {
      summaryEl.classList.remove('hidden');
      const names = [data.primary ? (data.primary.nome || data.primary.id) : 'Principal', ...data.participants.map(p => p.atendente_nome || p.atendente_id)].join(', ');
      summaryEl.textContent = `👥 ${participantsCount + 1} atendentes: ${names}`;
      summaryEl.title = `Clique para gerenciar participantes (${names})`;
    } else {
      summaryEl.classList.add('hidden');
    }
  }
}

socket.on('chat_participants_data', (data) => {
  if (data && data.cliente_jid === participantsTargetJid) {
    renderParticipantsModal(data);
  }
  if (data && data.cliente_jid === selectedChatJid) {
    updateChatHeaderParticipantsUI(data);
  }
});

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

      // Sincroniza o indicador de mensagem não lida
      const existingDot = cardEl.querySelector('[title="Nova mensagem não lida"]');
      if (chat.unread === 1 && !isSelected) {
        if (!existingDot) {
          const dotWrapper = document.createElement('div');
          dotWrapper.className = 'flex items-center gap-1.5 shrink-0';
          dotWrapper.title = 'Nova mensagem não lida';
          dotWrapper.innerHTML = `
            <div class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            </div>
          `;
          cardEl.appendChild(dotWrapper);
        }
      } else {
        if (existingDot) {
          existingDot.remove();
        }
      }
    });
    return;
  }

  activeListContainer.innerHTML = filtered.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    const isUnread = chat.unread === 1 && !isSelected;
    const isGroup = chat.cliente_jid && chat.cliente_jid.endsWith('@g.us');
    const isCoAttendant = chat.is_co_attendant === 1;
    const participantsCount = chat.participantes_count || 0;

    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" oncontextmenu="openChatContextMenu(event, '${chat.cliente_jid}')" data-client-jid="${chat.cliente_jid}" class="glass-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer border ${isSelected ? 'active' : ''}">
        ${renderContactAvatarHTML(chat)}
        <div class="leading-tight text-left flex-1 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <p class="text-xs font-semibold text-slate-200 truncate flex-1">${chat.cliente_nome}</p>
            ${isGroup ? `
              <span class="text-[8px] bg-slate-800 text-slate-400 font-black px-1.5 py-0.5 rounded-md uppercase shrink-0">Grupo</span>
            ` : ''}
            ${isCoAttendant ? `
              <span class="text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold px-1.5 py-0.5 rounded-md uppercase shrink-0" title="Você é participante deste atendimento">Co-atendimento</span>
            ` : (participantsCount > 0 ? `
              <span class="text-[8px] bg-purple-500/15 text-purple-300 font-bold px-1.5 py-0.5 rounded-md uppercase shrink-0 flex items-center gap-0.5" title="${participantsCount} participante(s) adicional(is)">
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                +${participantsCount}
              </span>
            ` : '')}
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-[9px] text-slate-500 font-mono block truncate">${chat.cliente_jid.split('@')[0]}</span>
            ${isCoAttendant && chat.atendente_principal_nome ? `
              <span class="text-[9px] text-amber-400/80 truncate">• Resp: ${chat.atendente_principal_nome}</span>
            ` : ''}
          </div>
        </div>
        ${isUnread ? `
          <div class="flex items-center gap-1.5 shrink-0" title="Nova mensagem não lida">
            <div class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Atualiza o destaque ativo dos cards na sidebar sem destruir/recriar o DOM
function updateActiveCardSelection(selectedJid) {
  document.querySelectorAll('#active-list .glass-card, #queue-list-container .glass-card, #history-list .glass-card, [data-client-jid]').forEach(card => {
    const cardJid = card.getAttribute('data-client-jid');
    if (cardJid && cardJid === selectedJid) {
      card.classList.add('active');
      const unreadDot = card.querySelector('[title="Nova mensagem não lida"]');
      if (unreadDot) unreadDot.remove();
    } else if (cardJid) {
      card.classList.remove('active');
    }
  });
}

let isUserSwitchingChat = false;

let pendingUnreadCheck = false;
let unreadDividerMsgId = null;

function createUnreadDividerElement() {
  const divider = document.createElement('div');
  divider.className = 'w-full flex items-center justify-center gap-3 my-4 py-1 select-none animate-in fade-in duration-300';
  divider.innerHTML = `
    <div class="flex-1 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"></div>
    <span class="text-[10px] font-black uppercase tracking-widest text-emerald-400 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)] flex items-center gap-1.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-emerald-400"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
      <span>MENSAGENS NÃO LIDAS</span>
    </span>
    <div class="flex-1 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent"></div>
  `;
  return divider;
}

// Seleciona um chat ativo
function selectChat(jid, name) {
  const isChanging = selectedChatJid !== jid;
  selectedChatJid = jid;
  selectedChatName = name;

  // Verifica se o chat tinha mensagens não lidas antes de zerar
  const chatObj = activeChats.find(c => c.cliente_jid === jid);
  const wasUnread = chatObj && chatObj.unread === 1;
  if (wasUnread) {
    pendingUnreadCheck = true;
  } else if (isChanging) {
    unreadDividerMsgId = null;
    pendingUnreadCheck = false;
  }

  // Zera unread localmente de forma imediata
  if (chatObj) {
    chatObj.unread = 0;
  }

  // 1. Limpar rascunho de texto e estado de áudio da conversa anterior ao trocar
  if (isChanging) {
    isUserSwitchingChat = true;
    isShowingOlderMessages = false;
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

    // Sincroniza participantes da conversa para o cabeçalho
    socket.emit('get_chat_participants', { cliente_jid: jid });

    // Verifica se o chat está na fila de espera (modo de leitura)
    checkReadOnlyBanner();
  }, isChanging ? 120 : 0);
}

// ==============================================================================
// 💬 RENDERIZAÇÃO DE MENSAGENS E HISTÓRICO
// ==============================================================================

let isShowingOlderMessages = false;

function splitMessagesBySession(messages) {
  if (!messages || messages.length === 0) {
    return { older: [], current: [] };
  }

  // 1. Procura por mensagens de sistema indicando encerramento de atendimento anterior
  let splitIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.remetente === 'sistema' && (
      (m.texto && m.texto.toLowerCase().includes('finalizado')) ||
      (m.texto && m.texto.toLowerCase().includes('encerrado'))
    )) {
      // Se a última mensagem for o próprio encerramento (conversa finalizada no histórico), procura a anterior
      if (i === messages.length - 1) {
        continue;
      }
      splitIndex = i;
      break;
    }
  }

  if (splitIndex !== -1 && splitIndex < messages.length - 1) {
    return {
      older: messages.slice(0, splitIndex + 1),
      current: messages.slice(splitIndex + 1)
    };
  }

  return { older: [], current: messages };
}

function createMessageElement(msg) {
  const isSystem = msg.remetente === 'sistema';
  const isClient = msg.remetente === 'cliente';
  const isDeleted = msg.apagado === 1 || msg.apagado === true || msg.apagado === '1';
  
  let bubbleClass = 'msg-bubble msg-system';
  if (!isSystem) {
    bubbleClass = isClient ? 'msg-bubble msg-client' : 'msg-bubble msg-attendant';
    if (isDeleted) {
      bubbleClass += ' opacity-60 italic border border-dashed border-rose-500/35 shadow-none transition-all duration-300';
    }
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
            <span class="text-[9px] text-violet-400/70 font-mono">${formattedTime}</span>
          </div>
          <p class="text-xs text-violet-200 leading-relaxed break-words font-medium">${cleanText}</p>
        </div>
      `;
      return msgDiv;
    }

    // Processa citação / resposta (reply_to)
    let quoteHTML = '';
    if (msg.reply_to_text) {
      quoteHTML = `
        <div class="p-2 mb-1.5 rounded-lg bg-black/20 border-l-4 border-indigo-500 text-[11px] text-slate-300 opacity-90 truncate max-w-xs select-none">
          <span class="font-bold text-[10px] text-indigo-400 block">${msg.reply_to_sender || 'Mensagem'}</span>
          <span class="truncate block">${msg.reply_to_text}</span>
        </div>
      `;
    }

    // Processa mídia, áudio, anexos e texto simples
    let rawText = (msg.texto || '').trim();
    let attachmentUrl = msg.media_url || null;
    let attachmentCaption = msg.caption || '';

    if (rawText.startsWith('[ANEXO]')) {
      const match = rawText.match(/^\[ANEXO\]\s*(\S+)([\s\S]*)$/);
      if (match) {
        attachmentUrl = match[1];
        attachmentCaption = match[2] ? match[2].trim() : '';
      }
    } else if (!attachmentUrl && (rawText.startsWith('http://') || rawText.startsWith('https://') || rawText.startsWith('/uploads/') || rawText.startsWith('data:image/') || rawText.startsWith('data:audio/')) && !rawText.includes(' ')) {
      attachmentUrl = rawText;
    }

    const isAudio = Boolean(
      (attachmentUrl && (attachmentUrl.startsWith('data:audio/') || attachmentUrl.match(/\.(ogg|oga|opus|mp3|wav|m4a|aac|webm)($|\?)/i))) ||
      (rawText.startsWith('data:audio/'))
    );
    const isImg = Boolean(attachmentUrl && !isAudio && (attachmentUrl.startsWith('data:image/') || attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp|svg)($|\?)/i)));
    const isVideo = Boolean(attachmentUrl && !isAudio && attachmentUrl.match(/\.(mp4|webm|mov|avi|mkv)($|\?)/i));
    const isPdf = Boolean(attachmentUrl && !isAudio && attachmentUrl.match(/\.pdf($|\?)/i));

    let contentHTML = `<p class="whitespace-pre-wrap leading-relaxed text-[13px]">${rawText}</p>`;

    if (isAudio) {
      const audioSrc = attachmentUrl || rawText;
      contentHTML = `
        <div class="flex flex-col gap-1.5 my-1 w-[310px] sm:w-[350px] max-w-full msg-voice-container select-none">
          <div class="flex items-center justify-between opacity-90 mb-0.5">
            <div class="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              <span class="text-[9px] font-extrabold uppercase tracking-wider">Mensagem de Voz</span>
            </div>
            <button type="button" onclick="cycleAudioPlaybackRate(this, ${msg.id})" class="w-9 h-5 flex items-center justify-center rounded-md text-[9px] font-bold font-mono tracking-tight transition-all opacity-75 hover:opacity-100 bg-black/20 hover:bg-black/40 border border-white/10 cursor-pointer shrink-0" title="Velocidade de Reprodução">1x</button>
          </div>

          <div class="flex items-center gap-2.5">
            <button type="button" onclick="toggleMsgAudioPlay(${msg.id})" id="msg-audio-btn-${msg.id}" class="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-all duration-200 active:scale-90 cursor-pointer shadow-md shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" id="msg-audio-play-icon-${msg.id}"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" id="msg-audio-pause-icon-${msg.id}" class="hidden"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>

            <div class="flex-1 flex flex-col justify-center min-w-0">
              <div id="msg-audio-track-${msg.id}" class="w-full h-4 relative flex items-center cursor-pointer group/track" onclick="seekMsgAudio(${msg.id}, event)" onmousedown="startMsgAudioDrag(${msg.id}, event)" ontouchstart="startMsgAudioDrag(${msg.id}, event)">
                <div class="w-full h-1.5 rounded-full bg-white/15 overflow-hidden relative">
                  <div id="msg-audio-bar-${msg.id}" class="h-full rounded-full transition-[width] duration-75" style="width: 0%; background: var(--color-primary-theme, #6366f1); box-shadow: 0 0 8px var(--color-primary-theme, #6366f1);"></div>
                </div>
                <div id="msg-audio-pin-${msg.id}" class="absolute w-3 h-3 rounded-full bg-white border-2 border-slate-900 shadow-md transform -translate-x-1/2 pointer-events-none transition-transform duration-100 group-hover/track:scale-125" style="left: 0%;"></div>
              </div>

              <div class="flex items-center justify-between text-[10px] font-mono opacity-70 mt-0.5 select-none">
                <span id="msg-audio-timer-${msg.id}">00:00 / --:--</span>
              </div>
            </div>

            <audio id="msg-audio-${msg.id}" src="${audioSrc}" preload="metadata" ontimeupdate="updateMsgAudioPlayer(${msg.id})" onended="resetMsgAudioPlayer(${msg.id})" onloadedmetadata="updateMsgAudioPlayer(${msg.id})"></audio>
          </div>
          ${attachmentCaption ? `<p class="whitespace-pre-wrap leading-relaxed text-[13px] mt-1">${attachmentCaption}</p>` : ''}
        </div>
      `;
    } else if (attachmentUrl) {
      let mediaHtml = '';
      if (isImg) {
        mediaHtml = `
          <div class="relative group/media overflow-hidden rounded-xl cursor-pointer max-w-[260px] md:max-w-xs mb-1" onclick="openMediaPreview('${attachmentUrl}', 'image')">
            <img src="${attachmentUrl}" class="w-full h-auto object-cover max-h-60 rounded-xl transition-transform duration-300 group-hover/media:scale-105" loading="lazy" alt="Mídia">
          </div>
        `;
      } else if (isVideo) {
        mediaHtml = `
          <div class="rounded-xl overflow-hidden max-w-[260px] md:max-w-xs mb-1">
            <video src="${attachmentUrl}" controls class="w-full h-auto max-h-60 rounded-xl"></video>
          </div>
        `;
      } else {
        const filename = attachmentUrl.split('/').pop() || 'documento';
        mediaHtml = `
          <a href="${attachmentUrl}" target="_blank" download class="flex items-center gap-2 p-2.5 rounded-lg bg-black/20 hover:bg-black/30 border border-white/10 transition-all text-slate-200 mb-1 no-underline max-w-[240px] md:max-w-xs cursor-pointer group/file">
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
          ${attachmentCaption ? `<p class="whitespace-pre-wrap leading-relaxed text-[13px] mt-1.5">${attachmentCaption}</p>` : ''}
        </div>
      `;
    }

    let reactionHTML = '';
    if (msg.reacao) {
      reactionHTML = renderReactionBadgeHTML(msg.id, msg.reacao);
    }

    const statusCheckSVG = (!isClient && !isSystem) ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="inline opacity-85 shrink-0"><path d="M20 6 9 17l-5-5"/></svg>` : '';

    let attendantHeaderHTML = '';
    if (!isClient && !isSystem) {
      const opName = msg.atendente_nome || (msg.remetente !== 'cliente' && msg.remetente !== 'sistema' && msg.remetente !== 'bot' ? msg.remetente : 'Atendente');
      const isSigned = msg.assinado_cliente === 1 || msg.assinado_cliente === true || msg.assinado_cliente === '1';
      
      attendantHeaderHTML = `
        <div class="flex items-center justify-between gap-2 pb-1 mb-1 border-b border-white/10 text-[10px] font-bold select-none">
          <div class="flex items-center gap-1 opacity-90 truncate text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="truncate">${opName}</span>
          </div>
          ${isSigned ? `
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shrink-0 cursor-default" title="Assinado (nome do atendente enviado)">
              <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          ` : `
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-md bg-white/5 border border-white/10 text-white/40 shrink-0 cursor-default" title="Não assinado">
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </span>
          `}
        </div>
      `;
    }

    let deletedNoticeHTML = '';
    if (isDeleted) {
      const whoDeleted = msg.apagado_por === 'cliente' ? 'pelo cliente' : 'pelo atendente';
      deletedNoticeHTML = `
        <div class="msg-deleted-notice flex items-center gap-1.5 text-[10px] font-bold text-rose-400 opacity-90 pb-1 mb-1 border-b border-rose-500/20 select-none not-italic">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span>Esta mensagem foi apagada ${whoDeleted}</span>
        </div>
      `;
    }

    msgDiv.innerHTML = `<div class="${bubbleClass}">${attendantHeaderHTML}${deletedNoticeHTML}${quoteHTML}${contentHTML}<span class="msg-time">${formattedTime}${statusCheckSVG}</span>${reactionHTML}</div>`;
  }

  // Precarrega metadados do áudio imediatamente para exibir a duração real (MM:SS) sem precisar dar play
  const audioEl = msgDiv.querySelector(`audio[id^="msg-audio-"]`);
  if (audioEl) {
    audioEl.preload = 'metadata';
    audioEl.load();
    loadMsgAudioDuration(msg.id, audioEl.src || msg.texto);
  }

  return msgDiv;
}

function appendMessageHTML(msg) {
  const msgDiv = createMessageElement(msg);
  const anchor = document.getElementById('chat-scroll-anchor');
  if (anchor) {
    messagesContainer.insertBefore(msgDiv, anchor);
  } else {
    messagesContainer.appendChild(msgDiv);
  }
}

function renderChatMessages(autoScroll = true, animateOlder = false) {
  if (!messagesContainer) return;

  const { older, current } = splitMessagesBySession(currentChatMessages);

  older.forEach(m => { m._isOlder = true; });
  current.forEach(m => { m._isOlder = false; });

  // Limpa o contêiner
  messagesContainer.innerHTML = '';

  // Se houver mensagens de atendimentos anteriores
  if (older.length > 0) {
    if (isShowingOlderMessages) {
      // 1. Cria container drawer para expansão ultra suave (contém botão recolher, mensagens e divisor)
      const drawer = document.createElement('div');
      drawer.id = 'older-messages-drawer';
      drawer.className = 'older-messages-drawer w-full flex flex-col space-y-3.5';

      if (animateOlder) {
        drawer.style.maxHeight = '0px';
        drawer.style.opacity = '0';
        drawer.style.transform = 'translateY(-12px)';
      }

      // Botão para recolher no topo (Flutuante com altura zero, oculto por padrão, visível somente no hover da área superior)
      const collapseTrigger = document.createElement('div');
      collapseTrigger.className = 'chat-top-history-trigger select-none';
      collapseTrigger.innerHTML = `
        <button type="button" onclick="collapseOlderMessages()" class="group/btn load-history-pill flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-[1.03] active:scale-95">
          <div class="w-4 h-4 rounded-full flex items-center justify-center text-[10px]" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent); color: var(--color-primary-theme, #ef4444);">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </div>
          <span>Ocultar conversas anteriores</span>
        </button>
      `;
      drawer.appendChild(collapseTrigger);

      // Renderiza todas as mensagens antigas
      older.forEach((msg, idx) => {
        const el = createMessageElement(msg);
        if (animateOlder) {
          el.classList.add('older-msg-cascade');
          el.style.animationDelay = `${Math.min(idx * 0.03, 0.25)}s`;
        }
        drawer.appendChild(el);
      });

      // 2. Divisor elegante de Início do Atendimento Atual
      const sessionDivider = document.createElement('div');
      sessionDivider.className = 'w-full flex items-center justify-center gap-3 my-4 py-2 select-none';
      sessionDivider.innerHTML = `
        <div class="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.15)] flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Início do Atendimento Atual
        </span>
        <div class="flex-1 h-[1px] bg-gradient-to-r from-transparent via-white/15 to-transparent"></div>
      `;
      drawer.appendChild(sessionDivider);

      messagesContainer.appendChild(drawer);

      if (animateOlder) {
        requestAnimationFrame(() => {
          const fullH = drawer.scrollHeight + 30;
          drawer.style.maxHeight = fullH + 'px';
          drawer.style.opacity = '1';
          drawer.style.transform = 'translateY(0)';

          setTimeout(() => {
            if (drawer) drawer.style.maxHeight = 'none';
          }, 500);
        });
      }
    } else {
      // 1. Botão no topo para carregar mensagens anteriores (WhatsApp style - Oculto por padrão, visível no hover da área superior)
      const loadBox = document.createElement('div');
      loadBox.className = 'chat-top-history-trigger select-none';
      loadBox.innerHTML = `
        <button type="button" onclick="revealOlderMessages()" class="group/btn load-history-pill flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-[1.03] active:scale-95">
          <div class="w-4 h-4 rounded-full flex items-center justify-center text-[10px]" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent); color: var(--color-primary-theme, #ef4444);">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </div>
          <span>Carregar conversas anteriores</span>
        </button>
      `;
      messagesContainer.appendChild(loadBox);
    }
  }

  // Renderiza as mensagens do atendimento atual
  current.forEach(msg => {
    if (unreadDividerMsgId && String(msg.id) === String(unreadDividerMsgId)) {
      messagesContainer.appendChild(createUnreadDividerElement());
    }
    messagesContainer.appendChild(createMessageElement(msg));
  });

  // Âncora de rolagem no final
  const anchor = document.createElement('div');
  anchor.id = 'chat-scroll-anchor';
  anchor.className = 'h-10 w-full shrink-0 pointer-events-none';
  messagesContainer.appendChild(anchor);

  if (autoScroll) {
    scrollToBottom();
  }
}

function revealOlderMessages() {
  if (!messagesContainer) return;

  const pillBtn = messagesContainer.querySelector('.load-history-pill');
  if (pillBtn) {
    pillBtn.classList.add('is-loading');
    pillBtn.innerHTML = `
      <svg class="animate-spin shrink-0" style="color: var(--color-primary-theme, #ef4444);" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-[11px] font-bold" style="color: var(--color-primary-theme, #ef4444);">Carregando conversas anteriores...</span>
    `;
  }

  setTimeout(() => {
    isShowingOlderMessages = true;
    renderChatMessages(false, true);
  }, 320);
}

function collapseOlderMessages() {
  const drawer = document.getElementById('older-messages-drawer');

  if (drawer) {
    drawer.style.maxHeight = drawer.scrollHeight + 'px';
    requestAnimationFrame(() => {
      drawer.style.maxHeight = '0px';
      drawer.style.opacity = '0';
      drawer.style.transform = 'translateY(-14px)';
    });

    setTimeout(() => {
      isShowingOlderMessages = false;
      drawer.remove();

      // Insere o disparador de carregar no topo sem reconstruir o container
      const { older } = splitMessagesBySession(currentChatMessages);
      if (older.length > 0 && !messagesContainer.querySelector('.chat-top-history-trigger')) {
        const loadBox = document.createElement('div');
        loadBox.className = 'chat-top-history-trigger select-none';
        loadBox.innerHTML = `
          <button type="button" onclick="revealOlderMessages()" class="group/btn load-history-pill flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-[1.03] active:scale-95">
            <div class="w-4 h-4 rounded-full flex items-center justify-center text-[10px]" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent); color: var(--color-primary-theme, #ef4444);">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </div>
            <span>Carregar conversas anteriores</span>
          </button>
        `;
        messagesContainer.prepend(loadBox);
      }
    }, 480);
  } else {
    isShowingOlderMessages = false;
    renderChatMessages(false, false);
  }
}

// Recebe Histórico do Chat Selecionado
socket.on('chat_history', ({ cliente_jid, messages }) => {
  if (selectedChatJid !== cliente_jid) return;

  if (pendingUnreadCheck && messages.length > 0) {
    const { current } = splitMessagesBySession(messages);
    if (current.length > 0) {
      let firstUnreadIdx = -1;
      for (let i = current.length - 1; i >= 0; i--) {
        if (current[i].remetente === 'cliente') {
          firstUnreadIdx = i;
        } else {
          break;
        }
      }
      if (firstUnreadIdx !== -1) {
        unreadDividerMsgId = current[firstUnreadIdx].id;
      }
    }
    pendingUnreadCheck = false;
  }

  currentChatMessages = messages;
  renderChatMessages(true);

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

// ==============================================================================
// 🎯 CONTROLE DO BOTÃO FLUTUANTE DE ROLAR PARA O FIM (MENSAGENS RECENTES)
// ==============================================================================
let newMessagesWhileScrolledCount = 0;
let scrollBottomHideTimeout = null;

function isChatScrolledUp() {
  if (!messagesContainer) return false;
  return (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) > 160;
}

function handleChatScroll() {
  if (!messagesContainer) return;
  const isScrolledUp = isChatScrolledUp();

  if (isScrolledUp) {
    showScrollBottomButton();
  } else {
    hideScrollBottomButton();
    resetScrollBottomUnreadCount();
  }
}

function showScrollBottomButton() {
  const container = document.getElementById('chat-scroll-bottom-container');
  if (!container) return;
  clearTimeout(scrollBottomHideTimeout);

  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    void container.offsetWidth; // force reflow
  }
  container.classList.remove('opacity-0', 'translate-y-3');
  container.classList.add('opacity-100', 'translate-y-0');
}

function hideScrollBottomButton() {
  const container = document.getElementById('chat-scroll-bottom-container');
  if (!container || container.classList.contains('hidden')) return;

  clearTimeout(scrollBottomHideTimeout);
  container.classList.remove('opacity-100', 'translate-y-0');
  container.classList.add('opacity-0', 'translate-y-3');

  scrollBottomHideTimeout = setTimeout(() => {
    if (!isChatScrolledUp()) {
      container.classList.add('hidden');
    }
  }, 240);
}

function resetScrollBottomUnreadCount() {
  newMessagesWhileScrolledCount = 0;
  const badge = document.getElementById('scroll-bottom-unread-badge');
  if (badge) {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
}

function incrementScrollBottomUnreadCount() {
  newMessagesWhileScrolledCount++;
  const badge = document.getElementById('scroll-bottom-unread-badge');
  if (badge) {
    badge.textContent = newMessagesWhileScrolledCount > 99 ? '99+' : newMessagesWhileScrolledCount;
    badge.classList.remove('hidden');
  }
}

// Recebe Nova Mensagem
socket.on('new_message', (msg) => {
  const isFromClient = msg.remetente === 'cliente';
  const isFromAnotherSender = msg.remetente !== 'sistema' && (!currentOperator || msg.remetente !== currentOperator.id);

  // Se for mensagem do chat atualmente aberto
  if (selectedChatJid === msg.cliente_jid) {
    currentChatMessages.push(msg);
    appendMessageHTML(msg);

    // Toca som exclusivo e cristalino de nova mensagem na conversa aberta
    if (isFromClient || isFromAnotherSender) {
      playCurrentChatNewMessageSound();
    }

    // Se o atendente estiver lendo mensagens anteriores lá em cima, não dar scroll brusco
    if (isChatScrolledUp()) {
      incrementScrollBottomUnreadCount();
      showScrollBottomButton();
    } else {
      scrollToBottom(true);
    }

    // Avisa o servidor que já visualizamos a mensagem para limpar o status "não lido"
    if (currentOperator) {
      socket.emit('select_chat', { cliente_jid: selectedChatJid, atendente_id: currentOperator.id });
    }
  } else {
    // Mensagem recebida em outro chat da lista de ativos!
    if (isFromClient || isFromAnotherSender) {
      playBackgroundChatNewMessageSound();
    }
  }
});

// Rola o contêiner de mensagens para o final (mantém a última mensagem visível acima do campo de entrada)
function scrollToBottom(smooth = false) {
  if (!messagesContainer) return;
  resetScrollBottomUnreadCount();
  hideScrollBottomButton();

  requestAnimationFrame(() => {
    const anchor = document.getElementById('chat-scroll-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    } else {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
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
function toggleMsgAudio(msgId) {
  return toggleMsgAudioPlay(msgId);
}

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

// Verifica se a mensagem pertence a um atendimento em aberto e à sessão atual (não anterior)
function canReactOrDeleteMsg(msg) {
  if (!msg) return false;
  if (msg.is_internal || msg.sala_id) {
    return true;
  }
  const targetJid = msg.cliente_jid || selectedChatJid;
  const isChatActive = activeChats.some(c => c.cliente_jid === targetJid);
  if (!isChatActive) return false;
  if (msg._isOlder === true) return false;
  if (msg._isOlder === false) return true;

  // Fallback de segurança se _isOlder não estiver marcado
  if (currentChatMessages && currentChatMessages.length > 0) {
    const { older } = splitMessagesBySession(currentChatMessages);
    if (older && older.some(m => String(m.id) === String(msg.id))) {
      return false;
    }
  }
  return true;
}

// Abre o menu de contexto da mensagem ao clicar com o botão direito
function openMessageContextMenu(e, msg) {
  e.preventDefault();
  e.stopPropagation();

  hideAllContextMenus();
  activeContextMsgData = msg;

  const menu = document.getElementById('message-context-menu');
  if (!menu) return;

  const isInternal = Boolean(msg.is_internal || msg.sala_id);
  const isChatActiveAndCurrent = canReactOrDeleteMsg(msg);
  const isDeleted = msg.apagado === 1 || msg.apagado === true || msg.apagado === '1';

  // Permite reagir se o chat estiver ativo e a mensagem não tiver sido apagada
  const canReact = isInternal ? !isDeleted : (isChatActiveAndCurrent && !isDeleted);

  // Permite excluir:
  // Se for chat interno: apenas mensagens enviadas pelo próprio usuário (ou admin)
  // Se for WhatsApp: apenas mensagens enviadas pela equipe/atendente
  const isSelf = isInternal
    ? (currentOperator && String(msg.remetente_id) === String(currentOperator.id))
    : (msg.remetente !== 'cliente' && msg.remetente !== 'sistema');

  const canDelete = isInternal ? (!isDeleted && isSelf) : (isChatActiveAndCurrent && !isDeleted && isSelf);

  const reactionsContainer = document.getElementById('context-recent-reactions');
  const reactBtn = document.getElementById('context-react-btn');
  const deleteBtn = document.getElementById('context-delete-btn');
  const deleteDivider = document.getElementById('context-delete-divider');

  if (canReact) {
    if (reactionsContainer) {
      reactionsContainer.classList.remove('hidden');
      const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
      reactionsContainer.innerHTML = quickEmojis.map(emoji => `
        <button onclick="applyReaction('${emoji}')" class="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-base transition-transform hover:scale-125 cursor-pointer">${emoji}</button>
      `).join('');
    }
    if (reactBtn) reactBtn.classList.remove('hidden');
  } else {
    if (reactionsContainer) {
      reactionsContainer.classList.add('hidden');
      reactionsContainer.innerHTML = '';
    }
    if (reactBtn) reactBtn.classList.add('hidden');
  }

  if (canDelete) {
    if (deleteBtn) deleteBtn.classList.remove('hidden');
    if (deleteDivider) deleteDivider.classList.remove('hidden');
  } else {
    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (deleteDivider) deleteDivider.classList.add('hidden');
  }

  showContextMainView();

  menu.classList.remove('hidden');
  const menuWidth = 240;
  const menuHeight = canDelete ? 280 : (canReact ? 230 : 170);

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
  const isInternal = Boolean(msg.is_internal || msg.sala_id);

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
  const reactions = parseReactions(msg.reacao || msg.reacoes);
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

  const isDeleted = msg.apagado === 1 || msg.apagado === true || msg.apagado === '1' || (msg.texto && msg.texto.includes('Esta mensagem foi apagada'));

  // Tratar preview do conteúdo
  let rawText = msg.texto || '';
  let previewContentHTML = '';

  if (isDeleted) {
    previewContentHTML = `
      <div class="flex items-center gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 italic text-xs">
        <span class="text-base leading-none">🚫</span>
        <span class="font-semibold text-rose-300">Esta mensagem foi apagada</span>
      </div>
    `;
  } else if (rawText.startsWith('data:audio') || rawText.startsWith('[AUDIO]') || msg.midia_tipo === 'audio' || (msg.midia_url && msg.midia_url.includes('internal-voice-'))) {
    previewContentHTML = `
      <div class="flex items-center gap-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
        <div class="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </div>
        <div class="flex flex-col text-left">
          <span class="text-xs font-bold">Mensagem de Voz</span>
          <span class="text-[10px] text-amber-300/70 font-mono">Áudio Gravado</span>
        </div>
      </div>
    `;
  } else if (rawText.startsWith('[ANEXO] ') || msg.midia_url) {
    const fileName = msg.midia_url ? msg.midia_url.split('/').pop() : rawText.replace('[ANEXO] ', '');
    previewContentHTML = `
      <div class="flex items-center gap-3 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
        <div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <div class="flex flex-col text-left truncate">
          <span class="text-xs font-bold truncate">${escapeHtml(fileName)}</span>
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
    previewContentHTML = `<p class="text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed font-sans">${escapeHtml(rawText) || '[Sem texto]'}</p>`;
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

// Fechar modais com tecla ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const pModal = document.getElementById('participants-modal');
    if (pModal && !pModal.classList.contains('hidden')) {
      closeParticipantsModal();
      return;
    }
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

  const isInternal = Boolean(activeContextMsgData.is_internal || activeContextMsgData.sala_id);

  if (isInternal) {
    internalReplyingToMessage = {
      id: activeContextMsgData.id,
      text: activeContextMsgData.texto,
      sender: activeContextMsgData.remetente_nome || 'Colega'
    };

    // Efeito Visual de Destaque Pulsante na Mensagem Selecionada
    const msgEl = document.querySelector(`[data-message-id="${activeContextMsgData.id}"][data-internal="true"]`) || document.querySelector(`[data-internal-msg-id="${activeContextMsgData.id}"]`);
    if (msgEl) {
      msgEl.classList.remove('message-reply-highlight');
      void msgEl.offsetWidth; // Force reflow
      msgEl.classList.add('message-reply-highlight');
      setTimeout(() => msgEl.classList.remove('message-reply-highlight'), 850);
    }

    const previewContainer = document.getElementById('internal-reply-preview-container');
    const previewText = document.getElementById('internal-reply-preview-text');
    const previewTitle = document.getElementById('internal-reply-preview-title');

    if (previewText) {
      let cleanText = activeContextMsgData.texto || '';
      if (cleanText.startsWith('data:audio') || cleanText.startsWith('[AUDIO]') || activeContextMsgData.midia_tipo === 'audio') {
        cleanText = '🎵 Mensagem de Voz';
      } else if (activeContextMsgData.midia_url) {
        cleanText = '📎 Anexo / Mídia';
      }
      previewText.textContent = cleanText || 'Mensagem';
    }

    if (previewTitle) {
      const senderName = activeContextMsgData.remetente_nome || 'Colega';
      previewTitle.innerHTML = `<span style="color: var(--color-primary-theme, #ef4444); font-weight: 800;">Respondendo a</span> <span class="text-slate-100 font-bold">${escapeHtml(senderName)}</span>`;
    }

    if (previewContainer) {
      previewContainer.classList.remove('hidden');
    }

    const input = document.getElementById('internal-chat-input');
    if (input) input.focus();
    return;
  }

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

// Helper para obter nome do colega por ID
function getUserNameById(uId) {
  const op = (internalOperatorsList || []).find(o => String(o.id) === String(uId));
  return op ? op.nome : uId;
}

// Helper para parsear reações (Suporta string simples, Array JSON ou Dicionário { "👍": ["op1"] })
function parseReactions(reacaoRaw) {
  if (!reacaoRaw) return [];
  if (typeof reacaoRaw === 'object') {
    if (Array.isArray(reacaoRaw)) return reacaoRaw;
    const res = [];
    Object.entries(reacaoRaw).forEach(([emoji, users]) => {
      if (Array.isArray(users)) {
        users.forEach(uId => {
          const isMe = currentOperator && String(uId) === String(currentOperator.id);
          res.push({
            emoji,
            remetente: String(uId),
            nome: isMe ? 'Você' : (getUserNameById(uId) || String(uId))
          });
        });
      }
    });
    return res;
  }

  try {
    const parsed = JSON.parse(reacaoRaw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const res = [];
      Object.entries(parsed).forEach(([emoji, users]) => {
        if (Array.isArray(users)) {
          users.forEach(uId => {
            const isMe = currentOperator && String(uId) === String(currentOperator.id);
            res.push({
              emoji,
              remetente: String(uId),
              nome: isMe ? 'Você' : (getUserNameById(uId) || String(uId))
            });
          });
        }
      });
      return res;
    }
  } catch (e) {}

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

  const bubble = msgDiv.querySelector('.msg-bubble') || msgDiv.querySelector('.internal-msg-bubble-self') || msgDiv.querySelector('.internal-msg-bubble-other');
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
  if (!activeContextMsgData || !canReactOrDeleteMsg(activeContextMsgData)) return;

  const msgId = activeContextMsgData.id;
  const myOperatorId = currentOperator ? currentOperator.id : 'sistema';
  if (!msgId) return;

  const isInternal = Boolean(activeContextMsgData.is_internal || activeContextMsgData.sala_id);

  if (isInternal) {
    const salaId = activeContextMsgData.sala_id || currentInternalRoomId;
    socket.emit('internal_react_message', {
      message_id: msgId,
      sala_id: salaId,
      reacao: emoji,
      atendente_id: myOperatorId
    });
    return;
  }

  const targetJid = activeContextMsgData.cliente_jid || selectedChatJid;
  let reactions = parseReactions(activeContextMsgData.reacao);

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
  if (!msgObj || !canReactOrDeleteMsg(msgObj)) return;

  const isInternal = Boolean(msgObj.is_internal || msgObj.sala_id);
  const myOperatorId = currentOperator ? currentOperator.id : 'sistema';

  if (isInternal) {
    const salaId = msgObj.sala_id || currentInternalRoomId;
    socket.emit('internal_react_message', {
      message_id: msgId,
      sala_id: salaId,
      reacao: emojiToRemove,
      atendente_id: myOperatorId
    });
    return;
  }

  const targetJid = msgObj.cliente_jid || selectedChatJid;
  let reactions = parseReactions(msgObj.reacao);

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
  if (activeContextMsgData && (activeContextMsgData.reacao || activeContextMsgData.reacoes) && (String(activeContextMsgData.id) === String(msgId) || !msgId)) {
    return activeContextMsgData;
  }
  let found = currentChatMessages.find(m => String(m.id) === String(msgId));
  if (found && (found.reacao || found.reacoes)) return found;

  // Busca também nas mensagens do chat interno
  if (typeof internalMessagesMap !== 'undefined') {
    for (const salaId in internalMessagesMap) {
      const im = internalMessagesMap[salaId].find(m => String(m.id) === String(msgId));
      if (im && (im.reacao || im.reacoes)) return im;
    }
  }

  if (activeContextMsgData && (activeContextMsgData.reacao || activeContextMsgData.reacoes)) return activeContextMsgData;
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

  const msgObj = getMsgReactionData(msgId);
  const canInteract = canReactOrDeleteMsg(msgObj);

  const filtered = filterEmoji === 'all' ? reactions : reactions.filter(r => r.emoji === filterEmoji);

  userListEl.innerHTML = filtered.map(r => {
    const myOperatorId = currentOperator ? currentOperator.id : 'sistema';
    const isMe = (r.nome === 'Você' || r.remetente === myOperatorId) && canInteract;
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
    atendente_id: currentOperator ? currentOperator.id : 'sistema',
    atendente_nome: currentOperator ? (currentOperator.name || currentOperator.id) : 'sistema',
    send_signature: isSignatureToClientEnabled
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

  const isInternal = Boolean(activeContextMsgData.is_internal || activeContextMsgData.sala_id);

  if (isInternal) {
    const isSelf = currentOperator && String(activeContextMsgData.remetente_id) === String(currentOperator.id);
    if (!isSelf) {
      showToast('Apenas o autor pode apagar esta mensagem.', 'Aviso', 'warning');
      return;
    }
    const salaId = activeContextMsgData.sala_id || currentInternalRoomId;
    activeContextMsgData.apagado = 1;
    activeContextMsgData.texto = '🚫 Esta mensagem foi apagada';
    activeContextMsgData.midia_url = null;
    activeContextMsgData.card_meta = null;
    socket.emit('internal_delete_message', {
      message_id: activeContextMsgData.id,
      sala_id: salaId,
      atendente_id: currentOperator ? currentOperator.id : 'sistema'
    });
    showToast('Mensagem apagada com sucesso.', 'Chat Interno', 'info');
    return;
  }

  if (activeContextMsgData.remetente === 'cliente') {
    showToast('Mensagens do cliente não podem ser apagadas.', 'Aviso', 'warning');
    return;
  }
  if (!canReactOrDeleteMsg(activeContextMsgData)) return;

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

  closeFileBankPanel();
  closeQuickRepliesPanel();

  setTimeout(() => {
    dropdown.classList.add('hidden');
    dropdown.classList.remove('animate-popover-out');
  }, 190);
}

// Fechar menus ao clicar fora (fecha os cards juntos)
window.addEventListener('click', (e) => {
  const dropdown = document.getElementById('chat-options-dropdown');
  const filePanel = document.getElementById('file-bank-panel');
  const quickPanel = document.getElementById('quick-replies-panel');
  const btn = document.getElementById('btn-chat-options');

  const clickedInsideMenu = (dropdown && dropdown.contains(e.target)) ||
                            (filePanel && filePanel.contains(e.target)) ||
                            (quickPanel && quickPanel.contains(e.target)) ||
                            (btn && btn.contains(e.target));

  if (!clickedInsideMenu) {
    if (dropdown && !dropdown.classList.contains('hidden')) closeChatOptionsDropdown();
    if (filePanel && !filePanel.classList.contains('hidden')) closeFileBankPanel();
    if (quickPanel && !quickPanel.classList.contains('hidden')) closeQuickRepliesPanel();
  }
});

function selectChatOption(type) {
  if (type === 'quick_reply') {
    // Fecha o painel de arquivos se aberto e abre o painel lateral de respostas rápidas
    closeFileBankPanel();
    openQuickRepliesPanel();
  } else if (type === 'internal_note') {
    // Mantém o menu principal ABERTO ao alternar Nota Interna (igual à Assinatura)
    toggleInternalNoteMode();
  } else if (type === 'file_bank') {
    // Fecha o painel de respostas rápidas se aberto e abre o banco de arquivos
    closeQuickRepliesPanel();
    openFileBankPanel();
  }
}

// ==============================================================================
// ⚡ RESPOSTAS RÁPIDAS (Quick Replies & Favoritas)
// ==============================================================================

const defaultQuickRepliesList = [
  { id: 'qr_1', category: '👋 Atendimento Inicial', text: 'Olá! Seja bem-vindo(a). Como posso ajudar você hoje?', favorite: true },
  { id: 'qr_2', category: '👋 Atendimento Inicial', text: 'Olá! Meu nome é atendente do suporte. Em que posso ser útil?', favorite: true },
  { id: 'qr_3', category: '⏳ Em Análise / Aguarde', text: 'Um momento, por favor. Estou verificando seu cadastro e pedido em nosso sistema.', favorite: true },
  { id: 'qr_4', category: '⏳ Em Análise / Aguarde', text: 'Agradeço a paciência! Já estou finalizando a análise da sua solicitação.', favorite: false },
  { id: 'qr_5', category: '📄 Documentos & Comprovantes', text: 'Por favor, me envie a foto do documento ou comprovante para dar prosseguimento ao atendimento.', favorite: true },
  { id: 'qr_6', category: '📄 Documentos & Comprovantes', text: 'Poderia confirmar o número do seu CPF ou CNPJ cadastrado, por favor?', favorite: false },
  { id: 'qr_7', category: '✅ Finalização', text: 'Atendimento concluído com sucesso. Qualquer nova dúvida, estamos à inteira disposição! Obrigado!', favorite: true },
  { id: 'qr_8', category: '✅ Finalização', text: 'Muito obrigado pelo contato! Tenha um excelente dia.', favorite: false },
  { id: 'qr_9', category: '💳 Financeiro / Cobrança', text: 'Segue o código de barras e o boleto atualizado para pagamento.', favorite: false },
  { id: 'qr_10', category: '💳 Financeiro / Cobrança', text: 'O comprovante de pagamento foi recebido com sucesso e já está sendo processado.', favorite: false }
];

let activeQuickRepliesCategoryFilter = 'ALL';

async function syncQuickRepliesFromBackend() {
  try {
    const userId = (typeof currentOperator !== 'undefined' && currentOperator?.id) ? currentOperator.id : '';
    const sectorId = (typeof currentOperator !== 'undefined' && currentOperator?.sector_id) ? currentOperator.sector_id : '';
    let query = `/api/quick-replies?usuario_id=${userId}`;
    if (sectorId) query += `&setor_id=${sectorId}`;

    const res = await fetch(query);
    if (res.ok) {
      const data = await res.json();
      if (data.quick_replies && data.quick_replies.length > 0) {
        const mapped = data.quick_replies.map(r => ({
          id: String(r.id),
          category: r.grupo || r.categoria || 'Geral',
          text: r.conteudo,
          title: r.titulo,
          shortcut: r.atalho,
          scope: r.escopo || 'global',
          sectors: r.setores || null,
          blocks: r.blocos || [{ id: 'b_' + r.id, tipo: 'texto', texto: r.conteudo }],
          favorite: Boolean(r.favorito)
        }));
        saveStoredQuickReplies(mapped);
      }
    }
  } catch (e) {
    console.warn('Usando respostas rápidas locais:', e);
  }
}

function replaceQuickReplyVariables(text) {
  if (!text) return '';
  const now = new Date();
  const hours = now.getHours();
  let greeting = 'Olá';
  if (hours >= 5 && hours < 12) greeting = 'Bom dia';
  else if (hours >= 12 && hours < 18) greeting = 'Boa tarde';
  else greeting = 'Boa noite';

  const clientName = (typeof selectedChatName !== 'undefined' && selectedChatName) ? selectedChatName : 'Cliente';
  const opName = (typeof currentOperator !== 'undefined' && currentOperator?.name) ? currentOperator.name : 'Atendente';
  const todayStr = now.toLocaleDateString('pt-BR');

  return text
    .replace(/\{cliente_nome\}/gi, clientName)
    .replace(/\{atendente_nome\}/gi, opName)
    .replace(/\{saudacao\}/gi, greeting)
    .replace(/\{data_atual\}/gi, todayStr);
}

function getStoredQuickReplies() {
  try {
    const raw = localStorage.getItem('tf_quick_replies_v1');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Erro ao ler quick replies:', e);
  }
  return defaultQuickRepliesList;
}

function saveStoredQuickReplies(list) {
  try {
    localStorage.setItem('tf_quick_replies_v1', JSON.stringify(list));
  } catch (e) {
    console.error('Erro ao salvar quick replies:', e);
  }
}

function toggleFavoriteQuickReply(id, e) {
  if (e) e.stopPropagation();
  const list = getStoredQuickReplies();
  const item = list.find(r => r.id === id);
  if (item) {
    item.favorite = !item.favorite;
    saveStoredQuickReplies(list);
    renderQuickRepliesFavorites();
    renderQuickRepliesCategoryTabs();
    renderAllQuickRepliesModal(document.getElementById('quick-replies-search-input')?.value || '');
  }
}

function openQuickRepliesPanel() {
  const panel = document.getElementById('quick-replies-panel');
  if (!panel) return;

  // Fecha o banco de arquivos se estiver aberto
  closeFileBankPanel();

  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden', 'animate-popover-out');
    void panel.offsetWidth;
    panel.classList.add('animate-popover-in');
    renderQuickRepliesFavorites();
    syncQuickRepliesFromBackend().then(() => {
      renderQuickRepliesFavorites();
    });
  } else {
    closeQuickRepliesPanel();
  }
}

function closeQuickRepliesPanel() {
  const panel = document.getElementById('quick-replies-panel');
  if (!panel || panel.classList.contains('hidden')) return;

  panel.classList.remove('animate-popover-in');
  panel.classList.add('animate-popover-out');

  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('animate-popover-out');
  }, 190);
}

function renderQuickRepliesFavorites() {
  const container = document.getElementById('quick-replies-favorites-list');
  if (!container) return;

  const list = getStoredQuickReplies();
  const favorites = list.filter(r => r.favorite);

  if (favorites.length === 0) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 12px; text-align:center; color:var(--color-text-muted, #94a3b8); font-size:11px; gap:8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:rgba(245,158,11,0.5);"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <p style="color:var(--color-foreground, #f8fafc); font-weight:600;">Nenhuma resposta favoritada</p>
        <p style="color:var(--color-text-muted, #94a3b8); font-size:10px;">Clique em "Ver Todas as Respostas" para favoritar com ⭐</p>
      </div>
    `;
    return;
  }

  let html = '';
  favorites.forEach((r, idx) => {
    if (idx > 0) {
      html += `<div class="qr-separator"></div>`;
    }
    const isMultiBlock = r.blocks && (r.blocks.length > 1 || r.blocks.some(b => b.tipo === 'arquivo'));
    const stepCount = (r.blocks && r.blocks.length) || 1;

    html += `
      <div onclick="triggerQuickReply('${r.id}')" class="qr-card-item group/qr">
        <div style="display: flex; flex-direction: column; min-width: 0; flex: 1; padding-right: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span class="qr-category-badge">${r.category}</span>
            ${isMultiBlock ? `<span style="font-size:9px; font-weight:800; padding:1px 5px; border-radius:6px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3);">⚡ ${stepCount} passos</span>` : ''}
          </div>
          <span style="font-size: 11.5px; color: var(--color-foreground, #f8fafc); line-height: 1.4; font-weight: 500;" class="group-hover/qr:text-amber-200 line-clamp-2">
            ${r.title ? `<strong>${r.title}:</strong> ` : ''}${r.text}
          </span>
        </div>
        <button type="button" onclick="toggleFavoriteQuickReply('${r.id}', event)" title="Desfavoritar" class="qr-star-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}

function openQuickRepliesModal() {
  closeQuickRepliesPanel();
  closeChatOptionsDropdown();
  const modal = document.getElementById('modal-quick-replies');
  if (!modal) return;

  const searchInput = document.getElementById('quick-replies-search-input');
  if (searchInput) searchInput.value = '';

  activeQuickRepliesCategoryFilter = 'ALL';
  closeQuickReplyEditor();

  modal.classList.remove('hidden');
  void modal.offsetWidth;
  modal.classList.remove('opacity-0');
  const content = modal.querySelector('div');
  if (content) content.classList.remove('scale-95');

  renderQuickRepliesSidebarCategories();
  renderAllQuickRepliesModal();

  syncQuickRepliesFromBackend().then(() => {
    renderQuickRepliesSidebarCategories();
    renderAllQuickRepliesModal(document.getElementById('quick-replies-search-input')?.value || '');
  });
}

function closeQuickRepliesModal() {
  const modal = document.getElementById('modal-quick-replies');
  if (!modal) return;
  modal.classList.add('opacity-0');
  const content = modal.querySelector('div');
  if (content) content.classList.add('scale-95');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 200);
}

function filterQuickRepliesModal(query) {
  renderAllQuickRepliesModal(query);
}

function setQuickRepliesCategoryFilter(category) {
  activeQuickRepliesCategoryFilter = category;
  renderQuickRepliesSidebarCategories();
  renderAllQuickRepliesModal(document.getElementById('quick-replies-search-input')?.value || '');
}

function renderQuickRepliesSidebarCategories() {
  const container = document.getElementById('quick-replies-sidebar-categories');
  const totalBadge = document.getElementById('quick-replies-total-badge');
  const datalist = document.getElementById('quick-reply-category-suggestions');
  if (!container) return;

  const list = getStoredQuickReplies();
  if (totalBadge) totalBadge.textContent = list.length;

  const categories = [...new Set(list.map(r => r.category))];
  const favCount = list.filter(r => r.favorite).length;

  // Atualiza sugestões no datalist do editor
  if (datalist) {
    datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');
  }

  let html = `
    <button type="button" onclick="setQuickRepliesCategoryFilter('ALL')" class="qr-sidebar-nav-item ${activeQuickRepliesCategoryFilter === 'ALL' ? 'active' : ''}">
      <span class="flex items-center gap-2 truncate">
        <span class="text-amber-400">✨</span>
        <span class="truncate">Todas as Respostas</span>
      </span>
      <span class="qr-sidebar-badge">${list.length}</span>
    </button>
    <button type="button" onclick="setQuickRepliesCategoryFilter('FAV')" class="qr-sidebar-nav-item ${activeQuickRepliesCategoryFilter === 'FAV' ? 'active' : ''}">
      <span class="flex items-center gap-2 truncate">
        <span class="text-amber-400">⭐</span>
        <span class="truncate">Favoritas / Fixadas</span>
      </span>
      <span class="qr-sidebar-badge">${favCount}</span>
    </button>
    <div style="height:1px; background:var(--border-color, rgba(255,255,255,0.08)); margin:6px 0;"></div>
  `;

  categories.forEach(cat => {
    const count = list.filter(r => r.category === cat).length;
    const isActive = activeQuickRepliesCategoryFilter === cat;
    html += `
      <button type="button" onclick="setQuickRepliesCategoryFilter('${encodeURIComponent(cat)}')" class="qr-sidebar-nav-item ${isActive ? 'active' : ''}">
        <span class="truncate pr-1">${cat}</span>
        <span class="qr-sidebar-badge">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function openQuickReplyEditor(replyId = null, event = null) {
  if (event) event.stopPropagation();

  const box = document.getElementById('quick-reply-editor-box');
  const titleEl = document.getElementById('quick-reply-editor-title');
  const idInput = document.getElementById('quick-reply-edit-id');
  const catInput = document.getElementById('quick-reply-input-category');
  const textInput = document.getElementById('quick-reply-input-text');
  const favInput = document.getElementById('quick-reply-input-favorite');

  if (!box || !idInput || !catInput || !textInput || !favInput) return;

  if (replyId) {
    const list = getStoredQuickReplies();
    const item = list.find(r => r.id === replyId);
    if (item) {
      if (titleEl) titleEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Editar Resposta Rápida
      `;
      idInput.value = item.id;
      catInput.value = item.category;
      textInput.value = item.text;
      favInput.checked = Boolean(item.favorite);
    }
  } else {
    if (titleEl) titleEl.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nova Resposta Rápida
    `;
    idInput.value = '';
    catInput.value = (activeQuickRepliesCategoryFilter !== 'ALL' && activeQuickRepliesCategoryFilter !== 'FAV') 
      ? decodeURIComponent(activeQuickRepliesCategoryFilter) 
      : '👋 Atendimento Inicial';
    textInput.value = '';
    favInput.checked = false;
  }

  box.classList.remove('hidden');
  textInput.focus();
}

function closeQuickReplyEditor() {
  const box = document.getElementById('quick-reply-editor-box');
  if (box) box.classList.add('hidden');
}

function saveQuickReplyFromEditor() {
  const idInput = document.getElementById('quick-reply-edit-id');
  const catInput = document.getElementById('quick-reply-input-category');
  const textInput = document.getElementById('quick-reply-input-text');
  const favInput = document.getElementById('quick-reply-input-favorite');

  const category = (catInput?.value || '').trim() || 'Geral';
  const text = (textInput?.value || '').trim();
  const favorite = Boolean(favInput?.checked);
  const id = idInput?.value || '';

  if (!text) {
    alert('Por favor, digite o texto da resposta rápida.');
    textInput?.focus();
    return;
  }

  let list = getStoredQuickReplies();

  if (id) {
    // Edição
    const index = list.findIndex(r => r.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], category, text, favorite };
    }
  } else {
    // Criação de nova resposta
    const newId = 'qr_' + Date.now();
    list.unshift({ id: newId, category, text, favorite });
  }

  saveStoredQuickReplies(list);
  closeQuickReplyEditor();
  renderQuickRepliesSidebarCategories();
  renderQuickRepliesFavorites();
  renderAllQuickRepliesModal(document.getElementById('quick-replies-search-input')?.value || '');
}

function deleteQuickReply(replyId, event) {
  if (event) event.stopPropagation();

  if (!confirm('Deseja realmente excluir esta resposta rápida?')) {
    return;
  }

  let list = getStoredQuickReplies();
  list = list.filter(r => r.id !== replyId);

  saveStoredQuickReplies(list);
  renderQuickRepliesSidebarCategories();
  renderQuickRepliesFavorites();
  renderAllQuickRepliesModal(document.getElementById('quick-replies-search-input')?.value || '');
}

function renderAllQuickRepliesModal(searchQuery = '') {
  const container = document.getElementById('quick-replies-modal-list');
  const panelTitle = document.getElementById('quick-replies-panel-title');
  const panelCount = document.getElementById('quick-replies-panel-count');
  if (!container) return;

  const list = getStoredQuickReplies();
  const query = (searchQuery || '').trim().toLowerCase();

  let filtered = list;

  // Filtro por busca de texto ou categoria
  if (query) {
    filtered = filtered.filter(r => r.text.toLowerCase().includes(query) || r.category.toLowerCase().includes(query));
  }

  // Filtro por Aba de Categoria selecionada
  let currentTitle = 'Todas as Respostas';
  if (activeQuickRepliesCategoryFilter === 'FAV') {
    filtered = filtered.filter(r => r.favorite);
    currentTitle = '⭐ Respostas Favoritas';
  } else if (activeQuickRepliesCategoryFilter !== 'ALL') {
    const selectedCat = decodeURIComponent(activeQuickRepliesCategoryFilter);
    filtered = filtered.filter(r => r.category === selectedCat);
    currentTitle = selectedCat;
  }

  if (panelTitle) panelTitle.textContent = query ? `Busca: "${searchQuery}"` : currentTitle;
  if (panelCount) panelCount.textContent = `${filtered.length} modelo${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--color-text-muted, #94a3b8); font-size:12px; gap:10px; text-align:center;">
        <div class="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 text-amber-400/60">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div>
          <p class="font-bold text-slate-200 text-sm">Nenhuma resposta encontrada</p>
          <p class="text-[11px] opacity-70 mt-0.5">Clique no botão "+ Nova Resposta" acima para cadastrar neste grupo.</p>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach((r) => {
    const isFav = r.favorite;
    const isGlobal = r.scope === 'global';

    html += `
      <div onclick="insertQuickReply('${encodeURIComponent(r.text)}', true)"
           class="qr-modal-card group/qr"
           style="
             background-color: var(--color-card, rgba(255,255,255,0.04));
             border: 1px solid var(--border-color, rgba(255,255,255,0.08));
             border-radius: 14px;
             padding: 12px 14px;
             display: flex;
             align-items: flex-start;
             justify-content: space-between;
             gap: 12px;
             cursor: pointer;
           "
      >
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
            ${isGlobal
              ? `<span style="font-size:9px; font-weight:800; text-transform:uppercase; padding:2px 7px; border-radius:999px; background:rgba(139,92,246,0.15); color:#c4b5fd; border:1px solid rgba(139,92,246,0.3);">🌍 Global</span>`
              : `<span style="font-size:9px; font-weight:800; text-transform:uppercase; padding:2px 7px; border-radius:999px; background:rgba(16,185,129,0.15); color:#6ee7b7; border:1px solid rgba(16,185,129,0.3);">👤 Pessoal</span>`
            }
            ${r.shortcut ? `<span style="font-size:10px; font-family:monospace; font-weight:700; color:var(--color-primary-theme, #ef4444); background:rgba(255,255,255,0.08); padding:1px 6px; border-radius:6px;">${r.shortcut}</span>` : ''}
            <span class="qr-category-badge">${r.category}</span>
            ${(r.blocks && (r.blocks.length > 1 || r.blocks.some(b => b.tipo === 'arquivo'))) ? `<span style="font-size:9px; font-weight:800; padding:1px 6px; border-radius:6px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3);">⚡ Sequência (${r.blocks.length} passos)</span>` : ''}
          </div>
          ${r.title ? `<p style="font-size: 12.5px; font-weight: 700; color: var(--color-foreground, #f8fafc); margin-bottom: 2px;">${r.title}</p>` : ''}
          <p style="font-size: 12px; color: var(--color-text-muted, #94a3b8); line-height: 1.45; font-weight: 400;" class="group-hover/qr:text-slate-200">
            ${r.text}
          </p>
        </div>
        
        <!-- Botões de Ação: Editar, Excluir e Favoritar -->
        <div class="flex items-center gap-1.5 shrink-0" onclick="event.stopPropagation()">
          <button type="button" onclick="openQuickReplyEditor('${r.id}', event)" title="Editar resposta" class="qr-action-icon-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button type="button" onclick="deleteQuickReply('${r.id}', event)" title="Excluir resposta" class="qr-action-icon-btn danger">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button type="button" onclick="toggleFavoriteQuickReply('${r.id}', event)" title="${isFav ? 'Remover das favoritas' : 'Adicionar às favoritas'}" class="qr-star-btn ${isFav ? '' : 'qr-star-btn-unfav'}" style="width:26px !important; height:26px !important; margin:0 !important;">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

let activeSequenceQuickReply = null;
let isSendingSequence = false;

function triggerQuickReply(idOrText, isEncoded = false) {
  let allReplies = getStoredQuickReplies();
  let found = allReplies.find(r => r.id === String(idOrText));
  
  if (!found && typeof idOrText === 'string') {
    const raw = isEncoded ? decodeURIComponent(idOrText) : idOrText;
    found = allReplies.find(r => r.text === raw || r.shortcut === raw);
  }

  if (found && found.blocks && (found.blocks.length > 1 || found.blocks.some(b => b.tipo === 'arquivo'))) {
    openQuickReplySequenceModal(found);
    return;
  }

  const textToInsert = found ? found.text : (isEncoded ? decodeURIComponent(idOrText) : idOrText);
  insertQuickReply(textToInsert, false);
}

function openQuickReplySequenceModal(qr) {
  activeSequenceQuickReply = qr;
  closeQuickRepliesModal();
  closeQuickRepliesPanel();
  closeChatOptionsDropdown();

  const modal = document.getElementById('modal-qr-sequence');
  if (!modal) return;

  const titleEl = document.getElementById('qr-sequence-modal-title');
  const countEl = document.getElementById('qr-sequence-modal-count');
  const listEl = document.getElementById('qr-sequence-modal-steps');
  const btnSend = document.getElementById('btn-qr-sequence-send');
  const progressEl = document.getElementById('qr-sequence-progress');

  if (titleEl) titleEl.textContent = qr.title || qr.text;
  if (countEl) countEl.textContent = `${(qr.blocks || []).length} passos`;
  if (progressEl) progressEl.classList.add('hidden');
  if (btnSend) {
    btnSend.disabled = false;
    btnSend.innerHTML = `<span>🚀 Enviar Sequência Completa</span>`;
  }

  if (listEl) {
    let stepsHtml = '';
    (qr.blocks || []).forEach((block, idx) => {
      if (block.tipo === 'texto') {
        const previewText = replaceQuickReplyVariables(block.texto);
        stepsHtml += `
          <div class="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-1.5">
            <div class="flex items-center justify-between text-[10px]">
              <span class="font-mono font-bold text-amber-400">Passo #${idx + 1} • 📝 Mensagem de Texto</span>
            </div>
            <p class="text-xs text-white/90 whitespace-pre-wrap leading-relaxed">${previewText}</p>
          </div>
        `;
      } else if (block.tipo === 'arquivo') {
        const captionPreview = replaceQuickReplyVariables(block.legenda || '');
        stepsHtml += `
          <div class="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-2">
            <div class="flex items-center justify-between text-[10px]">
              <span class="font-mono font-bold text-purple-400">Passo #${idx + 1} • 📎 Arquivo Anexo</span>
            </div>
            <div class="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
              <div class="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-xs uppercase">
                ${block.ext || 'DOC'}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-white truncate">${block.titulo || block.filename}</p>
                <p class="text-[10px] text-slate-400 font-mono">${block.filename} ${block.size_formatted ? `• ${block.size_formatted}` : ''}</p>
              </div>
            </div>
            ${captionPreview ? `<p class="text-[11px] text-slate-300 italic pl-1">Legenda: "${captionPreview}"</p>` : ''}
          </div>
        `;
      }
    });
    listEl.innerHTML = stepsHtml;
  }

  modal.classList.remove('hidden');
  void modal.offsetWidth;
  modal.classList.remove('opacity-0');
}

function closeQuickReplySequenceModal() {
  const modal = document.getElementById('modal-qr-sequence');
  if (!modal) return;
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
    activeSequenceQuickReply = null;
  }, 200);
}

async function executeQuickReplySequence() {
  if (!activeSequenceQuickReply || isSendingSequence) return;
  if (!selectedChatJid) {
    alert('Nenhuma conversa selecionada no chat.');
    return;
  }

  const blocks = activeSequenceQuickReply.blocks || [];
  if (blocks.length === 0) return;

  isSendingSequence = true;
  const btnSend = document.getElementById('btn-qr-sequence-send');
  const progressEl = document.getElementById('qr-sequence-progress');
  const progressBar = document.getElementById('qr-sequence-progress-bar');
  const progressText = document.getElementById('qr-sequence-progress-text');

  if (btnSend) btnSend.disabled = true;
  if (progressEl) progressEl.classList.remove('hidden');

  try {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const stepNum = i + 1;

      if (progressText) progressText.textContent = `Enviando passo ${stepNum} de ${blocks.length}...`;
      if (progressBar) progressBar.style.width = `${Math.round((stepNum / blocks.length) * 100)}%`;

      if (block.tipo === 'texto') {
        const textToSend = replaceQuickReplyVariables(block.texto);
        if (textToSend.trim()) {
          socket.emit('send_message', {
            cliente_jid: selectedChatJid,
            texto: textToSend,
            atendente_id: currentOperator ? currentOperator.id : 'atendente_1',
            atendente_nome: currentOperator ? currentOperator.name : 'Atendente',
            send_signature: true
          });
        }
      } else if (block.tipo === 'arquivo') {
        const captionToSend = replaceQuickReplyVariables(block.legenda || '');
        socket.emit('send_message', {
          cliente_jid: selectedChatJid,
          texto: captionToSend,
          atendente_id: currentOperator ? currentOperator.id : 'atendente_1',
          atendente_nome: currentOperator ? currentOperator.name : 'Atendente',
          send_signature: true,
          attachments: [{
            url: block.url,
            filename: block.filename,
            mimetype: block.mimetype,
            caption: captionToSend
          }]
        });
      }

      // Intervalo seguro anti-bloqueio entre mensagens da sequência (900ms a 1300ms)
      if (i < blocks.length - 1) {
        const jitter = 900 + Math.floor(Math.random() * 400);
        await new Promise(r => setTimeout(r, jitter));
      }
    }

    if (progressText) progressText.textContent = `✅ Sequência enviada com sucesso!`;
    setTimeout(() => {
      closeQuickReplySequenceModal();
      isSendingSequence = false;
    }, 600);
  } catch (err) {
    console.error('Erro no envio da sequência:', err);
    alert('Erro ao enviar parte da sequência.');
    isSendingSequence = false;
    if (btnSend) btnSend.disabled = false;
  }
}

function insertQuickReply(encodedOrRawText, isEncoded = false) {
  let raw = isEncoded ? decodeURIComponent(encodedOrRawText) : encodedOrRawText;
  const processed = replaceQuickReplyVariables(raw);

  closeQuickRepliesModal();
  closeQuickRepliesPanel();
  closeChatOptionsDropdown();

  if (!chatInput) return;

  chatInput.value = processed;
  adjustChatInputHeight();
  chatInput.focus();
}

// ==============================================================================
// 📁 BANCO DE ARQUIVOS (PREMIUM CONTROLLER & UI)
// ==============================================================================

let fileBankFilter = 'all'; // 'all' | 'current' (painel lateral)
let fileBankModalType = 'all';
let fileBankScope = 'all'; // 'all' | 'chat'
let fileBankViewMode = 'grid'; // 'grid' | 'list'
let fileBankModalPage = 1;
let fileBankSearchTimer = null;
let fileBankCachedData = null;

// Helpers de metadados e categorização visual de arquivos
function getFileTypeInfo(ext) {
  ext = (ext || '').toLowerCase();
  const images = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const videos = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  const audios = ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'];

  if (images.includes(ext)) {
    return { type: 'image', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.3)', badgeBg: 'rgba(2,132,199,0.3)', label: 'Imagem', emoji: '🖼️' };
  }
  if (videos.includes(ext)) {
    return { type: 'video', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', badgeBg: 'rgba(124,58,237,0.3)', label: 'Vídeo', emoji: '🎬' };
  }
  if (audios.includes(ext)) {
    return { type: 'audio', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', badgeBg: 'rgba(5,150,105,0.3)', label: 'Áudio', emoji: '🎵' };
  }
  if (ext === 'pdf') {
    return { type: 'doc', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', badgeBg: 'rgba(220,38,38,0.3)', label: 'PDF', emoji: '📕' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { type: 'doc', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)', badgeBg: 'rgba(22,163,74,0.3)', label: 'Planilha', emoji: '📊' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { type: 'doc', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)', badgeBg: 'rgba(37,99,235,0.3)', label: 'Documento', emoji: '📝' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { type: 'doc', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)', badgeBg: 'rgba(234,88,12,0.3)', label: 'Compactado', emoji: '🗜️' };
  }
  return { type: 'other', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', badgeBg: 'rgba(71,85,105,0.3)', label: 'Arquivo', emoji: '📄' };
}

function formatFileDisplayName(filename, caption) {
  if (caption && caption.trim()) return caption.trim();
  if (!filename) return 'Arquivo sem nome';
  let clean = filename.replace(/^media-\d+-\d+\./, 'Arquivo.');
  return clean;
}

function formatFileTimestamp(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `Hoje às ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dateStr} • ${timeStr}`;
}

// Renderiza o card de arquivo (Mosaico, Lista ou Compacto da Sidebar)
function renderFileBankCard(file, compact = false, mode = 'grid') {
  const info = getFileTypeInfo(file.ext);
  const displayName = file.titulo || formatFileDisplayName(file.filename, file.caption);
  const dateFormatted = formatFileTimestamp(file.timestamp || file.created_at);
  const isImage = info.type === 'image';
  const isVideo = info.type === 'video';
  const isAudio = info.type === 'audio';

  const isClient = file.remetente === 'cliente';
  const senderLabel = isClient ? (file.cliente_nome || 'Cliente') : (file.atendente_nome ? `${file.atendente_nome}` : 'Atendente');
  const senderIcon = isClient
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-sky-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-amber-400"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

  // 1. MODO COMPACTO (Painel Lateral de Recentes)
  if (compact) {
    return `
      <div class="file-bank-card flex items-center gap-3 p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-all cursor-pointer group" onclick="fileBankSendFile('${file.url}', '${file.filename}')" title="Clique para anexar no chat">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden relative" style="background:${info.bg};border:1px solid ${info.border};">
          ${isImage
            ? `<img src="${file.url}" class="w-full h-full object-cover rounded-xl" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" alt="Preview"><div class="hidden w-full h-full items-center justify-center text-lg">${info.emoji}</div>`
            : `<span class="text-xl">${info.emoji}</span>`
          }
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">${displayName}</p>
          <div class="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
            <span class="file-bank-ext-badge" style="background:${info.badgeBg};color:${info.color};">${file.ext.toUpperCase()}</span>
            <span>•</span>
            <span class="truncate">${dateFormatted}</span>
          </div>
        </div>
        <button onclick="event.stopPropagation();fileBankOpenFile('${file.url}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all shrink-0 cursor-pointer" title="Abrir Arquivo">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>`;
  }

  // 2. MODO LISTA (Tabela Detalhada no Modal)
  if (mode === 'list') {
    return `
      <div class="file-bank-list-row file-card-animate group" onclick="fileBankSendFile('${file.url}', '${file.filename}')" title="Clique para anexar no atendimento">
        <!-- Ícone / Thumbnail -->
        <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden relative" style="background:${info.bg};border:1px solid ${info.border};">
          ${isImage
            ? `<img src="${file.url}" class="w-full h-full object-cover rounded-xl" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" alt="Preview"><div class="hidden w-full h-full items-center justify-center text-xl">${info.emoji}</div>`
            : isVideo
              ? `<div class="flex flex-col items-center justify-center gap-0.5"><span class="text-lg">🎬</span></div>`
              : `<span class="text-2xl">${info.emoji}</span>`
          }
        </div>

        <!-- Nome e Detalhes -->
        <div class="flex-1 min-w-0 flex flex-col justify-center">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-100 group-hover:text-white truncate transition-colors">${displayName}</span>
            <span class="file-bank-ext-badge shrink-0" style="background:${info.badgeBg};color:${info.color};border:1px solid ${info.border};">${file.ext}</span>
            ${file.size_formatted ? `<span class="text-[10px] font-mono text-slate-400 shrink-0">(${file.size_formatted})</span>` : ''}
          </div>
          <div class="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
            <span class="flex items-center gap-1.5 opacity-90 truncate max-w-[200px]">
              ${senderIcon}
              <span class="truncate">${senderLabel}</span>
            </span>
            <span>•</span>
            <span class="font-mono text-[10px] text-slate-500">${dateFormatted}</span>
          </div>
        </div>

        <!-- Ações Rápidas -->
        <div class="flex items-center gap-1.5 list-hover-actions shrink-0" onclick="event.stopPropagation()">
          <button onclick="fileBankOpenFile('${file.url}')" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer" title="Visualizar / Abrir em nova aba">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Ver</span>
          </button>
          <button onclick="fileBankSendFile('${file.url}', '${file.filename}')" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-sm btn-accent-theme" title="Inserir no campo de resposta">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span>Usar</span>
          </button>
          <button onclick="fileBankCopyLink('${file.url}')" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer" title="Copiar Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // 3. MODO MOSAICO (Grid Cards no Modal)
  return `
    <div class="file-bank-card file-card-animate group" onclick="fileBankSendFile('${file.url}', '${file.filename}')" title="Clique para anexar no atendimento">
      <!-- Área Visual da Mídia / Thumbnail -->
      <div class="relative w-full aspect-[4/3] flex items-center justify-center overflow-hidden" style="background:${info.bg};">
        ${isImage
          ? `<img src="${file.url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" alt="Preview">
             <div class="hidden w-full h-full items-center justify-center text-4xl">${info.emoji}</div>`
          : isVideo
            ? `<div class="w-full h-full flex flex-col items-center justify-center gap-1.5 transition-transform duration-300 group-hover:scale-110">
                 <div class="w-12 h-12 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-purple-300 shadow-xl backdrop-blur-sm">
                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                 </div>
               </div>`
            : isAudio
              ? `<div class="w-full h-full flex flex-col items-center justify-center gap-1.5 transition-transform duration-300 group-hover:scale-110">
                   <div class="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl backdrop-blur-sm">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                   </div>
                 </div>`
              : `<div class="w-full h-full flex items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-110">${info.emoji}</div>`
        }

        <!-- Top Badges: Extensão + Tamanho -->
        <div class="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <span class="file-bank-ext-badge shadow-md backdrop-blur-md" style="background:${info.badgeBg};color:${info.color};border:1px solid ${info.border};">${file.ext}</span>
          ${file.size_formatted ? `<span class="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-black/60 text-slate-300 border border-white/10 shadow-md backdrop-blur-md">${file.size_formatted}</span>` : ''}
        </div>

        <!-- Ações no Hover sobre o Thumbnail -->
        <div class="absolute inset-0 bg-black/75 backdrop-blur-[3px] flex items-center justify-center gap-2 card-hover-actions p-3" onclick="event.stopPropagation()">
          <button onclick="fileBankOpenFile('${file.url}')" class="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-lg" title="Visualizar Mídia">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button onclick="fileBankSendFile('${file.url}', '${file.filename}')" class="px-3.5 h-9 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg btn-accent-theme" title="Anexar ao chat">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            <span>Usar</span>
          </button>
          <button onclick="fileBankCopyLink('${file.url}')" class="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer shadow-lg" title="Copiar Link">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
      </div>

      <!-- Rodapé do Card -->
      <div class="p-3 flex flex-col gap-1.5 border-t border-white/5" style="background: color-mix(in srgb, var(--color-background, #000) 65%, transparent);">
        <p class="text-xs font-bold truncate transition-colors" style="color: var(--color-foreground, #ffffff);" title="${displayName}">${displayName}</p>
        <div class="flex items-center justify-between text-[10px] pt-0.5" style="color: var(--color-text-muted, #94a3b8);">
          <span class="flex items-center gap-1 opacity-90 truncate max-w-[120px]">
            ${senderIcon}
            <span class="truncate">${senderLabel}</span>
          </span>
          <span class="font-mono text-[9px] opacity-75 shrink-0">${dateFormatted}</span>
        </div>
      </div>
    </div>
  `;
}

// Abre o arquivo em nova aba
function fileBankOpenFile(url) {
  if (!url) return;
  window.open(url, '_blank');
}

// Copia o link do arquivo com toast
function fileBankCopyLink(url) {
  if (!url) return;
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showToast('Link do arquivo copiado para a área de transferência!', 'Link Copiado', 'success');
  }).catch(() => {
    showToast(fullUrl, 'Link do Arquivo', 'info');
  });
}

// Insere o arquivo no chat ativo
function fileBankSendFile(url, filename) {
  closeFileBankPanel();
  closeFileBankModal();

  if (chatInput) {
    chatInput.value = url;
    adjustChatInputHeight();
    chatInput.focus();
    showToast(`Arquivo inserido na caixa de texto. Pressione Enter para enviar.`, 'Anexo Pronto', 'success');
  }
}

// ----------------- PAINEL LATERAL DE RECENTES -----------------

function openFileBankPanel() {
  const panel = document.getElementById('file-bank-panel');
  if (!panel) return;

  closeQuickRepliesPanel();

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
  grid.innerHTML = '<div class="flex items-center justify-center py-6"><div class="animate-spin w-5 h-5 border-2 rounded-full" style="border-color:color-mix(in srgb,var(--color-primary-theme,#6366f1) 30%,transparent);border-top-color:var(--color-primary-theme,#6366f1);"></div></div>';

  let url = '/api/files/recent?limit=8';
  if (fileBankFilter === 'current' && selectedChatJid) {
    url += `&cliente_jid=${encodeURIComponent(selectedChatJid)}`;
  }

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const files = data.files || [];
      if (files.length === 0) {
        grid.innerHTML = `
          <div class="flex flex-col items-center justify-center py-8 text-slate-500 text-xs gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-40"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <p>Nenhum arquivo recente</p>
          </div>`;
        return;
      }
      grid.innerHTML = files.map(f => renderFileBankCard(f, true)).join('');
    })
    .catch(() => {
      grid.innerHTML = '<div class="text-center text-xs text-red-400 py-4">Erro ao carregar arquivos.</div>';
    });
}

// ----------------- MODAL DE BUSCA COMPLETA -----------------

function openFileBankModal() {
  closeFileBankPanel();
  const modal = document.getElementById('modal-file-bank');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Resetar estado
  fileBankModalType = 'all';
  fileBankScope = 'all';
  fileBankModalPage = 1;

  const input = document.getElementById('file-bank-search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('file-bank-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');

  updateFileBankScopeUI();
  updateFileBankTypeUI();
  updateFileBankViewModeUI();

  loadFileBankModal();
}

function closeFileBankModal() {
  const modal = document.getElementById('modal-file-bank');
  if (modal) modal.classList.add('hidden');
}

function closeFileBankModalOnBackdrop(e) {
  if (e.target.id === 'modal-file-bank' || e.target.classList.contains('modal-backdrop-theme')) {
    closeFileBankModal();
  }
}

function setFileBankViewMode(mode) {
  fileBankViewMode = mode;
  updateFileBankViewModeUI();
  if (fileBankCachedData) {
    renderFileBankCachedResults();
  } else {
    loadFileBankModal();
  }
}

function updateFileBankViewModeUI() {
  const gridBtn = document.getElementById('file-bank-view-grid-btn');
  const listBtn = document.getElementById('file-bank-view-list-btn');

  if (gridBtn && listBtn) {
    if (fileBankViewMode === 'grid') {
      gridBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-white/15 text-white cursor-pointer';
      listBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer';
    } else {
      listBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-white/15 text-white cursor-pointer';
      gridBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer';
    }
  }
}

function setFileBankScope(scope) {
  fileBankScope = scope;
  fileBankModalPage = 1;
  updateFileBankScopeUI();
  loadFileBankModal();
}

function updateFileBankScopeUI() {
  const allBtn = document.getElementById('file-bank-scope-all');
  const chatBtn = document.getElementById('file-bank-scope-chat');

  if (allBtn && chatBtn) {
    if (fileBankScope === 'all') {
      allBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white/15 text-white cursor-pointer';
      chatBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
    } else {
      chatBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white/15 text-white cursor-pointer';
      allBtn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer';
    }
  }

  const subtitle = document.getElementById('file-bank-header-subtitle');
  if (subtitle) {
    if (fileBankScope === 'chat' && selectedChatName) {
      subtitle.textContent = `Arquivos trocados com ${selectedChatName}`;
    } else {
      subtitle.textContent = `Explore, visualize e reutilize mídias enviadas e recebidas nos atendimentos`;
    }
  }
}

function setFileBankTypeFilter(type) {
  fileBankModalType = type;
  fileBankModalPage = 1;
  updateFileBankTypeUI();
  loadFileBankModal();
}

function updateFileBankTypeUI() {
  document.querySelectorAll('.file-bank-type-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.file-bank-type-btn[data-type="${fileBankModalType}"]`);
  if (btn) btn.classList.add('active');
}

function onFileBankSearch() {
  clearTimeout(fileBankSearchTimer);
  const input = document.getElementById('file-bank-search-input');
  const clearBtn = document.getElementById('file-bank-search-clear');
  if (clearBtn) {
    if (input && input.value.trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }

  fileBankModalPage = 1;
  fileBankSearchTimer = setTimeout(() => loadFileBankModal(), 300);
}

function clearFileBankSearch() {
  const input = document.getElementById('file-bank-search-input');
  const clearBtn = document.getElementById('file-bank-search-clear');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  fileBankModalPage = 1;
  loadFileBankModal();
}

function fileBankChangePage(delta) {
  fileBankModalPage = Math.max(1, fileBankModalPage + delta);
  loadFileBankModal();
}

function fileBankGoToPage(p) {
  fileBankModalPage = p;
  loadFileBankModal();
}

function renderFileBankCachedResults() {
  if (!fileBankCachedData) return;
  const { files, total, totalPages } = fileBankCachedData;
  const grid = document.getElementById('file-bank-modal-grid');
  if (!grid) return;

  if (files.length === 0) {
    grid.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-center animate-in fade-in" style="color: var(--color-text-muted, #94a3b8);">
        <div class="w-16 h-16 rounded-3xl flex items-center justify-center shadow-inner" style="background: color-mix(in srgb, var(--color-background, #000) 50%, transparent); border: 1px solid var(--border-color, rgba(255,255,255,0.1)); color: var(--color-text-muted, #94a3b8);">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div class="space-y-1">
          <p class="text-sm font-bold" style="color: var(--color-foreground, #ffffff);">Nenhum arquivo encontrado</p>
          <p class="text-xs max-w-xs leading-relaxed" style="color: var(--color-text-muted, #94a3b8);">Não encontramos arquivos com os filtros e termos pesquisados.</p>
        </div>
      </div>`;
    return;
  }

  if (fileBankViewMode === 'list') {
    grid.innerHTML = `<div class="flex flex-col gap-2">${files.map(f => renderFileBankCard(f, false, 'list')).join('')}</div>`;
  } else {
    grid.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">${files.map(f => renderFileBankCard(f, false, 'grid')).join('')}</div>`;
  }
}

function loadFileBankModal() {
  const grid = document.getElementById('file-bank-modal-grid');
  const badgeTotal = document.getElementById('file-bank-header-badge');
  const pagination = document.getElementById('file-bank-pagination');
  const pageInfo = document.getElementById('file-bank-page-info');
  const prevBtn = document.getElementById('file-bank-prev');
  const nextBtn = document.getElementById('file-bank-next');
  const pageNumbers = document.getElementById('file-bank-page-numbers');

  if (!grid) return;

  grid.innerHTML = `
    <div class="flex flex-col items-center justify-center h-64 gap-3">
      <div class="animate-spin w-8 h-8 border-3 rounded-full" style="border-color:color-mix(in srgb,var(--color-primary-theme,#6366f1) 25%,transparent);border-top-color:var(--color-primary-theme,#6366f1);"></div>
      <span class="text-xs text-slate-400 font-medium tracking-wide animate-pulse">Carregando mídias do banco de dados...</span>
    </div>`;

  const q = document.getElementById('file-bank-search-input')?.value || '';
  const params = new URLSearchParams({
    q,
    type: fileBankModalType,
    page: fileBankModalPage,
    limit: 20
  });

  if (typeof currentOperator !== 'undefined' && currentOperator?.sector_id) {
    params.append('setor_id', currentOperator.sector_id);
  }

  if (fileBankScope === 'chat' && selectedChatJid) {
    params.append('cliente_jid', selectedChatJid);
  }

  fetch(`/api/files/search?${params}`)
    .then(r => r.json())
    .then(data => {
      const files = data.files || [];
      const totalCount = data.total || 0;
      const counts = data.counts || {};
      const totalPages = Math.max(1, Math.ceil(totalCount / 20));

      fileBankCachedData = { files, total: totalCount, totalPages };

      // Atualiza contadores nas abas
      if (counts.all !== undefined) {
        const cAll = document.getElementById('file-bank-count-all');
        const cImg = document.getElementById('file-bank-count-image');
        const cVid = document.getElementById('file-bank-count-video');
        const cAud = document.getElementById('file-bank-count-audio');
        const cDoc = document.getElementById('file-bank-count-doc');

        if (cAll) cAll.textContent = counts.all || 0;
        if (cImg) cImg.textContent = counts.image || 0;
        if (cVid) cVid.textContent = counts.video || 0;
        if (cAud) cAud.textContent = counts.audio || 0;
        if (cDoc) cDoc.textContent = counts.doc || 0;
      }

      if (badgeTotal) {
        badgeTotal.textContent = `${totalCount} arquivo${totalCount !== 1 ? 's' : ''}`;
      }

      // Renderiza os resultados
      renderFileBankCachedResults();

      // Paginação
      if (totalCount > 0) {
        if (pagination) pagination.classList.remove('hidden');
        const startItem = (fileBankModalPage - 1) * 20 + 1;
        const endItem = Math.min(fileBankModalPage * 20, totalCount);

        if (pageInfo) {
          pageInfo.innerHTML = `Mostrando <strong class="text-white">${startItem}–${endItem}</strong> de <strong class="text-white">${totalCount}</strong> arquivos`;
        }

        if (prevBtn) prevBtn.disabled = fileBankModalPage <= 1;
        if (nextBtn) nextBtn.disabled = fileBankModalPage >= totalPages;

        if (pageNumbers) {
          let pagesHtml = '';
          const maxVisiblePages = 5;
          let startPage = Math.max(1, fileBankModalPage - 2);
          let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

          if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
          }

          for (let p = startPage; p <= endPage; p++) {
            const isCurr = p === fileBankModalPage;
            pagesHtml += `
              <button onclick="fileBankGoToPage(${p})" class="w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${isCurr ? 'bg-white/20 text-white border border-white/20 shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}">
                ${p}
              </button>
            `;
          }
          pageNumbers.innerHTML = pagesHtml;
        }
      } else {
        if (pagination) pagination.classList.add('hidden');
      }
    })
    .catch(() => {
      grid.innerHTML = `
        <div class="flex flex-col items-center justify-center h-48 text-red-400 text-xs gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>Erro ao carregar arquivos do banco de dados.</p>
        </div>`;
    });
}

// Fechar modal com tecla ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-file-bank');
    if (modal && !modal.classList.contains('hidden')) {
      closeFileBankModal();
    }
  }
});


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
      statusIndicator.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-400/30 border border-purple-300/60 flex items-center gap-1.5 transition-all shadow-sm shrink-0 whitespace-nowrap';
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
      statusIndicator.className = 'px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap';
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

// 🎛️ CONTROLE DE OPÇÃO: ASSINATURA DE ATENDENTE
function updateSignatureOptionUI() {
  const indicator = document.getElementById('signature-status-indicator');
  const icon = document.getElementById('icon-signature-option');
  const label = document.getElementById('label-signature-option');
  const btn = document.getElementById('btn-signature-option');
  if (!indicator) return;

  if (isSignatureToClientEnabled) {
    indicator.className = 'px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 transition-all shadow-sm shrink-0 whitespace-nowrap';
    indicator.style.cssText = 'color: #6ee7b7 !important;';
    indicator.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span><span style="color:#6ee7b7 !important; font-weight: 700;">Ativo</span>';

    if (icon) icon.setAttribute('style',
      'width:2rem;height:2rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.25s;' +
      'background-color:rgba(16,185,129,0.2) !important;' +
      'border:1px solid rgba(16,185,129,0.55) !important;' +
      'color:rgb(52,211,153) !important;' +
      'box-shadow:0 0 12px rgba(16,185,129,0.28) !important;'
    );
    if (label) label.style.cssText = 'font-weight:700;font-size:0.75rem;color:rgb(52,211,153);';
    if (btn) btn.style.borderColor = 'rgba(16,185,129,0.35)';
  } else {
    indicator.className = 'px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap';
    indicator.style.cssText = '';
    indicator.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>Inativo</span>';

    if (icon) icon.setAttribute('style',
      'width:2rem;height:2rem;border-radius:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.25s;' +
      'background-color:rgba(100,116,139,0.1) !important;' +
      'border:1px solid rgba(100,116,139,0.3) !important;' +
      'color:rgb(148,163,184) !important;' +
      'box-shadow:none !important;'
    );
    if (label) label.style.cssText = 'font-weight:700;font-size:0.75rem;color:rgb(148,163,184);';
    if (btn) btn.style.borderColor = '';
  }
}


function toggleSignatureOption() {
  isSignatureToClientEnabled = !isSignatureToClientEnabled;
  localStorage.setItem('tf_signature_to_client', isSignatureToClientEnabled);
  updateSignatureOptionUI();
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
    atendente_id: currentOperator ? currentOperator.id : 'sistema',
    atendente_nome: currentOperator ? (currentOperator.name || currentOperator.id) : 'sistema',
    send_signature: isSignatureToClientEnabled,
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

// 🔔 Som 1: Notificação de Nova Mensagem na CONVERSA ABERTA (Arpejo cristalino ascendente - 3 notas suaves)
function playCurrentChatNewMessageSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Notas de cristal harmônico (A5 880Hz -> D6 1174.66Hz -> F#6 1480Hz)
    const notes = [880, 1174.66, 1479.98];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + (idx * 0.045);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Ataque suave e decaimento exponencial
      gain.gain.setValueAtTime(0.14, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.16);
    });
  } catch (e) {
    // Ignorar se o áudio estiver desativado pelo navegador
  }
}

// 📬 Som 2: Notificação de Nova Mensagem em OUTRA CONVERSA da lista ativa (Tom duplo quente e ressonante de marimba)
function playBackgroundChatNewMessageSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Acorde duplo grave/médio quente (A4 440Hz com C#5 554Hz -> E5 659Hz com A5 880Hz)
    const chords = [
      { primary: 440, harmonic: 554.37, time: 0 },
      { primary: 659.25, harmonic: 880, time: 0.085 }
    ];

    chords.forEach(({ primary, harmonic, time }) => {
      const startTime = ctx.currentTime + time;

      // Oscilador principal
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(primary, startTime);
      gain1.gain.setValueAtTime(0.16, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.22);

      // Oscilador harmônico (calor sonoro de marimba)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(harmonic, startTime);
      gain2.gain.setValueAtTime(0.08, startTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime);
      osc2.stop(startTime + 0.18);
    });
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
      atendente_id: currentOperator ? currentOperator.id : 'sistema',
      atendente_nome: currentOperator ? (currentOperator.name || currentOperator.id) : 'sistema',
      send_signature: isSignatureToClientEnabled
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
        atendente_id: currentOperator ? currentOperator.id : 'sistema',
        atendente_nome: currentOperator ? (currentOperator.name || currentOperator.id) : 'sistema',
        send_signature: isSignatureToClientEnabled
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

// Listener de marcação de mensagem apagada no SQLite (Transição fluida sem piscar)
socket.on('message_deleted', ({ message_id, cliente_jid, apagado, apagado_por }) => {
  const targetId = Number(message_id) || message_id;
  const msgObj = currentChatMessages.find(m => m.id === targetId || String(m.id) === String(targetId));
  if (msgObj) {
    msgObj.apagado = 1;
    msgObj.apagado_por = apagado_por || 'atendente';
  }

  if (!cliente_jid || selectedChatJid === cliente_jid) {
    const msgDiv = document.querySelector(`[data-message-id="${targetId}"]`);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.msg-bubble');
      if (bubble) {
        // Transição suave da bolha
        bubble.classList.add('opacity-60', 'italic', 'border', 'border-dashed', 'border-rose-500/35', 'shadow-none', 'transition-all', 'duration-300');
        
        // Insere o aviso informativo com animação sem recriar o restante da bolha
        if (!bubble.querySelector('.msg-deleted-notice')) {
          const whoDeleted = (apagado_por || (msgObj ? msgObj.apagado_por : 'atendente')) === 'cliente' ? 'pelo cliente' : 'pelo atendente';
          const noticeDiv = document.createElement('div');
          noticeDiv.className = 'msg-deleted-notice msg-deleted-notice-enter flex items-center gap-1.5 text-[10px] font-bold text-rose-400 opacity-90 pb-1 mb-1 border-b border-rose-500/20 select-none not-italic';
          noticeDiv.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            <span>Esta mensagem foi apagada ${whoDeleted}</span>
          `;
          
          const header = bubble.querySelector('.border-b');
          if (header && !header.classList.contains('msg-deleted-notice')) {
            header.insertAdjacentElement('afterend', noticeDiv);
          } else {
            bubble.insertAdjacentElement('afterbegin', noticeDiv);
          }
        }
      } else if (msgObj) {
        const newMsgEl = createMessageElement(msgObj);
        msgDiv.replaceWith(newMsgEl);
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
  
  const msgMenu = document.getElementById('message-context-menu');
  const chatMenu = document.getElementById('chat-context-menu');
  if (msgMenu) {
    msgMenu.addEventListener('click', (e) => e.stopPropagation());
  }
  if (chatMenu) {
    chatMenu.addEventListener('click', (e) => e.stopPropagation());
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
    if (activeBtn) updateTabIndicator(activeBtn);
    
    const activeFilterBtn = activeFilterType === 'all' ? btnActiveFilterAll : (activeFilterType === 'unread' ? btnActiveFilterUnread : (activeFilterType === 'groups' ? btnActiveFilterGroups : null));
    if (activeFilterBtn) updateActiveFilterIndicator(activeFilterBtn);
  });

  updateSignatureOptionUI();
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

// ==============================================================================
// 👥 CHAT INTERNO DA EQUIPE - LÓGICA COMPLETA, CANAIS E CONVERSAS 1x1
// ==============================================================================

let internalRoomsList = [];
let internalOperatorsList = [];
let currentInternalRoomId = 'channel-geral';
let internalMessagesMap = {}; // roomId -> Array de msgs
let internalRoomUnreads = {};  // roomId -> number
let isInternalDrawerOpen = false;
let internalAudioRecorder = null;
let internalAudioChunks = [];
let internalSelectedFile = null;
let internalChatToShare = null;
let internalDirectoryActiveTab = 'dms'; // 'dms', 'channels' ou 'groups'
let internalDmsSubTab = 'active'; // 'active' (Conversas Abertas) ou 'all' (Outros Colegas A-Z)
let internalRecentMessagesMap = {}; // sala_id -> última mensagem
let internalClosedDMsMap = {}; // sala_id -> timestamp de fechamento
let currentUserManualStatus = localStorage.getItem('tf_operator_manual_status') || 'auto';

// Encerrar conversa particular (move de volta para Outros Colegas sem apagar mensagens)
function closeInternalDMById(dmRoomId, operatorName) {
  if (!currentOperator || !currentOperator.id) return;
  const now = new Date().toISOString();
  socket.emit('internal_close_dm', {
    atendente_id: currentOperator.id,
    sala_id: dmRoomId
  });
  internalClosedDMsMap[dmRoomId] = now;
  showInputBarNotification(`Conversa com ${operatorName || 'colega'} encerrada. O histórico continua salvo!`);
  if (currentInternalRoomId === dmRoomId) {
    showInternalDirectoryView();
  }
  renderInternalDMsList();
}

function closeCurrentInternalDM() {
  if (!currentInternalRoomId || !currentInternalRoomId.startsWith('dm_')) return;
  const titleEl = document.getElementById('internal-drawer-title');
  const opName = titleEl ? titleEl.textContent : 'Colega';
  closeInternalDMById(currentInternalRoomId, opName);
}

// Alterna entre as sub-abas de Particulares (Conversas Abertas vs Outros Colegas A-Z)
function switchInternalDmsSubTab(subTab) {
  internalDmsSubTab = subTab;

  const btnActive = document.getElementById('subtab-btn-dms-active');
  const btnAll = document.getElementById('subtab-btn-dms-all');
  const pill = document.getElementById('internal-dms-subtab-pill');

  const activeClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-active';
  const inactiveClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-inactive';

  if (btnActive) btnActive.className = subTab === 'active' ? activeClass : inactiveClass;
  if (btnAll) btnAll.className = subTab === 'all' ? activeClass : inactiveClass;

  if (pill) {
    pill.style.transform = subTab === 'active' ? 'translate3d(0, 0, 0)' : 'translate3d(calc(100% + 4px), 0, 0)';
  }

  const searchInput = document.getElementById('internal-dms-search-input');
  const query = searchInput ? searchInput.value.trim() : '';
  renderInternalDMsList(query);
}

// Formata timestamp relativo amigável
function formatInternalRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return timeStr;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Ontem, ${timeStr}`;
  }
  return `${date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} • ${timeStr}`;
}

// ==============================================================================
// 🟢 GERENCIAMENTO DE STATUS DO USUÁRIO (MANUAL & AUTOMÁTICO)
// ==============================================================================

function toggleUserStatusMenu(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById('user-status-menu');
  const chevron = document.getElementById('user-status-chevron');
  if (!menu) return;

  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    const opts = menu.querySelectorAll('.status-opt');
    opts.forEach(opt => {
      const st = opt.getAttribute('data-status');
      if (st === currentUserManualStatus) {
        opt.setAttribute('data-active', 'true');
      } else {
        opt.removeAttribute('data-active');
      }
    });

    const usernameEl = document.getElementById('user-status-current-username');
    if (usernameEl && currentOperator) {
      usernameEl.textContent = currentOperator.name || currentOperator.id || 'Operador';
    }

    menu.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    menu.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

function setUserStatus(status) {
  currentUserManualStatus = status;
  localStorage.setItem('tf_operator_manual_status', status);

  const menu = document.getElementById('user-status-menu');
  const chevron = document.getElementById('user-status-chevron');
  if (menu) menu.classList.add('hidden');
  if (chevron) chevron.style.transform = 'rotate(0deg)';

  if (currentOperator && currentOperator.id) {
    socket.emit('internal_set_status', {
      atendente_id: currentOperator.id,
      status: status
    });
  }

  let effectiveStatus = status;
  if (status === 'auto') {
    effectiveStatus = (activeChats && activeChats.length > 0) ? 'atendendo' : 'online';
  }

  updateUserStatusUI(effectiveStatus, status);
}

function updateUserStatusUI(effectiveStatus, manualStatus) {
  const dot = document.getElementById('current-user-status-dot');
  const label = document.getElementById('current-user-status-label');
  const manual = manualStatus || currentUserManualStatus || 'auto';

  const statusMap = {
    online: {
      label: 'Disponível',
      dotClass: 'bg-emerald-500 shadow-sm shadow-emerald-500 ring-2 ring-emerald-500/20'
    },
    atendendo: {
      label: 'Atendendo',
      dotClass: 'bg-amber-500 shadow-sm shadow-amber-500 ring-2 ring-amber-500/20'
    },
    ocupado: {
      label: 'Ocupado',
      dotClass: 'bg-rose-500 shadow-sm shadow-rose-500 ring-2 ring-rose-500/20'
    },
    ausente: {
      label: 'Ausente',
      dotClass: 'bg-orange-500 shadow-sm shadow-orange-500 ring-2 ring-orange-500/20'
    },
    offline: {
      label: 'Invisível',
      dotClass: 'bg-slate-500'
    }
  };

  const currentCfg = statusMap[effectiveStatus] || statusMap.online;

  if (dot) {
    dot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${currentCfg.dotClass}`;
  }

  if (label) {
    label.textContent = currentCfg.label;
  }

  const menu = document.getElementById('user-status-menu');
  if (menu) {
    const opts = menu.querySelectorAll('.status-opt');
    opts.forEach(opt => {
      const st = opt.getAttribute('data-status');
      if (st === manual) {
        opt.setAttribute('data-active', 'true');
      } else {
        opt.removeAttribute('data-active');
      }
    });
  }
}

// Fechar menu de status ao clicar fora
document.addEventListener('click', (e) => {
  const container = document.getElementById('user-status-dropdown-container');
  const menu = document.getElementById('user-status-menu');
  const chevron = document.getElementById('user-status-chevron');
  if (container && menu && !container.contains(e.target) && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
});

// 📢 Som 3: Notificação do CHAT INTERNO DA EQUIPE (Arpejo duplo harmônico de sino "team chime" a 587Hz -> 784Hz)
function playInternalChatNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const bellNotes = [
      { freq: 587.33, overtone: 1174.66, time: 0 },
      { freq: 783.99, overtone: 1567.98, time: 0.08 }
    ];

    bellNotes.forEach(({ freq, overtone, time }) => {
      const startTime = ctx.currentTime + time;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, startTime);
      gain1.gain.setValueAtTime(0.14, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(overtone, startTime);
      gain2.gain.setValueAtTime(0.06, startTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime);
      osc2.stop(startTime + 0.18);
    });
  } catch (e) {}
}

// Alternar Abertura / Fechamento da Gaveta Lateral
function toggleInternalChatDrawer() {
  const urlParams = new URLSearchParams(window.location.search);
  const isInternalOnly = urlParams.get('internal_only') === '1' || urlParams.get('view') === 'internal';

  // Se estiver rodando dentro do iframe do portal principal (/whatsapp), delega abertura para a janela pai global
  if (!isInternalOnly && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'TICKETFLOW_OPEN_INTERNAL_CHAT' }, '*');
      return;
    } catch (e) {}
  }

  if (isInternalDrawerOpen) {
    closeInternalChatDrawer();
  } else {
    openInternalChatDrawer();
  }
}

function openInternalChatDrawer() {
  const urlParams = new URLSearchParams(window.location.search);
  const isInternalOnly = urlParams.get('internal_only') === '1' || urlParams.get('view') === 'internal';

  // Se estiver rodando dentro do iframe do portal principal (/whatsapp), delega abertura para a janela pai global
  if (!isInternalOnly && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'TICKETFLOW_OPEN_INTERNAL_CHAT' }, '*');
      return;
    } catch (e) {}
  }

  isInternalDrawerOpen = true;
  const drawer = document.getElementById('internal-chat-drawer');
  const backdrop = document.getElementById('internal-chat-backdrop');
  if (drawer) {
    drawer.classList.remove('drawer-closed');
    drawer.classList.add('drawer-open');
  }
  if (backdrop) {
    backdrop.classList.remove('backdrop-hidden');
    backdrop.classList.add('backdrop-visible');
  }

  // Solicita dados atualizados de salas e colegas ao servidor
  if (currentOperator) {
    socket.emit('internal_get_rooms', { atendente_id: currentOperator.id });
  }

  // Se não houver conversa aberta, abre o diretório de canais/DMs
  if (!currentInternalRoomId) {
    showInternalDirectoryView();
  }
}

function closeInternalChatDrawer() {
  const urlParams = new URLSearchParams(window.location.search);
  const isInternalOnly = urlParams.get('internal_only') === '1' || urlParams.get('view') === 'internal';

  // Se estiver embutido no Next.js (modo internal_only), notifica o portal para fechar a gaveta pai
  if (isInternalOnly && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'TICKETFLOW_CLOSE_INTERNAL_CHAT' }, '*');
    } catch (e) {}
    return;
  }

  isInternalDrawerOpen = false;
  const drawer = document.getElementById('internal-chat-drawer');
  const backdrop = document.getElementById('internal-chat-backdrop');
  if (drawer) {
    drawer.classList.remove('drawer-open');
    drawer.classList.add('drawer-closed');
  }
  if (backdrop) {
    backdrop.classList.remove('backdrop-visible');
    backdrop.classList.add('backdrop-hidden');
  }
}

// ==============================================================================
// 🌟 GERENCIAMENTO DE ABAS PRINCIPAIS: PESSOAL & GERAL
// ==============================================================================

let internalMainActiveTab = 'pessoal'; // 'pessoal' | 'geral'
let internalPessoalSubTab = 'dms';     // 'dms' | 'groups' | 'voice'
let internalGeralSubTab = 'channels';   // 'channels' | 'voice'
let privateCallSelectedMemberIds = new Set();

// Alterna entre as Abas Principais (1. Pessoal | 2. Geral)
function switchInternalMainTab(mainTab) {
  internalMainActiveTab = mainTab;

  const btnPessoal = document.getElementById('tab-btn-internal-pessoal');
  const btnGeral = document.getElementById('tab-btn-internal-geral');
  const panelPessoal = document.getElementById('internal-panel-pessoal');
  const panelGeral = document.getElementById('internal-panel-geral');
  const pill = document.getElementById('internal-main-tab-pill');

  const activeClass = 'flex-1 py-2.5 rounded-xl text-[11px] md:text-xs cursor-pointer flex items-center justify-center gap-1.5 internal-tab-btn internal-tab-active';
  const inactiveClass = 'flex-1 py-2.5 rounded-xl text-[11px] md:text-xs cursor-pointer flex items-center justify-center gap-1.5 internal-tab-btn internal-tab-inactive';

  if (btnPessoal) btnPessoal.className = mainTab === 'pessoal' ? activeClass : inactiveClass;
  if (btnGeral) btnGeral.className = mainTab === 'geral' ? activeClass : inactiveClass;

  if (pill) {
    pill.style.transform = mainTab === 'pessoal' ? 'translate3d(0, 0, 0)' : 'translate3d(calc(100% + 4px), 0, 0)';
  }

  if (panelPessoal) {
    if (mainTab === 'pessoal') {
      panelPessoal.classList.remove('hidden');
      panelPessoal.classList.add('flex');
      switchPessoalSubTab(internalPessoalSubTab || 'dms');
    } else {
      panelPessoal.classList.add('hidden');
      panelPessoal.classList.remove('flex');
    }
  }

  if (panelGeral) {
    if (mainTab === 'geral') {
      panelGeral.classList.remove('hidden');
      panelGeral.classList.add('flex');
      switchGeralSubTab(internalGeralSubTab || 'channels');
    } else {
      panelGeral.classList.add('hidden');
      panelGeral.classList.remove('flex');
    }
  }

  updateAllInternalBadges();
}

// Alterna entre as Sub-Abas do Painel Pessoal (1. Conversas | 2. Grupos | 3. Salas de Call)
function switchPessoalSubTab(subTab, forceClean = true) {
  internalPessoalSubTab = subTab;

  const btnDms = document.getElementById('subtab-btn-pessoal-dms');
  const btnGroups = document.getElementById('subtab-btn-pessoal-groups');
  const btnVoice = document.getElementById('subtab-btn-pessoal-voice');
  const pill = document.getElementById('pessoal-subtab-pill');

  const listDms = document.getElementById('pessoal-list-dms');
  const listGroups = document.getElementById('pessoal-list-groups');
  const listVoice = document.getElementById('pessoal-list-voice');

  const activeClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-active';
  const inactiveClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-inactive';

  if (btnDms) btnDms.className = subTab === 'dms' ? activeClass : inactiveClass;
  if (btnGroups) btnGroups.className = subTab === 'groups' ? activeClass : inactiveClass;
  if (btnVoice) btnVoice.className = subTab === 'voice' ? activeClass : inactiveClass;

  if (pill) {
    if (subTab === 'dms') {
      pill.style.transform = 'translateX(0)';
    } else if (subTab === 'groups') {
      pill.style.transform = 'translateX(calc(100% + 4px))';
    } else if (subTab === 'voice') {
      pill.style.transform = 'translateX(calc(200% + 8px))';
    }
  }

  if (listDms) {
    if (subTab === 'dms') {
      listDms.classList.remove('hidden');
      renderPessoalDMs();
    } else {
      listDms.classList.add('hidden');
    }
  }

  if (listGroups) {
    if (subTab === 'groups') {
      listGroups.classList.remove('hidden');
      listGroups.classList.add('flex');
      renderPessoalGroups();
    } else {
      listGroups.classList.add('hidden');
      listGroups.classList.remove('flex');
    }
  }

  if (listVoice) {
    if (subTab === 'voice') {
      listVoice.classList.remove('hidden');
      listVoice.classList.add('flex');
      renderPessoalVoice('', forceClean);
    } else {
      listVoice.classList.add('hidden');
      listVoice.classList.remove('flex');
    }
  }
}

// Alterna entre as Sub-Abas do Painel Geral (1. Grupos de Setores | 2. Salas de Call)
function switchGeralSubTab(subTab, forceClean = true) {
  internalGeralSubTab = subTab;

  const btnChannels = document.getElementById('subtab-btn-geral-channels');
  const btnVoice = document.getElementById('subtab-btn-geral-voice');
  const pill = document.getElementById('geral-subtab-pill');

  const listChannels = document.getElementById('geral-list-channels');
  const listVoice = document.getElementById('geral-list-voice');

  const activeClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-active';
  const inactiveClass = 'flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer relative z-10 internal-subtab-btn internal-subtab-inactive';

  if (btnChannels) btnChannels.className = subTab === 'channels' ? activeClass : inactiveClass;
  if (btnVoice) btnVoice.className = subTab === 'voice' ? activeClass : inactiveClass;

  if (pill) {
    pill.style.transform = subTab === 'channels' ? 'translateX(0)' : 'translateX(calc(100% + 4px))';
  }

  if (listChannels) {
    if (subTab === 'channels') {
      listChannels.classList.remove('hidden');
      renderGeralChannels();
    } else {
      listChannels.classList.add('hidden');
    }
  }

  if (listVoice) {
    if (subTab === 'voice') {
      listVoice.classList.remove('hidden');
      renderGeralVoice('', forceClean);
    } else {
      listVoice.classList.add('hidden');
    }
  }
}

// Filtros de Busca
function filterPessoalList() {
  const input = document.getElementById('internal-pessoal-search-input');
  const q = input ? input.value.trim().toLowerCase() : '';
  if (internalPessoalSubTab === 'dms') renderPessoalDMs(q);
  else if (internalPessoalSubTab === 'groups') renderPessoalGroups(q);
  else if (internalPessoalSubTab === 'voice') renderPessoalVoice(q);
}

function filterGeralList() {
  const input = document.getElementById('internal-geral-search-input');
  const q = input ? input.value.trim().toLowerCase() : '';
  if (internalGeralSubTab === 'channels') renderGeralChannels(q);
  else if (internalGeralSubTab === 'voice') renderGeralVoice(q);
}

// Exibe a tela de lista de Diretório (Pessoal ou Geral)
function showInternalDirectoryView() {
  const dirView = document.getElementById('internal-directory-view');
  const chatView = document.getElementById('internal-chat-view');
  const backBtn = document.getElementById('btn-internal-back-to-list');
  const titleEl = document.getElementById('internal-drawer-title');
  const descEl = document.getElementById('internal-drawer-desc');
  const membersEl = document.getElementById('internal-drawer-members-count');
  const iconContainer = document.getElementById('internal-drawer-icon-container');

  if (dirView) {
    dirView.classList.remove('hidden');
    dirView.classList.remove('internal-view-slide-right');
    dirView.classList.remove('internal-view-slide-left');
    void dirView.offsetWidth;
    dirView.classList.add('internal-view-slide-left');
  }
  if (chatView) {
    chatView.classList.add('hidden');
    chatView.classList.remove('internal-view-slide-right', 'internal-view-slide-left');
  }
  if (backBtn) backBtn.classList.add('hidden');

  const closeDmBtn = document.getElementById('btn-internal-close-dm');
  if (closeDmBtn) {
    closeDmBtn.classList.add('hidden');
    closeDmBtn.classList.remove('flex');
  }

  const voiceCallBtn = document.getElementById('btn-internal-voice-call');
  if (voiceCallBtn) {
    voiceCallBtn.classList.add('hidden');
    voiceCallBtn.classList.remove('flex');
  }

  if (iconContainer) {
    iconContainer.className = 'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 internal-icon-box transition-all duration-300';
    iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }

  if (titleEl) titleEl.textContent = 'Comunicação Interna';
  if (descEl) {
    descEl.textContent = '';
    descEl.classList.add('hidden');
  }
  if (membersEl) {
    membersEl.textContent = '';
    membersEl.classList.add('hidden');
  }

  switchInternalMainTab(internalMainActiveTab || 'pessoal');
}

// ==============================================================================
// 1. RENDERIZAÇÃO: PESSOAL -> CONVERSAS ABERTAS (1X1 DMs)
// ==============================================================================
function renderPessoalDMs(filterQuery = '') {
  const container = document.getElementById('pessoal-dms-container');
  if (!container) return;

  container.innerHTML = '';
  const currentOpId = currentOperator ? String(currentOperator.id) : null;

  const uniqueOps = [];
  const seenIds = new Set();
  const seenNames = new Set();

  (internalOperatorsList || []).forEach(op => {
    if (!op || (currentOpId && String(op.id) === currentOpId)) return;
    const cleanName = (op.nome || '').trim().toLowerCase();
    if (seenIds.has(String(op.id)) || (cleanName && seenNames.has(cleanName))) return;
    seenIds.add(String(op.id));
    if (cleanName) seenNames.add(cleanName);
    uniqueOps.push(op);
  });

  let totalDMsUnread = 0;
  const mappedOps = uniqueOps.map(op => {
    const dmRoomId = `dm_${[currentOpId || 'me', op.id].sort().join('_')}`;
    const unreadCount = internalRoomUnreads[dmRoomId] || 0;
    totalDMsUnread += unreadCount;

    const lastMsg = internalRecentMessagesMap[dmRoomId] || (internalMessagesMap[dmRoomId] && internalMessagesMap[dmRoomId].length > 0 ? internalMessagesMap[dmRoomId][internalMessagesMap[dmRoomId].length - 1] : null);
    const isClosed = internalClosedDMsMap[dmRoomId] && lastMsg && new Date(lastMsg.timestamp).getTime() <= new Date(internalClosedDMsMap[dmRoomId]).getTime();
    const hasConversation = !!lastMsg && !isClosed;
    const lastTimestamp = lastMsg && lastMsg.timestamp ? new Date(lastMsg.timestamp).getTime() : 0;

    let statusColor = 'bg-slate-500';
    let statusLabel = 'Offline';
    if (op.status === 'online') {
      statusColor = 'bg-emerald-500 shadow-sm shadow-emerald-500 ring-2 ring-emerald-500/20';
      statusLabel = 'Disponível';
    } else if (op.status === 'atendendo') {
      statusColor = 'bg-amber-500 shadow-sm shadow-amber-500 ring-2 ring-amber-500/20';
      statusLabel = op.active_chats > 0 ? `Em Atendimento (${op.active_chats})` : 'Em Atendimento';
    } else if (op.status === 'ocupado') {
      statusColor = 'bg-rose-500 shadow-sm shadow-rose-500 ring-2 ring-rose-500/20';
      statusLabel = 'Ocupado';
    } else if (op.status === 'ausente') {
      statusColor = 'bg-orange-500 shadow-sm shadow-orange-500 ring-2 ring-orange-500/20';
      statusLabel = 'Ausente';
    }

    return {
      ...op,
      dmRoomId,
      unreadCount,
      lastMsg,
      hasConversation,
      lastTimestamp,
      statusColor,
      statusLabel
    };
  });

  // Apenas conversas que o usuário tem ABERTAS
  const openConversations = mappedOps
    .filter(o => o.hasConversation)
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
  const filtered = openConversations.filter(op => {
    if (!q) return true;
    return (op.nome && op.nome.toLowerCase().includes(q)) || (op.setor && op.setor.toLowerCase().includes(q));
  });

  if (openConversations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 px-4 internal-tab-pane-anim flex flex-col items-center">
        <div class="w-12 h-12 rounded-2xl mb-3 flex items-center justify-center internal-icon-box opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p class="text-xs font-bold text-foreground">Nenhuma conversa aberta no momento</p>
        <p class="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[240px]">Inicie uma conversa direta 1x1 com qualquer colega da equipe.</p>
        <button onclick="openNewDMModal()" type="button" class="mt-4 px-4 py-2 text-xs internal-btn-action font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Iniciar Nova Conversa</span>
        </button>
      </div>
    `;
    updateAllInternalBadges();
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-[var(--color-text-muted)] internal-tab-pane-anim">
        <p class="text-xs font-bold">Nenhuma conversa encontrada</p>
        <p class="text-[10px] mt-1 text-slate-400">Tente buscar por outro nome ou setor</p>
      </div>
    `;
    updateAllInternalBadges();
    return;
  }

  filtered.forEach((op, index) => {
    const isUnread = op.unreadCount > 0;
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'U';

    let lastMsgSnippet = 'Conversa iniciada';
    let timeFormatted = '';
    if (op.lastMsg) {
      timeFormatted = formatInternalRelativeTime(op.lastMsg.timestamp);
      const isFromMe = currentOperator && String(op.lastMsg.remetente_id) === String(currentOperator.id);
      const prefix = isFromMe ? '<span class="text-slate-400 font-semibold">Você: </span>' : '';
      if (op.lastMsg.texto) lastMsgSnippet = `${prefix}${escapeHtml(op.lastMsg.texto)}`;
      else if (op.lastMsg.midia_tipo === 'audio') lastMsgSnippet = `${prefix}🎵 Áudio`;
      else if (op.lastMsg.midia_url) lastMsgSnippet = `${prefix}📎 Arquivo`;
      else if (op.lastMsg.card_meta) lastMsgSnippet = `${prefix}💼 Atendimento`;
    }

    const card = document.createElement('div');
    card.className = `p-3.5 internal-card internal-card-enter flex items-center justify-between gap-3 cursor-pointer select-none ${isUnread ? 'internal-card-unread' : ''}`;
    card.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
    card.onclick = () => openInternalDM(op.id, op.nome, op.setor, op.status);

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="relative w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 internal-avatar">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-2xl">` : initial}
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${op.statusColor} border-2 border-[var(--color-card,#0f172a)]" title="${op.statusLabel}"></span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-0.5">
            <h4 class="text-xs font-extrabold text-foreground truncate">${escapeHtml(op.nome)}</h4>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase internal-sector-tag">${escapeHtml(op.setor || 'Equipe')}</span>
            ${op.unreadCount > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white leading-none">${op.unreadCount}</span>` : ''}
          </div>
          <p class="text-[11px] text-[var(--color-text-muted)] truncate font-medium">${lastMsgSnippet}</p>
        </div>
      </div>
      <div class="flex flex-col items-end justify-center gap-1 shrink-0 pl-1">
        ${timeFormatted ? `<span class="text-[10px] text-slate-400 font-medium whitespace-nowrap">${timeFormatted}</span>` : ''}
        <button type="button" onclick="event.stopPropagation(); closeInternalDMById('${op.dmRoomId}', '${escapeHtml(op.nome)}')" class="px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 hover:text-white transition-all flex items-center gap-1 cursor-pointer shadow-xs select-none" title="Encerrar conversa ativa">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Encerrar</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  updateAllInternalBadges();
}

// ==============================================================================
// 9. MODAL DE NOVA CONVERSA 1X1
// ==============================================================================
function openNewDMModal() {
  const modal = document.getElementById('internal-new-dm-modal');
  const searchInput = document.getElementById('input-new-dm-search');

  if (searchInput) searchInput.value = '';
  renderNewDMColleaguesList();

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
  }
  if (searchInput) setTimeout(() => searchInput.focus(), 50);
}

function closeNewDMModal() {
  const modal = document.getElementById('internal-new-dm-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('internal-modal-overlay');
  }
}

function filterNewDMColleaguesList() {
  const searchInput = document.getElementById('input-new-dm-search');
  const q = searchInput ? searchInput.value : '';
  renderNewDMColleaguesList(q);
}

function renderNewDMColleaguesList(filterQuery = '') {
  const container = document.getElementById('new-dm-colleagues-list');
  if (!container) return;

  container.innerHTML = '';
  const currentOpId = currentOperator ? String(currentOperator.id) : null;
  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();

  const uniqueOps = [];
  const seenIds = new Set();
  const seenNames = new Set();

  (internalOperatorsList || []).forEach(op => {
    if (!op || (currentOpId && String(op.id) === currentOpId)) return;
    const cleanName = (op.nome || '').trim().toLowerCase();
    if (seenIds.has(String(op.id)) || (cleanName && seenNames.has(cleanName))) return;
    seenIds.add(String(op.id));
    if (cleanName) seenNames.add(cleanName);
    uniqueOps.push(op);
  });

  // Ordena por online primeiro, depois A-Z
  uniqueOps.sort((a, b) => {
    const isOnlineA = a.status === 'online' || a.status === 'atendendo' ? 1 : 0;
    const isOnlineB = b.status === 'online' || b.status === 'atendendo' ? 1 : 0;
    if (isOnlineB !== isOnlineA) return isOnlineB - isOnlineA;
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
  });

  const filtered = uniqueOps.filter(op => {
    if (!q) return true;
    return (op.nome && op.nome.toLowerCase().includes(q)) || (op.setor && op.setor.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-[var(--color-text-muted)]">
        <p class="text-xs font-bold text-foreground">Nenhum colega encontrado</p>
        <p class="text-[10px] text-slate-400 mt-1">Tente buscar por outro termo</p>
      </div>
    `;
    return;
  }

  filtered.forEach(op => {
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'U';

    let statusColor = 'bg-slate-500';
    let statusLabel = 'Offline';
    if (op.status === 'online') {
      statusColor = 'bg-emerald-500 shadow-sm shadow-emerald-500 ring-2 ring-emerald-500/20';
      statusLabel = 'Disponível';
    } else if (op.status === 'atendendo') {
      statusColor = 'bg-amber-500 shadow-sm shadow-amber-500 ring-2 ring-amber-500/20';
      statusLabel = 'Em Atendimento';
    } else if (op.status === 'ocupado') {
      statusColor = 'bg-rose-500 shadow-sm shadow-rose-500 ring-2 ring-rose-500/20';
      statusLabel = 'Ocupado';
    } else if (op.status === 'ausente') {
      statusColor = 'bg-orange-500 shadow-sm shadow-orange-500 ring-2 ring-orange-500/20';
      statusLabel = 'Ausente';
    }

    const card = document.createElement('div');
    card.className = 'p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-3 cursor-pointer select-none group';
    card.onclick = () => {
      closeNewDMModal();
      openInternalDM(op.id, op.nome, op.setor, op.status);
    };

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="relative w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 internal-avatar bg-[var(--color-primary-theme)] text-white">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-xl">` : initial}
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${statusColor} border-2 border-[var(--color-card,#0f172a)]" title="${statusLabel}"></span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-0.5">
            <h4 class="text-xs font-extrabold text-foreground truncate group-hover:text-[var(--color-primary-theme)] transition-colors">${escapeHtml(op.nome)}</h4>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase internal-sector-tag">${escapeHtml(op.setor || 'Equipe')}</span>
          </div>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${statusLabel}</p>
        </div>
      </div>
      <button type="button" class="px-3 py-1.5 rounded-lg text-[10px] font-extrabold text-white internal-send-btn flex items-center gap-1 cursor-pointer shrink-0 shadow-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Conversar</span>
      </button>
    `;

    container.appendChild(card);
  });
}

function closeInternalDMById(dmRoomId, otherName) {
  const closedAt = new Date().toISOString();
  internalClosedDMsMap[dmRoomId] = closedAt;

  socket.emit('internal_close_dm', {
    sala_id: dmRoomId,
    atendente_id: currentOperator ? currentOperator.id : 'anon',
    fechada_em: closedAt
  });

  if (currentInternalRoomId === dmRoomId) {
    showInternalDirectoryView();
  } else {
    refreshInternalUI();
  }

  showInputBarNotification(`Conversa com ${otherName || 'colega'} encerrada.`);
}

// ==============================================================================
// 2. RENDERIZAÇÃO: PESSOAL -> GRUPOS DA EQUIPE
// ==============================================================================
function renderPessoalGroups(filterQuery = '') {
  const container = document.getElementById('pessoal-groups-container');
  if (!container) return;

  container.innerHTML = '';
  const currentOpId = currentOperator ? String(currentOperator.id) : null;

  const rawGroups = internalRoomsList.filter(r => {
    if (r.tipo !== 'grupo') return false;
    if (r.membros && currentOpId) {
      try {
        const memberList = typeof r.membros === 'string' ? JSON.parse(r.membros) : r.membros;
        if (Array.isArray(memberList) && memberList.length > 0) {
          return memberList.includes(currentOpId);
        }
      } catch (e) {}
    }
    return true;
  });

  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
  const groups = q
    ? rawGroups.filter(g => (g.nome || '').toLowerCase().includes(q) || (g.descricao || '').toLowerCase().includes(q))
    : rawGroups;

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 px-4 internal-tab-pane-anim">
        <div class="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center internal-icon-box opacity-70">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <p class="text-xs font-bold text-foreground">${q ? 'Nenhum grupo encontrado' : 'Nenhum grupo criado ainda'}</p>
        <p class="text-[11px] text-[var(--color-text-muted)] mt-1">Reúna colegas para projetos, plantões ou assuntos específicos.</p>
        <button onclick="openCreateGroupModal()" class="mt-4 px-4 py-2 text-xs internal-btn-action cursor-pointer inline-flex items-center gap-1.5 font-bold">
          <span>+ Criar Primeiro Grupo</span>
        </button>
      </div>
    `;
    return;
  }

  groups.forEach((group, index) => {
    const unreadCount = internalRoomUnreads[group.id] || 0;
    const isUnread = unreadCount > 0;

    let memberCount = '';
    if (group.membros) {
      try {
        const m = typeof group.membros === 'string' ? JSON.parse(group.membros) : group.membros;
        if (Array.isArray(m)) memberCount = `${m.length} membros`;
      } catch (e) {}
    }

    const card = document.createElement('div');
    card.className = `p-3.5 internal-card internal-card-enter flex items-center justify-between gap-3 cursor-pointer select-none ${isUnread ? 'internal-card-unread' : ''}`;
    card.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
    card.onclick = () => openInternalGroup(group.id, group.nome, group.descricao, memberCount, group.criado_por_nome);

    card.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 internal-icon-box" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent); color: var(--color-primary-theme, #ef4444);">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <h4 class="text-xs font-extrabold text-foreground truncate">${escapeHtml(group.nome)}</h4>
            ${memberCount ? `<span class="px-2 py-0.2 rounded-md text-[9px] font-bold uppercase internal-sector-tag">${memberCount}</span>` : ''}
          </div>
          <p class="text-[11px] text-[var(--color-text-muted)] truncate">${escapeHtml(group.descricao || 'Grupo da equipe')}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${unreadCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold internal-unread-badge">${unreadCount}</span>` : ''}
        <div class="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  updateAllInternalBadges();
}

// ==============================================================================
// 3. RENDERIZAÇÃO: PESSOAL -> SALAS DE CALL PRIVADAS
// ==============================================================================
let connectingVoiceRoomId = null;

function renderPessoalVoice(filterQuery = '', forceClean = false) {
  const container = document.getElementById('pessoal-voice-container');
  if (!container) return;

  const currentOpId = currentOperator ? String(currentOperator.id) : null;

  const rawPrivateRooms = internalRoomsList.filter(r => {
    if (r.tipo !== 'sala_privada') return false;
    if (r.membros && currentOpId) {
      try {
        const memberList = typeof r.membros === 'string' ? JSON.parse(r.membros) : r.membros;
        if (Array.isArray(memberList) && memberList.length > 0) {
          return memberList.includes(currentOpId) || String(r.criado_por) === currentOpId;
        }
      } catch (e) {}
    }
    return true;
  });

  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
  const rooms = q
    ? rawPrivateRooms.filter(r => (r.nome || '').toLowerCase().includes(q) || (r.descricao || '').toLowerCase().includes(q))
    : rawPrivateRooms;

  if (rooms.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 px-4 internal-tab-pane-anim">
        <div class="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center internal-icon-box opacity-70" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent); color: var(--color-primary-theme, #ef4444);">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </div>
        <p class="text-xs font-bold text-foreground">${q ? 'Nenhuma sala de call privada encontrada' : 'Nenhuma call privada ativa'}</p>
        <p class="text-[11px] text-[var(--color-text-muted)] mt-1">Crie uma sala de call exclusiva para convidar colegas específicos.</p>
        <button onclick="openCreatePrivateCallModal()" class="mt-4 px-4 py-2 text-xs font-bold text-white rounded-xl cursor-pointer inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all" style="background: linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 80%, black)); box-shadow: 0 4px 14px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent);">
          <span>+ Criar Sala de Call</span>
        </button>
      </div>
    `;
    updateAllInternalBadges();
    return;
  }

  if (forceClean || container.querySelector('.internal-tab-pane-anim')) {
    container.innerHTML = '';
  }

  const renderedRoomIds = new Set();

  rooms.forEach((room, index) => {
    renderedRoomIds.add(String(room.id));
    const serverSession = (activeVoiceRoomsSummary || []).find(s => String(s.id) === String(room.id));
    const isLocalCurrent = currentVoiceSession && String(currentVoiceSession.id) === String(room.id);
    let participants = serverSession && serverSession.participants ? [...serverSession.participants] : [];
    if (isLocalCurrent) {
      if (currentOpId && !participants.some(p => String(p.operatorId) === currentOpId)) {
        participants.unshift({
          operatorId: currentOpId,
          operatorName: currentOperator.name || currentOperator.nome || 'Você',
          avatar: currentOperator.avatar || null,
          isMuted: currentVoiceSession.isMuted,
          isSpeaking: currentVoiceSession.isSpeaking
        });
      }
    }

    const pCount = participants.length;
    const isLive = pCount > 0;

    let memberCount = '';
    if (room.membros) {
      try {
        const m = typeof room.membros === 'string' ? JSON.parse(room.membros) : room.membros;
        if (Array.isArray(m)) memberCount = `${m.length} convidados`;
      } catch (e) {}
    }

    const subtitleHTML = isLive
      ? `<span class="text-emerald-400 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ${pCount} em chamada</span>`
      : escapeHtml(room.descricao || memberCount || 'Sala de call exclusiva');

    const isMuted = !!currentVoiceSession?.isMuted;
    const actionsHTML = isLocalCurrent ? `
      <div class="flex flex-row items-center gap-1.5 shrink-0 whitespace-nowrap voice-actions-connected-group">
        <span class="h-7 px-2 rounded-lg text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex flex-row items-center justify-center gap-1 shadow-xs whitespace-nowrap shrink-0 select-none" data-tooltip="Conectado à sala de voz">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span class="hidden sm:inline">Conectado</span>
        </span>
        <button type="button" onclick="toggleVoiceMute()" class="voice-btn-mute-toggle w-7 h-7 rounded-xl text-[11px] font-extrabold ${isMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'} cursor-pointer flex items-center justify-center shrink-0 transition-colors duration-200 select-none" data-tooltip="${isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0">
            ${isMuted 
              ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
              : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
            }
          </svg>
        </button>
        <button type="button" onclick="leaveCurrentVoiceCall()" class="w-7 h-7 rounded-xl text-[11px] font-extrabold bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white cursor-pointer shadow-sm shadow-rose-500/25 flex items-center justify-center shrink-0 transition-transform active:scale-95 select-none" data-tooltip="Sair da sala de voz">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
        </button>
      </div>
    ` : (connectingVoiceRoomId === room.id ? `
      <button type="button" disabled class="voice-btn-connecting-anim h-7 px-3.5 rounded-xl font-extrabold text-[11px] text-white flex flex-row items-center justify-center gap-1.5 opacity-90 cursor-wait shadow-xs whitespace-nowrap shrink-0 select-none animate-pulse" style="background: linear-gradient(135deg, #10b981, #059669);">
        <svg class="animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
        <span class="whitespace-nowrap shrink-0">Conectando...</span>
      </button>
    ` : `
      <button type="button" onclick="joinSectorVoiceRoom('${room.id}', '${escapeHtml(room.nome)}', 'sala_privada')" class="voice-btn-enter-anim h-7 px-3.5 rounded-xl font-extrabold text-[11px] text-white flex flex-row items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap shrink-0 select-none" style="background: ${isLive ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 80%, black))'};">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <span class="whitespace-nowrap shrink-0">${isLive ? `Entrar (${pCount})` : 'Entrar'}</span>
      </button>
    `);

    const iconHTML = isLocalCurrent ? `
      <div class="voice-equalizer">
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
      </div>
    ` : `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    `;

    const participantsChipsHTML = participants.map(p => {
      const name = p.operatorName || 'Participante';
      const initial = name.charAt(0).toUpperCase();
      const isSpeaking = p.isSpeaking;
      const isMutedP = p.isMuted;
      return `
        <div class="voice-participant-chip" data-op-id="${escapeHtml(String(p.operatorId || ''))}" title="${escapeHtml(name)} ${isMutedP ? '(Mutado)' : (isSpeaking ? '(Falando...)' : '')}">
          <div class="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 border-2 border-[#0f172a] shadow-sm transition-all duration-200 overflow-hidden ${isSpeaking ? 'scale-110 z-10 animate-pulse' : ''} ${isMutedP ? 'opacity-60' : ''}" style="background: linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 65%, black)); ${isSpeaking ? 'box-shadow: 0 0 0 2px var(--color-primary-theme, #ef4444);' : ''}">
            ${p.avatar ? `<img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(name)}" class="w-full h-full object-cover">` : `<span class="text-white drop-shadow">${initial}</span>`}
          </div>
          ${isMutedP ? `<span class="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 border border-[#0f172a]"></span>` : ''}
          <div class="voice-tooltip">
            ${escapeHtml(name)} ${isMutedP ? '🔇' : (isSpeaking ? '🎙️' : '')}
          </div>
        </div>
      `;
    }).join('');

    const participantsTrayHTML = isLocalCurrent && participants.length > 0 ? `
      <div class="voice-card-participants voice-tray-entering flex items-center justify-between border-t border-white/[0.08] pt-2.5 mt-2.5 w-full">
        <span class="voice-card-count-text text-[10px] font-extrabold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Na chamada (${participants.length})
        </span>
        <div class="voice-card-chips-container flex items-center -space-x-1.5 overflow-visible">
          ${participantsChipsHTML}
        </div>
      </div>
    ` : '';

    let card = container.querySelector(`[data-voice-room-id="${room.id}"]`);
    if (card) {
      card.className = `p-3.5 internal-card flex flex-col justify-between select-none transition-all duration-300 ${isLocalCurrent ? 'internal-card-active' : ''}`;
      
      const iconEl = card.querySelector('.voice-icon-box');
      if (iconEl) {
        iconEl.className = `w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 voice-icon-box ${isLocalCurrent ? 'voice-pulse-beacon' : ''}`;
        iconEl.style.background = isLocalCurrent ? 'rgba(16, 185, 129, 0.2)' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent)';
        iconEl.style.color = isLocalCurrent ? '#10b981' : 'var(--color-primary-theme, #ef4444)';
        iconEl.style.borderColor = isLocalCurrent ? 'rgba(16, 185, 129, 0.4)' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)';
        const iconKey = isLocalCurrent ? 'connected' : 'idle';
        if (iconEl.dataset.iconKey !== iconKey) {
          iconEl.innerHTML = `<div class="voice-icon-pop-anim">${iconHTML}</div>`;
          iconEl.dataset.iconKey = iconKey;
        }
      }

      const subtitleEl = card.querySelector('.voice-room-subtitle');
      if (subtitleEl && subtitleEl.innerHTML !== subtitleHTML) {
        subtitleEl.innerHTML = subtitleHTML;
      }
      const actionsEl = card.querySelector('.voice-room-actions');
      const actionKey = isLocalCurrent ? 'connected' : `live_${isLive}_${pCount}_${connectingVoiceRoomId === room.id}`;
      if (actionsEl && actionsEl.dataset.actionKey !== actionKey) {
        actionsEl.dataset.actionKey = actionKey;
        actionsEl.innerHTML = actionsHTML;
      } else if (actionsEl && isLocalCurrent) {
        const muteBtn = actionsEl.querySelector('.voice-btn-mute-toggle');
        if (muteBtn) {
          muteBtn.className = `voice-btn-mute-toggle w-7 h-7 rounded-xl text-[11px] font-extrabold ${isMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'} cursor-pointer flex items-center justify-center shrink-0 transition-colors duration-200 select-none`;
          muteBtn.setAttribute('data-tooltip', isMuted ? 'Desmutar Microfone' : 'Mutar Microfone');
          muteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0">
              ${isMuted 
                ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
                : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
              }
            </svg>
          `;
        }
      }

      let trayEl = card.querySelector('.voice-card-participants');
      if (isLocalCurrent && participants.length > 0) {
        if (trayEl && trayEl.classList.contains('voice-tray-collapsing')) {
          trayEl.remove();
          trayEl = null;
        }
        if (!trayEl) {
          card.insertAdjacentHTML('beforeend', participantsTrayHTML);
        } else {
          // Atualiza apenas os chips internamente sem resetar a bandeja
          const countEl = trayEl.querySelector('.voice-card-count-text');
          if (countEl) countEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Na chamada (${participants.length})`;
          const chipsContainer = trayEl.querySelector('.voice-card-chips-container');
          if (chipsContainer) {
            chipsContainer.innerHTML = participantsChipsHTML;
          }
        }
      } else if (trayEl) {
        if (!trayEl.classList.contains('voice-tray-collapsing')) {
          trayEl.remove();
        }
      }
    } else {
      card = document.createElement('div');
      card.setAttribute('data-voice-room-id', String(room.id));
      card.className = `p-3.5 internal-card internal-card-enter flex flex-col justify-between select-none transition-all duration-300 ${isLocalCurrent ? 'internal-card-active' : ''}`;
      card.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;

      card.innerHTML = `
        <div class="voice-card-main flex items-center justify-between gap-3 w-full">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 voice-icon-box ${isLocalCurrent ? 'voice-pulse-beacon' : ''}" style="background: ${isLocalCurrent ? 'rgba(16, 185, 129, 0.2)' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent)'}; color: ${isLocalCurrent ? '#10b981' : 'var(--color-primary-theme, #ef4444)'}; border: 1px solid ${isLocalCurrent ? 'rgba(16, 185, 129, 0.4)' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'};" data-icon-key="${isLocalCurrent ? 'connected' : 'idle'}">
              <div class="voice-icon-pop-anim">${iconHTML}</div>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <h4 class="text-xs font-extrabold text-foreground truncate">${escapeHtml(room.nome)}</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 14%, transparent); color: var(--color-primary-theme, #ef4444); border-color: color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent);">Privada</span>
              </div>
              <p class="voice-room-subtitle text-[11px] text-[var(--color-text-muted)] truncate font-medium">${subtitleHTML}</p>
            </div>
          </div>

          <div class="voice-room-actions flex flex-row items-center gap-2 shrink-0 whitespace-nowrap" data-action-key="${isLocalCurrent ? 'connected' : `live_${isLive}_${pCount}_${connectingVoiceRoomId === room.id}`}">
            ${actionsHTML}
          </div>
        </div>
        ${participantsTrayHTML}
      `;

      container.appendChild(card);
    }
  });

  Array.from(container.children).forEach(child => {
    const roomId = child.getAttribute('data-voice-room-id');
    if (roomId && !renderedRoomIds.has(roomId)) {
      child.remove();
    }
  });

  updateAllInternalBadges();
}

// ==============================================================================
// 4. RENDERIZAÇÃO: GERAL -> GRUPOS DE SETORES (CANAIS DE TEXTO)
// ==============================================================================
function renderGeralChannels(filterQuery = '') {
  const container = document.getElementById('geral-list-channels');
  if (!container) return;

  container.innerHTML = '';
  const rawChannels = internalRoomsList.filter(r => r.tipo === 'canal');
  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
  const channels = q
    ? rawChannels.filter(c => (c.nome || '').toLowerCase().includes(q) || (c.descricao || '').toLowerCase().includes(q))
    : rawChannels;

  if (channels.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center space-y-2 internal-tab-pane-anim">
        <p class="text-xs text-[var(--color-text-muted)] font-semibold">${q ? 'Nenhum grupo de setor encontrado.' : 'Nenhum canal cadastrado.'}</p>
      </div>
    `;
    return;
  }

  channels.forEach((canal, index) => {
    const unreadCount = internalRoomUnreads[canal.id] || 0;
    const isUnread = unreadCount > 0;

    const card = document.createElement('div');
    card.className = `p-3.5 internal-card internal-card-enter flex items-center justify-between gap-3 cursor-pointer select-none group transition-all ${isUnread ? 'internal-card-unread' : ''}`;
    card.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;
    card.onclick = () => openInternalChannel(canal.id, canal.nome, canal.descricao);

    card.innerHTML = `
      <div class="flex items-center gap-3.5 min-w-0">
        <div class="w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-black text-base shrink-0 internal-icon-box group-hover:scale-105 transition-transform" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent); color: var(--color-primary-theme, #ef4444);">
          #
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-extrabold text-foreground truncate group-hover:text-[var(--color-primary-theme,#ef4444)] transition-colors">${escapeHtml(canal.nome)}</h4>
          </div>
          <p class="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">${escapeHtml(canal.descricao || 'Grupo oficial de comunicação do setor')}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${unreadCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black internal-unread-badge animate-bounce">${unreadCount}</span>` : ''}
        <div class="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--color-text-muted)] group-hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  updateAllInternalBadges();
}

// ==============================================================================
// 5. RENDERIZAÇÃO: GERAL -> SALAS DE CALL PÚBLICAS
// ==============================================================================
let activeVoiceRoomsSummary = [];

function renderGeralVoice(filterQuery = '', forceClean = false) {
  const container = document.getElementById('geral-list-voice');
  if (!container) return;

  const defaultVoiceRooms = [
    { id: 'voice_channel-geral', name: 'Geral — Sala de Voz', sector: 'Geral', desc: 'Bate-papo de voz aberto para toda a equipe', themeColor: '#ef4444', iconType: 'users' },
    { id: 'voice_channel-suporte', name: 'Suporte Técnico — Call', sector: 'Suporte Técnico', desc: 'Resolução de chamados e auxílio técnico', themeColor: '#38bdf8', iconType: 'headphones' },
    { id: 'voice_channel-financeiro', name: 'Financeiro — Sala de Voz', sector: 'Financeiro', desc: 'Cobranças, conciliações e pagamentos', themeColor: '#34d399', iconType: 'dollar' },
    { id: 'voice_channel-comercial', name: 'Comercial & Vendas — Call', sector: 'Comercial & Vendas', desc: 'Reuniões de vendas e propostas', themeColor: '#fb923c', iconType: 'flame' },
    { id: 'voice_channel-diretoria', name: 'Diretoria & Gestão — Call', sector: 'Diretoria & Gestão', desc: 'Canal executivo e alinhamentos', themeColor: '#a855f7', iconType: 'shield' },
    { id: 'voice_channel-reuniao-1', name: 'Sala de Reunião 1', sector: 'Reuniões', desc: 'Conferências e apresentações em grupo', themeColor: '#6366f1', iconType: 'video' },
    { id: 'voice_channel-reuniao-2', name: 'Sala de Reunião 2', sector: 'Reuniões', desc: 'Reuniões rápidas e alinhamentos', themeColor: '#ec4899', iconType: 'coffee' }
  ];

  const sectorChannels = internalRoomsList.filter(r => r.tipo === 'canal');
  sectorChannels.forEach(sc => {
    const vid = `voice_${sc.id}`;
    if (!defaultVoiceRooms.some(r => r.id === vid || r.id === `voice_channel-${sc.nome.toLowerCase().replace(/[^a-z0-9]/g, '')}`)) {
      defaultVoiceRooms.push({
        id: vid,
        name: `${sc.nome} — Voz`,
        sector: sc.nome,
        desc: `Sala de voz pública do setor ${sc.nome}`,
        themeColor: '#38bdf8',
        iconType: 'users'
      });
    }
  });

  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();
  const voiceRooms = q
    ? defaultVoiceRooms.filter(r => r.name.toLowerCase().includes(q) || r.sector.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q))
    : defaultVoiceRooms;

  if (voiceRooms.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center space-y-2 internal-tab-pane-anim">
        <p class="text-xs text-[var(--color-text-muted)] font-semibold">${q ? 'Nenhuma sala encontrada.' : 'Nenhuma sala cadastrada.'}</p>
      </div>
    `;
    updateAllInternalBadges();
    return;
  }

  if (forceClean || container.querySelector('.internal-tab-pane-anim')) {
    container.innerHTML = '';
  }

  const renderedRoomIds = new Set();

  voiceRooms.forEach((room, index) => {
    renderedRoomIds.add(String(room.id));
    const serverSession = (activeVoiceRoomsSummary || []).find(s => String(s.id) === String(room.id));
    const isLocalCurrent = currentVoiceSession && String(currentVoiceSession.id) === String(room.id);

    let participants = serverSession && serverSession.participants ? [...serverSession.participants] : [];
    if (isLocalCurrent) {
      const myId = currentOperator ? String(currentOperator.id) : null;
      if (myId && !participants.some(p => String(p.operatorId) === myId)) {
        participants.unshift({
          operatorId: myId,
          operatorName: currentOperator.name || currentOperator.nome || 'Você',
          avatar: currentOperator.avatar || null,
          isMuted: currentVoiceSession.isMuted,
          isSpeaking: currentVoiceSession.isSpeaking
        });
      }
    }

    const pCount = participants.length;
    const isLive = pCount > 0;

    const subtitleHTML = isLive
      ? `<span class="text-emerald-400 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ${pCount} em chamada</span>`
      : escapeHtml(room.desc);

    const isMuted = !!currentVoiceSession?.isMuted;
    const actionsHTML = isLocalCurrent ? `
      <div class="flex flex-row items-center gap-1.5 shrink-0 whitespace-nowrap voice-actions-connected-group">
        <span class="h-7 px-2 rounded-lg text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex flex-row items-center justify-center gap-1 shadow-xs whitespace-nowrap shrink-0 select-none" data-tooltip="Conectado à sala de voz">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
          <span class="hidden sm:inline">Conectado</span>
        </span>
        <button type="button" onclick="toggleVoiceMute()" class="voice-btn-mute-toggle w-7 h-7 rounded-xl text-[11px] font-extrabold ${isMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'} cursor-pointer flex items-center justify-center shrink-0 transition-colors duration-200 select-none" data-tooltip="${isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0">
            ${isMuted 
              ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
              : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
            }
          </svg>
        </button>
        <button type="button" onclick="leaveCurrentVoiceCall()" class="w-7 h-7 rounded-xl text-[11px] font-extrabold bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white cursor-pointer shadow-sm shadow-rose-500/25 flex items-center justify-center shrink-0 transition-transform active:scale-95 select-none" data-tooltip="Sair da sala de voz">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
        </button>
      </div>
    ` : (connectingVoiceRoomId === room.id ? `
      <button type="button" disabled class="voice-btn-connecting-anim h-7 px-3.5 rounded-xl font-extrabold text-[11px] text-white flex flex-row items-center justify-center gap-1.5 opacity-90 cursor-wait shadow-xs whitespace-nowrap shrink-0 select-none animate-pulse" style="background: linear-gradient(135deg, #10b981, #059669);">
        <svg class="animate-spin shrink-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
        <span class="whitespace-nowrap shrink-0">Conectando...</span>
      </button>
    ` : `
      <button type="button" onclick="joinSectorVoiceRoom('${room.id}', '${escapeHtml(room.name)}', 'channel')" class="voice-btn-enter-anim h-7 px-3.5 rounded-xl font-extrabold text-[11px] text-white flex flex-row items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 whitespace-nowrap shrink-0 select-none" style="background: ${isLive ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 80%, black))'};">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <span class="whitespace-nowrap shrink-0">${isLive ? `Entrar (${pCount})` : 'Entrar'}</span>
      </button>
    `);

    const iconHTML = isLocalCurrent ? `
      <div class="voice-equalizer">
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
        <span class="voice-equalizer-bar"></span>
      </div>
    ` : `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    `;

    const participantsChipsHTML = participants.map(p => {
      const name = p.operatorName || 'Participante';
      const initial = name.charAt(0).toUpperCase();
      const isSpeaking = p.isSpeaking;
      const isMutedP = p.isMuted;
      return `
        <div class="voice-participant-chip" data-op-id="${escapeHtml(String(p.operatorId || ''))}" title="${escapeHtml(name)} ${isMutedP ? '(Mutado)' : (isSpeaking ? '(Falando...)' : '')}">
          <div class="w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 border-2 border-[#0f172a] shadow-sm transition-all duration-200 overflow-hidden ${isSpeaking ? 'scale-110 z-10 animate-pulse' : ''} ${isMutedP ? 'opacity-60' : ''}" style="background: linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 65%, black)); ${isSpeaking ? 'box-shadow: 0 0 0 2px var(--color-primary-theme, #ef4444);' : ''}">
            ${p.avatar ? `<img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(name)}" class="w-full h-full object-cover">` : `<span class="text-white drop-shadow">${initial}</span>`}
          </div>
          ${isMutedP ? `<span class="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 border border-[#0f172a]"></span>` : ''}
          <div class="voice-tooltip">
            ${escapeHtml(name)} ${isMutedP ? '🔇' : (isSpeaking ? '🎙️' : '')}
          </div>
        </div>
      `;
    }).join('');

    const participantsTrayHTML = isLocalCurrent && participants.length > 0 ? `
      <div class="voice-card-participants voice-tray-entering flex items-center justify-between border-t border-white/[0.08] pt-2.5 mt-2.5 w-full">
        <span class="voice-card-count-text text-[10px] font-extrabold text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Na chamada (${participants.length})
        </span>
        <div class="voice-card-chips-container flex items-center -space-x-1.5 overflow-visible">
          ${participantsChipsHTML}
        </div>
      </div>
    ` : '';

    let card = container.querySelector(`[data-voice-room-id="${room.id}"]`);
    if (card) {
      card.className = `p-3.5 internal-card flex flex-col justify-between select-none transition-all duration-300 ${isLocalCurrent ? 'internal-card-active' : ''}`;
      
      const iconEl = card.querySelector('.voice-icon-box');
      if (iconEl) {
        iconEl.className = `w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 voice-icon-box ${isLocalCurrent ? 'voice-pulse-beacon' : ''}`;
        iconEl.style.background = isLocalCurrent ? 'rgba(16, 185, 129, 0.2)' : `color-mix(in srgb, ${room.themeColor} 18%, transparent)`;
        iconEl.style.color = isLocalCurrent ? '#10b981' : room.themeColor;
        iconEl.style.borderColor = isLocalCurrent ? 'rgba(16, 185, 129, 0.4)' : `color-mix(in srgb, ${room.themeColor} 30%, transparent)`;
        const iconKey = isLocalCurrent ? 'connected' : 'idle';
        if (iconEl.dataset.iconKey !== iconKey) {
          iconEl.innerHTML = `<div class="voice-icon-pop-anim">${iconHTML}</div>`;
          iconEl.dataset.iconKey = iconKey;
        }
      }

      const subtitleEl = card.querySelector('.voice-room-subtitle');
      if (subtitleEl && subtitleEl.innerHTML !== subtitleHTML) {
        subtitleEl.innerHTML = subtitleHTML;
      }
      const actionsEl = card.querySelector('.voice-room-actions');
      const actionKey = isLocalCurrent ? 'connected' : `live_${isLive}_${pCount}_${connectingVoiceRoomId === room.id}`;
      if (actionsEl && actionsEl.dataset.actionKey !== actionKey) {
        actionsEl.dataset.actionKey = actionKey;
        actionsEl.innerHTML = actionsHTML;
      } else if (actionsEl && isLocalCurrent) {
        const muteBtn = actionsEl.querySelector('.voice-btn-mute-toggle');
        if (muteBtn) {
          muteBtn.className = `voice-btn-mute-toggle h-7 w-[84px] min-w-[84px] px-2 rounded-xl text-[11px] font-extrabold ${isMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'} cursor-pointer flex flex-row items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-200 select-none`;
          muteBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0">
              ${isMuted 
                ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
                : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
              }
            </svg>
            <span class="whitespace-nowrap shrink-0">${isMuted ? 'Desmutar' : 'Mutar'}</span>
          `;
        }
      }

      let trayEl = card.querySelector('.voice-card-participants');
      if (isLocalCurrent && participants.length > 0) {
        if (trayEl && trayEl.classList.contains('voice-tray-collapsing')) {
          trayEl.remove();
          trayEl = null;
        }
        if (!trayEl) {
          card.insertAdjacentHTML('beforeend', participantsTrayHTML);
        } else {
          // Atualiza apenas os chips internamente sem resetar a bandeja
          const countEl = trayEl.querySelector('.voice-card-count-text');
          if (countEl) countEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Na chamada (${participants.length})`;
          const chipsContainer = trayEl.querySelector('.voice-card-chips-container');
          if (chipsContainer) {
            chipsContainer.innerHTML = participantsChipsHTML;
          }
        }
      } else if (trayEl) {
        if (!trayEl.classList.contains('voice-tray-collapsing')) {
          trayEl.remove();
        }
      }
    } else {
      card = document.createElement('div');
      card.setAttribute('data-voice-room-id', String(room.id));
      card.className = `p-3.5 internal-card internal-card-enter flex flex-col justify-between select-none transition-all duration-300 ${isLocalCurrent ? 'internal-card-active' : ''}`;
      card.style.animationDelay = `${Math.min(index, 12) * 0.03}s`;

      card.innerHTML = `
        <div class="voice-card-main flex items-center justify-between gap-3 w-full">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 voice-icon-box ${isLocalCurrent ? 'voice-pulse-beacon' : ''}" style="background: ${isLocalCurrent ? 'rgba(16, 185, 129, 0.2)' : `color-mix(in srgb, ${room.themeColor} 18%, transparent)`}; color: ${isLocalCurrent ? '#10b981' : room.themeColor}; border: 1px solid ${isLocalCurrent ? 'rgba(16, 185, 129, 0.4)' : `color-mix(in srgb, ${room.themeColor} 30%, transparent)`};" data-icon-key="${isLocalCurrent ? 'connected' : 'idle'}">
              <div class="voice-icon-pop-anim">${iconHTML}</div>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <h4 class="text-xs font-extrabold text-foreground truncate">${escapeHtml(room.name)}</h4>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase internal-sector-tag shrink-0" style="color: ${room.themeColor}; border-color: color-mix(in srgb, ${room.themeColor} 25%, transparent);">
                  ${escapeHtml(room.sector)}
                </span>
              </div>
              <p class="voice-room-subtitle text-[11px] text-[var(--color-text-muted)] truncate font-medium">${subtitleHTML}</p>
            </div>
          </div>

          <div class="voice-room-actions flex flex-row items-center gap-2 shrink-0 whitespace-nowrap" data-action-key="${isLocalCurrent ? 'connected' : `live_${isLive}_${pCount}_${connectingVoiceRoomId === room.id}`}">
            ${actionsHTML}
          </div>
        </div>
        ${participantsTrayHTML}
      `;

      container.appendChild(card);
    }
  });

  Array.from(container.children).forEach(child => {
    const roomId = child.getAttribute('data-voice-room-id');
    if (roomId && !renderedRoomIds.has(roomId)) {
      child.remove();
    }
  });

  updateAllInternalBadges();
}

// ==============================================================================
// 6. ATUALIZAÇÃO GLOBAL DE BADGES UNREADS & ATIVOS
// ==============================================================================
function updateAllInternalBadges() {
  const currentOpId = currentOperator ? String(currentOperator.id) : null;

  // 1. Pessoal DMs
  let totalDMsUnread = 0;
  (internalOperatorsList || []).forEach(op => {
    if (!op || (currentOpId && String(op.id) === currentOpId)) return;
    const dmRoomId = `dm_${[currentOpId || 'me', op.id].sort().join('_')}`;
    totalDMsUnread += (internalRoomUnreads[dmRoomId] || 0);
  });

  const badgePessoalDms = document.getElementById('badge-pessoal-dms-unread');
  if (badgePessoalDms) {
    if (totalDMsUnread > 0) {
      badgePessoalDms.textContent = totalDMsUnread;
      badgePessoalDms.classList.remove('hidden');
    } else {
      badgePessoalDms.classList.add('hidden');
    }
  }

  // 2. Pessoal Grupos
  let totalGroupsUnread = 0;
  internalRoomsList.filter(r => r.tipo === 'grupo').forEach(g => {
    totalGroupsUnread += (internalRoomUnreads[g.id] || 0);
  });

  const badgePessoalGroups = document.getElementById('badge-pessoal-groups-unread');
  if (badgePessoalGroups) {
    if (totalGroupsUnread > 0) {
      badgePessoalGroups.textContent = totalGroupsUnread;
      badgePessoalGroups.classList.remove('hidden');
    } else {
      badgePessoalGroups.classList.add('hidden');
    }
  }



  // Badge Principal Pessoal
  const totalPessoalUnread = totalDMsUnread + totalGroupsUnread;
  const badgeMainPessoal = document.getElementById('badge-internal-pessoal-unread');
  if (badgeMainPessoal) {
    if (totalPessoalUnread > 0) {
      badgeMainPessoal.textContent = totalPessoalUnread;
      badgeMainPessoal.classList.remove('hidden');
    } else {
      badgeMainPessoal.classList.add('hidden');
    }
  }

  // 4. Geral Canais
  let totalChannelsUnread = 0;
  internalRoomsList.filter(r => r.tipo === 'canal').forEach(c => {
    totalChannelsUnread += (internalRoomUnreads[c.id] || 0);
  });

  const badgeGeralChannels = document.getElementById('badge-geral-channels-unread');
  if (badgeGeralChannels) {
    if (totalChannelsUnread > 0) {
      badgeGeralChannels.textContent = totalChannelsUnread;
      badgeGeralChannels.classList.remove('hidden');
    } else {
      badgeGeralChannels.classList.add('hidden');
    }
  }

  // 5. Geral Voice Active
  let activePublicCallsCount = 0;
  (activeVoiceRoomsSummary || []).forEach(s => {
    if (s.participants && s.participants.length > 0) activePublicCallsCount++;
  });

  const badgeGeralVoice = document.getElementById('badge-geral-voice-active');
  if (badgeGeralVoice) {
    if (activePublicCallsCount > 0) {
      badgeGeralVoice.textContent = activePublicCallsCount;
      badgeGeralVoice.classList.remove('hidden');
    } else {
      badgeGeralVoice.classList.add('hidden');
    }
  }

  // Badge Principal Geral
  const badgeMainGeral = document.getElementById('badge-internal-geral-unread');
  if (badgeMainGeral) {
    if (totalChannelsUnread > 0) {
      badgeMainGeral.textContent = totalChannelsUnread;
      badgeMainGeral.classList.remove('hidden');
    } else {
      badgeMainGeral.classList.add('hidden');
    }
  }

  updateInternalTotalUnreadBadge();
}

function refreshInternalUI() {
  if (internalMainActiveTab === 'pessoal') {
    if (internalPessoalSubTab === 'dms') renderPessoalDMs();
    else if (internalPessoalSubTab === 'groups') renderPessoalGroups();
    else if (internalPessoalSubTab === 'voice') renderPessoalVoice();
  } else {
    if (internalGeralSubTab === 'channels') renderGeralChannels();
    else if (internalGeralSubTab === 'voice') renderGeralVoice();
  }
  updateAllInternalBadges();
}

// ==============================================================================
// 7. MODAL DE CRIAÇÃO DE GRUPO
// ==============================================================================
let groupSelectedMemberIds = new Set();

function openCreateGroupModal() {
  const modal = document.getElementById('internal-create-group-modal');
  const nameInput = document.getElementById('input-group-name');
  const descInput = document.getElementById('input-group-desc');
  const searchInput = document.getElementById('input-group-search-members');

  groupSelectedMemberIds.clear();

  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (searchInput) searchInput.value = '';

  renderGroupDualLists();

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
    const dialog = modal.querySelector('.internal-card') || modal.firstElementChild;
    if (dialog) dialog.classList.add('internal-modal-dialog');
  }
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function closeCreateGroupModal() {
  const modal = document.getElementById('internal-create-group-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('internal-modal-overlay');
  }
  groupSelectedMemberIds.clear();
}

function renderGroupDualLists() {
  renderGroupAvailableMembersList();
  renderGroupSelectedMembersList();
}

function renderGroupAvailableMembersList(filterQuery = '') {
  const container = document.getElementById('group-members-checklist');
  const counter = document.getElementById('group-available-members-count');
  if (!container) return;

  container.innerHTML = '';
  const currentOpId = currentOperator ? String(currentOperator.id) : null;
  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();

  const availableOps = internalOperatorsList.filter(op => {
    if (!op) return false;
    const idStr = String(op.id);
    if (currentOpId && idStr === currentOpId) return false;
    if (groupSelectedMemberIds.has(idStr)) return false;
    if (q) {
      const matchName = (op.nome || '').toLowerCase().includes(q);
      const matchSetor = (op.setor || '').toLowerCase().includes(q);
      return matchName || matchSetor;
    }
    return true;
  });

  if (counter) counter.textContent = `${availableOps.length} disponíveis`;

  if (availableOps.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--color-text-muted)] my-auto">
        <p class="text-xs font-bold text-foreground">Nenhum colega disponível</p>
        <p class="text-[10px] text-[var(--color-text-muted)] mt-0.5">${q ? 'Nenhum resultado para a busca.' : 'Todos os colegas foram adicionados.'}</p>
      </div>
    `;
    return;
  }

  availableOps.forEach(op => {
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'U';
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all cursor-pointer select-none group';
    item.onclick = () => addMemberToGroup(op.id);

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="relative w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 internal-avatar bg-[var(--color-primary-theme)] text-white">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-lg">` : initial}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-foreground truncate leading-tight">${escapeHtml(op.nome)}</p>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(op.setor || 'Equipe')}</p>
        </div>
      </div>
      <button type="button" class="w-6 h-6 rounded-lg bg-white/10 group-hover:bg-[var(--color-primary-theme)] group-hover:text-white text-slate-300 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    `;
    container.appendChild(item);
  });
}

function renderGroupSelectedMembersList() {
  const container = document.getElementById('group-selected-list');
  const counter = document.getElementById('group-selected-members-count');
  if (!container) return;

  container.innerHTML = '';
  const count = groupSelectedMemberIds.size;
  if (counter) counter.textContent = `${count} adicionados`;

  if (count === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--color-text-muted)] my-auto">
        <div class="w-9 h-9 rounded-xl mb-2 flex items-center justify-center internal-icon-box opacity-60">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
        </div>
        <p class="text-xs font-bold text-foreground">Nenhum membro no grupo</p>
        <p class="text-[10px] text-[var(--color-text-muted)] mt-0.5 max-w-[180px]">Clique nos colegas à esquerda para incluí-los no grupo.</p>
      </div>
    `;
    return;
  }

  groupSelectedMemberIds.forEach(id => {
    const op = internalOperatorsList.find(o => String(o.id) === String(id));
    const name = op ? op.nome : id;
    const setor = op ? op.setor : 'Equipe';
    const avatar = op ? op.avatar : null;
    const initial = name ? name.charAt(0).toUpperCase() : 'U';

    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all select-none group';

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="relative w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 internal-avatar bg-[var(--color-primary-theme)] text-white">
          ${avatar ? `<img src="${avatar}" class="w-full h-full object-cover rounded-lg">` : initial}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-foreground truncate leading-tight">${escapeHtml(name)}</p>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(setor)}</p>
        </div>
      </div>
      <button type="button" onclick="removeMemberFromGroup('${id}')" class="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/20 hover:border-rose-500/40 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    container.appendChild(item);
  });
}

function filterGroupMembersChecklist() {
  const searchInput = document.getElementById('input-group-search-members');
  const q = searchInput ? searchInput.value : '';
  renderGroupAvailableMembersList(q);
}

function addMemberToGroup(opId) {
  groupSelectedMemberIds.add(String(opId));
  renderGroupDualLists();
}

function removeMemberFromGroup(opId) {
  groupSelectedMemberIds.delete(String(opId));
  renderGroupDualLists();
}

function submitCreateGroup() {
  const nameInput = document.getElementById('input-group-name');
  const descInput = document.getElementById('input-group-desc');

  const nome = nameInput ? nameInput.value.trim() : '';
  if (!nome) {
    if (nameInput) nameInput.focus();
    return;
  }

  const descricao = descInput ? descInput.value.trim() : '';
  const membros = Array.from(groupSelectedMemberIds);

  const opId = currentOperator ? currentOperator.id : 'admin';
  const opNome = currentOperator ? currentOperator.nome : 'Administrador';

  socket.emit('internal_create_group', {
    nome,
    descricao,
    membros,
    atendente_id: opId,
    atendente_nome: opNome
  });

  closeCreateGroupModal();
}

// ==============================================================================
// 8. MODAL DE CRIAÇÃO DE SALA DE CALL PRIVADA
// ==============================================================================
function openCreatePrivateCallModal() {
  const modal = document.getElementById('internal-create-private-call-modal');
  const nameInput = document.getElementById('input-private-call-name');
  const descInput = document.getElementById('input-private-call-desc');
  const searchInput = document.getElementById('input-private-call-search-members');

  privateCallSelectedMemberIds.clear();

  if (nameInput) nameInput.value = '';
  if (descInput) descInput.value = '';
  if (searchInput) searchInput.value = '';

  renderPrivateCallDualLists();

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
  }
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function closeCreatePrivateCallModal() {
  const modal = document.getElementById('internal-create-private-call-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('internal-modal-overlay');
  }
  privateCallSelectedMemberIds.clear();
}

function renderPrivateCallDualLists() {
  renderPrivateCallAvailableMembersList();
  renderPrivateCallSelectedMembersList();
}

function renderPrivateCallAvailableMembersList(filterQuery = '') {
  const container = document.getElementById('private-call-members-checklist');
  const counter = document.getElementById('private-call-available-members-count');
  if (!container) return;

  container.innerHTML = '';
  const currentOpId = currentOperator ? String(currentOperator.id) : null;
  const q = (typeof filterQuery === 'string' ? filterQuery : '').trim().toLowerCase();

  const availableOps = internalOperatorsList.filter(op => {
    if (!op) return false;
    const idStr = String(op.id);
    if (currentOpId && idStr === currentOpId) return false;
    if (privateCallSelectedMemberIds.has(idStr)) return false;
    if (q) {
      const matchName = (op.nome || '').toLowerCase().includes(q);
      const matchSetor = (op.setor || '').toLowerCase().includes(q);
      return matchName || matchSetor;
    }
    return true;
  });

  if (counter) counter.textContent = `${availableOps.length} disponíveis`;

  if (availableOps.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--color-text-muted)] my-auto">
        <p class="text-xs font-bold text-foreground">Nenhum colega disponível</p>
        <p class="text-[10px] text-[var(--color-text-muted)] mt-0.5">${q ? 'Nenhum resultado para a busca.' : 'Todos os colegas foram convidados.'}</p>
      </div>
    `;
    return;
  }

  availableOps.forEach(op => {
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'U';
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all cursor-pointer select-none group';
    item.onclick = () => addMemberToPrivateCall(op.id);

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="relative w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 internal-avatar bg-purple-600 text-white">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-lg">` : initial}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-foreground truncate leading-tight">${escapeHtml(op.nome)}</p>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(op.setor || 'Equipe')}</p>
        </div>
      </div>
      <button type="button" class="w-6 h-6 rounded-lg bg-white/10 group-hover:bg-purple-600 group-hover:text-white text-slate-300 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    `;
    container.appendChild(item);
  });
}

function renderPrivateCallSelectedMembersList() {
  const container = document.getElementById('private-call-selected-list');
  const counter = document.getElementById('private-call-selected-members-count');
  if (!container) return;

  container.innerHTML = '';
  const count = privateCallSelectedMemberIds.size;
  if (counter) counter.textContent = `${count} convidados`;

  if (count === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-4 text-[var(--color-text-muted)] my-auto">
        <div class="w-9 h-9 rounded-xl mb-2 flex items-center justify-center internal-icon-box opacity-60" style="background: color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent); color: var(--color-primary-theme, #ef4444);">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
        </div>
        <p class="text-xs font-bold text-foreground">Nenhum convidado</p>
        <p class="text-[10px] text-[var(--color-text-muted)] mt-0.5 max-w-[180px]">Clique nos colegas à esquerda para convidá-los para a call.</p>
      </div>
    `;
    return;
  }

  privateCallSelectedMemberIds.forEach(id => {
    const op = internalOperatorsList.find(o => String(o.id) === String(id));
    const name = op ? op.nome : id;
    const setor = op ? op.setor : 'Equipe';
    const avatar = op ? op.avatar : null;
    const initial = name ? name.charAt(0).toUpperCase() : 'U';

    const item = document.createElement('div');
    item.className = 'flex items-center justify-between gap-2 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all select-none group';

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="relative w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 internal-avatar bg-purple-600 text-white">
          ${avatar ? `<img src="${avatar}" class="w-full h-full object-cover rounded-lg">` : initial}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-bold text-foreground truncate leading-tight">${escapeHtml(name)}</p>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(setor)}</p>
        </div>
      </div>
      <button type="button" onclick="removeMemberFromPrivateCall('${id}')" class="w-6 h-6 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/20 hover:border-rose-500/40 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    container.appendChild(item);
  });
}

function filterPrivateCallMembersChecklist() {
  const searchInput = document.getElementById('input-private-call-search-members');
  const q = searchInput ? searchInput.value : '';
  renderPrivateCallAvailableMembersList(q);
}

function addMemberToPrivateCall(opId) {
  privateCallSelectedMemberIds.add(String(opId));
  renderPrivateCallDualLists();
}

function removeMemberFromPrivateCall(opId) {
  privateCallSelectedMemberIds.delete(String(opId));
  renderPrivateCallDualLists();
}

function submitCreatePrivateCall() {
  const nameInput = document.getElementById('input-private-call-name');
  const descInput = document.getElementById('input-private-call-desc');

  const nome = nameInput ? nameInput.value.trim() : '';
  if (!nome) {
    if (nameInput) nameInput.focus();
    return;
  }

  const descricao = descInput ? descInput.value.trim() : '';
  const membros = Array.from(privateCallSelectedMemberIds);

  const opId = currentOperator ? currentOperator.id : 'admin';
  const opNome = currentOperator ? currentOperator.nome : 'Administrador';

  socket.emit('internal_create_group', {
    nome,
    descricao,
    membros,
    tipo: 'sala_privada',
    atendente_id: opId,
    atendente_nome: opNome
  });

  closeCreatePrivateCallModal();
}

// Abrir Conversa Particular 1x1 (DM)
function openInternalDM(otherId, otherName, otherSetor, otherStatus) {
  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
  const dmRoomId = `dm_${[currentOpId, String(otherId)].sort().join('_')}`;
  
  currentInternalRoomId = dmRoomId;
  internalRoomUnreads[dmRoomId] = 0;
  updateInternalTotalUnreadBadge();

  const dirView = document.getElementById('internal-directory-view');
  const chatView = document.getElementById('internal-chat-view');
  const backBtn = document.getElementById('btn-internal-back-to-list');
  const titleEl = document.getElementById('internal-drawer-title');
  const descEl = document.getElementById('internal-drawer-desc');
  const membersEl = document.getElementById('internal-drawer-members-count');
  const iconContainer = document.getElementById('internal-drawer-icon-container');

  if (dirView) {
    dirView.classList.add('hidden');
    dirView.classList.remove('internal-view-slide-right', 'internal-view-slide-left');
  }
  if (chatView) {
    chatView.classList.remove('hidden');
    chatView.classList.remove('internal-view-slide-left');
    chatView.classList.remove('internal-view-slide-right');
    void chatView.offsetWidth;
    chatView.classList.add('internal-view-slide-right');
  }
  if (backBtn) backBtn.classList.remove('hidden');

  const voiceCallBtn = document.getElementById('btn-internal-voice-call');
  if (voiceCallBtn) {
    voiceCallBtn.classList.remove('hidden');
    voiceCallBtn.classList.add('flex');
  }

  const closeDmBtn = document.getElementById('btn-internal-close-dm');
  if (closeDmBtn) {
    closeDmBtn.classList.remove('hidden');
    closeDmBtn.classList.add('flex');
  }

  if (iconContainer) {
    iconContainer.className = 'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 internal-icon-box transition-all duration-300';
    iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  }

  if (titleEl) titleEl.textContent = otherName || 'Colega';
  if (descEl) {
    descEl.textContent = `${otherSetor || 'Equipe'}`;
    descEl.classList.remove('hidden');
  }
  if (membersEl) {
    membersEl.textContent = otherStatus ? String(otherStatus).toUpperCase() : 'CONVERSA';
    membersEl.classList.remove('hidden');
  }

  if (currentOperator) {
    socket.emit('internal_join_room', { sala_id: dmRoomId, atendente_id: currentOperator.id });
  }

  renderInternalMessages();
  setTimeout(() => {
    const input = document.getElementById('internal-chat-input');
    if (input) input.focus();
  }, 100);
}

// Encerrar a conversa DM ativa atual
function closeCurrentInternalDM() {
  if (!currentInternalRoomId || !currentInternalRoomId.startsWith('dm_')) return;
  closeInternalDMById(currentInternalRoomId);
}

// Encerrar conversa DM por ID (move para Outros Colegas mantendo histórico)
function closeInternalDMById(roomId, contactName) {
  if (!roomId || !currentOperator) return;
  socket.emit('internal_close_dm', {
    atendente_id: currentOperator.id,
    sala_id: roomId
  });
  internalClosedDMsMap[roomId] = new Date().toISOString();
  if (currentInternalRoomId === roomId) {
    showInternalDirectoryView();
  } else {
    renderInternalDMsList();
  }
  showInputBarNotification(`Conversa ${contactName ? 'com ' + contactName : ''} encerrada.`);
}

// Abrir Canal da Equipe
function openInternalChannel(channelId, channelName, channelDesc) {
  currentInternalRoomId = channelId;
  internalRoomUnreads[channelId] = 0;
  updateInternalTotalUnreadBadge();

  const dirView = document.getElementById('internal-directory-view');
  const chatView = document.getElementById('internal-chat-view');
  const backBtn = document.getElementById('btn-internal-back-to-list');
  const titleEl = document.getElementById('internal-drawer-title');
  const descEl = document.getElementById('internal-drawer-desc');
  const membersEl = document.getElementById('internal-drawer-members-count');
  const iconContainer = document.getElementById('internal-drawer-icon-container');

  if (dirView) {
    dirView.classList.add('hidden');
    dirView.classList.remove('internal-view-slide-right', 'internal-view-slide-left');
  }
  if (chatView) {
    chatView.classList.remove('hidden');
    chatView.classList.remove('internal-view-slide-left');
    chatView.classList.remove('internal-view-slide-right');
    void chatView.offsetWidth;
    chatView.classList.add('internal-view-slide-right');
  }
  if (backBtn) backBtn.classList.remove('hidden');

  const voiceCallBtn = document.getElementById('btn-internal-voice-call');
  if (voiceCallBtn) {
    voiceCallBtn.classList.add('hidden');
    voiceCallBtn.classList.remove('flex');
  }

  const closeDmBtn = document.getElementById('btn-internal-close-dm');
  if (closeDmBtn) {
    closeDmBtn.classList.add('hidden');
    closeDmBtn.classList.remove('flex');
  }
  if (iconContainer) {
    iconContainer.className = 'w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-black text-lg shrink-0 internal-icon-box transition-all duration-300';
    iconContainer.innerHTML = '#';
  }

  if (titleEl) titleEl.textContent = channelName;
  if (descEl) {
    descEl.textContent = channelDesc || 'Canal de comunicação da equipe';
    descEl.classList.remove('hidden');
  }
  if (membersEl) {
    membersEl.textContent = 'Canal';
    membersEl.classList.remove('hidden');
  }

  if (currentOperator) {
    socket.emit('internal_join_room', { sala_id: channelId, atendente_id: currentOperator.id });
  }

  renderInternalMessages();
  setTimeout(() => {
    const input = document.getElementById('internal-chat-input');
    if (input) input.focus();
  }, 100);
}

// Abrir Grupo Personalizado da Equipe
function openInternalGroup(groupId, groupName, groupDesc, memberCount, creatorName) {
  currentInternalRoomId = groupId;
  internalRoomUnreads[groupId] = 0;
  updateInternalTotalUnreadBadge();

  const dirView = document.getElementById('internal-directory-view');
  const chatView = document.getElementById('internal-chat-view');
  const backBtn = document.getElementById('btn-internal-back-to-list');
  const titleEl = document.getElementById('internal-drawer-title');
  const descEl = document.getElementById('internal-drawer-desc');
  const membersEl = document.getElementById('internal-drawer-members-count');
  const iconContainer = document.getElementById('internal-drawer-icon-container');

  if (dirView) {
    dirView.classList.add('hidden');
    dirView.classList.remove('internal-view-slide-right', 'internal-view-slide-left');
  }
  if (chatView) {
    chatView.classList.remove('hidden');
    chatView.classList.remove('internal-view-slide-left');
    chatView.classList.remove('internal-view-slide-right');
    void chatView.offsetWidth;
    chatView.classList.add('internal-view-slide-right');
  }
  if (backBtn) backBtn.classList.remove('hidden');

  const voiceCallBtn = document.getElementById('btn-internal-voice-call');
  if (voiceCallBtn) {
    voiceCallBtn.classList.remove('hidden');
    voiceCallBtn.classList.add('flex');
  }

  const closeDmBtn = document.getElementById('btn-internal-close-dm');
  if (closeDmBtn) {
    closeDmBtn.classList.add('hidden');
    closeDmBtn.classList.remove('flex');
  }

  if (iconContainer) {
    iconContainer.className = 'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 internal-icon-box transition-all duration-300';
    iconContainer.style.background = 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent)';
    iconContainer.style.color = 'var(--color-primary-theme, #ef4444)';
    iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }

  if (titleEl) titleEl.textContent = groupName || 'Grupo da Equipe';
  if (descEl) {
    descEl.textContent = groupDesc || 'Grupo personalizado de troca de mensagens';
    descEl.classList.remove('hidden');
  }
  if (membersEl) {
    membersEl.textContent = memberCount ? String(memberCount).toUpperCase() : 'GRUPO';
    membersEl.classList.remove('hidden');
  }

  if (currentOperator) {
    socket.emit('internal_join_room', { sala_id: groupId, atendente_id: currentOperator.id });
  }

  renderInternalMessages();
  setTimeout(() => {
    const input = document.getElementById('internal-chat-input');
    if (input) {
      input.placeholder = 'Digite uma mensagem para o grupo...';
      input.focus();
    }
  }, 100);
}

// ==============================================================================
// MODAL DE GESTÃO COMPLETA DE MEMBROS, PERMISSÕES E CONFIGURAÇÕES DO GRUPO
// ==============================================================================
let currentInspectedGroupId = null;
let currentGroupActiveTab = 'members';
let selectedNewMemberIds = new Set();

function switchGroupModalTab(tab) {
  currentGroupActiveTab = tab;
  const tabBtnMembers = document.getElementById('tab-btn-group-members');
  const tabBtnSettings = document.getElementById('tab-btn-group-settings');
  const paneMembers = document.getElementById('group-tab-pane-members');
  const paneSettings = document.getElementById('group-tab-pane-settings');

  if (tab === 'members') {
    if (tabBtnMembers) {
      tabBtnMembers.className = 'py-2.5 px-3 text-xs font-extrabold border-b-2 border-[var(--color-primary-theme,#ef4444)] text-foreground flex items-center gap-1.5 transition-all cursor-pointer';
    }
    if (tabBtnSettings) {
      tabBtnSettings.className = 'py-2.5 px-3 text-xs font-bold border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-foreground flex items-center gap-1.5 transition-all cursor-pointer';
    }
    if (paneMembers) paneMembers.classList.remove('hidden');
    if (paneSettings) paneSettings.classList.add('hidden');
  } else {
    if (tabBtnMembers) {
      tabBtnMembers.className = 'py-2.5 px-3 text-xs font-bold border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-foreground flex items-center gap-1.5 transition-all cursor-pointer';
    }
    if (tabBtnSettings) {
      tabBtnSettings.className = 'py-2.5 px-3 text-xs font-extrabold border-b-2 border-[var(--color-primary-theme,#ef4444)] text-foreground flex items-center gap-1.5 transition-all cursor-pointer';
    }
    if (paneMembers) paneMembers.classList.add('hidden');
    if (paneSettings) paneSettings.classList.remove('hidden');
  }
}

function openCurrentGroupMembersModal() {
  if (!currentInternalRoomId) return;
  if (currentInternalRoomId.startsWith('dm_')) return;
  openGroupMembersModal(currentInternalRoomId);
}

function parseGroupConfig(room) {
  if (!room) return {};
  try {
    return typeof room.configuracoes === 'string' ? JSON.parse(room.configuracoes) : (room.configuracoes || {});
  } catch (e) {
    return {};
  }
}

function openGroupMembersModal(roomId) {
  if (!roomId) return;
  const room = internalRoomsList.find(r => String(r.id) === String(roomId));
  const modal = document.getElementById('internal-group-members-modal');
  if (!modal) return;

  currentInspectedGroupId = roomId;
  const titleEl = document.getElementById('group-members-modal-title');
  const subtitleEl = document.getElementById('group-members-modal-subtitle');
  const searchInput = document.getElementById('input-search-group-members');
  if (searchInput) searchInput.value = '';

  const groupName = room ? room.nome : 'Grupo';
  if (titleEl) titleEl.textContent = `Gestão • ${groupName}`;
  if (subtitleEl) subtitleEl.textContent = room && room.descricao ? room.descricao : 'Participantes e permissões do grupo';

  const configs = parseGroupConfig(room);
  const currentOpId = currentOperator ? String(currentOperator.id) : '';
  const isCreator = String(room?.criado_por_id || room?.criado_por || '') === currentOpId;
  const isAdmin = isCreator || (Array.isArray(configs.admins) && configs.admins.includes(currentOpId));

  // Popula os campos da aba de configurações
  const nameInput = document.getElementById('input-group-edit-name');
  const descInput = document.getElementById('input-group-edit-desc');
  const onlyAdminSendCheck = document.getElementById('check-group-only-admin-send');
  const onlyAdminInviteCheck = document.getElementById('check-group-only-admin-invite');
  const saveBtn = document.getElementById('btn-group-save-settings');
  const deleteBtn = document.getElementById('btn-group-delete');
  const openAddBtn = document.getElementById('btn-group-open-add-modal');

  if (nameInput) {
    nameInput.value = room ? room.nome : '';
    nameInput.disabled = !isAdmin;
  }
  if (descInput) {
    descInput.value = (room && room.descricao) ? room.descricao : '';
    descInput.disabled = !isAdmin;
  }
  if (onlyAdminSendCheck) {
    onlyAdminSendCheck.checked = !!configs.only_admin_send;
    onlyAdminSendCheck.disabled = !isAdmin;
  }
  if (onlyAdminInviteCheck) {
    onlyAdminInviteCheck.checked = !!configs.only_admin_invite;
    onlyAdminInviteCheck.disabled = !isAdmin;
  }
  if (saveBtn) {
    saveBtn.classList.toggle('hidden', !isAdmin);
  }
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', !isCreator && !isAdmin);
  }
  if (openAddBtn) {
    const canInvite = !configs.only_admin_invite || isAdmin;
    openAddBtn.classList.toggle('hidden', !canInvite);
  }

  switchGroupModalTab('members');
  renderGroupMembersList(roomId, '');

  modal.classList.remove('hidden');
}

function closeGroupMembersModal() {
  const modal = document.getElementById('internal-group-members-modal');
  if (modal) modal.classList.add('hidden');
  currentInspectedGroupId = null;
}

function filterGroupMembersList(query = '') {
  if (!currentInspectedGroupId) return;
  renderGroupMembersList(currentInspectedGroupId, query);
}

function renderGroupMembersList(roomId, query = '') {
  const container = document.getElementById('group-members-list-container');
  const summaryEl = document.getElementById('group-members-modal-count-summary');
  const tabBadge = document.getElementById('group-tab-members-badge');
  if (!container) return;

  const room = internalRoomsList.find(r => String(r.id) === String(roomId));
  let memberIds = [];

  if (room && room.membros) {
    try {
      const m = typeof room.membros === 'string' ? JSON.parse(room.membros) : room.membros;
      if (Array.isArray(m)) memberIds = m.map(String);
    } catch (e) {}
  }

  let memberOperators = [];
  if (memberIds.length > 0) {
    memberOperators = memberIds.map(id => {
      const found = internalOperatorsList.find(o => String(o.id) === String(id));
      if (found) return found;
      return { id: String(id), nome: `Operador #${id}`, setor: 'Equipe', status: 'offline' };
    });
  } else {
    memberOperators = [...internalOperatorsList];
  }

  const configs = parseGroupConfig(room);
  const creatorId = room ? String(room.criado_por_id || room.criado_por || '') : '';
  const currentOpId = currentOperator ? String(currentOperator.id) : '';
  const isCurrentOpAdmin = creatorId === currentOpId || (Array.isArray(configs.admins) && configs.admins.includes(currentOpId));

  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? memberOperators.filter(op => (op.nome && op.nome.toLowerCase().includes(q)) || (op.setor && op.setor.toLowerCase().includes(q)))
    : memberOperators;

  container.innerHTML = '';

  const totalCount = memberOperators.length;
  if (summaryEl) summaryEl.textContent = `${totalCount} ${totalCount === 1 ? 'membro' : 'membros'}`;
  if (tabBadge) tabBadge.textContent = totalCount;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center text-[var(--color-text-muted)] space-y-1">
        <p class="text-xs font-bold">Nenhum membro encontrado</p>
        <p class="text-[10px]">Tente outro termo na busca.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(op => {
    const isMe = String(op.id) === currentOpId;
    const isCreator = String(op.id) === creatorId;
    const isAdmin = isCreator || (Array.isArray(configs.admins) && configs.admins.includes(String(op.id)));
    const isMuted = Array.isArray(configs.muted_members) && configs.muted_members.includes(String(op.id));
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'O';

    let statusColor = 'bg-slate-500';
    let statusLabel = 'Offline';
    if (op.status === 'online') {
      statusColor = 'bg-emerald-500 shadow-sm shadow-emerald-500 ring-2 ring-emerald-500/20';
      statusLabel = 'Disponível';
    } else if (op.status === 'atendendo') {
      statusColor = 'bg-amber-500 shadow-sm shadow-amber-500 ring-2 ring-amber-500/20';
      statusLabel = 'Em Atendimento';
    } else if (op.status === 'ocupado') {
      statusColor = 'bg-rose-500 shadow-sm shadow-rose-500 ring-2 ring-rose-500/20';
      statusLabel = 'Ocupado';
    } else if (op.status === 'ausente') {
      statusColor = 'bg-orange-500 shadow-sm shadow-orange-500 ring-2 ring-orange-500/20';
      statusLabel = 'Ausente';
    }

    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl internal-card flex items-center justify-between gap-3 select-none hover:border-slate-600/40 transition-all';

    item.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="relative w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 internal-avatar text-white" style="background: var(--color-primary-theme, #ef4444);">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-xl">` : initial}
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${statusColor} border-2 border-[var(--color-card,#0f172a)]"></span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-bold text-foreground truncate">${escapeHtml(op.nome || 'Colega')}</span>
            ${isMe ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Você</span>' : ''}
            ${isCreator ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">Criador</span>' : (isAdmin ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Admin</span>' : '')}
            ${isMuted ? '<span class="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">Mudo</span>' : ''}
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(op.setor || 'Equipe')}</span>
            <span class="text-[10px] text-slate-500">•</span>
            <span class="text-[10px] font-medium" style="color: ${op.status === 'online' ? '#10b981' : (op.status === 'atendendo' ? '#f59e0b' : '#94a3b8')}">${statusLabel}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        ${!isMe ? `
          <button type="button" onclick="startDirectDMFromGroupModal('${op.id}', '${escapeHtml(op.nome || '')}', '${escapeHtml(op.setor || '')}', '${op.status || 'online'}')" class="px-2 py-1.5 rounded-lg text-[11px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/10 flex items-center gap-1 cursor-pointer active:scale-95 transition-all" title="Conversar no particular">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span class="hidden sm:inline">Conversar</span>
          </button>
        ` : ''}

        ${(isCurrentOpAdmin && !isMe && !isCreator) ? `
          <!-- Botão Toggle Admin -->
          <button type="button" onclick="toggleGroupMemberAdmin('${op.id}')" class="w-7 h-7 rounded-lg text-[11px] font-bold ${isAdmin ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'} flex items-center justify-center cursor-pointer transition-all" title="${isAdmin ? 'Remover função de Administrador' : 'Promover a Administrador'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </button>

          <!-- Botão Toggle Silenciar / Mudo -->
          <button type="button" onclick="toggleGroupMemberMute('${op.id}')" class="w-7 h-7 rounded-lg text-[11px] font-bold ${isMuted ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'} flex items-center justify-center cursor-pointer transition-all" title="${isMuted ? 'Permitir envio de mensagens' : 'Silenciar membro (Modo Somente Leitura)'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${isMuted ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>' : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'}</svg>
          </button>

          <!-- Botão Remover do Grupo -->
          <button type="button" onclick="removeGroupMember('${op.id}', '${escapeHtml(op.nome)}')" class="w-7 h-7 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 flex items-center justify-center cursor-pointer transition-all" title="Remover do Grupo">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ` : ''}
      </div>
    `;

    container.appendChild(item);
  });
}

function startDirectDMFromGroupModal(opId, opName, opSetor, opStatus) {
  closeGroupMembersModal();
  openInternalDM(opId, opName, opSetor, opStatus);
}

// ------------------------------------------------------------------------------
// SUB-MODAL: ADICIONAR NOVOS MEMBROS
// ------------------------------------------------------------------------------
function openGroupAddMembersModal() {
  if (!currentInspectedGroupId) return;
  const modal = document.getElementById('internal-group-add-members-modal');
  if (!modal) return;

  selectedNewMemberIds.clear();
  const searchInput = document.getElementById('input-search-add-members');
  if (searchInput) searchInput.value = '';

  renderAddMembersList('');
  modal.classList.remove('hidden');
}

function closeGroupAddMembersModal() {
  const modal = document.getElementById('internal-group-add-members-modal');
  if (modal) modal.classList.add('hidden');
  selectedNewMemberIds.clear();
}

function filterAddMembersList(query = '') {
  renderAddMembersList(query);
}

function renderAddMembersList(query = '') {
  const container = document.getElementById('group-add-members-list-container');
  const countEl = document.getElementById('group-add-members-selected-count');
  const confirmBtn = document.getElementById('btn-confirm-add-members');
  if (!container) return;

  const room = internalRoomsList.find(r => String(r.id) === String(currentInspectedGroupId));
  let existingMemberIds = [];
  if (room && room.membros) {
    try {
      const m = typeof room.membros === 'string' ? JSON.parse(room.membros) : room.membros;
      if (Array.isArray(m)) existingMemberIds = m.map(String);
    } catch(e) {}
  }

  // Candidatos que ainda NÃO estão no grupo
  const candidates = internalOperatorsList.filter(op => !existingMemberIds.includes(String(op.id)));

  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? candidates.filter(op => (op.nome && op.nome.toLowerCase().includes(q)) || (op.setor && op.setor.toLowerCase().includes(q)))
    : candidates;

  container.innerHTML = '';
  if (countEl) countEl.textContent = `${selectedNewMemberIds.size} selecionados`;
  if (confirmBtn) confirmBtn.disabled = selectedNewMemberIds.size === 0;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center text-[var(--color-text-muted)] space-y-1">
        <p class="text-xs font-bold">${candidates.length === 0 ? 'Todos os colegas da equipe já fazem parte deste grupo' : 'Nenhum colega encontrado com esse nome'}</p>
      </div>
    `;
    return;
  }

  filtered.forEach(op => {
    const isSelected = selectedNewMemberIds.has(String(op.id));
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'O';

    const item = document.createElement('label');
    item.className = `p-2.5 rounded-xl internal-card flex items-center justify-between gap-3 cursor-pointer select-none transition-all ${isSelected ? 'border-[var(--color-primary-theme,#ef4444)] bg-white/5' : 'hover:border-white/20'}`;

    item.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 internal-avatar text-white" style="background: var(--color-primary-theme, #ef4444);">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover rounded-xl">` : initial}
        </div>
        <div class="min-w-0">
          <p class="text-xs font-bold text-foreground truncate">${escapeHtml(op.nome)}</p>
          <p class="text-[10px] text-[var(--color-text-muted)] truncate">${escapeHtml(op.setor || 'Equipe')}</p>
        </div>
      </div>
      <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelectNewMember('${op.id}', this.checked)" class="w-4 h-4 rounded accent-[var(--color-primary-theme,#ef4444)] cursor-pointer">
    `;

    container.appendChild(item);
  });
}

function toggleSelectNewMember(opId, checked) {
  if (checked) {
    selectedNewMemberIds.add(String(opId));
  } else {
    selectedNewMemberIds.delete(String(opId));
  }
  const countEl = document.getElementById('group-add-members-selected-count');
  const confirmBtn = document.getElementById('btn-confirm-add-members');
  if (countEl) countEl.textContent = `${selectedNewMemberIds.size} selecionados`;
  if (confirmBtn) confirmBtn.disabled = selectedNewMemberIds.size === 0;
}

function confirmAddGroupMembers() {
  if (!currentInspectedGroupId || selectedNewMemberIds.size === 0) return;
  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
  const currentOpId = currentOperator ? String(currentOperator.id) : '';

  socket.emit('internal_add_group_members', {
    sala_id: currentInspectedGroupId,
    novos_membros: Array.from(selectedNewMemberIds),
    adicionado_por_nome: currentOpName,
    adicionado_por_id: currentOpId
  });

  closeGroupAddMembersModal();
  showInputBarNotification('Novos membros adicionados ao grupo!');
}

// ------------------------------------------------------------------------------
// MODAL DE CONFIRMAÇÃO CUSTOMIZADO (Substitui confirm do navegador)
// ------------------------------------------------------------------------------
let internalConfirmCallback = null;

function showInternalConfirmModal({ title, message, confirmText, confirmClass, onConfirm }) {
  const modal = document.getElementById('internal-confirm-action-modal');
  if (!modal) {
    if (onConfirm) onConfirm();
    return;
  }
  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const btn = document.getElementById('confirm-modal-btn-action');

  if (titleEl) titleEl.textContent = title || 'Confirmar Ação';
  if (msgEl) msgEl.textContent = message || 'Tem certeza que deseja prosseguir com esta ação?';
  if (btn) {
    btn.textContent = confirmText || 'Confirmar';
    btn.className = `flex-1 py-2 px-3 rounded-xl text-white text-xs font-extrabold shadow-md transition-all active:scale-95 cursor-pointer ${confirmClass || 'bg-rose-500 hover:bg-rose-400'}`;
  }

  internalConfirmCallback = onConfirm;
  modal.classList.remove('hidden');

  btn.onclick = () => {
    modal.classList.add('hidden');
    if (internalConfirmCallback) {
      const cb = internalConfirmCallback;
      internalConfirmCallback = null;
      cb();
    }
  };
}

function closeInternalConfirmModal() {
  const modal = document.getElementById('internal-confirm-action-modal');
  if (modal) modal.classList.add('hidden');
  internalConfirmCallback = null;
}

// ------------------------------------------------------------------------------
// GESTÃO DE CARGOS E PERMISSÕES INDIVIDUAIS
// ------------------------------------------------------------------------------
function toggleGroupMemberAdmin(opId) {
  if (!currentInspectedGroupId || !opId) return;
  const room = internalRoomsList.find(r => String(r.id) === String(currentInspectedGroupId));
  if (!room) return;

  const configs = parseGroupConfig(room);
  let admins = Array.isArray(configs.admins) ? configs.admins.map(String) : [];

  const targetIdStr = String(opId);
  const isNowAdmin = !admins.includes(targetIdStr);

  if (isNowAdmin) {
    admins.push(targetIdStr);
  } else {
    admins = admins.filter(a => a !== targetIdStr);
  }
  configs.admins = admins;

  // Atualização otimista imediata na memória
  room.configuracoes = configs;
  renderGroupMembersList(currentInspectedGroupId, document.getElementById('input-search-group-members')?.value || '');

  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
  socket.emit('internal_update_group_info', {
    sala_id: currentInspectedGroupId,
    nome: room.nome,
    descricao: room.descricao,
    configuracoes: configs,
    alterado_por_nome: currentOpName
  });

  if (currentInternalRoomId === currentInspectedGroupId) {
    renderInternalMessages();
  }

  showInputBarNotification(isNowAdmin ? 'Membro promovido a Administrador!' : 'Privilégios de Administrador removidos.');
}

function toggleGroupMemberMute(opId) {
  if (!currentInspectedGroupId || !opId) return;
  const room = internalRoomsList.find(r => String(r.id) === String(currentInspectedGroupId));
  if (!room) return;

  const configs = parseGroupConfig(room);
  let muted = Array.isArray(configs.muted_members) ? configs.muted_members.map(String) : [];

  const targetIdStr = String(opId);
  const isNowMuted = !muted.includes(targetIdStr);

  if (isNowMuted) {
    muted.push(targetIdStr);
  } else {
    muted = muted.filter(m => m !== targetIdStr);
  }
  configs.muted_members = muted;

  // Atualização otimista imediata na memória
  room.configuracoes = configs;
  renderGroupMembersList(currentInspectedGroupId, document.getElementById('input-search-group-members')?.value || '');

  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
  socket.emit('internal_update_group_info', {
    sala_id: currentInspectedGroupId,
    nome: room.nome,
    descricao: room.descricao,
    configuracoes: configs,
    alterado_por_nome: currentOpName
  });

  if (currentInternalRoomId === currentInspectedGroupId) {
    renderInternalMessages();
  }

  showInputBarNotification(isNowMuted ? 'Membro silenciado (Somente Leitura).' : 'Membro desmutado (Pode enviar mensagens).');
}

function removeGroupMember(opId, opName) {
  if (!currentInspectedGroupId || !opId) return;

  showInternalConfirmModal({
    title: 'Remover Participante',
    message: `Deseja realmente remover ${opName || 'este participante'} do grupo?`,
    confirmText: 'Remover do Grupo',
    confirmClass: 'bg-rose-500 hover:bg-rose-400',
    onConfirm: () => {
      const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
      socket.emit('internal_remove_group_member', {
        sala_id: currentInspectedGroupId,
        membro_id: opId,
        membro_nome: opName,
        removido_por_nome: currentOpName
      });

      // Atualização otimista imediata
      const room = internalRoomsList.find(r => String(r.id) === String(currentInspectedGroupId));
      if (room && room.membros) {
        let m = typeof room.membros === 'string' ? JSON.parse(room.membros) : room.membros;
        if (Array.isArray(m)) {
          room.membros = m.filter(id => String(id) !== String(opId));
        }
      }
      renderGroupMembersList(currentInspectedGroupId, document.getElementById('input-search-group-members')?.value || '');
      showInputBarNotification('Membro removido do grupo.');
    }
  });
}

// ------------------------------------------------------------------------------
// SALVAR CONFIGURAÇÕES, SAIR OU EXCLUIR GRUPO
// ------------------------------------------------------------------------------
function saveGroupSettings() {
  if (!currentInspectedGroupId) return;
  const room = internalRoomsList.find(r => String(r.id) === String(currentInspectedGroupId));
  if (!room) return;

  const nameInput = document.getElementById('input-group-edit-name');
  const descInput = document.getElementById('input-group-edit-desc');
  const onlyAdminSendCheck = document.getElementById('check-group-only-admin-send');
  const onlyAdminInviteCheck = document.getElementById('check-group-only-admin-invite');

  const newName = nameInput ? nameInput.value.trim() : room.nome;
  const newDesc = descInput ? descInput.value.trim() : (room.descricao || '');

  if (!newName) {
    showInputBarNotification('O nome do grupo não pode ficar vazio.');
    return;
  }

  const configs = parseGroupConfig(room);
  configs.only_admin_send = !!(onlyAdminSendCheck && onlyAdminSendCheck.checked);
  configs.only_admin_invite = !!(onlyAdminInviteCheck && onlyAdminInviteCheck.checked);

  room.nome = newName;
  room.descricao = newDesc;
  room.configuracoes = configs;

  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
  socket.emit('internal_update_group_info', {
    sala_id: currentInspectedGroupId,
    nome: newName,
    descricao: newDesc,
    configuracoes: configs,
    alterado_por_nome: currentOpName
  });

  if (currentInternalRoomId === currentInspectedGroupId) {
    const titleEl = document.getElementById('internal-drawer-title');
    const descEl = document.getElementById('internal-drawer-desc');
    if (titleEl) titleEl.textContent = newName;
    if (descEl) descEl.textContent = newDesc || 'Grupo personalizado da equipe';
    renderInternalMessages();
  }

  showInputBarNotification('Configurações do grupo salvas com sucesso!');
}

function leaveCurrentInspectedGroup() {
  if (!currentInspectedGroupId) return;

  showInternalConfirmModal({
    title: 'Sair do Grupo',
    message: 'Deseja realmente sair deste grupo? Você não receberá mais as mensagens desta conversa.',
    confirmText: 'Sair do Grupo',
    confirmClass: 'bg-slate-700 hover:bg-slate-600',
    onConfirm: () => {
      const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';
      const currentOpId = currentOperator ? String(currentOperator.id) : '';

      socket.emit('internal_leave_group', {
        sala_id: currentInspectedGroupId,
        atendente_id: currentOpId,
        atendente_nome: currentOpName
      });

      closeGroupMembersModal();
      if (currentInternalRoomId === currentInspectedGroupId) {
        showInternalDirectoryView();
      }
      showInputBarNotification('Você saiu do grupo.');
    }
  });
}

function deleteCurrentInspectedGroup() {
  if (!currentInspectedGroupId) return;

  showInternalConfirmModal({
    title: 'Excluir Grupo Permanentemente',
    message: '⚠️ Esta ação é irreversível. O grupo será excluído para todos os participantes e todo o histórico será apagado.',
    confirmText: 'Excluir Definitivamente',
    confirmClass: 'bg-rose-600 hover:bg-rose-500',
    onConfirm: () => {
      const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Administrador';
      socket.emit('internal_delete_group', {
        sala_id: currentInspectedGroupId,
        atendente_nome: currentOpName
      });

      closeGroupMembersModal();
      if (currentInternalRoomId === currentInspectedGroupId) {
        showInternalDirectoryView();
      }
      showInputBarNotification('Grupo excluído.');
    }
  });
}

// Renderiza o histórico de mensagens da sala interna
function renderInternalMessages() {
  const container = document.getElementById('internal-messages-container');
  if (!container) return;

  const msgs = internalMessagesMap[currentInternalRoomId] || [];
  container.innerHTML = '';

  if (msgs.length === 0) {
    const isDM = currentInternalRoomId.startsWith('dm_');
    const isGroup = currentInternalRoomId.startsWith('group_');
    const emptyEl = document.createElement('div');
    emptyEl.className = 'flex flex-col items-center justify-center py-16 text-center my-auto';
    emptyEl.innerHTML = `
      <div class="w-14 h-14 rounded-2xl mb-3 flex items-center justify-center internal-icon-box">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3">${isDM ? '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' : (isGroup ? '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' : '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}</svg>
      </div>
      <p class="text-xs font-extrabold text-foreground mb-1">${isDM ? 'Início da conversa particular' : (isGroup ? 'Início do grupo da equipe' : 'Canal aberto da equipe')}</p>
      <p class="text-[11px] text-[var(--color-text-muted)] max-w-[260px]">Envie uma mensagem de texto, áudio, anexo ou card de atendimento!</p>
    `;
    container.appendChild(emptyEl);
  } else {
    msgs.forEach(msg => {
      const msgEl = createInternalMessageElement(msg);
      container.appendChild(msgEl);
    });
  }

  const newAnchor = document.createElement('div');
  newAnchor.id = 'internal-scroll-anchor';
  newAnchor.className = 'h-2 w-full shrink-0';
  container.appendChild(newAnchor);

  // Scroll até o final
  requestAnimationFrame(() => {
    newAnchor.scrollIntoView({ behavior: 'auto', block: 'end' });
  });

  // Verifica permissão de escrita no grupo/canal atual
  const input = document.getElementById('internal-chat-input');
  const inputContainer = document.getElementById('internal-chat-input-container');
  const sendBtn = document.getElementById('btn-internal-send-message');
  const audioBtn = document.getElementById('btn-internal-record-audio');
  const attachBtn = document.getElementById('btn-internal-attach-file');

  if (input && currentInternalRoomId) {
    const room = internalRoomsList.find(r => String(r.id) === String(currentInternalRoomId));
    let isMuted = false;
    let isReadOnly = false;

    if (room && room.tipo === 'grupo') {
      const configs = parseGroupConfig(room);
      const currentOpId = currentOperator ? String(currentOperator.id) : '';
      const isCreator = String(room.criado_por_id || room.criado_por || '') === currentOpId;
      const isAdmin = isCreator || (Array.isArray(configs.admins) && configs.admins.includes(currentOpId));

      if (Array.isArray(configs.muted_members) && configs.muted_members.includes(currentOpId)) {
        isMuted = true;
      }
      if (configs.only_admin_send && !isAdmin) {
        isReadOnly = true;
      }
    }

    if (isMuted || isReadOnly) {
      input.disabled = true;
      input.placeholder = isMuted 
        ? '🔇 Você está em modo somente leitura neste grupo'
        : '🔒 Somente administradores podem enviar mensagens neste grupo';
      if (inputContainer) inputContainer.classList.add('opacity-60');
      if (sendBtn) sendBtn.disabled = true;
      if (audioBtn) audioBtn.classList.add('hidden');
      if (attachBtn) attachBtn.classList.add('hidden');
    } else {
      input.disabled = false;
      input.placeholder = currentInternalRoomId.startsWith('dm_') ? 'Digite uma mensagem' : 'Digite uma mensagem...';
      if (inputContainer) inputContainer.classList.remove('opacity-60');
      if (sendBtn) sendBtn.disabled = false;
      if (audioBtn) audioBtn.classList.remove('hidden');
      if (attachBtn) attachBtn.classList.remove('hidden');
    }
  }
}

let internalReplyingToMessage = null;

function cancelInternalReply() {
  internalReplyingToMessage = null;
  const preview = document.getElementById('internal-reply-preview-container');
  if (preview) preview.classList.add('hidden');
}

// Cria o elemento visual de uma mensagem interna
function createInternalMessageElement(msg) {
  const isSelf = currentOperator && String(msg.remetente_id) === String(currentOperator.id);
  const isDeleted = msg.apagado === 1 || msg.apagado === true || msg.apagado === '1';
  const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'} gap-1 w-full`;
  msgDiv.dataset.internalMsgId = msg.id;
  msgDiv.setAttribute('data-message-id', msg.id);
  msgDiv.setAttribute('data-internal', 'true');

  // Adiciona evento de menu de contexto ao clicar com botão direito
  msgDiv.addEventListener('contextmenu', (e) => {
    msg.is_internal = true;
    openMessageContextMenu(e, msg);
  });

  if (isDeleted) {
    msgDiv.innerHTML = `
      <div class="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
        <span class="font-bold text-slate-300">${isSelf ? 'Você' : (msg.remetente_nome || 'Colega')}</span>
        <span>•</span>
        <span>${timeFormatted}</span>
      </div>
      <div class="internal-msg-bubble-deleted p-3 rounded-2xl max-w-[88%] shadow-none opacity-60 italic border border-dashed border-rose-500/35 bg-black/20">
        <p class="text-xs leading-relaxed italic text-slate-400">🚫 Esta mensagem foi apagada</p>
      </div>
    `;
    return msgDiv;
  }

  // Citação / Resposta (reply_to)
  let quoteHTML = '';
  if (msg.reply_to_text) {
    quoteHTML = `
      <div class="p-2 mb-2 rounded-lg bg-black/25 border-l-4 border-[var(--color-primary-theme,#ef4444)] text-[11px] text-slate-300 opacity-90 truncate max-w-xs select-none">
        <span class="font-bold text-[10px] text-[var(--color-primary-theme,#ef4444)] block">${escapeHtml(msg.reply_to_sender || 'Colega')}</span>
        <span class="truncate block">${escapeHtml(msg.reply_to_text)}</span>
      </div>
    `;
  }

  let cardHTML = '';
  if (msg.card_meta) {
    try {
      const card = typeof msg.card_meta === 'string' ? JSON.parse(msg.card_meta) : msg.card_meta;
      cardHTML = `
        <div class="internal-shared-card p-3 my-1.5 w-full max-w-sm rounded-xl">
          <div class="flex items-center gap-2.5 mb-2 pb-2 border-b border-white/10">
            <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-500/30 overflow-hidden">
              ${card.cliente_avatar ? `<img src="${card.cliente_avatar}" class="w-full h-full object-cover">` : (card.cliente_nome ? card.cliente_nome.charAt(0) : 'C')}
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-xs font-bold text-slate-100 truncate">${escapeHtml(card.cliente_nome || 'Cliente')}</h4>
              <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(card.cliente_telefone || card.cliente_jid)}</p>
            </div>
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider">WhatsApp</span>
          </div>
          <p class="text-xs text-slate-300 italic mb-2.5 line-clamp-2 bg-black/20 p-2 rounded-lg border border-white/5">"${escapeHtml(card.resumo || 'Atendimento em andamento')}"</p>
          <button onclick="handleOpenSharedChat('${card.cliente_jid}', '${card.cliente_nome || ''}')" class="w-full h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/25 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Abrir Conversa no Painel
          </button>
        </div>
      `;
    } catch (e) {}
  }

  let mediaHTML = '';
  if (msg.midia_url) {
    if (msg.midia_tipo === 'audio' || msg.midia_url.includes('/uploads/internal-voice-') || msg.midia_url.endsWith('.ogg') || msg.midia_url.endsWith('.mp3')) {
      mediaHTML = `
        <div class="my-1">
          <audio controls src="${msg.midia_url}" class="max-w-[240px] h-8"></audio>
        </div>
      `;
    } else if (msg.midia_tipo === 'image' || msg.midia_url.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
      mediaHTML = `
        <div class="my-1 rounded-xl overflow-hidden max-w-[260px] border border-white/10">
          <img src="${msg.midia_url}" class="w-full h-auto cursor-pointer hover:scale-105 transition-transform" onclick="window.open(this.src, '_blank')">
        </div>
      `;
    } else {
      mediaHTML = `
        <div class="my-1 p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-indigo-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <a href="${msg.midia_url}" target="_blank" class="text-xs text-indigo-400 hover:underline font-bold truncate">Download do Anexo</a>
        </div>
      `;
    }
  }

  // Reações
  const reactionHTML = renderReactionBadgeHTML(msg.id, msg.reacoes || msg.reacao);

  const bubbleClass = isSelf ? 'internal-msg-bubble-self' : 'internal-msg-bubble-other';

  msgDiv.innerHTML = `
    <div class="flex items-center gap-1.5 text-[10px] text-slate-400 px-1">
      <span class="font-bold text-slate-300">${isSelf ? 'Você' : (msg.remetente_nome || 'Colega')}</span>
      <span>•</span>
      <span>${timeFormatted}</span>
    </div>
    <div class="${bubbleClass} p-3 rounded-2xl max-w-[88%] shadow-md relative">
      ${quoteHTML}
      ${cardHTML}
      ${mediaHTML}
      ${msg.texto ? `<p class="text-xs leading-relaxed whitespace-pre-wrap select-text">${escapeHtml(msg.texto)}</p>` : ''}
      ${reactionHTML}
    </div>
  `;

  return msgDiv;
}

// Abrir conversa do WhatsApp a partir de um Card de Atendimento Compartilhado
function handleOpenSharedChat(clienteJid, clienteNome) {
  if (!clienteJid) return;

  // Se estiver dentro de um iframe no portal Next.js, notifica a aplicação pai para navegar ao WhatsApp
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'TICKETFLOW_OPEN_WHATSAPP_CHAT',
        clienteJid: clienteJid,
        clienteNome: clienteNome
      }, '*');
    } catch (e) {}
  }

  closeInternalChatDrawer();
  selectChat(clienteJid);
  showInputBarNotification(`Conversa de ${clienteNome || clienteJid} aberta!`);
}

// Enviar Mensagem no Chat Interno
function sendInternalMessage() {
  const input = document.getElementById('internal-chat-input');
  const texto = input ? input.value.trim() : '';

  if (!texto && !internalSelectedFile) return;

  const replyPayload = internalReplyingToMessage ? {
    reply_to_id: internalReplyingToMessage.id,
    reply_to_text: internalReplyingToMessage.text,
    reply_to_sender: internalReplyingToMessage.sender
  } : {};

  if (internalSelectedFile) {
    const formData = new FormData();
    formData.append('file', internalSelectedFile);

    fetch('/api/upload', {
      method: 'POST',
      body: formData
    })
    .then(r => r.json())
    .then(data => {
      const fileUrl = data.url;
      const fileType = internalSelectedFile.type.startsWith('image/') ? 'image' : (internalSelectedFile.type.startsWith('audio/') ? 'audio' : 'document');
      
      socket.emit('internal_send_message', {
        sala_id: currentInternalRoomId,
        remetente_id: currentOperator ? currentOperator.id : 'anon',
        remetente_nome: currentOperator ? currentOperator.name || currentOperator.nome : 'Atendente',
        texto: texto || '',
        midia_url: fileUrl,
        midia_tipo: fileType,
        ...replyPayload
      });

      cancelInternalReply();
      clearInternalAttachment();
      if (input) input.value = '';
    })
    .catch(err => {
      console.error('Erro ao enviar anexo no chat interno:', err);
      alert('Erro ao enviar arquivo.');
    });
    return;
  }

  // Envio de texto normal
  if (texto) {
    socket.emit('internal_send_message', {
      sala_id: currentInternalRoomId,
      remetente_id: currentOperator ? currentOperator.id : 'anon',
      remetente_nome: currentOperator ? currentOperator.name || currentOperator.nome : 'Atendente',
      texto,
      ...replyPayload
    });

    cancelInternalReply();
    if (input) {
      input.value = '';
      input.style.height = '20px';
      adjustInternalChatInputHeight();
    }
  }
}

// Auto-expansão fluida do campo de texto do Chat Interno
function adjustInternalChatInputHeight() {
  const input = document.getElementById('internal-chat-input');
  const container = document.getElementById('internal-chat-input-container');
  if (!input) return;

  input.style.height = 'auto';
  const newHeight = Math.min(135, Math.max(20, input.scrollHeight));
  input.style.height = `${newHeight}px`;

  if (container) {
    container.style.height = `${Math.min(160, Math.max(44, newHeight + 24))}px`;
  }
}

// Manipula teclas no input do chat interno (Enter para enviar)
function handleInternalInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendInternalMessage();
  }
}

// ==============================================================================
// 🎙️ GRAVAÇÃO, VISUALIZADOR DE ONDA E PRÉ-VISUALIZAÇÃO DE ÁUDIO NO CHAT INTERNO
// ==============================================================================
let internalMediaRecorder = null;
let internalAudioChunksList = [];
let internalRecordingTimerInterval = null;
let internalRecordingSeconds = 0;
let internalRecordedAudioBlob = null;
let internalRecordedAudioBase64 = null;
let internalRecordedAudioDuration = 0;
let isInternalRecordingPaused = false;
let internalAudioContext = null;
let internalAnalyser = null;
let internalVisualizerAnimationFrame = null;
let internalDrawVisualizerLoop = null;
let internalPreviewAnimationFrame = null;
let isInternalAudioPreviewEventsSetup = false;
let isDraggingInternalPreview = false;

// Alterna entre os 3 Modos da Barra do Chat Interno (Texto, Gravando, Pré-visualizar)
function setInternalInputBarMode(mode) {
  const textModeEl = document.getElementById('internal-input-mode-text');
  const recordingModeEl = document.getElementById('internal-input-mode-recording');
  const previewModeEl = document.getElementById('internal-input-mode-preview');

  const textBtns = document.getElementById('internal-buttons-mode-text');
  const recordingBtns = document.getElementById('internal-buttons-mode-recording');
  const previewBtns = document.getElementById('internal-buttons-mode-preview');

  const container = document.getElementById('internal-chat-input-container');

  // Resetar áreas de conteúdo
  [textModeEl, recordingModeEl, previewModeEl].forEach(el => {
    if (el) {
      el.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
      el.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
  });

  // Ocultar botões
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
    const input = document.getElementById('internal-chat-input');
    if (input) input.style.height = '20px';
  } else if (mode === 'preview') {
    if (previewModeEl) {
      previewModeEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      previewModeEl.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
    if (previewBtns) previewBtns.classList.remove('hidden');
    if (container) container.classList.remove('border-red-500/40', 'bg-red-500/[0.04]');
    const input = document.getElementById('internal-chat-input');
    if (input) input.style.height = '20px';
  } else {
    // Modo Texto por padrão
    if (textModeEl) {
      textModeEl.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      textModeEl.classList.add('opacity-100', 'pointer-events-auto', 'translate-y-0');
    }
    if (textBtns) textBtns.classList.remove('hidden');
    if (container) container.classList.remove('border-red-500/40', 'bg-red-500/[0.04]');
    adjustInternalChatInputHeight();
  }
}

// Inicia o Visualizador de Onda Real de Voz por Web Audio API para o Chat Interno
function initInternalAudioVisualizer(stream) {
  const container = document.getElementById('internal-audio-waveform-visualizer');
  if (!container) return;

  container.innerHTML = '';
  const numBars = 32;
  const bars = [];

  for (let i = 0; i < numBars; i++) {
    const bar = document.createElement('div');
    bar.className = 'w-1 rounded-full bg-gradient-to-t from-red-500 to-rose-400 opacity-70 transition-all duration-75';
    bar.style.height = '4px';
    bar.style.minHeight = '3px';
    container.appendChild(bar);
    bars.push(bar);
  }

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    internalAudioContext = new AudioContextClass();
    const source = internalAudioContext.createMediaStreamSource(stream);
    internalAnalyser = internalAudioContext.createAnalyser();
    internalAnalyser.fftSize = 64;
    source.connect(internalAnalyser);

    const bufferLength = internalAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    internalDrawVisualizerLoop = () => {
      if (!internalAnalyser || isInternalRecordingPaused) return;

      internalAnalyser.getByteFrequencyData(dataArray);

      for (let i = 0; i < numBars; i++) {
        const value = dataArray[i % bufferLength] || 0;
        const percent = Math.min(100, Math.max(10, (value / 255) * 100));
        const heightPx = Math.max(3, Math.floor((percent / 100) * 26));

        if (bars[i]) {
          bars[i].style.height = `${heightPx}px`;
          bars[i].style.opacity = `${Math.max(0.4, percent / 100)}`;
        }
      }

      internalVisualizerAnimationFrame = requestAnimationFrame(internalDrawVisualizerLoop);
    };

    internalDrawVisualizerLoop();
  } catch (e) {
    console.warn('Web Audio API não inicializada para o chat interno:', e);
  }
}

function stopInternalAudioVisualizer() {
  if (internalVisualizerAnimationFrame) {
    cancelAnimationFrame(internalVisualizerAnimationFrame);
    internalVisualizerAnimationFrame = null;
  }
  if (internalAudioContext && internalAudioContext.state !== 'closed') {
    try {
      internalAudioContext.close();
    } catch (e) {}
    internalAudioContext = null;
  }
  internalAnalyser = null;
}

// Inicia Gravação de Áudio
async function startInternalAudioRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Seu navegador não suporta gravação de áudio ou a permissão de microfone foi negada.');
    return;
  }

  isInternalRecordingPaused = false;
  const pauseIcon = document.getElementById('icon-internal-recording-pause');
  const resumeIcon = document.getElementById('icon-internal-recording-resume');
  if (pauseIcon) pauseIcon.classList.remove('hidden');
  if (resumeIcon) resumeIcon.classList.add('hidden');

  setInternalInputBarMode('recording');
  const timerEl = document.getElementById('internal-recording-timer');
  const statusLabel = document.getElementById('internal-recording-status-label');
  const pulseDot = document.getElementById('internal-recording-pulse-dot');

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
    internalAudioChunksList = [];
    internalRecordingSeconds = 0;
    internalRecordedAudioBlob = null;
    internalRecordedAudioBase64 = null;

    internalMediaRecorder = new MediaRecorder(stream);
    internalMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        internalAudioChunksList.push(e.data);
      }
    };

    internalMediaRecorder.start(250);
    playRecordingStartSound();

    if (statusLabel) {
      statusLabel.textContent = 'Gravando...';
      statusLabel.className = 'text-xs font-bold text-red-400 tracking-wider';
    }
    if (pulseDot) {
      pulseDot.className = 'w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    }

    initInternalAudioVisualizer(stream);

    clearInterval(internalRecordingTimerInterval);
    internalRecordingTimerInterval = setInterval(() => {
      if (!isInternalRecordingPaused) {
        internalRecordingSeconds++;
        const mins = String(Math.floor(internalRecordingSeconds / 60)).padStart(2, '0');
        const secs = String(internalRecordingSeconds % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${mins}:${secs}`;
      }
    }, 1000);

  } catch (err) {
    console.error('Erro ao acessar o microfone no chat interno:', err);
    setInternalInputBarMode('text');
    alert('Não foi possível acessar o microfone.');
  }
}

// Pausar / Retomar Gravação
function togglePauseInternalAudioRecording() {
  if (!internalMediaRecorder) return;

  const pauseIcon = document.getElementById('icon-internal-recording-pause');
  const resumeIcon = document.getElementById('icon-internal-recording-resume');
  const statusLabel = document.getElementById('internal-recording-status-label');
  const pulseDot = document.getElementById('internal-recording-pulse-dot');

  if (internalMediaRecorder.state === 'recording') {
    internalMediaRecorder.pause();
    isInternalRecordingPaused = true;
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

    if (internalVisualizerAnimationFrame) {
      cancelAnimationFrame(internalVisualizerAnimationFrame);
      internalVisualizerAnimationFrame = null;
    }
  } else if (internalMediaRecorder.state === 'paused') {
    internalMediaRecorder.resume();
    isInternalRecordingPaused = false;
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

    if (internalDrawVisualizerLoop) {
      if (internalVisualizerAnimationFrame) cancelAnimationFrame(internalVisualizerAnimationFrame);
      internalDrawVisualizerLoop();
    }
  }
}

// Finalizar Gravação e ir para Pré-visualização
function finishInternalAudioRecordingAndPreview() {
  playRecordingFinishSound();
  setupInternalAudioPreviewEvents();
  internalRecordedAudioDuration = internalRecordingSeconds || 0;
  clearInterval(internalRecordingTimerInterval);
  stopInternalAudioVisualizer();

  if (!internalMediaRecorder) return;

  const stream = internalMediaRecorder.stream;

  internalMediaRecorder.onstop = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    const mimeType = internalMediaRecorder.mimeType || 'audio/webm';
    internalRecordedAudioBlob = new Blob(internalAudioChunksList, { type: mimeType });

    if (internalRecordedAudioBlob.size === 0) {
      cancelInternalAudioRecording();
      return;
    }

    const audioUrl = URL.createObjectURL(internalRecordedAudioBlob);
    const player = document.getElementById('internal-audio-preview-player');
    if (player) {
      player.src = audioUrl;
      player.load();
      player.currentTime = 1e101;
      player.ontimeupdate = function() {
        this.ontimeupdate = null;
        this.currentTime = 0;
        updateInternalAudioPreviewTimer();
      };
      updateInternalAudioPreviewTimer();
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      internalRecordedAudioBase64 = reader.result;
    };
    reader.readAsDataURL(internalRecordedAudioBlob);

    setInternalInputBarMode('preview');
  };

  if (internalMediaRecorder.state !== 'inactive') {
    internalMediaRecorder.stop();
  }
}

// Eventos e Controle de Player de Preview no Chat Interno
function setupInternalAudioPreviewEvents() {
  if (isInternalAudioPreviewEventsSetup) return;
  const player = document.getElementById('internal-audio-preview-player');
  if (!player) return;

  isInternalAudioPreviewEventsSetup = true;
  const container = document.getElementById('internal-preview-progress-container');

  player.addEventListener('loadedmetadata', updateInternalAudioPreviewTimer);
  player.addEventListener('timeupdate', updateInternalAudioPreviewTimer);

  player.addEventListener('play', () => {
    const iconPlay = document.getElementById('icon-internal-preview-play');
    const iconPause = document.getElementById('icon-internal-preview-pause');
    const btnToggle = document.getElementById('btn-internal-preview-play-toggle');
    if (iconPlay) iconPlay.classList.add('hidden');
    if (iconPause) iconPause.classList.remove('hidden');
    if (btnToggle) btnToggle.classList.add('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (internalPreviewAnimationFrame) cancelAnimationFrame(internalPreviewAnimationFrame);
    renderInternalAudioPreviewFrame();
  });

  player.addEventListener('pause', () => {
    const iconPlay = document.getElementById('icon-internal-preview-play');
    const iconPause = document.getElementById('icon-internal-preview-pause');
    const btnToggle = document.getElementById('btn-internal-preview-play-toggle');
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (internalPreviewAnimationFrame) {
      cancelAnimationFrame(internalPreviewAnimationFrame);
      internalPreviewAnimationFrame = null;
    }
  });

  player.addEventListener('ended', () => {
    const iconPlay = document.getElementById('icon-internal-preview-play');
    const iconPause = document.getElementById('icon-internal-preview-pause');
    const btnToggle = document.getElementById('btn-internal-preview-play-toggle');
    const progressBar = document.getElementById('internal-preview-progress-bar');
    const progressPin = document.getElementById('internal-preview-progress-pin');

    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (btnToggle) btnToggle.classList.remove('shadow-[0_0_12px_var(--color-primary-theme)]', 'ring-2', 'ring-accent-theme/40');

    if (internalPreviewAnimationFrame) {
      cancelAnimationFrame(internalPreviewAnimationFrame);
      internalPreviewAnimationFrame = null;
    }
    if (progressBar) progressBar.style.width = '0%';
    if (progressPin) progressPin.style.left = '0%';
    player.currentTime = 0;
    updateInternalAudioPreviewTimer();
  });

  if (container) {
    const handleStart = (e) => {
      isDraggingInternalPreview = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateInternalAudioScrubPosition(clientX);
    };

    const handleMove = (e) => {
      if (!isDraggingInternalPreview) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateInternalAudioScrubPosition(clientX);
    };

    const handleEnd = () => {
      isDraggingInternalPreview = false;
    };

    container.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    container.addEventListener('touchstart', handleStart, { passive: true });
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
  }
}

function getInternalPreviewDuration() {
  const player = document.getElementById('internal-audio-preview-player');
  if (player && player.duration && isFinite(player.duration) && !isNaN(player.duration) && player.duration > 0) {
    return player.duration;
  }
  return internalRecordedAudioDuration || 0;
}

function updateInternalAudioScrubPosition(clientX) {
  const player = document.getElementById('internal-audio-preview-player');
  const container = document.getElementById('internal-preview-progress-container');
  const progressBar = document.getElementById('internal-preview-progress-bar');
  const progressPin = document.getElementById('internal-preview-progress-pin');
  const timerEl = document.getElementById('internal-preview-audio-timer');

  const duration = getInternalPreviewDuration();
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

function renderInternalAudioPreviewFrame() {
  const player = document.getElementById('internal-audio-preview-player');
  const timerEl = document.getElementById('internal-preview-audio-timer');
  const progressBar = document.getElementById('internal-preview-progress-bar');
  const progressPin = document.getElementById('internal-preview-progress-pin');

  const duration = getInternalPreviewDuration();
  if (!player || player.paused) return;

  if (!isDraggingInternalPreview && duration > 0) {
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

  internalPreviewAnimationFrame = requestAnimationFrame(renderInternalAudioPreviewFrame);
}

function updateInternalAudioPreviewTimer() {
  const player = document.getElementById('internal-audio-preview-player');
  const timerEl = document.getElementById('internal-preview-audio-timer');
  const progressBar = document.getElementById('internal-preview-progress-bar');
  const progressPin = document.getElementById('internal-preview-progress-pin');
  if (!player || !timerEl) return;

  const duration = getInternalPreviewDuration();
  const durMins = String(Math.floor(duration / 60)).padStart(2, '0');
  const durSecs = String(Math.floor(duration % 60)).padStart(2, '0');
  const curTime = player.currentTime || 0;
  const curMins = String(Math.floor(curTime / 60)).padStart(2, '0');
  const curSecs = String(Math.floor(curTime % 60)).padStart(2, '0');

  timerEl.textContent = `${curMins}:${curSecs} / ${durMins}:${durSecs}`;

  if (!isDraggingInternalPreview && duration > 0) {
    const progressPercent = Math.min(100, (curTime / duration) * 100);
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressPin) progressPin.style.left = `${progressPercent}%`;
  }
}

function toggleInternalAudioPreviewPlay() {
  setupInternalAudioPreviewEvents();
  const player = document.getElementById('internal-audio-preview-player');
  if (!player || !player.src) return;

  if (player.paused) {
    player.play().catch(err => console.error('Erro ao tocar áudio interno:', err));
  } else {
    player.pause();
  }
}

// Cancelar / Descartar Gravação de Áudio no Chat Interno
function cancelInternalAudioRecording() {
  playRecordingCancelSound();
  clearInterval(internalRecordingTimerInterval);
  stopInternalAudioVisualizer();

  if (internalMediaRecorder) {
    const stream = internalMediaRecorder.stream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (internalMediaRecorder.state !== 'inactive') {
      internalMediaRecorder.stop();
    }
  }

  resetInternalAudioState();
}

function resetInternalAudioState() {
  internalMediaRecorder = null;
  internalAudioChunksList = [];
  internalRecordedAudioBlob = null;
  internalRecordedAudioBase64 = null;
  isInternalRecordingPaused = false;

  stopInternalAudioVisualizer();

  const player = document.getElementById('internal-audio-preview-player');
  if (player) {
    player.pause();
    player.src = '';
  }

  setInternalInputBarMode('text');
}

// Enviar Áudio Gravado no Chat Interno
function sendInternalRecordedAudio() {
  if (!internalRecordedAudioBase64 && !internalRecordedAudioBlob) return;

  if (internalRecordedAudioBase64) {
    socket.emit('internal_send_message', {
      sala_id: currentInternalRoomId,
      remetente_id: currentOperator ? currentOperator.id : 'anon',
      remetente_nome: currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente',
      audio_base64: internalRecordedAudioBase64
    });
    playMessageSentSound();
    resetInternalAudioState();
  } else if (internalRecordedAudioBlob) {
    const reader = new FileReader();
    reader.onloadend = () => {
      internalRecordedAudioBase64 = reader.result;
      socket.emit('internal_send_message', {
        sala_id: currentInternalRoomId,
        remetente_id: currentOperator ? currentOperator.id : 'anon',
        remetente_nome: currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente',
        audio_base64: internalRecordedAudioBase64
      });
      playMessageSentSound();
      resetInternalAudioState();
    };
    reader.readAsDataURL(internalRecordedAudioBlob);
  }
}

function handleInternalFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  internalSelectedFile = file;
  const preview = document.getElementById('internal-attachment-preview');
  const label = document.getElementById('internal-attachment-label');
  if (preview && label) {
    label.textContent = `📎 ${file.name}`;
    preview.classList.remove('hidden');
  }
}

function clearInternalAttachment() {
  internalSelectedFile = null;
  const preview = document.getElementById('internal-attachment-preview');
  const fileInput = document.getElementById('internal-file-input');
  if (preview) preview.classList.add('hidden');
  if (fileInput) fileInput.value = '';
}

// Atualiza o contador total de não lidas no gatilho da lateral
function updateInternalTotalUnreadBadge() {
  const badge = document.getElementById('internal-chat-unread-badge');
  const total = Object.values(internalRoomUnreads).reduce((acc, count) => acc + count, 0);

  if (badge) {
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // Notifica o componente GlobalInternalChat do Next.js via postMessage
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'TICKETFLOW_INTERNAL_UNREAD_UPDATE',
        unreadCount: total
      }, '*');
    } catch (e) {}
  }
}

// Modal de Compartilhamento do Atendimento
function openInternalShareModal(clienteJid, clienteNome) {
  if (!clienteJid) {
    alert('Selecione uma conversa para compartilhar.');
    return;
  }

  internalChatToShare = { jid: clienteJid, name: clienteNome || clienteJid };

  const select = document.getElementById('share-target-room-select');
  if (select) {
    select.innerHTML = '';
    
    // Canais
    const channelGroup = document.createElement('optgroup');
    channelGroup.label = 'Canais da Equipe';
    internalRoomsList.filter(r => r.tipo === 'canal').forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `# ${c.nome}`;
      channelGroup.appendChild(opt);
    });
    select.appendChild(channelGroup);

    // Colegas
    const dmGroup = document.createElement('optgroup');
    dmGroup.label = 'Colegas / Atendentes';
    internalOperatorsList.forEach(op => {
      if (currentOperator && String(op.id) === String(currentOperator.id)) return;
      const dmRoomId = `dm_${[currentOperator ? currentOperator.id : 'me', op.id].sort().join('_')}`;
      const opt = document.createElement('option');
      opt.value = dmRoomId;
      opt.textContent = `👤 ${op.nome} (${op.status === 'online' ? 'Online' : (op.status === 'atendendo' ? 'Atendendo' : 'Offline')})`;
      dmGroup.appendChild(opt);
    });
    select.appendChild(dmGroup);
  }

  const modal = document.getElementById('internal-share-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
    const dialog = modal.querySelector('.animate-modal-content-in') || modal.querySelector('.relative');
    if (dialog) dialog.classList.add('internal-modal-dialog');
  }
}

function closeInternalShareModal() {
  const modal = document.getElementById('internal-share-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('internal-modal-overlay');
  }
  internalChatToShare = null;
}

function confirmShareChatToInternal() {
  if (!internalChatToShare) return;

  const select = document.getElementById('share-target-room-select');
  const commentInput = document.getElementById('share-comment-input');
  const targetRoomId = select ? select.value : 'channel-geral';
  const comentario = commentInput ? commentInput.value.trim() : '';

  socket.emit('internal_share_chat', {
    target_sala_id: targetRoomId,
    cliente_jid: internalChatToShare.jid,
    atendente_id: currentOperator ? currentOperator.id : 'anon',
    atendente_nome: currentOperator ? currentOperator.name || currentOperator.nome : 'Atendente',
    comentario
  });

  closeInternalShareModal();
  if (commentInput) commentInput.value = '';

  showInputBarNotification('Atendimento compartilhado com a equipe com sucesso!');

  // Abre a conversa onde foi compartilhado
  if (targetRoomId.startsWith('dm_')) {
    const parts = targetRoomId.replace('dm_', '').split('_');
    const otherId = parts.find(id => !currentOperator || id !== String(currentOperator.id)) || parts[0];
    const opObj = internalOperatorsList.find(o => String(o.id) === String(otherId));
    openInternalDM(otherId, opObj ? opObj.nome : otherId, opObj ? opObj.setor : '', opObj ? opObj.status : 'online');
  } else {
    const canal = internalRoomsList.find(r => r.id === targetRoomId);
    openInternalChannel(targetRoomId, canal ? canal.nome : 'Canal', canal ? canal.descricao : '');
  }

  openInternalChatDrawer();
}

// Atalho de Teclado Global: Alt + C para abrir/fechar Chat Interno
window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault();
    toggleInternalChatDrawer();
  } else if (e.key === 'Escape') {
    if (isInternalDrawerOpen) closeInternalChatDrawer();
    closeInternalShareModal();
    closeNewDMModal();
    closeCreateGroupModal();
    closeCreatePrivateCallModal();
  }
});

// Listener de input do chat interno (Enter para enviar)
document.addEventListener('DOMContentLoaded', () => {
  const internalInput = document.getElementById('internal-chat-input');
  if (internalInput) {
    internalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendInternalMessage();
      }
    });
  }
});

// Recebe dados das salas e operadores
socket.on('internal_rooms_data', ({ salas, atendentes, recent_messages, closed_dms, active_voice_rooms }) => {
  internalRoomsList = salas || [];
  internalOperatorsList = atendentes || [];
  if (recent_messages) {
    internalRecentMessagesMap = { ...internalRecentMessagesMap, ...recent_messages };
  }
  if (closed_dms) {
    internalClosedDMsMap = { ...internalClosedDMsMap, ...closed_dms };
  }
  if (active_voice_rooms) {
    activeVoiceRoomsSummary = active_voice_rooms || [];
  }

  if (currentOperator && currentOperator.id) {
    const me = internalOperatorsList.find(o => String(o.id) === String(currentOperator.id));
    if (me) {
      if (me.manual_status) currentUserManualStatus = me.manual_status;
      updateUserStatusUI(me.status, me.manual_status);
    }
  }

  refreshInternalUI();
});

// Atualização em tempo real das salas de voz estilo Discord
socket.on('voice_rooms_status', ({ rooms }) => {
  activeVoiceRoomsSummary = rooms || [];
  refreshInternalUI();
});

// Atualização de status de fechamento de conversa particular
socket.on('internal_dm_status_updated', ({ sala_id, fechada_em }) => {
  internalClosedDMsMap[sala_id] = fechada_em;
  refreshInternalUI();
});

// Recebe histórico da sala aberta
socket.on('internal_room_history', ({ sala_id, messages }) => {
  internalMessagesMap[sala_id] = messages || [];
  if (currentInternalRoomId === sala_id) {
    renderInternalMessages();
  }
});

// Recebe novo grupo criado
socket.on('internal_group_created', (group) => {
  const exists = internalRoomsList.some(r => r.id === group.id);
  if (!exists) {
    internalRoomsList.push(group);
  }
  refreshInternalUI();

  // Se o criador foi o operador atual, entra automaticamente no grupo criado
  if (currentOperator && String(group.criado_por_id) === String(currentOperator.id)) {
    if (group.tipo === 'sala_privada') {
      switchInternalMainTab('pessoal');
      switchPessoalSubTab('voice');
    } else {
      openInternalGroup(group.id, group.nome, group.descricao, null, group.criado_por_nome);
    }
  }
});

// Recebe atualização de grupo (membros, nome, descrição, permissões)
socket.on('internal_group_updated', (group) => {
  const idx = internalRoomsList.findIndex(r => String(r.id) === String(group.id));
  if (idx !== -1) {
    internalRoomsList[idx] = { ...internalRoomsList[idx], ...group };
  } else {
    internalRoomsList.push(group);
  }
  refreshInternalUI();

  // Se a gaveta estiver aberta nesta sala, atualiza título e badge
  if (currentInternalRoomId === group.id) {
    const titleEl = document.getElementById('internal-drawer-title');
    const descEl = document.getElementById('internal-drawer-desc');
    const membersEl = document.getElementById('internal-drawer-members-count');
    if (titleEl) titleEl.textContent = group.nome;
    if (descEl) descEl.textContent = group.descricao || 'Grupo personalizado da equipe';
    if (membersEl) {
      let count = 0;
      try {
        const m = typeof group.membros === 'string' ? JSON.parse(group.membros) : group.membros;
        if (Array.isArray(m)) count = m.length;
      } catch(e) {}
      membersEl.textContent = count ? `${count} MEMBROS` : 'GRUPO';
    }
    renderInternalMessages();
  }

  // Se o modal de membros estiver aberto para este grupo, atualiza
  if (currentInspectedGroupId === group.id) {
    renderGroupMembersList(group.id, document.getElementById('input-search-group-members')?.value || '');
  }
});

// Recebe exclusão de grupo
socket.on('internal_group_deleted', ({ sala_id }) => {
  internalRoomsList = internalRoomsList.filter(r => String(r.id) !== String(sala_id));
  if (currentInternalRoomId === sala_id) {
    showInternalDirectoryView();
    showInputBarNotification('Este grupo foi excluído pelo administrador.');
  }
  if (currentInspectedGroupId === sala_id) {
    closeGroupMembersModal();
  }
  refreshInternalUI();
});

// Recebe nova mensagem na sala aberta
socket.on('internal_new_message', (msg) => {
  if (!internalMessagesMap[msg.sala_id]) {
    internalMessagesMap[msg.sala_id] = [];
  }
  internalMessagesMap[msg.sala_id].push(msg);
  internalRecentMessagesMap[msg.sala_id] = msg;
  refreshInternalUI();

  if (currentInternalRoomId === msg.sala_id) {
    const container = document.getElementById('internal-messages-container');
    if (container) {
      // Remove placeholder de estado vazio caso exista
      const emptyEls = container.querySelectorAll('.py-16');
      emptyEls.forEach(el => el.remove());

      const msgEl = createInternalMessageElement(msg);
      const anchor = document.getElementById('internal-scroll-anchor');
      if (anchor) {
        container.insertBefore(msgEl, anchor);
        anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else {
        container.appendChild(msgEl);
      }
    }
  }
});

// Alerta sonoro e badge de mensagem de colega
socket.on('internal_message_alert', ({ sala_id, remetente_id, remetente_nome, texto }) => {
  internalRecentMessagesMap[sala_id] = {
    sala_id,
    remetente_id,
    remetente_nome,
    texto,
    timestamp: new Date().toISOString()
  };

  const isFromMe = currentOperator && String(remetente_id) === String(currentOperator.id);
  if (!isFromMe) {
    playInternalChatNotificationSound();

    if (!isInternalDrawerOpen || currentInternalRoomId !== sala_id) {
      internalRoomUnreads[sala_id] = (internalRoomUnreads[sala_id] || 0) + 1;
      updateInternalTotalUnreadBadge();
    }
  }
  refreshInternalUI();
});

// Atualização de status de operadores
socket.on('internal_operator_status_changed', ({ atendente_id, status, manual_status }) => {
  const isMe = currentOperator && String(currentOperator.id) === String(atendente_id);
  if (isMe) {
    if (manual_status) currentUserManualStatus = manual_status;
    updateUserStatusUI(status, manual_status || currentUserManualStatus);
  }

  const op = internalOperatorsList.find(o => String(o.id) === String(atendente_id));
  if (op) {
    op.status = status;
    if (manual_status) op.manual_status = manual_status;
    refreshInternalUI();

    // Se estiver com a DM aberta com este operador, atualiza a bolinha no avatar do cabeçalho
    if (currentInternalRoomId && currentInternalRoomId.includes(String(atendente_id))) {
      let statusColor = 'bg-slate-500';
      if (status === 'online') statusColor = 'bg-emerald-500 shadow-sm shadow-emerald-500 ring-2 ring-emerald-500/20';
      else if (status === 'atendendo') statusColor = 'bg-amber-500 shadow-sm shadow-amber-500 ring-2 ring-amber-500/20';
      else if (status === 'ocupado') statusColor = 'bg-rose-500 shadow-sm shadow-rose-500 ring-2 ring-rose-500/20';
      else if (status === 'ausente') statusColor = 'bg-orange-500 shadow-sm shadow-orange-500 ring-2 ring-orange-500/20';

      const dot = document.querySelector('#internal-drawer-icon-container span.rounded-full');
      if (dot) {
        dot.className = `absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${statusColor} border-2 border-[var(--color-card,#0f172a)]`;
      }
    }
  }
});

// Reação em mensagem do chat interno
socket.on('internal_message_reacted', ({ message_id, sala_id, reacoes }) => {
  if (internalMessagesMap[sala_id]) {
    const targetMsg = internalMessagesMap[sala_id].find(m => String(m.id) === String(message_id));
    if (targetMsg) {
      targetMsg.reacoes = reacoes;
    }
  }
  updateMsgReactionBadgeInDOM(message_id, reacoes);
});

// Exclusão de mensagem do chat interno
socket.on('internal_message_deleted', ({ message_id, sala_id }) => {
  if (internalMessagesMap[sala_id]) {
    const targetMsg = internalMessagesMap[sala_id].find(m => String(m.id) === String(message_id));
    if (targetMsg) {
      targetMsg.apagado = 1;
      targetMsg.texto = '🚫 Esta mensagem foi apagada';
      targetMsg.midia_url = null;
      targetMsg.card_meta = null;
    }
  }
  if (activeContextMsgData && String(activeContextMsgData.id) === String(message_id)) {
    activeContextMsgData.apagado = 1;
    activeContextMsgData.texto = '🚫 Esta mensagem foi apagada';
    activeContextMsgData.midia_url = null;
    activeContextMsgData.card_meta = null;
  }
  if (currentInternalRoomId === sala_id) {
    const msgDiv = document.querySelector(`[data-message-id="${message_id}"][data-internal="true"]`) || document.querySelector(`[data-internal-msg-id="${message_id}"]`);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.internal-msg-bubble-self') || msgDiv.querySelector('.internal-msg-bubble-other');
      if (bubble) {
        bubble.className = 'internal-msg-bubble-deleted p-3 rounded-2xl max-w-[88%] shadow-none opacity-60 italic border border-dashed border-rose-500/35 bg-black/20';
        bubble.innerHTML = '<p class="text-xs leading-relaxed italic text-slate-400">🚫 Esta mensagem foi apagada</p>';
      }
    }
  }
});

// ==============================================================================
// 🎙️ SISTEMA DE BATE-PAPO E CHAMADAS DE VOZ EM TEMPO REAL (WebRTC Full Mesh)
// ==============================================================================
let currentVoiceSession = null;
let incomingVoiceCallData = null;
let voiceLocalAudioStream = null;
let voicePeerConnections = new Map(); // socketId -> RTCPeerConnection
let voiceAudioContext = null;
let voiceAnalyserNode = null;
let voiceVadAnimationFrame = null;
let voiceRingtoneInterval = null;
let voiceRingtoneAudioCtx = null;
let voiceCallSeconds = 0;
let voiceCallTimerInterval = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Transmite o estado completo da chamada de voz para o portal pai Next.js
function broadcastVoiceStateToParent() {
  if (window.parent && window.parent !== window) {
    try {
      const state = {
        inCall: !!currentVoiceSession,
        session: currentVoiceSession ? {
          id: currentVoiceSession.id,
          title: currentVoiceSession.title,
          type: currentVoiceSession.type,
          isMuted: currentVoiceSession.isMuted,
          isSpeaking: currentVoiceSession.isSpeaking,
          participants: currentVoiceSession.participants || [],
          seconds: voiceCallSeconds || 0
        } : null,
        incomingCall: incomingVoiceCallData ? {
          session_id: incomingVoiceCallData.session_id,
          title: incomingVoiceCallData.title,
          type: incomingVoiceCallData.type,
          caller_id: incomingVoiceCallData.caller_id,
          caller_name: incomingVoiceCallData.caller_name,
          caller_avatar: incomingVoiceCallData.caller_avatar,
          is_escalated: incomingVoiceCallData.is_escalated
        } : null
      };
      window.parent.postMessage({ type: 'TICKETFLOW_VOICE_STATE', ...state, state }, '*');
    } catch (e) {
      console.warn('Erro ao transmitir estado de voz para janela pai:', e);
    }
  }
}
window.broadcastVoiceStateToParent = broadcastVoiceStateToParent;

// Sintetizador de Ringtone Sonoro (Web Audio API - Sem necessidade de arquivos externos)
function playSynthesizedVoiceRingtone(type = 'incoming') {
  stopSynthesizedVoiceRingtone();
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    voiceRingtoneAudioCtx = new AudioContextClass();

    const playBeep = () => {
      if (!voiceRingtoneAudioCtx || voiceRingtoneAudioCtx.state === 'closed') return;
      const now = voiceRingtoneAudioCtx.currentTime;

      // Frequências harmoniosas (440Hz + 480Hz para tom de chamada)
      const osc1 = voiceRingtoneAudioCtx.createOscillator();
      const osc2 = voiceRingtoneAudioCtx.createOscillator();
      const gain = voiceRingtoneAudioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(type === 'incoming' ? 440 : 400, now);
      osc2.frequency.setValueAtTime(type === 'incoming' ? 480 : 450, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.8);
      gain.gain.linearRampToValueAtTime(0, now + 0.95);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(voiceRingtoneAudioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1);
      osc2.stop(now + 1);
    };

    playBeep();
    voiceRingtoneInterval = setInterval(playBeep, 2400);
  } catch (e) {
    console.warn('Erro ao inicializar ringtone sintetizado:', e);
  }
}

function stopSynthesizedVoiceRingtone() {
  if (voiceRingtoneInterval) {
    clearInterval(voiceRingtoneInterval);
    voiceRingtoneInterval = null;
  }
  if (voiceRingtoneAudioCtx) {
    try { voiceRingtoneAudioCtx.close(); } catch (e) {}
    voiceRingtoneAudioCtx = null;
  }
}

// Inicializa o fluxo de microfone local e Detecção de Atividade de Voz (VAD)
async function initVoiceLocalAudio() {
  if (voiceLocalAudioStream) return voiceLocalAudioStream;

  try {
    voiceLocalAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    // Inicia monitor de voz (Voice Activity Detection - VAD)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        voiceAudioContext = new AudioCtx();
        const source = voiceAudioContext.createMediaStreamSource(voiceLocalAudioStream);
        voiceAnalyserNode = voiceAudioContext.createAnalyser();
        voiceAnalyserNode.fftSize = 256;
        source.connect(voiceAnalyserNode);

        const dataArray = new Uint8Array(voiceAnalyserNode.frequencyBinCount);
        let speakingDebounce = null;
        let lastSpeakingState = false;

        const checkSpeaking = () => {
          if (!voiceLocalAudioStream || !currentVoiceSession) return;
          voiceAnalyserNode.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;

          const isMuted = currentVoiceSession && currentVoiceSession.isMuted;
          const isSpeakingNow = !isMuted && average > 14;

          if (isSpeakingNow) {
            if (speakingDebounce) clearTimeout(speakingDebounce);
            if (!lastSpeakingState) {
              lastSpeakingState = true;
              if (currentVoiceSession) {
                currentVoiceSession.isSpeaking = true;
                socket.emit('voice_speaking_state', { session_id: currentVoiceSession.id, isSpeaking: true });
                updateVoiceActiveBarUI();
              }
            }
          } else if (lastSpeakingState) {
            if (!speakingDebounce) {
              speakingDebounce = setTimeout(() => {
                lastSpeakingState = false;
                speakingDebounce = null;
                if (currentVoiceSession) {
                  currentVoiceSession.isSpeaking = false;
                  socket.emit('voice_speaking_state', { session_id: currentVoiceSession.id, isSpeaking: false });
                  updateVoiceActiveBarUI();
                }
              }, 400);
            }
          }

          voiceVadAnimationFrame = requestAnimationFrame(checkSpeaking);
        };

        checkSpeaking();
      }
    } catch (vadErr) {
      console.warn('VAD não inicializado:', vadErr);
    }

    return voiceLocalAudioStream;
  } catch (err) {
    console.warn('Microfone não acessível (entrando no modo ouvinte):', err ? err.message : err);
    voiceLocalAudioStream = null;
    return null;
  }
}

// Entrar em Sala de Voz (Geral ou Pessoal)
async function joinSectorVoiceRoom(roomId, roomName, targetType) {
  if (currentVoiceSession && currentVoiceSession.id === roomId) {
    showInputBarNotification('Você já está conectado nesta sala de voz.');
    return;
  }
  if (currentVoiceSession) {
    leaveCurrentVoiceCall();
  }

  connectingVoiceRoomId = roomId;
  refreshInternalUI();

  const connectStart = Date.now();
  try {
    await initVoiceLocalAudio();
  } catch (e) {
    console.warn('Erro ao inicializar áudio:', e);
  } finally {
    const elapsed = Date.now() - connectStart;
    if (elapsed < 300) {
      await new Promise(r => setTimeout(r, 300 - elapsed));
    }
    connectingVoiceRoomId = null;
  }

  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';
  const currentOpAvatar = currentOperator ? currentOperator.avatar : null;

  currentVoiceSession = {
    id: roomId,
    title: roomName || 'Sala de Voz',
    type: targetType || 'channel',
    isMuted: false,
    isSpeaking: false,
    participants: [{
      socketId: socket.id,
      operatorId: currentOpId,
      operatorName: currentOpName,
      avatar: currentOpAvatar,
      isMuted: false,
      isSpeaking: false
    }],
    startedAt: Date.now()
  };

  socket.emit('voice_start_call', {
    session_id: roomId,
    target_id: roomId,
    target_type: targetType || 'channel',
    title: roomName || 'Sala de Voz',
    caller_id: currentOpId,
    caller_name: currentOpName,
    caller_avatar: currentOpAvatar
  });

  startVoiceCallTimer();
  updateVoiceActiveBarUI();
  broadcastVoiceStateToParent();
  refreshInternalUI();
  playVoiceConnectedSound();
  showInputBarNotification(`Conectado à sala de voz: ${roomName || 'Sala de Voz'}`);
}

// Sons do Sistema de Voz
function playVoiceConnectedSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

function playVoiceDisconnectedSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

function playVoiceMuteSound(isMuted) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sine';

    if (isMuted) {
      // Tom suave descendente indicando mudo ativado
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
    } else {
      // Tom suave ascendente indicando microfone ativo / desmutado
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
    }

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.16);
    setTimeout(() => { try { ctx.close(); } catch(e){} }, 250);
  } catch (e) {}
}

// Iniciar Chamada de Voz a partir da sala atualmente aberta
async function startCurrentRoomVoiceCall() {
  if (!currentInternalRoomId) return;

  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';
  const currentOpAvatar = currentOperator ? currentOperator.avatar : null;

  await initVoiceLocalAudio();

  const isDM = currentInternalRoomId.startsWith('dm_');
  const isGroup = currentInternalRoomId.startsWith('group_');

  let targetType = 'channel';
  let targetId = currentInternalRoomId;
  let sessionTitle = 'Sala de Voz';

  if (isDM) {
    targetType = 'direct';
    const parts = currentInternalRoomId.replace('dm_', '').split('_');
    const otherId = parts.find(id => id !== currentOpId) || parts[0];
    targetId = otherId;
    const op = internalOperatorsList.find(o => String(o.id) === String(otherId));
    sessionTitle = op ? `Chamada: ${op.nome}` : 'Chamada Particular';
  } else if (isGroup) {
    targetType = 'group';
    const group = internalRoomsList.find(r => r.id === currentInternalRoomId);
    sessionTitle = group ? `Voz: ${group.nome}` : 'Chamada em Grupo';
  } else {
    targetType = 'channel';
    const channel = internalRoomsList.find(r => r.id === currentInternalRoomId);
    sessionTitle = channel ? `Voz: #${channel.nome}` : 'Canal de Voz';
  }

  const sessionId = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  currentVoiceSession = {
    id: sessionId,
    title: sessionTitle,
    type: targetType,
    isMuted: false,
    isSpeaking: false,
    participants: [{
      socketId: socket.id,
      operatorId: currentOpId,
      operatorName: currentOpName,
      avatar: currentOpAvatar,
      isMuted: false,
      isSpeaking: false
    }],
    startedAt: Date.now()
  };

  // Se for 1x1, toca som de chamada chamando até o colega atender
  if (targetType === 'direct') {
    playSynthesizedVoiceRingtone('outgoing');
  }

  socket.emit('voice_start_call', {
    session_id: sessionId,
    target_id: targetId,
    target_type: targetType,
    title: sessionTitle,
    caller_id: currentOpId,
    caller_name: currentOpName,
    caller_avatar: currentOpAvatar
  });

  startVoiceCallTimer();
  updateVoiceActiveBarUI();
  broadcastVoiceStateToParent();
}

// Aceitar Chamada de Voz Recebida
async function acceptIncomingVoiceCall() {
  if (!incomingVoiceCallData) return;

  stopSynthesizedVoiceRingtone();
  const callData = incomingVoiceCallData;
  incomingVoiceCallData = null;

  const modal = document.getElementById('voice-incoming-modal');
  if (modal) modal.classList.add('hidden');

  try {
    await initVoiceLocalAudio();
  } catch (e) {
    return;
  }

  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';
  const currentOpAvatar = currentOperator ? currentOperator.avatar : null;

  currentVoiceSession = {
    id: callData.session_id,
    title: callData.title || `Chamada: ${callData.caller_name}`,
    type: callData.type || 'direct',
    isMuted: false,
    isSpeaking: false,
    participants: [{
      socketId: socket.id,
      operatorId: currentOpId,
      operatorName: currentOpName,
      avatar: currentOpAvatar,
      isMuted: false,
      isSpeaking: false
    }],
    startedAt: Date.now()
  };

  socket.emit('voice_accept_call', {
    session_id: callData.session_id,
    operator_id: currentOpId,
    operator_name: currentOpName,
    avatar: currentOpAvatar
  });

  startVoiceCallTimer();
  updateVoiceActiveBarUI();
}

// Recusar Chamada de Voz Recebida
function rejectIncomingVoiceCall() {
  stopSynthesizedVoiceRingtone();

  if (incomingVoiceCallData) {
    const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
    const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';

    socket.emit('voice_reject_call', {
      session_id: incomingVoiceCallData.session_id,
      operator_id: currentOpId,
      operator_name: currentOpName,
      reason: 'declined'
    });
  }

  incomingVoiceCallData = null;
  const modal = document.getElementById('voice-incoming-modal');
  if (modal) modal.classList.add('hidden');
  broadcastVoiceStateToParent();
}

// Criação de RTCPeerConnection para sinalização Full Mesh
async function createVoicePeerConnection(peerSocketId, isInitiator, peerInfo = null) {
  if (voicePeerConnections.has(peerSocketId)) {
    return voicePeerConnections.get(peerSocketId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  voicePeerConnections.set(peerSocketId, pc);

  // Adiciona tracks de áudio local
  if (voiceLocalAudioStream) {
    voiceLocalAudioStream.getTracks().forEach(track => {
      pc.addTrack(track, voiceLocalAudioStream);
    });
  }

  // Envio de ICE Candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && currentVoiceSession) {
      socket.emit('voice_signal', {
        toSocketId: peerSocketId,
        session_id: currentVoiceSession.id,
        signal: { candidate: event.candidate },
        fromOperatorId: currentOperator ? currentOperator.id : 'me',
        fromOperatorName: currentOperator ? currentOperator.nome : 'Colega'
      });
    }
  };

  // Recebimento de Stream Remoto de Áudio
  pc.ontrack = (event) => {
    let remoteAudio = document.getElementById(`voice-remote-audio-${peerSocketId}`);
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.id = `voice-remote-audio-${peerSocketId}`;
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      const container = document.getElementById('voice-remote-audio-container');
      if (container) container.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(e => console.warn('Autoplay bloqueado pelo navegador:', e));
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removeVoicePeer(peerSocketId);
    }
  };

  // Se este par for o iniciador da oferta
  if (isInitiator) {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);

      socket.emit('voice_signal', {
        toSocketId: peerSocketId,
        session_id: currentVoiceSession ? currentVoiceSession.id : '',
        signal: offer,
        fromOperatorId: currentOperator ? currentOperator.id : 'me',
        fromOperatorName: currentOperator ? currentOperator.nome : 'Colega'
      });
    } catch (err) {
      console.error('Erro ao criar oferta WebRTC:', err);
    }
  }

  return pc;
}

function removeVoicePeer(peerSocketId) {
  const pc = voicePeerConnections.get(peerSocketId);
  if (pc) {
    try { pc.close(); } catch (e) {}
    voicePeerConnections.delete(peerSocketId);
  }
  const audioEl = document.getElementById(`voice-remote-audio-${peerSocketId}`);
  if (audioEl) audioEl.remove();
}

// Inicia / Reseta o Timer de Duração da Chamada
function startVoiceCallTimer() {
  if (voiceCallTimerInterval) clearInterval(voiceCallTimerInterval);
  voiceCallSeconds = 0;
  const timerEl = document.getElementById('voice-bar-timer');
  const bannerTimerEl = document.getElementById('voice-banner-timer');
  if (timerEl) timerEl.textContent = '00:00';
  if (bannerTimerEl) bannerTimerEl.textContent = '00:00';

  voiceCallTimerInterval = setInterval(() => {
    voiceCallSeconds++;
    const mins = String(Math.floor(voiceCallSeconds / 60)).padStart(2, '0');
    const secs = String(voiceCallSeconds % 60).padStart(2, '0');
    const formatted = `${mins}:${secs}`;
    if (timerEl) timerEl.textContent = formatted;
    if (bannerTimerEl) bannerTimerEl.textContent = formatted;
    broadcastVoiceStateToParent();
  }, 1000);
}

// Atualiza a Barra Flutuante de Voz e o Banner Superior da Conversa
function updateVoiceActiveBarUI() {
  broadcastVoiceStateToParent();
  const bar = document.getElementById('voice-active-bar');
  const banner = document.getElementById('voice-chat-banner');
  const voiceCallBtn = document.getElementById('btn-internal-voice-call');

  if (!currentVoiceSession) {
    if (bar) bar.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    if (voiceCallBtn) {
      const isDM = currentInternalRoomId && currentInternalRoomId.startsWith('dm_');
      voiceCallBtn.className = `h-8 md:h-9 px-3 rounded-xl items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 hover:text-white border border-emerald-500/30 hover:border-emerald-500/50 shadow-sm transition-all cursor-pointer select-none text-xs font-bold shrink-0 ${isDM ? 'flex' : 'hidden'}`;
      voiceCallBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span class="hidden sm:inline">Voz</span>
      `;
    }
    return;
  }

  // Se estiver em chamada ativa, exibe o Banner Superior e a Barra Flutuante
  if (bar) bar.classList.remove('hidden');
  if (banner) banner.classList.remove('hidden');

  // Atualiza botão do cabeçalho
  if (voiceCallBtn) {
    const isDM = currentInternalRoomId && currentInternalRoomId.startsWith('dm_');
    voiceCallBtn.className = `h-8 md:h-9 px-3 rounded-xl items-center gap-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm transition-all cursor-pointer select-none text-xs font-extrabold shrink-0 animate-pulse ${isDM ? 'flex' : 'hidden'}`;
    voiceCallBtn.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-rose-500"></span>
      <span class="hidden sm:inline">Em Chamada</span>
    `;
  }

  const titleEl = document.getElementById('voice-bar-title');
  const bannerTitleEl = document.getElementById('voice-banner-title');
  if (titleEl) titleEl.textContent = currentVoiceSession.title || 'Chamada de Voz';
  if (bannerTitleEl) bannerTitleEl.textContent = currentVoiceSession.title || 'Chamada de Voz';

  // Atualiza botão de mudo da barra flutuante e do banner
  const unmutedIcon = document.getElementById('icon-voice-unmuted');
  const mutedIcon = document.getElementById('icon-voice-muted');
  const muteLabel = document.getElementById('label-voice-mute');
  const btnMute = document.getElementById('btn-voice-mute');

  const bannerUnmutedIcon = document.getElementById('icon-voice-banner-unmuted');
  const bannerMutedIcon = document.getElementById('icon-voice-banner-muted');
  const bannerMuteLabel = document.getElementById('label-voice-banner-mute');
  const btnBannerMute = document.getElementById('btn-voice-banner-mute');

  if (currentVoiceSession.isMuted) {
    if (unmutedIcon) unmutedIcon.classList.add('hidden');
    if (mutedIcon) mutedIcon.classList.remove('hidden');
    if (muteLabel) muteLabel.classList.add('hidden');
    if (btnMute) {
      btnMute.className = 'w-8 h-8 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all flex items-center justify-center text-xs font-bold cursor-pointer select-none';
      btnMute.setAttribute('data-tooltip', 'Desmutar Microfone (Espaço)');
    }

    if (bannerUnmutedIcon) bannerUnmutedIcon.classList.add('hidden');
    if (bannerMutedIcon) bannerMutedIcon.classList.remove('hidden');
    if (bannerMuteLabel) bannerMuteLabel.classList.add('hidden');
    if (btnBannerMute) {
      btnBannerMute.className = 'w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all flex items-center justify-center text-[11px] font-bold cursor-pointer select-none';
      btnBannerMute.setAttribute('data-tooltip', 'Desmutar Microfone');
    }
  } else {
    if (unmutedIcon) unmutedIcon.classList.remove('hidden');
    if (mutedIcon) mutedIcon.classList.add('hidden');
    if (muteLabel) muteLabel.classList.add('hidden');
    if (btnMute) {
      btnMute.className = 'w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 transition-all flex items-center justify-center text-xs font-bold cursor-pointer select-none';
      btnMute.setAttribute('data-tooltip', 'Mutar Microfone (Espaço)');
    }

    if (bannerUnmutedIcon) bannerUnmutedIcon.classList.remove('hidden');
    if (bannerMutedIcon) bannerMutedIcon.classList.add('hidden');
    if (bannerMuteLabel) bannerMuteLabel.classList.add('hidden');
    if (btnBannerMute) {
      btnBannerMute.className = 'w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 transition-all flex items-center justify-center text-[11px] font-bold cursor-pointer select-none';
      btnBannerMute.setAttribute('data-tooltip', 'Mutar Microfone');
    }
  }

  // Renderiza avatares dos participantes na barra e no banner
  const avatarsContainer = document.getElementById('voice-bar-avatars');
  const bannerAvatarsContainer = document.getElementById('voice-banner-avatars');

  const renderAvatarsInto = (container, isSmall = false) => {
    if (!container) return;
    container.innerHTML = '';
    (currentVoiceSession.participants || []).forEach(p => {
      const isMe = currentOperator && String(p.operatorId) === String(currentOperator.id);
      const isSpeaking = isMe ? currentVoiceSession.isSpeaking : p.isSpeaking;
      const initial = p.operatorName ? p.operatorName.charAt(0).toUpperCase() : 'U';
      const sizeClass = isSmall ? 'w-6 h-6' : 'w-7 h-7';

      const avatarDiv = document.createElement('div');
      avatarDiv.className = `relative ${sizeClass} rounded-full flex items-center justify-center font-bold text-xs shrink-0 border-2 border-[#0f172a] transition-all duration-200 ${isSpeaking ? 'voice-speaking-ring scale-110 z-10' : ''} ${p.isMuted ? 'opacity-50' : ''}`;
      avatarDiv.style.backgroundColor = isMe ? 'var(--color-primary-theme, #ef4444)' : '#3b82f6';
      avatarDiv.title = `${p.operatorName || 'Participante'} ${p.isMuted ? '(Mutado)' : (isSpeaking ? '(Falando...)' : '')}`;

      avatarDiv.innerHTML = `
        ${p.avatar ? `<img src="${p.avatar}" class="w-full h-full object-cover rounded-full">` : `<span class="text-white text-[10px]">${initial}</span>`}
        ${p.isMuted ? '<span class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 border border-[#0f172a]"></span>' : ''}
      `;
      container.appendChild(avatarDiv);
    });
  };

  renderAvatarsInto(avatarsContainer, false);
  renderAvatarsInto(bannerAvatarsContainer, true);
}

// Mutar / Desmutar Microfone
function toggleVoiceMute() {
  if (!currentVoiceSession) return;

  currentVoiceSession.isMuted = !currentVoiceSession.isMuted;

  // Atualiza as faixas de áudio do microfone local se existirem
  if (voiceLocalAudioStream) {
    try {
      voiceLocalAudioStream.getAudioTracks().forEach(track => {
        track.enabled = !currentVoiceSession.isMuted;
      });
    } catch (e) {
      console.warn('Erro ao alternar track de áudio local:', e);
    }
  }

  // Atualiza o status de mudo no participante local
  const myId = currentOperator ? String(currentOperator.id) : 'me';
  if (currentVoiceSession.participants) {
    const meP = currentVoiceSession.participants.find(p => String(p.operatorId) === myId || (socket && p.socketId === socket.id));
    if (meP) {
      meP.isMuted = currentVoiceSession.isMuted;
    }
  }

  // Efeito sonoro suave de feedback
  playVoiceMuteSound(currentVoiceSession.isMuted);

  // Transmite para os outros participantes da chamada
  if (typeof socket !== 'undefined' && socket && socket.connected) {
    socket.emit('voice_mute_state', {
      session_id: currentVoiceSession.id,
      isMuted: currentVoiceSession.isMuted
    });
  }

  // Atualiza diretamente no DOM todos os botões de mute de salas de voz
  document.querySelectorAll('.voice-btn-mute-toggle').forEach(muteBtn => {
    muteBtn.className = `voice-btn-mute-toggle w-7 h-7 rounded-xl text-[11px] font-extrabold ${currentVoiceSession.isMuted ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'} cursor-pointer flex items-center justify-center shrink-0 transition-colors duration-200 select-none`;
    muteBtn.setAttribute('data-tooltip', currentVoiceSession.isMuted ? 'Desmutar Microfone' : 'Mutar Microfone');
    muteBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0">
        ${currentVoiceSession.isMuted 
          ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
          : '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'
        }
      </svg>
    `;
  });

  // Atualiza o microfone do chip local do participante em todas as bandejas
  document.querySelectorAll(`.voice-participant-chip[data-op-id="${myId}"]`).forEach(chip => {
    let dot = chip.querySelector('.bg-rose-500');
    const avatarInner = chip.querySelector('.w-6');
    if (currentVoiceSession.isMuted) {
      if (!dot) {
        chip.insertAdjacentHTML('beforeend', '<span class="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 border border-[#0f172a]"></span>');
      }
      if (avatarInner) avatarInner.classList.add('opacity-60');
    } else {
      if (dot) dot.remove();
      if (avatarInner) avatarInner.classList.remove('opacity-60');
    }
  });

  // Atualiza barra de voz e dock externa
  updateVoiceActiveBarUI();
  broadcastVoiceStateToParent();
}

// Modal de Adicionar Participante à Chamada Ativa (Escalonamento 1x1 ➡️ Grupo)
function openVoiceAddParticipantModal() {
  const modal = document.getElementById('voice-add-participant-modal');
  const searchInput = document.getElementById('input-voice-search-operator');
  if (searchInput) searchInput.value = '';

  filterVoiceInviteList('');

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
  }
}

function closeVoiceAddParticipantModal() {
  const modal = document.getElementById('voice-add-participant-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('internal-modal-overlay');
  }
}

function filterVoiceInviteList(query = '') {
  const container = document.getElementById('voice-invite-operators-list');
  if (!container || !currentVoiceSession) return;

  const q = (query || '').trim().toLowerCase();
  const existingOpIds = new Set((currentVoiceSession.participants || []).map(p => String(p.operatorId)));
  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';

  const available = (internalOperatorsList || []).filter(op => {
    if (!op || String(op.id) === currentOpId || existingOpIds.has(String(op.id))) return false;
    if (!q) return true;
    return (op.nome && op.nome.toLowerCase().includes(q)) || (op.setor && op.setor.toLowerCase().includes(q));
  });

  container.innerHTML = '';

  if (available.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-[var(--color-text-muted)]">
        <p class="text-xs font-bold">Nenhum colega disponível</p>
        <p class="text-[10px] mt-0.5 text-slate-400">Todos os colegas disponíveis já estão na chamada ou offline.</p>
      </div>
    `;
    return;
  }

  available.forEach(op => {
    const item = document.createElement('div');
    item.className = 'p-2.5 rounded-xl internal-card flex items-center justify-between gap-3 hover:border-slate-600/40 transition-all select-none';
    const initial = op.nome ? op.nome.charAt(0).toUpperCase() : 'O';

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden text-white" style="background: var(--color-primary-theme, #ef4444);">
          ${op.avatar ? `<img src="${op.avatar}" class="w-full h-full object-cover">` : initial}
        </div>
        <div class="min-w-0">
          <p class="text-xs font-bold text-foreground truncate">${escapeHtml(op.nome)}</p>
          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase internal-sector-tag">${escapeHtml(op.setor || 'Atendimento')}</span>
        </div>
      </div>
      <button onclick="inviteOperatorToActiveCall('${op.id}')" type="button" class="px-3 py-1.5 rounded-lg text-xs font-extrabold text-white cursor-pointer transition-all active:scale-95 shadow-sm" style="background: linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 80%, black));">
        Convidar
      </button>
    `;
    container.appendChild(item);
  });
}

// Convidar Operador para a Chamada Ativa
function inviteOperatorToActiveCall(targetOperatorId) {
  if (!currentVoiceSession) return;
  const currentOpId = currentOperator ? String(currentOperator.id) : 'me';
  const currentOpName = currentOperator ? (currentOperator.name || currentOperator.nome) : 'Atendente';
  const currentOpAvatar = currentOperator ? currentOperator.avatar : null;

  socket.emit('voice_invite_operator', {
    session_id: currentVoiceSession.id,
    target_operator_id: targetOperatorId,
    caller_id: currentOpId,
    caller_name: currentOpName,
    caller_avatar: currentOpAvatar,
    title: currentVoiceSession.title || 'Chamada de Voz'
  });

  closeVoiceAddParticipantModal();
  showInputBarNotification('Convite de chamada enviado!');
}

// Encerrar Chamada de Voz
function leaveCurrentVoiceCall() {
  stopSynthesizedVoiceRingtone();
  playVoiceDisconnectedSound();

  // Dispara a animação suave de retração do card no DOM
  const activeTrays = document.querySelectorAll('.voice-card-participants');
  activeTrays.forEach(tray => {
    tray.classList.remove('voice-tray-entering');
    tray.classList.add('voice-tray-collapsing');
  });

  if (voiceCallTimerInterval) {
    clearInterval(voiceCallTimerInterval);
    voiceCallTimerInterval = null;
  }
  if (voiceVadAnimationFrame) {
    cancelAnimationFrame(voiceVadAnimationFrame);
    voiceVadAnimationFrame = null;
  }

  if (currentVoiceSession) {
    socket.emit('voice_leave_call', { session_id: currentVoiceSession.id });
  }

  // Fecha todas as conexões WebRTC
  voicePeerConnections.forEach(pc => {
    try { pc.close(); } catch (e) {}
  });
  voicePeerConnections.clear();

  // Para o microfone local
  if (voiceLocalAudioStream) {
    voiceLocalAudioStream.getTracks().forEach(track => track.stop());
    voiceLocalAudioStream = null;
  }

  if (voiceAudioContext) {
    try { voiceAudioContext.close(); } catch (e) {}
    voiceAudioContext = null;
  }

  // Limpa elementos de áudio remotos
  const remoteContainer = document.getElementById('voice-remote-audio-container');
  if (remoteContainer) remoteContainer.innerHTML = '';

  currentVoiceSession = null;
  updateVoiceActiveBarUI();
  broadcastVoiceStateToParent();
  refreshInternalUI();

  setTimeout(() => {
    activeTrays.forEach(tray => {
      try { if (tray && tray.parentNode) tray.parentNode.removeChild(tray); } catch (e) {}
    });
  }, 280);
}

// ==============================================================================
// 🎙️ SOCKET LISTENERS DO SISTEMA DE VOZ WEBRTC
// ==============================================================================

// 1. Recebimento de Chamada de Voz
socket.on('voice_incoming_call', (data) => {
  incomingVoiceCallData = data;
  playSynthesizedVoiceRingtone('incoming');
  broadcastVoiceStateToParent();

  const modal = document.getElementById('voice-incoming-modal');
  const nameEl = document.getElementById('voice-incoming-name');
  const descEl = document.getElementById('voice-incoming-desc');
  const badgeEl = document.getElementById('voice-incoming-badge');
  const avatarEl = document.getElementById('voice-incoming-avatar');

  if (nameEl) nameEl.textContent = data.caller_name || 'Colega';
  if (descEl) {
    descEl.textContent = data.is_escalated
      ? `${data.caller_name} convidou você para a chamada em grupo em andamento.`
      : (data.type === 'group' ? `Chamada em grupo iniciada por ${data.caller_name}.` : 'Deseja iniciar bate-papo de voz com você.');
  }
  if (badgeEl) {
    badgeEl.textContent = data.is_escalated ? 'Convite de Voz em Grupo' : (data.type === 'group' ? 'Chamada em Grupo' : 'Chamada de Voz Particular');
  }
  if (avatarEl) {
    const initial = data.caller_name ? data.caller_name.charAt(0).toUpperCase() : 'U';
    avatarEl.innerHTML = data.caller_avatar ? `<img src="${data.caller_avatar}" class="w-full h-full object-cover rounded-full">` : initial;
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('internal-modal-overlay');
  }
});

// 2. Novo Participante Entrou na Sessão de Voz (WebRTC Mesh: estabelece oferta/resposta)
socket.on('voice_user_joined', async ({ session_id, newParticipant, participants }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  stopSynthesizedVoiceRingtone(); // Conectou com sucesso!
  currentVoiceSession.participants = participants || [];
  updateVoiceActiveBarUI();

  // Se eu já estava na sala, eu inicio a conexão (oferta) com o novo participante
  if (newParticipant.socketId !== socket.id) {
    await createVoicePeerConnection(newParticipant.socketId, true, newParticipant);
  }
});

// 3. Sinalização WebRTC (Ofertas, Respostas e ICE Candidates)
socket.on('voice_signal', async ({ fromSocketId, session_id, signal, fromOperatorId, fromOperatorName }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  let pc = voicePeerConnections.get(fromSocketId);

  if (signal.type === 'offer') {
    if (!pc) {
      pc = await createVoicePeerConnection(fromSocketId, false, { operatorId: fromOperatorId, operatorName: fromOperatorName });
    }
    await pc.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('voice_signal', {
      toSocketId: fromSocketId,
      session_id,
      signal: answer,
      fromOperatorId: currentOperator ? currentOperator.id : 'me',
      fromOperatorName: currentOperator ? currentOperator.nome : 'Colega'
    });
  } else if (signal.type === 'answer') {
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal));
    }
  } else if (signal.candidate) {
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch (err) {
        console.warn('Erro ao adicionar ICE candidate:', err);
      }
    }
  }
});

// 4. Participante Saiu da Sessão de Voz
socket.on('voice_user_left', ({ session_id, leavingSocketId, operatorId, participants }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  removeVoicePeer(leavingSocketId);
  currentVoiceSession.participants = participants || [];
  updateVoiceActiveBarUI();

  if (currentVoiceSession.participants.length <= 1 && currentVoiceSession.type === 'direct') {
    showInputBarNotification('O colega encerrou a chamada.');
    leaveCurrentVoiceCall();
  }
});

// 5. Atualização de Estado da Sessão
socket.on('voice_session_updated', ({ session_id, title, type, participants }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  if (participants && participants.length > 1) {
    stopSynthesizedVoiceRingtone();
  }

  currentVoiceSession.title = title || currentVoiceSession.title;
  currentVoiceSession.type = type || currentVoiceSession.type;
  currentVoiceSession.participants = participants || currentVoiceSession.participants;
  updateVoiceActiveBarUI();
  broadcastVoiceStateToParent();
});

// 6. Atividade de Voz (Quem está falando)
socket.on('voice_speaking_state', ({ session_id, socketId, operatorId, isSpeaking }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  const p = (currentVoiceSession.participants || []).find(part => part.socketId === socketId || String(part.operatorId) === String(operatorId));
  if (p) {
    p.isSpeaking = !!isSpeaking;
    updateVoiceActiveBarUI();
    broadcastVoiceStateToParent();
  }
});

// 7. Estado de Microfone Mutado
socket.on('voice_mute_state', ({ session_id, socketId, operatorId, isMuted }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;

  const p = (currentVoiceSession.participants || []).find(part => part.socketId === socketId || String(part.operatorId) === String(operatorId));
  if (p) {
    p.isMuted = !!isMuted;
    updateVoiceActiveBarUI();
    broadcastVoiceStateToParent();
  }
});

// 8. Chamada Recusada ou Encerrada
socket.on('voice_call_rejected', ({ session_id, operator_name }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;
  stopSynthesizedVoiceRingtone();
  showInputBarNotification(`${operator_name || 'O colega'} recusou a chamada.`);
  leaveCurrentVoiceCall();
  broadcastVoiceStateToParent();
});

socket.on('voice_call_ended', ({ session_id }) => {
  if (!currentVoiceSession || currentVoiceSession.id !== session_id) return;
  stopSynthesizedVoiceRingtone();
  showInputBarNotification('A chamada de voz foi encerrada.');
  leaveCurrentVoiceCall();
  broadcastVoiceStateToParent();
});

socket.on('voice_error', ({ message }) => {
  stopSynthesizedVoiceRingtone();
  if (message) showInputBarNotification(message);
});

// ==============================================================================
// 📡 TRANSMISSÃO DE ESTADO DE VOZ PARA A JANELA PAI (NEXT.JS PORTAL)
// ==============================================================================

function broadcastVoiceStateToParent() {
  if (window.parent && window.parent !== window) {
    try {
      const state = {
        inCall: !!currentVoiceSession,
        session: currentVoiceSession ? {
          id: currentVoiceSession.id,
          title: currentVoiceSession.title,
          type: currentVoiceSession.type,
          isMuted: currentVoiceSession.isMuted,
          isSpeaking: currentVoiceSession.isSpeaking,
          participants: currentVoiceSession.participants || [],
          seconds: voiceCallSeconds || 0
        } : null,
        incomingCall: incomingVoiceCallData ? {
          session_id: incomingVoiceCallData.session_id,
          title: incomingVoiceCallData.title,
          type: incomingVoiceCallData.type,
          caller_id: incomingVoiceCallData.caller_id,
          caller_name: incomingVoiceCallData.caller_name,
          caller_avatar: incomingVoiceCallData.caller_avatar,
          is_escalated: incomingVoiceCallData.is_escalated
        } : null
      };
      window.parent.postMessage({ type: 'TICKETFLOW_VOICE_STATE', ...state, state }, '*');
    } catch (e) {
      console.warn('Erro ao transmitir estado de voz para janela pai:', e);
    }
  }
}

// Ouve comandos vindos da janela pai Next.js (ex: mutar pela barra flutuante global, atender, recusar, sair)
window.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'TICKETFLOW_VOICE_ACTION') {
    const action = event.data.action;
    if (action === 'toggle_mute') {
      toggleVoiceMute();
    } else if (action === 'leave_call') {
      leaveCurrentVoiceCall();
    } else if (action === 'accept_call') {
      acceptIncomingVoiceCall();
    } else if (action === 'reject_call') {
      rejectIncomingVoiceCall();
    } else if (action === 'open_invite_modal') {
      openVoiceAddParticipantModal();
    }
  } else if (event.data.type === 'TICKETFLOW_REQUEST_VOICE_STATE') {
    broadcastVoiceStateToParent();
  }
});

// ==============================================================================
// 🌟 MOTOR GLOBAL DE TOOLTIPS DO SISTEMA (Substitui Tooltips Padrões do Navegador)
// ==============================================================================

function initGlobalTooltips() {
  let tooltipEl = document.getElementById('system-global-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'system-global-tooltip';
    tooltipEl.className = 'system-global-tooltip';
    tooltipEl.innerHTML = `
      <div class="system-global-tooltip-inner">
        <span class="system-global-tooltip-text"></span>
        <div class="system-global-tooltip-arrow"></div>
      </div>
    `;
    document.body.appendChild(tooltipEl);
  }

  const textEl = tooltipEl.querySelector('.system-global-tooltip-text');
  const arrowEl = tooltipEl.querySelector('.system-global-tooltip-arrow');

  let currentTarget = null;

  function hideTooltip() {
    currentTarget = null;
    tooltipEl.classList.remove('tooltip-visible');
  }

  function sanitizeTitlesInTree(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.hasAttribute && node.hasAttribute('title')) {
      const val = node.getAttribute('title');
      if (val && val.trim()) {
        node.setAttribute('data-tooltip', val.trim());
      }
      node.removeAttribute('title');
    }
    if (node.querySelectorAll) {
      const titles = node.querySelectorAll('[title]');
      for (let i = 0; i < titles.length; i++) {
        const el = titles[i];
        const val = el.getAttribute('title');
        if (val && val.trim()) {
          el.setAttribute('data-tooltip', val.trim());
        }
        el.removeAttribute('title');
      }
    }
  }

  // Sanitiza títulos existentes no documento
  sanitizeTitlesInTree(document.body);

  // Observa nós inseridos dinamicamente para neutralizar o atributo 'title' nativo
  if (window.MutationObserver) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (let i = 0; i < m.addedNodes.length; i++) {
            sanitizeTitlesInTree(m.addedNodes[i]);
          }
        } else if (m.type === 'attributes' && m.attributeName === 'title' && m.target) {
          const val = m.target.getAttribute('title');
          if (val && val.trim()) {
            m.target.setAttribute('data-tooltip', val.trim());
          }
          m.target.removeAttribute('title');
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
  }

  function showTooltipFor(target) {
    if (!target) return;
    const el = target.closest('[data-tooltip], [title], [data-title]');
    if (!el) {
      hideTooltip();
      return;
    }

    if (el.hasAttribute('title')) {
      const val = el.getAttribute('title');
      if (val && val.trim()) {
        el.setAttribute('data-tooltip', val.trim());
      }
      el.removeAttribute('title');
    }

    const text = el.getAttribute('data-tooltip') || el.getAttribute('data-title');
    if (!text || !text.trim()) {
      hideTooltip();
      return;
    }

    currentTarget = el;
    textEl.textContent = text.trim();

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideTooltip();
      return;
    }

    // Reset classes para medição correta
    tooltipEl.className = 'system-global-tooltip';
    tooltipEl.style.top = '0px';
    tooltipEl.style.left = '0px';
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.display = 'block';

    const tipRect = tooltipEl.getBoundingClientRect();
    const preferredPos = el.getAttribute('data-tooltip-pos') || 'top';
    const gap = 7;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let pos = preferredPos;
    if (pos === 'top' && rect.top - tipRect.height - gap < 6) {
      pos = 'bottom';
    } else if (pos === 'bottom' && rect.bottom + tipRect.height + gap > viewportHeight - 6) {
      pos = 'top';
    }

    let top = 0;
    let left = 0;

    if (pos === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      tooltipEl.classList.add('pos-bottom');
    } else if (pos === 'left') {
      top = rect.top + (rect.height / 2) - (tipRect.height / 2);
      left = rect.left - tipRect.width - gap;
      tooltipEl.classList.add('pos-left');
    } else if (pos === 'right') {
      top = rect.top + (rect.height / 2) - (tipRect.height / 2);
      left = rect.right + gap;
      tooltipEl.classList.add('pos-right');
    } else {
      top = rect.top - tipRect.height - gap;
      left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      tooltipEl.classList.add('pos-top');
    }

    // Ajusta para não sair das bordas da tela
    const minMargin = 8;
    let arrowOffset = 0;
    if (left < minMargin) {
      arrowOffset = left - minMargin;
      left = minMargin;
    } else if (left + tipRect.width > viewportWidth - minMargin) {
      arrowOffset = (left + tipRect.width) - (viewportWidth - minMargin);
      left = viewportWidth - minMargin - tipRect.width;
    }

    if (arrowEl && (pos === 'top' || pos === 'bottom')) {
      const arrowCenter = (tipRect.width / 2) + arrowOffset;
      const clampedArrow = Math.max(10, Math.min(tipRect.width - 10, arrowCenter));
      arrowEl.style.left = clampedArrow + 'px';
      arrowEl.style.top = '';
    } else if (arrowEl) {
      arrowEl.style.left = '';
      arrowEl.style.top = '';
    }

    tooltipEl.style.top = Math.round(top) + 'px';
    tooltipEl.style.left = Math.round(left) + 'px';
    tooltipEl.style.visibility = 'visible';
    tooltipEl.classList.add('tooltip-visible');
  }

  document.addEventListener('mouseover', (e) => {
    showTooltipFor(e.target);
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    if (currentTarget && (!e.relatedTarget || !currentTarget.contains(e.relatedTarget))) {
      hideTooltip();
    }
  }, { passive: true });

  document.addEventListener('mousedown', () => hideTooltip(), { passive: true });
  document.addEventListener('click', () => hideTooltip(), { passive: true });
  window.addEventListener('scroll', () => hideTooltip(), { capture: true, passive: true });
}

// Inicializa tooltips globais após carregamento do DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalTooltips);
} else {
  initGlobalTooltips();
}





