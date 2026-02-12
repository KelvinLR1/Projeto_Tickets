'use client';

import React, { useState, useEffect } from 'react';
import { getReportSummary, ReportSummary, getTickets, Ticket } from '@/lib/api';
import { BarChart3, Download, FileText, Users, Tag, AlertCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const STATUS_MAP: Record<string, string> = {
    'open': 'Aberto',
    'in_progress': 'Em Andamento',
    'closed': 'Fechado'
};

const PRIORITY_MAP: Record<string, string> = {
    'low': 'Baixa',
    'medium': 'Média',
    'high': 'Alta',
    'critical': 'Crítica'
};

export default function ReportsPage() {
    const [summary, setSummary] = useState<ReportSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await getReportSummary();
            setSummary(data);
        } catch (error) {
            console.error('Failed to load report data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            setExporting(true);
            const tickets = await getTickets();

            // Gerar CSV
            const headers = ["ID", "Titulo", "Status", "Prioridade", "Data Criacao"];
            const rows = tickets.map(t => [
                t.id,
                `"${t.title.replace(/"/g, '""')}"`,
                t.status,
                t.priority,
                new Date(t.created_at).toLocaleDateString()
            ]);

            const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `relatorio_tickets_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-30" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 animate-pulse">Gerando Relatórios...</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Centro de <span className="text-accent-theme">Relatórios</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium">Extraia insights e dados consolidados do seu sistema.</p>
                    </div>

                    <button
                        onClick={handleExportCSV}
                        disabled={exporting}
                        className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-2xl shadow-accent-theme/20 active:scale-95 disabled:opacity-50"
                    >
                        {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        Exportar Tickets (CSV)
                    </button>
                </div>

                {/* Grid de Stats Rápidos */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <StatCard
                        title="Top Cliente"
                        value={summary?.by_client[0]?.name || "N/A"}
                        subtitle={`${summary?.by_client[0]?.count || 0} chamados`}
                        icon={<Users className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Foco por Categoria"
                        value={summary?.by_category[0]?.name || "N/A"}
                        subtitle={`${summary?.by_category[0]?.count || 0} registros`}
                        icon={<Tag className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Prioridade Alta"
                        value={summary?.by_priority['high'] || 0}
                        subtitle="Tickets Pendentes"
                        icon={<AlertCircle className="w-5 h-5 text-red-500" />}
                    />
                    <StatCard
                        title="Total de Tickets"
                        value={Object.values(summary?.by_priority || {}).reduce((a, b) => a + b, 0)}
                        subtitle="Volume Total"
                        icon={<FileText className="w-5 h-5 text-accent-theme" />}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Tickets por Cliente */}
                    <ReportSection title="Paticipação por Cliente" icon={<Users className="w-4 h-4" />}>
                        <div className="space-y-6">
                            {summary?.by_client.map((client, i) => (
                                <div key={client.name} className="flex items-center gap-6 group">
                                    <div className="w-10 text-[10px] font-black text-[var(--color-text-muted)] font-mono opacity-50">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-tight">
                                            <span>{client.name}</span>
                                            <span className="text-accent-theme">{client.count}</span>
                                        </div>
                                        <div className="h-3 bg-background rounded-full overflow-hidden border border-border-theme p-0.5">
                                            <div
                                                className="h-full premium-gradient rounded-full transition-all duration-1000 shadow-lg shadow-accent-theme/20"
                                                style={{ width: `${(client.count / (summary.by_client[0]?.count || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ReportSection>

                    {/* Tickets por Categoria */}
                    <ReportSection title="Volume por Categoria" icon={<Tag className="w-4 h-4" />}>
                        <div className="grid grid-cols-1 gap-4">
                            {summary?.by_category.map((cat) => (
                                <div key={cat.name} className="flex items-center justify-between p-5 rounded-2xl bg-background/50 border border-border-theme group hover:border-accent-theme/30 transition-all shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-accent-theme/5 rounded-xl text-accent-theme group-hover:scale-110 transition-transform">
                                            <Tag className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs font-black uppercase tracking-widest">{cat.name}</span>
                                    </div>
                                    <span className="px-4 py-1.5 bg-accent-theme/10 rounded-full border border-accent-theme/20 text-[9px] font-black text-accent-theme">
                                        {cat.count} ITENS
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ReportSection>
                </div>

                {/* Matriz de Situação */}
                <ReportSection title="Matriz de Situação (Prioridade vs Status)" icon={<BarChart3 className="w-4 h-4" />}>
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="text-[10px] font-black uppercase text-[var(--color-text-muted)] border-b border-border-theme">
                                <tr>
                                    <th className="py-6 px-4">Situação</th>
                                    <th className="py-6 px-4 text-center">Baixa</th>
                                    <th className="py-6 px-4 text-center">Média</th>
                                    <th className="py-6 px-4 text-center">Alta</th>
                                    <th className="py-6 px-4 text-center text-red-500">Crítica</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-theme/50">
                                {Object.keys(STATUS_MAP).map(statusKey => (
                                    <tr key={statusKey} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-6 px-4 font-black uppercase text-[10px] text-[var(--color-text-muted)] group-hover:text-foreground transition-colors tracking-widest">
                                            {STATUS_MAP[statusKey]}
                                        </td>
                                        {Object.keys(PRIORITY_MAP).map(priorityKey => {
                                            const cell = summary?.status_priority_matrix.find(m =>
                                                (m.status === STATUS_MAP[statusKey] || m.status === statusKey) &&
                                                (m.priority === PRIORITY_MAP[priorityKey] || m.priority === priorityKey)
                                            );
                                            return (
                                                <td key={priorityKey} className="py-6 px-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={clsx(
                                                            "text-xs font-mono p-2 rounded-lg min-w-[32px] text-center",
                                                            cell?.count ? "font-black text-accent-theme bg-accent-theme/5" : "text-gray-300 opacity-20",
                                                            cell?.is_final && "opacity-40 grayscale"
                                                        )}>
                                                            {cell?.count || 0}
                                                        </span>
                                                        {cell?.is_final && cell?.count > 0 && (
                                                            <span className="text-[8px] font-black uppercase tracking-tighter text-[var(--color-text-muted)] flex items-center gap-0.5">
                                                                🏁 Finalizado
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ReportSection>

            </div>
        </main>
    );
}

function StatCard({ title, value, subtitle, icon }: { title: string, value: string | number, subtitle: string, icon: React.ReactNode }) {
    return (
        <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme shadow-2xl flex flex-col justify-between min-h-[180px]">
            <div className="flex justify-between items-start">
                <div className="p-3 bg-accent-theme/10 rounded-2xl text-accent-theme group-hover:rotate-12 transition-all">
                    {icon}
                </div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">{title}</div>
            </div>
            <div className="space-y-1">
                <div className="text-2xl font-black font-display tracking-tight text-foreground truncate">{value}</div>
                <div className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider italic flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-accent-theme shadow-[0_0_8px_var(--color-accent-theme)]" />
                    {subtitle}
                </div>
            </div>
        </div>
    );
}

function ReportSection({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl space-y-10 relative overflow-hidden group">
            {/* Watermark Icon - Exact match to Settings Page */}
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all duration-700 pointer-events-none">
                {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, {
                    // @ts-ignore
                    className: "w-20 h-20",
                    strokeWidth: 1.5
                }) : null}
            </div>
            <div className="flex items-center gap-4 relative">
                <div className="p-3 bg-accent-theme/10 rounded-2xl text-accent-theme shadow-inner border border-accent-theme/20">
                    {icon}
                </div>
                <h2 className="text-xl font-black font-display uppercase tracking-tight italic">{title}</h2>
            </div>
            <div className="relative">
                {children}
            </div>
        </div>
    );
}
