'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getTickets, updateTicket, getStatuses, Ticket, Status } from '@/lib/api';
import {
    Loader2,
    ReceiptText,
    User,
    ExternalLink,
    Play,
    RefreshCw
} from 'lucide-react';
import { useNotification } from '@/components/NotificationProvider';
import { useAuth } from './AuthProvider';
import { useTimer } from './TimerProvider';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import clsx from 'clsx';
import Link from 'next/link';
import { KanbanColumnSkeleton } from './Skeleton';

interface KanbanViewProps {
    tickets?: Ticket[];
    statuses?: Status[];
    searchTerm?: string;
    status?: string;
    priority?: string;
    categoryId?: number;
    sectorId?: number;
}

export default function KanbanView({
    tickets: initialTickets,
    statuses: initialStatuses,
    searchTerm,
    status: statusFilter,
    priority: priorityFilter,
    categoryId,
    sectorId
}: KanbanViewProps) {
    const { showNotification } = useNotification();
    const { user } = useAuth();
    const { activeTimers, handleStartTimer, handleStopTimer } = useTimer();
    const [tickets, setTickets] = useState<Ticket[]>(initialTickets || []);
    const [statuses, setStatuses] = useState<Status[]>(initialStatuses || []);
    const [loading, setLoading] = useState(!initialTickets);
    const [updatingId, setUpdatingId] = useState<number | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [ticketsData, statusesData] = await Promise.all([
                getTickets(),
                getStatuses()
            ]);
            setTickets(ticketsData);
            setStatuses(statusesData);
        } catch (error: any) {
            console.error('Failed to load data:', error);
            showNotification('Erro ao carregar dados do Kanban', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (initialTickets) {
            setTickets(initialTickets);
            setLoading(false);
        }
    }, [initialTickets]);

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

    const filteredTickets = useMemo(() => {
        return tickets.filter(t => {
            const matchSearch = !searchTerm ||
                t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.description.toLowerCase().includes(searchTerm.toLowerCase());
            const matchStatus = !statusFilter || t.status === statusFilter;
            const matchPriority = !priorityFilter || t.priority === priorityFilter;
            const matchCategory = !categoryId || t.category_id === categoryId;
            const matchSector = !sectorId || t.sector_id === sectorId;

            return matchSearch && matchStatus && matchPriority && matchCategory && matchSector;
        });
    }, [tickets, searchTerm, statusFilter, priorityFilter, categoryId, sectorId]);

    const handleMoveTicket = async (ticketId: number, nextStatus: Status, previousStatusId?: number, previousStatusName?: string) => {
        try {
            setUpdatingId(ticketId);
            await updateTicket(ticketId, {
                status_id: nextStatus.id,
                status: nextStatus.name
            });

            // Sincroniza estado local (já deve ter sido feito de forma otimista em onDragEnd)
            // mas fazemos aqui para garantir caso seja chamado pelo handleStatusChange
            setTickets(prev => prev.map(t => {
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

            showNotification(`Ticket movido para ${nextStatus.name}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Falha ao mover ticket', 'error');

            // Rollback otimista caso tenhamos os dados anteriores
            if (previousStatusId !== undefined && previousStatusName !== undefined) {
                setTickets(prev => prev.map(t => {
                    if (t.id === ticketId) {
                        return {
                            ...t,
                            status: previousStatusName,
                            status_id: previousStatusId
                        };
                    }
                    return t;
                }));
            } else {
                // FALLBACK: Recarrega tudo se não soubermos como voltar
                loadData();
            }
        } finally {
            setUpdatingId(null);
        }
    };

    const handleStatusChange = async (ticketId: number, currentStatusName: string) => {
        if (statuses.length === 0) return;

        const currentIndex = statuses.findIndex(s => s.name === currentStatusName);
        const nextIndex = (currentIndex + 1) % statuses.length;
        const nextStatus = statuses[nextIndex];

        // Busca o status atual para rollback em caso de erro
        const currentStatus = statuses[currentIndex];

        // Atualização Otimista para o clique simples
        setTickets(prev => prev.map(t => {
            if (t.id === ticketId) {
                return { ...t, status: nextStatus.name, status_id: nextStatus.id };
            }
            return t;
        }));

        await handleMoveTicket(ticketId, nextStatus, currentStatus?.id, currentStatus?.name);
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        // Se soltou no mesmo lugar, ignora
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const ticketId = parseInt(draggableId);
        const nextStatusId = parseInt(destination.droppableId);
        const sourceStatusId = parseInt(source.droppableId);

        const nextStatus = statuses.find(s => s.id === nextStatusId);
        const sourceStatus = statuses.find(s => s.id === sourceStatusId);
        const ticket = tickets.find(t => t.id === ticketId);

        if (nextStatus && ticket) {
            // ATUALIZAÇÃO OTIMISTA: Move o ticket no estado local antes do fetch
            setTickets(prev => prev.map(t => {
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

            // Chama o backend com dados para rollback
            handleMoveTicket(ticketId, nextStatus, sourceStatusId, sourceStatus?.name);
        }
    };

    const priorityColor = (priority: string) => {
        const p = priority?.toLowerCase() || '';
        switch (p) {
            case 'crítica':
            case 'critica': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'alta': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            case 'média':
            case 'media': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            case 'baixa': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
        }
    };

    if (loading && tickets.length === 0) {
        return (
            <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar min-h-[700px] items-start">
                {[1, 2, 3, 4].map(i => <KanbanColumnSkeleton key={i} />)}
            </div>
        );
    }

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar min-h-[700px] items-start">
                {statuses.map(statusObj => {
                    const columnTickets = filteredTickets.filter(t => t.status_id ? t.status_id === statusObj.id : t.status === statusObj.name);

                    return (
                        <div
                            key={statusObj.id}
                            className="flex-shrink-0 w-80 flex flex-col gap-4 group/col"
                        >
                            {/* Column Header */}
                            <div className="flex items-center justify-between px-4 py-2 border-b border-border-theme/30 mb-2">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{
                                            backgroundColor: statusObj.color,
                                            boxShadow: `0 0 15px ${statusObj.color}40`
                                        }}
                                    />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/80">
                                        {statusObj.name}
                                    </h3>
                                    <span className="text-[9px] font-bold bg-background/50 px-2 py-0.5 rounded-full border border-border-theme/30 text-[var(--color-text-muted)]">
                                        {columnTickets.length}
                                    </span>
                                </div>
                            </div>

                            {/* Droppable Column Content */}
                            <Droppable droppableId={statusObj.id.toString()}>
                                {(provided, snapshot) => (
                                    <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className={clsx(
                                            "flex flex-col gap-4 min-h-[500px] p-2 rounded-3xl transition-colors duration-200",
                                            snapshot.isDraggingOver ? "bg-accent-theme/5" : "bg-transparent"
                                        )}
                                    >
                                        {columnTickets.length === 0 && !snapshot.isDraggingOver && (
                                            <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border-theme/20 rounded-3xl opacity-20">
                                                <ReceiptText className="w-8 h-8 mb-2" />
                                                <p className="text-[8px] font-black uppercase tracking-widest">Sem tickets</p>
                                            </div>
                                        )}

                                        {columnTickets.map((ticket, index) => (
                                            <Draggable
                                                key={ticket.id.toString()}
                                                draggableId={ticket.id.toString()}
                                                index={index}
                                            >
                                                {(provided, snapshot) => {
                                                    const content = (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            style={{
                                                                ...provided.draggableProps.style,
                                                                zIndex: snapshot.isDragging ? 9999 : 1
                                                            }}
                                                        >
                                                            <motion.div
                                                                initial={{ opacity: 0, y: 10 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                className={clsx(
                                                                    "glass-card p-5 rounded-3xl border transition-colors border-border-theme/50 shadow-xl group/card relative overflow-hidden",
                                                                    snapshot.isDragging ? "border-accent-theme shadow-2xl scale-105 rotate-1 bg-background/95" : "hover:border-accent-theme/40",
                                                                    updatingId === ticket.id && "animate-pulse border-accent-theme opacity-50"
                                                                )}
                                                            >
                                                                {/* Priority Indicator Line */}
                                                                <div
                                                                    className="absolute top-0 left-0 right-0 h-1 opacity-50"
                                                                    style={{ backgroundColor: statusObj.color }}
                                                                />

                                                                <div className="flex items-start justify-between gap-3 mb-4">
                                                                    <div className="flex flex-col gap-1 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[9px] font-mono font-black text-accent-theme/50 tracking-tighter">{ticket.id}</span>
                                                                            <span className={clsx(
                                                                                "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                                                priorityColor(ticket.priority)
                                                                            )}>
                                                                                {ticket.priority}
                                                                            </span>
                                                                        </div>
                                                                        <Link href={`/tickets/${ticket.id}`} onMouseDown={e => e.stopPropagation()}>
                                                                            <h4 className="text-xs font-bold text-foreground leading-tight line-clamp-2 mt-1 group-hover/card:text-accent-theme transition-colors uppercase tracking-tight">
                                                                                {ticket.title}
                                                                            </h4>
                                                                        </Link>
                                                                    </div>

                                                                    {/* Actions Container */}
                                                                    <div className="flex flex-col gap-2 shrink-0">
                                                                        {/* Timer Toggle */}
                                                                        <div onMouseDown={e => e.stopPropagation()}>
                                                                            {activeTimers.find(t => t.ticket_id === ticket.id) ? (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleStopTimer(ticket.id);
                                                                                    }}
                                                                                    className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-all shadow-lg shadow-red-500/10"
                                                                                    title="Parar Cronômetro"
                                                                                >
                                                                                    <div className="w-2.5 h-2.5 bg-red-500 rounded-[2px] animate-pulse" />
                                                                                </button>
                                                                            ) : (
                                                                                ticket.status !== 'Finalizado' && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleStartTimer(ticket.id);
                                                                                        }}
                                                                                        className="p-2 bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20 rounded-xl transition-all opacity-0 group-hover/card:opacity-100"
                                                                                        title="Iniciar Cronômetro"
                                                                                    >
                                                                                        <Play className="w-2.5 h-2.5 fill-current" />
                                                                                    </button>
                                                                                )
                                                                            )}
                                                                        </div>

                                                                        {/* Status Cycle */}
                                                                        <button
                                                                            onMouseDown={e => e.stopPropagation()}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleStatusChange(ticket.id, ticket.status);
                                                                            }}
                                                                            disabled={updatingId === ticket.id}
                                                                            className="p-2 bg-background/50 hover:bg-accent-theme/10 text-[var(--color-text-muted)] hover:text-accent-theme rounded-xl transition-all opacity-0 group-hover/card:opacity-100"
                                                                            title="Próximo Status"
                                                                        >
                                                                            <RefreshCw className={clsx("w-2.5 h-2.5", updatingId === ticket.id && "animate-spin")} />
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center justify-between pt-4 border-t border-border-theme/30 mt-auto">
                                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                                        <div className="w-6 h-6 rounded-full bg-accent-theme/10 flex items-center justify-center text-accent-theme shrink-0 border border-accent-theme/20">
                                                                            <User className="w-3 h-3" />
                                                                        </div>
                                                                        <div className="flex flex-col truncate">
                                                                            <span className="text-[9px] font-black uppercase text-foreground/80 truncate">
                                                                                {ticket.client?.name || 'Desconhecido'}
                                                                            </span>
                                                                            <span className="text-[7px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                                                                                Cliente
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        </div>
                                                    );

                                                    if (snapshot.isDragging) {
                                                        return createPortal(content, document.body);
                                                    }
                                                    return content;
                                                }}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    );
                })}
            </div>
        </DragDropContext>
    );
}
