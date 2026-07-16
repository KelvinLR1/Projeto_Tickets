// Detecta e aplica tema enviado via Query Parameter pelo Next.js
const urlParams = new URLSearchParams(window.location.search);
const currentTheme = urlParams.get('theme') || 'dark';
document.documentElement.className = `theme-${currentTheme}`;

// Conexão Socket.io (conecta-se automaticamente ao host que serve o arquivo)
const socket = io();

// Estado Global da Aplicação
let currentOperator = { id: '', name: '' };
let selectedChatJid = null;
let selectedChatName = '';
let activeChats = [];
let queueChats = [];
let botChats = [];
let currentChatMessages = [];

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

// ==============================================================================
// 👤 CONTROLE DE LOGIN / IDENTIFICAÇÃO DO OPERADOR
// ==============================================================================

// Carrega o operador salvo ou exibe modal
function initOperator() {
  // Tentar ler dos parâmetros da URL (caso esteja incorporado no iframe do portal principal)
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get('operator_id');
  const paramName = urlParams.get('operator_name');

  if (paramId && paramName) {
    localStorage.setItem('tf_operator_id', paramId.trim());
    localStorage.setItem('tf_operator_name', paramName.trim());
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

const activeChatsContainer = document.getElementById('active-chats-container');
const queueChatsContainer = document.getElementById('queue-list-container');
const botChatsContainer = document.getElementById('bot-chats-container');

function switchSidebarTab(tab) {
  currentSidebarTab = tab;
  
  // Reset buttons styles
  [tabActiveBtn, tabQueueBtn, tabBotBtn].forEach(btn => {
    btn.className = "flex-1 py-2 px-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1";
  });

  // Reset containers visibility
  [activeChatsContainer, queueChatsContainer, botChatsContainer].forEach(container => {
    container.classList.add('hidden');
  });

  // Apply active styles
  if (tab === 'active') {
    tabActiveBtn.className = "flex-1 py-2 px-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1 bg-white/5 border border-white/10 shadow-sm";
    activeChatsContainer.classList.remove('hidden');
  } else if (tab === 'queue') {
    tabQueueBtn.className = "flex-1 py-2 px-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1 bg-white/5 border border-white/10 shadow-sm";
    queueChatsContainer.classList.remove('hidden');
  } else if (tab === 'bot') {
    tabBotBtn.className = "flex-1 py-2 px-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-white transition-all flex items-center justify-center gap-1 bg-white/5 border border-white/10 shadow-sm";
    botChatsContainer.classList.remove('hidden');
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
    // Esconde Modal do QR Code
    qrModal.classList.add('hidden');
    
    // Badge do Header -> Verde
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    statusText.textContent = 'Conectado';
  } else if (status === 'aguardando_qr') {
    // Exibe Modal do QR Code
    qrModal.classList.remove('hidden');
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
    qrModal.classList.remove('hidden');
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
  queueChats = rows;
  queueCountBadge.textContent = rows.length;
  renderQueueList();
});

function renderQueueList() {
  if (queueChats.length === 0) {
    queueContainer.innerHTML = `<div class="text-center py-10 text-xs text-slate-500 font-medium">Nenhum cliente na fila</div>`;
    return;
  }

  queueContainer.innerHTML = queueChats.map(chat => `
    <div class="glass-card rounded-2xl p-4 flex flex-col gap-3 relative fade-in border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-300">
      <div class="flex items-center gap-3">
        <div class="w-11.5 h-11.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-bold text-base text-amber-400 uppercase shrink-0 overflow-hidden">
          ${chat.cliente_avatar 
            ? `<img src="${chat.cliente_avatar}" alt="${chat.cliente_nome}" class="w-full h-full object-cover" onerror="this.outerHTML='${chat.cliente_nome.substring(0, 2).toUpperCase()}'"/>` 
            : chat.cliente_nome.substring(0, 2).toUpperCase()
          }
        </div>
        <div class="leading-tight text-left flex-1 min-w-0">
          <p class="text-xs font-semibold text-slate-100 truncate" title="${chat.cliente_nome}">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-1 block truncate">${chat.cliente_jid.split('@')[0]}</span>
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
}

// Recebe Lista de Conversas Ativas
socket.on('active_chats_list', (rows) => {
  activeChats = rows;
  activeCountBadge.textContent = rows.length;
  renderActiveChats();
});

// Recebe Lista de Conversas do Bot
socket.on('bot_chats_list', (rows) => {
  botChats = rows;
  const botCountBadge = document.getElementById('bot-chats-count') || document.querySelector('#tab-bot span');
  if (botCountBadge) {
    botCountBadge.textContent = rows.length;
  }
  renderBotChats();
});

function renderBotChats() {
  if (!botChatsContainer) return;
  if (botChats.length === 0) {
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

  botChatsContainer.innerHTML = botChats.map(chat => {
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
  if (activeChats.length === 0) {
    activeContainer.innerHTML = `<div class="text-center py-10 text-xs text-slate-500 font-medium">Você não possui atendimentos ativos</div>`;
    return;
  }

  activeContainer.innerHTML = activeChats.map(chat => {
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
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
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

// Interceptar clique com o botão direito nas mensagens do chat
messagesContainer.addEventListener('contextmenu', (e) => {
  const bubble = e.target.closest('.msg-bubble');
  if (!bubble) return;

  e.preventDefault();

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
    <button onclick="handleContextReact('${emoji}')" class="text-base hover:scale-125 transition-transform active:scale-95 duration-100">${emoji}</button>
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
