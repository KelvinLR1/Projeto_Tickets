const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
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
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN started_at TEXT", (alterErr) => {});
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN cliente_avatar TEXT", (alterErr) => {});
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN bot_node_id TEXT", (alterErr) => {});
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN sector_id INTEGER", (alterErr) => {});
      db.run("ALTER TABLE tabela_atendimentos ADD COLUMN unread INTEGER DEFAULT 0", (alterErr) => {});
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
  `, (err) => {
    if (!err) {
      db.run("ALTER TABLE tabela_mensagens ADD COLUMN reacao TEXT", (alterErr) => {});
    }
  });
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
    await processIncomingMessage(clienteJid, texto, clienteNome, profilePicUrl);
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
            `UPDATE tabela_atendimentos SET status = 'em_atendimento', atendente_id = ?, started_at = ?, cliente_avatar = ?, unread = 0 WHERE cliente_jid = ?`,
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
            `UPDATE tabela_atendimentos SET atendente_id = ?, cliente_avatar = ?, unread = 0 WHERE cliente_jid = ?`,
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
    checkManualTakeover(cliente_jid, atendente_id);

    try {
      // Envia via WhatsApp Web se conectado, ou simula resposta em offline/teste
      if (whatsappStatus !== 'pronto') {
        console.log('⚠️ WhatsApp desconectado. Salvando mensagem no modo Simulação...');
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
          [cliente_jid, atendente_id, texto],
          function (err) {
            if (err) {
              console.error('Erro ao salvar mensagem simulada:', err.message);
              return;
            }

            const novaMsg = {
              id: this.lastID,
              cliente_jid: cliente_jid,
              remetente: atendente_id,
              texto: texto,
              timestamp: new Date().toISOString()
            };

            // Envia de volta para o atendente para atualizar a tela dele
            io.to(atendente_id).emit('new_message', novaMsg);

            // Simular resposta automática após 1.5 segundos
            setTimeout(() => {
              const mockReplies = [
                "Certo, compreendido! [Simulação]",
                "Tudo bem, obrigado pelo retorno! [Simulação]",
                "Ok, vou verificar e te aviso por aqui. [Simulação]",
                "Perfeito! Se precisar de algo mais, me avise. [Simulação]",
                "Entendido. Obrigado pelas instruções! [Simulação]"
              ];
              const replyText = mockReplies[Math.floor(Math.random() * mockReplies.length)];

              db.run(
                `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'cliente', ?)`,
                [cliente_jid, replyText],
                function (replyErr) {
                  if (replyErr) {
                    console.error('Erro ao salvar resposta simulada:', replyErr.message);
                    return;
                  }

                  const clientMsg = {
                    id: this.lastID,
                    cliente_jid: cliente_jid,
                    remetente: 'cliente',
                    texto: replyText,
                    timestamp: new Date().toISOString()
                  };

                  io.to(atendente_id).emit('new_message', clientMsg);
                }
              );
            }, 1500);
          }
        );
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
            cliente_jid: cliente_jid,
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
      `UPDATE tabela_atendimentos SET status = 'em_atendimento', atendente_id = ?, bot_node_id = NULL, unread = 0 WHERE cliente_jid = ?`,
      [atendente_id, cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao assumir atendimento:', err.message);
          return;
        }
        broadcastBotList();

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
            broadcastBotList();
            sendActiveChats(atendente_id);
          }
        );
      }
    );
  });

  // 5. SELECIONAR CHAT ATIVO (Para carregar histórico)
  socket.on('select_chat', ({ cliente_jid, atendente_id }) => {
    // Marca como lida no banco de dados
    db.run(
      `UPDATE tabela_atendimentos SET unread = 0 WHERE cliente_jid = ?`,
      [cliente_jid],
      (updateErr) => {
        if (updateErr) console.error('Erro ao marcar como lida:', updateErr.message);
        sendActiveChats(atendente_id);
      }
    );

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

        // Atualiza a visualização do atendente e o histórico
        sendActiveChats(atendente_id);
        sendHistoryChats(atendente_id);
        broadcastQueue();
      }
    );
  });

  // 6c. MARCAR CONVERSA COMO NÃO LIDA
  socket.on('mark_unread', ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;
    
    db.run(
      `UPDATE tabela_atendimentos SET unread = 1 WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao marcar chat como não lida:', err.message);
          return;
        }
        sendActiveChats(atendente_id);
      }
    );
  });

  // 6d. FINALIZAR CONVERSA SILENCIOSAMENTE
  socket.on('finish_chat_silently', ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;

    console.log(`🤫 Atendimento finalizado silenciosamente para [${cliente_jid}] por [${atendente_id}]`);

    // Atualiza status do atendimento sem inserir mensagem de sistema no histórico
    db.run(
      `UPDATE tabela_atendimentos SET status = 'finalizado' WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao finalizar atendimento silenciosamente:', err.message);
          return;
        }

        // Atualiza a visualização do atendente, fila e histórico
        sendActiveChats(atendente_id);
        sendHistoryChats(atendente_id);
        broadcastQueue();
      }
    );
  });

  // 6b. EXCLUIR MENSAGEM DO HISTÓRICO
  socket.on('delete_message', ({ message_id, atendente_id, cliente_jid }) => {
    if (!message_id || !atendente_id) return;
    console.log(`🗑️ Excluindo mensagem ID ${message_id} por solicitação de atendente ${atendente_id}`);
    db.run(`DELETE FROM tabela_mensagens WHERE id = ?`, [message_id], (err) => {
      if (err) {
        console.error('Erro ao excluir mensagem do banco de dados:', err.message);
        return;
      }
      // Notifica todos os sockets do atendente para remover o card da tela
      io.to(atendente_id).emit('message_deleted', { message_id, cliente_jid });
    });
  });

  // 6e. BUSCAR NO HISTÓRICO DE CHATS FINALIZADOS
  socket.on('search_history', ({ query, atendente_id }) => {
    if (!atendente_id) return;
    const searchVal = `%${(query || '').trim()}%`;
    db.all(
      `SELECT * FROM tabela_atendimentos 
       WHERE status = 'finalizado' 
       AND (cliente_nome LIKE ? OR cliente_jid LIKE ? OR id LIKE ?)
       ORDER BY id DESC LIMIT 50`,
      [searchVal, searchVal, searchVal],
      (err, rows) => {
        if (!err) {
          socket.emit('history_chats_list', rows);
        }
      }
    );
  });

  // 6c. REAGIR A MENSAGEM
  socket.on('react_message', ({ message_id, reacao, atendente_id, cliente_jid }) => {
    if (!message_id || !atendente_id) return;
    console.log(`❤️ Reagindo à mensagem ID ${message_id} com "${reacao || 'Nenhuma'}" por solicitação de atendente ${atendente_id}`);
    db.run(`UPDATE tabela_mensagens SET reacao = ? WHERE id = ?`, [reacao, message_id], (err) => {
      if (err) {
        console.error('Erro ao atualizar reação da mensagem:', err.message);
        return;
      }
      // Notifica todos os sockets do atendente para atualizar a reação da mensagem na tela
      io.to(atendente_id).emit('message_reacted', { message_id, reacao, cliente_jid });
    });
  });

  // 7. Desconexão de socket
  socket.on('disconnect', () => {
    const atendenteId = activeSockets.get(socket.id);
    activeSockets.delete(socket.id);
    console.log(`🔌 Conexão WebSocket encerrada: Socket ID ${socket.id} (Atendente: ${atendenteId || 'Não registrado'})`);
  });
});

// ==============================================================================
// 📢 FUNÇÕES DE EMISSÃO AUXILIARES E MOTOR DO CHATBOT
// ==============================================================================

// Lê as configurações do canal atual baseado na PORTA do processo
function getChannelConfig() {
  try {
    const channelsPath = path.join(__dirname, '..', 'whatsapp-channels.json');
    if (fs.existsSync(channelsPath)) {
      const data = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));
      return data.find(c => c.port == PORT) || null;
    }
  } catch (err) {
    console.error('Erro ao ler whatsapp-channels.json:', err);
  }
  return null;
}

// Desativa o chatbot ou reabre se o atendente intervir mandando mensagem manualmente
function checkManualTakeover(clienteJid, atendenteId) {
  db.get(`SELECT status FROM tabela_atendimentos WHERE cliente_jid = ?`, [clienteJid], (err, row) => {
    if (row && (row.status === 'bot' || row.status === 'finalizado')) {
      const isFinished = row.status === 'finalizado';
      console.log(`🔌 Intervenção humana detectada para [${clienteJid}]. Status anterior: ${row.status}.`);
      db.run(
        `UPDATE tabela_atendimentos SET status = 'em_atendimento', atendente_id = ?, bot_node_id = NULL, unread = 0 WHERE cliente_jid = ?`,
        [atendenteId, clienteJid],
        () => {
          const sysMsg = isFinished ? 'Atendimento reaberto por nova mensagem do atendente.' : 'Atendimento assumido pelo atendente. Bot desativado.';
          db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`, [clienteJid, sysMsg]);
          broadcastBotList();
          sendActiveChats(atendenteId);
          sendHistoryChats(atendenteId);
        }
      );
    }
  });
}

