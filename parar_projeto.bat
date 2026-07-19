@echo off
title Parar Projeto - TicketFlow
echo ====================================================
echo * Parando todos os servicos do TicketFlow...
echo ====================================================

:: Parar porta 8080 (FastAPI Backend)
echo * Parando Servidor principal na porta 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Parar porta 3000 (Next.js Frontend)
echo * Parando Interface na porta 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Parar canal(is) WhatsApp
echo * Parando Servidor(es) WhatsApp...
server\.venv\Scripts\python.exe scripts\whatsapp_channels_helper.py stop
if exist "_ws_stop.bat" (
    call _ws_stop.bat
    del _ws_stop.bat
) else (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>&1
    )
    taskkill /f /fi "WINDOWTITLE eq WhatsApp - *" >nul 2>&1
)

:: Fechar janelas cmd criadas caso ainda estejam abertas
taskkill /f /fi "WINDOWTITLE eq Backend - FastAPI*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Frontend - Next.js*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq WhatsApp - Node.js*" >nul 2>&1

echo ====================================================
echo * Todos os servicos foram finalizados com sucesso.
echo ====================================================
ping 127.0.0.1 -n 6 >nul
