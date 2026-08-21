const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const multer = require('multer');

// Garante que a pasta de uploads exista
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer para armazenamento local
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'media-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

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

// Endpoint de Upload de Múltiplos Arquivos
app.post('/api/upload', upload.array('attachments', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const uploadedFiles = req.files.map(file => ({
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`, // Caminho relativo acessível via Express Static
    path: file.path // Caminho absoluto para uso no backend (MessageMedia)
  }));

  res.json({ status: 'success', files: uploadedFiles });
});

// ==============================================================================
// 📁 BANCO DE ARQUIVOS — Listagem e Busca de Arquivos Enviados e Recebidos
// ==============================================================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getLocalFileSize(url) {
  try {
    if (!url || !url.startsWith('/uploads/')) return null;
    const filePath = path.join(uploadDir, path.basename(url));
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return stats.size;
    }
  } catch (e) {}
  return null;
}

// Extrai arquivos de linhas de mensagens do SQLite
function parseFilesFromMessageRows(rows) {
  return rows.map(row => {
    let url = null;
    let caption = '';

    if (row.texto) {
      const match = row.texto.match(/\[ANEXO\]\s*(\/uploads\/[^\s\n]+)/);
      if (match) {
        url = match[1];
        caption = row.texto.replace(/\[ANEXO\]\s*\/uploads\/[^\s\n]+\s*/g, '').trim();
      } else if (row.texto.startsWith('/uploads/')) {
        url = row.texto.split(' ')[0];
        caption = row.texto.substring(url.length).trim();
      } else if (row.texto.startsWith('http') && row.texto.includes('/uploads/')) {
        url = row.texto.trim();
      }
    }

    if (!url) return null;

    const filename = url.split('/').pop().split('?')[0];
    const ext = filename.split('.').pop().toLowerCase();
    const sizeBytes = getLocalFileSize(url);

    let setores = null;
    try {
      if (row.setores) setores = typeof row.setores === 'string' ? JSON.parse(row.setores) : row.setores;
    } catch (e) {}

    return {
      id: row.id,
      url,
      filename,
      ext,
      caption,
      grupo: row.grupo || 'Geral',
      setores: Array.isArray(setores) ? setores : null,
      descricao: row.descricao || null,
      size_bytes: sizeBytes,
      size_formatted: formatBytes(sizeBytes),
      cliente_jid: row.cliente_jid,
      cliente_nome: row.cliente_nome || (row.cliente_jid ? row.cliente_jid.split('@')[0] : 'Contato'),
      cliente_avatar: row.cliente_avatar || null,
      remetente: row.remetente,
      atendente_nome: row.atendente_nome || null,
      timestamp: row.timestamp
    };
  }).filter(Boolean);
}

// Retorna os arquivos enviados mais recentes (padrão: 12)
app.get('/api/files/recent', (req, res) => {
  const limit = parseInt(req.query.limit) || 12;
  const clienteJid = req.query.cliente_jid || null;

  let query = `
    SELECT m.id, m.cliente_jid, m.remetente, m.atendente_nome, m.texto, m.timestamp,
           a.cliente_nome, a.cliente_avatar,
           meta.grupo, meta.setores, meta.descricao
    FROM tabela_mensagens m
    LEFT JOIN tabela_atendimentos a ON m.cliente_jid = a.cliente_jid
    LEFT JOIN tabela_arquivos_metadados meta ON (m.texto LIKE '%' || meta.url || '%' OR m.texto LIKE '%' || meta.filename || '%')
    WHERE m.texto LIKE '%[ANEXO]%' OR m.texto LIKE '%/uploads/%'
  `;
  const params = [];

  if (clienteJid) {
    query += ` AND m.cliente_jid = ?`;
    params.push(clienteJid);
  }

  query += ` ORDER BY m.timestamp DESC LIMIT ?`;
  params.push(limit);

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const files = parseFilesFromMessageRows(rows || []);
    res.json({ files });
  });
});

// ==============================================================================
// 📁 BANCO DE ARQUIVOS PRÉ-SALVOS (BIBLIOTECA DE DOCUMENTOS E MÍDIAS)
// ==============================================================================

// Retorna a lista de arquivos pré-salvos no banco com contagens, filtros e paginação
app.get(['/api/files/bank', '/api/files/search'], (req, res) => {
  const { q = '', type = 'all', grupo = 'all', setor_id = '', page = 1, limit = 12 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const typeFilters = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    video: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
    audio: ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'],
    doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar']
  };

  db.all("SELECT * FROM tabela_banco_arquivos ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const allFiles = (rows || []).map(r => {
      let setoresArr = null;
      try {
        if (r.setores) setoresArr = JSON.parse(r.setores);
      } catch {
        setoresArr = r.setores ? [r.setores] : null;
      }
      return {
        id: r.id,
        titulo: r.titulo || r.filename,
        filename: r.filename,
        url: r.url,
        mimetype: r.mimetype,
        ext: r.ext || path.extname(r.filename || '').replace('.', '').toLowerCase(),
        size_bytes: r.size_bytes || 0,
        size_formatted: formatBytes(r.size_bytes || 0),
        grupo: r.grupo || 'Geral',
        setores: setoresArr,
        descricao: r.descricao || '',
        created_at: r.created_at,
        updated_at: r.updated_at
      };
    });

    // Contadores por tipo
    const counts = {
      all: allFiles.length,
      image: allFiles.filter(f => typeFilters.image.includes(f.ext)).length,
      video: allFiles.filter(f => typeFilters.video.includes(f.ext)).length,
      audio: allFiles.filter(f => typeFilters.audio.includes(f.ext)).length,
      doc: allFiles.filter(f => typeFilters.doc.includes(f.ext)).length
    };

    // Grupos únicos
    const grupoMap = {};
    allFiles.forEach(f => {
      const g = f.grupo || 'Geral';
      grupoMap[g] = (grupoMap[g] || 0) + 1;
    });
    const gruposList = Object.entries(grupoMap).map(([name, count]) => ({ name, count }));

    let filtered = allFiles;

    // Filtro por setor_id
    if (setor_id && setor_id !== 'all') {
      const targetSec = Number(setor_id);
      filtered = filtered.filter(f => {
        if (!f.setores || f.setores.length === 0) return true;
        return f.setores.includes(targetSec) || f.setores.includes(String(targetSec));
      });
    }

    // Filtro por grupo
    if (grupo && grupo !== 'all' && grupo !== 'Todos') {
      filtered = filtered.filter(f => (f.grupo || 'Geral') === grupo);
    }

    // Filtro por tipo
    if (type !== 'all' && typeFilters[type]) {
      filtered = filtered.filter(f => typeFilters[type].includes(f.ext));
    }

    // Filtro de busca textual
    if (q.trim()) {
      const search = q.trim().toLowerCase();
      filtered = filtered.filter(f =>
        f.titulo.toLowerCase().includes(search) ||
        f.filename.toLowerCase().includes(search) ||
        f.grupo.toLowerCase().includes(search) ||
        f.descricao.toLowerCase().includes(search)
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + parseInt(limit));

    res.json({
      files: paginated,
      total,
      counts,
      grupos: gruposList,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  });
});

// Upload de novo arquivo pré-salvo para o banco
app.post('/api/files/bank/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
  }

  const file = req.file;
  const { titulo, grupo = 'Geral', setores = null, descricao = '' } = req.body || {};
  const fileUrl = `/uploads/${file.filename}`;
  const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
  const finalTitulo = titulo?.trim() || file.originalname;

  let setoresJson = null;
  if (setores) {
    if (typeof setores === 'string') {
      try {
        const parsed = JSON.parse(setores);
        setoresJson = Array.isArray(parsed) && parsed.length > 0 ? JSON.stringify(parsed) : null;
      } catch {
        setoresJson = setores ? JSON.stringify([setores]) : null;
      }
    } else if (Array.isArray(setores) && setores.length > 0) {
      setoresJson = JSON.stringify(setores);
    }
  }

  const sql = `
    INSERT INTO tabela_banco_arquivos (titulo, filename, url, mimetype, ext, size_bytes, grupo, setores, descricao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [finalTitulo, file.originalname, fileUrl, file.mimetype, ext, file.size, grupo || 'Geral', setoresJson, descricao || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      status: 'success',
      file: {
        id: this.lastID,
        titulo: finalTitulo,
        filename: file.originalname,
        url: fileUrl,
        ext,
        size_bytes: file.size,
        size_formatted: formatBytes(file.size),
        grupo: grupo || 'Geral',
        setores: setoresJson ? JSON.parse(setoresJson) : null,
        descricao: descricao || ''
      }
    });
  });
});

// Atualiza metadados de um arquivo do banco (Título, Grupo, Setores, Descrição)
app.post('/api/files/metadata', (req, res) => {
  const { id, url, titulo, grupo = 'Geral', setores = null, descricao = '' } = req.body || {};
  const setoresJson = Array.isArray(setores) && setores.length > 0 ? JSON.stringify(setores) : (setores ? String(setores) : null);

  let sql = '';
  let params = [];

  if (id) {
    sql = `
      UPDATE tabela_banco_arquivos
      SET titulo = COALESCE(?, titulo), grupo = ?, setores = ?, descricao = ?, updated_at = datetime('now')
      WHERE id = ?
    `;
    params = [titulo || null, grupo, setoresJson, descricao, id];
  } else if (url) {
    sql = `
      UPDATE tabela_banco_arquivos
      SET titulo = COALESCE(?, titulo), grupo = ?, setores = ?, descricao = ?, updated_at = datetime('now')
      WHERE url = ?
    `;
    params = [titulo || null, grupo, setoresJson, descricao, url];
  } else {
    return res.status(400).json({ error: 'ID ou URL é obrigatório.' });
  }

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: 'Arquivo atualizado com sucesso.' });
  });
});

// Retorna estatísticas de armazenamento dos arquivos pré-salvos no banco
app.get('/api/files/stats', (req, res) => {
  const typeFilters = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    video: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
    audio: ['mp3', 'ogg', 'wav', 'aac', 'm4a', 'opus'],
    doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'rar']
  };

  db.all("SELECT ext, size_bytes FROM tabela_banco_arquivos", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let totalBytes = 0;
    let totalCount = (rows || []).length;
    const catStats = {
      image: { count: 0, bytes: 0, formatted: '0 B' },
      video: { count: 0, bytes: 0, formatted: '0 B' },
      audio: { count: 0, bytes: 0, formatted: '0 B' },
      doc: { count: 0, bytes: 0, formatted: '0 B' },
      other: { count: 0, bytes: 0, formatted: '0 B' }
    };

    (rows || []).forEach(r => {
      const sz = r.size_bytes || 0;
      totalBytes += sz;
      const ext = (r.ext || '').toLowerCase();

      let cat = 'other';
      if (typeFilters.image.includes(ext)) cat = 'image';
      else if (typeFilters.video.includes(ext)) cat = 'video';
      else if (typeFilters.audio.includes(ext)) cat = 'audio';
      else if (typeFilters.doc.includes(ext)) cat = 'doc';

      catStats[cat].count++;
      catStats[cat].bytes += sz;
    });

    Object.keys(catStats).forEach(k => {
      catStats[k].formatted = formatBytes(catStats[k].bytes) || '0 B';
    });

    res.json({
      total_files: totalCount,
      total_size_bytes: totalBytes,
      total_size_formatted: formatBytes(totalBytes) || '0 B',
      categories: catStats
    });
  });
});

// Exclui arquivo pré-salvo do banco e do disco
app.delete('/api/files/delete', (req, res) => {
  const { url, id } = req.body || {};

  db.get("SELECT * FROM tabela_banco_arquivos WHERE id = ? OR url = ?", [id || null, url || null], (err, row) => {
    if (row) {
      if (row.url) {
        const filePath = path.join(uploadDir, path.basename(row.url));
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Erro ao excluir arquivo físico:', e.message);
        }
      }
      db.run("DELETE FROM tabela_banco_arquivos WHERE id = ?", [row.id], () => {});
    }

    res.json({ status: 'success', message: 'Arquivo excluído do banco com sucesso.' });
  });
});

// ==============================================================================
// ⚡ CRUD DE RESPOSTAS RÁPIDAS (GLOBAIS DA GESTÃO VS PESSOAIS DO ATENDENTE)
// ==============================================================================

app.get('/api/quick-replies', (req, res) => {
  const { usuario_id, search, grupo, categoria, setor_id, escopo } = req.query;

  let query = "SELECT * FROM tabela_respostas_rapidas WHERE 1=1";
  const params = [];

  if (usuario_id) {
    query += " AND (escopo = 'global' OR usuario_id = ?)";
    params.push(String(usuario_id));
  } else if (escopo) {
    query += " AND escopo = ?";
    params.push(escopo);
  }

  const targetGroup = grupo || categoria;
  if (targetGroup && targetGroup !== 'ALL' && targetGroup !== 'Todos') {
    query += " AND (grupo = ? OR categoria = ?)";
    params.push(targetGroup, targetGroup);
  }

  if (search && search.trim()) {
    query += " AND (titulo LIKE ? OR atalho LIKE ? OR conteudo LIKE ? OR grupo LIKE ? OR categoria LIKE ?)";
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s, s);
  }

  query += " ORDER BY favorito DESC, escopo ASC, created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let results = (rows || []).map(r => {
      let setores = null;
      try {
        if (r.setores) setores = typeof r.setores === 'string' ? JSON.parse(r.setores) : r.setores;
      } catch (e) {}

      let blocos = null;
      try {
        if (r.blocos) blocos = typeof r.blocos === 'string' ? JSON.parse(r.blocos) : r.blocos;
      } catch (e) {}

      // Se blocos for nulo, cria bloco padrão de texto a partir de conteudo
      if (!blocos || !Array.isArray(blocos) || blocos.length === 0) {
        blocos = [{ id: 'b_default_' + r.id, tipo: 'texto', texto: r.conteudo || '' }];
      }

      return {
        ...r,
        grupo: r.grupo || r.categoria || 'Geral',
        setores: Array.isArray(setores) ? setores : null,
        blocos: blocos
      };
    });

    if (setor_id) {
      const targetSec = Number(setor_id);
      results = results.filter(r => {
        if (!r.setores || r.setores.length === 0) return true;
        return r.setores.includes(targetSec) || r.setores.includes(String(targetSec));
      });
    }

    res.json({ quick_replies: results });
  });
});

