'use client';

import React, { useEffect, useState } from 'react';
import { getTickets, Ticket, updateTicket, getCurrentUser, User } from '@/lib/api';
import { Monitor, Clock, User as UserIcon, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Link from 'next/link';

export default function MonitorPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    const fetchTickets = async () => {
        try {
            const data = await getTickets({ unassignedOnly: true, excludeFinalized: true });

            // Define weights for each priority level
            const priorityWeights: Record<string, number> = {
                'crítica': 1,
                'critical': 1,
                'alta': 2,
                'high': 2,
                'média': 3,
                'medium': 3,
                'baixa': 4,
                'low': 4
            };

            // Sorting by priority weight
            const sortedData = data.sort((a, b) => {
                const weightA = priorityWeights[a.priority?.toLowerCase()] || 99;
                const weightB = priorityWeights[b.priority?.toLowerCase()] || 99;

                if (weightA !== weightB) {
                    return weightA - weightB;
                }

                // Secondary sort: oldest first (to keep FIFO within same priority)
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

            setTickets(sortedData);
        } catch (error) {
            console.error('Erro ao buscar tickets:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchUser = async () => {
        try {
            const user = await getCurrentUser();
            setCurrentUser(user);
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
        }
    };

    useEffect(() => {
        fetchTickets();
        fetchUser();

        // Auto-refresh a cada 30 segundos
        const ticketInterval = setInterval(fetchTickets, 30000);
        // Relógio a cada 1 segundo
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

        return () => {
            clearInterval(ticketInterval);
            clearInterval(clockInterval);
        };
    }, []);

    const handleClaim = async (ticketId: number) => {
        if (!currentUser) {
            alert('Você precisa estar logado para assumir um ticket.');
            return;
        }

        try {
            await updateTicket(ticketId, { assigned_user_id: currentUser.id });
            alert('Ticket assumido com sucesso!');
            fetchTickets(); // Atualiza a lista
        } catch (error) {
            alert('Erro ao assumir ticket.');
            console.error(error);
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'crítica':
            case 'critical':
                return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'alta':
            case 'high':
                return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            case 'média':
            case 'medium':
                return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            default:
                return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
        }
    };

    if (loading && tickets.length === 0) {
        return (
            <div className="h-screen bg-background flex items-center justify-center">
                <div className="text-accent-theme animate-pulse flex flex-col items-center gap-4">
                    <Monitor className="w-12 h-12" />
                    <p className="font-black uppercase tracking-[0.3em] text-sm">Carregando Fila...</p>
                </div>
            </div>
        );
    }

    return (
        <main className="h-screen bg-background text-foreground p-10 overflow-hidden flex flex-col gap-10">
            {/* Header / Top Bar */}
            <div className="flex items-center justify-between border-b border-border-theme pb-10 flex-shrink-0">
                <div className="flex items-center gap-6">
                    <Link
                        href="/"
                        className="p-4 bg-card hover:bg-card-hover rounded-3xl text-[var(--color-text-muted)] hover:text-foreground transition-all group mr-2 border border-border-theme shadow-lg"
                        title="Voltar ao Dashboard"
                    >
                        <ArrowLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                    <div className="p-4 bg-accent-theme/10 rounded-3xl text-accent-theme border border-accent-theme/20">
                        <Monitor className="w-10 h-10" />
                    </div>
                    <div>
                        <h1 className="text-6xl font-black font-display tracking-tight italic uppercase">
                            Fila de <span className="text-accent-theme">Atendimento</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] font-medium tracking-widest uppercase text-xs mt-2">
                            Aguardando atribuição técnica • {tickets.length} chamados ativos
                        </p>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-5xl font-black font-mono tracking-tighter tabular-nums">
                        {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-accent-theme font-bold uppercase tracking-widest text-sm">
                        {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                    </div>
                </div>
            </div>

            {/* Tickets Grid */}
            <div className="flex-1 overflow-y-auto pr-6 pt-6 custom-scrollbar">
                {tickets.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-6 opacity-30">
                        <CheckCircle2 className="w-24 h-24" />
                        <p className="text-2xl font-black uppercase tracking-widest italic text-[var(--color-text-muted)]">Tudo limpo por aqui!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-12 p-2">
                        <AnimatePresence mode="popLayout">
                            {tickets.map((ticket) => (
                                <motion.div
                                    key={ticket.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                                    className="glass-card p-8 rounded-[2.5rem] flex flex-col gap-6 relative group transition-all hover:scale-[1.02] hover:shadow-accent-theme/5"
                                >
                                    <div className="flex justify-between items-start gap-4">
                                        <div className={clsx(
                                            "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                            getPriorityColor(ticket.priority)
                                        )}>
                                            {ticket.priority}
                                        </div>
                                        <div className="text-[var(--color-text-muted)] font-mono text-sm opacity-50">
                                            {ticket.id}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h2 className="text-2xl font-black leading-tight group-hover:text-accent-theme transition-colors line-clamp-2">
                                            {ticket.title}
                                        </h2>
                                        <p className="text-[var(--color-text-muted)] text-sm line-clamp-3 leading-relaxed">
                                            {ticket.description}
                                        </p>
                                    </div>

                                    <div className="mt-auto pt-6 border-t border-border-theme flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Solicitante</span>
                                            <span className="font-bold text-foreground">{ticket.client?.name || 'Cliente Externo'}</span>
                                        </div>

                                        <button
                                            onClick={() => handleClaim(ticket.id)}
                                            className="bg-foreground text-background px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg border border-border-theme"
                                        >
                                            Assumir Ticket
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Timer/Waiting Info */}
                                    <div className="absolute -top-3 -right-3 p-3 bg-red-500 rounded-2xl text-white shadow-xl flex items-center gap-2 border-4 border-background">
                                        <Clock className="w-4 h-4" />
                                        <span className="font-black text-[10px] tracking-tighter">
                                            {Math.floor((currentTime.getTime() - new Date(ticket.created_at).getTime()) / (1000 * 60))} MIN
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="glass-card flex items-center justify-between py-6 px-10 rounded-[2rem] border-white/5 shadow-2xl flex-shrink-0">
                <div className="flex flex-wrap gap-8 md:gap-12">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Aguardando</span>
                        <span className="text-2xl font-black text-accent-theme">{tickets.length}</span>
                    </div>
                    <div className="flex flex-col border-l border-border-theme pl-8 md:pl-12">
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">SLA Crítico</span>
                        <span className="text-2xl font-black text-red-500">
                            {tickets.filter(t => t.priority?.toLowerCase() === 'crítica' || t.priority?.toLowerCase() === 'critical').length}
                        </span>
                    </div>
                    <div className="flex flex-col border-l border-border-theme pl-8 md:pl-12">
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Última Atualização</span>
                        <span className="text-sm font-bold text-[var(--color-text-muted)] mt-2 uppercase">Agora mesmo</span>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-4">
                    <div className="flex -space-x-3">
                        {/* Placeholder for active técnicos */}
                        {[1, 2, 3].map(i => (
                            <div key={i} className="w-10 h-10 rounded-full bg-accent-theme/20 border-4 border-background flex items-center justify-center text-accent-theme">
                                <UserIcon className="w-5 h-5" />
                            </div>
                        ))}
                    </div>
                    <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Técnicos Online</span>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: var(--color-border-theme);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: var(--color-accent-theme);
                }
            `}</style>
        </main>
    );
}
