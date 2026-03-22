'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

/**
 * Propriedades do componente de Paginação.
 */
interface PaginationProps {
    currentPage: number;           // Página atual (base 1)
    totalPages: number;             // Total de páginas disponíveis
    onPageChange: (page: number) => void; // Função chamada ao clicar em uma página
    totalCount: number;             // Total de registros encontrados
    pageSize: number;               // Tamanho da página (registros por página)
}

/**
 * Componente de Paginação universal.
 * Renderiza controles de navegação (anterior, próximo e números de página) 
 * com elipses para lidar com muitas páginas.
 */
const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    totalCount,
    pageSize
}) => {

    /**
     * Gera os botões numéricos da paginação de forma inteligente.
     * Mostra a primeira, a última, e as páginas ao redor da atual.
     */
    const renderPageButtons = () => {
        const buttons = [];
        const delta = 2; // Quantidade de páginas adjacentes a mostrar

        for (let i = 1; i <= totalPages; i++) {
            // Lógica para mostrar: Primeira, Última, ou dentro do intervalo Delta
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
            }
            // Adiciona reticências (mais páginas) no intervalo vazio
            else if (
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

    // Cálculos para o texto informativo (ex: "Mostrando 1-20 de 100")
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 py-8 px-2">

            {/* Resumo de registros */}
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] italic">
                Mostrando <span className="text-foreground">{startIdx}-{endIdx}</span> de <span className="text-accent-theme">{totalCount}</span> registros
            </div>

            {/* Controles de página (só exibe se houver mais de uma página) */}
            {totalPages > 1 && (
                <div className="flex items-center gap-2">
                    {/* Botão Anterior */}
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

                    {/* Botão Próximo */}
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
