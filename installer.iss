; Script do Inno Setup para o TicketFlow
[Setup]
AppName=TicketFlow
AppVersion=1.0
DefaultDirName=C:\TicketFlow
DefaultGroupName=TicketFlow
OutputDir=installer_output
OutputBaseFilename=TicketFlow_Setup
Compression=lzma
SolidCompression=yes

[Types]
Name: "full"; Description: "Instalação Completa (Servidor e Banco)"
Name: "station"; Description: "Instalação Terminal (Apenas Estação de Trabalho)"

[Components]
Name: "server"; Description: "Arquivos do Servidor (Necessário para Servidor Central)"; Types: full
Name: "client"; Description: "Interface do Usuário (Frontend)"; Types: full station

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Arquivos Comuns (Frontend)
Source: "dist\client\*"; DestDir: "{app}\client"; Flags: recursesubdirs createallsubdirs; Components: client

; Arquivos do Servidor (Apenas se for Servidor)
Source: "dist\server\*"; DestDir: "{app}\server"; Flags: recursesubdirs createallsubdirs; Components: server
Source: "dist\config_db.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: server

; Scripts de Inicialização e Controle
Source: "dist\TicketFlow_Controller.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\TicketFlow_Backend_Service.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: server
Source: "dist\TicketFlow_Frontend_Service.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: server

[Icons]
Name: "{group}\TicketFlow"; Filename: "{app}\TicketFlow_Controller.exe"
Name: "{commondesktop}\TicketFlow"; Filename: "{app}\TicketFlow_Controller.exe"; Tasks: desktopicon

[Run]
; Só roda o configurador de banco se instalou o componente do servidor
Filename: "{app}\config_db.exe"; Description: "Configurar Banco de Dados PostgreSQL"; Flags: postinstall shellexec; Components: server

; Instalar os serviços
Filename: "{app}\TicketFlow_Backend_Service.exe"; Parameters: "install"; StatusMsg: "Registrando Serviço Backend..."; Flags: runhidden; Components: server
Filename: "{app}\TicketFlow_Frontend_Service.exe"; Parameters: "install"; StatusMsg: "Registrando Serviço Frontend..."; Flags: runhidden; Components: server

; Iniciar o controlador
Filename: "{app}\TicketFlow_Controller.exe"; Description: "Abrir Painel de Controle TicketFlow"; Flags: nowait postinstall shellexec skipifsilent

[UninstallRun]
; Remover os serviços ao desinstalar
Filename: "{app}\TicketFlow_Backend_Service.exe"; Parameters: "remove"; Flags: runhidden; Components: server
Filename: "{app}\TicketFlow_Frontend_Service.exe"; Parameters: "remove"; Flags: runhidden; Components: server
