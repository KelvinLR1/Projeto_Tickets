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
function logoutOperator() {
  if (confirm('Tem certeza que deseja sair deste painel de atendente?')) {
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
      const confirmed = confirm(
        `⚠️ AVISO DE SEGURANÇA:\n\nIniciar conversas ativas com números que não falaram com a empresa antes aumenta o risco de banimento do número.\n\nDeseja mesmo iniciar este chat com ${name} (${phone})?`
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
        <div class="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3.5 shadow-md shadow-blue-500/5">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400"><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
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
  
  if (isSystem) {
    msgDiv.innerHTML = `<span class="${bubbleClass}">${msg.texto}</span>`;
  } else {
    msgDiv.innerHTML = `
      <div class="${bubbleClass}">
        <p class="whitespace-pre-wrap leading-relaxed">${msg.texto}</p>
        <span class="msg-time">${formattedTime}</span>
      </div>
    `;
  }

  messagesContainer.appendChild(msgDiv);
}

// Envia mensagem pelo input do chat
function sendMessage(e) {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !selectedChatJid) return;

  socket.emit('send_message', {
    cliente_jid: selectedChatJid,
    texto: text,
    atendente_id: currentOperator.id
  });

  chatInput.value = '';
}

// Finaliza Atendimento atual
function finishCurrentChat() {
  if (!selectedChatJid) return;
  
  if (confirm(`Deseja finalizar o atendimento de ${selectedChatName}?`)) {
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

// ==============================================================================
// 🚀 INICIALIZAÇÃO
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  initOperator();
});
