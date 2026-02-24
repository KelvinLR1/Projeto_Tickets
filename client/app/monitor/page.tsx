'use client';

import React, { useEffect, useState, useRef } from 'react';
import { getTickets, Ticket, updateTicket, getCurrentUser, getOnlineUsers, User, getDefaultBaseURL, getSectors, Sector } from '@/lib/api';
import { Monitor, Clock, User as UserIcon, CheckCircle2, ArrowRight, ArrowLeft, ChevronDown, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useNotification } from '@/components/NotificationProvider';
import Link from 'next/link';

export default function MonitorPage() {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]); // vazio = todos
    const [sectorDropdownOpen, setSectorDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { showNotification, confirm } = useNotification();
    const API_URL = getDefaultBaseURL();

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setSectorDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchTickets = async () => {
        try {
            const data = await getTickets({ unassignedOnly: true, excludeFinalized: true });

            const priorityWeights: Record<string, number> = {
                'crítica': 1, 'critical': 1,
                'alta': 2, 'high': 2,
                'média': 3, 'medium': 3,
                'baixa': 4, 'low': 4
            };

            const sortedData = data.sort((a, b) => {
                const weightA = priorityWeights[a.priority?.toLowerCase()] || 99;
                const weightB = priorityWeights[b.priority?.toLowerCase()] || 99;
                if (weightA !== weightB) return weightA - weightB;
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

    const fetchOnlineUsers = async () => {
        try {
            const users = await getOnlineUsers();
            setOnlineUsers(users);
        } catch (error) {
            console.error('Erro ao buscar usuários online:', error);
        }
    };

    const fetchSectors = async () => {
        try {
            const data = await getSectors();
            setSectors(data.filter(s => s.is_active));
        } catch (error) {
            console.error('Erro ao buscar setores:', error);
        }
    };

    useEffect(() => {
        fetchTickets();
        fetchUser();
        fetchOnlineUsers();
        fetchSectors();

        const ticketInterval = setInterval(() => {
            fetchTickets();
            fetchOnlineUsers();
        }, 30000);
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

        return () => {
            clearInterval(ticketInterval);
            clearInterval(clockInterval);
        };
    }, []);

    // Filtrar tickets por setores selecionados
    const filteredTickets = selectedSectorIds.length === 0
        ? tickets
        : tickets.filter(t => t.sector_id != null && selectedSectorIds.includes(t.sector_id));

    // Filtrar usuários online por setores selecionados (usuários que pertencem a qualquer setor selecionado)
    const filteredOnlineUsers = selectedSectorIds.length === 0
        ? onlineUsers
        : onlineUsers.filter(u =>
            u.sectors?.some(s => selectedSectorIds.includes(s.id))
        );

    const toggleSector = (id: number) => {
        setSelectedSectorIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const clearSectors = () => setSelectedSectorIds([]);

    const handleClaim = async (ticketId: number) => {
        if (!currentUser) {
            showNotification('Você precisa estar logado para assumir um ticket.', 'error');
            return;
        }

        const confirmed = await confirm({
            title: 'Assumir Ticket?',
            message: 'Deseja realmente assumir a responsabilidade por este chamado?'
        });

        if (!confirmed) return;

        try {
            await updateTicket(ticketId, { assigned_user_id: currentUser.id });
            showNotification('Ticket assumido com sucesso!', 'success');
            fetchTickets();
        } catch (error) {
            showNotification('Erro ao assumir ticket.', 'error');
            console.error(error);
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'crítica': case 'critical':
                return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'alta': case 'high':
                return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            case 'média': case 'medium':
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

    const hasFilter = selectedSectorIds.length > 0;

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
                            {hasFilter
                                ? `${selectedSectorIds.length} setor${selectedSectorIds.length !== 1 ? 'es' : ''} filtrado${selectedSectorIds.length !== 1 ? 's' : ''} • ${filteredTickets.length} chamados`
                                : `Aguardando atribuição técnica • ${filteredTickets.length} chamados ativos`
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {/* Seletor de Setores */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setSectorDropdownOpen(v => !v)}
                            className={clsx(
                                "flex items-center gap-3 px-5 py-3.5 rounded-2xl border font-black text-[10px] uppercase tracking-widest transition-all shadow-lg",
                                hasFilter
                                    ? "bg-accent-theme/10 border-accent-theme/40 text-accent-theme"
                                    : "bg-card border-border-theme text-[var(--color-text-muted)] hover:text-foreground hover:border-accent-theme/30"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                            {hasFilter
                                ? selectedSectorIds.length === 1
                                    ? sectors.find(s => s.id === selectedSectorIds[0])?.name || 'Setor'
                                    : `${selectedSectorIds.length} Setores`
                                : 'Todos os Setores'
                            }
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", sectorDropdownOpen && "rotate-180")} />
                        </button>

                        <AnimatePresence>
                            {sectorDropdownOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute right-0 top-full mt-3 w-72 bg-card border border-border-theme rounded-3xl shadow-2xl z-50 overflow-hidden"
                                >
                                    {/* Header do dropdown */}
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-border-theme/50">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                            Filtrar por Setor
                                        </span>
                                        {hasFilter && (
                                            <button
                                                onClick={clearSectors}
                                                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-accent-theme hover:text-accent-theme/70 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                                Limpar
                                            </button>
                                        )}
                                    </div>

                                    {/* Todos */}
                                    <button
                                        onClick={clearSectors}
                                        className={clsx(
                                            "w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 transition-colors text-left",
                                            !hasFilter && "bg-accent-theme/5"
                                        )}
                                    >
                                        <span className="text-sm font-bold">Todos os setores</span>
                                        {!hasFilter && (
                                            <div className="w-2 h-2 rounded-full bg-accent-theme" />
                                        )}
                                    </button>

                                    {/* Lista de setores */}
                                    <div className="max-h-64 overflow-y-auto p-2 space-y-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border-theme) transparent' }}>
                                        {sectors.length === 0 ? (
                                            <p className="px-5 py-4 text-[var(--color-text-muted)] text-sm italic">Nenhum setor cadastrado</p>
                                        ) : (
                                            sectors.map(sector => {
                                                const selected = selectedSectorIds.includes(sector.id);
                                                // Conta tickets deste setor
                                                const count = tickets.filter(t => t.sector_id === sector.id).length;
                                                return (
                                                    <button
                                                        key={sector.id}
                                                        onClick={() => toggleSector(sector.id)}
                                                        className={clsx(
                                                            "w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left gap-3 rounded-xl",
                                                            selected && "bg-accent-theme/5"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {/* Checkbox visual */}
                                                            <div className={clsx(
                                                                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                                                                selected
                                                                    ? "bg-accent-theme border-accent-theme"
                                                                    : "border-border-theme"
                                                            )}>
                                                                {selected && (
                                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                                                                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-bold">{sector.name}</span>
                                                        </div>
                                                        {count > 0 && (
                                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent-theme/10 text-accent-theme border border-accent-theme/20 flex-shrink-0">
                                                                {count}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Relógio */}
                    <div className="text-right">
                        <div className="text-5xl font-black font-mono tracking-tighter tabular-nums">
                            {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-accent-theme font-bold uppercase tracking-widest text-sm">
                            {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Tickets Grid */}
            <div className="flex-1 overflow-y-auto pr-6 pt-6 custom-scrollbar">
                {filteredTickets.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-6 opacity-30">
                        <CheckCircle2 className="w-24 h-24" />
                        <p className="text-2xl font-black uppercase tracking-widest italic text-[var(--color-text-muted)]">
                            {hasFilter ? 'Sem chamados neste setor!' : 'Tudo limpo por aqui!'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-12 p-2">
                        <AnimatePresence mode="popLayout">
                            {filteredTickets.map((ticket) => (
                                <motion.div
                                    key={ticket.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                                    className="glass-card p-8 rounded-[2.5rem] flex flex-col gap-6 relative group transition-all hover:scale-[1.02] hover:shadow-accent-theme/5"
                                >
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className={clsx(
                                                "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                                getPriorityColor(ticket.priority)
                                            )}>
                                                {ticket.priority}
                                            </div>
                                            {ticket.sector?.name && (
                                                <div className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-border-theme text-[var(--color-text-muted)] bg-white/5">
                                                    {ticket.sector.name}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end flex-shrink-0">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-accent-theme/50">ID</span>
                                            <span className="text-xl font-black font-mono leading-none">{ticket.id}</span>
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
                                    <div className="absolute -top-4 -right-4 p-3 bg-red-500 rounded-2xl text-white shadow-xl flex items-center gap-2 border-4 border-background z-10 scale-110">
                                        <Clock className="w-4 h-4" />
                                        <span className="font-black text-[10px] tracking-tighter">
                                            {Math.max(0, Math.floor((currentTime.getTime() - new Date(ticket.created_at + (ticket.created_at.endsWith('Z') ? '' : 'Z')).getTime()) / (1000 * 60)))} MIN
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
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">
                            {hasFilter ? 'Filtrados' : 'Aguardando'}
                        </span>
                        <span className="text-2xl font-black text-accent-theme">{filteredTickets.length}</span>
                    </div>
                    <div className="flex flex-col border-l border-border-theme pl-8 md:pl-12">
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">SLA Crítico</span>
                        <span className="text-2xl font-black text-red-500">
                            {filteredTickets.filter(t => t.priority?.toLowerCase() === 'crítica' || t.priority?.toLowerCase() === 'critical').length}
                        </span>
                    </div>
                    {hasFilter && (
                        <div className="flex flex-col border-l border-border-theme pl-8 md:pl-12">
                            <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Total Geral</span>
                            <span className="text-2xl font-black text-[var(--color-text-muted)]">{tickets.length}</span>
                        </div>
                    )}
                    <div className="flex flex-col border-l border-border-theme pl-8 md:pl-12">
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">Última Atualização</span>
                        <span className="text-sm font-bold text-[var(--color-text-muted)] mt-2 uppercase">Agora mesmo</span>
                    </div>
                </div>

                {/* Online Users */}
                <div className="hidden sm:flex items-center gap-4">
                    <div className="flex -space-x-3">
                        {filteredOnlineUsers.length === 0 ? (
                            <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest opacity-50 italic">
                                {hasFilter ? 'Nenhum técnico neste setor' : 'Nenhum técnico online'}
                            </span>
                        ) : (
                            filteredOnlineUsers.slice(0, 6).map(u => (
                                <div key={u.id} className="relative group/avatar" title={u.full_name || u.username}>
                                    <div className="w-10 h-10 rounded-full border-4 border-background overflow-hidden flex items-center justify-center bg-accent-theme/20 text-accent-theme font-black text-sm shadow-lg">
                                        {u.avatar_url ? (
                                            <img src={`${API_URL}${u.avatar_url}`} alt={u.full_name || u.username} className="w-full h-full object-cover" />
                                        ) : (
                                            (u.full_name || u.username)[0]?.toUpperCase()
                                        )}
                                    </div>
                                    {/* Badge online */}
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/avatar:flex bg-card border border-border-theme rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest whitespace-nowrap shadow-xl z-50">
                                        {u.full_name || u.username}
                                        {u.sectors && u.sectors.length > 0 && (
                                            <span className="text-accent-theme ml-1">• {u.sectors.map(s => s.name).join(', ')}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        {filteredOnlineUsers.length > 6 && (
                            <div className="w-10 h-10 rounded-full bg-accent-theme/10 border-4 border-background flex items-center justify-center text-accent-theme font-black text-xs">
                                +{filteredOnlineUsers.length - 6}
                            </div>
                        )}
                    </div>
                    {filteredOnlineUsers.length > 0 && (
                        <span className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">
                            {filteredOnlineUsers.length} Técnico{filteredOnlineUsers.length !== 1 ? 's' : ''} Online
                        </span>
                    )}
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--color-border-theme); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--color-accent-theme); }
            `}</style>
        </main>
    );
}
