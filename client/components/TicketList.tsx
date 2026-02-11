'use client';

import React, { useEffect, useState } from 'react';
import { getTickets, updateTicket, deleteTicket, getCategories, getStatuses, Ticket, Category, Status } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle, Clock, Trash2, RefreshCw, Pencil, X, Save, ReceiptText, ExternalLink, Hash, Play } from 'lucide-react';
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
                                <th className="px-8 py-6">ID</th>
                                <th className="px-8 py-6">Ticket / Problema</th>
                                <th className="px-8 py-6">Status / Fluxo</th>
                                <th className="px-8 py-6">Prioridade</th>
                                <th className="px-8 py-6 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-theme/30">
                            {tickets.filter(t =>
                                !searchTerm ||
                                t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                t.description.toLowerCase().includes(searchTerm.toLowerCase())
                            ).length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={4} className="py-24 text-center">
                                            <div className="w-20 h-20 bg-background rounded-full mx-auto flex items-center justify-center border border-border-theme shadow-inner opacity-20 mb-4">
                                                <ReceiptText className="w-10 h-10" />
                                            </div>
                                            <p className="text-gray-500 text-sm italic">Nenhum ticket encontrado no sistema.</p>
                                        </td>
                                    </tr>
                                )}
                            {tickets.filter(t => {
                                const matchSearch = !searchTerm ||
                                    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                    t.description.toLowerCase().includes(searchTerm.toLowerCase());
                                const matchStatus = !status || t.status === status;
                                const matchPriority = !priority || t.priority === priority;
                                const matchCategory = !categoryId || t.category_id === categoryId;

                                return matchSearch && matchStatus && matchPriority && matchCategory;
                            }).map((ticket) => {
                                const style = getStatusStyle(ticket.status, ticket.status_obj);

                                return (
                                    <tr key={ticket.id} className="group hover:bg-white/[0.03] transition-all duration-300 border-b border-border-theme/20 last:border-0">
                                        <td className="px-8 py-6 align-top">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-center gap-1">
                                                    <Hash className="w-3 h-3 text-accent-theme/40" />
                                                    <span className="font-mono text-[11px] font-bold text-[var(--color-text-muted)] group-hover:text-accent-theme transition-colors">{ticket.id}</span>
                                                </div>

                                                {/* Timer Controls */}
                                                <div className="flex items-center">
                                                    {activeTimers.find(t => t.ticket_id === ticket.id) ? (
                                                        <button
                                                            onClick={() => handleStopTimer(ticket.id)}
                                                            className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/10"
                                                            title="Parar Cronômetro (Pausar)"
                                                        >
                                                            <div className="w-3 h-3 bg-red-500 rounded-sm animate-pulse" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                if (ticket.status === 'Finalizado') return;
                                                                handleStartTimer(ticket.id);
                                                            }}
                                                            disabled={ticket.status === 'Finalizado'}
                                                            className={clsx(
                                                                "p-2 rounded-lg transition-all",
                                                                ticket.status === 'Finalizado'
                                                                    ? "bg-gray-500/5 text-gray-500 cursor-not-allowed opacity-20"
                                                                    : "bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20 opacity-0 group-hover:opacity-100"
                                                            )}
                                                            title={ticket.status === 'Finalizado' ? "Chamado Finalizado" : "Iniciar Cronômetro"}
                                                        >
                                                            <Play className="w-3 h-3 fill-current" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 max-w-md">
                                            <Link href={`/tickets/${ticket.id}`} className="block space-y-1.5 group/link">
                                                <div className="font-black text-foreground group-hover/link:text-accent-theme transition-all flex items-center gap-2 uppercase tracking-tight italic">
                                                    {ticket.title}
                                                    <ExternalLink className="w-3.5 h-3.5 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all text-accent-theme" />
                                                </div>
                                                <div className="text-[11px] text-[var(--color-text-muted)] group-hover/link:text-foreground/60 transition-colors line-clamp-2 leading-relaxed">
                                                    {ticket.description}
                                                </div>
                                            </Link>
                                        </td>
                                        <td className="px-8 py-6">
                                            <button
                                                onClick={() => handleStatusChange(ticket.id, ticket.status)}
                                                disabled={actionId === ticket.id}
                                                className="flex flex-col gap-2 p-3 bg-background/40 hover:bg-background/80 rounded-2xl border border-border-theme/50 transition-all group/status active:scale-95 disabled:opacity-50 min-w-[140px]"
                                                title="Clique para avançar status"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    {actionId === ticket.id ? <Loader2 className="w-3 h-3 animate-spin text-accent-theme" /> : (
                                                        <div
                                                            className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                                                            style={{ backgroundColor: style.color, boxShadow: `0 0 12px ${style.color}40` }}
                                                        />
                                                    )}
                                                    <span
                                                        className="text-[10px] font-black uppercase tracking-[0.15em]"
                                                        style={{ color: style.color }}
                                                    >
                                                        {style.name}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-border-theme/20 h-1 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full transition-all duration-500 rounded-full"
                                                        style={{
                                                            backgroundColor: style.color,
                                                            width: `${((statuses.findIndex(s => s.name === style.name) + 1) / statuses.length) * 100}%`
                                                        }}
                                                    />
                                                </div>
                                            </button>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={clsx(
                                                "px-4 py-1.5 rounded-xl text-[9px] font-black uppercase border tracking-widest shadow-sm",
                                                priorityColor(ticket.priority)
                                            )}>
                                                {ticket.priority}
                                            </span>
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
