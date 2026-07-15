// app.js

// Conexão Socket.io (conecta-se automaticamente ao host que serve o arquivo)
const socket = io();

// Estado Global da Aplicação
let currentOperator = { id: '', name: '' };
let selectedChatJid = null;
let selectedChatName = '';
let activeChats = [];
let queueChats = [];

// Elementos da DOM
const qrModal = document.getElementById('qr-modal');
const qrImage = document.getElementById('qr-image');
const qrSpinner = document.getElementById('qr-loading-spinner');
const qrStatusText = document.getElementById('qr-status-text');

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
    
    // Atualiza cabeçalho
    headerOpName.textContent = savedName;
    headerOpId.textContent = `id: ${savedId}`;
    headerOpAvatar.textContent = savedName.substring(0, 2).toUpperCase();
    
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
    queueContainer.innerHTML = `<div class="text-center py-8 text-xs text-slate-500 font-medium">Nenhum cliente na fila</div>`;
    return;
  }

  queueContainer.innerHTML = queueChats.map(chat => `
    <div class="glass-card rounded-xl p-3.5 flex flex-col gap-2 relative fade-in border border-white/5 bg-[#121625]/20">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-500/25 flex items-center justify-center font-bold text-xs text-yellow-500 uppercase">
          ${chat.cliente_nome.substring(0, 2)}
        </div>
        <div class="leading-none text-left flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-200 truncate" title="${chat.cliente_nome}">${chat.cliente_nome}</p>
          <span class="text-[10px] text-slate-500 font-mono mt-0.5 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
      </div>
      
      <button onclick="takeChat('${chat.cliente_jid}')" class="w-full h-8 rounded-lg bg-yellow-600/10 hover:bg-yellow-600 hover:text-white border border-yellow-500/30 text-yellow-500 text-xs font-bold transition-all duration-300">
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

function renderActiveChats() {
  if (activeChats.length === 0) {
    activeContainer.innerHTML = `<div class="text-center py-8 text-xs text-slate-500 font-medium">Você não possui atendimentos ativos</div>`;
    return;
  }

  activeContainer.innerHTML = activeChats.map(chat => {
    const isSelected = selectedChatJid === chat.cliente_jid;
    return `
      <div onclick="selectChat('${chat.cliente_jid}', '${chat.cliente_nome}')" class="glass-card rounded-xl p-3.5 flex items-center gap-3 cursor-pointer transition-all duration-300 border ${isSelected ? 'active border-indigo-500/50 bg-indigo-500/5' : 'border-white/5 bg-[#121625]/20'}">
        <div class="w-9 h-9 rounded-full ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'} flex items-center justify-center font-bold text-xs uppercase">
          ${chat.cliente_nome.substring(0, 2)}
        </div>
        <div class="leading-none text-left flex-1 min-w-0">
          <p class="text-xs font-bold text-slate-200 truncate">${chat.cliente_nome}</p>
          <span class="text-[9px] text-slate-500 font-mono mt-0.5 block truncate">${chat.cliente_jid.split('@')[0]}</span>
        </div>
        <div class="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
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
  chatClientAvatar.textContent = name.substring(0, 2).toUpperCase();

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

  const date = new Date(msg.timestamp);
  const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex flex-col w-full ${isSystem ? 'items-center' : (isClient ? 'items-start' : 'items-end')}`;
  
  if (isSystem) {
    msgDiv.innerHTML = `<span class="${bubbleClass}">${msg.texto}</span>`;
  } else {
    msgDiv.innerHTML = `
      <div class="${bubbleClass}">
        <p class="whitespace-pre-wrap">${msg.texto}</p>
        <span class="text-[8px] opacity-50 block text-right mt-1.5 font-mono">${formattedTime}</span>
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
