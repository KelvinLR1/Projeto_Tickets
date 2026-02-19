# build_installer.ps1
# Script para automatizar o build e organização dos arquivos para o instalador

$distFolder = "dist"
$clientFolder = "client"
$serverFolder = "server"

# 1. Limpar pasta dist anterior
Write-Host "--- Limpando pasta dist anterior ---" -ForegroundColor Cyan
if (Test-Path $distFolder) {
    Remove-Item -Path $distFolder -Recurse -Force
}
New-Item -ItemType Directory -Path $distFolder
New-Item -ItemType Directory -Path "$distFolder\client"
New-Item -ItemType Directory -Path "$distFolder\server"

# 2. Build do Frontend
Write-Host "--- Gerando Build do Frontend (Next.js) ---" -ForegroundColor Cyan
Push-Location $clientFolder
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build do frontend!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 3. Copiar arquivos do Frontend
Write-Host "--- Copiando arquivos do Frontend ---" -ForegroundColor Cyan
Copy-Item -Path "$clientFolder\.next" -Destination "$distFolder\client\.next" -Recurse
Copy-Item -Path "$clientFolder\public" -Destination "$distFolder\client\public" -Recurse
Copy-Item -Path "$clientFolder\package.json" -Destination "$distFolder\client\package.json"
Copy-Item -Path "$clientFolder\node_modules" -Destination "$distFolder\client\node_modules" -Recurse -ErrorAction SilentlyContinue

# 4. Copiar arquivos do Backend
Write-Host "--- Copiando arquivos do Backend ---" -ForegroundColor Cyan
$serverFiles = Get-ChildItem -Path $serverFolder -Exclude ".venv", "__pycache__", "tickets_system.db", "tickets_system.db-wal", "tickets_system.db-wal", "server.log", "config_db.py"
foreach ($file in $serverFiles) {
    Copy-Item -Path $file.FullName -Destination "$distFolder\server\" -Recurse
}

# 5. Gerar executável do Configurador de Banco
Write-Host "--- Gerando Executável do Configurador (PyInstaller) ---" -ForegroundColor Cyan
Push-Location $serverFolder
python -m PyInstaller --onefile --console --name config_db config_db.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro ao gerar executável do configurador! Certifique-se que o PyInstaller está instalado." -ForegroundColor Red
    Pop-Location
    exit 1
}
Copy-Item -Path "dist\config_db.exe" -Destination "..\dist\"
Pop-Location

# 6. Criar script de inicialização inteligente
Write-Host "--- Criando script de inicialização ---" -ForegroundColor Cyan
$startBatch = @"
@echo off
:: Garante que o script rode na pasta onde ele esta localizado
cd /d "%~dp0"
setlocal enabledelayedexpansion
title TicketFlow - Inicializador

echo [TicketFlow] Iniciando...
echo [TicketFlow] Pasta: %cd%

:: --- VERIFICACOES BASICAS ---
if not exist "client" goto ERR_CLIENT
if exist "server\main.py" goto START_SERVER
echo [Estacao] Modo Terminal Detectado.
goto START_FRONTEND

:START_SERVER
echo [Servidor] Verificando Python...
python --version > nul 2>&1
if !errorlevel! neq 0 goto ERR_PYTHON
echo [Servidor] Iniciando Backend...
start "TicketFlow Backend" /b cmd /c "cd server && python -m uvicorn main:app --host 0.0.0.0 --port 8080"
timeout /t 5 > nul

:START_FRONTEND
echo [Frontend] Verificando Node...
npm --version > nul 2>&1
if !errorlevel! neq 0 goto ERR_NODE
if not exist "client\package.json" goto ERR_PKG

echo [Frontend] Iniciando Interface Web...
start "TicketFlow Frontend" /b cmd /c "cd client && npm start"

echo.
echo ======================================================
echo  TicketFlow Online! 
echo  Acesse: http://localhost:3000
echo ======================================================
echo.
echo Mantenha esta janela aberta.
echo Pressione qualquer tecla para encerrar e sair.
pause > nul

:EXIT
echo Encerrando processos...
taskkill /f /im node.exe /t > nul 2>&1
taskkill /f /im python.exe /t > nul 2>&1
exit

:ERR_CLIENT
echo [ERRO] Pasta 'client' nao encontrada.
pause
exit /b

:ERR_PYTHON
echo [ERRO] Python nao encontrado no PATH.
pause
exit /b

:ERR_NODE
echo [ERRO] Node.js nao encontrado no PATH.
pause
exit /b

:ERR_PKG
echo [ERRO] Arquivo client\package.json nao encontrado.
pause
exit /b
"@
$startBatch | Out-File -FilePath "$distFolder\Iniciar_TicketFlow.bat" -Encoding ascii

Write-Host "--- PREPARAÇÃO CONCLUÍDA ---" -ForegroundColor Green
Write-Host "Os arquivos prontos para o Inno Setup estão na pasta: $distFolder" -ForegroundColor Yellow
