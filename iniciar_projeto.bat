@echo off
title Iniciar Projeto - TicketFlow
echo ====================================================
echo * Iniciando todos os servicos do TicketFlow...
echo ====================================================

:: 1. Verificar/Instalar dependencias do Frontend (Next.js)
if exist "client\node_modules" goto check_whatsapp
echo * Dependencias do Frontend nao encontradas.
echo * Executando npm install na pasta client...
cd client
call npm install
cd ..

:check_whatsapp
:: 1b. Verificar/Instalar dependencias do WhatsApp (Node.js)
if exist "whatsapp-chat\node_modules" goto check_python
echo * Dependencias do WhatsApp nao encontradas.
echo * Executando npm install na pasta whatsapp-chat...
cd whatsapp-chat
call npm install
cd ..

:check_python
:: 2. Verificar se o Python esta instalado (usa o Python Launcher 'py' para evitar o alias da Windows Store)
py --version >nul 2>&1
if not errorlevel 1 goto check_venv
:: Tenta tambem com o caminho do venv caso o py launcher nao esteja disponivel
if exist "server\.venv\Scripts\python.exe" goto check_venv

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
    py -m venv .venv
)
call .venv\Scripts\activate.bat
echo * Atualizando o pip...
.venv\Scripts\python.exe -m pip install --upgrade pip --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
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
:: 3b. Gerar/Corrigir o .env com o caminho correto desta maquina
echo * Verificando configuracao do banco de dados (.env)...
set "DB_PATH=%~dp0.env"
set "CORRECT_DB_URL=sqlite:///%~dp0server\tickets.db"
set "CORRECT_DB_URL=%CORRECT_DB_URL:\=/%"
if not exist "%DB_PATH%" (
    echo * Arquivo .env nao encontrado. Criando com caminho local...
    echo DATABASE_URL=%CORRECT_DB_URL%> "%DB_PATH%"
    echo * .env criado com sucesso!
) else (
    :: Verifica se o caminho no .env esta correto para esta maquina
    findstr /C:"%CORRECT_DB_URL%" "%DB_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo * AVISO: DATABASE_URL desatualizada no .env. Corrigindo para este computador...
        server\.venv\Scripts\python.exe -c "import re,sys; f=open('.env','r',encoding='utf-8'); c=f.read(); f.close(); c2=re.sub(r'DATABASE_URL=sqlite:///[^\r\n]*','DATABASE_URL=%CORRECT_DB_URL%',c); f=open('.env','w',encoding='utf-8'); f.write(c2); f.close(); print('OK')"
        echo * .env atualizado para: %CORRECT_DB_URL%
    ) else (
        echo * DATABASE_URL OK para este computador!
    )
)
:: 4. Verificar se o uvicorn e acessivel antes de iniciar
echo * Verificando disponibilidade do uvicorn...
server\.venv\Scripts\python.exe -c "import uvicorn" >nul 2>&1
if errorlevel 1 (
    echo * AVISO: uvicorn nao encontrado. Reinstalando dependencias do backend...
    cd server
    .venv\Scripts\python.exe -m pip install uvicorn fastapi --trusted-host pypi.org --trusted-host files.pythonhosted.org
    cd ..
    server\.venv\Scripts\python.exe -c "import uvicorn" >nul 2>&1
    if errorlevel 1 (
        echo ====================================================
        echo * ERRO: Nao foi possivel instalar o uvicorn.
        echo * Verifique sua conexao com a internet e tente novamente.
        echo ====================================================
        pause
        exit /b
    )
    echo * uvicorn instalado com sucesso!
) else (
    echo * uvicorn OK!
)

:: 5. Iniciar FastAPI Backend
echo * [1/3] Iniciando Servidor principal (FastAPI - Porta 8080)...
start "Backend - FastAPI" cmd /k "cd server && .venv\Scripts\activate && .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8080"

:: Aguardar 2 segundos (usando ping para compatibilidade sem input)
ping 127.0.0.1 -n 3 >nul

:: 6. Iniciar Next.js Frontend
echo * [2/3] Interface do Portal (Next.js - Porta 3000)...
start "Frontend - Next.js" cmd /k "cd client && set NODE_OPTIONS=--max-old-space-size=4096 && npm run dev"

:: Aguardar 2 segundos
ping 127.0.0.1 -n 3 >nul

:: 7. Iniciar canal(is) WhatsApp
echo * [3/3] Servidor(es) WhatsApp (Node.js)...
server\.venv\Scripts\python.exe scripts\whatsapp_channels_helper.py start
if exist "_ws_start.bat" (
    call _ws_start.bat
    del _ws_start.bat
) else (
    start "WhatsApp - Principal" cmd /k "cd whatsapp-chat && npm start"
)

:: 8. Executar monitor de status em tempo real
if exist "server\.venv\Scripts\python.exe" (
    server\.venv\Scripts\python.exe scripts\check_services.py
) else (
    echo ====================================================
    echo * Todos os servicos foram iniciados em novas janelas.
    echo * Acesse a interface em: http://localhost:3000
    echo ====================================================
    ping 127.0.0.1 -n 6 >nul
)

