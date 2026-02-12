'use client';

import React, { useEffect, useState } from 'react';
import { getTickets, updateTicket, deleteTicket, getCategories, getStatuses, Ticket, Category, Status } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle, Clock, Trash2, RefreshCw, Pencil, X, Save, ReceiptText, ExternalLink, Hash, Play, User } from 'lucide-react';
import { useNotification } from '@/components/NotificationProvider';
import { useTimer } from './TimerProvider';
import { useAuth } from './AuthProvider';
import clsx from 'clsx';
import Link from 'next/link';

export default function TicketList({
    searchTerm,
    status,
    priority,
    categoryId
}: {
    searchTerm?: string;
    status?: string;
    priority?: string;
    categoryId?: number;
}) {
    const { showNotification, confirm: askConfirm } = useNotification();
    const { user } = useAuth();
    const { activeTimers, handleStartTimer, handleStopTimer } = useTimer();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

    const [categories, setCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [ticketsData, catsData, statusesData] = await Promise.all([
                getTickets(),
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
        switch (priority) {
            case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/30';
            case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
            case 'medium': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
            case 'low': return 'bg-green-500/10 text-green-500 border-green-500/30';
            default: return 'bg-gray-500/10 text-gray-500 border-border-theme';
        }
    };

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

    const filteredTickets = sortedTickets.filter(t => {
        const matchSearch = !searchTerm ||
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = !status || t.status === status;
        const matchPriority = !priority || t.priority === priority;
        const matchCategory = !categoryId || t.category_id === categoryId;

        return matchSearch && matchStatus && matchPriority && matchCategory;
    });

    if (loading && tickets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-20" />
                <p className="text-gray-500 text-xs font-black uppercase tracking-widest animate-pulse">Carregando Chamados...</p>
            </div>
        );
    }

    return (
        <>
            <div className="glass-card rounded-[2.5rem] border border-border-theme overflow-hidden shadow-2xl transition-all duration-500">
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
                                <th className="px-8 py-6 text-right w-24">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-theme/30">
                            {filteredTickets.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
                                        <div className="w-20 h-20 bg-background rounded-full mx-auto flex items-center justify-center border border-border-theme shadow-inner opacity-20 mb-4">
                                            <ReceiptText className="w-10 h-10" />
                                        </div>
                                        <p className="text-gray-500 text-sm italic">Nenhum ticket encontrado no sistema.</p>
                                    </td>
                                </tr>
                            )}
                            {filteredTickets.map((ticket) => {
                                const style = getStatusStyle(ticket.status, ticket.status_obj);

                                return (
                                    <tr key={ticket.id} className="group hover:bg-white/[0.03] transition-all duration-300 border-b border-border-theme/20 last:border-0">
                                        <td className="px-8 py-6 align-top">
                                            <div className="flex items-center gap-4">
                                                <span className="font-mono text-sm font-bold text-[var(--color-text-muted)] group-hover:text-accent-theme transition-colors">{ticket.id}</span>

                                                {/* Timer Controls */}
                                                <div className="flex items-center min-w-[32px]">
                                                    {activeTimers.find(t => t.ticket_id === ticket.id) ? (
                                                        <button
                                                            onClick={() => handleStopTimer(ticket.id)}
                                                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/10"
                                                            title="Parar Cronômetro (Pausar)"
                                                        >
                                                            <div className="w-3 h-3 bg-red-500 rounded-sm animate-pulse" />
                                                        </button>
                                                    ) : (
                                                        ticket.status !== 'Finalizado' && (
                                                            <button
                                                                onClick={() => {
                                                                    handleStartTimer(ticket.id);
                                                                }}
                                                                className="p-2 bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                                title="Iniciar Cronômetro"
                                                            >
                                                                <Play className="w-3 h-3 fill-current" />
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
                                                <div className="text-[10px] font-bold text-accent-theme/70 flex items-center gap-1.5">
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
                                                    {style.name}
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className={clsx(
                                                "inline-block px-4 py-2 rounded-xl text-[9px] font-black uppercase border tracking-widest w-28 text-center",
                                                priorityColor(ticket.priority)
                                            )}>
                                                {ticket.priority}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-accent-theme/10 flex items-center justify-center text-accent-theme border border-accent-theme/20">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-black uppercase tracking-tight leading-none text-foreground">
                                                        {ticket.assigned_user?.full_name || ticket.assigned_user?.username || 'Sistema'}
                                                    </p>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                                                        Responsável
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button
                                                onClick={() => { }} // TODO: Add more actions or menu
                                                className="p-3 text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
