'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Users, Briefcase, Search, X, Filter } from 'lucide-react';
import CustomSelect from './CustomSelect';
import { getSectors, getAttendants, Sector, ReportFilters } from '../lib/api';
import { motion, AnimatePresence } from 'framer-motion';

interface FilterBarProps {
    onFilter: (filters: ReportFilters) => void;
    isLoading?: boolean;
}

/**
 * Barra de Filtros Avançados para Relatórios.
 * Permite filtrar dados por período, setor e atendente.
 */
export default function FilterBar({ onFilter, isLoading }: FilterBarProps) {
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [users, setUsers] = useState<{ id: number; name: string }[]>([]);

    const [filters, setFilters] = useState<ReportFilters>({
        startDate: '',
        endDate: '',
        sectorId: undefined,
        userId: undefined
    });

    const [isExpanded, setIsExpanded] = useState(false);

    /**
     * Busca dados auxiliares (setores e atendentes) para popular
     * as opções dos selects de filtro.
     */
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [sectorsData, usersData] = await Promise.all([
                    getSectors(),
                    getAttendants()
                ]);
                setSectors(sectorsData);
                setUsers(usersData);
            } catch (error) {
                console.error("Erro ao carregar dados para filtros:", error);
            }
        };
        fetchData();
    }, []);

    const handleApply = () => {
        onFilter(filters);
    };

    const handleClear = () => {
        const cleared = {
            startDate: '',
            endDate: '',
            sectorId: undefined,
            userId: undefined
        };
        setFilters(cleared);
        onFilter(cleared);
    };

    const sectorOptions = [
        { value: 'all', label: 'Todos os Setores', icon: <Briefcase className="w-4 h-4" /> },
        ...sectors.map(s => ({
            value: s.id,
            label: s.name,
            icon: <Briefcase className="w-4 h-4" />
        }))
    ];

    const userOptions = [
        { value: 'all', label: 'Todos os Atendentes', icon: <Users className="w-4 h-4" /> },
        ...users.map(u => ({
            value: u.id,
            label: u.name,
            icon: <Users className="w-4 h-4" />
        }))
    ];

    const hasActiveFilters = filters.startDate || filters.endDate || filters.sectorId || filters.userId;

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-bold ${isExpanded || hasActiveFilters
                        ? "bg-accent-theme/10 border-accent-theme/30 text-accent-theme"
                        : "bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10"
                        }`}
                >
                    <Filter className="w-4 h-4" />
                    {isExpanded ? "Ocultar Filtros" : "Filtros Avançados"}
                    {hasActiveFilters && !isExpanded && (
                        <span className="ml-1 w-2 h-2 rounded-full bg-accent-theme animate-pulse" />
                    )}
                </button>

                {hasActiveFilters && (
                    <button
                        onClick={handleClear}
                        className="flex items-center gap-1.5 text-xs font-bold text-red-400/80 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/5"
                    >
                        <X className="w-3.5 h-3.5" />
                        Limpar Filtros
                    </button>
                )}
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, y: -20 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -20 }}
                        className="overflow-hidden"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-card/40 backdrop-blur-xl border border-border-theme rounded-3xl shadow-2xl relative overflow-visible">
                            {/* Date Start */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <Calendar className="w-3 h-3 opacity-70" />
                                    Data Inicial
                                </label>
                                <input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm font-bold outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[56px] transition-all"
                                />
                            </div>

                            {/* Date End */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <Calendar className="w-3 h-3 opacity-70" />
                                    Data Final
                                </label>
                                <input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm font-bold outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[56px] transition-all"
                                />
                            </div>

                            {/* Sector Select */}
                            <CustomSelect
                                label="Setor"
                                placeholder="Todos os Setores"
                                icon={<Briefcase className="w-3 h-3" />}
                                value={filters.sectorId || 'all'}
                                onChange={(val) => setFilters({ ...filters, sectorId: val === 'all' ? undefined : val })}
                                options={sectorOptions}
                            />

                            {/* User Select */}
                            <CustomSelect
                                label="Atendente"
                                placeholder="Todos os Atendentes"
                                icon={<Users className="w-3 h-3" />}
                                value={filters.userId || 'all'}
                                onChange={(val) => setFilters({ ...filters, userId: val === 'all' ? undefined : val })}
                                options={userOptions}
                            />

                            {/* Filter Action */}
                            <div className="lg:col-span-4 flex justify-end gap-3 mt-2">
                                <button
                                    onClick={handleApply}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 px-8 py-4 bg-accent-theme text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-accent-theme/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Filtrando...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4" />
                                            Aplicar Filtros
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
