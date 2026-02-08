'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTicket, Ticket, getCategories, Category, getClients, Client } from '@/lib/api';
import { Loader2, ArrowLeft, Clock, AlertCircle, CheckCircle, User, Tag, Calendar, Paperclip, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import clsx from 'clsx';

export default function TicketDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<Client | null>(null);
    const [category, setCategory] = useState<Category | null>(null);

    useEffect(() => {
        if (params.id) {
            loadData();
        }
    }, [params.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const ticketId = parseInt(params.id as string);
            const ticketData = await getTicket(ticketId);
            setTicket(ticketData);

            // Carregar cliente e categoria em paralelo se necessário
            // Nota: Se o ticket já trouxer categoria e cliente via join no backend, 
            // podemos usar direto. Mas como o Ticket interface no api.ts sugere client_id,
            // vamos buscar para garantir detalhes completos.

            const [clientsData, catsData] = await Promise.all([
                getClients(),
                getCategories()
            ]);

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
        } finally {
            setLoading(false);
        }
    };

    const statusConfig = (status: string) => {
        switch (status) {
            case 'open': return { label: 'Aberto', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' };
            case 'in_progress': return { label: 'Em Progresso', icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10 border-yellow-500/20' };
            case 'closed': return { label: 'Concluído', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10 border-green-500/20' };
            default: return { label: status, icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-500/10 border-gray-500/20' };
        }
    };

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

    const { label, icon: StatusIcon, color, bg } = statusConfig(ticket.status);

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
                        <span className={clsx("px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border", bg, color)}>
                            <StatusIcon className="w-3 h-3 inline-block mr-2 -mt-0.5" />
                            {label}
                        </span>
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
                            <div className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30">
                                <div className="w-14 h-14 rounded-2xl premium-gradient flex items-center justify-center text-white shadow-xl">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Solicitante</p>
                                    <p className="font-bold text-lg">{client?.name || 'Cliente Desconhecido'}</p>
                                    <p className="text-xs text-gray-500">{client?.email || 'Sem e-mail'}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30">
                                <div className="w-14 h-14 rounded-2xl bg-accent-theme/10 border border-accent-theme/20 flex items-center justify-center text-accent-theme shadow-xl">
                                    <Tag className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Área / Categoria</p>
                                    <p className="font-bold text-lg">{category?.name || 'Sem Categoria'}</p>
                                    <p className="text-xs text-accent-theme font-medium uppercase tracking-[0.1em]">Técnico</p>
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
                                <button className="w-full py-4 rounded-2xl border border-red-500/20 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-500/10 transition-all">
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
        </main>
    );
}
