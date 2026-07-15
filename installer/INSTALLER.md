# 📦 Guia Completo do Instalador (Windows)

Este documento detalha o processo de geração do instalador para desenvolvedores e explica as opções de instalação para os usuários finais.

---

## 🏗️ Parte 1: Para o Desenvolvedor (Geração do .exe)

O TicketFlow utiliza uma arquitetura portável. O instalador final agrupa o Backend (Python), Frontend (Next.js) e as runtimes necessárias sem exigir que o cliente instale nada previamente.

### 1.1 Pré-requisitos
Antes de gerar o instalador, garanta que você tem:
- **Python 3.10+**.
- **Ambiente Virtual (.venv):** O script de build espera encontrar um ambiente virtual na pasta `server/` com as dependências do `requirements.txt` instaladas.
- **Node.js 20+**.
- **Inno Setup 6+** instalado no Windows.

### 1.2 Automação do Build
Toda a complexidade de compilação e organização é tratada pelo script `build_installer.ps1`.

1.  Abra o PowerShell como **Administrador**.
2.  Execute:
    ```powershell
    .\build_installer.ps1
    ```
    > [!TIP]
    > **Não é necessário ativar o `.venv` no seu terminal.** O script detecta automaticamente a pasta em `server/.venv` e usa o Python correto internamente.
3.  **O que este script faz:**
    - Limpa builds antigos.
    - Executa `npm run build` no frontend.
    - Organiza o Node.js portátil e `node_modules` na pasta `dist`.
    - Compila os serviços de sistema (`Backend` e `Frontend`) usando PyInstaller.
    - Gerar o Launcher (`TicketFlow.exe`).

### 1.3 Geração do Instalador Final
1.  Abra o Inno Setup Compiler.
2.  Carregue o arquivo `installer.iss`.
3.  Pressione **Build > Compile** (ou F9).
4.  O arquivo final será gerado em: `installer_output\TicketFlow_Setup.exe`.

---

## 🚀 Parte 2: Para o Usuário (Instalação e Modos)

O instalador `TicketFlow_Setup.exe` oferece dois tipos de instalação:

### A. Instalação Completa (Servidor)
**Público-alvo:** O computador principal da rede que hospedará os dados.
- **O que é instalado:** Todos os binários, serviços de sistema e o configurador de banco.
- **Serviços:** São criados os serviços `TicketFlowBackend` e `TicketFlowFrontend` que iniciam automaticamente com o Windows.
- **Configuração:** Ao final, abra o sistema pelo navegador. A configuração inicial de banco pode ser feita diretamente na tela de login clicando no ícone de engrenagem ⚙️ (Ajustes).

### B. Instalação Terminal (Estação de Trabalho)
**Público-alvo:** Computadores de funcionários que apenas acessam o sistema.
- **O que é instalado:** Apenas a interface e o Launcher.
- **Configuração:** Ao abrir o sistema pela primeira vez, clique no ícone de engrenagem ⚙️ na tela de login e aponte para o **IP do Servidor**.

---

## 🔍 Parte 3: Solução de Problemas (Troubleshooting)

### Os serviços não iniciam
- Verifique se a porta `8080` (Backend) e `3000` (Frontend) estão liberadas no Firewall do Windows.
- Visualize os logs em `C:\TicketFlow\service_debug.log`.

### Erro de permissão no PowerShell (Build)
Se o script `build_installer.ps1` for bloqueado, execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
```

### Alterar Banco de Dados após a instalação
Caso precise mudar de SQLite para PostgreSQL mais tarde:
1. Abra o sistema no navegador.
2. Na tela de login, clique no ícone de engrenagem ⚙️ (Ajustes).
3. Vá na aba "Banco de Dados" e insira as novas credenciais.
4. O sistema se conectará automaticamente e validará os dados.

---

*TicketFlow — Tecnologia local, performance premium.*
