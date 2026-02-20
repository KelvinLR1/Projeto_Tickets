import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import subprocess
import os
import sys
import time

# Notas: Este script será compilado em dois executáveis diferentes (Server e Client)
# ou parametrizado se preferir, mas para simplicidade faremos dois.

class TicketFlowService(win32serviceutil.ServiceFramework):
    _svc_name_ = "TicketFlowService"
    _svc_display_name_ = "TicketFlow Service"
    _svc_description_ = "Serviço do TicketFlow"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)
        self.process = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        if self.process:
            self.process.terminate()

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.main()

    def main(self):
        # Aqui definimos o que rodar baseado no nome do serviço
        base_dir = os.path.dirname(os.path.abspath(sys.executable))
        
        if self._svc_name_ == "TicketFlowBackend":
            server_dir = os.path.join(base_dir, "server")
            python_exe = os.path.join(server_dir, "python", "python.exe")
            cmd = [python_exe, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
            cwd = server_dir
        else: # TicketFlowFrontend
            client_dir = os.path.join(base_dir, "client")
            # Para o frontend, usamos node diretamente se disponível ou npm
            cmd = ["cmd", "/c", "npm start"]
            cwd = client_dir

        try:
            self.process = subprocess.Popen(cmd, cwd=cwd, creationflags=subprocess.CREATE_NO_WINDOW)
            
            # Aguarda o evento de parada ou o processo encerrar
            while win32event.WaitForSingleObject(self.hWaitStop, 5000) == win32event.WAIT_TIMEOUT:
                if self.process.poll() is not None:
                    break
        except Exception as e:
            servicemanager.LogErrorMsg(f"Erro no serviço {self._svc_name_}: {str(e)}")

class TicketFlowBackend(TicketFlowService):
    _svc_name_ = "TicketFlowBackend"
    _svc_display_name_ = "TicketFlow Backend"
    _svc_description_ = "Executa o servidor FastAPI do TicketFlow."

class TicketFlowFrontend(TicketFlowService):
    _svc_name_ = "TicketFlowFrontend"
    _svc_display_name_ = "TicketFlow Frontend"
    _svc_description_ = "Executa a interface web Next.js do TicketFlow."

if __name__ == '__main__':
    # Se rodar sem argumentos, ou com argumentos de serviço
    if len(sys.argv) > 1:
        # Detecta qual classe usar baseado no binário ou variável de ambiente
        # Para facilitar, usaremos o nome do arquivo se for compilado
        exe_name = os.path.basename(sys.executable).lower()
        if "backend" in exe_name:
            win32serviceutil.HandleCommandLine(TicketFlowBackend)
        else:
            win32serviceutil.HandleCommandLine(TicketFlowFrontend)
    else:
        # Modo debug ou interativo não suportado aqui
        pass
