# Sistema de Tickets Offline com IA (LAN)

Sistema de gestão de tickets e base de conhecimento, operando 100% offline em rede local, com suporte a IA distribuída.

## Estrutura do Projeto
- `/server`: Backend em Python (FastAPI) + SQLite + ChromaDB.
- `/client`: Frontend em Next.js (React).

## Pré-requisitos
- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/) instalado em cada máquina cliente.

## Como Rodar

### 1. Backend (Servidor)
Abra o terminal na pasta raiz e execute:

```bash
cd server
# Ativar ambiente virtual
.venv\Scripts\activate
# Rodar servidor (acessível na rede)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

A API estará disponível em `http://localhost:8000` (ou IP da máquina).

### 2. Frontend (Cliente)
Abra outro terminal:

```bash
cd client
npm run dev
```

Acesse `http://localhost:3000`.

## IA Local (Ollama)
Certifique-se de ter os modelos baixados:

```bash
ollama pull llama3
ollama pull llava
```
