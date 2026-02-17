'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, Tag, CheckCircle2, TicketIcon, User } from 'lucide-react';
import clsx from 'clsx';
import { getTickets } from '@/lib/api';
import { useDebounce } from 'use-debounce';

interface TicketSearchSelectProps {
    value: number | null;
    onChange: (ticketId: number | null) => void;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
}

export default function TicketSearchSelect({
    value,
    onChange,
    placeholder = 'Buscar ticket por código, título ou cliente...',
    label,
    disabled = false
}: TicketSearchSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<any>(null);
    const [openUpwards, setOpenUpwards] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Initial load for selected value or recent
    useEffect(() => {
        if (value && !selectedTicket) {
            loadInitialTicket(value);
        }
    }, [value]);

    // Detect if should open upwards
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 350) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [isOpen]);

    const loadInitialTicket = async (id: number) => {
        try {
            const data = await getTickets({ q: id.toString(), limit: 1 });
            if (data && data.length > 0) {
                // Confirm it matches exactly if possible, though 'q' is fuzzy. 
                // But crud logic: if digit, searches ID. So exact ID match is likely first.
                const match = data.find((t: any) => t.id === id);
                if (match) setSelectedTicket(match);
            }
        } catch (error) {
            console.error('Error loading initial ticket:', error);
        }
    };

    // Search Effect
    useEffect(() => {
        if (isOpen) {
            searchTickets(debouncedSearchTerm);
        }
    }, [debouncedSearchTerm, isOpen]);

    const searchTickets = async (term: string) => {
        setLoading(true);
        try {
            // If empty, fetch recent (limit 10)
            const params = term ? { q: term, limit: 20 } : { limit: 10 };
            const data = await getTickets(params);
            setResults(data);
        } catch (error) {
            console.error('Error searching tickets:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

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

    const handleSelect = (ticket: any) => {
        setSelectedTicket(ticket);
        onChange(ticket.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={clsx("space-y-2 relative", isOpen ? "z-50" : "z-10")} ref={containerRef}>
            {label && (
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5" />
                    {label}
                </label>
            )}

            <div className="relative group">
                <button
                    type="button"
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                    className={clsx(
                        "w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-left transition-all outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[60px] flex items-center justify-between",
                        !disabled && "hover:bg-white/5",
                        isOpen && "border-accent-theme/50 ring-4 ring-accent-theme/5",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {selectedTicket ? (
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className={clsx(
                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-[10px] font-black",
                                "bg-accent-theme/10 text-accent-theme"
                            )}>
                                #{selectedTicket.id}
                            </div>
                            <div className="truncate">
                                <div className="text-xs font-bold text-foreground truncate">{selectedTicket.title}</div>
                                <div className="text-[9px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                    <User className="w-2.5 h-2.5" />
                                    {selectedTicket.client?.name || 'Sem Cliente'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <span className="text-sm font-bold text-muted-foreground flex items-center gap-3">
                            <Search className="w-4 h-4 opacity-50" />
                            {placeholder}
                        </span>
                    )}

                    {loading && isOpen && <Loader2 className="w-4 h-4 animate-spin text-accent-theme" />}
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className={clsx(
                                "absolute z-50 left-0 right-0 bg-card/95 backdrop-blur-xl border border-border-theme rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[300px]",
                                openUpwards ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
                            )}
                        >
                            <div className="p-3 border-b border-white/5 bg-white/5 sticky top-0 z-10">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        autoFocus
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Digite ID, título ou cliente..."
                                        className="w-full bg-background/50 border border-transparent rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:bg-background focus:border-accent-theme/30 focus:outline-none transition-all placeholder:text-muted-foreground/50"
                                    />
                                </div>
                            </div>

                            <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {loading && results.length === 0 ? (
                                    <div className="p-8 flex flex-col items-center justify-center text-muted-foreground gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin text-accent-theme" />
                                        <span className="text-[10px] uppercase font-black tracking-widest">Buscando...</span>
                                    </div>
                                ) : results.length > 0 ? (
                                    results.map((ticket) => (
                                        <button
                                            key={ticket.id}
                                            type="button"
                                            onClick={() => handleSelect(ticket)}
                                            className={clsx(
                                                "w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group border border-transparent",
                                                selectedTicket?.id === ticket.id
                                                    ? "bg-accent-theme/10 border-accent-theme/20"
                                                    : "hover:bg-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-black transition-transform group-hover:scale-110",
                                                selectedTicket?.id === ticket.id ? "bg-accent-theme text-white" : "bg-white/5 text-muted-foreground"
                                            )}>
                                                {ticket.id}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={clsx(
                                                    "text-xs font-bold truncate transition-colors",
                                                    selectedTicket?.id === ticket.id ? "text-accent-theme" : "text-foreground group-hover:text-accent-theme"
                                                )}>
                                                    {ticket.title}
                                                </div>
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider truncate max-w-[120px]">
                                                        {ticket.client?.name || 'S/ Cliente'}
                                                    </span>
                                                    <span className={clsx(
                                                        "text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tight ml-2",
                                                        getStatusColor(ticket.status_obj?.name)
                                                    )}>
                                                        {ticket.status_obj?.name || 'Novo'}
                                                    </span>
                                                </div>
                                            </div>
                                            {selectedTicket?.id === ticket.id && (
                                                <CheckCircle2 className="w-4 h-4 text-accent-theme animate-in zoom-in" />
                                            )}
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-6 text-center">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nenhum ticket encontrado</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function getStatusColor(status?: string) {
    if (!status) return 'bg-gray-500/10 text-gray-500';
    const s = status.toLowerCase();
    if (s.includes('novo') || s.includes('aberto')) return 'bg-blue-500/10 text-blue-500';
    if (s.includes('andamento') || s.includes('análise')) return 'bg-yellow-500/10 text-yellow-500';
    if (s.includes('pendente')) return 'bg-orange-500/10 text-orange-500';
    if (s.includes('concluído') || s.includes('resolvido')) return 'bg-emerald-500/10 text-emerald-500';
    return 'bg-white/5 text-muted-foreground';
}
