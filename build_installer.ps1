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
$toCleanup = @($distFolder, "python_portable", "node_portable", "node_temp", "build")
foreach ($folder in $toCleanup) {
    if (Test-Path $folder) { Remove-Item -Path $folder -Recurse -Force }
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
Copy-Item -Path "$clientFolder\next.config.*" -Destination "$distFolder\client\" -ErrorAction SilentlyContinue
# Copiar node_modules para que next.js possa ser iniciado sem npm install
Write-Host "Copiando node_modules (pode demorar)..." -ForegroundColor Yellow
Copy-Item -Path "$clientFolder\node_modules" -Destination "$distFolder\client\node_modules" -Recurse

# 4. Configurar Node.js Portável (Necessário para rodar o Next.js)
Write-Host "--- Configurando Node.js Portável ---" -ForegroundColor Cyan
$nodeVersion = "22.20.0"
$nodeZip = "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZip"
$nodeTempDir = "node_portable"

if (!(Test-Path $nodeZip)) {
    Write-Host "Baixando Node.js $nodeVersion..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}

if (!(Test-Path "node_portable")) {
    Write-Host "Extraindo Node.js..."
    Expand-Archive -Path $nodeZip -DestinationPath "node_temp"
    Move-Item -Path "node_temp\node-v$nodeVersion-win-x64" -Destination "node_portable"
    Remove-Item -Path "node_temp" -Recurse
}

# 5. Organizar DIST
Write-Host "--- Organizando pasta DIST ---" -ForegroundColor Cyan
# Copiar arquivos do Backend (apenas código, as dependências estarão no EXE)
$serverFiles = Get-ChildItem -Path $serverFolder -Exclude ".venv", "__pycache__", "tickets.db", "tickets.db-wal", "tickets.db-shm", "server.log", "config_db.py", "dist", "build"
foreach ($file in $serverFiles) {
    Copy-Item -Path $file.FullName -Destination "$distFolder\server\" -Recurse
}
# Copiar Node.js para o client
New-Item -ItemType Directory -Path "$distFolder\client\node"
Copy-Item -Path "node_portable\*" -Destination "$distFolder\client\node" -Recurse

# 6. Gerar executÃ¡veis
Write-Host "--- Gerando ExecutÃ¡veis (PyInstaller) ---" -ForegroundColor Cyan

# Definir pastas temporÃ¡rias para evitar conflitos de cÃ³pia
$pyiDist = "build_pyi_dist"
$pyiWork = "build_pyi_work"

# Configurador de Banco
Push-Location $serverFolder
& $venvPython -m PyInstaller --onefile --console --name config_db --uac-admin --icon="$iconPath" --exclude-module libcrypto --exclude-module libssl --distpath "..\\$pyiDist" --workpath "..\\$pyiWork" config_db.py
Pop-Location
Copy-Item -Path "$pyiDist\config_db.exe" -Destination "$distFolder\" -Force

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
