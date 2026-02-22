import sys
import socket
import subprocess
import os
import time
import threading
from typing import Optional, List, cast

# pywin32 só está disponível no Windows em tempo de execução; os erros de import
# do analisador estático são falsos positivos e suprimidos com type: ignore.
import win32serviceutil  # type: ignore[import]
import win32service       # type: ignore[import]
import win32event         # type: ignore[import]
import servicemanager     # type: ignore[import]

# Notas: Este script será compilado em dois executáveis diferentes
# TicketFlow_Backend_Service.exe e TicketFlow_Frontend_Service.exe

def log_debug(message: str) -> None:
    try:
        base_dir = os.path.dirname(os.path.abspath(sys.executable))
        log_path = os.path.join(base_dir, "service_debug.log")
        with open(log_path, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - {message}\n")
    except Exception:
        pass


class TicketFlowService(win32serviceutil.ServiceFramework):
    _svc_name_ = "TicketFlowService"
    _svc_display_name_ = "TicketFlow Service"
    _svc_description_ = "Serviço do TicketFlow"

    def __init__(self, args: List[str]) -> None:
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)
        self.process: Optional[subprocess.Popen[str]] = None

    def SvcStop(self) -> None:
        log_debug(f"Parando serviço {self._svc_name_}...")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        proc = self.process
        if proc is not None:
            try:
                proc.terminate()
                log_debug(f"Processo do serviço {self._svc_name_} terminado.")
            except Exception as e:
                log_debug(f"Erro ao terminar processo: {str(e)}")

    def SvcDoRun(self) -> None:
        log_debug(f"Iniciando SvcDoRun para {self._svc_name_}")
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.main()

    def main(self) -> None:
        base_dir = os.path.dirname(os.path.abspath(sys.executable))
        log_debug(f"Base Dir: {base_dir}")

        exe_name = os.path.basename(sys.executable).lower()
        is_backend = "backend" in exe_name or self._svc_name_ == "TicketFlowBackend"

        if is_backend:
            # Backend: roda via uvicorn embutido no EXE (PyInstaller incluiu uvicorn + fastapi)
            log_debug("Iniciando modo Backend embutido...")
            server_dir = os.path.join(base_dir, "server")
            sys.path.insert(0, server_dir)
            log_debug(f"server_dir adicionado ao sys.path: {server_dir}")

            try:
                import uvicorn  # type: ignore[import]
                from main import app  # type: ignore[import]  # server_dir já no path
                log_debug("uvicorn e main importados com sucesso.")

                def run_server() -> None:
                    try:
                        log_debug("Chamando uvicorn.run...")
                        uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
                        log_debug("uvicorn.run encerrado.")
                    except Exception as e:
                        log_debug(f"Erro dentro do uvicorn.run: {str(e)}")

                server_thread = threading.Thread(target=run_server, daemon=True)
                server_thread.start()
                log_debug("Thread do servidor iniciada. Aguardando sinal de parada...")
                win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
                log_debug("Sinal de parada recebido no Backend.")
                return
            except ImportError as e:
                log_debug(f"ImportError ao carregar uvicorn/main: {str(e)}")
                log_debug("Verifique quais módulos estão faltando no EXE empacotado.")
                return
            except Exception as e:
                log_debug(f"Erro inesperado no backend embutido: {str(e)}")
                return

        else:
            # Frontend: roda Next.js via Node.js portátil (Modo Standalone)
            client_dir = os.path.join(base_dir, "client")
            node_exe = os.path.join(client_dir, "node", "node.exe")
            server_js = os.path.join(client_dir, "server.js")
            next_bin = os.path.join(client_dir, "node_modules", "next", "dist", "bin", "next")

            if not os.path.exists(node_exe):
                log_debug(f"ERRO: node.exe não encontrado em {node_exe}")
                return

            log_debug(f"Node.js exe: {node_exe}, server_js existe: {os.path.exists(server_js)}")

            cmd: List[str]
            if os.path.exists(server_js):
                # Recomendado: Modo Standalone (Leve/Rápido)
                cmd = [node_exe, server_js]
            elif os.path.exists(next_bin):
                # Fallback: Modo Tradicional (Legado)
                cmd = [node_exe, next_bin, "start"]
            else:
                # Último recurso
                npm_cmd = os.path.join(client_dir, "node", "npm.cmd")
                cmd = [npm_cmd, "start"]

            cwd = client_dir

        # CREATE_NO_WINDOW é 0x08000000; definido aqui para satisfazer o analisador
        # estático quando subprocess.CREATE_NO_WINDOW não aparece nos stubs.
        CREATE_NO_WINDOW: int = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

        try:
            log_debug(f"Executando subprocesso. Cmd: {cmd}, Cwd: {cwd}")
            env = os.environ.copy()
            env["PATH"] = os.path.join(base_dir, "client", "node") + ";" + env.get("PATH", "")
            self.process = subprocess.Popen(
                cmd, cwd=cwd, env=env,
                creationflags=CREATE_NO_WINDOW,
                text=True,
            )

            while win32event.WaitForSingleObject(self.hWaitStop, 5000) == win32event.WAIT_TIMEOUT:
                proc = self.process
                if proc is not None and proc.poll() is not None:
                    log_debug(f"Subprocesso encerrou com código {proc.returncode}")
                    break
        except Exception as e:
            log_debug(f"Erro no loop de subprocesso: {str(e)}")


