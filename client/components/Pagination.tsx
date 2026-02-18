'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalCount: number;
    pageSize: number;
}

const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    totalCount,
    pageSize
}) => {
    // if (totalPages <= 1) return null; // Allow indicating total count even on single page

    const renderPageButtons = () => {
        const buttons = [];
        const delta = 2; // Number of pages to show before and after current page

        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - delta && i <= currentPage + delta)
            ) {
                buttons.push(
                    <button
                        key={i}
                        onClick={() => onPageChange(i)}
                        className={clsx(
                            "w-10 h-10 rounded-xl font-bold transition-all text-xs flex items-center justify-center",
                            currentPage === i
                                ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/30"
                                : "bg-card/50 border border-border-theme text-[var(--color-text-muted)] hover:bg-accent-theme/10 hover:text-accent-theme"
                        )}
                    >
                        {i}
                    </button>
                );
            } else if (
                i === currentPage - delta - 1 ||
                i === currentPage + delta + 1
            ) {
                buttons.push(
                    <div key={i} className="w-10 h-10 flex items-center justify-center text-[var(--color-text-muted)]">
                        <MoreHorizontal className="w-4 h-4 opacity-50" />
                    </div>
                );
            }
        }
        return buttons;
    };

    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-8 px-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] italic">
                Mostrando <span className="text-foreground">{startIdx}-{endIdx}</span> de <span className="text-accent-theme">{totalCount}</span> registros
            </div>

            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="w-10 h-10 rounded-xl bg-card/50 border border-border-theme flex items-center justify-center text-[var(--color-text-muted)] hover:bg-accent-theme/10 hover:text-accent-theme transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                        {renderPageButtons()}
                    </div>

                    <button
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="w-10 h-10 rounded-xl bg-card/50 border border-border-theme flex items-center justify-center text-[var(--color-text-muted)] hover:bg-accent-theme/10 hover:text-accent-theme transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default Pagination;
