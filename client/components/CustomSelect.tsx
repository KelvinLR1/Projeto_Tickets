'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface Option {
    value: string | number;
    label: string;
    icon?: React.ReactNode;
    subtitle?: string;
    className?: string;
}

interface CustomSelectProps {
    value: string | number;
    onChange: (value: any) => void;
    options: Option[];
    placeholder?: string;
    label?: string;
    className?: string;
    icon?: React.ReactNode;
}

export default function CustomSelect({
    value,
    onChange,
    options,
    placeholder = 'Selecione...',
    label,
    className,
    icon: MainIcon
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [openUpwards, setOpenUpwards] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Detect if should open upwards
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // Typical max-height of dropdown is 300px + padding
            if (spaceBelow < 350) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [isOpen]);

    return (
        <div className={clsx("space-y-3 relative", isOpen ? "z-50" : "z-10", className)} ref={containerRef}>
            {label && (
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                    {MainIcon && <span className="opacity-70">{MainIcon}</span>}
                    {label}
                </label>
            )
            }
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={clsx(
                        "w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm font-bold flex items-center justify-between hover:bg-white/5 transition-all outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[56px] text-left",
                        isOpen && "border-accent-theme/50 ring-4 ring-accent-theme/5"
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

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className={clsx(
                                "absolute left-0 w-full bg-card/95 backdrop-blur-xl border border-border-theme rounded-2xl shadow-3xl z-[1000] overflow-hidden",
                                openUpwards ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
                            )}
                        >
                            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {options.map((opt) => (
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
                                        {value === opt.value && <CheckCircle2 className="w-4 h-4 text-accent-theme animate-in zoom-in duration-300" />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
