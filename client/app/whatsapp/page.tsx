'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { MessageSquare, RefreshCw, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

type WhatsAppChannel = {
    id: string;
    name: string;
    port: number;
    color: string;
    description?: string;
    sector_id?: number | null;
};

function buildIframeUrl(channel: WhatsAppChannel, user: any): string {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const base = `http://${hostname}:${channel.port}`;
    if (!user) return base;
    const encodedId = encodeURIComponent(user.username);
    const encodedName = encodeURIComponent(user.full_name || user.username);
    return `${base}?operator_id=${encodedId}&operator_name=${encodedName}`;
}

export default function WhatsAppPage() {
    const { user } = useAuth();
    const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

    const fetchChannels = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/whatsapp/channels');
            if (res.ok) {
                const data: WhatsAppChannel[] = await res.json();
                setChannels(data);
                if (data.length > 0 && !activeChannelId) {
                    setActiveChannelId(data[0].id);
                }
            }
        } catch {
            setChannels([]);
        } finally {
            setLoading(false);
        }
    }, [activeChannelId]);

    useEffect(() => {
        fetchChannels();
    }, [user]);

    const handleReload = (channelId: string) => {
        setReloadKeys(prev => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }));
    };

    const activeChannel = channels.find(c => c.id === activeChannelId) ?? channels[0] ?? null;

    if (loading) {
        return (
            <main className="h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin text-accent-theme" />
                    <p className="text-sm font-medium">Carregando canais WhatsApp...</p>
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-theme shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/10">
                        <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h1 className="text-base font-bold tracking-tight">Atendimento WhatsApp</h1>
                        <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
                            Painel Multi-Canal — {channels.length} canal(is) configurado(s)
                        </p>
                    </div>
                </div>

                {activeChannel && (
                    <button
                        onClick={() => handleReload(activeChannel.id)}
                        className="p-2.5 rounded-xl border border-border-theme bg-card hover:bg-card-hover text-[var(--color-text-muted)] hover:text-foreground transition-all flex items-center gap-2 text-xs font-bold active:scale-95"
                        title="Recarregar Painel"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Recarregar
                    </button>
                )}
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
                    const iframeUrl = buildIframeUrl(channel, user);
                    const isActive = channel.id === (activeChannelId ?? channels[0]?.id);
                    return (
                        <div
                            key={channel.id}
                            className={`absolute inset-0 ${isActive ? 'block' : 'hidden'}`}
                        >
                            <iframe
                                key={reloadKeys[channel.id] ?? 0}
                                src={iframeUrl}
                                className="w-full h-full border-none"
                                allow="camera; microphone; clipboard-read; clipboard-write"
                                title={`WhatsApp — ${channel.name}`}
                            />
                        </div>
                    );
                })}
            </div>
        </main>
    );
}
