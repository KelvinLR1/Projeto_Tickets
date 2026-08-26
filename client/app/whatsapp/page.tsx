'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { MessageSquare, RefreshCw, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';

type WhatsAppChannel = {
    id: string;
    name: string;
    port: number;
    color: string;
    description?: string;
    sector_id?: number | null;
    sector_ids?: number[] | null;
    all_sectors?: boolean;
};

function buildIframeUrl(channel: WhatsAppChannel, user: any, theme: string): string {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const base = `http://${hostname}:${channel.port}`;
    if (!user) return `${base}?theme=${theme}`;
    const encodedId = encodeURIComponent(user.username);
    const encodedName = encodeURIComponent(user.full_name || user.username);
    const sectorsJson = user.sectors ? JSON.stringify(user.sectors) : '[]';
    const encodedSectors = encodeURIComponent(sectorsJson);
    return `${base}?operator_id=${encodedId}&operator_name=${encodedName}&sectors=${encodedSectors}&theme=${theme}`;
}

const DEFAULT_CHANNEL: WhatsAppChannel = { id: 'default', name: 'WhatsApp', port: 5000, color: '#8b5cf6' };

export default function WhatsAppPage() {
    const { user, loading: authLoading } = useAuth();
    const { theme } = useTheme();
    const [channels, setChannels] = useState<WhatsAppChannel[]>([DEFAULT_CHANNEL]);
    const [loading, setLoading] = useState(false);
    const [activeChannelId, setActiveChannelId] = useState<string | null>('default');
    const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

    // Estado indicando se o atendente está em atendimento ativo ou pausado
    const [isAttending, setIsAttending] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('user_attending');
            return saved !== 'false';
        }
        return true;
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('user_attending', String(isAttending));
        }
    }, [isAttending]);

    const fetchChannels = useCallback(async () => {
        try {
            const res = await fetch('/api/whatsapp/channels');
            if (res.ok) {
                const data: WhatsAppChannel[] = await res.json();
                if (data && data.length > 0) {
                    let accessibleChannels = data;

                    // Se o usuário não for ADMIN/ROOT, filtrar canais autorizados para os seus setores
                    const isSuperUser = user?.role === 'ADMIN' || user?.role === 'ROOT';
                    if (!isSuperUser && user?.sectors && user.sectors.length > 0) {
                        const userSectorIds = user.sectors.map(s => Number(s.id));
                        accessibleChannels = data.filter(c => {
                            // Canal livre para todos os setores
                            if (c.all_sectors || (!c.sector_ids?.length && !c.sector_id)) {
                                return true;
                            }
                            // Canal com múltiplos setores vinculados
                            if (Array.isArray(c.sector_ids) && c.sector_ids.length > 0) {
                                return c.sector_ids.some(secId => userSectorIds.includes(Number(secId)));
                            }
                            // Canal com setor único legado
                            if (c.sector_id) {
                                return userSectorIds.includes(Number(c.sector_id));
                            }
                            return true;
                        });
                    }

                    if (accessibleChannels.length > 0) {
                        setChannels(accessibleChannels);
                        if (!accessibleChannels.some(c => c.id === activeChannelId)) {
                            setActiveChannelId(accessibleChannels[0].id);
                        }
                    } else {
                        setChannels([]);
                    }
                }
            }
        } catch {
            // Permanece com o canal padrão
        }
    }, [activeChannelId, user]);

    useEffect(() => {
        fetchChannels();
    }, [user]);

    const handleReload = (channelId: string) => {
        setReloadKeys(prev => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }));
    };

    const activeChannel = channels.find(c => c.id === activeChannelId) ?? channels[0] ?? null;

    const [channelStatus, setChannelStatus] = useState<{ status: string; qr: string | null } | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!activeChannel) return;
        try {
            const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
            const wsUrl = `http://${hostname}:${activeChannel.port}`;
            const response = await fetch(`/api/whatsapp/status?url=${encodeURIComponent(wsUrl)}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setChannelStatus(data);
            }
        } catch {
            setChannelStatus(null);
        }
    }, [activeChannel]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 4000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const iframeUrls = useMemo(() => {
        const urls: Record<string, string> = {};
        channels.forEach(channel => {
            urls[channel.id] = buildIframeUrl(channel, user, theme);
        });
        return urls;
    }, [channels, user, theme]);

    if (loading || authLoading) {
        return (
            <main className="h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin text-accent-theme" />
                    <p className="text-sm font-medium">Carregando painel de atendimento...</p>
                </div>
            </main>
        );
    }

    if (channels.length === 0) {
        return (
            <main className="h-screen flex flex-col items-center justify-center bg-background text-foreground gap-6 p-8">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-violet-600/20 to-indigo-600/20 border border-violet-500/20 flex items-center justify-center">
                    <MessageSquare className="w-10 h-10 text-violet-400" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                    <h2 className="text-xl font-bold text-foreground">Nenhum Canal Configurado</h2>
                    <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        Configure ao menos um canal de WhatsApp nos Ajustes para começar a atender seus clientes.
                    </p>
                </div>
                <a
                    href="/settings"
                    className="flex items-center gap-2 px-5 py-2.5 bg-accent-theme text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    Ir para Ajustes
                </a>
            </main>
        );
    }

    return (
        <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme px-8 py-5 shrink-0 bg-background/30 backdrop-blur-md">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                        Painel de <span className="text-accent-theme">Atendimento</span>
                    </h1>
                    <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">
                        Painel Multi-Canal — {channels.length} canal(is) configurado(s)
                    </p>
                </div>

                <div className="flex flex-col items-end gap-3">
                    {/* Linha Superior: Atendente e Switch */}
                    <div className="flex items-center gap-3">
                        {user && (
                            <div className="flex items-center gap-2 px-3 h-[38px] rounded-xl bg-card border border-border-theme text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                                <span className={`w-1.5 h-1.5 rounded-full ${isAttending ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                                Atendente: {user.full_name || user.username}
                            </div>
                        )}
                        
                        {/* Switch de Status de Atendimento */}
                        <div className="flex items-center justify-center gap-2 px-3 w-[130px] h-[38px] bg-card border border-border-theme rounded-xl">
                            <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)] select-none w-[60px] text-center inline-block">
                                {isAttending ? 'Atendendo' : 'Pausado'}
                            </span>
                            <button
                                onClick={() => setIsAttending(!isAttending)}
                                className={`relative inline-flex h-4.5 w-8.5 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    isAttending ? 'bg-emerald-500' : 'bg-gray-700'
                                }`}
                                title={isAttending ? 'Pausar Atendimento' : 'Ficar Disponível'}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        isAttending ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Linha Inferior: Status do Canal e Botão Recarregar */}
                    <div className="flex items-center gap-3">
                        {channelStatus && (
                            <div className={`flex items-center gap-1.5 px-3 h-[38px] rounded-xl border text-[10px] font-black uppercase tracking-wider ${
                                channelStatus.status === 'pronto' || channelStatus.status === 'autenticado'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : channelStatus.status === 'aguardando_qr'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                    channelStatus.status === 'pronto' || channelStatus.status === 'autenticado'
                                        ? 'bg-emerald-400'
                                        : channelStatus.status === 'aguardando_qr'
                                            ? 'bg-amber-400'
                                            : 'bg-red-400'
                                }`} />
                                {channelStatus.status === 'pronto' || channelStatus.status === 'autenticado'
                                    ? 'Conectado'
                                    : channelStatus.status === 'aguardando_qr'
                                        ? 'QR Code Pendente'
                                        : 'Desconectado'}
                            </div>
                        )}
                        {activeChannel && (
                            <button
                                onClick={() => handleReload(activeChannel.id)}
                                className="w-[130px] h-[38px] rounded-xl border border-border-theme bg-card hover:bg-card-hover text-[var(--color-text-muted)] hover:text-foreground transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-wider active:scale-95 cursor-pointer"
                                title="Recarregar Painel"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Recarregar
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Channel Tabs */}
            {channels.length > 1 && (
                <div className="flex items-center gap-1 px-4 py-2 border-b border-border-theme bg-card/40 shrink-0 overflow-x-auto">
                    {channels.map(channel => (
                        <button
                            key={channel.id}
                            onClick={() => setActiveChannelId(channel.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                activeChannelId === channel.id
                                    ? 'bg-accent-theme text-white shadow-sm'
                                    : 'text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5'
                            }`}
                        >
                            <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: channel.color || '#8b5cf6' }}
                            />
                            {channel.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Iframe Area — render all iframes, show only active one */}
            <div className="flex-1 relative overflow-hidden">
                {channels.map(channel => {
                    const iframeUrl = iframeUrls[channel.id];
                    const isActive = channel.id === (activeChannelId ?? channels[0]?.id);
                    return (
                        <div
                            key={channel.id}
                            className={`absolute inset-0 bg-background ${isActive ? 'block' : 'hidden'}`}
                        >
                            <iframe
                                key={reloadKeys[channel.id] ?? 0}
                                src={iframeUrl}
                                className="w-full h-full border-none bg-transparent transition-opacity duration-300 opacity-0"
                                onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                                allow="camera; microphone; autoplay; clipboard-read; clipboard-write; display-capture"
                                aria-label={`WhatsApp — ${channel.name}`}
                            />
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
