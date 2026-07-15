@echo off
title Iniciar Projeto - TicketFlow
echo ====================================================
echo * Iniciando todos os servicos do TicketFlow...
echo ====================================================

:: 1. Verificar/Instalar dependencias do Frontend (Next.js)
if exist "client\node_modules" goto check_python
echo * Dependencias do Frontend nao encontradas.
echo * Executando npm install na pasta client...
cd client
call npm install
cd ..

:check_python
:: 2. Verificar se o Python esta realmente instalado (evita o atalho da Windows Store)
python --version >nul 2>&1
if not errorlevel 1 goto check_venv

echo * ERRO: O Python nao foi encontrado no seu computador.
echo ====================================================
echo Por favor:
echo 1. Baixe e instale o Python 3.10 ou superior em: https://www.python.org/downloads/
echo 2. ATENCAO: Na primeira tela do instalador, marque a caixa "Add Python.exe to PATH"
echo 3. Apos a instalacao, reinicie o computador e execute este script novamente.
echo ====================================================
pause
exit /b

:check_venv
:: 3. Verificar/Criar ambiente virtual do Backend (FastAPI)
if exist "server\.venv\Scripts\alembic.exe" if exist "server\.venv\Scripts\uvicorn.exe" goto start_services
echo * Ambiente virtual do Backend (.venv) ou dependencias nao encontradas.
echo * Configurando ambiente virtual e instalando bibliotecas em server...
cd server
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo * Atualizando o pip...
python -m pip install --upgrade pip --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
echo * Instalando dependencias do backend...
pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
if not exist ".venv\Scripts\uvicorn.exe" (
    echo ====================================================
    echo * ERRO: Falha ao instalar as dependencias do Backend.
    echo * Isso geralmente ocorre devido a bloqueios de rede ou do antivirus como o Kaspersky.
    echo * Tente o seguinte:
    echo   1. No Kaspersky, clique em "Adicionar as exclusoes" para pypi.org e files.pythonhosted.org
    echo   2. Ou desative temporariamente a verificacao de conexoes criptografadas - SSL ou HTTPS - no antivirus.
    echo ====================================================
    cd ..
    pause
    exit /b
)
cd ..

:start_services
:: 4. Iniciar FastAPI Backend
echo * Iniciando Servidor principal (FastAPI)...
start "Backend - FastAPI" cmd /k "cd server && .venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8080"

:: Aguardar 2 segundos (usando ping para compatibilidade sem input)
ping 127.0.0.1 -n 3 >nul

:: 5. Iniciar Next.js Frontend
echo * Interface do Portal (Next.js)...
start "Frontend - Next.js" cmd /k "cd client && npm run dev"

:: Aguardar 2 segundos
ping 127.0.0.1 -n 3 >nul

:: 6. Iniciar canal(is) WhatsApp
echo * Servidor(es) WhatsApp (Node.js)...
python scripts\whatsapp_channels_helper.py start
if exist "_ws_start.bat" (
    call _ws_start.bat
    del _ws_start.bat
) else (
    start "WhatsApp - Principal" cmd /k "cd whatsapp-chat && npm start"
)

echo ====================================================
echo * Todos os servicos foram iniciados em novas janelas.
echo * Acesse a interface em: http://localhost:3000
echo ====================================================
ping 127.0.0.1 -n 6 >nul
