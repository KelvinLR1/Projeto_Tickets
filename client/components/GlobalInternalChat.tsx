'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, X, Users, Mic, MicOff, PhoneCall, PhoneOff, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

export default function GlobalInternalChat() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [voiceState, setVoiceState] = useState<{
        inCall: boolean;
        session: any;
        incomingCall: any;
    }>({
        inCall: false,
        session: null,
        incomingCall: null
    });

    // Fechar ao pressionar Escape ou alternar com Alt + C
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                setIsOpen(prev => !prev);
            } else if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Ouvir mensagens do iframe (ex: Abrir/Fechar drawer, não lidas, estado de voz)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data) {
                if (event.data.type === 'TICKETFLOW_CLOSE_INTERNAL_CHAT') {
                    setIsOpen(false);
                } else if (event.data.type === 'TICKETFLOW_OPEN_INTERNAL_CHAT') {
                    setIsOpen(true);
                } else if (event.data.type === 'TICKETFLOW_OPEN_WHATSAPP_CHAT') {
                    setIsOpen(false);
                    router.push('/whatsapp');
                } else if (event.data.type === 'TICKETFLOW_INTERNAL_UNREAD_UPDATE') {
                    setUnreadCount(Number(event.data.unreadCount) || 0);
                } else if (event.data.type === 'TICKETFLOW_VOICE_STATE') {
                    setVoiceState({
                        inCall: !!event.data.inCall,
                        session: event.data.session || null,
                        incomingCall: event.data.incomingCall || null
                    });
                }
            }
        };

        window.addEventListener('message', handleMessage);
        if (typeof window !== 'undefined') {
            const fn = (count: number = 1) => {
                setUnreadCount(count);
            };
            (window as any).simulateInternalUnread = fn;
            (window as any).SimulateInternalUnread = fn;
        }
        return () => {
            window.removeEventListener('message', handleMessage);
            if (typeof window !== 'undefined') {
                delete (window as any).simulateInternalUnread;
                delete (window as any).SimulateInternalUnread;
            }
        };
    }, [router]);

    const sendVoiceAction = (action: string) => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'TICKETFLOW_VOICE_ACTION',
                action
            }, '*');
        }
    };

    // Formata os segundos em mm:ss
    const formatVoiceTimer = (sec: number = 0) => {
        const mins = String(Math.floor(sec / 60)).padStart(2, '0');
        const secs = String(sec % 60).padStart(2, '0');
        return `${mins}:${secs}`;
    };

    // Não exibir na tela de login
    if (!user || pathname === '/login') {
        return null;
    }

    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const encodedId = encodeURIComponent(user.username);
    const encodedName = encodeURIComponent(user.full_name || user.username);
    const sectorsJson = user.sectors ? JSON.stringify(user.sectors) : '[]';
    const encodedSectors = encodeURIComponent(sectorsJson);
    const iframeUrl = `http://${hostname}:5000?internal_only=1&operator_id=${encodedId}&operator_name=${encodedName}&sectors=${encodedSectors}&theme=${theme}`;

    return (
        <>
            {/* Gatilho Flutuante Lateral Direito (Dock Button - 100% Sincronizado com o Tema) */}
            <button
                id="btn-global-team-chat-trigger"
                onClick={() => {
                    setIsOpen(true);
                    setUnreadCount(0);
                }}
                className={clsx(
                    "fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2.5 py-3 px-1.5 rounded-l-xl border-y border-l transition-all duration-300 shadow-xl cursor-pointer group hover:pl-2.5 overflow-visible",
                    isOpen ? "translate-x-full pointer-events-none opacity-0" : "translate-x-0 opacity-100"
                )}
                style={{
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-card, #172033) 85%, black), color-mix(in srgb, var(--color-background, #0b0f19) 95%, black))',
                    backdropFilter: 'blur(20px)',
                    borderColor: unreadCount > 0 ? '#ef4444' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent)',
                    boxShadow: unreadCount > 0 ? '0 0 16px rgba(239, 68, 68, 0.6)' : '0 6px 24px -4px color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent)'
                }}
                title={unreadCount > 0 ? `Chat Interno: ${unreadCount} mensagem(ns) não lida(s)` : "Chat Interno da Equipe (Alt + C)"}
            >
                {/* Borda Vermelha Neon Pulsante/Piscando Ativamente */}
                {unreadCount > 0 && (
                    <span 
                        className="absolute inset-0 rounded-l-xl pointer-events-none animate-pulse"
                        style={{
                            borderTop: '2.5px solid #ef4444',
                            borderBottom: '2.5px solid #ef4444',
                            borderLeft: '2.5px solid #ef4444',
                            boxShadow: '0 0 22px 3px #ef4444, 0 0 45px 8px rgba(239, 68, 68, 0.75), inset 0 0 14px rgba(239, 68, 68, 0.5)'
                        }}
                    />
                )}
                <div className="relative flex items-center justify-center">
                    <div 
                        className="w-6 h-6 rounded-lg flex items-center justify-center group-hover:scale-110 transition-all duration-300 relative"
                        style={{
                            background: unreadCount > 0 
                                ? 'rgba(244, 63, 94, 0.25)' 
                                : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 20%, transparent)',
                            color: unreadCount > 0 ? '#fb7185' : 'var(--color-primary-theme, #ef4444)',
                            border: unreadCount > 0 
                                ? '1px solid rgba(244, 63, 94, 0.6)' 
                                : '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent)',
                            boxShadow: unreadCount > 0 
                                ? '0 0 14px rgba(244, 63, 94, 0.6)' 
                                : '0 0 10px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'
                        }}
                    >
                        <Users className="w-3.5 h-3.5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg shadow-rose-500/80 border-2 border-[var(--color-card,#0f172a)] animate-bounce">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </div>
                </div>
                <span 
                    className="text-[10px] font-black tracking-widest uppercase select-none [writing-mode:vertical-lr] rotate-180 transition-colors group-hover:text-[var(--color-primary-theme,#ef4444)]"
                    style={{ color: 'var(--color-foreground, #ffffff)' }}
                >
                    Equipe
                </span>
            </button>

            {/* BARRA FLUTUANTE GLOBAL DE CHAMADA ATIVA (Visível em qualquer tela do portal quando a gaveta estiver fechada) */}
            {voiceState.inCall && !isOpen && (
                <div 
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-2xl text-foreground select-none animate-bounce-in"
                    style={{
                        background: 'color-mix(in srgb, var(--color-card, #172033) 92%, black)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        borderColor: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, var(--border-color, rgba(255,255,255,0.15)))',
                        boxShadow: '0 16px 40px -6px rgba(0,0,0,0.8), 0 0 20px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent)'
                    }}
                >
                    {/* Indicador Pulsante e Status */}
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span 
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                                style={{ backgroundColor: 'var(--color-primary-theme, #ef4444)' }}
                            />
                            <span 
                                className="relative inline-flex rounded-full h-3 w-3"
                                style={{ backgroundColor: 'var(--color-primary-theme, #ef4444)' }}
                            />
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-extrabold text-foreground truncate max-w-[140px] md:max-w-[190px]">
                                    {voiceState.session?.title || 'Chamada de Voz'}
                                </h4>
                                <span 
                                    className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md"
                                    style={{
                                        background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent)',
                                        color: 'var(--color-primary-theme, #ef4444)',
                                        border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent)'
                                    }}
                                >
                                    {formatVoiceTimer(voiceState.session?.seconds || 0)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-0.5" />

                    {/* Botões de Ação na Barra Flutuante Global */}
                    <div className="flex items-center gap-1.5">
                        {/* Botão Mutar */}
                        <button
                            type="button"
                            onClick={() => sendVoiceAction('toggle_mute')}
                            className={clsx(
                                "h-8 px-2.5 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none",
                                voiceState.session?.isMuted
                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                    : "bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white border-white/10"
                            )}
                            title="Mutar / Desmutar Microfone"
                        >
                            {voiceState.session?.isMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5" />}
                            <span className="hidden sm:inline">{voiceState.session?.isMuted ? 'Desmutar' : 'Mutar'}</span>
                        </button>

                        {/* Botão Abrir Chat / Detalhes da Chamada */}
                        <button
                            type="button"
                            onClick={() => setIsOpen(true)}
                            className="h-8 px-2.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none"
                            style={{
                                background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)',
                                color: 'var(--color-foreground, #fff)'
                            }}
                            title="Abrir detalhes da conversa e participantes"
                        >
                            <PhoneCall className="w-3.5 h-3.5" style={{ color: 'var(--color-primary-theme, #ef4444)' }} />
                            <span className="hidden sm:inline">Abrir Chamada</span>
                        </button>

                        {/* Botão Sair / Desconectar */}
                        <button
                            type="button"
                            onClick={() => sendVoiceAction('leave_call')}
                            className="h-8 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition-all active:scale-95 flex items-center gap-1.5 text-xs font-extrabold cursor-pointer select-none"
                            title="Desconectar da chamada"
                        >
                            <PhoneOff className="w-3.5 h-3.5" />
                            <span>Sair</span>
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL GLOBAL DE CHAMADA RECEBIDA (Centralizado e proeminente em qualquer tela) */}
            {voiceState.incomingCall && !isOpen && (
                <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
                    <div 
                        className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl border animate-bounce-in"
                        style={{
                            background: 'color-mix(in srgb, var(--color-card, #172033) 96%, black)',
                            borderColor: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 45%, var(--border-color, rgba(255,255,255,0.15)))',
                            boxShadow: '0 24px 60px -8px rgba(0,0,0,0.9), 0 0 35px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'
                        }}
                    >
                        {/* Avatar com Onda de Áudio Pulsante */}
                        <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
                            <span 
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" 
                                style={{ backgroundColor: 'var(--color-primary-theme, #ef4444)' }}
                            />
                            <div 
                                className="relative w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl text-white shadow-xl border-2 border-white/20 overflow-hidden"
                                style={{ background: 'var(--color-primary-theme, #ef4444)' }}
                            >
                                {voiceState.incomingCall.caller_avatar ? (
                                    <img src={voiceState.incomingCall.caller_avatar} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    voiceState.incomingCall.caller_name ? voiceState.incomingCall.caller_name.charAt(0).toUpperCase() : 'U'
                                )}
                            </div>
                        </div>

                        <span 
                            className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2"
                            style={{
                                background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 20%, transparent)',
                                color: 'var(--color-primary-theme, #ef4444)',
                                border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'
                            }}
                        >
                            {voiceState.incomingCall.is_escalated ? 'Convite de Voz em Grupo' : (voiceState.incomingCall.type === 'group' ? 'Chamada em Grupo' : 'Chamada de Voz Recebida')}
                        </span>

                        <h3 className="text-base font-extrabold text-foreground truncate max-w-full">
                            {voiceState.incomingCall.caller_name || 'Colega'}
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-[260px]">
                            {voiceState.incomingCall.is_escalated 
                                ? `${voiceState.incomingCall.caller_name} convidou você para a chamada em grupo.`
                                : 'Deseja iniciar bate-papo de voz com você.'}
                        </p>

                        {/* Botões Atender / Recusar */}
                        <div className="flex items-center gap-3 w-full mt-6">
                            <button
                                type="button"
                                onClick={() => sendVoiceAction('reject_call')}
                                className="flex-1 py-3 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-white border border-rose-500/30 transition-all font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                            >
                                <PhoneOff className="w-4 h-4" />
                                <span>Recusar</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(true);
                                    sendVoiceAction('accept_call');
                                }}
                                className="flex-1 py-3 rounded-2xl font-black text-xs text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all active:scale-95 animate-pulse"
                                style={{
                                    background: 'var(--color-primary-theme, #10b981)',
                                    boxShadow: '0 10px 25px -4px color-mix(in srgb, var(--color-primary-theme, #10b981) 40%, transparent)'
                                }}
                            >
                                <PhoneCall className="w-4 h-4" />
                                <span>Atender</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Backdrop com Blur */}
            <div
                onClick={() => setIsOpen(false)}
                className={clsx(
                    "fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            />

            {/* Gaveta Retrátil do Chat Interno — Ocupa 50% da Tela (Metade da Tela) */}
            <aside
                className={clsx(
                    "fixed top-0 right-0 bottom-0 w-full md:w-1/2 lg:w-1/2 z-50 flex flex-col shadow-2xl overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] border-l bg-slate-950",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
                style={{
                    borderColor: 'var(--border-color, rgba(255,255,255,0.1))'
                }}
            >
                {/* Conteúdo Iframe do Chat Interno 100% Sólido e Isolado */}
                <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950">
                    <iframe
                        ref={iframeRef}
                        src={iframeUrl}
                        className="w-full h-full border-none bg-slate-950"
                        allow="microphone; clipboard-read; clipboard-write"
                        title="Chat Interno TicketFlow"
                    />
                </div>
            </aside>
        </>
    );
}

