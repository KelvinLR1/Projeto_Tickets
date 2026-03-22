'use client';

import React, { useState, useEffect } from 'react';
import { getReportSummary, ReportSummary, exportTickets, getStatuses, Status, getIdleClientsReport, ReportFilters, getCustomReports, createCustomReport, updateCustomReport, deleteCustomReport, executeCustomReport, CustomReport, CustomReportVariable } from '@/lib/api';
import FilterBar from '@/components/FilterBar';
import { BarChart3, Download, FileText, Users, Tag, AlertCircle, Loader2, Calendar, FileSpreadsheet, PieChart, X, ArrowLeft, ChevronRight, ChevronDown, Activity, CheckCircle2, Clock, Database, Save, Plus, Play, Trash2, Edit3, Type, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import * as XLSX from 'xlsx';

const PRIORITY_MAP: Record<string, string> = {
    'low': 'Baixa',
    'medium': 'Média',
    'high': 'Alta',
    'critical': 'Crítica'
};

const formatDuration = (seconds: number) => {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

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
    // Automates separating parenthesized text and dropping it to keep headers minimal
    const splitTitle = title.split(' (');
    const mainTitle = splitTitle[0];

    return (
        <div className="glass-card p-8 rounded-[2.5rem] border border-border-theme shadow-2xl flex flex-col h-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-all duration-700 pointer-events-none">
                {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement, {
                    // @ts-ignore
                    className: "w-20 h-20",
                    strokeWidth: 1.5
                }) : null}
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4 relative mb-8">
                <div className="p-3 bg-accent-theme/10 rounded-2xl text-accent-theme shadow-inner border border-accent-theme/20 w-fit shrink-0">
                    {icon}
                </div>
                <h2 className="text-xl font-black font-display uppercase tracking-tight italic flex flex-wrap items-center gap-2">
                    {mainTitle}
                </h2>
            </div>
            <div className="relative flex-1">
                {children}
            </div>
        </div>
    );
}

