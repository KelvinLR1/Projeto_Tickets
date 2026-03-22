'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Tag, Check, Folder, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import { Category } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Componente de Seleção de Categoria com Árvore Hierárquica.
 */
interface CategorySelectProps {
    value: number | string;           // ID da categoria selecionada
    onChange: (value: number) => void; // Callback para mudança de valor
    categories: Category[];           // Lista de categorias (incluindo subcategorias aninhadas)
    placeholder?: string;             // Texto de instrução
    className?: string;               // Classes CSS adicionais
    icon?: React.ReactNode;           // Ícone customizado para o botão principal
    sectorId?: number;                // Se fornecido, filtra categorias apenas deste setor
    disabled?: boolean;               // Desabilita o componente
}

/**
 * Componente de Seleção de Categoria (Tree Select).
 * Permite navegar em uma estrutura de árvore, pesquisar e selecionar categorias/subcategorias.
 * Possui lógica inteligente para abrir para cima se não houver espaço abaixo.
 */
export default function CategorySelect({
    value,
    onChange,
    categories,
    placeholder = 'Selecionar Categoria...',
    className,
    icon: MainIcon,
    sectorId,
    disabled = false
}: CategorySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
    const [openUpwards, setOpenUpwards] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fecha o dropdown ao clicar fora do componente
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    /**
     * Detector de espaço na tela.
     * Calcula se o menu deve abrir para baixo (padrão) ou para cima
     * caso esteja muito próximo ao final da janela (viewport).
     */
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // Se houver menos de 400px abaixo, abre para cima
            if (spaceBelow < 400) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [isOpen]);

    // Memoriza a categoria selecionada para exibição no botão principal
    const selectedCategory = useMemo(() => {
        const find = (cats: Category[]): Category | undefined => {
            for (const cat of cats) {
                if (cat.id === Number(value)) return cat;
                if (cat.subcategories) {
                    const found = find(cat.subcategories);
                    if (found) return found;
                }
            }
        };
        return find(categories);
    }, [value, categories]);

    // Expande automaticamente os nós que contêm resultados durante a pesquisa
    useEffect(() => {
        if (search.trim()) {
            const newExpanded = new Set<number>();
            const checkMatches = (cats: Category[]): boolean => {
                let hasMatchInBranch = false;
                for (const cat of cats) {
                    const matches = cat.name.toLowerCase().includes(search.toLowerCase());
                    const subMatches = cat.subcategories ? checkMatches(cat.subcategories) : false;

                    if (subMatches || (matches && cat.subcategories && cat.subcategories.length > 0)) {
                        newExpanded.add(cat.id);
                    }
                    if (matches || subMatches) hasMatchInBranch = true;
                }
                return hasMatchInBranch;
            };
            checkMatches(categories);
            setExpandedNodes(newExpanded);
        } else {
            setExpandedNodes(new Set());
        }
    }, [search, categories]);

    /**
     * Alterna o estado de expansão de uma categoria (pasta).
     */
    const toggleExpand = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedNodes(newExpanded);
    };

    /**
     * Renderiza recursivamente uma categoria e suas subcategorias.
     */
    const renderCategory = (cat: Category, level = 0) => {
        // Filtra categorias inativas e por setor
        if (!cat.is_active) return null;
        const matchesSector = !sectorId || !cat.sector_id || cat.sector_id === sectorId;
        if (!matchesSector) return null;

        const allSubs = cat.subcategories || [];
        const activeSubs = allSubs.filter(s => s.is_active);
        const hasActiveSubs = activeSubs.length > 0;

        const isExpanded = expandedNodes.has(cat.id);
        const isSelected = Number(value) === cat.id;
        const matchesSearch = search === '' || cat.name.toLowerCase().includes(search.toLowerCase());

        /**
         * Verifica recursivamente se algum descendente do nó atual
         * corresponde ao termo de pesquisa para manter o ramo aberto.
         */
        const hasMatchingDescendant = (c: Category): boolean => {
            if (!c.subcategories) return false;
            return c.subcategories.some(sub =>
                sub.is_active && (sub.name.toLowerCase().includes(search.toLowerCase()) || hasMatchingDescendant(sub))
            );
        };

        if (!matchesSearch && !hasMatchingDescendant(cat)) return null;

        return (
            <div key={cat.id} className="select-none">
                <button
                    type="button"
                    onClick={(e) => {
                        // Se tiver subcategorias, apenas expande/colapsa. Caso contrário, seleciona.
                        if (hasActiveSubs) {
                            toggleExpand(cat.id, e);
                        } else {
                            onChange(cat.id);
                            setIsOpen(false);
                        }
                    }}
                    className={clsx(
                        "w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl transition-all group",
                        isSelected ? "bg-accent-theme/10 text-accent-theme" : "hover:bg-white/5 text-gray-400 hover:text-foreground",
                        hasActiveSubs && "cursor-default"
                    )}
                >
                    {/* Recuo e ícones de árvore */}
                    <div className="flex items-center" style={{ marginLeft: `${level * 16}px` }}>
                        {hasActiveSubs ? (
                            <div className="p-1 hover:bg-white/10 rounded-md transition-colors mr-1">
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </div>
                        ) : (
                            <div className="w-5.5 mr-1 flex justify-center opacity-30">
                                {level > 0 && <span className="text-[10px]">└─</span>}
                            </div>
                        )}

                        {hasActiveSubs ? (
                            isExpanded ? <FolderOpen className="w-4 h-4 mr-2 text-accent-theme/60" /> : <Folder className="w-4 h-4 mr-2 text-gray-500" />
                        ) : (
                            <Tag className={clsx("w-3.5 h-3.5 mr-2", isSelected ? "text-accent-theme" : "text-gray-600")} />
                        )}

                        <span className={clsx("text-xs", level === 0 ? "font-black" : "font-medium", hasActiveSubs && "opacity-80")}>
                            {cat.name}
                        </span>
                    </div>

                    {!hasActiveSubs && isSelected && <Check className="w-3.5 h-3.5 ml-auto text-accent-theme" />}
                </button>

                {/* Renderização animada das subcategorias */}
                <AnimatePresence initial={false}>
                    {hasActiveSubs && (isExpanded || search !== '') && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden mt-1"
                        >
                            {activeSubs.map(sub => renderCategory(sub, level + 1))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    return (
        <div className={clsx("relative w-full", className, isOpen && "z-[1001]")} ref={containerRef}>
            {/* Botão de Controle Principal */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={clsx(
                    "w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm font-bold flex items-center justify-between transition-all outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[56px] text-left",
                    !disabled && "hover:bg-white/5",
                    isOpen && "border-accent-theme/50 ring-4 ring-accent-theme/5",
                    disabled && "opacity-50 cursor-not-allowed bg-white/5"
                )}
            >
                <div className="flex items-center gap-3 truncate">
                    {MainIcon ? <span className="text-accent-theme">{MainIcon}</span> : <Tag className="w-4 h-4 text-accent-theme/50" />}
                    <span>
                        {selectedCategory ? selectedCategory.name : placeholder}
                    </span>
                </div>
                <ChevronDown className={clsx("w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-300", isOpen && "rotate-180")} />
            </button>

            {/* Menu Dropdown com Busca e Árvore */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={clsx(
                            "absolute left-0 w-full bg-background border border-border-theme rounded-2xl shadow-2xl z-[1000] overflow-hidden shadow-black/50 backdrop-blur-2xl",
                            openUpwards ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
                        )}
                    >
                        {/* Campo de Busca */}
                        <div className="p-3 border-b border-border-theme/50 bg-white/5">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Pesquisar categoria..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full bg-background/50 border border-border-theme/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold focus:outline-none focus:border-accent-theme/50 placeholder:text-gray-600"
                                />
                            </div>
                        </div>

                        {/* Área da Árvore de Categorias */}
                        <div className="max-h-[350px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {/* Opção para limpar seleção */}
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(undefined as any);
                                    setIsOpen(false);
                                }}
                                className={clsx(
                                    "w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl transition-all group",
                                    !value ? "bg-accent-theme/10 text-accent-theme" : "hover:bg-white/5 text-gray-400 hover:text-foreground"
                                )}
                            >
                                <div className="flex items-center">
                                    <Tag className={clsx("w-3.5 h-3.5 mr-2", !value ? "text-accent-theme" : "text-gray-600")} />
                                    <span className="text-xs font-black uppercase tracking-widest">
                                        TODAS AS CATEGORIAS
                                    </span>
                                </div>
                                {!value && <Check className="w-3.5 h-3.5 ml-auto text-accent-theme" />}
                            </button>

                            <div className="h-px bg-border-theme/50 my-1 mx-2" />

                            {categories.length === 0 ? (
                                <div className="py-8 text-center opacity-30 italic text-xs">Nenhuma categoria encontrada</div>
                            ) : (
                                categories.map(cat => renderCategory(cat))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