app.post('/api/quick-replies', (req, res) => {
  const {
    titulo,
    atalho = '',
    conteudo,
    grupo,
    categoria = 'Geral',
    escopo = 'global',
    setores = null,
    blocos = null,
    usuario_id = null,
    usuario_nome = 'Gestor',
    favorito = 0,
    midia_url = null
  } = req.body || {};

  if (!titulo) {
    return res.status(400).json({ error: 'Título é obrigatório.' });
  }

  // Se blocos foram enviados, sintetiza conteudo se vazio
  let finalConteudo = conteudo || '';
  let blocosArray = Array.isArray(blocos) ? blocos : (blocos ? JSON.parse(blocos) : null);
  if (!finalConteudo && blocosArray && blocosArray.length > 0) {
    const textBlocks = blocosArray.filter(b => b.tipo === 'texto');
    if (textBlocks.length > 0) {
      finalConteudo = textBlocks.map(b => b.texto).join('\n\n');
    } else {
      finalConteudo = `[${blocosArray.length} arquivo(s)]`;
    }
  }

  if (!finalConteudo && (!blocosArray || blocosArray.length === 0)) {
    return res.status(400).json({ error: 'Informe ao menos um bloco de texto ou arquivo.' });
  }

  const cleanAtalho = atalho && !atalho.startsWith('/') ? `/${atalho}` : atalho;
  const finalGroup = grupo || categoria || 'Geral';
  const setoresJson = Array.isArray(setores) && setores.length > 0 ? JSON.stringify(setores) : (setores ? String(setores) : null);
  const blocosJson = blocosArray && blocosArray.length > 0 ? JSON.stringify(blocosArray) : JSON.stringify([{ id: 'b_1', tipo: 'texto', texto: finalConteudo }]);

  const sql = `
    INSERT INTO tabela_respostas_rapidas 
    (titulo, atalho, conteudo, categoria, grupo, escopo, setores, blocos, usuario_id, usuario_nome, favorito, midia_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `;

  db.run(sql, [titulo, cleanAtalho, finalConteudo, finalGroup, finalGroup, escopo, setoresJson, blocosJson, usuario_id ? String(usuario_id) : null, usuario_nome, favorito ? 1 : 0, midia_url], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get("SELECT * FROM tabela_respostas_rapidas WHERE id = ?", [this.lastID], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      let rowSetores = null;
      let rowBlocos = null;
      try { if (row.setores) rowSetores = JSON.parse(row.setores); } catch (e) {}
      try { if (row.blocos) rowBlocos = JSON.parse(row.blocos); } catch (e) {}
      res.json({ status: 'success', quick_reply: { ...row, grupo: row.grupo || row.categoria, setores: rowSetores, blocos: rowBlocos || [{ id: 'b_1', tipo: 'texto', texto: row.conteudo }] } });
    });
  });
});

app.put('/api/quick-replies/:id', (req, res) => {
  const { id } = req.params;
  const {
    titulo,
    atalho,
    conteudo,
    grupo,
    categoria,
    escopo,
    setores,
    blocos,
    usuario_id,
    usuario_nome,
    favorito,
    midia_url
  } = req.body || {};

  const cleanAtalho = atalho && !atalho.startsWith('/') ? `/${atalho}` : atalho;
  const finalGroup = grupo || categoria;
  const setoresJson = setores !== undefined ? (Array.isArray(setores) && setores.length > 0 ? JSON.stringify(setores) : (setores ? String(setores) : null)) : undefined;

  let blocosJson = undefined;
  let finalConteudo = conteudo;
  if (blocos !== undefined) {
    const blocosArray = Array.isArray(blocos) ? blocos : (blocos ? JSON.parse(blocos) : []);
    blocosJson = JSON.stringify(blocosArray);
    if (!finalConteudo && blocosArray.length > 0) {
      const textBlocks = blocosArray.filter(b => b.tipo === 'texto');
      if (textBlocks.length > 0) {
        finalConteudo = textBlocks.map(b => b.texto).join('\n\n');
      } else {
        finalConteudo = `[${blocosArray.length} arquivo(s)]`;
      }
    }
  }

  const sql = `
    UPDATE tabela_respostas_rapidas
    SET titulo = COALESCE(?, titulo),
        atalho = COALESCE(?, atalho),
        conteudo = COALESCE(?, conteudo),
        categoria = COALESCE(?, categoria),
        grupo = COALESCE(?, grupo),
        escopo = COALESCE(?, escopo),
        setores = COALESCE(?, setores),
        blocos = COALESCE(?, blocos),
        usuario_id = COALESCE(?, usuario_id),
        usuario_nome = COALESCE(?, usuario_nome),
        favorito = COALESCE(?, favorito),
        midia_url = COALESCE(?, midia_url),
        updated_at = datetime('now')
    WHERE id = ?
  `;

  db.run(sql, [titulo, cleanAtalho, finalConteudo, finalGroup, finalGroup, escopo, setoresJson, blocosJson, usuario_id ? String(usuario_id) : null, usuario_nome, favorito !== undefined ? (favorito ? 1 : 0) : null, midia_url, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get("SELECT * FROM tabela_respostas_rapidas WHERE id = ?", [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      let rowSetores = null;
      let rowBlocos = null;
      try { if (row && row.setores) rowSetores = JSON.parse(row.setores); } catch (e) {}
      try { if (row && row.blocos) rowBlocos = JSON.parse(row.blocos); } catch (e) {}
      res.json({ status: 'success', quick_reply: { ...row, grupo: row.grupo || row.categoria, setores: rowSetores, blocos: rowBlocos || [{ id: 'b_1', tipo: 'texto', texto: row?.conteudo || '' }] } });
    });
  });
});

app.delete('/api/quick-replies/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM tabela_respostas_rapidas WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: 'Resposta rápida excluída com sucesso.' });
  });
});

app.post('/api/quick-replies/:id/toggle-favorite', (req, res) => {
  const { id } = req.params;
  db.get("SELECT favorito FROM tabela_respostas_rapidas WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Resposta rápida não encontrada.' });
    const newFav = row.favorito ? 0 : 1;
    db.run("UPDATE tabela_respostas_rapidas SET favorito = ?, updated_at = datetime('now') WHERE id = ?", [newFav, id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ status: 'success', favorito: newFav === 1 });
    });
  });
});

