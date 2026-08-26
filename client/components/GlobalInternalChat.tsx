'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, X, Users, Mic, MicOff, PhoneCall, PhoneOff, UserPlus, Radio } from 'lucide-react';
import clsx from 'clsx';

export default function GlobalInternalChat() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isVoiceDockOpen, setIsVoiceDockOpen] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleDockMouseEnter = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (voiceState.inCall) {
            setIsVoiceDockOpen(true);
        }
    };

    const handleDockMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsVoiceDockOpen(false);
        }, 200);
    };

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
                setIsOpen(prev => {
                    setIsVoiceDockOpen(false);
                    return !prev;
                });
            } else if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setIsVoiceDockOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Garantir que o painel de hover inicie 100% recolhido e fechado ao alternar a gaveta do chat ou sair de chamada
    useEffect(() => {
        setIsVoiceDockOpen(false);
    }, [isOpen, voiceState.inCall]);

    // Ouvir mensagens do iframe (ex: Abrir/Fechar drawer, não lidas, estado de voz)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data) {
                if (event.data.type === 'TICKETFLOW_CLOSE_INTERNAL_CHAT') {
                    setIsOpen(false);
                    setIsVoiceDockOpen(false);
                } else if (event.data.type === 'TICKETFLOW_OPEN_INTERNAL_CHAT') {
                    setIsOpen(true);
                    setIsVoiceDockOpen(false);
                } else if (event.data.type === 'TICKETFLOW_OPEN_WHATSAPP_CHAT') {
                    setIsOpen(false);
                    setIsVoiceDockOpen(false);
                    router.push('/whatsapp');
                } else if (event.data.type === 'TICKETFLOW_INTERNAL_UNREAD_UPDATE') {
                    setUnreadCount(Number(event.data.unreadCount) || 0);
                } else if (event.data.type === 'TICKETFLOW_VOICE_STATE') {
                    const raw = event.data.state || event.data;
                    const inCall = !!raw.inCall;
                    if (!inCall) {
                        setIsVoiceDockOpen(false);
                    }
                    setVoiceState({
                        inCall,
                        session: raw.session || null,
                        incomingCall: raw.incomingCall || null
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

    const requestVoiceState = () => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'TICKETFLOW_REQUEST_VOICE_STATE'
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
            {/* DOCK LATERAL DIREITO DO CHAT / CHAMADA ATIVA */}
            {!isOpen && (
                <div 
                    className="fixed right-0 top-1/2 -translate-y-1/2 z-[9990] flex items-center group/dock"
                    onMouseEnter={handleDockMouseEnter}
                    onMouseLeave={handleDockMouseLeave}
                >
                    {/* PAINEL FLUTUANTE DE VOZ (Visual Ultra-Premium / Glassmorphism) */}
                    {voiceState.inCall && (
                        <div 
                            className={clsx(
                                "absolute right-full mr-3 flex flex-col gap-3 p-4 rounded-3xl border shadow-2xl text-foreground select-none w-72 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                                isVoiceDockOpen 
                                    ? "translate-x-0 opacity-100 pointer-events-auto scale-100" 
                                    : "translate-x-4 opacity-0 pointer-events-none scale-95"
                            )}
                            style={{
                                background: 'linear-gradient(145deg, color-mix(in srgb, var(--color-card, #172033) 94%, black), color-mix(in srgb, var(--color-background, #0b0f19) 98%, black))',
                                backdropFilter: 'blur(28px) saturate(190%)',
                                WebkitBackdropFilter: 'blur(28px) saturate(190%)',
                                borderColor: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, var(--border-color, rgba(255,255,255,0.12)))',
                                boxShadow: '0 24px 50px -12px rgba(0, 0, 0, 0.9), 0 0 25px -4px color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
                            }}
                        >
                            {/* Header do Card: Ícone de Transmissão/Voz + Nome da Sala + Timer Monospace */}
                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
                                <div className="flex items-center gap-2 min-w-0">
                                    {/* Ícone de Chamada Ativa (Sincronizado com o Tema) */}
                                    <div 
                                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
                                        style={{
                                            background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 18%, transparent)',
                                            border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'
                                        }}
                                    >
                                        <Radio 
                                            className="w-3.5 h-3.5 animate-pulse" 
                                            style={{ color: 'var(--color-primary-theme, #ef4444)' }} 
                                        />
                                    </div>
                                    <h4 className="text-xs font-black text-slate-100 truncate tracking-tight" title={voiceState.session?.title || 'Sala de Voz'}>
                                        {voiceState.session?.title || 'Sala de Voz'}
                                    </h4>
                                </div>
                                <span 
                                    className="text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full shrink-0 shadow-sm"
                                    style={{
                                        background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 15%, transparent)',
                                        color: 'var(--color-primary-theme, #ef4444)',
                                        border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)',
                                        boxShadow: '0 0 10px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent)'
                                    }}
                                >
                                    {formatVoiceTimer(voiceState.session?.seconds || 0)}
                                </span>
                            </div>

                            {/* Participantes Conectados */}
                            {voiceState.session?.participants && voiceState.session.participants.length > 0 && (
                                <div className="flex items-center justify-between px-0.5 py-0.5">
                                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">
                                        Participantes ({voiceState.session.participants.length})
                                    </span>
                                    <div className="flex items-center -space-x-2 overflow-hidden">
                                        {voiceState.session.participants.map((p: any, idx: number) => {
                                            const initial = p.operatorName ? p.operatorName.charAt(0).toUpperCase() : 'U';
                                            const isSpeaking = p.isSpeaking;
                                            return (
                                                <div 
                                                    key={idx}
                                                    className={clsx(
                                                        "relative w-7 h-7 rounded-full flex items-center justify-center font-black text-[11px] shrink-0 border-2 border-[#090d16] transition-transform duration-200 overflow-hidden shadow-sm",
                                                        isSpeaking && "scale-110 z-10 animate-pulse",
                                                        p.isMuted && "opacity-60"
                                                    )}
                                                    style={{ 
                                                        background: 'linear-gradient(135deg, var(--color-primary-theme, #ef4444), color-mix(in srgb, var(--color-primary-theme, #ef4444) 65%, black))',
                                                        boxShadow: isSpeaking ? '0 0 0 2px var(--color-primary-theme, #ef4444)' : undefined
                                                    }}
                                                    title={`${p.operatorName || 'Participante'} ${p.isMuted ? '(Mutado)' : (isSpeaking ? '(Falando...)' : '')}`}
                                                >
                                                    {p.avatar ? (
                                                        <img src={p.avatar} alt={p.operatorName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-white drop-shadow">{initial}</span>
                                                    )}
                                                    {p.isMuted && (
                                                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 border border-[#090d16]" />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Controles de Ação — Grid 2x2 Clean & Tátil */}
                            <div className="grid grid-cols-2 gap-2 pt-0.5">
                                {/* Botão Mutar / Desmutar */}
                                <button
                                    type="button"
                                    onClick={() => sendVoiceAction('toggle_mute')}
                                    className={clsx(
                                        "h-8 px-2.5 rounded-xl border transition-all duration-200 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer select-none shadow-sm hover:-translate-y-0.5 active:translate-y-0",
                                        voiceState.session?.isMuted
                                            ? "bg-rose-500/15 text-rose-300 border-rose-500/35 hover:bg-rose-500/25 shadow-rose-500/10"
                                            : "bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border-white/[0.1] hover:border-white/[0.2]"
                                    )}
                                    title="Mutar / Desmutar Microfone"
                                >
                                    {voiceState.session?.isMuted ? (
                                        <MicOff className="w-3.5 h-3.5 text-rose-400" />
                                    ) : (
                                        <Mic className="w-3.5 h-3.5" style={{ color: 'var(--color-primary-theme, #ef4444)' }} />
                                    )}
                                    <span>{voiceState.session?.isMuted ? 'Desmutar' : 'Mutar'}</span>
                                </button>

                                {/* Botão Convidar */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsOpen(true);
                                        sendVoiceAction('open_invite_modal');
                                    }}
                                    className="h-8 px-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] hover:border-white/[0.2] text-slate-200 hover:text-white shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                                    title="Convidar colega para esta chamada"
                                >
                                    <UserPlus className="w-3.5 h-3.5 text-sky-400" />
                                    <span>Convidar</span>
                                </button>

                                {/* Botão Abrir Chat */}
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(true)}
                                    className="h-8 px-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer select-none bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] hover:border-white/[0.2] text-slate-200 hover:text-white shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                                    title="Abrir detalhes da conversa e participantes"
                                >
                                    <PhoneCall className="w-3.5 h-3.5" style={{ color: 'var(--color-primary-theme, #ef4444)' }} />
                                    <span>Abrir Chat</span>
                                </button>

                                {/* Botão Sair */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsVoiceDockOpen(false);
                                        sendVoiceAction('leave_call');
                                    }}
                                    className="h-8 px-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md shadow-rose-500/25 transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-xs font-black cursor-pointer select-none hover:-translate-y-0.5 active:translate-y-0"
                                    title="Desconectar da chamada"
                                >
                                    <PhoneOff className="w-3.5 h-3.5" />
                                    <span>Sair</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ABA LATERAL DIREITA (Opção 3: Mini-Aba com expansão suave em hover) */}
                    <button
                        type="button"
                        onClick={() => {
                            setIsVoiceDockOpen(false);
                            setIsOpen(prev => !prev);
                        }}
                        className={clsx(
                            "flex flex-col items-center gap-2 py-3.5 px-2.5 rounded-l-2xl border-l border-t border-b shadow-2xl cursor-pointer relative transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none",
                            "before:absolute before:-left-6 before:-top-6 before:-bottom-6 before:right-0 before:content-['']",
                            voiceState.inCall || unreadCount > 0
                                ? "translate-x-0 opacity-100 shadow-2xl"
                                : "translate-x-[calc(100%-9px)] opacity-70 group-hover/dock:translate-x-0 hover:translate-x-0 hover:opacity-100 focus-visible:translate-x-0 focus-visible:opacity-100"
                        )}
                        style={{
                            background: voiceState.inCall 
                                ? 'linear-gradient(180deg, color-mix(in srgb, var(--color-primary-theme, #ef4444) 22%, #0b0f19), color-mix(in srgb, var(--color-primary-theme, #ef4444) 10%, #030712))'
                                : 'color-mix(in srgb, var(--color-card, #172033) 92%, black)',
                            borderColor: voiceState.inCall 
                                ? 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 60%, var(--border-color, rgba(255,255,255,0.15)))' 
                                : 'var(--border-color, rgba(255,255,255,0.15))',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)'
                        }}
                        title={
                            voiceState.inCall 
                                ? `Chamada Ativa (${formatVoiceTimer(voiceState.session?.seconds || 0)}) - Passe o mouse para controles`
                                : unreadCount > 0
                                    ? `Chat Interno: ${unreadCount} mensagem(ns) não lida(s)`
                                    : "Chat Interno da Equipe (Alt + C)"
                        }
                        data-tooltip-pos="left"
                    >
                        {/* Borda Neon Pulsante para Chamada Ativa ou Não Lidas */}
                        {(voiceState.inCall || unreadCount > 0) && (
                            <span 
                                className="absolute inset-0 rounded-l-xl pointer-events-none animate-pulse"
                                style={{
                                    borderTop: '2.5px solid var(--color-primary-theme, #ef4444)',
                                    borderBottom: '2.5px solid var(--color-primary-theme, #ef4444)',
                                    borderLeft: '2.5px solid var(--color-primary-theme, #ef4444)',
                                    boxShadow: '0 0 22px 3px var(--color-primary-theme, #ef4444), 0 0 45px 8px color-mix(in srgb, var(--color-primary-theme, #ef4444) 75%, transparent), inset 0 0 14px color-mix(in srgb, var(--color-primary-theme, #ef4444) 50%, transparent)'
                                }}
                            />
                        )}
                        <div className="relative flex items-center justify-center">
                            <div 
                                className={clsx(
                                    "w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-300 relative",
                                    isVoiceDockOpen && "scale-110"
                                )}
                                style={{
                                    background: voiceState.inCall
                                        ? 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 22%, transparent)'
                                        : unreadCount > 0 
                                            ? 'rgba(244, 63, 94, 0.25)' 
                                            : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 20%, transparent)',
                                    color: 'var(--color-primary-theme, #ef4444)',
                                    border: voiceState.inCall
                                        ? '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 55%, transparent)'
                                        : unreadCount > 0 
                                            ? '1px solid rgba(244, 63, 94, 0.6)' 
                                            : '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent)',
                                    boxShadow: '0 0 14px color-mix(in srgb, var(--color-primary-theme, #ef4444) 50%, transparent)'
                                }}
                            >
                                {voiceState.inCall ? (
                                    <Radio className="w-3.5 h-3.5 animate-pulse" style={{ color: 'var(--color-primary-theme, #ef4444)' }} />
                                ) : (
                                    <Users className="w-3.5 h-3.5" />
                                )}

                                {unreadCount > 0 && !voiceState.inCall && (
                                    <span className="absolute -top-2 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center shadow-lg shadow-rose-500/80 border-2 border-[var(--color-card,#0f172a)] animate-bounce">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </div>
                        </div>
                        <span 
                            className="text-[10px] font-black tracking-widest uppercase select-none [writing-mode:vertical-lr] rotate-180 transition-colors"
                            style={{ color: 'var(--color-primary-theme, #ef4444)' }}
                        >
                            {voiceState.inCall ? 'Em Call' : 'Equipe'}
                        </span>
                    </button>
                </div>
            )}

            {/* MODAL GLOBAL DE CHAMADA RECEBIDA (Centralizado e proeminente em QUALQUER tela) */}
            {voiceState.incomingCall && !isOpen && (
                <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-300">
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
                                    <img src={voiceState.incomingCall.caller_avatar} alt="Caller" className="w-full h-full object-cover rounded-full" />
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
                        allow="camera; microphone; autoplay; clipboard-read; clipboard-write; display-capture"
                        aria-label="Chat Interno TicketFlow"
                        onLoad={requestVoiceState}
                    />
                </div>
            </aside>
        </>
    );
}
