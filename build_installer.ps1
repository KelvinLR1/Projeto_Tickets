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

# 4. Configurar Python Portável (para instalação sem Python global)
Write-Host "--- Configurando Python Portável ---" -ForegroundColor Cyan
$pythonVersion = "3.13.2"
$pythonZip = "python-$pythonVersion-embed-amd64.zip"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/$pythonZip"
$pythonTempDir = "python_portable"

if (!(Test-Path $pythonZip)) {
    Write-Host "Baixando Python $pythonVersion..."
    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonZip
}

if (!(Test-Path $pythonTempDir)) {
    Write-Host "Extraindo Python..."
    Expand-Archive -Path $pythonZip -DestinationPath $pythonTempDir
}

# Habilitar site-packages no Python Embeddable
$pthFile = "$pythonTempDir\python313._pth"
if (Test-Path $pthFile) {
    $content = Get-Content $pthFile
    $newContent = $content -replace "#import site", "import site"
    $newContent | Set-Content $pthFile
}

# Instalar pip no Python Portável
if (!(Test-Path "$pythonTempDir\Scripts\pip.exe")) {
    Write-Host "Instalando pip no Python Portável..."
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile "get-pip.py"
    & "$pythonTempDir\python.exe" "get-pip.py"
    Remove-Item "get-pip.py"
}

# Instalar dependências no Python Portável
Write-Host "Instalando dependências no Python Portável..."
& "$pythonTempDir\python.exe" -m pip install -r "$serverFolder\requirements.txt"
& "$pythonTempDir\python.exe" -m pip install pywin32

# 5. Copiar arquivos do Backend e Python Portável
Write-Host "--- Copiando arquivos do Backend ---" -ForegroundColor Cyan
$serverFiles = Get-ChildItem -Path $serverFolder -Exclude ".venv", "__pycache__", "tickets.db", "tickets.db-wal", "tickets.db-shm", "server.log", "config_db.py", "dist", "build"
foreach ($file in $serverFiles) {
    Copy-Item -Path $file.FullName -Destination "$distFolder\server\" -Recurse
}
# Copiar o Python Portável configurado
Copy-Item -Path $pythonTempDir -Destination "$distFolder\server\python" -Recurse

# 6. Gerar executável do Configurador de Banco
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

# 7. Gerar executáveis de Serviço e Controlador
Write-Host "--- Gerando Executáveis de Serviço e Controlador ---" -ForegroundColor Cyan

# Gerar o Controlador (GUI)
python -m PyInstaller --onefile --noconsole --name TicketFlow_Controller --icon=client\public\favicon.ico controller.py
Copy-Item -Path "dist\TicketFlow_Controller.exe" -Destination "$distFolder\"

# Gerar Serviço Backend
python -m PyInstaller --onefile --console --name TicketFlow_Backend_Service service_wrapper.py
Copy-Item -Path "dist\TicketFlow_Backend_Service.exe" -Destination "$distFolder\"

# Gerar Serviço Frontend
python -m PyInstaller --onefile --console --name TicketFlow_Frontend_Service service_wrapper.py
Copy-Item -Path "dist\TicketFlow_Frontend_Service.exe" -Destination "$distFolder\"

Write-Host "--- PREPARAÇÃO CONCLUÍDA ---" -ForegroundColor Green
Write-Host "Os arquivos prontos para o Inno Setup estão na pasta: $distFolder" -ForegroundColor Yellow
