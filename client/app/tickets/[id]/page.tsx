'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTicket, Ticket, getCategories, Category, getClients, Client, getTickets, getStatuses, Status, updateTicket } from '@/lib/api';
import { Loader2, ArrowLeft, Clock, AlertCircle, CheckCircle, User, Tag, Calendar, Paperclip, MessageSquare, ShieldCheck, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import clsx from 'clsx';
import { useNotification } from '@/components/NotificationProvider';

export default function TicketDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { showNotification, confirm: askConfirm } = useNotification();

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<Client | null>(null);
    const [category, setCategory] = useState<Category | null>(null);
    const [statuses, setStatuses] = useState<Status[]>([]);

    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isClosingClientModal, setIsClosingClientModal] = useState(false);
    const [clientTickets, setClientTickets] = useState<Ticket[]>([]);
    const [loadingClientTickets, setLoadingClientTickets] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    useEffect(() => {
        if (params.id) {
            loadData();
        }
    }, [params.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const ticketId = parseInt(params.id as string);

            const [ticketData, clientsData, catsData, statusesData] = await Promise.all([
                getTicket(ticketId),
                getClients(),
                getCategories(),
                getStatuses()
            ]);

            setTicket(ticketData);
            setStatuses(statusesData);

            const foundClient = clientsData.find(c => c.id === ticketData.client_id);
            setClient(foundClient || null);

            // Busca recursiva da categoria
            const findCategory = (cats: Category[], id: number): Category | undefined => {
                for (const cat of cats) {
                    if (cat.id === id) return cat;
                    if (cat.subcategories) {
                        const found = findCategory(cat.subcategories, id);
                        if (found) return found;
                    }
                }
            };

            if (ticketData.category_id) {
                const foundCat = findCategory(catsData, ticketData.category_id);
                setCategory(foundCat || null);
            }

        } catch (error) {
            console.error('Failed to load ticket details:', error);
            showNotification('Erro ao carregar detalhes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadClientTickets = async (clientId: number) => {
        setLoadingClientTickets(true);
        try {
            const tickets = await getTickets(clientId);
            // Ordena por data e pega os últimos 5 (exceto o atual)
            const filtered = tickets
                .filter((t: Ticket) => t.id !== ticket?.id)
                .sort((a: Ticket, b: Ticket) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 5);
            setClientTickets(filtered);
        } catch (error) {
            console.error('Failed to load client tickets:', error);
        } finally {
            setLoadingClientTickets(false);
        }
    };

    const handleClientClick = () => {
        if (client) {
            setIsClientModalOpen(true);
            setIsClosingClientModal(false);
            loadClientTickets(client.id);
        }
    };

    const closeClientModal = () => {
        setIsClosingClientModal(true);
    };

    const handleStatusChange = async (newStatusId: string) => {
        if (!ticket) return;

        const statusId = parseInt(newStatusId);
        const selectedStatus = statuses.find(s => s.id === statusId);

        if (!selectedStatus) return;

        setUpdatingStatus(true);
        try {
            await updateTicket(ticket.id, {
                status_id: selectedStatus.id,
                status: selectedStatus.name
            });

            setTicket({
                ...ticket,
                status: selectedStatus.name,
                status_id: selectedStatus.id,
                status_obj: selectedStatus
            });

            showNotification(`Status atualizado para ${selectedStatus.name}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro ao atualizar status', 'error');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const handleCloseTicket = async () => {
        if (!ticket) return;

        const confirmed = await askConfirm({
            title: 'Encerrar Ticket',
            message: 'Deseja marcar este ticket como concluído?',
            type: 'info'
        });

        if (!confirmed) return;

        // Tenta encontrar um status que pareça "Concluído"
        const closedStatus = statuses.find(s =>
            ['concluído', 'concluido', 'fechado', 'closed', 'finalizado', 'resolvido'].includes(s.name.toLowerCase())
        ) || statuses[statuses.length - 1]; // Fallback: último status da lista (geralmente o final do fluxo)

        if (closedStatus) {
            handleStatusChange(closedStatus.id.toString());
        } else {
            showNotification('Nenhum status de conclusão encontrado.', 'warning');
        }
    };

    const getStatusStyle = (statusObj?: Status, statusName?: string) => {
        if (statusObj) return { color: statusObj.color };

        const found = statuses.find(s => s.name === statusName);
        if (found) return { color: found.color };

        return { color: '#9ca3af' }; // gray-400 fallback
    };

    const currentStatusStyle = getStatusStyle(ticket?.status_obj, ticket?.status);

    const priorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'bg-red-500 text-white shadow-lg shadow-red-500/30';
            case 'high': return 'bg-orange-500 text-white shadow-lg shadow-orange-500/30';
            case 'medium': return 'bg-blue-500 text-white shadow-lg shadow-blue-500/30';
            case 'low': return 'bg-green-500 text-white shadow-lg shadow-green-500/30';
            default: return 'bg-gray-500 text-white';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-20" />
                <p className="text-gray-500 text-xs font-black uppercase tracking-widest animate-pulse">Carregando Detalhes...</p>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 animate-bounce">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                </div>
                <h1 className="text-2xl font-black uppercase tracking-tight italic">Ticket não encontrado</h1>
                <Link href="/tickets" className="px-8 py-4 rounded-2xl bg-background border border-border-theme hover:bg-white/5 transition-all font-bold text-xs uppercase tracking-widest">
                    Voltar para Listagem
                </Link>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Top Navigation */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="group flex items-center gap-3 px-6 py-3 rounded-xl hover:bg-white/5 transition-all text-gray-500 hover:text-foreground"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Voltar</span>
                    </button>

                    <div className="flex items-center gap-4">
                        <div className="relative group/status">
                            <div
                                className="flex items-center gap-2 px-4 py-2 rounded-full border transition-all cursor-pointer hover:brightness-110"
                                style={{
                                    backgroundColor: `${currentStatusStyle.color}15`, // 10% opacity hex
                                    borderColor: `${currentStatusStyle.color}30`,
                                    color: currentStatusStyle.color
                                }}
                            >
                                {updatingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStatusStyle.color }} />}
                                <select
                                    className="appearance-none bg-transparent border-none text-[10px] font-black uppercase tracking-[0.2em] outline-none cursor-pointer pr-4"
                                    value={ticket.status_id || ''}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    style={{ color: currentStatusStyle.color }}
                                >
                                    {statuses.map(s => (
                                        <option key={s.id} value={s.id} className="bg-zinc-900 text-gray-300">
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-3 pointer-events-none opacity-50 block" />
                            </div>
                        </div>

                        <span className={clsx("px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em]", priorityColor(ticket.priority))}>
                            {ticket.priority}
                        </span>
                    </div>
                </div>

                {/* Main Header Card */}
                <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-1000">
                        <Paperclip className="w-32 h-32" />
                    </div>

                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 text-accent-theme font-mono text-xs">
                                <span>#{ticket.id}</span>
                                <span className="w-1 h-1 rounded-full bg-border-theme" />
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight uppercase italic leading-tight max-w-3xl">
                                {ticket.title}
                            </h1>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            <button
                                onClick={handleClientClick}
                                className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30 hover:bg-white/5 hover:border-accent-theme/30 transition-all text-left group/client"
                            >
                                <div className="w-14 h-14 rounded-2xl premium-gradient flex items-center justify-center text-white shadow-xl group-hover/client:scale-110 transition-transform">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 group-hover/client:text-accent-theme transition-colors">Solicitante</p>
                                    <p className="font-bold text-lg">{client?.name || 'Cliente Desconhecido'}</p>
                                    <p className="text-xs text-gray-500">{client?.email || 'Sem e-mail'}</p>
                                </div>
                            </button>

                            <div className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30">
                                <div className="w-14 h-14 rounded-2xl bg-accent-theme/10 border border-accent-theme/20 flex items-center justify-center text-accent-theme shadow-xl">
                                    <ShieldCheck className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Técnico Responsável</p>
                                    <p className="font-bold text-lg">Sistema / Antigravity</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStatusStyle.color }} />
                                        <p className="text-xs font-black uppercase tracking-[0.1em]" style={{ color: currentStatusStyle.color }}>
                                            {ticket?.status || 'Aberto'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Description Area */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-lg min-h-[400px]">
                            <div className="flex items-center gap-3 border-b border-border-theme pb-6 mb-8 text-[10px] font-black uppercase tracking-widest text-gray-500">
                                <MessageSquare className="w-4 h-4 text-accent-theme" />
                                Descrição Técnica e Detalhes
                            </div>

                            <div className="prose prose-invert prose-p:text-gray-400 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-accent-theme prose-img:rounded-2xl prose-img:shadow-2xl prose-img:border prose-img:border-border-theme max-w-none">
                                <ReactMarkdown>
                                    {ticket.description}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Actions/Infos */}
                    <div className="space-y-6">
                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme mb-2">Ações Rápidas</h3>

                            <div className="space-y-3">
                                <button className="w-full py-4 rounded-2xl bg-foreground text-background font-bold text-[10px] uppercase tracking-widest hover:brightness-110 transition-all active:scale-95 shadow-xl">
                                    Responder Chamado
                                </button>
                                <button className="w-full py-4 rounded-2xl bg-background border border-border-theme text-foreground font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all">
                                    Anexar Arquivos
                                </button>
                                <button
                                    onClick={handleCloseTicket}
                                    className="w-full py-4 rounded-2xl border border-red-500/20 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-500/10 transition-all"
                                >
                                    Encerrar Ticket
                                </button>
                            </div>
                        </div>

                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6">Metadados</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Criado em:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">{new Date(ticket.created_at).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Última atualização:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">-</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Atribuído a:</span>
                                    <span className="font-bold text-accent-theme">Sistema</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Modal de Detalhes do Cliente */}
            {(isClientModalOpen || isClosingClientModal) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className={clsx(
                            "absolute inset-0 bg-background/80 backdrop-blur-sm",
                            isClosingClientModal ? "animate-fade-out" : "animate-fade-in"
                        )}
                        onClick={closeClientModal}
                    />

                    <div
                        className={clsx(
                            "relative w-full max-w-2xl glass-card rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden",
                            isClosingClientModal ? "animate-modal-out" : "animate-modal-in"
                        )}
                        onAnimationEnd={(e) => {
                            if (e.animationName === 'modal-out') {
                                setIsClosingClientModal(false);
                                setIsClientModalOpen(false);
                            }
                        }}
                    >
                        {/* Header do Modal */}
                        <div className="premium-gradient p-8 text-white relative">
                            <button
                                onClick={closeClientModal}
                                className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                            >
                                <ArrowLeft className="w-5 h-5 rotate-90" />
                            </button>
                            <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                    <User className="w-10 h-10" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black uppercase italic tracking-tight">{client?.name}</h2>
                                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">Perfil do Cliente</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {/* Informações Cadastrais */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">E-mail</p>
                                    <p className="text-sm font-medium">{client?.email || 'N/A'}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">CPF / CNPJ</p>
                                    <p className="text-sm font-medium">{client?.cpf_cnpj || 'N/A'}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Telefone</p>
                                    <p className="text-sm font-medium">{client?.phone || 'N/A'}</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Desde</p>
                                    <p className="text-sm font-medium">{client?.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}</p>
                                </div>
                            </div>

                            {/* Histórico de Chamados */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme flex items-center gap-2">
                                        <Clock className="w-3 h-3" />
                                        Últimos Chamados
                                    </h3>
                                    {loadingClientTickets && <Loader2 className="w-4 h-4 animate-spin text-accent-theme" />}
                                </div>

                                <div className="space-y-3">
                                    {clientTickets.length > 0 ? (
                                        clientTickets.map(t => {
                                            // Lógica simplificada de estilo para histórico (usando cores padrão para não precisar buscar statuses aqui)
                                            // Ou pode passar a prop statuses se quiser perfeição, mas aqui vou usar um fallback limpo
                                            const statusColor = t.status_obj?.color || '#9ca3af';
                                            return (
                                                <button
                                                    key={t.id}
                                                    onClick={() => {
                                                        closeClientModal();
                                                        setTimeout(() => {
                                                            router.push(`/tickets/${t.id}`);
                                                        }, 400); // Aguarda a animação sair
                                                    }}
                                                    className="w-full p-4 rounded-2xl bg-background border border-border-theme hover:bg-white/5 transition-all flex items-center justify-between text-left group"
                                                >
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-bold group-hover:text-accent-theme transition-colors line-clamp-1">{t.title}</p>
                                                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                            <span>#{t.id}</span>
                                                            <span className="w-1 h-1 rounded-full bg-border-theme" />
                                                            <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                    <span
                                                        className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0 ml-4"
                                                        style={{
                                                            color: statusColor,
                                                            borderColor: `${statusColor}30`,
                                                            backgroundColor: `${statusColor}10`
                                                        }}
                                                    >
                                                        {t.status}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    ) : !loadingClientTickets && (
                                        <p className="text-center py-8 text-gray-500 text-xs italic">Nenhum outro chamado encontrado.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-border-theme flex justify-end">
                            <button
                                onClick={closeClientModal}
                                className="px-8 py-3 rounded-xl bg-background border border-border-theme text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