app.all('/api/simulate-incoming-message', (req, res) => {
  const targetJid = req.query.jid || req.body?.jid;
  const targetText = req.query.text || req.body?.text || 'Olá! Gostaria de saber se meu chamado já foi atualizado?';

  const query = targetJid
    ? "SELECT * FROM tabela_atendimentos WHERE cliente_jid = ?"
    : "SELECT * FROM tabela_atendimentos WHERE status = 'em_atendimento' ORDER BY id ASC LIMIT 1";

  const params = targetJid ? [targetJid] : [];

  db.get(query, params, async (err, chat) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!chat) {
      return db.get("SELECT * FROM tabela_atendimentos LIMIT 1", [], async (err2, fallbackChat) => {
        if (!fallbackChat) return res.status(404).json({ error: 'Nenhum atendimento encontrado para simular.' });
        await processIncomingMessage(fallbackChat.cliente_jid, targetText, fallbackChat.cliente_nome, fallbackChat.cliente_avatar);
        return res.json({ status: 'success', message: 'Mensagem simulada com sucesso!', chat: fallbackChat.cliente_nome, jid: fallbackChat.cliente_jid });
      });
    }
    await processIncomingMessage(chat.cliente_jid, targetText, chat.cliente_nome, chat.cliente_avatar);
    res.json({ status: 'success', message: 'Mensagem simulada com sucesso!', chat: chat.cliente_nome, jid: chat.cliente_jid });
  });
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
      nome TEXT NOT NULL,
      setor TEXT DEFAULT 'Geral',
      avatar TEXT
    )
  `);
  db.run("ALTER TABLE tabela_atendentes ADD COLUMN setor TEXT DEFAULT 'Geral'", () => {});
  db.run("ALTER TABLE tabela_atendentes ADD COLUMN avatar TEXT", () => {});
  db.run("ALTER TABLE tabela_atendentes ADD COLUMN manual_status TEXT DEFAULT 'auto'", () => {});

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
  `);
  db.run("ALTER TABLE tabela_atendimentos ADD COLUMN started_at TEXT", () => {});
  db.run("ALTER TABLE tabela_atendimentos ADD COLUMN cliente_avatar TEXT", () => {});
  db.run("ALTER TABLE tabela_atendimentos ADD COLUMN bot_node_id TEXT", () => {});
  db.run("ALTER TABLE tabela_atendimentos ADD COLUMN sector_id INTEGER", () => {});
  db.run("ALTER TABLE tabela_atendimentos ADD COLUMN unread INTEGER DEFAULT 0", () => {});
  db.run("UPDATE tabela_atendimentos SET cliente_avatar = NULL WHERE cliente_avatar LIKE '%ui-avatars.com%'", () => {});

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
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN reacao TEXT", () => {});
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN atendente_nome TEXT", () => {});
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN assinado_cliente INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN apagado INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN apagado_por TEXT", () => {});
  db.run("ALTER TABLE tabela_mensagens ADD COLUMN whatsapp_msg_id TEXT", () => {});

  // 3b. Tabela de Participantes Adicionais de Atendimento (Co-atendimento)
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_atendimento_participantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_jid TEXT NOT NULL,
      atendente_id TEXT NOT NULL,
      atendente_nome TEXT,
      adicionado_por TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(cliente_jid, atendente_id)
    )
  `);

  // 4. Tabela de Respostas Rápidas (Globais vs Pessoais + Grupos + Setores)
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_respostas_rapidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      atalho TEXT,
      conteudo TEXT NOT NULL,
      categoria TEXT DEFAULT 'Geral',
      grupo TEXT DEFAULT 'Geral',
      escopo TEXT DEFAULT 'global', -- 'global' (empresa) ou 'pessoal' (atendente)
      setores TEXT, -- JSON array de IDs de setores vinculados ou NULL (todos)
      usuario_id TEXT,
      usuario_nome TEXT,
      favorito INTEGER DEFAULT 0,
      midia_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (!err) {
      db.run("ALTER TABLE tabela_respostas_rapidas ADD COLUMN grupo TEXT", () => {});
      db.run("ALTER TABLE tabela_respostas_rapidas ADD COLUMN setores TEXT", () => {});
      db.run("ALTER TABLE tabela_respostas_rapidas ADD COLUMN blocos TEXT", () => {});
      seedQuickReplies();
    }
  });

  // 5. Tabela do Banco de Arquivos Pré-Salvos (Biblioteca)
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_banco_arquivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      filename TEXT,
      url TEXT UNIQUE,
      mimetype TEXT,
      ext TEXT,
      size_bytes INTEGER DEFAULT 0,
      grupo TEXT DEFAULT 'Geral',
      setores TEXT, -- JSON array de IDs de setores autorizados ou NULL (todos)
      descricao TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Tabela de Metadados de Arquivos Legados
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_arquivos_metadados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      filename TEXT,
      grupo TEXT DEFAULT 'Geral',
      setores TEXT,
      descricao TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. Tabela de Salas / Canais do Chat Interno da Equipe
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_chat_interno_salas (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL DEFAULT 'canal', -- 'canal', 'grupo' ou 'dm'
      nome TEXT NOT NULL,
      icone TEXT DEFAULT 'hash',
      descricao TEXT,
      membros TEXT, -- JSON array de atendente_ids autorizados (ou NULL se público)
      criado_por_id TEXT,
      criado_por_nome TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run("ALTER TABLE tabela_chat_interno_salas ADD COLUMN criado_por_id TEXT", () => {});
  db.run("ALTER TABLE tabela_chat_interno_salas ADD COLUMN criado_por_nome TEXT", () => {});
  setTimeout(seedInternalChatChannels, 200);

  // 8. Tabela de Mensagens do Chat Interno da Equipe
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_chat_interno_mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sala_id TEXT NOT NULL,
      remetente_id TEXT NOT NULL,
      remetente_nome TEXT NOT NULL,
      remetente_avatar TEXT,
      texto TEXT,
      midia_url TEXT,
      midia_tipo TEXT, -- 'image', 'audio', 'document'
      card_meta TEXT, -- JSON com dados do cliente/ticket compartilhado
      reacoes TEXT, -- JSON com reações { "👍": ["op1", "op2"] }
      apagado INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run("ALTER TABLE tabela_chat_interno_mensagens ADD COLUMN reply_to_id INTEGER", () => {});
  db.run("ALTER TABLE tabela_chat_interno_mensagens ADD COLUMN reply_to_text TEXT", () => {});
  db.run("ALTER TABLE tabela_chat_interno_mensagens ADD COLUMN reply_to_sender TEXT", () => {});

  // 8b. Tabela de Status de Conversas Particulares (Para permitir encerrar/arquivar mantendo o histórico)
  db.run(`
    CREATE TABLE IF NOT EXISTS tabela_chat_interno_dm_status (
      atendente_id TEXT NOT NULL,
      sala_id TEXT NOT NULL,
      fechada_em DATETIME NOT NULL,
      PRIMARY KEY (atendente_id, sala_id)
    )
  `);

  // 9. Verificar se a base está vazia e popular dados de exemplo para testes
  setTimeout(() => {
    db.get("SELECT COUNT(*) as count FROM tabela_atendimentos", (err, row) => {
      if (!err && row && row.count === 0) {
        console.log('📌 Fila de atendimentos vazia. Inserindo exemplos de teste (Mock)...');
        seedMockData(false);
      }
    });
  }, 1000);
});

// Seed de canais padrão do Chat Interno se não existirem
function seedInternalChatChannels() {
  const defaultChannels = [
    { id: 'channel-geral', tipo: 'canal', nome: 'Geral', icone: 'hash', descricao: 'Canal aberto para avisos e comunicação de toda a equipe' },
    { id: 'channel-suporte', tipo: 'canal', nome: 'Suporte Técnico', icone: 'headphones', descricao: 'Discussões técnicas, dúvidas de atendimento e chamados' },
    { id: 'channel-financeiro', tipo: 'canal', nome: 'Financeiro', icone: 'dollar-sign', descricao: 'Boletos, cobranças, notas fiscais e comprovações' },
    { id: 'channel-comercial', tipo: 'canal', nome: 'Comercial & Vendas', icone: 'trending-up', descricao: 'Novos clientes, propostas e negociações de planos' },
    { id: 'channel-diretoria', tipo: 'canal', nome: 'Diretoria & Gestão', icone: 'shield', descricao: 'Comunicados estratégicos e alinhamentos de liderança' }
  ];

  defaultChannels.forEach(c => {
    db.run(
      `INSERT OR IGNORE INTO tabela_chat_interno_salas (id, tipo, nome, icone, descricao) VALUES (?, ?, ?, ?, ?)`,
      [c.id, c.tipo, c.nome, c.icone, c.descricao]
    );
  });

  syncTeamAttendants();
}

// Sincroniza usuários do sistema principal e equipe para conversas 1x1
function syncTeamAttendants(callback) {
  try {
    const ticketsDbPath = path.join(__dirname, '..', 'server', 'tickets.db');
    if (fs.existsSync(ticketsDbPath)) {
      const sqlite3 = require('sqlite3').verbose();
      const mainDb = new sqlite3.Database(ticketsDbPath);
      mainDb.all("SELECT id, full_name, username, role FROM users WHERE is_active = 1", [], (err, rows) => {
        if (!err && rows) {
          rows.forEach(u => {
            const uid = String(u.id);
            const unome = u.full_name || u.username || `Usuário ${uid}`;
            const usetor = u.role === 'ROOT' ? 'Diretoria' : (u.role === 'ADMIN' ? 'Gestão' : 'Atendimento');
            db.run(`INSERT OR IGNORE INTO tabela_atendentes (id, nome, setor) VALUES (?, ?, ?)`, [uid, unome, usetor]);
          });
        }
        mainDb.close();
      });
    }
  } catch (e) {}

  const mockTeam = [
    { id: 'op_carlos', nome: 'Carlos Eduardo', setor: 'Suporte Técnico' },
    { id: 'op_mariana', nome: 'Mariana Souza', setor: 'Financeiro' },
    { id: 'op_rodrigo', nome: 'Rodrigo Silva', setor: 'Comercial & Vendas' },
    { id: 'op_fernanda', nome: 'Fernanda Lima', setor: 'Atendimento ao Cliente' }
  ];

  mockTeam.forEach(m => {
    db.run(`INSERT OR IGNORE INTO tabela_atendentes (id, nome, setor) VALUES (?, ?, ?)`, [m.id, m.nome, m.setor]);
  });

  if (callback) setTimeout(callback, 60);
}

// Seed de respostas rápidas padrão se a tabela estiver vazia
function seedQuickReplies() {
  db.get("SELECT COUNT(*) as count FROM tabela_respostas_rapidas", (err, row) => {
    if (!err && row && row.count === 0) {
      console.log('📌 Tabela de respostas rápidas vazia. Inserindo templates padrão...');
      const defaultReplies = [
        { titulo: 'Saudação Inicial', atalho: '/ola', conteudo: 'Olá! Meu nome é {atendente_nome} do suporte. Como posso ajudar você hoje?', categoria: '👋 Atendimento Inicial', escopo: 'global', favorito: 1 },
        { titulo: 'Em Análise', atalho: '/analise', conteudo: 'Um momento, por favor. Estou verificando seu cadastro e pedido em nosso sistema.', categoria: '⏳ Em Análise / Aguarde', escopo: 'global', favorito: 1 },
        { titulo: 'Solicitar Documento', atalho: '/docs', conteudo: 'Por favor, envie uma foto do documento ou comprovante para prosseguirmos com seu atendimento.', categoria: '📄 Documentos & Comprovantes', escopo: 'global', favorito: 1 },
        { titulo: 'Finalização e Agradecimento', atalho: '/fim', conteudo: 'Atendimento concluído com sucesso! Qualquer nova dúvida, estamos à inteira disposição. Tenha um excelente dia!', categoria: '✅ Finalização', escopo: 'global', favorito: 1 },
        { titulo: 'Chave Pix para Pagamento', atalho: '/pix', conteudo: 'Segue nossa chave Pix para pagamento: financeiro@empresa.com.br. Por favor, envie o comprovante após a transferência.', categoria: '💳 Financeiro / Cobrança', escopo: 'global', favorito: 0 },
        { titulo: 'Endereço e Horário', atalho: '/endereco', conteudo: 'Nosso horário de funcionamento é de Segunda a Sexta, das 08h às 18h.', categoria: '📍 Informações Gerais', escopo: 'global', favorito: 0 }
      ];

      const stmt = db.prepare("INSERT INTO tabela_respostas_rapidas (titulo, atalho, conteudo, categoria, escopo, favorito, usuario_nome) VALUES (?, ?, ?, ?, ?, ?, 'Gestor (Padrão)')");
      defaultReplies.forEach(r => {
        stmt.run(r.titulo, r.atalho, r.conteudo, r.categoria, r.escopo, r.favorito);
      });
      stmt.finalize();
    }
  });
}

// ==============================================================================
// 🧪 GERADOR DE DADOS DE TESTE (MOCK DATA COM HISTÓRICO MULTI-SESSÃO)
// ==============================================================================
function seedMockData(force = false, callback = null) {
  const mockClients = [
    {
      jid: '5511977772222@c.us',
      nome: 'Fernanda Lima',
      avatar: null,
      status: 'fila',
      unread: 1,
      messages: [
        // Sessão Anterior (Finalizada)
        { remetente: 'cliente', texto: 'Olá, gostaria de confirmar se o meu cadastro foi aprovado no sistema.' },
        { remetente: 'atendente', atendente_nome: 'Carlos Santos', texto: 'Olá Fernanda! Sim, verifiquei aqui e seus documentos foram aprovados com sucesso.' },
        { remetente: 'cliente', texto: 'Perfeito, muito obrigada pelo retorno rápido!' },
        { remetente: 'sistema', texto: 'Atendimento finalizado pelo atendente.' },
        // Sessão Atual
        { remetente: 'cliente', texto: 'Gostaria de saber se o meu pedido #94821 já foi enviado para a transportadora.' }
      ]
    },
    {
      jid: '5511988881111@c.us',
      nome: 'Carlos Oliveira',
      avatar: null,
      status: 'fila',
      unread: 1,
      messages: [
        // Sessão Anterior (Finalizada)
        { remetente: 'cliente', texto: 'Bom dia, como faço para solicitar a troca de um produto com defeito?' },
        { remetente: 'atendente', atendente_nome: 'Carlos Santos', texto: 'Bom dia Carlos! Basta acessar o menu Meus Pedidos e gerar a etiqueta de devolução gratuita.' },
        { remetente: 'cliente', texto: 'Consegui gerar aqui, obrigado!' },
        { remetente: 'sistema', texto: 'Atendimento finalizado pelo atendente.' },
        // Sessão Atual
        { remetente: 'cliente', texto: 'Olá! Boa tarde. Preciso de suporte para redefinir minha senha de acesso ao portal de vendas.' }
      ]
    },
    {
      jid: '5511966663333@c.us',
      nome: 'Lucas Mendes',
      avatar: null,
      status: 'fila',
      unread: 1,
      messages: [
        // Sessão Anterior (Finalizada)
        { remetente: 'cliente', texto: 'Qual a chave PIX para pagamento da mensalidade?' },
        { remetente: 'atendente', atendente_nome: 'Carlos Santos', texto: 'Nossa chave PIX CNPJ é 12.345.678/0001-90 (Empresa Tickets Ltda).' },
        { remetente: 'cliente', texto: 'Pagamento realizado com sucesso!' },
        { remetente: 'sistema', texto: 'Atendimento finalizado pelo atendente.' },
        // Sessão Atual
        { remetente: 'cliente', texto: 'Boa tarde! Teria como me enviar a segunda via da nota fiscal referente à compra de ontem?' }
      ]
    },
    {
      jid: '5511955554444@c.us',
      nome: 'Juliana Costa',
      avatar: null,
      status: 'fila',
      unread: 1,
      messages: [
        // Sessão Anterior (Finalizada)
        { remetente: 'cliente', texto: 'Vocês realizam entregas para a região sul?' },
        { remetente: 'atendente', atendente_nome: 'Carlos Santos', texto: 'Olá Juliana! Sim, enviamos para todo o Brasil via Sedex e transportadoras parceiras.' },
        { remetente: 'sistema', texto: 'Atendimento finalizado pelo atendente.' },
        // Sessão Atual
        { remetente: 'cliente', texto: 'Oi pessoal, qual o horário de funcionamento do atendimento presencial no final de semana?' }
      ]
    },
    {
      jid: '5511944445555@c.us',
      nome: 'Roberto Alves',
      avatar: null,
      status: 'fila',
      unread: 1,
      messages: [
        // Sessão Anterior (Finalizada)
        { remetente: 'cliente', texto: 'Preciso atualizar o e-mail de faturamento da minha empresa.' },
        { remetente: 'atendente', atendente_nome: 'Carlos Santos', texto: 'E-mail atualizado com sucesso no cadastro financeiro!' },
        { remetente: 'sistema', texto: 'Atendimento finalizado pelo atendente.' },
        // Sessão Atual
        { remetente: 'cliente', texto: 'Estou tentando acessar o módulo financeiro e recebi um aviso de falta de permissão.' }
      ]
    }
  ];

  let addedCount = 0;
  let processed = 0;

  const insertClientData = (client) => {
    const startedAt = new Date().toISOString();
    db.run(
      `INSERT INTO tabela_atendimentos (cliente_jid, cliente_nome, cliente_avatar, status, started_at, unread)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cliente_jid) DO UPDATE SET status = excluded.status, unread = excluded.unread`,
      [client.jid, client.nome, client.avatar, client.status, startedAt, client.unread],
      function (err) {
        if (!err) {
          addedCount++;
          client.messages.forEach(msg => {
            const isAttendant = msg.remetente !== 'cliente' && msg.remetente !== 'sistema';
            db.run(
              `INSERT INTO tabela_mensagens (cliente_jid, remetente, atendente_nome, assinado_cliente, texto) VALUES (?, ?, ?, ?, ?)`,
              [client.jid, msg.remetente, isAttendant ? (msg.atendente_nome || 'Carlos Santos') : null, isAttendant ? 1 : 0, msg.texto]
            );
          });
        }
        processed++;
        if (processed === mockClients.length) {
          broadcastQueue();
          broadcastBotList();
          console.log(`✅ [Mock Seed] ${addedCount} atendimento(s) com histórico de teste inseridos.`);
          if (callback) callback(null, addedCount);
        }
      }
    );
  };

  if (force) {
    const jidPlaceholders = mockClients.map(() => '?').join(',');
    const jidList = mockClients.map(c => c.jid);
    db.run(`DELETE FROM tabela_mensagens WHERE cliente_jid IN (${jidPlaceholders})`, jidList, () => {
      mockClients.forEach(client => insertClientData(client));
    });
  } else {
    mockClients.forEach(client => insertClientData(client));
  }
}

app.get('/api/seed-mock-data', (req, res) => {
  const force = req.query.force === 'true';
  seedMockData(force, (err, count) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: `${count} exemplos de atendimento foram inseridos na fila!`, count });
  });
});

app.post('/api/seed-mock-data', (req, res) => {
  const force = req.body && req.body.force === true;
  seedMockData(force, (err, count) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', message: `${count} exemplos de atendimento foram inseridos na fila!`, count });
  });
});


// ==============================================================================
// 🤖 INICIALIZAÇÃO DO WHATSAPP CLIENT (whatsapp-web.js)
// ==============================================================================
let qrCodeImage = null;
let whatsappStatus = 'desconectado'; // 'desconectado', 'autenticando', 'pronto'

console.log('🔄 Inicializando cliente do WhatsApp (Aguarde alguns segundos)...');
console.log('🌐 Subindo navegador Chromium e conectando à sessão do WhatsApp Web...');

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
// 🔄 FLUXO A: RECEBIMENTO DE MENSAGEM DO WHATSAPP (COM PROTEÇÃO ANTI-BAN)
// ==============================================================================

// Mapa global de debounce para evitar rajadas e spam de mensagens recebidas
if (!global._inboundDebounceMap) global._inboundDebounceMap = new Map();

wwebClient.on('message', async (msg) => {
  // Ignora mensagens de grupos, status/stories e listas de transmissão (anti-spam / anti-ban)
  if (msg.from.includes('@g.us') || msg.isStatus || msg.from.includes('@broadcast') || msg.from.includes('status@broadcast')) {
    return;
  }

  const clienteJid = msg.from;
  let texto = msg.body;
  
  try {
    // Processamento de Mídia Recebida
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = media.mimetype ? '.' + media.mimetype.split('/')[1].split(';')[0] : '.bin';
        const filename = 'media-' + uniqueSuffix + ext;
        const filepath = path.join(uploadDir, filename);
        
        fs.writeFileSync(filepath, media.data, 'base64');
        
        const fileUrl = `/uploads/${filename}`;
        // Adiciona a legenda se houver, caso contrário, envia apenas o anexo
        texto = `[ANEXO] ${fileUrl} \n${texto ? texto : ''}`;
        console.log(`📎 Anexo recebido e salvo: ${filename}`);
      }
    }

    const contact = await msg.getContact();
    const clienteNome = contact.pushname || contact.name || clienteJid.split('@')[0];
    let profilePicUrl = null;
    try {
      profilePicUrl = await contact.getProfilePicUrl();
    } catch (picErr) {
      console.warn(`Não foi possível obter avatar para ${clienteJid}:`, picErr.message);
    }

    console.log(`📩 Mensagem recebida de ${clienteNome} (${clienteJid}): "${texto}"`);

    // Proteção Anti-Flood / Debounce: Se o cliente enviar múltiplas mensagens em rajada (< 600ms), processa a última consolidada
    if (global._inboundDebounceMap.has(clienteJid)) {
      clearTimeout(global._inboundDebounceMap.get(clienteJid));
    }

    global._inboundDebounceMap.set(
      clienteJid,
      setTimeout(async () => {
        global._inboundDebounceMap.delete(clienteJid);
        await processIncomingMessage(clienteJid, texto, clienteNome, profilePicUrl);
      }, 450)
    );
  } catch (error) {
    console.error('❌ Erro no processamento de mensagem recebida:', error);
  }
});

// Listener para quando o cliente apaga uma mensagem no WhatsApp ("Apagar para todos")
wwebClient.on('message_revoke_everyone', async (after, before) => {
  try {
    const clienteJid = (before && before.from) || (after && after.from) || (after && after.to);
    if (!clienteJid) return;

    const textoMsg = before ? before.body : null;
    if (textoMsg) {
      db.get(
        `SELECT id FROM tabela_mensagens WHERE cliente_jid = ? AND texto LIKE ? AND (apagado = 0 OR apagado IS NULL) ORDER BY id DESC LIMIT 1`,
        [clienteJid, `%${textoMsg}%`],
        (err, row) => {
          if (!err && row) {
            db.run(`UPDATE tabela_mensagens SET apagado = 1, apagado_por = 'cliente' WHERE id = ?`, [row.id], () => {
              console.log(`🚫 Mensagem ID ${row.id} apagada no WhatsApp pelo cliente (${clienteJid})`);
              emitToChatRooms(clienteJid, 'message_deleted', {
                message_id: row.id,
                cliente_jid: clienteJid,
                apagado: 1,
                apagado_por: 'cliente'
              });
            });
          }
        }
      );
    }
  } catch (revErr) {
    console.error('Erro ao processar mensagem revogada pelo cliente:', revErr.message);
  }
});

// ==============================================================================
// 🎙️ COMUNICAÇÃO WEBSOCKET (SOCKET.IO)
// ==============================================================================

// Mapeamento de Sockets Conectados por Atendente
const activeSockets = new Map(); // socket.id -> atendenteId

// Memória para Sessões de Voz em Tempo Real (WebRTC Mesh Signaling)
const activeVoiceSessions = new Map();

function getActiveVoiceSessionsSummary() {
  const list = [];
  activeVoiceSessions.forEach((session, sId) => {
    list.push({
      id: sId,
      title: session.title,
      type: session.type,
      roomId: session.roomId,
      participantsCount: session.participants ? session.participants.size : 0,
      participants: session.participants ? Array.from(session.participants.values()) : []
    });
  });
  return list;
}

function broadcastVoiceRoomsStatus() {
  io.emit('voice_rooms_status', { rooms: getActiveVoiceSessionsSummary() });
}

function handleLeaveVoiceSession(socket, sessionId) {
  if (!sessionId) return;
  const session = activeVoiceSessions.get(sessionId);
  if (!session) return;

  const leavingParticipant = session.participants.get(socket.id);
  session.participants.delete(socket.id);
  socket.leave(session.roomId);

  if (session.participants.size === 0) {
    activeVoiceSessions.delete(sessionId);
    console.log(`🎙️ Sessão de voz encerrada: ${sessionId}`);
  } else {
    const participantsArray = Array.from(session.participants.values());
    io.to(session.roomId).emit('voice_user_left', {
      session_id: sessionId,
      leavingSocketId: socket.id,
      operatorId: leavingParticipant ? leavingParticipant.operatorId : null,
      participants: participantsArray
    });
    io.to(session.roomId).emit('voice_session_updated', {
      session_id: sessionId,
      title: session.title,
      type: session.type,
      participants: participantsArray
    });
  }
  broadcastVoiceRoomsStatus();
}

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
  socket.on('send_message', async ({ cliente_jid, texto, atendente_id, atendente_nome, send_signature, is_internal, attachments }) => {
    if (!cliente_jid || (!texto && (!attachments || attachments.length === 0)) || !atendente_id) return;

    const opNome = atendente_nome || atendente_id;
    const isSigned = (send_signature !== false && !is_internal) ? 1 : 0;

    console.log(`📤 Enviando mensagem de [${opNome}] para [${cliente_jid}]: "${texto}" (Assinado: ${isSigned ? 'SIM' : 'NÃO'}, Anexos: ${attachments ? attachments.length : 0})`);
    checkManualTakeover(cliente_jid, atendente_id);

    try {
      // Envia via WhatsApp Web se conectado, ou simula resposta em offline/teste
      if (whatsappStatus !== 'pronto') {
        console.log('⚠️ WhatsApp desconectado. Salvando mensagem no modo Simulação...');
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, atendente_nome, assinado_cliente, texto) VALUES (?, ?, ?, ?, ?)`,
          [cliente_jid, atendente_id, opNome, isSigned, texto],
          function (err) {
            if (err) {
              console.error('Erro ao salvar mensagem simulada:', err.message);
              return;
            }

            const novaMsg = {
              id: this.lastID,
              cliente_jid: cliente_jid,
              remetente: atendente_id,
              atendente_nome: opNome,
              assinado_cliente: isSigned,
              texto: texto,
              timestamp: new Date().toISOString()
            };

            // Envia para todos os participantes do atendimento (principal + adicionais)
            emitToChatRooms(cliente_jid, 'new_message', novaMsg);

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

                  emitToChatRooms(cliente_jid, 'new_message', clientMsg);
                }
              );
            }, 1500);
          }
        );
        return;
      }

      if (attachments && attachments.length > 0) {
        // Envio de Anexos
        for (let i = 0; i < attachments.length; i++) {
          const file = attachments[i];
          const localPath = file.path || (file.url ? path.join(uploadDir, path.basename(file.url)) : null);
          
          if (!localPath || !fs.existsSync(localPath)) {
            console.error('Arquivo não encontrado localmente:', file);
            continue;
          }

          const media = MessageMedia.fromFilePath(localPath);
          
          let captionToSend = (i === 0 && texto) ? texto : (file.caption || '');
          if (captionToSend && isSigned && opNome) {
            captionToSend = `*${opNome}:*\n${captionToSend}`;
          }

          const options = captionToSend ? { caption: captionToSend } : {};
          
          let sentMsg = null;
          try {
            sentMsg = await wwebClient.sendMessage(cliente_jid, media, options);
          } catch (sendErr) {
            console.error('Erro ao enviar anexo via WhatsApp:', sendErr.message);
          }
          const wMsgId = sentMsg && sentMsg.id ? (sentMsg.id._serialized || sentMsg.id.id) : null;
          
          // Salva o registro de envio do anexo no banco de dados local
          const anexoTexto = `[ANEXO] ${file.url || ('/uploads/' + path.basename(localPath))} \n${captionToSend || ''}`.trim();
          db.run(
            `INSERT INTO tabela_mensagens (cliente_jid, remetente, atendente_nome, assinado_cliente, texto, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [cliente_jid, atendente_id, opNome, isSigned, anexoTexto, wMsgId],
            function (err) {
              if (err) console.error('Erro ao salvar anexo no bd:', err.message);
              emitToChatRooms(cliente_jid, 'new_message', {
                id: this.lastID,
                cliente_jid: cliente_jid,
                remetente: atendente_id,
                atendente_nome: opNome,
                assinado_cliente: isSigned,
                texto: anexoTexto,
                whatsapp_msg_id: wMsgId,
                timestamp: new Date().toISOString()
              });
            }
          );
        }
      } else if (texto && texto.startsWith('data:audio/')) {
        // Fluxo de Áudio de Voz gravado no app - grava arquivo em disco para histórico permanente
        let audioFileUrl = texto;
        let sentMsg = null;
        const matches = texto.match(/^data:(audio\/[a-zA-Z0-9\-]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const ext = mimeType.includes('ogg') ? '.ogg' : (mimeType.includes('mp4') || mimeType.includes('m4a')) ? '.m4a' : mimeType.includes('webm') ? '.webm' : '.ogg';
          const filename = 'voice-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
          const filepath = path.join(uploadDir, filename);
          try {
            fs.writeFileSync(filepath, base64Data, 'base64');
            audioFileUrl = `/uploads/${filename}`;
            console.log(`🎙️ Áudio de voz gravado e salvo no histórico: ${filename}`);
          } catch (fileErr) {
            console.error('Erro ao salvar arquivo de áudio de voz:', fileErr.message);
          }

          try {
            const media = new MessageMedia(mimeType, base64Data, 'audio' + ext);
            sentMsg = await wwebClient.sendMessage(cliente_jid, media, { sendAudioAsVoice: true });
          } catch (sendErr) {
            console.error('Erro ao enviar áudio de voz via WhatsApp:', sendErr.message);
          }
        } else {
          try {
            sentMsg = await wwebClient.sendMessage(cliente_jid, texto);
          } catch (sendErr) {
            console.error('Erro ao enviar texto de áudio via WhatsApp:', sendErr.message);
          }
        }
        
        const wMsgId = sentMsg && sentMsg.id ? (sentMsg.id._serialized || sentMsg.id.id) : null;

        // Salva áudio no banco de dados para histórico
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, atendente_nome, assinado_cliente, texto, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?, ?)`,
          [cliente_jid, atendente_id, opNome, isSigned, audioFileUrl, wMsgId],
          function (err) {
            if (err) console.error('Erro salvar áudio:', err.message);
            emitToChatRooms(cliente_jid, 'new_message', {
              id: this.lastID,
              cliente_jid,
              remetente: atendente_id,
              atendente_nome: opNome,
              assinado_cliente: isSigned,
              texto: audioFileUrl,
              whatsapp_msg_id: wMsgId,
              timestamp: new Date().toISOString()
            });
          }
        );
      } else {
        // Envio de texto normal
        let textToSend = texto;
        if (isSigned && opNome && typeof texto === 'string' && !is_internal) {
          textToSend = `*${opNome}:*\n${texto}`;
        }

        let sentMsg = null;
        try {
          sentMsg = await wwebClient.sendMessage(cliente_jid, textToSend);
        } catch (sendErr) {
          console.error('Erro ao enviar mensagem de texto via WhatsApp:', sendErr.message);
        }
        const wMsgId = sentMsg && sentMsg.id ? (sentMsg.id._serialized || sentMsg.id.id) : null;
        
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, atendente_nome, assinado_cliente, texto, whatsapp_msg_id) VALUES (?, ?, ?, ?, ?, ?)`,
          [cliente_jid, atendente_id, opNome, isSigned, texto, wMsgId],
          function (err) {
            if (err) console.error('Erro salvar txt:', err.message);
            emitToChatRooms(cliente_jid, 'new_message', {
              id: this.lastID,
              cliente_jid,
              remetente: atendente_id,
              atendente_nome: opNome,
              assinado_cliente: isSigned,
              texto,
              whatsapp_msg_id: wMsgId,
              timestamp: new Date().toISOString()
            });
          }
        );
      }

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
        refreshActiveChatsForChat(cliente_jid);
        if (atendente_id) sendActiveChats(atendente_id);
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
  socket.on('finish_chat', async ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;

    console.log(`🏁 Atendimento finalizado para [${cliente_jid}] por [${atendente_id}]`);

    // Captura participantes antes de limpar
    const participantsToNotify = await getChatParticipantIds(cliente_jid);

    // Insere mensagem de sistema no histórico
    const sysMsgText = 'Atendimento finalizado pelo atendente.';
    db.run(
      `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`,
      [cliente_jid, sysMsgText],
      function () {
        const novaMsg = {
          id: this.lastID,
          cliente_jid,
          remetente: 'sistema',
          texto: sysMsgText,
          timestamp: new Date().toISOString()
        };
        emitToChatRooms(cliente_jid, 'new_message', novaMsg);
      }
    );

    // Atualiza status do atendimento e limpa participantes
    db.run(
      `UPDATE tabela_atendimentos SET status = 'finalizado' WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao finalizar atendimento:', err.message);
          return;
        }

        db.run(`DELETE FROM tabela_atendimento_participantes WHERE cliente_jid = ?`, [cliente_jid], () => {
          // Atualiza a visualização de todos os participantes anteriores e histórico
          participantsToNotify.forEach(pId => {
            sendActiveChats(pId);
            sendHistoryChats(pId);
          });
          broadcastQueue();
        });
      }
    );
  });

  // 6a. DEVOLVER ATENDIMENTO À FILA DE ESPERA
  socket.on('return_to_queue', async ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid) return;
    const opId = atendente_id || activeSockets.get(socket.id);

    console.log(`↩️ Atendimento [${cliente_jid}] devolvido à fila por [${opId}]`);

    const participantsToNotify = await getChatParticipantIds(cliente_jid);

    db.run(
      `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, bot_node_id = NULL WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao devolver atendimento à fila:', err.message);
          return;
        }

        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento devolvido à Fila de Espera.')`,
          [cliente_jid]
        );

        db.run(`DELETE FROM tabela_atendimento_participantes WHERE cliente_jid = ?`, [cliente_jid], () => {
          broadcastQueue();
          participantsToNotify.forEach(pId => {
            sendActiveChats(pId);
          });
          if (opId) sendActiveChats(opId);
        });
      }
    );
  });

  // 6b. TRANSFERIR ATENDIMENTO DE SETOR / FILA
  socket.on('transfer_chat', async ({ cliente_jid, atendente_id, sector_id }) => {
    if (!cliente_jid) return;
    const opId = atendente_id || activeSockets.get(socket.id);

    const parsedSectorId = (sector_id !== null && sector_id !== undefined && sector_id !== '') ? parseInt(sector_id, 10) : null;
    console.log(`🔀 Transferindo atendimento de [${cliente_jid}] para o setor [${parsedSectorId}]`);

    const participantsToNotify = await getChatParticipantIds(cliente_jid);

    db.run(
      `UPDATE tabela_atendimentos SET status = 'fila', atendente_id = NULL, sector_id = ?, bot_node_id = NULL WHERE cliente_jid = ?`,
      [parsedSectorId, cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao transferir atendimento:', err.message);
          return;
        }

        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento transferido de setor.')`,
          [cliente_jid]
        );

        db.run(`DELETE FROM tabela_atendimento_participantes WHERE cliente_jid = ?`, [cliente_jid], () => {
          broadcastQueue();
          participantsToNotify.forEach(pId => {
            sendActiveChats(pId);
          });
          if (opId) sendActiveChats(opId);
        });
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
        refreshActiveChatsForChat(cliente_jid);
        sendActiveChats(atendente_id);
      }
    );
  });

  // 6d. FINALIZAR CONVERSA SILENCIOSAMENTE
  socket.on('finish_chat_silently', async ({ cliente_jid, atendente_id }) => {
    if (!cliente_jid || !atendente_id) return;

    console.log(`🤫 Atendimento finalizado silenciosamente para [${cliente_jid}] por [${atendente_id}]`);

    const participantsToNotify = await getChatParticipantIds(cliente_jid);

    // Atualiza status do atendimento sem inserir mensagem de sistema no histórico
    db.run(
      `UPDATE tabela_atendimentos SET status = 'finalizado' WHERE cliente_jid = ?`,
      [cliente_jid],
      (err) => {
        if (err) {
          console.error('Erro ao finalizar atendimento silenciosamente:', err.message);
          return;
        }

        db.run(`DELETE FROM tabela_atendimento_participantes WHERE cliente_jid = ?`, [cliente_jid], () => {
          participantsToNotify.forEach(pId => {
            sendActiveChats(pId);
            sendHistoryChats(pId);
          });
          broadcastQueue();
        });
      }
    );
  });

  // 6b. EXCLUIR MENSAGEM DO HISTÓRICO (Apaga no WhatsApp do cliente e preserva registro local como apagado)
  socket.on('delete_message', async ({ message_id, atendente_id, cliente_jid }) => {
    if (!message_id) return;
    db.get(`SELECT status FROM tabela_atendimentos WHERE cliente_jid = ?`, [cliente_jid], async (err, at) => {
      if (!err && at && (at.status === 'finalizado' || at.status === 'bot')) {
        console.warn(`⚠️ Tentativa de exclusão bloqueada em atendimento encerrado/bot (${cliente_jid}).`);
        return;
      }

      // Busca a mensagem para tentar deletar no WhatsApp do cliente
      db.get(`SELECT * FROM tabela_mensagens WHERE id = ?`, [message_id], async (msgErr, msgRow) => {
        if (!msgErr && msgRow) {
          try {
            // Tenta deletar no WhatsApp (delete for everyone)
            if (msgRow.whatsapp_msg_id) {
              const wMsg = await wwebClient.getMessageById(msgRow.whatsapp_msg_id);
              if (wMsg) {
                await wMsg.delete(true);
                console.log(`🗑️ Mensagem ${msgRow.whatsapp_msg_id} apagada no WhatsApp do cliente!`);
              }
            } else if (cliente_jid) {
              // Fallback: Busca mensagem recente correspondente no chat do WhatsApp
              const chat = await wwebClient.getChatById(cliente_jid);
              if (chat) {
                const recentMsgs = await chat.fetchMessages({ limit: 20 });
                const matchingMsg = recentMsgs.find(m => m.fromMe && (
                  (msgRow.texto && m.body && m.body.includes(msgRow.texto)) ||
                  (m.hasMedia && msgRow.texto && msgRow.texto.includes('/uploads/'))
                ));
                if (matchingMsg) {
                  await matchingMsg.delete(true);
                  console.log(`🗑️ Mensagem apagada no WhatsApp do cliente via fallback de busca!`);
                }
              }
            }
          } catch (wErr) {
            console.warn('⚠️ Não foi possível apagar mensagem diretamente no WhatsApp:', wErr.message);
          }
        }

        // No banco de dados local, NUNCA exclui o registro: apenas marca como apagado
        db.run(
          `UPDATE tabela_mensagens SET apagado = 1, apagado_por = ? WHERE id = ?`,
          [atendente_id || 'atendente', message_id],
          (updateErr) => {
            if (updateErr) {
              console.error('Erro ao marcar mensagem como apagada:', updateErr.message);
              return;
            }
            emitToChatRooms(cliente_jid, 'message_deleted', {
              message_id,
              cliente_jid,
              apagado: 1,
              apagado_por: atendente_id || 'atendente'
            });
          }
        );
      });
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
    if (!message_id) return;
    db.get(`SELECT status FROM tabela_atendimentos WHERE cliente_jid = ?`, [cliente_jid], (err, at) => {
      if (!err && at && (at.status === 'finalizado' || at.status === 'bot')) {
        console.warn(`⚠️ Tentativa de reação bloqueada em atendimento encerrado/bot (${cliente_jid}).`);
        return;
      }
      console.log(`❤️ Reagindo à mensagem ID ${message_id} com "${reacao || 'Nenhuma'}" por solicitação de atendente ${atendente_id || 'sistema'}`);
      db.run(`UPDATE tabela_mensagens SET reacao = ? WHERE id = ?`, [reacao, message_id], (err) => {
        if (err) {
          console.error('Erro ao atualizar reação da mensagem:', err.message);
          return;
        }
        emitToChatRooms(cliente_jid, 'message_reacted', { message_id, reacao, cliente_jid });
      });
    });
  });

  // 7. GESTÃO DE PARTICIPANTES ADICIONAIS NA CONVERSA (CO-ATENDIMENTO)
  socket.on('get_chat_participants', async ({ cliente_jid }) => {
    if (!cliente_jid) return;

    try {
      // 1. Obter atendente principal
      db.get(
        `SELECT a.atendente_id, at.nome as atendente_nome 
         FROM tabela_atendimentos a
         LEFT JOIN tabela_atendentes at ON at.id = a.atendente_id
         WHERE a.cliente_jid = ?`,
        [cliente_jid],
        (err, mainRow) => {
          if (err) {
            console.error('Erro ao consultar atendente principal:', err.message);
            return;
          }

          // 2. Obter participantes adicionais
          db.all(
            `SELECT p.*, at.nome as atendente_nome 
             FROM tabela_atendimento_participantes p
             LEFT JOIN tabela_atendentes at ON at.id = p.atendente_id
             WHERE p.cliente_jid = ?
             ORDER BY p.created_at ASC`,
            [cliente_jid],
            async (pErr, participantRows) => {
              if (pErr) {
                console.error('Erro ao consultar participantes:', pErr.message);
                return;
              }

              // 3. Sincronizar e obter lista de atendentes disponíveis no sistema
              try {
                const resFastApi = await fetch('http://localhost:8080/users/attendants');
                if (resFastApi.ok) {
                  const fastApiUsers = await resFastApi.json();
                  if (Array.isArray(fastApiUsers)) {
                    for (const u of fastApiUsers) {
                      const uid = String(u.id);
                      const unome = u.name || uid;
                      db.run(`INSERT OR IGNORE INTO tabela_atendentes (id, nome) VALUES (?, ?)`, [uid, unome]);
                    }
                  }
                }
              } catch (apiErr) {
                // Fallback para tabela local
              }

              db.all(`SELECT id, nome FROM tabela_atendentes ORDER BY nome ASC`, [], (aErr, allAttendants) => {
                const primaryId = mainRow ? mainRow.atendente_id : null;
                const existingParticipantIds = new Set((participantRows || []).map(p => p.atendente_id));
                if (primaryId) existingParticipantIds.add(primaryId);

                const available = (allAttendants || []).filter(u => !existingParticipantIds.has(u.id));

                socket.emit('chat_participants_data', {
                  cliente_jid,
                  primary: mainRow ? { id: mainRow.atendente_id, nome: mainRow.atendente_nome || mainRow.atendente_id } : null,
                  participants: (participantRows || []).map(p => ({
                    id: p.id,
                    atendente_id: p.atendente_id,
                    atendente_nome: p.atendente_nome || p.atendente_id,
                    adicionado_por: p.adicionado_por,
                    created_at: p.created_at
                  })),
                  available_attendants: available
                });
              });
            }
          );
        }
      );
    } catch (e) {
      console.error('Erro geral ao obter participantes:', e);
    }
  });

  socket.on('add_chat_participant', ({ cliente_jid, atendente_id, atendente_nome, added_by_id, added_by_name }) => {
    if (!cliente_jid || !atendente_id) return;

    const opName = atendente_nome || atendente_id;
    const addedByName = added_by_name || added_by_id || 'Atendente';

    console.log(`👥 Adicionando [${opName}] (${atendente_id}) ao atendimento [${cliente_jid}] por [${addedByName}]`);

    // Insere atendente na tabela de atendentes se não existir
    db.run(`INSERT OR IGNORE INTO tabela_atendentes (id, nome) VALUES (?, ?)`, [atendente_id, opName]);

    // Insere como participante
    db.run(
      `INSERT OR IGNORE INTO tabela_atendimento_participantes (cliente_jid, atendente_id, atendente_nome, adicionado_por) VALUES (?, ?, ?, ?)`,
      [cliente_jid, atendente_id, opName, addedByName],
      function (err) {
        if (err) {
          console.error('Erro ao adicionar participante:', err.message);
          return;
        }

        // Insere mensagem de sistema
        const sysMsgText = `👥 ${opName} foi adicionado(a) como participante da conversa por ${addedByName}.`;
        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`,
          [cliente_jid, sysMsgText],
          function (msgErr) {
            const novaMsg = {
              id: this.lastID,
              cliente_jid,
              remetente: 'sistema',
              texto: sysMsgText,
              timestamp: new Date().toISOString()
            };

            // Notifica todos os participantes da nova mensagem
            emitToChatRooms(cliente_jid, 'new_message', novaMsg);

            // Atualiza a lista de conversas ativas para todos os envolvidos (incluindo o novo participante)
            refreshActiveChatsForChat(cliente_jid);
            sendActiveChats(atendente_id);

            // Emite evento de participantes atualizados
            emitChatParticipantsUpdate(cliente_jid);
          }
        );
      }
    );
  });

  socket.on('remove_chat_participant', ({ cliente_jid, atendente_id, atendente_nome, removed_by_id, removed_by_name }) => {
    if (!cliente_jid || !atendente_id) return;

    const opName = atendente_nome || atendente_id;
    const removedByName = removed_by_name || removed_by_id || 'Atendente';
    const isSelf = removed_by_id === atendente_id;

    console.log(`👥 Removendo [${opName}] (${atendente_id}) do atendimento [${cliente_jid}] por [${removedByName}]`);

    db.run(
      `DELETE FROM tabela_atendimento_participantes WHERE cliente_jid = ? AND atendente_id = ?`,
      [cliente_jid, atendente_id],
      function (err) {
        if (err) {
          console.error('Erro ao remover participante:', err.message);
          return;
        }

        // Mensagem de sistema
        const sysMsgText = isSelf 
          ? `👋 ${opName} saiu da conversa.` 
          : `👋 ${opName} foi removido(a) da conversa por ${removedByName}.`;

        db.run(
          `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`,
          [cliente_jid, sysMsgText],
          function (msgErr) {
            const novaMsg = {
              id: this.lastID,
              cliente_jid,
              remetente: 'sistema',
              texto: sysMsgText,
              timestamp: new Date().toISOString()
            };

            // Notifica o próprio atendente removido e os participantes restantes
            io.to(atendente_id).emit('new_message', novaMsg);
            emitToChatRooms(cliente_jid, 'new_message', novaMsg);

            // Atualiza lista de ativos para o atendente removido e para os restantes
            sendActiveChats(atendente_id);
            refreshActiveChatsForChat(cliente_jid);

            // Emite evento de participantes atualizados
            emitChatParticipantsUpdate(cliente_jid);
          }
        );
      }
    );
  });

  // ==============================================================================
  // 👥 EVENTOS DO CHAT INTERNO DA EQUIPE (CANAIS, DMS E CARDS DE ATENDIMENTO)
  // ==============================================================================

  // 1. Obter salas, canais e status dos operadores em tempo real
  socket.on('internal_get_rooms', ({ atendente_id }) => {
    syncTeamAttendants(() => {
      db.all(`SELECT * FROM tabela_chat_interno_salas ORDER BY tipo ASC, nome ASC`, [], (err, salas) => {
        if (err) return console.error('Erro ao buscar salas internas:', err.message);

        // Busca todos os atendentes cadastrados
        db.all(`SELECT id, nome, avatar, setor, manual_status FROM tabela_atendentes ORDER BY nome ASC`, [], (opErr, atendentes) => {
          // Busca atendimentos em andamento para calcular quem está 'atendendo'
          db.all(`SELECT atendente_id, COUNT(*) as total FROM tabela_atendimentos WHERE status = 'em_atendimento' GROUP BY atendente_id`, [], (atErr, atCounts) => {
            const atMap = {};
            (atCounts || []).forEach(r => { atMap[r.atendente_id] = r.total; });

            const connectedIds = new Set(Array.from(activeSockets.values()));

            const atendentesList = (atendentes || []).map(op => {
              const isOnline = connectedIds.has(op.id);
              const activeChatsCount = atMap[op.id] || 0;
              const manualStatus = op.manual_status || 'auto';
              let status = 'offline';
              if (manualStatus && manualStatus !== 'auto') {
                status = manualStatus;
              } else {
                if (isOnline) {
                  status = activeChatsCount > 0 ? 'atendendo' : 'online';
                } else {
                  status = 'offline';
                }
              }
              return {
                id: String(op.id),
                nome: op.nome,
                avatar: op.avatar || null,
                setor: op.setor || 'Geral',
                status,
                manual_status: manualStatus,
                active_chats: activeChatsCount
              };
            });

            // Busca a última mensagem de cada sala / DM para ordenar conversas por atividade recente
            db.all(
              `SELECT m.sala_id, m.texto, m.timestamp, m.remetente_id, m.remetente_nome, m.midia_tipo, m.midia_url, m.card_meta
               FROM tabela_chat_interno_mensagens m
               INNER JOIN (
                 SELECT sala_id, MAX(id) as max_id
                 FROM tabela_chat_interno_mensagens
                 WHERE apagado = 0 OR apagado IS NULL
                 GROUP BY sala_id
               ) latest ON m.id = latest.max_id`,
              [],
              (mErr, recentRows) => {
                const recentMap = {};
                (recentRows || []).forEach(r => {
                  recentMap[r.sala_id] = {
                    texto: r.texto,
                    timestamp: r.timestamp,
                    remetente_id: r.remetente_id,
                    remetente_nome: r.remetente_nome,
                    midia_tipo: r.midia_tipo,
                    midia_url: r.midia_url,
                    card_meta: r.card_meta
                  };
                });

                // Busca conversas particulares que foram encerradas/arquivadas pelo usuário
                db.all(
                  `SELECT sala_id, fechada_em FROM tabela_chat_interno_dm_status WHERE atendente_id = ?`,
                  [String(atendente_id || '')],
                  (dmStErr, dmStRows) => {
                    const closedMap = {};
                    (dmStRows || []).forEach(r => {
                      closedMap[r.sala_id] = r.fechada_em;
                    });

                    socket.emit('internal_rooms_data', {
                      salas: salas || [],
                      atendentes: atendentesList,
                      recent_messages: recentMap,
                      closed_dms: closedMap,
                      active_voice_rooms: getActiveVoiceSessionsSummary()
                    });
                  }
                );
              }
            );
          });
        });
      });
    });
  });

  // 2. Entrar em uma sala / canal / DM e carregar histórico
  socket.on('internal_join_room', ({ sala_id, atendente_id }) => {
    if (!sala_id) return;
    
    // Se for DM, garante que a sala exista no banco
    if (sala_id.startsWith('dm-') || sala_id.startsWith('dm_')) {
      const parts = sala_id.replace(/^dm[-_]/, '').split('_');
      const otherId = parts.find(id => id !== atendente_id) || parts[0];
      
      db.run(
        `INSERT OR IGNORE INTO tabela_chat_interno_salas (id, tipo, nome, icone, membros) VALUES (?, 'dm', ?, 'user', ?)`,
        [sala_id, `DM: ${otherId}`, JSON.stringify(parts)]
      );
    }

    socket.join(`internal_${sala_id}`);

    // Busca histórico da sala (últimas 80 mensagens)
    db.all(
      `SELECT * FROM tabela_chat_interno_mensagens WHERE sala_id = ? ORDER BY timestamp ASC LIMIT 80`,
      [sala_id],
      (err, rows) => {
        if (err) return console.error('Erro ao resgatar histórico interno:', err.message);
        socket.emit('internal_room_history', {
          sala_id,
          messages: rows || []
        });
      }
    );
  });

  // 2.5 Criar novo Grupo Personalizado ou Sala Privada da Equipe
  socket.on('internal_create_group', ({ nome, descricao, membros, tipo, atendente_id, atendente_nome }) => {
    if (!nome || !nome.trim()) return;
    const roomType = tipo === 'sala_privada' ? 'sala_privada' : 'grupo';
    const groupId = (roomType === 'sala_privada' ? 'voice_priv_' : 'group_') + Date.now();
    const groupName = nome.trim();
    const groupDesc = descricao ? descricao.trim() : (roomType === 'sala_privada' ? 'Sala de call exclusiva' : 'Grupo personalizado da equipe');
    const groupMembers = Array.isArray(membros) ? membros.map(String) : [];
    if (atendente_id && !groupMembers.includes(String(atendente_id))) {
      groupMembers.push(String(atendente_id));
    }

    db.run(
      `INSERT INTO tabela_chat_interno_salas (id, tipo, nome, icone, descricao, membros, criado_por_id, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [groupId, roomType, groupName, roomType === 'sala_privada' ? 'phone' : 'users', groupDesc, JSON.stringify(groupMembers), atendente_id, atendente_nome],
      function(err) {
        if (err) return console.error('Erro ao criar grupo/sala interna:', err.message);

        // Insere mensagem de boas-vindas do sistema
        db.run(
          `INSERT INTO tabela_chat_interno_mensagens (sala_id, remetente_id, remetente_nome, texto) VALUES (?, 'sistema', 'Sistema TicketFlow', ?)`,
          [groupId, `🎉 ${roomType === 'sala_privada' ? 'Sala de call' : 'Grupo'} "${groupName}" criado por ${atendente_nome || 'um usuário'}.`]
        );

        // Notifica todos os clientes
        io.emit('internal_group_created', {
          id: groupId,
          tipo: roomType,
          nome: groupName,
          icone: roomType === 'sala_privada' ? 'phone' : 'users',
          descricao: groupDesc,
          membros: JSON.stringify(groupMembers),
          criado_por_id: atendente_id,
          criado_por_nome: atendente_nome
        });
      }
    );
  });

  // 3. Enviar mensagem no Chat Interno (Texto, Áudio, Anexo ou Card)
  socket.on('internal_send_message', async ({ sala_id, remetente_id, remetente_nome, remetente_avatar, texto, midia_url, midia_tipo, card_meta, audio_base64, reply_to_id, reply_to_text, reply_to_sender }) => {
    if (!sala_id || (!texto && !midia_url && !card_meta && !audio_base64)) return;

    let finalMidiaUrl = midia_url || null;
    let finalMidiaTipo = midia_tipo || null;

    // Se houver áudio de voz gravado
    if (audio_base64) {
      const matches = audio_base64.match(/^data:(audio\/[a-zA-Z0-9\-]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const ext = mimeType.includes('ogg') ? '.ogg' : (mimeType.includes('mp4') || mimeType.includes('m4a')) ? '.m4a' : mimeType.includes('webm') ? '.webm' : '.ogg';
        const filename = 'internal-voice-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
        const filepath = path.join(uploadDir, filename);
        try {
          fs.writeFileSync(filepath, base64Data, 'base64');
          finalMidiaUrl = `/uploads/${filename}`;
          finalMidiaTipo = 'audio';
        } catch (e) {
          console.error('Erro ao salvar áudio do chat interno:', e.message);
        }
      }
    }

    const cardMetaStr = card_meta ? (typeof card_meta === 'string' ? card_meta : JSON.stringify(card_meta)) : null;

    db.run(
      `INSERT INTO tabela_chat_interno_mensagens (sala_id, remetente_id, remetente_nome, remetente_avatar, texto, midia_url, midia_tipo, card_meta, reply_to_id, reply_to_text, reply_to_sender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sala_id, remetente_id, remetente_nome, remetente_avatar || null, texto || '', finalMidiaUrl, finalMidiaTipo, cardMetaStr, reply_to_id || null, reply_to_text || null, reply_to_sender || null],
      function (err) {
        if (err) return console.error('Erro ao salvar mensagem interna:', err.message);

        const novaMsg = {
          id: this.lastID,
          sala_id,
          remetente_id,
          remetente_nome,
          remetente_avatar: remetente_avatar || null,
          texto: texto || '',
          midia_url: finalMidiaUrl,
          midia_tipo: finalMidiaTipo,
          card_meta: cardMetaStr,
          reply_to_id: reply_to_id || null,
          reply_to_text: reply_to_text || null,
          reply_to_sender: reply_to_sender || null,
          reacoes: null,
          apagado: 0,
          timestamp: new Date().toISOString()
        };

        // Envia para todos conectados na sala
        io.to(`internal_${sala_id}`).emit('internal_new_message', novaMsg);

        // Notificação global com som e badge para todos os outros atendentes
        io.emit('internal_message_alert', {
          sala_id,
          remetente_id,
          remetente_nome,
          texto: texto || (finalMidiaTipo === 'audio' ? '🎙️ Mensagem de voz' : (cardMetaStr ? '🔗 Atendimento compartilhado' : '📎 Anexo'))
        });
      }
    );
  });

  // 3.5. Excluir Mensagem Interna
  socket.on('internal_delete_message', ({ message_id, sala_id, atendente_id }) => {
    if (!message_id) return;
    db.run(
      `UPDATE tabela_chat_interno_mensagens SET apagado = 1, texto = '🚫 Esta mensagem foi apagada', midia_url = NULL, card_meta = NULL WHERE id = ?`,
      [message_id],
      (err) => {
        if (err) return console.error('Erro ao apagar mensagem interna:', err.message);
        io.to(`internal_${sala_id}`).emit('internal_message_deleted', {
          message_id,
          sala_id
        });
      }
    );
  });

  // 4. Compartilhar Atendimento / Ticket diretamente no Chat Interno
  socket.on('internal_share_chat', ({ target_sala_id, cliente_jid, atendente_id, atendente_nome, comentario }) => {
    if (!target_sala_id || !cliente_jid) return;

    db.get(
      `SELECT a.*, (SELECT texto FROM tabela_mensagens WHERE cliente_jid = a.cliente_jid ORDER BY timestamp DESC LIMIT 1) as ultima_msg
       FROM tabela_atendimentos a WHERE a.cliente_jid = ?`,
      [cliente_jid],
      (err, clientRow) => {
        const clientName = clientRow ? (clientRow.cliente_nome || cliente_jid.split('@')[0]) : cliente_jid.split('@')[0];
        const clientAvatar = clientRow ? clientRow.cliente_avatar : null;
        const clientPhone = cliente_jid.split('@')[0];
        const lastMsg = clientRow ? clientRow.ultima_msg : '';

        const cardMeta = {
          tipo: 'whatsapp_chat',
          cliente_jid,
          cliente_nome: clientName,
          cliente_avatar: clientAvatar,
          cliente_telefone: clientPhone,
          resumo: lastMsg || 'Atendimento em andamento',
          compartilhado_por: atendente_nome || atendente_id,
          timestamp: new Date().toISOString()
        };

        const msgTexto = comentario ? comentario : `Compartilhou o atendimento de *${clientName}* com a equipe.`;

        db.run(
          `INSERT INTO tabela_chat_interno_mensagens (sala_id, remetente_id, remetente_nome, texto, card_meta) VALUES (?, ?, ?, ?, ?)`,
          [target_sala_id, atendente_id, atendente_nome || 'Atendente', msgTexto, JSON.stringify(cardMeta)],
          function (insertErr) {
            if (insertErr) return console.error('Erro ao compartilhar atendimento no chat interno:', insertErr.message);

            const novaMsg = {
              id: this.lastID,
              sala_id: target_sala_id,
              remetente_id: atendente_id,
              remetente_nome: atendente_nome || 'Atendente',
              remetente_avatar: null,
              texto: msgTexto,
              midia_url: null,
              midia_tipo: null,
              card_meta: JSON.stringify(cardMeta),
              reacoes: null,
              timestamp: new Date().toISOString()
            };

            io.to(`internal_${target_sala_id}`).emit('internal_new_message', novaMsg);
            io.emit('internal_message_alert', {
              sala_id: target_sala_id,
              remetente_id: atendente_id,
              remetente_nome: atendente_nome || 'Atendente',
              texto: `🔗 ${msgTexto}`
            });
          }
        );
      }
    );
  });

  // 5. Reagir a Mensagem Interna
  socket.on('internal_react_message', ({ message_id, sala_id, reacao, atendente_id }) => {
    if (!message_id || !reacao) return;

    db.get(`SELECT reacoes FROM tabela_chat_interno_mensagens WHERE id = ?`, [message_id], (err, row) => {
      if (err || !row) return;

      let reacoesObj = {};
      try {
        if (row.reacoes) reacoesObj = JSON.parse(row.reacoes);
      } catch (e) {}

      if (!reacoesObj[reacao]) reacoesObj[reacao] = [];
      const userIdx = reacoesObj[reacao].indexOf(atendente_id);
      if (userIdx !== -1) {
        reacoesObj[reacao].splice(userIdx, 1);
        if (reacoesObj[reacao].length === 0) delete reacoesObj[reacao];
      } else {
        reacoesObj[reacao].push(atendente_id);
      }

      const updatedStr = Object.keys(reacoesObj).length > 0 ? JSON.stringify(reacoesObj) : null;

      db.run(`UPDATE tabela_chat_interno_mensagens SET reacoes = ? WHERE id = ?`, [updatedStr, message_id], () => {
        io.to(`internal_${sala_id}`).emit('internal_message_reacted', {
          message_id,
          sala_id,
          reacoes: updatedStr
        });
      });
    });
  });

  // 6e. ALTERAR STATUS MANUAL DO ATENDENTE NO CHAT INTERNO
  socket.on('internal_set_status', ({ atendente_id, status }) => {
    if (!atendente_id) return;
    const cleanStatus = ['online', 'atendendo', 'ocupado', 'ausente', 'offline', 'auto'].includes(status) ? status : 'auto';

    db.run(`UPDATE tabela_atendentes SET manual_status = ? WHERE id = ?`, [cleanStatus, String(atendente_id)], () => {
      refreshOperatorDynamicStatus(atendente_id);
    });
  });

  // 6f. ENCERRAR CONVERSA PARTICULAR
  socket.on('internal_close_dm', ({ atendente_id, sala_id }) => {
    if (!atendente_id || !sala_id) return;
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO tabela_chat_interno_dm_status (atendente_id, sala_id, fechada_em)
       VALUES (?, ?, ?)
       ON CONFLICT(atendente_id, sala_id) DO UPDATE SET fechada_em = excluded.fechada_em`,
      [String(atendente_id), sala_id, now],
      () => {
        socket.emit('internal_dm_status_updated', {
          sala_id,
          fechada_em: now
        });
      }
    );
  });

  // ==============================================================================
  // 🎙️ SISTEMA DE BATE-PAPO E CHAMADAS DE VOZ (WebRTC Full Mesh)
  // ==============================================================================

  // 1. Iniciar Chamada 1x1, em Grupo ou Sala de Voz
  socket.on('voice_start_call', ({ session_id, target_id, target_type, title, caller_id, caller_name, caller_avatar }) => {
    if (!session_id || !caller_id) return;

    let isNewSession = false;
    let session = activeVoiceSessions.get(session_id);
    if (!session) {
      isNewSession = true;
      session = {
        id: session_id,
        title: title || 'Chamada de Voz',
        type: target_type || 'direct',
        roomId: `voice_room_${session_id}`,
        initiatorId: String(caller_id),
        initiatorName: caller_name || 'Colega',
        createdAt: new Date(),
        participants: new Map()
      };
      activeVoiceSessions.set(session_id, session);
    }

    socket.join(session.roomId);
    const newParticipant = {
      socketId: socket.id,
      operatorId: String(caller_id),
      operatorName: caller_name || 'Colega',
      avatar: caller_avatar || null,
      isMuted: false,
      isSpeaking: false
    };
    session.participants.set(socket.id, newParticipant);

    const participantsArray = Array.from(session.participants.values());

    // Se já havia pessoas na sala, notifica sobre o novo participante
    if (!isNewSession && participantsArray.length > 1) {
      io.to(session.roomId).emit('voice_user_joined', {
        session_id,
        newParticipant,
        participants: participantsArray
      });
    }

    // Se for chamada direta 1x1
    if (target_type === 'direct' && target_id) {
      io.to(String(target_id)).emit('voice_incoming_call', {
        session_id,
        title: title || `Chamada de ${caller_name}`,
        type: 'direct',
        caller_id: String(caller_id),
        caller_name: caller_name || 'Colega',
        caller_avatar: caller_avatar || null,
        participantsCount: 1
      });
    } else if (target_type === 'group' && target_id) {
      // Se for chamada em grupo
      db.get(`SELECT membros FROM tabela_chat_interno_salas WHERE id = ?`, [target_id], (err, row) => {
        let membros = [];
        try { if (row && row.membros) membros = JSON.parse(row.membros); } catch (e) {}
        membros.forEach(mId => {
          if (String(mId) !== String(caller_id)) {
            io.to(String(mId)).emit('voice_incoming_call', {
              session_id,
              title: title || 'Chamada em Grupo',
              type: 'group',
              caller_id: String(caller_id),
              caller_name: caller_name || 'Colega',
              caller_avatar: caller_avatar || null,
              participantsCount: participantsArray.length
            });
          }
        });
      });
    }

    socket.emit('voice_session_updated', {
      session_id,
      title: session.title,
      type: session.type,
      participants: participantsArray
    });

    broadcastVoiceRoomsStatus();
  });

  // 2. Aceitar Chamada / Entrar na Sessão de Voz
  socket.on('voice_accept_call', ({ session_id, operator_id, operator_name, avatar }) => {
    if (!session_id || !operator_id) return;
    const session = activeVoiceSessions.get(session_id);
    if (!session) {
      socket.emit('voice_error', { message: 'A chamada não está mais ativa.' });
      return;
    }

    socket.join(session.roomId);
    const newParticipant = {
      socketId: socket.id,
      operatorId: String(operator_id),
      operatorName: operator_name || 'Colega',
      avatar: avatar || null,
      isMuted: false,
      isSpeaking: false
    };
    session.participants.set(socket.id, newParticipant);

    const participantsArray = Array.from(session.participants.values());

    // Informa os outros membros sobre o novo participante
    io.to(session.roomId).emit('voice_user_joined', {
      session_id,
      newParticipant,
      participants: participantsArray
    });

    io.to(session.roomId).emit('voice_session_updated', {
      session_id,
      title: session.title,
      type: session.type,
      participants: participantsArray
    });

    broadcastVoiceRoomsStatus();
  });

  // 3. Recusar Chamada
  socket.on('voice_reject_call', ({ session_id, operator_id, operator_name, reason }) => {
    if (!session_id) return;
    const session = activeVoiceSessions.get(session_id);
    if (session) {
      io.to(session.roomId).emit('voice_call_rejected', {
        session_id,
        operator_id: String(operator_id),
        operator_name,
        reason: reason || 'declined'
      });
      if (session.type === 'direct' && session.participants.size <= 1) {
        io.to(session.roomId).emit('voice_call_ended', { session_id, reason: 'recusada' });
        activeVoiceSessions.delete(session_id);
      }
    }
  });

  // 4. Escalonar Chamada (Adicionar participante à chamada 1x1 ou grupo ativo sem desligar)
  socket.on('voice_invite_user', ({ session_id, target_operator_id, inviter_name }) => {
    if (!session_id || !target_operator_id) return;
    const session = activeVoiceSessions.get(session_id);
    if (!session) return;

    session.type = 'group'; // Escala para grupo automaticamente
    const participantsArray = Array.from(session.participants.values());

    io.to(String(target_operator_id)).emit('voice_incoming_call', {
      session_id,
      title: session.title || 'Chamada em Grupo',
      type: 'group',
      caller_id: String(session.initiatorId),
      caller_name: inviter_name || session.initiatorName,
      is_escalated: true,
      participantsCount: participantsArray.length
    });

    io.to(session.roomId).emit('voice_session_updated', {
      session_id,
      title: session.title,
      type: 'group',
      participants: participantsArray
    });
  });

  // 5. Sinalização WebRTC (SDP Offer, Answer e ICE Candidate)
  socket.on('voice_signal', ({ toSocketId, session_id, signal, fromOperatorId, fromOperatorName }) => {
    if (!toSocketId || !signal) return;
    io.to(toSocketId).emit('voice_signal', {
      fromSocketId: socket.id,
      session_id,
      signal,
      fromOperatorId,
      fromOperatorName
    });
  });

  // 6. Transmitir Atividade de Voz (Quem está falando)
  socket.on('voice_speaking_state', ({ session_id, isSpeaking }) => {
    if (!session_id) return;
    const session = activeVoiceSessions.get(session_id);
    if (session) {
      const p = session.participants.get(socket.id);
      if (p) p.isSpeaking = !!isSpeaking;
      socket.to(session.roomId).emit('voice_speaking_state', {
        session_id,
        socketId: socket.id,
        operatorId: p ? p.operatorId : null,
        isSpeaking: !!isSpeaking
      });
    }
  });

  // 7. Transmitir Estado de Microfone Mutado
  socket.on('voice_mute_state', ({ session_id, isMuted }) => {
    if (!session_id) return;
    const session = activeVoiceSessions.get(session_id);
    if (session) {
      const p = session.participants.get(socket.id);
      if (p) p.isMuted = !!isMuted;
      io.to(session.roomId).emit('voice_mute_state', {
        session_id,
        socketId: socket.id,
        operatorId: p ? p.operatorId : null,
        isMuted: !!isMuted
      });
    }
  });

  // 8. Sair da Chamada de Voz
  socket.on('voice_leave_call', ({ session_id }) => {
    handleLeaveVoiceSession(socket, session_id);
  });

  // 9. Desconexão de socket
  socket.on('disconnect', () => {
    const atendenteId = activeSockets.get(socket.id);
    activeSockets.delete(socket.id);
    console.log(`🔌 Conexão WebSocket encerrada: Socket ID ${socket.id} (Atendente: ${atendenteId || 'Não registrado'})`);

    // Limpa o operador de quaisquer sessões de voz ativas
    activeVoiceSessions.forEach((session, sId) => {
      if (session.participants.has(socket.id)) {
        handleLeaveVoiceSession(socket, sId);
      }
    });

    if (atendenteId) {
      const stillConnected = Array.from(activeSockets.values()).includes(String(atendenteId));
      if (!stillConnected) {
        db.get(`SELECT manual_status FROM tabela_atendentes WHERE id = ?`, [atendenteId], (err, row) => {
          const manual = row ? row.manual_status : 'auto';
          if (manual && manual !== 'auto' && manual !== 'online') {
            io.emit('internal_operator_status_changed', { atendente_id: String(atendenteId), status: manual, manual_status: manual });
          } else {
            io.emit('internal_operator_status_changed', { atendente_id: String(atendenteId), status: 'offline', manual_status: manual || 'auto' });
          }
        });
      }
    }
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

// Envia mensagem do bot (com simulação de digitação humana e proteções anti-ban)
async function sendBotMessage(clienteJid, texto) {
  console.log(`🤖 [BOT -> ${clienteJid}]: "${texto}"`);
  
  if (whatsappStatus === 'pronto') {
    try {
      // 1. Simulação de Presença Humana: Visualizar e Digitar
      try {
        const chat = await wwebClient.getChatById(clienteJid);
        if (chat) {
          // Marca mensagem anterior como lida
          try { await chat.sendSeen(); } catch (_) {}
          // Ativa status "digitando..."
          try { await chat.sendStateTyping(); } catch (_) {}
        }
      } catch (presenceErr) {
        // Ignora silenciosamente se o chat ainda não foi indexado
      }

      // 2. Intervalo Orgânico de Digitação Humana (Anti-ban)
      // Delay proporcional ao tamanho do texto + jitter aleatório (entre 1.2s e 3.8s)
      const textLength = (texto || '').length;
      const charDelay = Math.min(textLength * 28, 2400);
      const randomJitter = Math.floor(Math.random() * 600) + 800;
      const totalDelay = Math.min(charDelay + randomJitter, 4000);

      await new Promise(resolve => setTimeout(resolve, totalDelay));

      // Limpa status de digitação antes de enviar
      try {
        const chat = await wwebClient.getChatById(clienteJid);
        if (chat) await chat.clearState();
      } catch (_) {}

      // 3. Envio da mensagem de fato
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
  // Se houver uma pesquisa de avaliação pendente para este cliente (mesmo que o atendimento já esteja FINALIZADO)
  if (global._botRatingPending && global._botRatingPending[clienteJid]) {
    const ratingConfig = global._botRatingPending[clienteJid];
    if (ratingConfig.timeoutHandle) clearTimeout(ratingConfig.timeoutHandle);
    delete global._botRatingPending[clienteJid];

    const trimmed = (texto || '').trim();
    let ratingNote = null;
    const match = trimmed.match(/\b([1-5])\b/);
    if (match) {
      ratingNote = match[1];
    } else if (trimmed.includes('⭐') || trimmed.includes('★')) {
      const starCount = (trimmed.match(/⭐|★/g) || []).length;
      if (starCount >= 1 && starCount <= 5) ratingNote = String(starCount);
    }

    console.log(`⭐ [AVALIAÇÃO RECEBIDA] de [${clienteJid}]: "${texto}" (Nota: ${ratingNote || 'Registrada'})`);

    // Salva a mensagem do cliente no histórico do atendimento já finalizado
    db.run(
      `INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'cliente', ?)`,
      [clienteJid, texto],
      () => {
        const thanksMsg = ratingConfig.ratingThanksMessage || "Obrigado pela sua avaliação! Tenha um ótimo dia.";
        sendBotMessage(clienteJid, thanksMsg).finally(() => {
          const sysText = ratingNote 
            ? `Avaliação do cliente registrada com sucesso (Nota: ${ratingNote} ⭐).` 
            : `Resposta de avaliação do cliente registrada no histórico.`;
          db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', ?)`, [clienteJid, sysText]);
        });
      }
    );
    return;
  }

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

        // Marca como não lida no banco de dados e atualiza a lista de todos os participantes
        db.run(
          `UPDATE tabela_atendimentos SET unread = 1 WHERE cliente_jid = ?`,
          [clienteJid],
          (updateErr) => {
            if (updateErr) console.error('Erro ao atualizar status unread:', updateErr.message);
            refreshActiveChatsForChat(clienteJid);
            if (atendenteId) sendActiveChats(atendenteId);
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
            emitToChatRooms(clienteJid, 'new_message', novaMsg);
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

  // Se o nó atual for Tempo de Espera (delay) e o cliente enviou uma mensagem
  if (currentNode.type === 'delay' || currentNode.type === 'wait') {
    if (global._botDelayTimeouts && global._botDelayTimeouts[row.cliente_jid]) {
      clearTimeout(global._botDelayTimeouts[row.cliente_jid]);
      delete global._botDelayTimeouts[row.cliente_jid];
    }

    console.log(`[BOT] Cliente enviou mensagem durante o tempo de espera [${row.cliente_jid}]`);
    const replyEdge = edges.find(e => e.source === currentNode.id && (e.sourceHandle === 'reply' || !e.sourceHandle));
    if (replyEdge) {
      const nextNode = nodes.find(n => n.id === replyEdge.target);
      if (nextNode) {
        db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [nextNode.id, row.cliente_jid]);
        executeNode(row, nextNode);
        return;
      }
    }
    moveToQueue(row);
    return;
  }

  // Outros nós, executa e avança
  executeNode(row, currentNode, texto);
}

// Execução recursiva de nós imediatos (com proteção de profundidade e cadência orgânica)
async function executeNode(row, node, texto, depth = 0) {
  if (depth > 12) {
    console.warn(`🛑 [BOT] Limite de profundidade de execução atingido (${depth}). Evitando loop infinito.`);
    moveToQueue(row);
    return;
  }

  const channel = getChannelConfig();
  if (!channel || !channel.bot_flow) return;
  const { nodes, edges } = channel.bot_flow;

  if (node.type === 'message') {
    await sendBotMessage(row.cliente_jid, node.data.text);
    
    // Avança para o próximo com cadência humana
    const edge = edges.find(e => e.source === node.id);
    if (edge) {
      const nextNode = nodes.find(n => n.id === edge.target);
      if (nextNode) {
        // Pausa natural de 1.2s a 2.0s entre blocos automáticos consecutivos
        await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 800)));
        db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [nextNode.id, row.cliente_jid]);
        executeNode(row, nextNode, texto, depth + 1);
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

  else if (node.type === 'delay' || node.type === 'wait') {
    const unit = node.data && node.data.delayUnit === 'minutes' ? 'minutes' : 'seconds';
    const val = parseInt(node.data && (node.data.delayValue || node.data.delaySeconds)) || 3;
    const totalSec = Math.min(Math.max(unit === 'minutes' ? val * 60 : val, 1), 86400); // até 24h
    
    console.log(`[BOT] Iniciando tempo de espera de ${totalSec}s (${val} ${unit}) para [${row.cliente_jid}]`);
    
    db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [node.id, row.cliente_jid]);

    if (!global._botDelayTimeouts) global._botDelayTimeouts = {};
    if (global._botDelayTimeouts[row.cliente_jid]) {
      clearTimeout(global._botDelayTimeouts[row.cliente_jid]);
    }

    global._botDelayTimeouts[row.cliente_jid] = setTimeout(() => {
      delete global._botDelayTimeouts[row.cliente_jid];
      
      // Verifica se o atendimento ainda está no mesmo nó do bot
      db.get(`SELECT bot_node_id, status FROM tabela_atendimentos WHERE cliente_jid = ?`, [row.cliente_jid], (err, currentAtendimento) => {
        if (!err && currentAtendimento && currentAtendimento.status === 'bot' && currentAtendimento.bot_node_id === node.id) {
          console.log(`[BOT] Tempo limite esgotado sem resposta (Timeout) para [${row.cliente_jid}]`);
          const timeoutEdge = edges.find(e => e.source === node.id && (e.sourceHandle === 'timeout' || !e.sourceHandle));
          if (timeoutEdge) {
            const nextNode = nodes.find(n => n.id === timeoutEdge.target);
            if (nextNode) {
              db.run(`UPDATE tabela_atendimentos SET bot_node_id = ? WHERE cliente_jid = ?`, [nextNode.id, row.cliente_jid]);
              executeNode(row, nextNode);
              return;
            }
          }
          moveToQueue(row);
        }
      });
    }, totalSec * 1000);
  }

  else if (node.type === 'close' || node.type === 'finalize') {
    console.log(`[BOT] Finalizando atendimento imediatamente para [${row.cliente_jid}] e movendo ao histórico`);
    
    const runCloseFlow = async () => {
      try {
        if (node.data && node.data.text) {
          await sendBotMessage(row.cliente_jid, node.data.text);
        }

        // 1. Finaliza IMEDIATAMENTE no banco de dados para sair dos chats ativos e ir ao histórico
        db.run(
          `UPDATE tabela_atendimentos SET status = 'finalizado', atendente_id = NULL, bot_node_id = NULL WHERE cliente_jid = ?`,
          [row.cliente_jid],
          async () => {
            db.run(`INSERT INTO tabela_mensagens (cliente_jid, remetente, texto) VALUES (?, 'sistema', 'Atendimento finalizado pelo assistente virtual.')`, [row.cliente_jid]);
            broadcastBotList();
            broadcastQueue();

            // 2. Se houver pesquisa de avaliação, dispara mensagem e mantém captura atrelada ao histórico
            if (node.data && node.data.requestRating) {
              await new Promise(r => setTimeout(r, 600));
              if (node.data.ratingMessage) {
                await sendBotMessage(row.cliente_jid, node.data.ratingMessage);
              }

              const timeoutMin = Math.min(Math.max(parseInt(node.data.ratingTimeoutMinutes) || 5, 1), 15);
              console.log(`[BOT] Pesquisa enviada. Aguardando avaliação por até ${timeoutMin} min para [${row.cliente_jid}] (Vinculado ao histórico)`);

              if (!global._botRatingPending) global._botRatingPending = {};
              if (global._botRatingPending[row.cliente_jid]?.timeoutHandle) {
                clearTimeout(global._botRatingPending[row.cliente_jid].timeoutHandle);
              }

              const timer = setTimeout(() => {
                console.log(`[BOT] Prazo de avaliação (${timeoutMin} min) expirado para [${row.cliente_jid}].`);
                delete global._botRatingPending[row.cliente_jid];
              }, timeoutMin * 60 * 1000);

              global._botRatingPending[row.cliente_jid] = {
                ratingThanksMessage: node.data.ratingThanksMessage || 'Obrigado pela sua avaliação! Tenha um ótimo dia.',
                timeoutHandle: timer
              };
            }
          }
        );
      } catch (e) {
        console.error('Erro ao processar fechamento do bot:', e);
      }
    };

    runCloseFlow();
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

// Retorna todos os IDs de atendentes associados a uma conversa (responsável principal + participantes adicionais)
async function getChatParticipantIds(clienteJid) {
  return new Promise((resolve) => {
    db.get(`SELECT atendente_id FROM tabela_atendimentos WHERE cliente_jid = ?`, [clienteJid], (err, row) => {
      const ids = new Set();
      if (!err && row && row.atendente_id) {
        ids.add(row.atendente_id);
      }
      db.all(`SELECT atendente_id FROM tabela_atendimento_participantes WHERE cliente_jid = ?`, [clienteJid], (pErr, rows) => {
        if (!pErr && rows) {
          rows.forEach(r => {
            if (r.atendente_id) ids.add(r.atendente_id);
          });
        }
        resolve(Array.from(ids));
      });
    });
  });
}

// Emite um evento para todos os atendentes que participam da conversa
async function emitToChatRooms(clienteJid, eventName, data) {
  const attendantIds = await getChatParticipantIds(clienteJid);
  attendantIds.forEach(attId => {
    io.to(attId).emit(eventName, data);
  });
}

// Atualiza a lista de conversas ativas para todos os participantes da conversa
async function refreshActiveChatsForChat(clienteJid) {
  const attendantIds = await getChatParticipantIds(clienteJid);
  attendantIds.forEach(attId => {
    sendActiveChats(attId);
  });
}

// Emite dados completos e atualizados de participantes da conversa
function emitChatParticipantsUpdate(clienteJid) {
  db.get(
    `SELECT a.atendente_id, at.nome as atendente_nome 
     FROM tabela_atendimentos a
     LEFT JOIN tabela_atendentes at ON at.id = a.atendente_id
     WHERE a.cliente_jid = ?`,
    [clienteJid],
    (err, mainRow) => {
      db.all(
        `SELECT p.*, at.nome as atendente_nome 
         FROM tabela_atendimento_participantes p
         LEFT JOIN tabela_atendentes at ON at.id = p.atendente_id
         WHERE p.cliente_jid = ?
         ORDER BY p.created_at ASC`,
        [clienteJid],
        (pErr, participantRows) => {
          db.all(`SELECT id, nome FROM tabela_atendentes ORDER BY nome ASC`, [], (aErr, allAttendants) => {
            const primaryId = mainRow ? mainRow.atendente_id : null;
            const existingParticipantIds = new Set((participantRows || []).map(p => p.atendente_id));
            if (primaryId) existingParticipantIds.add(primaryId);
            const available = (allAttendants || []).filter(u => !existingParticipantIds.has(u.id));

            const payload = {
              cliente_jid: clienteJid,
              primary: mainRow ? { id: mainRow.atendente_id, nome: mainRow.atendente_nome || mainRow.atendente_id } : null,
              participants: (participantRows || []).map(p => ({
                id: p.id,
                atendente_id: p.atendente_id,
                atendente_nome: p.atendente_nome || p.atendente_id,
                adicionado_por: p.adicionado_por,
                created_at: p.created_at
              })),
              available_attendants: available
            };

            // Notifica primary e participantes
            emitToChatRooms(clienteJid, 'chat_participants_data', payload);
          });
        }
      );
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

  // Conversas Ativas do atendente (incluindo onde é participante adicional)
  db.all(
    `SELECT DISTINCT a.*,
       (CASE WHEN a.atendente_id = ? THEN 0 ELSE 1 END) as is_co_attendant,
       p_main.nome as atendente_principal_nome,
       (SELECT COUNT(*) FROM tabela_atendimento_participantes p WHERE p.cliente_jid = a.cliente_jid) as participantes_count
     FROM tabela_atendimentos a
     LEFT JOIN tabela_atendentes p_main ON p_main.id = a.atendente_id
     WHERE a.status = 'em_atendimento' 
       AND (a.atendente_id = ? OR a.cliente_jid IN (SELECT cliente_jid FROM tabela_atendimento_participantes WHERE atendente_id = ?))
     ORDER BY a.id ASC`,
    [atendenteId, atendenteId, atendenteId],
    (err, activeRows) => {
      if (!err) socket.emit('active_chats_list', activeRows || []);
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
  if (!atendenteId) return;
  db.all(
    `SELECT DISTINCT a.*,
       (CASE WHEN a.atendente_id = ? THEN 0 ELSE 1 END) as is_co_attendant,
       p_main.nome as atendente_principal_nome,
       (SELECT COUNT(*) FROM tabela_atendimento_participantes p WHERE p.cliente_jid = a.cliente_jid) as participantes_count
     FROM tabela_atendimentos a
     LEFT JOIN tabela_atendentes p_main ON p_main.id = a.atendente_id
     WHERE a.status = 'em_atendimento' 
       AND (a.atendente_id = ? OR a.cliente_jid IN (SELECT cliente_jid FROM tabela_atendimento_participantes WHERE atendente_id = ?))
     ORDER BY a.id ASC`,
    [atendenteId, atendenteId, atendenteId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao ler chats ativos:', err.message);
        return;
      }
      // Envia apenas para os sockets na sala daquele atendente
      io.to(atendenteId).emit('active_chats_list', rows || []);

      // Atualiza o status dinâmico do atendente em tempo real
      refreshOperatorDynamicStatus(atendenteId, (rows || []).length);
    }
  );
}

// Atualiza e transmite o status dinâmico do operador para toda a equipe
function refreshOperatorDynamicStatus(atendenteId, activeCountOverride) {
  if (!atendenteId) return;
  const opIdStr = String(atendenteId);
  db.get(`SELECT manual_status FROM tabela_atendentes WHERE id = ?`, [opIdStr], (err, opRow) => {
    const manual = opRow ? opRow.manual_status : 'auto';

    const countPromise = (typeof activeCountOverride === 'number')
      ? Promise.resolve(activeCountOverride)
      : new Promise((resolve) => {
          db.get(
            `SELECT COUNT(*) as total FROM tabela_atendimentos 
             WHERE status = 'em_atendimento' 
               AND (atendente_id = ? OR cliente_jid IN (SELECT cliente_jid FROM tabela_atendimento_participantes WHERE atendente_id = ?))`,
            [opIdStr, opIdStr],
            (cntErr, r) => resolve(r ? r.total : 0)
          );
        });

    countPromise.then(activeChatsCount => {
      const isOnline = Array.from(activeSockets.values()).map(String).includes(opIdStr);
      let effectiveStatus = 'offline';
      if (manual && manual !== 'auto') {
        effectiveStatus = manual;
      } else {
        if (isOnline) {
          effectiveStatus = activeChatsCount > 0 ? 'atendendo' : 'online';
        } else {
          effectiveStatus = 'offline';
        }
      }

      io.emit('internal_operator_status_changed', {
        atendente_id: opIdStr,
        status: effectiveStatus,
        manual_status: manual || 'auto',
        active_chats: activeChatsCount
      });
    });
  });
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
