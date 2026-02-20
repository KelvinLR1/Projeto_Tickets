import subprocess
import os
import time
import webbrowser
import sys

def launch():
    base_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
    os.chdir(base_dir)

    print("="*60)
    print("        INICIALIZADOR TICKETFLOW - SISTEMA ONLINE")
    print("="*60)

    # 1. Inicia o Backend (se existir pasta server)
    backend_process = None
    server_dir = os.path.join(base_dir, "server")
    # Usa o Python portátil embutido em vez de venv global
    bundled_python = os.path.join(server_dir, "python", "python.exe")

    if os.path.exists(server_dir) and os.path.exists(bundled_python):
        print("\n[Servidor] Iniciando Backend com Python Portátil...")
        try:
            # Comando: python/python.exe -m uvicorn main:app --host 0.0.0.0 --port 8080
            backend_process = subprocess.Popen(
                [bundled_python, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"],
                cwd=server_dir,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            print("✅ Backend iniciado em segundo plano (Porta 8080).")
        except Exception as e:
            print(f"❌ Erro ao iniciar backend: {e}")
    else:
        print("\n[Aviso] Pasta 'server' ou venv não encontrados. Pulando backend.")

    # 2. Inicia o Frontend (se existir pasta client)
    frontend_process = None
    client_dir = os.path.join(base_dir, "client")
    
    if os.path.exists(client_dir):
        print("\n[Frontend] Iniciando Interface Web...")
        try:
            # Comando: npm start (ou node server.js se for build de produção)
            # Como o build_installer.ps1 faz 'npm install' e o Inno Setup não mexe no client,
            # assumimos que 'npm start' ou o servidor do Next.js está pronto.
            frontend_process = subprocess.Popen(
                ["cmd", "/c", "npm start"],
                cwd=client_dir,
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            print("✅ Frontend iniciado em segundo plano (Porta 3000).")
        except Exception as e:
            print(f"❌ Erro ao iniciar frontend: {e}")
    else:
        print("\n[Aviso] Pasta 'client' não encontrada. Pulando frontend.")

    # 3. Abre o Navegador
    print("\n[Sistema] Aguardando inicialização dos serviços...")
    time.sleep(5)
    
    url = "http://localhost:3000"
    print(f"🌍 Abrindo o sistema no navegador: {url}")
    webbrowser.open(url)

    print("\n" + "="*60)
    print("  TicketFlow está rodando. Mantenha esta janela aberta.")
    print("="*60)
    print("\nPressione Ctrl+C para encerrar os serviços.")

    try:
        while True:
            time.sleep(1)
            # Verifica se os processos ainda estão rodando
            if backend_process and backend_process.poll() is not None:
                print("⚠️ Backend encerrou inesperadamente.")
                break
            if frontend_process and frontend_process.poll() is not None:
                print("⚠️ Frontend encerrou inesperadamente.")
                break
    except KeyboardInterrupt:
        print("\nEncerrando serviços...")
    finally:
        if backend_process: backend_process.terminate()
        if frontend_process: frontend_process.terminate()
        print("Serviços finalizados.")

if __name__ == "__main__":
    launch()
