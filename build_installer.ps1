# build_installer.ps1
# Script para automatizar o build e organização dos arquivos para o instalador

$distFolder = "dist"
$clientFolder = "client"
$serverFolder = "server"
$iconPath = (Resolve-Path "client\app\favicon.ico").Path

# Detectar Python do venv
$venvPython = "python"
if (Test-Path "$serverFolder\.venv\Scripts\python.exe") {
    $venvPython = (Resolve-Path "$serverFolder\.venv\Scripts\python.exe").Path
    Write-Host "Ambiente virtual detectado em $serverFolder\.venv" -ForegroundColor Green
    # Garantir que pywin32 está no venv para o PyInstaller
    & $venvPython -m pip install pywin32
}

# 1. Limpar pastas e artefatos anteriores
Write-Host "--- Limpando pastas e artefatos anteriores ---" -ForegroundColor Cyan
$toCleanup = @($distFolder, "node_temp", "build", "build_pyi_dist", "build_pyi_work")
foreach ($folder in $toCleanup) {
    if (Test-Path $folder) { Remove-Item -Path $folder -Recurse -Force }
}
New-Item -ItemType Directory -Path $distFolder
New-Item -ItemType Directory -Path "$distFolder\client"
New-Item -ItemType Directory -Path "$distFolder\server"

# Função para cópia rápida (Robocopy)
function Fast-Copy($Source, $Destination) {
    if (!(Test-Path $Destination)) { New-Item -ItemType Directory -Path $Destination -Force }
    robocopy $Source $Destination /E /MT:32 /R:3 /W:1 /NP /NFL /NDL /NJH /NJS
}

# 2. Build do Frontend
Write-Host "--- Gerando Build do Frontend (Next.js Standalone) ---" -ForegroundColor Cyan
Push-Location $clientFolder
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build do frontend!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 3. Copiar arquivos do Frontend (Modo Standalone)
Write-Host "--- Organizando Frontend Standalone (Mais Rápido) ---" -ForegroundColor Cyan
# O modo standalone coloca tudo em .next/standalone
if (Test-Path "$clientFolder\.next\standalone") {
    Fast-Copy "$clientFolder\.next\standalone" "$distFolder\client"
    # Adicionar arquivos estáticos (obrigatórios no modo standalone)
    Fast-Copy "$clientFolder\.next\static" "$distFolder\client\.next\static"
    Fast-Copy "$clientFolder\public" "$distFolder\client\public"
} else {
    Write-Host "AVISO: Modo Standalone não detectado. Copiando modo tradicional (lento)..." -ForegroundColor Yellow
    Fast-Copy "$clientFolder\.next" "$distFolder\client\.next"
    Fast-Copy "$clientFolder\public" "$distFolder\client\public"
    Fast-Copy "$clientFolder\node_modules" "$distFolder\client\node_modules"
}

# 4. Configurar Node.js Portável
Write-Host "--- Configurando Node.js Portável ---" -ForegroundColor Cyan
$nodeVersion = "22.20.0"
$nodeZip = "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZip"

if (!(Test-Path $nodeZip)) {
    Write-Host "Baixando Node.js $nodeVersion..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}

if (!(Test-Path "node_portable")) {
    Write-Host "Extraindo Node.js pela primeira vez..."
    Expand-Archive -Path $nodeZip -DestinationPath "node_temp"
    Move-Item -Path "node_temp\node-v$nodeVersion-win-x64" -Destination "node_portable"
    Remove-Item -Path "node_temp" -Recurse
} else {
    Write-Host "Usando Node.js já extraído." -ForegroundColor Gray
}

# 5. Organizar DIST
Write-Host "--- Organizando pasta DIST ---" -ForegroundColor Cyan
# Copiar arquivos do Backend
$serverFiles = Get-ChildItem -Path $serverFolder -Exclude ".venv", "__pycache__", "tickets.db", "tickets.db-wal", "tickets.db-shm", "server.log", "config_db.py", "dist", "build"
foreach ($file in $serverFiles) {
    if ($file.PSIsContainer) {
        Fast-Copy $file.FullName "$distFolder\server\$($file.Name)"
    } else {
        Copy-Item -Path $file.FullName -Destination "$distFolder\server\" -Force
    }
}
# Copiar Node.js para o client (Cópia rápida)
Fast-Copy "node_portable" "$distFolder\client\node"
# Gerar executáveis
Write-Host "--- Gerando Executáveis (PyInstaller) ---" -ForegroundColor Cyan

# Definir pastas temporárias para evitar conflitos de cópia
$pyiDist = "build_pyi_dist"
$pyiWork = "build_pyi_work"

# Controlador
& $venvPython -m PyInstaller --onefile --noconsole --name TicketFlow_Controller --uac-admin --icon="$iconPath" --collect-all pywin32 --hidden-import pywintypes --exclude-module libcrypto --exclude-module libssl --distpath "$pyiDist" --workpath "$pyiWork" controller.py
Copy-Item -Path "$pyiDist\TicketFlow_Controller.exe" -Destination "$distFolder\" -Force

# Gerar ServiÃ§o Backend (Bundled)
Write-Host "--- Gerando ServiÃ§o Backend (Bundled) ---" -ForegroundColor Cyan
& $venvPython -m PyInstaller --onefile --console --name TicketFlow_Backend_Service --icon="$iconPath" `
    --distpath "$pyiDist" --workpath "$pyiWork" `
    --paths "$serverFolder" `
    --collect-all uvicorn `
    --collect-all fastapi `
    --collect-all pydantic `
    --collect-all passlib `
    --collect-all starlette `
    --collect-all sqlalchemy `
    --collect-all pywin32 `
    --hidden-import win32timezone `
    --hidden-import win32service `
    --hidden-import win32serviceutil `
    --hidden-import servicemanager `
    --hidden-import pywintypes `
    --hidden-import passlib.handlers.bcrypt `
    --hidden-import passlib.handlers `
    --hidden-import bcrypt `
    --hidden-import jose `
    --exclude-module libcrypto `
    --exclude-module libssl `
    service_wrapper.py
Copy-Item -Path "$pyiDist\TicketFlow_Backend_Service.exe" -Destination "$distFolder\" -Force

# Gerar ServiÃ§o Frontend
Write-Host "--- Gerando ServiÃ§o Frontend ---" -ForegroundColor Cyan
& $venvPython -m PyInstaller --onefile --console --name TicketFlow_Frontend_Service --icon="$iconPath" --distpath "$pyiDist" --workpath "$pyiWork" --collect-all pywin32 --hidden-import win32timezone --hidden-import win32service --hidden-import win32serviceutil --hidden-import servicemanager --hidden-import pywintypes --exclude-module libcrypto --exclude-module libssl service_wrapper.py
Copy-Item -Path "$pyiDist\TicketFlow_Frontend_Service.exe" -Destination "$distFolder\" -Force

# Launcher
& $venvPython -m PyInstaller --onefile --noconsole --name TicketFlow --icon="$iconPath" --distpath "$pyiDist" --workpath "$pyiWork" --exclude-module libcrypto --exclude-module libssl launcher.py
Copy-Item -Path "$pyiDist\TicketFlow.exe" -Destination "$distFolder\" -Force

# Limpar pastas temporÃ¡rias de build do PyInstaller
Remove-Item -Path $pyiDist -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $pyiWork -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "--- PREPARAÇÃO CONCLUÍDA ---" -ForegroundColor Green
Write-Host "Os arquivos prontos para o Inno Setup estão na pasta: $distFolder" -ForegroundColor Yellow
