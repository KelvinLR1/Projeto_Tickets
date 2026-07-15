"""
whatsapp_channels_helper.py
Auxiliar para os scripts .bat lerem whatsapp-channels.json e gerar
comandos de inicialização/parada para cada canal WhatsApp.

Uso:
  python whatsapp_channels_helper.py start   -> gera _ws_start.bat
  python whatsapp_channels_helper.py stop    -> gera _ws_stop.bat
"""
import json
import os
import sys


def get_channels():
    """Lê os canais do arquivo de configuração. Retorna fallback se vazio ou ausente."""
    f = 'whatsapp-channels.json'
    if os.path.exists(f):
        try:
            channels = json.load(open(f, 'r', encoding='utf-8'))
            if channels:
                return channels
        except Exception:
            pass
    # Fallback: canal padrão na porta 5000 (compatibilidade retroativa)
    return [{'name': 'Principal', 'port': 5000}]


def cmd_start():
    channels = get_channels()
    with open('_ws_start.bat', 'w', encoding='utf-8') as f:
        for c in channels:
            name = c.get('name', 'WhatsApp')
            port = c.get('port', 5000)
            f.write(f'start "WhatsApp - {name}" cmd /k "cd whatsapp-chat && set PORT={port} && npm start"\n')
            f.write(f'ping 127.0.0.1 -n 2 >nul\n')
    count = len(channels)
    print(f'* Iniciando {count} canal(is) WhatsApp...')


def cmd_stop():
    channels = get_channels()
    with open('_ws_stop.bat', 'w', encoding='utf-8') as f:
        for c in channels:
            port = c.get('port', 5000)
            f.write(
                f'for /f "tokens=5" %%a in (\'netstat -aon ^| findstr ":{port}" ^| findstr "LISTENING"\') '
                f'do taskkill /f /pid %%a >nul 2>&1\n'
            )
        f.write('taskkill /f /fi "WINDOWTITLE eq WhatsApp - *" >nul 2>&1\n')
    count = len(channels)
    print(f'* Parando {count} canal(is) WhatsApp...')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python whatsapp_channels_helper.py [start|stop]')
        sys.exit(1)

    action = sys.argv[1].lower()
    if action == 'start':
        cmd_start()
    elif action == 'stop':
        cmd_stop()
    else:
        print(f'Ação desconhecida: {action}')
        sys.exit(1)
