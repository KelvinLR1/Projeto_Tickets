import tkinter as tk
from tkinter import ttk, messagebox
import win32serviceutil
import win32service
import webbrowser
import threading
import time
import os
import sys

class TicketFlowController:
    def __init__(self, root):
        self.root = root
        self.root.title("TicketFlow - Painel de Controle")
        self.root.geometry("400x350")
        self.root.resizable(False, False)

        # Estilo
        style = ttk.Style()
        style.configure("TButton", padding=5)
        style.configure("Status.TLabel", font=("Arial", 10, "bold"))

        self.services = {
            "TicketFlowBackend": {"name": "Backend (Servidor)", "status": "Desconhecido"},
            "TicketFlowFrontend": {"name": "Frontend (Interface)", "status": "Desconhecido"}
        }

        self.setup_ui()
        self.update_status_loop()

    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main_frame, text="TicketFlow v1.0", font=("Arial", 14, "bold")).pack(pady=(0, 20))

        # Status dos Serviços
        self.status_labels = {}
        for svc_id, info in self.services.items():
            frame = ttk.Frame(main_frame)
            frame.pack(fill=tk.X, pady=5)
            
            ttk.Label(frame, text=f"{info['name']}:").pack(side=tk.LEFT)
            lbl = ttk.Label(frame, text="Iniciando...", style="Status.TLabel")
            lbl.pack(side=tk.RIGHT)
            self.status_labels[svc_id] = lbl

        ttk.Separator(main_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=20)

        # Botões de Ação
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill=tk.X)

        self.btn_start = ttk.Button(btn_frame, text="Iniciar Tudo", command=self.start_all)
        self.btn_start.pack(side=tk.LEFT, padx=5, expand=True, fill=tk.X)

        self.btn_stop = ttk.Button(btn_frame, text="Parar Tudo", command=self.stop_all)
        self.btn_stop.pack(side=tk.LEFT, padx=5, expand=True, fill=tk.X)

        ttk.Button(main_frame, text="Abrir Sistema (Navegador)", command=self.open_browser).pack(fill=tk.X, pady=(20, 0))

        self.lbl_info = ttk.Label(main_frame, text="Pronto.", foreground="gray")
        self.lbl_info.pack(pady=(20, 0))

    def get_service_status(self, service_name):
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
        except:
            return "Não Instalado", "gray"

    def update_status_loop(self):
        def refresh():
            while True:
                for svc_id in self.services:
                    text, color = self.get_service_status(svc_id)
                    self.status_labels[svc_id].config(text=text, foreground=color)
                time.sleep(2)
        
        thread = threading.Thread(target=refresh, daemon=True)
        thread.start()

    def start_all(self):
        self.lbl_info.config(text="Iniciando serviços...", foreground="blue")
        threading.Thread(target=self._manage_services, args=("start",)).start()

    def stop_all(self):
        self.lbl_info.config(text="Parando serviços...", foreground="blue")
        threading.Thread(target=self._manage_services, args=("stop",)).start()

    def _manage_services(self, action):
        try:
            for svc_id in self.services:
                if action == "start":
                    win32serviceutil.StartService(svc_id)
                else:
                    win32serviceutil.StopService(svc_id)
            self.lbl_info.config(text=f"Ação '{action}' concluída.", foreground="green")
        except Exception as e:
            self.lbl_info.config(text="Erro ao gerenciar serviços.", foreground="red")
            messagebox.showerror("Erro de Permissão", "Certifique-se de executar como Administrador.\n" + str(e))

    def open_browser(self):
        webbrowser.open("http://localhost:3000")

if __name__ == "__main__":
    # Verifica se tem privilégios de admin para algumas ações se necessário
    # mas o QueryServiceStatus geralmente funciona sem.
    root = tk.Tk()
    app = TicketFlowController(root)
    root.mainloop()
