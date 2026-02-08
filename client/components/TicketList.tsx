'use client';

import React, { useEffect, useState } from 'react';
import { getTickets, updateTicket, deleteTicket, getCategories, getStatuses, Ticket, Category, Status } from '@/lib/api';
import { Loader2, AlertCircle, CheckCircle, Clock, Trash2, RefreshCw, Pencil, X, Save, ReceiptText, ExternalLink, Hash } from 'lucide-react';
import { useNotification } from '@/components/NotificationProvider';
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
                                <th className="px-8 py-6">Assunto / Descrição</th>
                                <th className="px-8 py-6">Situação</th>
                                <th className="px-8 py-6">Prioridade</th>
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
                                    <tr key={ticket.id} className="group hover:bg-background/40 transition-colors cursor-default">
                                        <td className="px-6 py-4 font-mono text-gray-500 text-[11px]">#{ticket.id}</td>
                                        <td className="px-6 py-4">
                                            <Link href={`/tickets/${ticket.id}`} className="block group/link">
                                                <div className="font-bold text-foreground group-hover:text-accent-theme transition-colors flex items-center gap-2">
                                                    {ticket.title}
                                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-50 transition-opacity" />
                                                </div>
                                                <div className="text-[11px] text-gray-400 truncate max-w-xs">{ticket.description}</div>
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => handleStatusChange(ticket.id, ticket.status)}
                                                disabled={actionId === ticket.id}
                                                className="flex items-center gap-2 hover:bg-background p-1.5 rounded-lg transition-all group/status"
                                                title="Clique para avançar status"
                                            >
                                                {actionId === ticket.id ? <Loader2 className="w-4 h-4 animate-spin text-accent-theme" /> : (
                                                    <div
                                                        className="w-3 h-3 rounded-full shadow-sm"
                                                        style={{ backgroundColor: style.color }}
                                                    />
                                                )}
                                                <span
                                                    className="capitalize font-medium text-xs"
                                                    style={{ color: style.color }}
                                                >
                                                    {style.name}
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase border tracking-widest", priorityColor(ticket.priority))}>
                                                {ticket.priority}
                                            </span>
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
