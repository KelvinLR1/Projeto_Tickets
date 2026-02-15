'use client';

import React, { useState, useEffect } from 'react';
import TicketList from '@/components/TicketList';
import KanbanView from '@/components/KanbanView';
import { Search, Plus, SlidersHorizontal, X as CloseIcon, Circle, Clock, CheckCircle2, AlertOctagon, Tag, LayoutGrid, List } from 'lucide-react';
import { getCategories, Category, getStatuses, Status, getTickets, Ticket } from '@/lib/api';
import CustomSelect from '@/components/CustomSelect';
import CategorySelect from '@/components/CategorySelect';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import Link from 'next/link';
import { TicketRowSkeleton, KanbanColumnSkeleton } from '@/components/Skeleton';

export default function TicketsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<Ticket[]>([]);

    // Filtros
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined);
    const [categories, setCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [catsData, statusesData, ticketsData] = await Promise.all([
                getCategories(),
                getStatuses(),
                getTickets()
            ]);
            setCategories(catsData);
            setStatuses(statusesData);
            setTickets(ticketsData);
        } catch (error) {
            console.error('Failed to load tickets data:', error);
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setStatusFilter('');
        setPriorityFilter('');
        setCategoryFilter(undefined);
    };

    const hasActiveFilters = statusFilter || priorityFilter || (categoryFilter !== undefined);

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-10">

                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Gestão de <span className="text-accent-theme">Chamados</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">Monitore e resolva os tickets solicitados pelos clientes.</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* View Mode Toggle */}
                        <div className="flex bg-card/50 border border-border-theme p-1.5 rounded-2xl backdrop-blur-sm self-end">
                            <button
                                onClick={() => setViewMode('list')}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'list'
                                        ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                            >
                                <List className="w-4 h-4" />
                                <span className="hidden sm:inline">Lista</span>
                            </button>
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'kanban'
                                        ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                            >
                                <LayoutGrid className="w-4 h-4" />
                                <span className="hidden sm:inline">Kanban</span>
                            </button>
                        </div>

                        <Link
                            href="/tickets/new"
                            className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                        >
                            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                            NOVO TICKET
                        </Link>
                    </div>
                </div>

                {/* Filters and Search Bar Container */}
                <div className="flex flex-col gap-6">
                    <div className="glass-card p-6 rounded-3xl border border-border-theme flex flex-col md:flex-row gap-6 shadow-2xl relative overflow-hidden group">
                        <div className="relative flex-1">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-accent-theme" />
                            <input
                                type="text"
                                placeholder="Buscar por assunto ou descrição..."
                                className="w-full bg-background/50 border border-border-theme rounded-2xl pl-14 pr-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className={clsx(
                                "flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border",
                                showAdvanced || hasActiveFilters
                                    ? "bg-accent-theme/10 text-accent-theme border-accent-theme/30 shadow-lg shadow-accent-theme/5"
                                    : "bg-background/20 border-border-theme text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <SlidersHorizontal className="w-4 h-4" />
                            {showAdvanced ? 'Ocultar Filtros' : 'Filtros Avançados'}
                            {hasActiveFilters && <div className="w-2 h-2 rounded-full bg-accent-theme ml-2 animate-ping" />}
                        </button>
                    </div>

                    {/* Advanced Filters Panel */}
                    <AnimatePresence>
                        {showAdvanced && (
                            <motion.div
                                initial={{ opacity: 0, y: -20, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto' }}
                                exit={{ opacity: 0, y: -20, height: 0 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className="overflow-hidden"
                            >
                                <div className="glass-card p-10 rounded-3xl border border-border-theme shadow-2xl space-y-10 relative z-30">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                <Circle className="w-3 h-3 text-accent-theme/50" />
                                                Status do Chamado
                                            </label>
                                            <CustomSelect
                                                value={statusFilter}
                                                onChange={setStatusFilter}
                                                placeholder="TODOS OS STATUS"
                                                options={[
                                                    { value: '', label: 'TODOS OS STATUS', icon: <Circle className="w-4 h-4 opacity-50" /> },
                                                    ...statuses.map(s => ({
                                                        value: s.name,
                                                        label: s.name,
                                                        icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                                    }))
                                                ]}
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                <Tag className="w-3 h-3 text-accent-theme/50" />
                                                Nível de Prioridade
                                            </label>
                                            <CustomSelect
                                                value={priorityFilter}
                                                onChange={setPriorityFilter}
                                                placeholder="TODAS AS PRIORIDADES"
                                                options={[
                                                    { value: '', label: 'TODAS AS PRIORIDADES', icon: <Tag className="w-4 h-4 opacity-50" /> },
                                                    { value: 'Baixa', label: 'Baixa', icon: <Circle className="w-4 h-4 text-emerald-500" /> },
                                                    { value: 'Média', label: 'Média', icon: <Circle className="w-4 h-4 text-accent-theme" /> },
                                                    { value: 'Alta', label: 'Alta', icon: <Circle className="w-4 h-4 text-orange-500" /> },
                                                    { value: 'Crítica', label: 'Crítica', icon: <AlertOctagon className="w-4 h-4 text-red-500" /> },
                                                ]}
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                <Tag className="w-3 h-3 text-accent-theme/50" />
                                                Categoria do Ticket
                                            </label>
                                            <CategorySelect
                                                value={categoryFilter || ''}
                                                onChange={val => setCategoryFilter(val || undefined)}
                                                categories={categories}
                                                placeholder="TODAS AS CATEGORIAS"
                                            />
                                        </div>
                                    </div>

                                    {hasActiveFilters && (
                                        <div className="pt-8 border-t border-border-theme flex justify-end">
                                            <button
                                                onClick={clearFilters}
                                                className="flex items-center gap-3 px-6 py-3 rounded-xl border border-red-500/20 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
                                            >
                                                <CloseIcon className="w-4 h-4" />
                                                Limpar Filtros ativos
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* View Switcher */}
                <div>
                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading-skeletons"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                {viewMode === 'list' ? (
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
                                                        <th className="px-8 py-6 text-right w-24">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-theme/30">
                                                    {[1, 2, 3, 4, 5].map(i => <TicketRowSkeleton key={i} />)}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar min-h-[700px] items-start">
                                        {[1, 2, 3, 4].map(i => <KanbanColumnSkeleton key={i} />)}
                                    </div>
                                )}
                            </motion.div>
                        ) : viewMode === 'list' ? (
                            <motion.div
                                key="list-view"
                                initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <TicketList
                                    tickets={tickets}
                                    statuses={statuses}
                                    searchTerm={searchTerm}
                                    status={statusFilter}
                                    priority={priorityFilter}
                                    categoryId={categoryFilter}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="kanban-view"
                                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <KanbanView
                                    tickets={tickets}
                                    statuses={statuses}
                                    searchTerm={searchTerm}
                                    status={statusFilter}
                                    priority={priorityFilter}
                                    categoryId={categoryFilter}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </main>
    );
}