// Envia mensagem do bot (e também grava no banco e avisa no socket)
async function sendBotMessage(clienteJid, texto) {
  console.log(`🤖 [BOT -> ${clienteJid}]: "${texto}"`);
  
  if (whatsappStatus === 'pronto') {
    try {
      await wwebClient.sendMessage(clienteJid, texto);
    } catch (err) {
      console.error('Erro ao enviar mensagem do bot via WhatsApp:', err.message);
    }
  }

  return new Promise((resolve) => {
    db.run(
      `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'bot', ?)`,
      [clienteJid, texto],
      function (err) {
        if (err) console.error('Erro ao salvar mensagem do bot:', err.message);
        
        const msg = {
          id: this.lastID,
          cliente_jid: clienteJid,
          remetente: 'bot',
          texto: texto,
          timestamp: new Date().toISOString()
        };
        // Notifica painéis em tempo real
        io.emit('queue_message', msg);
        resolve();
      }
    );
  });
}

// Envia a estrutura de Pergunta/Menu
async function sendQuestionNode(clienteJid, node) {
  const options = node.data.options || [];
  let texto = `*${node.data.text}*\n\n`;
  options.forEach((opt, idx) => {
    texto += `${idx + 1}️⃣  *${opt}*\n`;
  });
  texto += `\n_Digite o número da opção desejada._`;
  await sendBotMessage(clienteJid, texto);
}

