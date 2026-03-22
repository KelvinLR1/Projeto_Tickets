'use client';

import React, { useState, useEffect } from 'react';
import TicketList from '@/components/TicketList';
import KanbanView from '@/components/KanbanView';
import { Search, Plus, SlidersHorizontal, X as CloseIcon, Circle, Clock, CheckCircle2, AlertOctagon, Tag, LayoutGrid, List, Users, User } from 'lucide-react';
import { getCategories, Category, getStatuses, Status, getTickets, Ticket, getSectors, Sector } from '@/lib/api';
import CustomSelect from '@/components/CustomSelect';
import CategorySelect from '@/components/CategorySelect';
import { useAuth } from '@/components/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import Link from 'next/link';
import { TicketRowSkeleton, KanbanColumnSkeleton } from '@/components/Skeleton';
import Pagination from '@/components/Pagination';
import { getTicketsCount } from '@/lib/api';

export default function TicketsPage() {
    const { user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('tickets_view_mode') as 'list' | 'kanban') || 'list';
        }
        return 'list';
    });
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<Ticket[]>([]);

    // Filtros
    const [statusFilter, setStatusFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<number | undefined>(undefined);
    const [categories, setCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [sectorFilter, setSectorFilter] = useState<number | undefined>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('tickets_last_sector');
            return saved ? parseInt(saved) : undefined;
        }
        return undefined;
    });
    const [excludeFinalized, setExcludeFinalized] = useState(true);
    const [assignedUserFilter, setAssignedUserFilter] = useState<number | undefined>(undefined);
    const [clientFilter, setClientFilter] = useState<number | undefined>(undefined);
    const [unassignedOnly, setUnassignedOnly] = useState(false);
    const [filterScope, setFilterScope] = useState<'my_plus_unassigned' | 'all'>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('tickets_filter_scope') as 'my_plus_unassigned' | 'all') || 'my_plus_unassigned';
        }
        return 'my_plus_unassigned';
    });
    const [attendants, setAttendants] = useState<{ id: number; name: string }[]>([]);
    const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    const availableSectors = user?.sectors || [];

    // Persistir preferências
    useEffect(() => {
        localStorage.setItem('tickets_view_mode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('tickets_filter_scope', filterScope);
    }, [filterScope]);

    useEffect(() => {
        if (sectorFilter !== undefined) {
            localStorage.setItem('tickets_last_sector', sectorFilter.toString());
        }
    }, [sectorFilter]);

    // Garantir que o filtro de setor seja válido para o usuário logado
    useEffect(() => {
        if (availableSectors.length > 0) {
            const isCurrentValid = sectorFilter !== undefined && availableSectors.some(s => s.id === sectorFilter);
            if (!isCurrentValid) {
                // Se o salvo no localStorage não for válido para este usuário, usa o primeiro disponível
                setSectorFilter(availableSectors[0].id);
            }
        }
    }, [user, availableSectors]);

    // Buscar atendentes e clientes
    useEffect(() => {
        const fetchFilterData = async () => {
            if (!user) return; // Wait for user session
            try {
                const [usersData, clientsData] = await Promise.all([
                    import('@/lib/api').then(m => m.getAttendants()),
                    import('@/lib/api').then(m => m.getClients())
                ]);
                setAttendants(usersData);
                setClients(clientsData.map(c => ({ id: c.id, name: c.name })));
            } catch (error) {
                console.error('Failed to fetch filter data:', error);
            }
        };
        fetchFilterData();
    }, [user]);

    useEffect(() => {
        let ignore = false;

        async function fetchData() {
            // Só busca se tivermos um setor selecionado 
            if (sectorFilter === undefined) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const params: any = {
                    sectorId: sectorFilter,
                    priority: priorityFilter || undefined,
                    categoryId: categoryFilter,
                    q: searchTerm || undefined,
                    status: statusFilter || undefined,
                    excludeFinalized: excludeFinalized,
                    clientId: clientFilter,
                    unassignedOnly: unassignedOnly,
                    startDate: startDate || undefined,
                    endDate: endDate || undefined
                };

                // Aplica lógica de escopo
                if (filterScope === 'all') {
                    params.assignedUserId = assignedUserFilter;
                } else {
                    // Por padrão, mostra meus tickets + sem responsável
                    params.myPlusUnassignedId = user?.id;
                }

                const isKanban = viewMode === 'kanban';

                const [catsData, statusesData, ticketsData, countData] = await Promise.all([
                    getCategories(sectorFilter),
                    getStatuses(sectorFilter),
                    getTickets({
                        ...params,
                        skip: isKanban ? 0 : (currentPage - 1) * pageSize,
                        limit: isKanban ? 1000 : pageSize // Fetch substantially more for Kanban
                    }),
                    getTicketsCount(params)
                ]);

                if (!ignore) {
                    setCategories(catsData);
                    setStatuses(statusesData);
                    setTickets(ticketsData);
                    setTotalCount(countData.count);
                    setLoading(false);
                }
            } catch (error) {
                if (!ignore) {
                    console.error('Failed to load tickets data:', error);
                    setLoading(false);
                }
            }
        }

        const delay = searchTerm ? 400 : 0;
        const timeoutId = setTimeout(fetchData, delay);

        return () => {
            ignore = true;
            clearTimeout(timeoutId);
        };
    }, [sectorFilter, statusFilter, priorityFilter, categoryFilter, searchTerm, excludeFinalized, assignedUserFilter, clientFilter, unassignedOnly, startDate, endDate, filterScope, user?.id]);

    const loadData = () => {
        // Redundant
    };

    const clearFilters = () => {
        setStatusFilter('');
        setPriorityFilter('');
        setCategoryFilter(undefined);
        setAssignedUserFilter(undefined);
        setClientFilter(undefined);
        setUnassignedOnly(false);
        setStartDate('');
        setEndDate('');
        setFilterScope('my_plus_unassigned');
    };

    const hasActiveFilters = !!(statusFilter || priorityFilter || categoryFilter || assignedUserFilter || clientFilter || unassignedOnly || startDate || endDate || filterScope !== 'my_plus_unassigned');

    return (
        <motion.main 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -15 }} 
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="min-h-screen p-8 bg-background text-foreground transition-all duration-500"
        >
            <div className="max-w-7xl mx-auto space-y-10">

                {/* Header Area */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 pb-10 border-b border-border-theme">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                        Gestão de <span className="text-accent-theme">Chamados</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">
                            Monitore e resolva os tickets solicitados pelos clientes.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Filter Scope Toggle */}
                        <div className="flex bg-card/50 border border-border-theme p-1 rounded-2xl backdrop-blur-sm self-center h-fit shadow-inner">
                            <button
                                onClick={() => setFilterScope('my_plus_unassigned')}
                                className={clsx(
                                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-xl transition-all",
                                    filterScope === 'my_plus_unassigned'
                                        ? "text-white"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                                title="Meus Atendimentos"
                            >
                                <User className="w-5 h-5" />
                                {filterScope === 'my_plus_unassigned' && (
                                    <motion.div
                                        layoutId="filter-scope-active"
                                        className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                            <button
                                onClick={() => setFilterScope('all')}
                                className={clsx(
                                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-xl transition-all",
                                    filterScope === 'all'
                                        ? "text-white"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                                title="Todos os Tickets"
                            >
                                <Users className="w-5 h-5 opacity-50" />
                                {filterScope === 'all' && (
                                    <motion.div
                                        layoutId="filter-scope-active"
                                        className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                        </div>

                        {/* View Mode Toggle */}
                        <div className="flex bg-card/50 border border-border-theme p-1 rounded-2xl backdrop-blur-sm self-center h-fit shadow-inner">
                            <button
                                onClick={() => setViewMode('list')}
                                className={clsx(
                                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-xl transition-all",
                                    viewMode === 'list'
                                        ? "text-white"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                                title="Visualização em Lista"
                            >
                                <List className="w-5 h-5" />
                                {viewMode === 'list' && (
                                    <motion.div
                                        layoutId="view-mode-active"
                                        className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={clsx(
                                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-xl transition-all",
                                    viewMode === 'kanban'
                                        ? "text-white"
                                        : "text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                                title="Visualização em Kanban"
                            >
                                <LayoutGrid className="w-5 h-5" />
                                {viewMode === 'kanban' && (
                                    <motion.div
                                        layoutId="view-mode-active"
                                        className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                        </div>

                        <Link
                            href="/tickets/new"
                            className="flex items-center justify-center gap-3 px-8 h-12 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95 ml-2"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="hidden md:inline">NOVO TICKET</span>
                        </Link>
                    </div>
                </div>

                {/* Filters and Search Bar Container */}
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Search and Sector - Main Area */}
                        <div className="glass-card p-6 rounded-3xl border border-border-theme flex flex-col md:flex-row gap-6 shadow-2xl relative z-40 group flex-1">
                            <div className="relative flex-[2]">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-accent-theme" />
                                <input
                                    type="text"
                                    placeholder="Buscar por assunto ou descrição..."
                                    className="w-full bg-background/50 border border-border-theme rounded-2xl pl-14 pr-14 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-5 top-1/2 -translate-y-1/2 p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all"
                                    >
                                        <CloseIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {availableSectors.length > 1 && (
                                <div className="flex-1 min-w-[240px]">
                                    <CustomSelect
                                        value={sectorFilter?.toString() || ''}
                                        onChange={val => setSectorFilter(val ? parseInt(val) : undefined)}
                                        placeholder="SELECIONE O SETOR"
                                        options={availableSectors.map(s => ({
                                            value: s.id.toString(),
                                            label: s.name,
                                            icon: <Users className="w-3 h-3" />
                                        }))}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setExcludeFinalized(!excludeFinalized)}
                                title={excludeFinalized ? "Mostrar Tickets Finalizados" : "Ocultar Tickets Finalizados"}
                                className={clsx(
                                    "flex items-center justify-center w-14 h-14 rounded-2xl transition-all active:scale-95 border shrink-0",
                                    !excludeFinalized
                                        ? "bg-accent-theme text-white border-accent-theme shadow-lg shadow-accent-theme/20"
                                        : "glass-card border-border-theme text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <CheckCircle2 className={clsx("w-6 h-6 transition-transform", !excludeFinalized ? "scale-110" : "scale-100 opacity-50")} />
                            </button>

                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                title="Filtros Avançados"
                                className={clsx(
                                    "flex items-center justify-center w-14 h-14 rounded-2xl transition-all active:scale-95 border shrink-0",
                                    showAdvanced || hasActiveFilters
                                        ? "bg-accent-theme/10 text-accent-theme border-accent-theme/30 shadow-lg shadow-accent-theme/5"
                                        : "glass-card border-border-theme text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <div className="relative">
                                    <SlidersHorizontal className="w-6 h-6" />
                                    {hasActiveFilters && (
                                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent-theme border-2 border-background animate-pulse" />
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Advanced Filters Modal */}
                    <AnimatePresence>
                        {showAdvanced && (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                                {/* Backdrop */}
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setShowAdvanced(false)}
                                    className="absolute inset-0 bg-background/60 backdrop-blur-xl"
                                />

                                {/* Modal Card */}
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                    className="glass-card w-full max-w-4xl rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] relative z-10"
                                >
                                    <div className="p-8 sm:p-12 space-y-10">
                                        <div className="flex items-center justify-between">
                                            <div className="space-y-1">
                                                <h2 className="text-3xl font-black uppercase italic tracking-tight">Filtros <span className="text-accent-theme">Avançados</span></h2>
                                                <p className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-widest">Refine sua busca por chamados</p>
                                            </div>
                                            <button
                                                onClick={() => setShowAdvanced(false)}
                                                className="p-4 bg-white/5 hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 rounded-2xl transition-all"
                                            >
                                                <CloseIcon className="w-6 h-6" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div className="space-y-4">
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

                                            <div className="space-y-4">
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

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Tag className="w-3 h-3 text-accent-theme/50" />
                                                    Categoria do Ticket
                                                </label>
                                                <CategorySelect
                                                    value={categoryFilter || ''}
                                                    onChange={val => setCategoryFilter(val || undefined)}
                                                    categories={categories}
                                                    sectorId={sectorFilter}
                                                    placeholder="TODAS AS CATEGORIAS"
                                                />
                                            </div>

                                            {/* Novos filtros */}
                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Users className="w-3 h-3 text-accent-theme/50" />
                                                    Técnico Responsável
                                                </label>
                                                <CustomSelect
                                                    value={assignedUserFilter?.toString() || ''}
                                                    onChange={val => setAssignedUserFilter(val ? parseInt(val) : undefined)}
                                                    placeholder="TODOS OS TÉCNICOS"
                                                    options={[
                                                        { value: '', label: 'TODOS OS TÉCNICOS', icon: <Users className="w-4 h-4 opacity-50" /> },
                                                        ...attendants.map(a => ({
                                                            value: a.id.toString(),
                                                            label: a.name,
                                                            icon: <Users className="w-3 h-3" />
                                                        }))
                                                    ]}
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Users className="w-3 h-3 text-accent-theme/50" />
                                                    Cliente Solicitante
                                                </label>
                                                <CustomSelect
                                                    value={clientFilter?.toString() || ''}
                                                    onChange={val => setClientFilter(val ? parseInt(val) : undefined)}
                                                    placeholder="TODOS OS CLIENTES"
                                                    options={[
                                                        { value: '', label: 'TODOS OS CLIENTES', icon: <Users className="w-4 h-4 opacity-50" /> },
                                                        ...clients.map(c => ({
                                                            value: c.id.toString(),
                                                            label: c.name,
                                                            icon: <Users className="w-3 h-3" />
                                                        }))
                                                    ]}
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Clock className="w-3 h-3 text-accent-theme/50" />
                                                    Filtros Rápidos
                                                </label>
                                                <div className="flex items-center gap-4 h-14 bg-background/50 border border-border-theme rounded-2xl px-6">
                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                        <div
                                                            onClick={() => setUnassignedOnly(!unassignedOnly)}
                                                            className={clsx(
                                                                "w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center",
                                                                unassignedOnly ? "bg-accent-theme border-accent-theme" : "border-border-theme group-hover:border-accent-theme/50"
                                                            )}
                                                        >
                                                            {unassignedOnly && <CheckCircle2 className="w-4 h-4 text-white" />}
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] group-hover:text-foreground">Apenas não atribuídos</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Clock className="w-3 h-3 text-accent-theme/50" />
                                                    Data Inicial
                                                </label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-xs font-bold outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all h-14"
                                                    value={startDate}
                                                    onChange={(e) => setStartDate(e.target.value)}
                                                />
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    <Clock className="w-3 h-3 text-accent-theme/50" />
                                                    Data Final
                                                </label>
                                                <input
                                                    type="date"
                                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-xs font-bold outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all h-14"
                                                    value={endDate}
                                                    onChange={(e) => setEndDate(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="pt-8 border-t border-border-theme flex flex-col sm:flex-row items-center justify-between gap-6">
                                            {hasActiveFilters ? (
                                                <button
                                                    onClick={clearFilters}
                                                    className="flex items-center gap-3 px-8 py-4 rounded-2xl border border-red-500/20 text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all active:scale-95 w-full sm:w-auto"
                                                >
                                                    <CloseIcon className="w-4 h-4" />
                                                    Limpar Filtros ativos
                                                </button>
                                            ) : (
                                                <div />
                                            )}

                                            <button
                                                onClick={() => setShowAdvanced(false)}
                                                className="px-12 py-4 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95 w-full sm:w-auto"
                                            >
                                                Aplicar Filtros
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* View Switcher */}
                <div className="relative min-h-[600px]">
                    <AnimatePresence mode="wait">
                        {viewMode === 'list' ? (
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
                                    sectorId={sectorFilter}
                                    loading={loading}
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
                                    sectorId={sectorFilter}
                                    loading={loading}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {!loading && totalCount > 0 && viewMode === 'list' && (
                        <div className="mt-8 px-2">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={Math.ceil(totalCount / pageSize)}
                                onPageChange={(page) => {
                                    setCurrentPage(page);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                totalCount={totalCount}
                                pageSize={pageSize}
                            />
                        </div>
                    )}
                </div>
            </div>
        </motion.main>
    );
}
