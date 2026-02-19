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

; Scripts de Inicialização
Source: "dist\Iniciar_TicketFlow.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\TicketFlow"; Filename: "{app}\Iniciar_TicketFlow.bat"
Name: "{commondesktop}\TicketFlow"; Filename: "{app}\Iniciar_TicketFlow.bat"; Tasks: desktopicon

[Run]
; Só roda o configurador de banco se instalou o componente do servidor
Filename: "{app}\config_db.exe"; Description: "Configurar Banco de Dados PostgreSQL"; Flags: postinstall shellexec; Components: server
Filename: "{app}\Iniciar_TicketFlow.bat"; Description: "Iniciar TicketFlow Agora"; Flags: nowait postinstall shellexec skipifsilent