// Direciona o cliente para a Fila de Espera padrão
function moveToQueue(row) {
  db.run(
    `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, bot_node_id = NULL WHERE cliente_jid = ?`,
    [row.cliente_jid],
    () => {
      sendBotMessage(row.cliente_jid, "Estou transferindo você para a nossa fila de atendimento geral. Aguarde um instante.");
      db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento encaminhado para a fila geral.')`, [row.cliente_jid]);
      broadcastQueue();
      broadcastBotList();
    }
  );
}

// Processador unificado para mensagens recebidas (Chatbot vs Humanos)
async function processIncomingMessage(clienteJid, texto, clienteNome, profilePicUrl) {
  db.get(
    `SELECT * FROM tabela_atendimentos WHERE cliente_jid = ?`,
    [clienteJid],
    (err, row) => {
      if (err) {
        console.error('❌ Erro ao consultar atendimento:', err.message);
        return;
      }

      if (row && row.status === 'em_atendimento') {
        const atendenteId = row.atendente_id;
        
        if (profilePicUrl && row.cliente_avatar !== profilePicUrl) {
          db.run(`UPDATE tabela_atendimentos SET cliente_avatar = ? WHERE cliente_jid = ?`, [profilePicUrl, clienteJid]);
        }

        // Marca como não lida no banco de dados e atualiza a lista do atendente
        db.run(
          `UPDATE tabela_atendimentos SET unread = 1 WHERE cliente_jid = ?`,
          [clienteJid],
          (updateErr) => {
            if (updateErr) console.error('Erro ao atualizar status unread:', updateErr.message);
            sendActiveChats(atendenteId);
          }
        );

        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
          [clienteJid, 'cliente', texto],
          function (insertErr) {
            if (insertErr) return console.error('Erro ao salvar mensagem:', insertErr.message);
            
            const novaMsg = {
              id: this.lastID,
              cliente_jid: clienteJid,
              remetente: 'cliente',
              texto: texto,
              timestamp: new Date().toISOString()
            };
            io.to(atendenteId).emit('new_message', novaMsg);
          }
        );
      } else if (row && row.status === 'fila') {
        if (profilePicUrl && row.cliente_avatar !== profilePicUrl) {
          db.run(`UPDATE tabela_atendimentos SET cliente_avatar = ? WHERE cliente_jid = ?`, [profilePicUrl, clienteJid]);
        }
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
            io.emit('queue_message', novaMsg);
          }
        );
      } else {
        // Fluxo de Chatbot!
        const channel = getChannelConfig();
        
        // Se o canal não tiver bot_flow configurado ou vazio, vai direto pra fila
        if (!channel || !channel.bot_flow || !channel.bot_flow.nodes || channel.bot_flow.nodes.length === 0) {
          console.log(`[BOT] Canal sem fluxo de chatbot configurado. Direcionando para a fila.`);
          db.run(
            `INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, status) VALUES (?, ?, ?, 'fila')`,
            [clienteJid, clienteNome, profilePicUrl],
            (insertAtendimentoErr) => {
              if (insertAtendimentoErr) {
                db.run(
                  `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, cliente_nome = ?, cliente_avatar = ? WHERE cliente_jid = ?`,
                  [clienteNome, profilePicUrl, clienteJid]
                );
              }

              db.run(
                `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, ?, ?)`,
                [clienteJid, 'cliente', texto],
                () => {
                  broadcastQueue();
                }
              );
            }
          );
          return;
        }

        // Se tem fluxo ativo
        if (!row) {
          db.run(
            `INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, status) VALUES (?, ?, ?, 'bot')`,
            [clienteJid, clienteNome, profilePicUrl],
            (insertErr) => {
              db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'cliente', ?)`, [clienteJid, texto], () => {
                broadcastBotList();
                runBotStep({ cliente_jid: clienteJid, status: 'bot' }, texto);
              });
            }
          );
        } else {
          db.run(
            `UPDATE tabela_atendimentos SET status = 'bot', atendente_id = NULL, cliente_nome = ?, cliente_avatar = ?, bot_node_id = ? WHERE cliente_jid = ?`,
            [clienteNome, profilePicUrl, row.status === 'bot' ? row.bot_node_id : null, clienteJid],
            () => {
              db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'cliente', ?)`, [clienteJid, texto], () => {
                broadcastBotList();
                runBotStep({ ...row, status: 'bot', cliente_name: clienteNome, bot_node_id: row.status === 'bot' ? row.bot_node_id : null }, texto);
              });
            }
          );
        }
      }
    }
  );
}