class TicketFlowBackend(TicketFlowService):
    _svc_name_ = "TicketFlowBackend"
    _svc_display_name_ = "TicketFlow Backend"
    _svc_description_ = "Executa o servidor FastAPI do TicketFlow."

class TicketFlowFrontend(TicketFlowService):
    _svc_name_ = "TicketFlowFrontend"
    _svc_display_name_ = "TicketFlow Frontend"
    _svc_description_ = "Executa a interface web Next.js do TicketFlow."

if __name__ == '__main__':
    # Log de diagnóstico precoce
    log_debug("--- INÍCIO DA EXECUÇÃO DO WRAPPER ---")
    log_debug(f"Executable: {sys.executable}")
    log_debug(f"Args: {sys.argv}")
    log_debug(f"CWD: {os.getcwd()}")

    exe_name = os.path.basename(sys.executable).lower()
    is_backend = "backend" in exe_name
    svc_class = TicketFlowBackend if is_backend else TicketFlowFrontend

    args: List[str] = [a for i, a in enumerate(sys.argv) if i > 0]
    if args:
        # Uso via CLI (install, remove, start, etc.)
        log_debug(f"Modo CLI detectado: {args}")
        win32serviceutil.HandleCommandLine(svc_class)
    else:
        # Iniciado pelo Service Control Manager (SCM) do Windows
        log_debug(f"Iniciando dispatcher do SCM para {'Backend' if is_backend else 'Frontend'}...")
        try:
            # Ordem de importação recomendada para ambientes congelados
            import win32service    # type: ignore[import]
            import win32serviceutil  # type: ignore[import]
            import pywintypes      # type: ignore[import]
            import servicemanager  # type: ignore[import]

            # Diagnóstico de atributos para confirmar o que o PyInstaller incluiu
            attrs = dir(servicemanager)
            log_debug(f"Atributos disponíveis em servicemanager: {attrs}")

            try:
                servicemanager.Initialize()
                log_debug("servicemanager.Initialize() executado.")
            except Exception as e:
                log_debug(f"Aviso no Initialize: {str(e)}")

            svc_name = svc_class._svc_name_
            log_debug(f"Hospedando serviço: {svc_name}")

            # O nome correto da função pode variar por versão do pywin32
            if hasattr(servicemanager, 'PrepareToHostSingle'):
                try:
                    log_debug("Chamando PrepareToHostSingle...")
                    servicemanager.PrepareToHostSingle(svc_class)
                    log_debug("PrepareToHostSingle concluído.")
                except Exception as e:
                    log_debug(f"Falha no PrepareToHostSingle: {str(e)}")
            elif hasattr(servicemanager, 'PrepareToHostSingleService'):
                try:
                    log_debug("Chamando PrepareToHostSingleService (versão antiga)...")
                    servicemanager.PrepareToHostSingleService(svc_class)
                    log_debug("PrepareToHostSingleService concluído.")
                except Exception as e:
                    log_debug(f"Falha no PrepareToHostSingleService: {str(e)}")
            else:
                log_debug("AVISO CRÍTICO: Nenhuma função PrepareToHost encontrada!")

            # Inicia o dispatcher principal
            log_debug(f"Chamando StartServiceCtrlDispatcher para {svc_name}...")
            servicemanager.StartServiceCtrlDispatcher()
            log_debug("Dispatcher do SCM encerrado com sucesso.")
        except Exception as e:
            msg = f"ERRO CRÍTICO no dispatcher do SCM: {str(e)}"
            log_debug(msg)
            try:
                import servicemanager  # type: ignore[import]
                servicemanager.LogErrorMsg(msg)
            except Exception:
                pass
