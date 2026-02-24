import tkinter as tk
from tkinter import ttk, messagebox
import webbrowser
import threading
import time
import os
import sys
import subprocess
import ctypes
import json
from typing import Dict, List, Any, Optional

# Tentativa de importação amigável para o IDE
try:
    import win32serviceutil
    import win32service
except ImportError:
    # Isso evita erros de análise estática se o ambiente não estiver configurado no IDE
    win32serviceutil = Any 
    win32service = Any

def is_admin() -> bool:
    """Verifica se o usuário possui privilégios de administrador."""
    if sys.platform != 'win32':
        return False
    try:
        # Uso de getattr para evitar erro de atributo no IDE
        win_dll = getattr(ctypes, 'windll', None)
        if win_dll:
            return win_dll.shell32.IsUserAnAdmin() != 0
        return False
    except (AttributeError, Exception):
        return False

class TicketFlowController:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("TicketFlow - Painel de Controle")
        self.root.geometry("500x520")
        self.root.resizable(False, False)

        # Inicialização antecipada para evitar avisos de None
        self.status_labels: Dict[str, ttk.Label] = {}
        self.lbl_info = ttk.Label(self.root, text="Inicializando...") 

        # Estilo
        style = ttk.Style()
        style.configure("TButton", padding=5)
        style.configure("Status.TLabel", font=("Arial", 10, "bold"))

        self.services = {
            "TicketFlowBackend": {"name": "Backend (Servidor)", "status": "Desconhecido", "exe": "TicketFlow_Backend_Service.exe"},
            "TicketFlowFrontend": {"name": "Frontend (Interface)", "status": "Desconhecido", "exe": "TicketFlow_Frontend_Service.exe"}
        }

        self.setup_ui()
        self.update_status_loop()

    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main_frame, text="TicketFlow v1.0", font=("Arial", 14, "bold")).pack(pady=(0, 10))

        # Status e Controles dos Serviços
        services_frame = ttk.LabelFrame(main_frame, text="Gerenciamento de Serviços", padding="10")
        services_frame.pack(fill=tk.X, pady=5)
        
        for svc_id, info in self.services.items():
            frame = ttk.Frame(services_frame)
            frame.pack(fill=tk.X, pady=5)
            
            # Cabeçalho com Nome e Status
            header_frame = ttk.Frame(frame)
            header_frame.pack(fill=tk.X)
            ttk.Label(header_frame, text=f"{info['name']}:", font=("Arial", 10, "bold")).pack(side=tk.LEFT)
            lbl = ttk.Label(header_frame, text="Iniciando...", style="Status.TLabel")
            lbl.pack(side=tk.RIGHT)
            self.status_labels[svc_id] = lbl
            
            # Botões de Ação por serviço
            action_frame = ttk.Frame(frame)
            action_frame.pack(fill=tk.X, pady=(5, 5))
            
            action_frame.columnconfigure(0, weight=1)
            action_frame.columnconfigure(1, weight=1)
            action_frame.columnconfigure(2, weight=1)
            action_frame.columnconfigure(3, weight=1)
            
            # Criando comandos com fechamento para svc_id
            def create_cmd(func, s_id): return lambda: func(s_id)
            
            ttk.Button(action_frame, text="Iniciar", command=create_cmd(self.start_service, svc_id)).grid(row=0, column=0, padx=2, sticky="ew")
            ttk.Button(action_frame, text="Parar", command=create_cmd(self.stop_service, svc_id)).grid(row=0, column=1, padx=2, sticky="ew")
            ttk.Button(action_frame, text="Instalar", command=create_cmd(self.install_service, svc_id)).grid(row=0, column=2, padx=2, sticky="ew")
            ttk.Button(action_frame, text="Desinstalar", command=create_cmd(self.uninstall_service, svc_id)).grid(row=0, column=3, padx=2, sticky="ew")
            
            if list(self.services.keys())[-1] != svc_id:
                ttk.Separator(services_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=5)

        ttk.Separator(main_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=10)

        # Botões de Ação Globais
        global_frame = ttk.Frame(main_frame)
        global_frame.pack(fill=tk.X, pady=(5, 10))

        ttk.Button(global_frame, text="Iniciar Todos", command=self.start_all).pack(side=tk.LEFT, padx=5, expand=True, fill=tk.X)
        ttk.Button(global_frame, text="Parar Todos", command=self.stop_all).pack(side=tk.LEFT, padx=5, expand=True, fill=tk.X)

        ttk.Button(main_frame, text="Configurar Portas", command=self.open_port_config).pack(fill=tk.X, pady=(10, 0))
        ttk.Button(main_frame, text="Abrir Sistema (Navegador)", command=self.open_browser).pack(fill=tk.X, pady=(10, 0))

        # Re-atribuição do lbl_info
        self.lbl_info = ttk.Label(main_frame, text="Pronto.", foreground="gray", justify=tk.CENTER)
        self.lbl_info.pack(pady=(15, 0))

        if not is_admin():
            ttk.Label(main_frame, text="Aviso: Execute como Administrador para gerenciar serviços", 
                      foreground="orange", font=("Arial", 8, "italic"), justify=tk.CENTER).pack(pady=(5, 0))

    def get_service_status(self, service_name: str):
        if win32serviceutil is Any: return "Erro Lib", "gray"
        try:
            status = win32serviceutil.QueryServiceStatus(service_name)[1]
            if status == win32service.SERVICE_RUNNING:
                return "Rodando", "green"
            elif status == win32service.SERVICE_STOPPED:
                return "Parado", "red"
            elif status == win32service.SERVICE_START_PENDING:
                return "Iniciando...", "orange"
            elif status == win32service.SERVICE_STOP_PENDING:
                return "Parando...", "orange"
            else:
                return "Pendente", "gray"
        except Exception as e:
            win_error = getattr(e, 'winerror', 0)
            if win_error == 1060:
                return "Não Registrado", "red"
            return "Erro / Acesso Negado", "gray"

    def update_status_loop(self):
        def refresh():
            while True:
                try:
                    for svc_id in self.services:
                        text, color = self.get_service_status(svc_id)
                        if svc_id in self.status_labels:
                            self.status_labels[svc_id].config(text=text, foreground=color)
                except Exception:
                    pass
                time.sleep(2)
        
        thread = threading.Thread(target=refresh, daemon=True)
        thread.start()

    def show_service_error_message(self, action_desc: str, error: Exception):
        error_msg = str(error)
        debug_info = ""
        try:
            # Caminho do executável ou script
            if getattr(sys, 'frozen', False):
                base_dir = os.path.dirname(sys.executable)
            else:
                base_dir = os.path.dirname(os.path.abspath(__file__))
                
            log_path = os.path.join(base_dir, "service_debug.log")
            if os.path.exists(log_path):
                with open(log_path, "r") as f:
                    all_lines = f.readlines()
                    last_five = []
                    # Slicing manual (loop) para satisfazer analisadores estáticos rígidos
                    count = len(all_lines)
                    start = count - 5
                    if start < 0: start = 0
                    for i in range(start, count):
                        last_five.append(all_lines[i])
                    debug_info = "\n\nÚltimos logs de erro:\n" + "".join(last_five)
        except Exception:
            pass

        win_error = getattr(error, 'winerror', 0)
        if "Access is denied" in error_msg or "Acesso negado" in error_msg or win_error == 5:
            messagebox.showerror("Erro de Permissão", "Acesso Negado. Por favor, execute este controlador como Administrador.")
        else:
            messagebox.showerror("Erro", 
                f"Detalhe do erro: {error_msg}\n"
                f"Certifique-se de estar como Administrador ou se o serviço está instalado.{debug_info}")

    def update_info(self, text: str, color: str = "blue"):
        self.lbl_info.config(text=text, foreground=color)

    def start_service(self, svc_id: str):
        if win32serviceutil is Any: 
            messagebox.showerror("Erro", "Biblioteca win32service não encontrada.")
            return
        self.update_info(f"Tentando iniciar {self.services[svc_id]['name']}...", "blue")
        def run_start():
            try:
                win32serviceutil.StartService(svc_id)
                self.update_info(f"Sucesso: {self.services[svc_id]['name']} iniciado.", "green")
            except Exception as e:
                self.update_info(f"Erro ao iniciar {self.services[svc_id]['name']}.", "red")
                self.show_service_error_message("iniciar", e)
        threading.Thread(target=run_start).start()

    def stop_service(self, svc_id: str):
        if win32serviceutil is Any: return
        self.update_info(f"Tentando parar {self.services[svc_id]['name']}...", "blue")
        def run_stop():
            try:
                win32serviceutil.StopService(svc_id)
                self.update_info(f"Sucesso: {self.services[svc_id]['name']} parado.", "green")
            except Exception as e:
                self.update_info(f"Erro ao parar {self.services[svc_id]['name']}.", "red")
                self.show_service_error_message("parar", e)
        threading.Thread(target=run_stop).start()

    def install_service(self, svc_id: str):
        self.update_info(f"Tentando instalar {self.services[svc_id]['name']}...", "orange")
        def run_install():
            try:
                if getattr(sys, 'frozen', False):
                    base_dir = os.path.dirname(sys.executable)
                else:
                    base_dir = os.path.dirname(os.path.abspath(__file__))

                exe_name = self.services[svc_id]["exe"]
                exe_path = os.path.join(base_dir, str(exe_name))
                
                if os.path.exists(exe_path):
                    # Forçando o uso do diretório correto para o subprocess
                    subprocess.run([exe_path, "--startup=auto", "install"], capture_output=True, cwd=base_dir)
                    subprocess.run([exe_path, "start"], capture_output=True, cwd=base_dir)
                    self.update_info(f"Sucesso: {self.services[svc_id]['name']} instalado/reparado.", "green")
                    messagebox.showinfo("Sucesso", f"Serviço {self.services[svc_id]['name']} registrado com sucesso.")
                else:
                    self.update_info(f"Falha ao encontrar arquivo do {self.services[svc_id]['name']}.", "red")
                    messagebox.showerror("Erro", f"Executável não encontrado em:\n{exe_path}")
            except Exception as e:
                self.update_info(f"Erro ao instalar {self.services[svc_id]['name']}.", "red")
                self.show_service_error_message("instalar", e)
        threading.Thread(target=run_install, daemon=True).start()

    def uninstall_service(self, svc_id: str):
        if not messagebox.askyesno("Confirmar", f"Tem certeza que deseja desinstalar o serviço {self.services[svc_id]['name']}?"):
            return
        
        self.update_info(f"Tentando desinstalar {self.services[svc_id]['name']}...", "orange")
        def run_uninstall():
            try:
                if win32serviceutil is not Any:
                    try:
                        win32serviceutil.StopService(svc_id)
                        time.sleep(1)
                    except Exception: pass
                
                if getattr(sys, 'frozen', False):
                    base_dir = os.path.dirname(sys.executable)
                else:
                    base_dir = os.path.dirname(os.path.abspath(__file__))

                exe_name = self.services[svc_id]["exe"]
                exe_path = os.path.join(base_dir, str(exe_name))
                
                if os.path.exists(exe_path):
                    subprocess.run([exe_path, "remove"], capture_output=True, cwd=base_dir)
                    self.update_info(f"Sucesso: {self.services[svc_id]['name']} desinstalado.", "green")
                    messagebox.showinfo("Sucesso", f"Serviço {self.services[svc_id]['name']} removido.")
                else:
                    self.update_info(f"Falha ao encontrar arquivo do {self.services[svc_id]['name']}.", "red")
                    messagebox.showerror("Erro", f"Executável não encontrado em:\n{exe_path}")
            except Exception as e:
                self.update_info(f"Erro ao desinstalar {self.services[svc_id]['name']}.", "red")
                self.show_service_error_message("desinstalar", e)
        threading.Thread(target=run_uninstall, daemon=True).start()

    def start_all(self):
        for svc_id in self.services: self.start_service(svc_id)

    def stop_all(self):
        for svc_id in self.services: self.stop_service(svc_id)

    def open_port_config(self):
        config_win = tk.Toplevel(self.root)
        config_win.title("Configurar Portas")
        config_win.geometry("300x200")
        config_win.resizable(False, False)
        config_win.transient(self.root); config_win.grab_set()

        if getattr(sys, 'frozen', False): base_dir = os.path.dirname(sys.executable)
        else: base_dir = os.path.dirname(os.path.abspath(__file__))

        json_path = os.path.join(base_dir, "system_ports.json")
        front_port, back_port = 3000, 8080
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r') as f:
                    data = json.load(f)
                    front_port = data.get('frontend_port', 3000)
                    back_port = data.get('backend_port', 8080)
            except Exception: pass

        ttk.Label(config_win, text="Porta do Frontend (Padrão: 3000):").pack(pady=(15, 5))
        entry_front = ttk.Entry(config_win); entry_front.insert(0, str(front_port)); entry_front.pack(fill=tk.X, padx=20)
        ttk.Label(config_win, text="Porta do Backend (Padrão: 8080):").pack(pady=(15, 5))
        entry_back = ttk.Entry(config_win); entry_back.insert(0, str(back_port)); entry_back.pack(fill=tk.X, padx=20)

        def save_config():
            try:
                new_front, new_back = int(entry_front.get()), int(entry_back.get())
                config_data = {"frontend_port": new_front, "backend_port": new_back}
                with open(json_path, 'w') as f: json.dump(config_data, f, indent=4)
                
                config_js_dir = os.path.join(base_dir, "client", "public")
                if os.path.exists(config_js_dir):
                    with open(os.path.join(config_js_dir, "config.js"), 'w') as f:
                        f.write(f"window.TICKETFLOW_BACKEND_PORT = {new_back};\n")
                messagebox.showinfo("Sucesso", "Configurado! Reinicie os serviços.")
                config_win.destroy()
            except Exception as e: messagebox.showerror("Erro", str(e))

        ttk.Button(config_win, text="Salvar", command=save_config).pack(pady=(20, 10))

    def open_browser(self):
        if getattr(sys, 'frozen', False): base_dir = os.path.dirname(sys.executable)
        else: base_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(base_dir, "system_ports.json")
        port = 3000
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r') as f: port = json.load(f).get('frontend_port', 3000)
            except Exception: pass
        webbrowser.open(f"http://localhost:{port}")

if __name__ == "__main__":
    tk_root = tk.Tk()
    app = TicketFlowController(tk_root)
    tk_root.mainloop()