// Avança um passo no chatbot baseado na mensagem recebida
async function runBotStep(row, texto) {
  const channel = getChannelConfig();
  if (!channel || !channel.bot_flow) {
    moveToQueue(row);
    return;
  }

  const { nodes, edges } = channel.bot_flow;
  let currentNodeId = row.bot_node_id;
  let currentNode = nodes.find(n => n.id === currentNodeId);

  // Se o cliente não tem nó ativo, busca o nó posterior ao 'start'
  if (!currentNode) {
    const startNode = nodes.find(n => n.type === 'start');
    if (!startNode) {
      moveToQueue(row);
      return;
    }
    const nextEdge = edges.find(e => e.source === startNode.id);
    if (!nextEdge) {
      moveToQueue(row);
      return;
    }
    currentNode = nodes.find(n => n.id === nextEdge.target);
    if (!currentNode) {
      moveToQueue(row);
      return;
    }
  }

  // Se o nó atual é uma pergunta (menu), avalia a opção enviada
  if (currentNode.type === 'question') {
    const options = currentNode.data.options || [];
    const choice = texto.trim();
    let selectedOption = null;

    const choiceIdx = parseInt(choice) - 1;
    if (choiceIdx >= 0 && choiceIdx < options.length) {
      selectedOption = options[choiceIdx];
    } else {
      selectedOption = options.find(o => o.toLowerCase() === choice.toLowerCase());
    }

    if (selectedOption) {
      const edge = edges.find(e => e.source === currentNode.id && e.sourceHandle === selectedOption);
      if (edge) {
        const nextNode = nodes.find(n => n.id === edge.target);
        if (nextNode) {
          executeNode(row, nextNode);
          return;
        }
      }
    }

    // Se opção for inválida, avisa e repete a pergunta
    await sendBotMessage(row.cliente_jid, "Desculpe, opção inválida. Por favor, responda com o número correspondente.");
    await sendQuestionNode(row.cliente_jid, currentNode);
    return;
  }

  // Outros nós, executa e avança
  executeNode(row, currentNode, texto);
}

