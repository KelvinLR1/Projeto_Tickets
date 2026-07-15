const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

// Configurações principais
const PORT = process.env.PORT || 5000;
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Habilitar CORS para o Express (permite requisições do Next.js na porta 3000)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Rotas de API para o Painel Geral / Configurações
app.get('/api/status', (req, res) => {
  res.json({ status: whatsappStatus, qr: qrCodeImage });
});

app.post('/api/disconnect', async (req, res) => {
  try {
    console.log('🔌 Solicitação de desconexão recebida via API...');
    if (wwebClient) {
      await wwebClient.logout();
      // Reinicializa o cliente para poder exibir o QR code novamente
      wwebClient.initialize().catch(err => console.error('Erro na re-inicialização:', err));
    }
    res.json({ status: 'success', message: 'Desconectado com sucesso!' });
  } catch (error) {
    console.error('❌ Erro ao desconectar WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================================================================
// 🗄️ INICIALIZAÇÃO DO BANCO DE DADOS SQLite
// ==============================================================================
// Cada instância usa caminhos de DB e autenticação únicos baseados na porta,
// para que múltiplos canais não compartilhem dados.
const dbPath = (PORT == 5000)
  ? path.join(__dirname, 'whatsapp_chat.db')
  : path.join(__dirname, `whatsapp_chat_${PORT}.db`);

const authDataPath = (PORT == 5000)
  ? path.join(__dirname, '.wwebjs_auth')
  : path.join(__dirname, `.wwebjs_auth_${PORT}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao abrir o banco de dados SQLite:', err.message);
  } else {
    console.log('✅ Conectado ao banco de dados SQLite.');
  }
});

// Criar tabelas necessárias se não existirem
db.serialize(() => {
  // 1. Tabela de Atendentes
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_atendentes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL
    )
  `);

  // 2. Tabela de Atendimentos
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_atendimentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_jid TEXT UNIQUE,
      cliente_nome TEXT,
      cliente_avatar TEXT,
      atendente_id TEXT,
      status TEXT, -- 'fila', 'em_atendimento', 'finalizado'
      started_at TEXT,
      FOREIGN KEY(atendente_id) REFERENCES tabela_atendentes(id)
    )
  `, (err) => {
    if (!err) {
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN started_at TEXT", (alterErr) => {
        // Ignora erro se a coluna já existir
      });
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN cliente_avatar TEXT", (alterErr) => {
        // Ignora erro se a coluna já existir
      });
    }
  });

  // 3. Tabela de Mensagens (Histórico)
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_jid TEXT,
      remetente TEXT, -- 'cliente', 'sistema' ou 'id_atendente'
      texto TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ==============================================================================
// 🤖 INICIALIZAÇÃO DO WHATSAPP CLIENT (whatsapp-web.js)
// ==============================================================================
let qrCodeImage = null;
let whatsappStatus = 'desconectado'; // 'desconectado', 'autenticando', 'pronto'

console.log('🔄 Inicializando cliente do WhatsApp (Aguarde)...');
const wwebClient = new Client({
  authStrategy: new LocalAuth({
    dataPath: authDataPath
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'
  },
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Evento de geração de QR Code
wwebClient.on('qr', (qrText) => {
  console.log('📲 QR Code recebido. Gerando imagem...');
  whatsappStatus = 'aguardando_qr';
  qrcode.toDataURL(qrText, (err, url) => {
    if (err) {
      console.error('❌ Erro ao converter QR Code para imagem:', err);
      return;
    }
    qrCodeImage = url;
    io.emit('whatsapp_status', { status: whatsappStatus, qr: qrCodeImage });
  });
});

// Evento de sucesso na autenticação
wwebClient.on('authenticated', () => {
  console.log('✅ Autenticado com sucesso no WhatsApp.');
  whatsappStatus = 'autenticado';
  qrCodeImage = null;
  io.emit('whatsapp_status', { status: whatsappStatus });
});

// Falha na autenticação
wwebClient.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação do WhatsApp:', msg);
  whatsappStatus = 'desconectado';
  io.emit('whatsapp_status', { status: whatsappStatus });
});

// Cliente pronto para uso
wwebClient.on('ready', () => {
  console.log('🚀 Cliente do WhatsApp pronto e ativo!');
  whatsappStatus = 'pronto';
  qrCodeImage = null;
  io.emit('whatsapp_status', { status: whatsappStatus });
});

// Desconectado
wwebClient.on('disconnected', (reason) => {
  console.log('⚠️ WhatsApp foi desconectado:', reason);
  whatsappStatus = 'desconectado';
  qrCodeImage = null;
  io.emit('whatsapp_status', { status: whatsappStatus });
});

// ==============================================================================
// 🔄 FLUXO A: RECEBIMENTO DE MENSAGEM DO WHATSAPP
// ==============================================================================
wwebClient.on('message', async (msg) => {
  // Ignora mensagens de grupo e de status/stories
  if (msg.from.includes('@g.us') || msg.isStatus) return;

  const clienteJid = msg.from;
  const texto = msg.body;
  
  try {
    const contact = await msg.getContact();
    const clienteNome = contact.pushname || contact.name || clienteJid.split('@')[0];
    let profilePicUrl = null;
    try {
      profilePicUrl = await contact.getProfilePicUrl();
    } catch (picErr) {
      console.warn(`Não foi possível obter avatar para ${clienteJid}:`, picErr.message);
    }

    console.log(`📩 Mensagem recebida de ${clienteNome} (${clienteJid}): "${texto}"`);

    // 1. Verificar se o cliente já possui um atendimento ativo
    db.get(
      `SELECT * FROM tabela_atendimentos WHERE cliente_jid = ? AND status = 'em_atendimento'`,
      [clienteJid],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao consultar atendimento:', err.message);
          return;
        }

        if (row) {
          const atendenteId = row.atendente_id;
          
          if (profilePicUrl && row.cliente_avatar !== profilePicUrl) {
            db.run(`UPDATE tabela_atendimentos SET cliente_avatar = ? WHERE cliente_jid = ?`, [profilePicUrl, clienteJid]);
          }

          // Salvar mensagem no histórico
          db.run(
            `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
            [clienteJid, 'cliente', texto],
            function (insertErr) {
              if (insertErr) return console.error('Erro ao salvar mensagem:', insertErr.message);
              
              // Enviar via socket APENAS para a sala do atendente responsável
              const novaMsg = {
                id: this.lastID,
                cliente_jid: clienteJid,
                remetente: 'cliente',
                texto: texto,
                timestamp: new Date().toISOString()
              };
              io.to(atendenteId).emit('new_message', novaMsg);
              console.log(`📨 Encaminhado direto para o atendente: ${atendenteId}`);
            }
          );

        } else {
          // Se não há atendimento ativo, verifica se já está na fila
          db.get(
            `SELECT * FROM tabela_atendimentos WHERE cliente_jid = ? AND status = 'fila'`,
            [clienteJid],
            (queueErr, queueRow) => {
              if (queueErr) return console.error('Erro ao verificar fila:', queueErr.message);

              if (queueRow) {
                if (profilePicUrl && queueRow.cliente_avatar !== profilePicUrl) {
                  db.run(`UPDATE tabela_atendimentos SET cliente_avatar = ? WHERE cliente_jid = ?`, [profilePicUrl, clienteJid]);
                }
                // Já está na fila, apenas adiciona a mensagem ao banco de dados e avisa todos
                db.run(
                  `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
                  [clienteJid, 'cliente', texto],
                  function (insertErr) {
                    if (insertErr) return console.error(insertErr.message);
                    
                    const novaMsg = {
                      id: this.lastID,
                      cliente_jid: clienteJid,
                      remetente: 'cliente',
                      texto: texto,
                      timestamp: new Date().toISOString()
                    };
                    // Atualiza o histórico de quem estiver visualizando a fila
                    io.emit('queue_message', novaMsg);
                  }
                );
              } else {
                // Não está na fila nem em atendimento, cria um novo registro
                db.run(
                  `INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, status) VALUES (?, ?, ?, 'fila')`,
                  [clienteJid, clienteNome, profilePicUrl],
                  (insertAtendimentoErr) => {
                    if (insertAtendimentoErr) {
                      // Trata conflito caso o cliente estivesse 'finalizado' e enviou nova mensagem
                      db.run(
                        `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, cliente_nome = ?, cliente_avatar = ? WHERE cliente_jid = ?`,
                        [clienteNome, profilePicUrl, clienteJid]
                      );
                    }

                    // Salva a mensagem inicial
                    db.run(
                      `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
                      [clienteJid, 'cliente', texto],
                      () => {
                        console.log(`📥 Novo cliente na fila: ${clienteNome} (${clienteJid})`);
                        // Avisa todos os atendentes conectados que a fila atualizou
                        broadcastQueue();
                      }
                    );
                  }
                );
              }
            }
          );
        }
      }
    );

  } catch (error) {
    console.error('❌ Erro no processamento de mensagem recebida:', error);
  }
});

