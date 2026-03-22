'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

/**
 * Interface que define uma opção do seletor customizado.
 */
interface Option {
    value: string | number;           // Valor real da opção
    label: string;                    // Texto de exibição principal
    icon?: React.ReactNode;           // Ícone opcional
    subtitle?: string;                // Subtítulo descritivo
    className?: string;               // Classes customizadas para a opção
}

/**
 * Propriedades do componente CustomSelect.
 */
interface CustomSelectProps {
    value: string | number;           // Valor selecionado atualmente
    onChange: (value: any) => void;   // Função disparada ao selecionar
    options: Option[];                 // Lista de opções disponíveis
    placeholder?: string;              // Texto quando nada está selecionado
    label?: string;                    // Rótulo opcional acima do seletor
    className?: string;                // Classes adicionais para o container
    icon?: React.ReactNode;            // Ícone para o rótulo
    disabled?: boolean;                // Desabilita o seletor
}

/**
 * Componente de Seleção Customizado (Select Dropdown).
 * Oferece uma interface premium com suporte a ícones, subtítulos,
 * pesquisa interna e posicionamento inteligente (abre para cima se necessário).
 */
export default function CustomSelect({
    value,
    onChange,
    options,
    placeholder = 'Selecione...',
    label,
    className,
    icon: MainIcon,
    disabled = false
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [openUpwards, setOpenUpwards] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Encontra a opção selecionada para exibição no botão
    const selectedOption = options.find(opt => opt.value === value);

    // Filtra as opções com base no termo de pesquisa
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Fecha o dropdown ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Lógica ao abrir/fechar o menu
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // Se houver pouco espaço abaixo (< 350px), abre para cima
            if (spaceBelow < 350) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }

            // Foca o campo de busca automaticamente (delay para animação inicial)
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 100);
        } else {
            setSearchTerm(''); // Limpa a busca ao fechar
        }
    }, [isOpen]);

    return (
        <div className={clsx("space-y-3 relative", isOpen ? "z-50" : "z-10", className)} ref={containerRef}>

            {/* Rótulo (Label) */}
            {label && (
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                    {MainIcon && <span className="opacity-70">{MainIcon}</span>}
                    {label}
                </label>
            )}

            <div className="relative">
                {/* Botão de Controle (Trigger) */}
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
                        {selectedOption?.icon && <span className="text-accent-theme">{selectedOption.icon}</span>}
                        <span className={clsx(!selectedOption && "text-[var(--color-text-muted)] font-normal")}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    </div>
                    <ChevronDown className={clsx("w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-300", isOpen && "rotate-180")} />
                </button>

                {/* Lista de Opções Animada */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className={clsx(
                                "absolute left-0 w-full bg-card/95 backdrop-blur-xl border border-border-theme rounded-2xl shadow-3xl z-[1000] overflow-hidden shadow-black/80 flex flex-col",
                                openUpwards ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
                            )}
                        >
                            {/* Campo de Busca Interno (aparece se houver mais de 5 opções) */}
                            {options.length > 5 && (
                                <div className="p-2 border-b border-border-theme bg-white/5">
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Buscar..."
                                        className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-theme/30 transition-all"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                            )}

                            {/* Área das Opções */}
                            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {filteredOptions.length > 0 ? (
                                    filteredOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                onChange(opt.value);
                                                setIsOpen(false);
                                            }}
                                            className={clsx(
                                                "w-full text-left p-4 hover:bg-accent-theme/10 rounded-xl transition-all flex items-center justify-between group",
                                                opt.className,
                                                value === opt.value && "bg-accent-theme/5"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                {opt.icon && <div className={clsx("transition-transform group-hover:scale-110", value === opt.value ? "text-accent-theme" : "text-[var(--color-text-muted)]")}>{opt.icon}</div>}
                                                <div>
                                                    <div className={clsx("text-xs font-bold transition-colors", value === opt.value ? "text-accent-theme" : "text-foreground group-hover:text-accent-theme")}>
                                                        {opt.label}
                                                    </div>
                                                    {opt.subtitle && <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider mt-0.5">{opt.subtitle}</div>}
                                                </div>
                                            </div>
                                            {/* Indicador de Seleção */}
                                            {value === opt.value && <CheckCircle2 className="w-4 h-4 text-accent-theme animate-in zoom-in duration-300" />}
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-xs text-[var(--color-text-muted)] italic">
                                        Nenhum resultado encontrado
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