// Execução recursiva de nós imediatos (ex: mensagem -> pergunta)
async function executeNode(row, node) {
  const channel = getChannelConfig();
  if (!channel || !channel.bot_flow) return;
  const { nodes, edges } = channel.bot_flow;

  if (node.type === 'message') {
    await sendBotMessage(row.cliente_jid, node.data.text);
    
    // Avança para o próximo
    const edge = edges.find(e => e.source === node.id);
    if (edge) {
      const nextNode = nodes.find(n => n.id === edge.target);
      if (nextNode) {
        db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [nextNode.id, row.cliente_jid]);
        executeNode(row, nextNode);
        return;
      }
    }
    moveToQueue(row);
  } 
  
  else if (node.type === 'question') {
    await sendQuestionNode(row.cliente_jid, node);
    db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [node.id, row.cliente_jid]);
  } 
  
  else if (node.type === 'condition') {
    const now = new Date();
    // Pega fuso de Brasília
    const localTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const currentDay = localTime.getDay(); // 0 = Dom, 1 = Seg
    const currentHour = localTime.getHours().toString().padStart(2, '0');
    const currentMin = localTime.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMin}`;

    const workDays = node.data.workDays || [1, 2, 3, 4, 5];
    const startTime = node.data.startTime || '08:00';
    const endTime = node.data.endTime || '18:00';

    const inDays = workDays.includes(currentDay);
    const inTime = currentTimeStr >= startTime && currentTimeStr <= endTime;
    const isMatched = inDays && inTime;

    const handle = isMatched ? 'yes' : 'no';

    const edge = edges.find(e => e.source === node.id && e.sourceHandle === handle);
    if (edge) {
      const nextNode = nodes.find(n => n.id === edge.target);
      if (nextNode) {
        executeNode(row, nextNode);
        return;
      }
    }
    moveToQueue(row);
  } 
  
  else if (node.type === 'sector') {
    const sectorId = node.data.sectorId;
    console.log(`[BOT] Direcionando cliente para o setor: ${sectorId}`);
    
    db.run(
      `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, sector_id = ?, bot_node_id = NULL WHERE cliente_jid = ?`,
      [sectorId, row.cliente_jid],
      () => {
        sendBotMessage(row.cliente_jid, "Estou transferindo seu contato para o setor escolhido. Aguarde para falar com um atendente.");
        db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento direcionado pelo Bot para setor específico.')`, [row.cliente_jid]);
        broadcastQueue();
        broadcastBotList();
      }
    );
  }
}

// Transmite a lista de chats no Bot para os operadores
function broadcastBotList() {
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'bot' ORDER BY id ASC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Erro ao ler lista do bot:', err.message);
        return;
      }
      io.emit('bot_chats_list', rows);
    }
  );
}

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

  // Lista de Bots
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'bot' ORDER BY id ASC`,
    [],
    (err, botRows) => {
      if (!err) socket.emit('bot_chats_list', botRows);
    }
  );

  // Histórico de Conversas Finalizadas (Últimos 30)
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'finalizado' ORDER BY id DESC LIMIT 30`,
    [],
    (err, historyRows) => {
      if (!err) socket.emit('history_chats_list', historyRows);
    }
  );
}

// Transmite o histórico recente para um atendente
function sendHistoryChats(atendenteId) {
  if (!atendenteId) return;
  db.all(
    `SELECT * FROM tabela_atendimentos WHERE status = 'finalizado' ORDER BY id DESC LIMIT 30`,
    [],
    (err, rows) => {
      if (!err) {
        io.to(atendenteId).emit('history_chats_list', rows);
      }
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
