# 🎫 Antigravity Ticket System
### Gestão Inteligente de Chamados 100% Offline e Local

O **Antigravity Ticket System** é uma plataforma state-of-the-art para gestão de suporte técnico e base de conhecimento. Projetado para operar com máxima privacidade em redes locais (LAN), o sistema integra inteligência artificial distribuída (RAG) para acelerar a resolução de problemas sem depender da nuvem.

---

## ✨ Principais Funcionalidades

### 📋 Gestão de Tickets de Alta Performance
- **Ciclo de Vida Completo:** Criação, atribuição, transferência de setor e encerramento de chamados.
- **Conteúdo Rico Inline:** Suporte direto no texto para imagens, vídeos e anexos de qualquer tipo (Excel, PDF, Executáveis).
- **Ações Rápidas:** Interface otimizada para adicionar informações, transferir técnicos ou copiar links instantaneamente.

### 🧠 Base de Conhecimento com RAG
- **Busca Vetorial Inteligente:** Utilize o poder da IA (Chromadb) para buscar soluções em chamados passados e manuais técnicos.
- **Treinamento em Tempo Real:** Cada novo ticket resolvido alimenta automaticamente a inteligência do sistema.

### 🎨 Experiência de Usuário Premium
- **Design Glassmorphism:** Interface moderna com efeitos de vidro, desfoques e animações suaves.
- **Multitemas:** Suporte a diversos temas (Cyberpunk, Matrix, Nordic, Gold, entre outros).
- **Timeline de Alterações:** Rastreabilidade completa e localizada (PT-BR) de cada ação tomada no chamado.

### 📊 Relatórios e Dashboard
- **Insights em Tempo Real:** Estatísticas detalhadas sobre volume de tickets, categorias e desempenho da equipe.
- **Monitoramento de SLA:** Acompanhamento visual de prioridades e estados críticos.

---

## 🛠️ Estrutura Técnica

- **Frontend:** [Next.js 14+](https://nextjs.org/) (React, Tailwind CSS v4, Lucide Icons).
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+).
- **Banco de Dados:** SQLite (Relacional) + SQLAlchemy ORM.
- **IA/Vetorial:** ChromaDB + [Ollama](https://ollama.com/) (Llama3/Llava).

---

## 🚀 Como Executar

### 0. Verificar Ambiente (Recomendado)
Antes de iniciar o projeto em uma nova máquina, verifique se todas as dependências estão presentes:

```bash
python check_env.py
```

> **Dica:** Ao iniciar em uma nova máquina, o sistema criará automaticamente um usuário administrador padrão:
> - **Usuário:** `admin`
> - **Senha:** `admin`

---

### 1. Backend (Servidor)
Acesse a pasta `server`, crie o ambiente virtual e instale as dependências:

```bash
cd server
# Criar ambiente virtual (se não existir) - primeira vez
python -m venv .venv
# Ativar
.venv\Scripts\activate
# Instalar dependências - primeira vez
pip install -r requirements.txt
# Rodar servidor
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```
> O backend estará disponível em: `http://localhost:8080`

### 2. Frontend (Cliente)
Acesse a pasta `client` e instale as dependências do Node:

```bash
cd client
# Instalar dependências - primeira vez
npm install
# Iniciar ambiente de desenvolvimento
npm run dev
```
> Acesse a interface em: `http://localhost:3000`

---

## 📖 Documentação da API

O backend (FastAPI) gera automaticamente documentações interativas que permitem testar os endpoints:

- **Swagger UI (Interativo):** [http://localhost:8080/docs](http://localhost:8080/docs) - Recomendado para testes rápidos.
- **ReDoc:** [http://localhost:8080/redoc](http://localhost:8080/redoc) - Documentação mais limpa e organizada para leitura.

---

## 🛑 Comandos Úteis

- **Parar Serviços:** `Ctrl + C` em qualquer terminal.
- **Desativar venv:** `deactivate` no terminal do servidor.
- **Atualizar Modelos de IA:**
  ```bash
  ollama pull llama3
  ollama pull llava
  ```

---

## 📁 Estrutura de Pastas
```text
/client   -> Código fonte do frontend Next.js
/server   -> API FastAPI, lógica CRUD e IA
  /uploads -> Armazenamento local de anexos e imagens
  /brain   -> Artefatos de planejamento e evolução
```

---
*Desenvolvido com foco em privacidade, velocidade e experiência estética premium.*
