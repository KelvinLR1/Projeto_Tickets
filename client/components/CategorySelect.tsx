'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Tag, Check, Folder, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import { Category } from '@/lib/api';

interface CategorySelectProps {
    value: number | string;
    onChange: (value: number) => void;
    categories: Category[];
    placeholder?: string;
    className?: string;
    icon?: React.ReactNode;
}

export default function CategorySelect({
    value,
    onChange,
    categories,
    placeholder = 'Selecionar Categoria...',
    className,
    icon: MainIcon
}: CategorySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Find selected category for display
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

    // Expand parent nodes that contain matches when searching
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

    const renderCategory = (cat: Category, level = 0) => {
        const hasSubs = cat.subcategories && cat.subcategories.length > 0;
        const isExpanded = expandedNodes.has(cat.id);
        const isSelected = Number(value) === cat.id;
        const matchesSearch = search === '' || cat.name.toLowerCase().includes(search.toLowerCase());

        // Only show if it matches or has matching descendants
        const hasMatchingDescendant = (c: Category): boolean => {
            if (!c.subcategories) return false;
            return c.subcategories.some(sub =>
                sub.name.toLowerCase().includes(search.toLowerCase()) || hasMatchingDescendant(sub)
            );
        };

        if (!matchesSearch && !hasMatchingDescendant(cat)) return null;

        return (
            <div key={cat.id} className="select-none">
                <button
                    type="button"
                    onClick={() => {
                        onChange(cat.id);
                        setIsOpen(false);
                    }}
                    className={clsx(
                        "w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl transition-all group",
                        isSelected ? "bg-accent-theme/10 text-accent-theme" : "hover:bg-white/5 text-gray-400 hover:text-foreground"
                    )}
                >
                    {/* Indentation with visual connector */}
                    <div className="flex items-center" style={{ marginLeft: `${level * 16}px` }}>
                        {hasSubs ? (
                            <div
                                onClick={(e) => toggleExpand(cat.id, e)}
                                className="p-1 hover:bg-white/10 rounded-md transition-colors mr-1"
                            >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </div>
                        ) : (
                            <div className="w-5.5 mr-1 flex justify-center opacity-30">
                                {level > 0 && <span className="text-[10px]">└─</span>}
                            </div>
                        )}

                        {hasSubs ? (
                            isExpanded ? <FolderOpen className="w-4 h-4 mr-2 text-accent-theme/60" /> : <Folder className="w-4 h-4 mr-2 text-gray-500" />
                        ) : (
                            <Tag className={clsx("w-3.5 h-3.5 mr-2", isSelected ? "text-accent-theme" : "text-gray-600")} />
                        )}

                        <span className={clsx("text-xs", level === 0 ? "font-black uppercase tracking-widest" : "font-medium")}>
                            {cat.name}
                        </span>
                    </div>

                    {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-accent-theme" />}
                </button>

                {hasSubs && (isExpanded || search !== '') && (
                    <div className="mt-1">
                        {cat.subcategories!.map(sub => renderCategory(sub, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={clsx("relative w-full", className, isOpen && "z-[1001]")} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={clsx(
                    "w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm font-bold flex items-center justify-between hover:bg-white/5 transition-all outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[56px] text-left",
                    isOpen && "border-accent-theme/50 ring-4 ring-accent-theme/5"
                )}
            >
                <div className="flex items-center gap-3 truncate">
                    {MainIcon ? <span className="text-accent-theme">{MainIcon}</span> : <Tag className="w-4 h-4 text-accent-theme/50" />}
                    <span className={clsx(!selectedCategory && "text-[var(--color-text-muted)] font-normal")}>
                        {selectedCategory ? selectedCategory.name : placeholder}
                    </span>
                </div>
                <ChevronDown className={clsx("w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-300", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-card/95 backdrop-blur-3xl border border-border-theme rounded-2xl shadow-3xl z-[1000] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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

                    <div className="max-h-[350px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {categories.length === 0 ? (
                            <div className="py-8 text-center opacity-30 italic text-xs">Nenhuma categoria encontrada</div>
                        ) : (
                            categories.map(cat => renderCategory(cat))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
