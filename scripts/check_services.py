"""
check_services.py
Monitora em tempo real a inicialização dos serviços Backend, WhatsApp e Frontend (Next.js),
imprimindo mensagens de status claras para o usuário no terminal.
"""
import urllib.request
import time
import sys
import os

# Configura encoding do terminal para UTF-8 no Windows se necessário
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def check_url(url, timeout=1):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'HealthCheck/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status in [200, 304, 301, 302]
    except Exception:
        return False


def get_status_label(ready, is_frontend):
    if ready:
        return "[ OK - PRONTO ]"
    if is_frontend:
        return "[ COMPILANDO... (pode levar 30-60s na 1ª vez) ]"
    return "[ AGUARDANDO INICIALIZACAO... ]"

def main():
    print("\n====================================================")
    print("* Monitorando inicializacao dos servicos em tempo real...")
    print("====================================================")
    
    services = [
        {"name": "Backend FastAPI (Porta 8080)", "url": "http://localhost:8080/system-settings", "ready": False, "is_frontend": False},
        {"name": "Servidor WhatsApp (Porta 5000)", "url": "http://localhost:5000/api/status", "ready": False, "is_frontend": False},
        {"name": "Frontend Next.js (Porta 3000)", "url": "http://localhost:3000", "ready": False, "is_frontend": True},
    ]

    start_time = time.time()
    max_wait = 90  # tempo máximo de espera em segundos

    last_printed_state = ""

    while time.time() - start_time < max_wait:
        all_ready = True
        current_state_lines = []

        for s in services:
            if not s["ready"]:
                if check_url(s["url"]):
                    s["ready"] = True

            if not s["ready"]:
                all_ready = False

            label = get_status_label(s["ready"], s["is_frontend"])
            current_state_lines.append(f"  * {s['name']}: {label}")

        state_repr = "\n".join(current_state_lines)
        if state_repr != last_printed_state:
            elapsed = int(time.time() - start_time)
            print(f"\n[Status em {elapsed}s]:")
            print(state_repr)
            last_printed_state = state_repr

        if all_ready:
            print("\n====================================================")
            print(">>> TODOS OS SERVICOS ESTAO PRONTOS E OPERANDO! <<<")
            print(">>> Acesse o TicketFlow em: http://localhost:3000   <<<")
            print("====================================================\n")
            return

        time.sleep(2)

    print("\n[!] O tempo de aguarde do monitor expirou, mas os servicos continuam rodando nas janelas separadas.")
    print(">>> Acesse http://localhost:3000 assim que a janela do Frontend concluir a compilacao.\n")

if __name__ == "__main__":
    main()