// ==============================================================================
// 🎙️ COMUNICAÇÃO WEBSOCKET (SOCKET.IO)
// ==============================================================================

// Mapeamento de Sockets Conectados por Atendente
const activeSockets = new Map(); // socket.id -> atendenteId

io.on('connection', (socket) => {
  console.log(`🔌 Novo atendente conectado via WebSocket (Socket ID: ${socket.id})`);

  // Enviar status atual do WhatsApp logo ao conectar
  socket.emit('whatsapp_status', { status: whatsappStatus, qr: qrCodeImage });

  // 1. Registro do Atendente
  socket.on('register_attendant', ({ atendente_id, nome }) => {
    if (!atendente_id || !nome) return;
    
    // Associa o socket ao atendente
    activeSockets.set(socket.id, atendente_id);
    socket.join(atendente_id); // Coloca o socket na sala privativa do atendente

    console.log(`👤 Atendente registrado: ${nome} (${atendente_id}) na sala privativa.`);

    // Salva ou atualiza no banco de dados
    db.run(
      `INSERT INTO tabela_atendentes (id, nome) VALUES (?, ?) 
       ON CONFLICT(id) DO UPDATE SET nome = excluded.nome`,
      [atendente_id, nome],
      (err) => {
        if (err) console.error('Erro ao salvar atendente no SQLite:', err.message);
        
        // Envia dados iniciais de fila e conversas
        sendInitialData(socket, atendente_id);
      }
    );
  });

  // 2. Solicitar Dados Iniciais Manualmente
  socket.on('get_initial_data', (atendente_id) => {
    sendInitialData(socket, atendente_id);
  });

  // 3b. FLUXO D: INICIAR NOVO CHAT ATIVO (Operador -> WhatsApp)
  socket.on('start_chat', async ({ cliente_jid, cliente_nome, atendente_id }) => {
    if (!cliente_jid || !cliente_nome || !atendente_id) return;

    // Garante que o JID tenha @c.us
    let formattedJid = cliente_jid.trim();
    if (!formattedJid.includes('@')) {
      formattedJid = `${formattedJid}@c.us`;
    }

    console.log(`🚀 Tentativa de iniciar chat de [${atendente_id}] com [${formattedJid}]`);

    try {
      // 1. Buscar configurações de segurança no backend FastAPI
      let warnNewNumber = true;
      let limitActiveChats = true;
      let limitCount = 10;

      try {
        const response = await fetch('http://localhost:8080/system-settings');
        if (response.ok) {
          const settings = await response.json();
          warnNewNumber = settings.whatsapp_warn_new_number !== undefined ? settings.whatsapp_warn_new_number : true;
          limitActiveChats = settings.whatsapp_limit_active_chats !== undefined ? settings.whatsapp_limit_active_chats : true;
          limitCount = settings.whatsapp_limit_count !== undefined ? settings.whatsapp_limit_count : 10;
        }
      } catch (e) {
        console.error('⚠️ Falha ao obter configurações de segurança do backend FastAPI:', e.message);
      }

      // 2. Se limite de envio estiver ativo, validar quantidade de disparos na última hora
      if (limitActiveChats) {
        const checkLimit = () => {
          return new Promise((resolve, reject) => {
            db.get(
              `SELECT COUNT(*) as count FROM tabela_atendimentos 
               WHERE atendente_id = ? 
               AND status = 'em_atendimento'
               AND started_at >= datetime('now', '-1 hour')`,
              [atendente_id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.count : 0);
              }
            );
          });
        };

        const activeChatsCount = await checkLimit();
        if (activeChatsCount >= limitCount) {
          console.warn(`🛑 Limite de segurança excedido para atendente ${atendente_id}: ${activeChatsCount}/${limitCount}`);
          socket.emit('error_message', `Limite de segurança excedido! Você só pode iniciar ${limitCount} novas conversas por hora.`);
          return;
        }
      }

      // 3. Verificar se o chat já existe no banco de dados local
      const checkExistingChat = () => {
        return new Promise((resolve, reject) => {
          db.get(
            `SELECT * FROM tabela_atendimentos WHERE cliente_jid = ?`,
            [formattedJid],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });
      };

      const existingChat = await checkExistingChat();
      const startedAt = new Date().toISOString();

      let profilePicUrl = null;
      if (whatsappStatus === 'pronto') {
        try {
          const contact = await wwebClient.getContactById(formattedJid);
          profilePicUrl = await contact.getProfilePicUrl();
        } catch (contactErr) {
          console.warn(`Não foi possível obter avatar no start_chat para ${formattedJid}:`, contactErr.message);
        }
      }

      if (existingChat) {
        // Se já existe e está finalizado, reabre
        if (existingChat.status !== 'em_atendimento') {
          db.run(
            `UPDATE tabela_atendimentos SET status = 'em_atendimento', atendente_id = ?, started_at = ?, cliente_avatar = ? WHERE cliente_jid = ?`,
            [atendente_id, startedAt, profilePicUrl || existingChat.cliente_avatar, formattedJid]
          );
          // Adiciona mensagem de sistema no histórico
          db.run(
            `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento reaberto pelo atendente.')`,
            [formattedJid]
          );
        } else if (existingChat.atendente_id !== atendente_id) {
          // Se pertence a outro atendente, transfere
          db.run(
            `UPDATE tabela_atendimentos SET atendente_id = ?, cliente_avatar = ? WHERE cliente_jid = ?`,
            [atendente_id, profilePicUrl || existingChat.cliente_avatar, formattedJid]
          );
          db.run(
            `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`,
            [formattedJid, `Atendimento transferido para o atendente.`]
          );
        }
      } else {
        // Se é um chat totalmente novo, insere
        db.run(
          `INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, atendente_id, status, started_at) VALUES (?, ?, ?, ?, 'em_atendimento', ?)`,
          [formattedJid, cliente_nome, profilePicUrl, atendente_id, startedAt]
        );
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento iniciado pelo atendente.')`,
          [formattedJid]
        );
      }

      // 4. Retornar dados atualizados de fila e conversas ativas
      broadcastQueue();
      sendActiveChats(atendente_id);

      // Notifica o cliente do sucesso para ele abrir a conversa
      socket.emit('start_chat_success', { cliente_jid: formattedJid, cliente_nome });

    } catch (err) {
      console.error('❌ Erro ao iniciar novo chat:', err);
      socket.emit('error_message', `Erro ao iniciar chat: ${err.message}`);
    }
  });

  // 3. FLUXO B: ENVIO DE MENSAGEM (Atendente -> Servidor -> WhatsApp)
  socket.on('send_message', async ({ cliente_jid, texto, atendente_id }) => {
    if (!cliente_jid || !texto || !atendente_id) return;

    console.log(`📤 Enviando mensagem de [${atendente_id}] para [${cliente_jid}]: "${texto}"`);

    try {
      // Envia via WhatsApp Web
      if (whatsappStatus !== 'pronto') {
        socket.emit('error_message', 'WhatsApp não está pronto. Conecte o celular primeiro.');
        return;
      }

      await wwebClient.sendMessage(cliente_jid, texto);

      // Salva no banco de dados local
      db.run(
        `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
        [cliente_jid, atendente_id, texto],
        function (err) {
          if (err) {
            console.error('Erro ao salvar mensagem enviada:', err.message);
            return;
          }

          const novaMsg = {
            id: this.lastID,
            cliente_jid: clienteJid = cliente_jid,
            remetente: atendente_id,
            texto: texto,
            timestamp: new Date().toISOString()
          };

          // Envia de volta para o atendente para atualizar a tela dele
          io.to(atendente_id).emit('new_message', novaMsg);
        }
      );

    } catch (err) {
      console.error('❌ Erro ao enviar mensagem pelo WhatsApp:', err.message);
      socket.emit('error_message', 'Falha ao enviar mensagem. Verifique a conexão do WhatsApp.');
    }
  });

  // 4. FLUXO C: DISTRIBUIÇÃO / ASSUMIR CONVERSA
  socket.on('take_chat', ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;

    console.log(`🤝 Atendente [${atendente_id}] assumindo conversa com [${cliente_jid}]`);

    // Atualiza o banco de dados
    db.run(
      `UPDATE tabela_atendimentos SET status = 'em_atendimento', atendente_id = ? WHERE cliente_jid = ?`,
      [atendente_id, cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao assumir atendimento:', err.message);
          return;
        }

        // Resgata o histórico de mensagens
        db.all(
          `SELECT * FROM tabela_mensagens WHERE cliente_jid = ? ORDER BY timestamp ASC`,
          [cliente_jid],
          (selectErr, messages) => {
            if (selectErr) {
              console.error('Erro ao resgatar histórico:', selectErr.message);
              return;
            }

            // Envia o histórico completo para o atendente que assumiu
            socket.emit('chat_history', { cliente_jid, messages });

            // Atualiza as listas globais
            broadcastQueue();
            sendActiveChats(atendente_id);
          }
        );
      }
    );
  });

  // 5. SELECIONAR CHAT ATIVO (Para carregar histórico)
  socket.on('select_chat', ({ cliente_jid, atendente_id }) => {
    db.all(
      `SELECT * FROM tabela_mensagens WHERE cliente_jid = ? ORDER BY timestamp ASC`,
      [cliente_jid],
      (err, messages) => {
        if (err) return console.error(err.message);
        socket.emit('chat_history', { cliente_jid, messages });
      }
    );
  });

  // 6. FINALIZAR CONVERSA
  socket.on('finish_chat', ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;

    console.log(`🏁 Atendimento finalizado para [${cliente_jid}] por [${atendente_id}]`);

    // Insere mensagem de sistema no histórico
    db.run(
      `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento finalizado pelo atendente.')`,
      [cliente_jid]
    );

    // Atualiza status do atendimento
    db.run(
      `UPDATE tabela_atendimentos SET status = 'finalizado' WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao finalizar atendimento:', err.message);
          return;
        }

        // Atualiza a visualização do atendente
        sendActiveChats(atendente_id);
        broadcastQueue();
      }
    );
  });

  // 7. Desconexão de socket
  socket.on('disconnect', () => {
    const atendenteId = activeSockets.get(socket.id);
    activeSockets.delete(socket.id);
    console.log(`🔌 Conexão WebSocket encerrada: Socket ID ${socket.id} (Atendente: ${atendenteId || 'Não registrado'})`);
  });
});

// ==============================================================================
// 📢 FUNÇÕES DE EMISSÃO AUXILIARES
// ==============================================================================

// Envia dados iniciais consolidados para um atendente recém registrado
function sendInitialData(socket, atendenteId) {
  // Fila de Espera
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'fila' ORDER BY id ASC`,
    [],
    (err, queueRows) => {
      if (!err) socket.emit('queue_list', queueRows);
    }
  );

  // Conversas Ativas do atendente
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE atendente_id = ? AND status = 'em_atendimento' ORDER BY id ASC`,
    [atendenteId],
    (err, activeRows) => {
      if (!err) socket.emit('active_chats_list', activeRows);
    }
  );
}

// Transmite a fila de espera atualizada para todos os atendentes conectados
function broadcastQueue() {
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'fila' ORDER BY id ASC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Erro ao ler fila:', err.message);
        return;
      }
      io.emit('queue_list', rows);
    }
  );
}

// Transmite as conversas ativas atualizadas para o atendente correspondente
function sendActiveChats(atendenteId) {
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE atendente_id = ? AND status = 'em_atendimento' ORDER BY id ASC`,
    [atendenteId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao ler chats ativos:', err.message);
        return;
      }
      // Envia apenas para os sockets na sala daquele atendente
      io.to(atendenteId).emit('active_chats_list', rows);
    }
  );
}

// Inicializar cliente do WhatsApp
wwebClient.initialize().catch(err => {
  console.error('❌ Falha crítica ao inicializar whatsapp-web.js:', err);
});

// Iniciar servidor HTTP
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando localmente na porta ${PORT}`);
  console.log(`🔗 Link de acesso: http://localhost:${PORT}`);
});
