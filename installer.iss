; Script do Inno Setup para o TicketFlow
[Setup]
AppName=TicketFlow
AppVersion=1.0
DefaultDirName=C:\TicketFlow
DefaultGroupName=TicketFlow
OutputDir=installer_output
OutputBaseFilename=TicketFlow_Setup
Compression=lzma2/fast
SolidCompression=no
InfoBeforeFile=database_notice.txt
SetupIconFile=client\app\favicon.ico
WizardStyle=modern
DisableWelcomePage=no
PrivilegesRequired=admin

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
Source: "dist\TicketFlow.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\TicketFlow_Controller.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\TicketFlow_Backend_Service.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: server
Source: "dist\TicketFlow_Frontend_Service.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: server

[Icons]
Name: "{group}\TicketFlow (Painel)"; Filename: "{app}\TicketFlow_Controller.exe"
Name: "{commondesktop}\TicketFlow"; Filename: "{app}\TicketFlow.exe"; Tasks: desktopicon

[Run]
; Iniciar o controlador (Apenas este fica aqui como postinstall)
Filename: "{app}\TicketFlow_Controller.exe"; Description: "Abrir Painel de Controle TicketFlow"; Flags: nowait postinstall shellexec skipifsilent

[UninstallRun]
; Remover os serviços ao desinstalar
Filename: "sc"; Parameters: "stop TicketFlowBackend"; Flags: runhidden; Components: server
Filename: "sc"; Parameters: "delete TicketFlowBackend"; Flags: runhidden; Components: server
Filename: "sc"; Parameters: "stop TicketFlowFrontend"; Flags: runhidden; Components: server
Filename: "sc"; Parameters: "delete TicketFlowFrontend"; Flags: runhidden; Components: server

[Code]
procedure ApplyPremiumStyleToControl(Control: TControl);
var
  i: Integer;
  WinControl: TWinControl;
begin
  { Estilizar Labels e Textos Estáticos }
  if Control is TLabel then
    TLabel(Control).Font.Color := clWhite;
  if Control is TNewStaticText then
    TNewStaticText(Control).Font.Color := clWhite;
    
  { Estilizar CheckBoxes e RadioButtons }
  if Control is TCheckBox then
    TCheckBox(Control).Font.Color := clWhite;
  if Control is TRadioButton then
    TRadioButton(Control).Font.Color := clWhite;
    
  { Estilizar Listas de Seleção (Componentes e Tasks) }
  if Control is TNewCheckListBox then
  begin
    TNewCheckListBox(Control).Color := $2D2D2D;
    TNewCheckListBox(Control).Font.Color := clWhite;
  end;
  
  { Estilizar Memos }
  if Control is TNewMemo then
  begin
    { Fallback para InfoBeforeMemo que é problemático com RTF e Dark Theme }
    if Control.Name = 'InfoBeforeMemo' then
    begin
      TNewMemo(Control).Color := clWhite;
      TNewMemo(Control).Font.Color := clBlack;
      TNewMemo(Control).ParentColor := False;
    end
    else
    begin
      TNewMemo(Control).Color := $2D2D2D;
      TNewMemo(Control).Font.Color := clWhite;
    end;
  end;

  { Estilizar Campos de Entrada }
  if Control is TEdit then
  begin
    TEdit(Control).Color := $212121;
    TEdit(Control).Font.Color := clWhite;
  end;
    
  if Control is TWinControl then
  begin
    WinControl := TWinControl(Control);
    for i := 0 to WinControl.ControlCount - 1 do
      ApplyPremiumStyleToControl(WinControl.Controls[i]);
  end;
end;

procedure ApplyPremiumStyle;
begin
  { Aplicar cor de fundo escura global }
  WizardForm.Color := $2D2D2D;
  WizardForm.InnerPage.Color := $2D2D2D;
  WizardForm.WelcomePage.Color := $2D2D2D;
  WizardForm.ReadyPage.Color := $2D2D2D;
  WizardForm.FinishedPage.Color := $2D2D2D;
  WizardForm.InfoBeforePage.Color := $2D2D2D;
  WizardForm.InstallingPage.Color := $2D2D2D;
  WizardForm.SelectDirPage.Color := $2D2D2D;
  WizardForm.SelectComponentsPage.Color := $2D2D2D;
  WizardForm.SelectTasksPage.Color := $2D2D2D;
  
  WizardForm.MainPanel.Color := $212121;
  
  { Estilizar fontes especiais }
  WizardForm.WelcomeLabel1.Font.Color := $00FFFF; { Cyan }
  WizardForm.WelcomeLabel1.Font.Style := [fsBold];
  WizardForm.FinishedHeadingLabel.Font.Color := $00FFFF;
  WizardForm.PageNameLabel.Font.Color := $00FFFF;

  { Garantir cores nos componentes específicos }
  WizardForm.ComponentsList.Color := $2D2D2D;
  WizardForm.ComponentsList.Font.Color := clWhite;
  WizardForm.TasksList.Color := $2D2D2D;
  WizardForm.TasksList.Font.Color := clWhite;
  WizardForm.ReadyMemo.Color := $2D2D2D;
  WizardForm.ReadyMemo.Font.Color := clWhite;
  WizardForm.DirEdit.Color := $212121;
  WizardForm.DirEdit.Font.Color := clWhite;

  { Configuração manual agressiva para o InfoMemo }
  WizardForm.InfoBeforeMemo.Color := clWhite;
  WizardForm.InfoBeforeMemo.Font.Color := clBlack;
  WizardForm.InfoBeforeMemo.ParentColor := False;

  ApplyPremiumStyleToControl(WizardForm);
end;

function RunHidden(FileName, Params: String; var ResultCode: Integer): Boolean;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function RunHiddenNoWait(FileName, Params: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(FileName, Params, '', SW_HIDE, ewNoWait, ResultCode);
end;

procedure UpdateStatus(Msg: String; Progress: Integer);
begin
  WizardForm.StatusLabel.Caption := Msg;
  WizardForm.ProgressGauge.Position := Progress;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpInfoBefore then
  begin
    WizardForm.InfoBeforeMemo.Color := clWhite;
    WizardForm.InfoBeforeMemo.Font.Color := clBlack;
  end;
  ApplyPremiumStyle;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    { Só executa se for instalação do servidor }
    if IsComponentSelected('server') then
    begin
      UpdateStatus('Registrando Serviços...', 90);
      { Usando NoWait para evitar travamentos se o registro do Windows demorar }
      RunHiddenNoWait(ExpandConstant('{app}\TicketFlow_Backend_Service.exe'), '--startup=auto install');
      Sleep(500);
      RunHiddenNoWait(ExpandConstant('{app}\TicketFlow_Frontend_Service.exe'), '--startup=auto install');
      Sleep(500);
      
      UpdateStatus('Iniciando Serviços...', 95);
      RunHiddenNoWait(ExpandConstant('{app}\TicketFlow_Backend_Service.exe'), 'start');
      RunHiddenNoWait(ExpandConstant('{app}\TicketFlow_Frontend_Service.exe'), 'start');
      
      UpdateStatus('Finalizado com sucesso!', 100);
      Sleep(1000);
    end;
  end;
  ApplyPremiumStyle;
end;

procedure InitializeWizard;
begin
  ApplyPremiumStyle;
end;