export default function ReportsPage() {
    const [summary, setSummary] = useState<ReportSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [systemStatuses, setSystemStatuses] = useState<Status[]>([]);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [filtering, setFiltering] = useState(false);

    // Estados para o Filtro Geral
    const [activeFilters, setActiveFilters] = useState<ReportFilters>({});

    // Estados para o Modal de Relatórios Personalizados
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [modalStep, setModalStep] = useState<'list' | 'config' | 'editor' | 'run'>('list');
    const [reportFormat, setReportFormat] = useState<'excel' | 'pdf'>('excel');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Novos estados para Relatórios Dinâmicos
    const [customReports, setCustomReports] = useState<CustomReport[]>([]);
    const [selectedReport, setSelectedReport] = useState<CustomReport | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [execResults, setExecResults] = useState<any[] | null>(null);
    const [execVariables, setExecVariables] = useState<Record<string, any>>({});

    // Estados do Editor
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editQuery, setEditQuery] = useState('');
    const [editVars, setEditVars] = useState<CustomReportVariable[]>([]);

    useEffect(() => {
        loadData();
    }, [activeFilters]);

    useEffect(() => {
        if (showCustomModal) {
            loadCustomReports();
        }
    }, [showCustomModal]);

    const loadData = async () => {
        try {
            setLoading(true);
            setFiltering(true);
            const data = await getReportSummary(activeFilters);
            setSummary(data);
            const statuses = await getStatuses();
            setSystemStatuses(statuses);
            setError(null);
        } catch (err) {
            setError('Erro ao carregar dados dos relatórios');
            console.error(err);
        } finally {
            setLoading(false);
            setFiltering(false);
        }
    };

    const loadCustomReports = async () => {
        try {
            const reports = await getCustomReports();
            setCustomReports(reports);
        } catch (err) {
            console.error("Erro ao carregar relatórios customizados:", err);
        }
    };

    const handleFilterChange = (filters: ReportFilters) => {
        setActiveFilters(filters);
    };

    const handleExport = async (format: string) => {
        try {
            setExporting(true);
            setShowExportMenu(false);
            await exportTickets(format);
        } catch (error) {
            console.error('Export failed:', error);
        } finally {
            setExporting(false);
        }
    };

    const handleGenerateCustomReport = async () => {
        if (!startDate || !endDate) return;
        setExporting(true);
        try {
            await getIdleClientsReport(startDate, endDate, reportFormat);
            setShowCustomModal(false);
        } catch (error) {
            console.error('Custom report failed:', error);
            alert('Erro ao gerar relatório');
        } finally {
            setExporting(false);
        }
    };

    const handleCreateNew = () => {
        setSelectedReport(null);
        setEditTitle('Novo Relatório');
        setEditDesc('');
        setEditQuery('SELECT * FROM tickets LIMIT 100');
        setEditVars([]);
        setModalStep('editor');
    };

    const handleEditReport = (report: CustomReport) => {
        setSelectedReport(report);
        setEditTitle(report.title);
        setEditDesc(report.description || '');
        setEditQuery(report.query);
        setEditVars(report.variables || []);
        setModalStep('editor');
    };

    const handleSaveReport = async () => {
        setIsSaving(true);
        try {
            const payload = {
                title: editTitle,
                description: editDesc,
                query: editQuery,
                variables: editVars
            };
            if (selectedReport) {
                await updateCustomReport(selectedReport.id, payload);
            } else {
                await createCustomReport(payload);
            }
            await loadCustomReports();
            setModalStep('list');
        } catch (err) {
            alert("Erro ao salvar relatório");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReport = async (id: number) => {
        if (!confirm("Tem certeza que deseja excluir este relatório?")) return;
        try {
            await deleteCustomReport(id);
            await loadCustomReports();
        } catch (err) {
            alert("Erro ao excluir relatório");
        }
    };

    const handleOpenRun = (report: CustomReport) => {
        setSelectedReport(report);
        setExecVariables({});
        setExecResults(null);
        setModalStep('run');
    };

    const handleExecuteReport = async () => {
        if (!selectedReport) return;
        setExecuting(true);
        try {
            const results = await executeCustomReport(selectedReport.query, execVariables);
            setExecResults(results);
        } catch (err: any) {
            alert("Erro na execução: " + (err.response?.data?.detail || err.message));
        } finally {
            setExecuting(false);
        }
    };

    const exportToExcel = (data: any[], filename: string) => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Resultados");
        XLSX.writeFile(wb, `${filename}.xlsx`);
    };

    const addVariable = () => {
        setEditVars([...editVars, { name: '', label: '', type: 'string' }]);
    };

    const removeVariable = (index: number) => {
        setEditVars(editVars.filter((_, i) => i !== index));
    };

    const updateVariable = (index: number, field: string, value: string) => {
        const newVars = [...editVars];
        // @ts-ignore
        newVars[index][field] = value;
        setEditVars(newVars);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-30" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 animate-pulse">Gerando Relatórios...</p>
            </div>
        );
    }

    const totalTickets = Object.values(summary?.by_priority || {}).reduce((a, b) => a + b, 0);
    const finalizedTickets = summary?.status_priority_matrix.filter(s => s.is_final).reduce((acc, curr) => acc + curr.count, 0) || 0;
    const activeTickets = totalTickets - finalizedTickets;
    const resolutionRate = totalTickets > 0 ? Math.round((finalizedTickets / totalTickets) * 100) : 0;
    const totalHours = summary?.by_user.reduce((acc, user) => acc + user.total_duration, 0) || 0;

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase leading-none">
                            Centro de <span className="text-accent-theme">Relatórios</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium">Extraia insights e dados consolidados do seu sistema.</p>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowCustomModal(true)}
                            className="flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-background border border-border-theme text-[var(--color-text-muted)] font-black text-[10px] uppercase tracking-widest hover:border-accent-theme hover:text-accent-theme transition-all shadow-sm active:scale-95"
                        >
                            <PieChart className="w-5 h-5" />
                            Relatórios Personalizados
                        </button>

                        <div className="relative export-container">
                            <button
                                onClick={() => setShowExportMenu(!showExportMenu)}
                                disabled={exporting}
                                className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-2xl shadow-accent-theme/20 active:scale-95 disabled:opacity-50"
                            >
                                {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                Exportar Tickets
                            </button>

                            <div className={clsx(
                                "absolute top-full right-0 mt-4 w-56 glass-card rounded-2xl border border-border-theme shadow-2xl transition-all duration-300 z-50 overflow-hidden",
                                showExportMenu ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
                            )}>
                                <div className="p-2 space-y-1">
                                    <button
                                        onClick={() => handleExport('csv')}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent-theme/10 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-accent-theme transition-colors transition-all"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Formato CSV
                                    </button>
                                    <button
                                        onClick={() => handleExport('excel')}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent-theme/10 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-accent-theme transition-colors transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                        Excel (XLSX)
                                    </button>
                                    <button
                                        onClick={() => handleExport('json')}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent-theme/10 text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)] hover:text-accent-theme transition-colors transition-all"
                                    >
                                        <FileText className="w-4 h-4" />
                                        JSON Data
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <FilterBar onFilter={loadData} isLoading={filtering} />

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
                        title="Prioridade Crítica"
                        value={summary?.by_priority['critical'] || 0}
                        subtitle="Tickets Pendentes"
                        icon={<AlertCircle className="w-5 h-5 text-red-600" />}
                    />
                    <StatCard
                        title="Total de Tickets"
                        value={totalTickets}
                        subtitle="Volume Total"
                        icon={<FileText className="w-5 h-5 text-accent-theme" />}
                    />

                    {/* Linha 2 de Stats */}
                    <StatCard
                        title="Tempo Médio"
                        value={summary?.avg_attendance_time ? formatDuration(summary.avg_attendance_time) : "00:00:00"}
                        subtitle="Por Ticket (Geral)"
                        icon={<Calendar className="w-5 h-5 text-green-500" />}
                    />
                    <StatCard
                        title="Chamados Ativos"
                        value={activeTickets}
                        subtitle="Tickets não finalizados"
                        icon={<Activity className="w-5 h-5 text-blue-400" />}
                    />
                    <StatCard
                        title="Taxa de Resolução"
                        value={`${resolutionRate}%`}
                        subtitle="Tickets Finalizados"
                        icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                    />
                    <StatCard
                        title="Tempo Total Investido"
                        value={formatDuration(totalHours)}
                        subtitle="Horas Totais da Equipe"
                        icon={<Clock className="w-5 h-5 text-purple-400" />}
                    />
                </div>

                {/* Desempenho da Equipe */}
                <ReportSection title="Desempenho da Equipe" icon={<Users className="w-4 h-4" />}>
                    <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {summary?.by_user.map((user) => (
                                <div key={user.id} className="glass-card p-6 rounded-2xl border border-border-theme/50 hover:border-accent-theme/30 transition-all group flex flex-col gap-4">
                                    <div className="flex items-center gap-4 border-b border-border-theme/30 pb-4">
                                        <div className="w-10 h-10 rounded-full bg-accent-theme/10 flex items-center justify-center text-accent-theme font-black text-sm">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-black uppercase tracking-tight">{user.name}</div>
                                            <div className="text-[10px] text-[var(--color-text-muted)] font-mono">ID: #{user.id}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-[10px]">Tickets Atribuídos</span>
                                            <span className="font-black bg-accent-theme/10 text-accent-theme px-2 py-0.5 rounded-md">{user.tickets_assigned}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-[10px]">Tickets Criados</span>
                                            <span className="font-bold">{user.tickets_created}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-[10px]">Tempo Total</span>
                                            <span className="font-mono">{formatDuration(user.total_duration)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs pt-2 border-t border-border-theme/30">
                                            <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-[10px]">Média / Ticket</span>
                                            <span className={clsx("font-mono font-bold", user.avg_ticket_time > 0 ? "text-green-500" : "text-[var(--color-text-muted)]")}>
                                                {formatDuration(user.avg_ticket_time)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {summary?.by_user.length === 0 && (
                                <div className="col-span-full py-12 text-center text-[var(--color-text-muted)] text-[10px] uppercase tracking-widest italic opacity-50">
                                    Nenhum dado de usuário disponível.
                                </div>
                            )}
                        </div>
                    </div>
                </ReportSection>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* Tickets por Cliente */}
                    <ReportSection title="Top 5 Clientes (Maior Volume)" icon={<Users className="w-4 h-4" />}>
                        <div className="flex flex-col justify-start gap-4 h-full min-h-[400px]">
                            {summary?.by_client.map((client, i) => (
                                <div key={client.name} className="flex items-center gap-4 p-4 rounded-2xl bg-background/50 border border-border-theme/50 hover:border-accent-theme/30 transition-all group shadow-sm">
                                    <div className="w-8 text-[10px] font-black text-[var(--color-text-muted)] font-mono opacity-50">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-xs font-black mb-2 uppercase tracking-tight">
                                            <span>{client.name}</span>
                                            <span className="text-accent-theme">{client.count}</span>
                                        </div>
                                        <div className="h-2 bg-background rounded-full overflow-hidden border border-border-theme p-[1px]">
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
                    <ReportSection title="Top 5 Categorias (Mais Chamados)" icon={<Tag className="w-4 h-4" />}>
                        <div className="flex flex-col justify-start gap-4 h-full min-h-[400px]">
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
                                {systemStatuses.filter(s => !s.is_final).map(statusObj => (
                                    <tr key={statusObj.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-6 px-4 font-black uppercase text-[10px] text-[var(--color-text-muted)] group-hover:text-foreground transition-colors tracking-widest">
                                            {statusObj.name}
                                        </td>
                                        {Object.keys(PRIORITY_MAP).map(priorityKey => {
                                            const cell = summary?.status_priority_matrix.find(m =>
                                                (m.status === statusObj.name) &&
                                                (m.priority === PRIORITY_MAP[priorityKey] || m.priority === priorityKey)
                                            );
                                            return (
                                                <td key={priorityKey} className="py-6 px-4">
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={clsx(
                                                            "text-xs font-mono p-2 rounded-lg min-w-[32px] text-center transition-colors",
                                                            cell?.count ? "font-black text-accent-theme bg-accent-theme/5" : "text-[var(--color-text-muted)] opacity-30",
                                                            cell?.is_final && "opacity-50 grayscale"
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
                                {systemStatuses.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-[var(--color-text-muted)] text-[10px] font-black uppercase tracking-widest italic opacity-50">
                                            Nenhum status configurado no sistema.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </ReportSection>

            </div>

            {/* Modal de Relatórios Personalizados */}
            <AnimatePresence>
                {showCustomModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setShowCustomModal(false);
                                setModalStep('list');
                            }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-md"
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className={clsx(
                                "glass-card rounded-3xl border border-border-theme shadow-2xl overflow-hidden relative transition-all duration-500",
                                (modalStep === 'editor' || modalStep === 'run') ? "w-full max-w-5xl" : "w-full max-w-md"
                            )}
                        >
                            <div className="p-8 space-y-8">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <AnimatePresence mode="wait">
                                            {modalStep !== 'list' && (
                                                <motion.button
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -10 }}
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={() => setModalStep('list')}
                                                    className="p-2 hover:bg-accent-theme/10 rounded-xl transition-colors text-accent-theme"
                                                >
                                                    <ArrowLeft className="w-5 h-5" />
                                                </motion.button>
                                            )}
                                        </AnimatePresence>
                                        <div className="space-y-1">
                                            <motion.h2
                                                layout
                                                className="text-2xl font-black uppercase italic tracking-tight"
                                            >
                                                {modalStep === 'list' && 'Relatórios'}
                                                {modalStep === 'config' && 'Configurar'}
                                                {modalStep === 'editor' && (selectedReport ? 'Editar Script' : 'Novo Script')}
                                                {modalStep === 'run' && 'Executar'}
                                            </motion.h2>
                                            <motion.p
                                                layout
                                                className="text-[10px] font-bold text-accent-theme tracking-[0.2em] uppercase opacity-70"
                                            >
                                                {modalStep === 'list' && 'Selecione ou crie um modelo'}
                                                {modalStep === 'config' && 'Defina os parâmetros'}
                                                {modalStep === 'editor' && 'Escreva sua consulta SQL'}
                                                {modalStep === 'run' && 'Preencha as variáveis'}
                                            </motion.p>
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ rotate: 90, scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => {
                                            setShowCustomModal(false);
                                            setModalStep('list');
                                        }}
                                        className="p-2 hover:bg-accent-theme/10 rounded-xl transition-colors text-[var(--color-text-muted)]"
                                    >
                                        <X className="w-5 h-5" />
                                    </motion.button>
                                </div>

                                <div className="relative">
                                    <AnimatePresence mode="wait">
                                        {modalStep === 'list' && (
                                            <motion.div
                                                key="list"
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -20 }}
                                                className="space-y-4"
                                            >
                                                <div className="space-y-3">
                                                    {/* Relatório Nativo */}
                                                    <motion.button
                                                        whileHover={{ scale: 1.02, x: 5 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        onClick={() => setModalStep('config')}
                                                        className="w-full p-5 rounded-2xl bg-accent-theme/5 border border-border-theme hover:border-accent-theme/40 flex items-center justify-between group transition-all"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 bg-accent-theme rounded-xl text-white shadow-lg shadow-accent-theme/30 group-hover:rotate-12 transition-transform">
                                                                <Users className="w-5 h-5" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-xs font-black uppercase">Clientes sem Atendimento</p>
                                                                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-tight">Lista de inativos no período</p>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="w-5 h-5 text-accent-theme opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
                                                    </motion.button>

                                                    {/* Relatórios Dinâmicos */}
                                                    {customReports.map(report => (
                                                        <div key={report.id} className="relative group">
                                                            <motion.button
                                                                whileHover={{ scale: 1.02, x: 5 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                onClick={() => handleOpenRun(report)}
                                                                className="w-full p-5 rounded-2xl bg-white/5 border border-border-theme hover:border-accent-theme/40 flex items-center justify-between transition-all"
                                                            >
                                                                <div className="flex items-center gap-4">
                                                                    <div className="p-3 bg-white/10 rounded-xl text-foreground group-hover:text-accent-theme transition-colors">
                                                                        <Database className="w-5 h-5" />
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-xs font-black uppercase">{report.title}</p>
                                                                        <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-tight truncate max-w-[200px]">{report.description || 'Consulta SQL customizada'}</p>
                                                                    </div>
                                                                </div>
                                                                <Play className="w-4 h-4 text-accent-theme opacity-0 group-hover:opacity-100 transition-all" />
                                                            </motion.button>
                                                            <div className="absolute right-12 top-1/2 -translate-y-1/2 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                                <button onClick={() => handleEditReport(report)} className="p-2 hover:bg-white/10 rounded-lg text-blue-400"><Edit3 className="w-4 h-4" /></button>
                                                                <button onClick={() => handleDeleteReport(report.id)} className="p-2 hover:bg-white/10 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={handleCreateNew}
                                                    className="w-full p-4 rounded-xl border border-dashed border-accent-theme/40 text-accent-theme hover:bg-accent-theme/5 flex items-center justify-center gap-3 transition-all"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    <span className="text-[10px] font-black uppercase">Criar novo Script</span>
                                                </motion.button>
                                            </motion.div>
                                        )}
                                        {modalStep === 'config' && (
                                            <motion.div
                                                key="config"
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="space-y-6"
                                            >
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Data Início</label>
                                                        <div className="relative">
                                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-theme opacity-50" />
                                                            <input
                                                                type="date"
                                                                value={startDate}
                                                                onChange={(e) => setStartDate(e.target.value)}
                                                                className="w-full pl-11 pr-4 py-3.5 bg-background/50 border border-border-theme rounded-xl text-xs font-bold focus:border-accent-theme outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Data Fim</label>
                                                        <div className="relative">
                                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-theme opacity-50" />
                                                            <input
                                                                type="date"
                                                                value={endDate}
                                                                onChange={(e) => setEndDate(e.target.value)}
                                                                className="w-full pl-11 pr-4 py-3.5 bg-background/50 border border-border-theme rounded-xl text-xs font-bold focus:border-accent-theme outline-none transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Formato do Arquivo</label>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <motion.button
                                                            whileHover={{ y: -2 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => setReportFormat('excel')}
                                                            className={clsx(
                                                                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                                                                reportFormat === 'excel' ? "bg-green-500/10 border-green-500/50 text-green-500" : "bg-transparent border-border-theme hover:border-accent-theme/30 text-[var(--color-text-muted)]"
                                                            )}
                                                        >
                                                            <FileSpreadsheet className="w-4 h-4" />
                                                            <span className="text-[10px] font-black uppercase">Excel</span>
                                                        </motion.button>
                                                        <motion.button
                                                            whileHover={{ y: -2 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => setReportFormat('pdf')}
                                                            className={clsx(
                                                                "flex items-center justify-center gap-3 p-4 rounded-xl border transition-all",
                                                                reportFormat === 'pdf' ? "bg-red-500/10 border-red-500/50 text-red-500" : "bg-transparent border-border-theme hover:border-accent-theme/30 text-[var(--color-text-muted)]"
                                                            )}
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                            <span className="text-[10px] font-black uppercase">PDF</span>
                                                        </motion.button>
                                                    </div>
                                                </div>

                                                <motion.button
                                                    layoutId="generate-btn"
                                                    whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={handleGenerateCustomReport}
                                                    disabled={exporting || !startDate || !endDate}
                                                    className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-accent-theme text-white font-black text-xs uppercase tracking-[0.1em] hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-accent-theme/30 disabled:opacity-50"
                                                >
                                                    {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                                    Gerar Relatório agora
                                                </motion.button>
                                            </motion.div>
                                        )}

                                        {modalStep === 'editor' && (
                                            <motion.div
                                                key="editor"
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                                            >
                                                <div className="lg:col-span-2 space-y-6">
                                                    <div className="space-y-4">
                                                        <input
                                                            type="text"
                                                            placeholder="Título do Relatório"
                                                            value={editTitle}
                                                            onChange={e => setEditTitle(e.target.value)}
                                                            className="w-full px-6 py-4 bg-background/50 border border-border-theme rounded-2xl text-lg font-black uppercase tracking-tight focus:border-accent-theme outline-none"
                                                        />
                                                        <textarea
                                                            placeholder="Descrição opcional..."
                                                            value={editDesc}
                                                            onChange={e => setEditDesc(e.target.value)}
                                                            className="w-full px-6 py-4 bg-background/50 border border-border-theme rounded-2xl text-xs font-bold focus:border-accent-theme outline-none h-20 resize-none"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center ml-1">
                                                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Script SQL</label>
                                                            <span className="text-[8px] font-bold text-accent-theme/50 italic capitalize">Use :nome_variavel para criar parâmetros dinâmicos</span>
                                                        </div>
                                                        <textarea
                                                            value={editQuery}
                                                            onChange={e => setEditQuery(e.target.value)}
                                                            className="w-full p-6 bg-[#0d0d0d] border border-border-theme rounded-2xl text-xs font-mono text-green-400 focus:border-accent-theme outline-none h-64 resize-none leading-relaxed shadow-inner"
                                                            spellCheck={false}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-6 border-l border-border-theme pl-8">
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center">
                                                            <h3 className="text-xs font-black uppercase tracking-widest italic">Variáveis</h3>
                                                            <button onClick={addVariable} className="p-2 hover:bg-accent-theme/10 rounded-xl text-accent-theme transition-all"><Plus className="w-4 h-4" /></button>
                                                        </div>
                                                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                                            {editVars.map((v, i) => (
                                                                <div key={i} className="p-4 rounded-xl bg-white/5 border border-border-theme space-y-3 relative group transition-all hover:bg-white/10">
                                                                    <button
                                                                        onClick={() => removeVariable(i)}
                                                                        className="absolute -top-1.5 -right-1.5 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg shadow-red-500/30 z-20 hover:scale-110 active:scale-95"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center gap-2 px-3 py-2 bg-background/50 rounded-lg border border-border-theme">
                                                                            <Type className="w-3 h-3 text-[var(--color-text-muted)]" />
                                                                            <input
                                                                                placeholder="Chave (ex: setor_id)"
                                                                                value={v.name}
                                                                                onChange={e => updateVariable(i, 'name', e.target.value)}
                                                                                className="bg-transparent text-[10px] font-bold outline-none flex-1"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2 px-3 py-2 bg-background/50 rounded-lg border border-border-theme">
                                                                            <Tag className="w-3 h-3 text-[var(--color-text-muted)]" />
                                                                            <input
                                                                                placeholder="Rótulo (ex: Setor)"
                                                                                value={v.label}
                                                                                onChange={e => updateVariable(i, 'label', e.target.value)}
                                                                                className="bg-transparent text-[10px] font-bold outline-none flex-1"
                                                                            />
                                                                        </div>
                                                                        <div className="relative">
                                                                            <select
                                                                                value={v.type}
                                                                                onChange={e => updateVariable(i, 'type', e.target.value)}
                                                                                className="w-full pl-3 pr-10 py-2.5 bg-background/50 rounded-lg border border-border-theme text-[9px] font-black uppercase outline-none focus:border-accent-theme appearance-none transition-all cursor-pointer hover:bg-background/80"
                                                                            >
                                                                                <option value="string">Texto</option>
                                                                                <option value="number">Número</option>
                                                                                <option value="date">Data</option>
                                                                            </select>
                                                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-accent-theme pointer-events-none opacity-60" />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {editVars.length === 0 && (
                                                                <div className="py-8 text-center border border-dashed border-border-theme rounded-xl opacity-30">
                                                                    <p className="text-[10px] font-black uppercase tracking-tighter">Nenhuma variável</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={handleSaveReport}
                                                        disabled={isSaving || !editTitle || !editQuery}
                                                        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-accent-theme text-white font-black text-xs uppercase tracking-[0.1em] shadow-xl shadow-accent-theme/30 disabled:opacity-50 transition-all"
                                                    >
                                                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                                        Salvar Script
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}

                                        {modalStep === 'run' && selectedReport && (
                                            <motion.div
                                                key="run"
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="space-y-8"
                                            >
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {selectedReport.variables.map((v, i) => (
                                                        <div key={i} className="space-y-2">
                                                            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">{v.label}</label>
                                                            <input
                                                                type={v.type === 'date' ? 'date' : v.type === 'number' ? 'number' : 'text'}
                                                                value={execVariables[v.name] || ''}
                                                                onChange={e => setExecVariables({ ...execVariables, [v.name]: e.target.value })}
                                                                className="w-full px-5 py-4 bg-background/50 border border-border-theme rounded-xl text-xs font-bold focus:border-accent-theme outline-none transition-all"
                                                            />
                                                        </div>
                                                    ))}
                                                    {selectedReport.variables.length === 0 && (
                                                        <div className="lg:col-span-3 py-4 text-center bg-accent-theme/5 border border-dashed border-accent-theme/20 rounded-2xl">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-accent-theme">Este relatório não possui variáveis.</p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex gap-4">
                                                    <button
                                                        onClick={handleExecuteReport}
                                                        disabled={executing}
                                                        className="flex-1 flex items-center justify-center gap-3 py-5 rounded-2xl premium-gradient text-white font-black text-xs uppercase tracking-[0.1em] shadow-xl shadow-accent-theme/30 disabled:opacity-50 transition-all"
                                                    >
                                                        {executing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                                                        Executar Query
                                                    </button>

                                                    {execResults && (
                                                        <button
                                                            onClick={() => exportToExcel(execResults, selectedReport.title)}
                                                            className="px-8 py-5 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 font-black text-[10px] uppercase tracking-widest transition-all"
                                                        >
                                                            <Download className="w-5 h-5" />
                                                        </button>
                                                    )}
                                                </div>

                                                {execResults && (
                                                    <div className="space-y-4">
                                                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                                            <span>Resultados ({execResults.length})</span>
                                                        </div>
                                                        <div className="glass-card rounded-2xl border border-border-theme overflow-hidden">
                                                            <div className="max-h-[300px] overflow-auto custom-scrollbar">
                                                                <table className="w-full text-left border-collapse">
                                                                    <thead className="sticky top-0 bg-background z-10">
                                                                        <tr>
                                                                            {execResults.length > 0 && Object.keys(execResults[0]).map(key => (
                                                                                <th key={key} className="p-4 border-b border-border-theme text-[9px] font-black uppercase tracking-tighter bg-white/5">{key}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-border-theme/50">
                                                                        {execResults.map((row, i) => (
                                                                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                                                                {Object.values(row).map((val: any, j) => (
                                                                                    <td key={j} className="p-4 text-[10px] font-medium text-[var(--color-text-muted)] whitespace-nowrap">{String(val)}</td>
                                                                                ))}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </main>
    );
}
