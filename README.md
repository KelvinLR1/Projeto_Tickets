# 🎫 Antigravity Ticket System
### Gestão Inteligente de Chamados 100% Offline e Local

O **Antigravity Ticket System** é uma plataforma state-of-the-art para gestão de suporte técnico e base de conhecimento. Projetado para operar com máxima privacidade em redes locais (LAN), o sistema integra inteligência artificial distribuída (RAG) para acelerar a resolução de problemas sem depender da nuvem.

---

## ✨ Principais Funcionalidades

### 📋 Gestão de Tickets de Alta Performance
- **Ciclo de Vida Dinâmico:** Novo sistema de **Status Customizáveis** com cores e comportamentos configuráveis.
- **Conteúdo Rico Inline:** Suporte direto para imagens, vídeos e anexos de qualquer tipo (Excel, PDF, Executáveis).
- **Controle de Tempo:** Log de atividades com cronômetro integrado por técnico e por chamado.

### 🧠 Inteligência Artificial (RAG)
- **Busca Vetorial Nativa:** Integração com **ChromaDB** para encontrar soluções em segundos.
- **Treinamento Contínuo:** O sistema aprende com cada ticket resolvido, alimentando a base de conhecimento local.
- **Privacidade Total:** Processamento via **Ollama** executando modelos como Llama3 e Llava 100% offline.

### 🎨 Experiência de Usuário Premium
- **Aura Design:** Interface baseada em Glassmorphism, com desfoques realistas e micro-animações.
- **Dashboard Operacional:** Matriz de situação e métricas de desempenho (SLA, Taxa de Resolução) em tempo real.
- **Multitemas:** Temas exclusivos como *Cyberpunk, Matrix, Nordic, Gold* e o novo modo *OLED*.

---

## 🛠️ Estrutura Técnica

- **Frontend:** [Next.js 14+](https://nextjs.org/) (React, Tailwind CSS v4, Framer Motion).
- **Backend:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+) com suporte a **Windows Services**.
- **Banco de Dados:** SQLite (Portabilidade) ou PostgreSQL (Escalabilidade) via SQLAlchemy.
- **IA:** ChromaDB + [Ollama](https://ollama.com/) (Llama3/Llava).

---

## 🚀 Como Executar

### 0. Verificar Ambiente (Recomendado)
Antes de iniciar o projeto em uma nova máquina, verifique se todas as dependências estão presentes.

> [!IMPORTANT]
> **Ative o ambiente virtual (.venv)** antes de rodar a verificação para que o script detecte corretamente as bibliotecas instaladas:

```powershell
# Exemplo Windows
cd server
.venv\Scripts\activate
cd ..
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

## 🔄 Manutenção e Atualização

### Atualizando o Banco de Dados
Caso você baixe uma nova versão do projeto e encontre erros relacionados ao banco de dados (ex: "no such column"), execute o script de correção de esquema:

```bash
cd server
python fix_db_schema.py
```

Este script verifica e cria automaticamente as colunas e tabelas necessárias para a versão atual do sistema.

**Outros scripts úteis de migração:**
- `python migrate_ticket_meta.py` → Garante que a estrutura de metadados dos tickets está correta.
- `python migrate_sectors.py` → Sincroniza a estrutura de setores se houver mudanças.

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

## 🛠️ Scripts Auxiliares

Na raiz do projeto, você encontrará diversos scripts Python criados para auxiliar no desenvolvimento, manutenção e diagnóstico do sistema:

### 🔍 Diagnóstico e Ambiente
- `check_env.py`: **O mais importante.** Verifica o ambiente (Python, Node, Ollama), venv e integridade do banco de dados. *Lembre-se de rodar com o .venv ativo para verificar as bibliotecas.*
- `check_imports.py` & `diagnose.py`: Utilitários para validar se o sistema de módulos e imports está funcionando corretamente.
- `debug_server.py`: Ferramenta para testar a inicialização do backend isoladamente.

### 🗄️ Banco de Dados e Migração
- `migrate_db.py` & `fix_schema_comprehensive.py`: Scripts para atualizar o banco de dados conforme o sistema evolui (migrações).
- `backfill_status.py`: Converte tickets antigos para o novo sistema dinâmico de Status.
- `check_schema.py`, `check_db_v2.py`: Permitem inspecionar rapidamente as tabelas e colunas do SQLite.
- `list_users.py`: Lista todos os usuários cadastrados para conferência de acesso.

### 🧪 Testes e Demonstração
- `seed_demo_clients.py`: Popula automaticamente o sistema com clientes fictícios para demonstração.
- `test_create_ticket.py`, `test_create_simple.py`: Simulam a criação de chamados via API.
- `test_login_root.py`, `test_full_auth.py`: Validam o funcionamento do sistema de login e tokens JWT.
- `test_timer_*.py`: Testam as funcionalidades de cronômetro e log de tempo nos tickets.

### ✅ Verificação de Integridade
- `verify_backup.py`: Testa o motor de compressão e restauração do banco de dados.
- `verify_rbac_seed.py`: Garante que os perfis de acesso (RBAC) e permissões padrão foram semeados corretamente.
- `check_tickets_debug.py`: Gera um relatório em TXT (`debug_formatted.txt`) sobre a consistência dos tickets no banco.

---

## 📦 Guia do Desenvolvedor: Gerando o Instalador

Para criar o pacote de instalação `.exe` com serviços automatizados:

### 1. Pré-requisitos
- **Python 3.10+** (com PyInstaller instalado).
- **Node.js 20+**.
- **Inno Setup 6+** (para a geração final do .exe).

### 2. Preparação dos Binários
Abra o PowerShell como **Administrador** e execute o script de automação:

```powershell
# 1. Ajuste a permissão se necessário
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 2. Gere os binários e a estrutura portável
.\build_installer.ps1
```

Este script irá:
1. Compilar o Frontend Next.js.
2. Organizar as runtimes portáveis de Python e Node.
3. Gerar os serviços `TicketFlow_Backend_Service.exe` e `TicketFlow_Frontend_Service.exe`.
4. Criar o `TicketFlow.exe` (Launcher) e o novo `config_db.exe` (Configurador GUI).

### 3. Compilação Final (Inno Setup)
1. Abra o arquivo `installer.iss` no Inno Setup Compiler.
2. Pressione **F9** para compilar.
3. O instalador estará disponível em `installer_output/TicketFlow_Setup.exe`.

> [!IMPORTANT]
> Para mais detalhes sobre as opções de instalação (Servidor vs Estação), consulte o [**Guia de Instalação (INSTALLER.md)**](file:///c:/Code/Projeto_Tickets/INSTALLER.md).

---

*Desenvolvido com foco em privacidade, velocidade e experiência estética premium.*
