'use client';

import React, { useState, useMemo } from 'react';
import { Search, Check, Layers, CheckSquare, Square } from 'lucide-react';
import clsx from 'clsx';

/**
 * Interface que representa um setor do sistema.
 */
interface Sector {
    id: number;
    name: string;
    description?: string;
}

/**
 * Propriedades do componente de seleção múltipla de setores.
 */
interface MultiSelectSectorProps {
    sectors: Sector[];               // Lista total de setores disponíveis
    selectedIds: number[];           // IDs dos setores selecionados atualmente
    onChange: (ids: number[]) => void; // Função disparada ao alterar a seleção
}

/**
 * Componente de Seleção Múltipla de Setores.
 * Fornece uma interface de lista com busca, seleção individual,
 * e botões de ação rápida para selecionar/desmarcar todos os itens visíveis.
 */
export default function MultiSelectSector({ sectors, selectedIds, onChange }: MultiSelectSectorProps) {
    const [searchTerm, setSearchTerm] = useState('');

    // Filtra os setores com base no termo de busca
    const filteredSectors = useMemo(() => {
        return sectors.filter(sector =>
            sector.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [sectors, searchTerm]);

    /**
     * Alterna a seleção de um setor individual.
     */
    const handleToggle = (id: number) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(prevId => prevId !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    /**
     * Seleciona todos os setores que estão visíveis após o filtro de busca.
     */
    const handleSelectAll = () => {
        const visibleIds = filteredSectors.map(s => s.id);
        const newIds = [...selectedIds, ...visibleIds.filter(id => !selectedIds.includes(id))];
        onChange(newIds);
    };

    /**
     * Desmarca todos os setores que estão visíveis após o filtro de busca.
     */
    const handleDeselectAll = () => {
        const visibleIds = filteredSectors.map(s => s.id);
        onChange(selectedIds.filter(id => !visibleIds.includes(id)));
    };

    return (
        <div className="space-y-3">
            {/* Buscador e Ações de Massa */}
            <div className="flex flex-col gap-3">
                <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Search className="w-4 h-4" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar setores..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-background/50 border border-border-theme rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium"
                    />
                </div>

                {/* Resumo e Controles de Seleção Rápida */}
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
                    <span>{selectedIds.length} Selecionado(s)</span>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            className="hover:text-accent-theme transition-colors flex items-center gap-1"
                        >
                            <CheckSquare className="w-3 h-3" /> Todos
                        </button>
                        <button
                            type="button"
                            onClick={handleDeselectAll}
                            className="hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            <Square className="w-3 h-3" /> Nenhum
                        </button>
                    </div>
                </div>
            </div>

            {/* Lista Rolável de Setores */}
            <div className="max-h-60 overflow-y-auto custom-scrollbar border border-border-theme rounded-2xl bg-background/20 backdrop-blur-sm p-2 space-y-1">
                {filteredSectors.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-xs">
                        Nenhum setor encontrado.
                    </div>
                ) : (
                    filteredSectors.map(sector => {
                        const isSelected = selectedIds.includes(sector.id);
                        return (
                            <button
                                key={sector.id}
                                type="button"
                                onClick={() => handleToggle(sector.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group relative overflow-hidden",
                                    isSelected
                                        ? "bg-accent-theme/10 border-accent-theme/50 shadow-sm"
                                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-border-theme/50"
                                )}
                            >
                                {/* Ícone de Status (Check ou Layers) */}
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0",
                                    isSelected ? "bg-accent-theme text-white" : "bg-white/10 text-muted-foreground group-hover:bg-white/20"
                                )}>
                                    {isSelected ? <Check className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                    <div className={clsx(
                                        "font-bold text-sm truncate",
                                        isSelected ? "text-accent-theme" : "text-foreground"
                                    )}>
                                        {sector.name}
                                    </div>
                                    {sector.description && (
                                        <div className="text-[10px] text-muted-foreground truncate">
                                            {sector.description}
                                        </div>
                                    )}
                                </div>
                                {isSelected && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-accent-theme/5 to-transparent pointer-events-none" />
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
