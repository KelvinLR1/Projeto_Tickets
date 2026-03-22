'use client';

import React, { useEffect, useState } from 'react';
import { getTickets, updateTicket, deleteTicket, getCategories, getStatuses, Ticket, Category, Status } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle, Clock, Trash2, RefreshCw, Pencil, X, Save, ReceiptText, ExternalLink, Hash, Play, User } from 'lucide-react';
import { useNotification } from '@/components/NotificationProvider';
import { useTimer } from './TimerProvider';
import { useAuth } from './AuthProvider';
import clsx from 'clsx';
import Link from 'next/link';
import { TicketRowSkeleton } from './Skeleton';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Componente de Lista de Tickets (Visualização em Tabela).
 * Oferece uma visão tabular densa com ordenação, filtros e ações rápidas.
 */
export default function TicketList({
    tickets: initialTickets,
    statuses: initialStatuses,
    searchTerm,
    status,
    priority,
    categoryId,
    sectorId,
    loading: loadingProp
}: {
    tickets?: Ticket[];
    statuses?: Status[];
    searchTerm?: string;
    status?: string;
    priority?: string;
    categoryId?: number;
    sectorId?: number;
    loading?: boolean;
}) {
    const { showNotification, confirm: askConfirm } = useNotification();
    const { user } = useAuth();
    const { activeTimers, handleStartTimer, handleStopTimer } = useTimer();
    const [tickets, setTickets] = useState<Ticket[]>(initialTickets || []);
    const [loading, setLoading] = useState(loadingProp ?? !initialTickets);
    const [actionId, setActionId] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

    const [categories, setCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>(initialStatuses || []);

    // Sincroniza estado se as props iniciais mudarem

    useEffect(() => {
        if (initialTickets) {
            setTickets(initialTickets);
        }
    }, [initialTickets]);

    useEffect(() => {
        if (loadingProp !== undefined) {
            setLoading(loadingProp);
        }
    }, [loadingProp]);

    useEffect(() => {
        if (initialStatuses) {
            setStatuses(initialStatuses);
        }
    }, [initialStatuses]);

    useEffect(() => {
        if (!initialTickets || !initialStatuses) {
            loadData();
        }
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [ticketsData, catsData, statusesData] = await Promise.all([
                getTickets({}),
                getCategories(),
                getStatuses()
            ]);
            setTickets(ticketsData);
            setCategories(catsData);
            setStatuses(statusesData);
        } catch (error: any) {
            console.error('Failed to load data:', error);
            if (error.message === 'Network Error') {
                showNotification('Erro de conexão. Verifique se o servidor está rodando ou se a URL na tela de Ajustes está correta.', 'error');
            } else {
                showNotification('Erro ao carregar dados', 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    /**
     * Cicla o status de um ticket diretamente na lista.
     * Oferece feedback visual imediato e sincroniza com o backend.
     */
    const handleStatusChange = async (ticketId: number, currentStatusName: string) => {
        if (statuses.length === 0) return;

        // Encontra o índice do status atual
        const currentIndex = statuses.findIndex(s => s.name === currentStatusName);
        // Pega o próximo status (ciclo)
        const nextIndex = (currentIndex + 1) % statuses.length;
        const nextStatus = statuses[nextIndex];

        try {
            setActionId(ticketId);
            // Atualiza enviando tanto o ID quanto o nome para garantir sincronia
            await updateTicket(ticketId, {
                status_id: nextStatus.id,
                status: nextStatus.name
            });

            // Atualiza localmente
            setTickets(tickets.map(t => {
                if (t.id === ticketId) {
                    return {
                        ...t,
                        status: nextStatus.name,
                        status_id: nextStatus.id,
                        status_obj: nextStatus
                    };
                }
                return t;
            }));

            showNotification(`Status alterado para ${nextStatus.name}`, 'info');
        } catch (error) {
            console.error(error);
            showNotification('Falha ao atualizar o status', 'error');
        } finally {
            setActionId(null);
        }
    };

    /**
     * Resolve o estilo (cor e nome) de um status para exibição na tabela.
     */
    const getStatusStyle = (statusName: string, statusObj?: Status) => {
        // Se tivermos o objeto de status vindo do ticket, usamos ele direto
        if (statusObj) {
            return {
                color: statusObj.color,
                bg: `bg-[${statusObj.color}]/10`, // Tailwind arbitrary values might not work dynamically without whitelist, so we use style prop
                name: statusObj.name
            };
        }

        // Fallback: tenta encontrar na lista de status carregados
        const found = statuses.find(s => s.name === statusName);
        if (found) {
            return {
                color: found.color,
                name: found.name
            };
        }

        // Fallback final para status padrão se não encontrado
        return {
            color: '#9ca3af', // gray-400
            name: statusName
        };
    };

    const priorityColor = (priority: string) => {
        const p = priority?.toLowerCase() || '';
        switch (p) {
            case 'crítica':
            case 'critica':
            case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/30';
            case 'alta':
            case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
            case 'média':
            case 'media':
            case 'medium': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
            case 'baixa':
            case 'low': return 'bg-green-500/10 text-green-500 border-green-500/30';
            default: return 'bg-gray-500/10 text-gray-500 border-border-theme';
        }
    };

    /**
     * Gerencia a configuração de ordenação da tabela.
     */
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedTickets = [...tickets].sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Ticket];
        let bValue: any = b[sortConfig.key as keyof Ticket];

        // Custom sorting for nested objects if needed
        if (sortConfig.key === 'client') {
            aValue = a.client?.name || '';
            bValue = b.client?.name || '';
        } else if (sortConfig.key === 'assigned_user') {
            aValue = a.assigned_user?.full_name || a.assigned_user?.username || '';
            bValue = b.assigned_user?.full_name || b.assigned_user?.username || '';
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const filteredTickets = sortedTickets;

    if (loading && tickets.length === 0) {
        return (
            <div className="glass-card rounded-[2.5rem] border border-border-theme overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-background/20 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] border-b border-border-theme">
                            <tr>
                                <th className="px-8 py-6 w-16">ID</th>
                                <th className="px-8 py-6">Ticket / Cliente</th>
                                <th className="px-8 py-6 w-40 text-center">Status</th>
                                <th className="px-8 py-6 w-36 text-center">Prioridade</th>
                                <th className="px-8 py-6 w-48">Responsável</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-theme/30">
                            {[1, 2, 3, 4, 5].map(i => <TicketRowSkeleton key={i} />)}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={clsx(
                "glass-card rounded-[2.5rem] border border-border-theme overflow-hidden shadow-2xl transition-all duration-500",
                loading && "opacity-60 cursor-wait pointer-events-none"
            )}>
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-background/20 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] border-b border-border-theme">
                            <tr>
                                <th onClick={() => handleSort('id')} className="px-8 py-6 w-16 cursor-pointer hover:text-foreground transition-colors group/th">
                                    <div className="flex items-center gap-2">
                                        ID {sortConfig.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('title')} className="px-8 py-6 cursor-pointer hover:text-foreground transition-colors group/th">
                                    <div className="flex items-center gap-2">
                                        Ticket / Cliente {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('status')} className="px-8 py-6 w-40 text-center cursor-pointer hover:text-foreground transition-colors group/th">
                                    <div className="flex items-center justify-center gap-2">
                                        Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('priority')} className="px-8 py-6 w-36 text-center cursor-pointer hover:text-foreground transition-colors group/th">
                                    <div className="flex items-center justify-center gap-2">
                                        Prioridade {sortConfig.key === 'priority' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </div>
                                </th>
                                <th onClick={() => handleSort('assigned_user')} className="px-8 py-6 w-48 cursor-pointer hover:text-foreground transition-colors group/th">
                                    <div className="flex items-center gap-2">
                                        Responsável {sortConfig.key === 'assigned_user' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-theme/30">
                            {filteredTickets.length === 0 && !loading && (
                                <motion.tr
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <td colSpan={5} className="py-24 text-center">
                                        <div className="w-20 h-20 bg-background rounded-full mx-auto flex items-center justify-center border border-border-theme shadow-inner opacity-20 mb-4">
                                            <ReceiptText className="w-10 h-10" />
                                        </div>
                                        <p className="text-gray-500 text-sm italic">Nenhum ticket encontrado no sistema.</p>
                                    </td>
                                </motion.tr>
                            )}
                            <AnimatePresence mode="popLayout">
                                {filteredTickets.map((ticket) => {
                                    const style = getStatusStyle(ticket.status, ticket.status_obj);

                                    return (
                                        <motion.tr
                                            key={ticket.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                            transition={{
                                                duration: 0.5,
                                                ease: [0.22, 1, 0.36, 1],
                                                layout: { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
                                            }}
                                            className="group hover:bg-white/[0.03] transition-colors duration-300 border-b border-border-theme/20 last:border-0"
                                        >
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-4">
                                                    {/*ID e Controles de Cronômetro */}
                                                    <div className="w-6 flex justify-center">
                                                        <span className="font-mono text-xs font-bold text-[var(--color-text-muted)] group-hover:text-accent-theme transition-colors leading-none">{ticket.id}</span>
                                                    </div>

                                                    <div className="flex items-center justify-center min-w-[32px] h-8">
                                                        {activeTimers.find(t => t.ticket_id === ticket.id) ? (
                                                            <button
                                                                onClick={() => handleStopTimer(ticket.id)}
                                                                className="p-2.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/10 flex items-center justify-center"
                                                                title="Parar Cronômetro (Pausar)"
                                                            >
                                                                <div className="w-2.5 h-2.5 bg-red-500 rounded-sm animate-pulse" />
                                                            </button>
                                                        ) : (
                                                            ticket.status !== 'Finalizado' && ticket.assigned_user_id === user?.id && (
                                                                <button
                                                                    onClick={() => {
                                                                        handleStartTimer(ticket.id);
                                                                    }}
                                                                    className="p-2.5 bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                                                    title="Iniciar Cronômetro"
                                                                >
                                                                    <Play className="w-2.5 h-2.5 fill-current" />
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 max-w-md">
                                                <Link href={`/tickets/${ticket.id}`} className="block space-y-1 group/link">
                                                    <div className="font-black text-foreground group-hover/link:text-accent-theme transition-all flex items-center gap-2 uppercase tracking-tight italic">
                                                        {ticket.title}
                                                        <ExternalLink className="w-3 h-3 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all text-accent-theme" />
                                                    </div>
                                                    <div className="text-[10px] font-black italic uppercase tracking-[-0.05em] text-accent-theme/70 flex items-center gap-1.5">
                                                        <User className="w-3 h-3" />
                                                        {ticket.client?.name || 'Cliente Desconhecido'}
                                                    </div>
                                                </Link>
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusChange(ticket.id, ticket.status);
                                                    }}
                                                    disabled={actionId === ticket.id}
                                                    className={clsx(
                                                        "inline-flex items-center gap-2.5 px-4 py-2 bg-background/40 rounded-xl border border-border-theme/50 w-32 justify-center transition-all hover:bg-white/5",
                                                        actionId === ticket.id && "animate-pulse opacity-50 cursor-wait"
                                                    )}
                                                >
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: style.color, boxShadow: `0 0 10px ${style.color}40` }}
                                                    />
                                                    <span
                                                        className="text-[9px] font-black uppercase tracking-widest"
                                                        style={{ color: style.color }}
                                                    >
                                                        {style.name.toUpperCase()}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <span className={clsx(
                                                    "inline-block px-4 py-2 rounded-xl text-[9px] font-black uppercase border tracking-widest w-28 text-center",
                                                    priorityColor(ticket.priority)
                                                )}>
                                                    {ticket.priority.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={clsx(
                                                        "w-8 h-8 rounded-full flex items-center justify-center border shrink-0 transition-all",
                                                        ticket.assigned_user
                                                            ? "bg-accent-theme/10 text-accent-theme border-accent-theme/20 shadow-lg shadow-accent-theme/5"
                                                            : "bg-background/20 text-[var(--color-text-muted)] border-border-theme/30 opacity-40 shrink-0"
                                                    )}>
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <p className={clsx(
                                                            "text-[10px] font-black uppercase tracking-tight leading-none",
                                                            ticket.assigned_user ? "text-foreground" : "text-[var(--color-text-muted)] opacity-70"
                                                        )}>
                                                            {ticket.assigned_user?.full_name || ticket.assigned_user?.username || 'NÃO ATRIBUÍDO'}
                                                        </p>
                                                        <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                                                            Responsável
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    )
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div >
        </>
    );
}
