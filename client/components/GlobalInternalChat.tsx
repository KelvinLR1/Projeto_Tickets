'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, X, Users, Maximize2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

export default function GlobalInternalChat() {
    const { user } = useAuth();
    const { theme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();

    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [iframeLoaded, setIframeLoaded] = useState(false);

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

    // Ouvir mensagens do iframe (ex: Abrir/Fechar drawer, atualização de não lidas ou abrir atendimento compartilhado)
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
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [router]);

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
                    "fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2.5 py-3 px-1.5 rounded-l-xl border-y border-l transition-all duration-300 shadow-xl cursor-pointer group hover:pl-2.5",
                    isOpen ? "translate-x-full pointer-events-none opacity-0" : "translate-x-0 opacity-100",
                    unreadCount > 0 && "ring-2 ring-rose-500/50 shadow-[0_0_25px_rgba(244,63,94,0.4)]"
                )}
                style={{
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-card, #172033) 85%, black), color-mix(in srgb, var(--color-background, #0b0f19) 95%, black))',
                    borderColor: unreadCount > 0 ? '#f43f5e' : 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: unreadCount > 0 
                        ? '0 0 25px rgba(244,63,94,0.4)' 
                        : '0 6px 24px -4px color-mix(in srgb, var(--color-primary-theme, #ef4444) 30%, transparent)'
                }}
                title={unreadCount > 0 ? `Chat Interno: ${unreadCount} mensagem(ns) não lida(s)` : "Chat Interno da Equipe (Alt + C)"}
            >
                <div className="relative flex items-center justify-center">
                    <div 
                        className="w-6 h-6 rounded-lg flex items-center justify-center group-hover:scale-110 transition-all duration-300 relative"
                        style={{
                            background: 'color-mix(in srgb, var(--color-primary-theme, #ef4444) 20%, transparent)',
                            color: 'var(--color-primary-theme, #ef4444)',
                            border: '1px solid color-mix(in srgb, var(--color-primary-theme, #ef4444) 40%, transparent)',
                            boxShadow: '0 0 10px -2px color-mix(in srgb, var(--color-primary-theme, #ef4444) 35%, transparent)'
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
