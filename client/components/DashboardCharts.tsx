'use client';

import React, { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import FilterBar from './FilterBar';
import { getDashboardStats, DashboardStats, ReportFilters } from '@/lib/api';
import { Loader2, Clock, Users, Tag } from 'lucide-react';

// Mapeamento de Cores e Nomenclatura para Prioridades
const PRIORITY_MAP: Record<string, { label: string, color: string }> = {
    'low': { label: 'Baixa', color: '#10b981' },      // Esmeralda
    'Baixa': { label: 'Baixa', color: '#10b981' },
    'medium': { label: 'Média', color: '#3b82f6' },   // Azul (Primário)
    'Média': { label: 'Média', color: '#3b82f6' },
    'high': { label: 'Alta', color: '#f59e0b' },      // Âmbar
    'Alta': { label: 'Alta', color: '#f59e0b' },
    'critical': { label: 'Crítica', color: '#ef4444' }, // Vermelho
    'Crítica': { label: 'Crítica', color: '#ef4444' }
};

const DEFAULT_COLOR = 'var(--color-primary-theme)';

const STATUS_MAP: Record<string, string> = {
    'open': 'Aberto',
    'in_progress': 'Em Andamento',
    'closed': 'Fechado',
    'Open': 'Aberto',
    'In Progress': 'Em Andamento',
    'Closed': 'Fechado'
};

const formatDate = (dateStr: string) => {
    try {
        const [year, month, day] = dateStr.split('-');
        if (!year || !month || !day) return dateStr;
        return `${day}/${month}/${year}`;
    } catch {
        return dateStr;
    }
};

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 animate-in fade-in duration-700">
            <div className="p-4 bg-accent-theme/5 rounded-full mb-2">
                <Loader2 className="w-8 h-8 text-accent-theme/20" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] opacity-60 text-center px-10 leading-relaxed">
                {message}
            </p>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, colorClass }: { title: string, value: string | number, icon: any, colorClass: string }) {
    return (
        <div className="glass-card p-6 rounded-[2rem] border-border-theme flex items-center gap-5 group hover:scale-[1.02] transition-all">
            <div className={`p-4 rounded-2xl ${colorClass} group-hover:scale-110 transition-transform`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1">{title}</p>
                <p className="text-2xl font-black italic">{value}</p>
            </div>
        </div>
    );
}

export default function DashboardCharts() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filtering, setFiltering] = useState(false);

    const fetchStats = async (filters: ReportFilters = {}) => {
        setFiltering(true);
        try {
            const data = await getDashboardStats(filters);
            setStats(data);
        } catch (error) {
            console.error("Erro ao buscar estatísticas:", error);
        } finally {
            setLoading(false);
            setFiltering(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center h-64 bg-card rounded-[2.5rem] border border-border-theme p-8">
            <Loader2 className="animate-spin w-8 h-8 text-accent-theme" />
        </div>
    );

    if (!stats) return (
        <div className="glass-card p-12 rounded-[2.5rem] border-border-theme text-center">
            <p className="text-[var(--color-text-muted)] uppercase font-black text-xs tracking-widest">
                Falha ao carregar indicadores. Verifique a conexão com o servidor.
            </p>
        </div>
    );

    // Formatação de dados para Recharts
    const statusData = Object.entries(stats.summary.by_status || {}).map(([name, value]) => ({
        name: STATUS_MAP[name] || name,
        value
    }));
    const priorityData = Object.entries(stats.summary.by_priority || {}).map(([name, value]) => {
        const mapping = PRIORITY_MAP[name] || { label: name, color: DEFAULT_COLOR };
        return {
            name: mapping.label,
            value,
            fill: mapping.color
        };
    });
    const dateData = Object.entries(stats.summary.by_date || {})
        .map(([date, count]) => ({
            originalDate: date,
            date: formatDate(date),
            count
        }))
        .sort((a, b) => a.originalDate.localeCompare(b.originalDate));

    // Métricas formatadas
    const avgSeconds = stats.summary.avg_attendance_time || 0;
    const avgTimeFormatted = avgSeconds > 0
        ? `${Math.floor(avgSeconds / 3600)}h ${Math.floor((avgSeconds % 3600) / 60)}m`
        : "0m";

    const topClients = stats.summary.by_client || [];
    const topCategories = stats.summary.by_category || [];

    const isStatusEmpty = statusData.length === 0 || statusData.every(d => d.value === 0);
    const isPriorityEmpty = priorityData.length === 0 || priorityData.every(d => d.value === 0);
    const isDateEmpty = dateData.length === 0 || dateData.every(d => d.count === 0);

    return (
        <div className="space-y-8">
            <FilterBar onFilter={fetchStats} isLoading={filtering} />

            {/* Quick Indicators */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    title="Tempo Médio de Atendimento"
                    value={avgTimeFormatted}
                    icon={Clock}
                    colorClass="bg-accent-theme/10 text-accent-theme"
                />
                <StatCard
                    title="Total de Clientes no Período"
                    value={topClients.length}
                    icon={Users}
                    colorClass="bg-blue-500/10 text-blue-500"
                />
                <StatCard
                    title="Categorias Ativas"
                    value={topCategories.length}
                    icon={Tag}
                    colorClass="bg-emerald-500/10 text-emerald-500"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Gráfico de Status */}
                <div className="glass-card p-8 rounded-[2.5rem] transition-all border-border-theme">
                    <h3 className="text-lg font-bold mb-8 text-foreground opacity-90 font-display uppercase tracking-tight">Tickets por Status</h3>
                    <div className="h-64">
                        {isStatusEmpty ? (
                            <EmptyState message="Ainda não há chamados para exibir indicadores por status." />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statusData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-theme)" vertical={false} />
                                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'var(--color-card)',
                                            borderColor: 'var(--color-border-theme)',
                                            color: 'var(--color-foreground)',
                                            borderRadius: '16px',
                                            backdropFilter: 'blur(12px)',
                                            border: '1px solid var(--color-border-theme)',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                                            padding: '12px'
                                        }}
                                        itemStyle={{
                                            color: 'var(--color-foreground)',
                                            fontWeight: 'bold',
                                            fontSize: '12px',
                                            textTransform: 'capitalize'
                                        }}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        formatter={(value: any) => [`${value} Chamados`, 'Quantidade']}
                                    />
                                    <Bar dataKey="value" fill="var(--color-primary-theme)" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Gráfico de Prioridade */}
                <div className="glass-card p-8 rounded-[2.5rem] transition-all border-border-theme">
                    <h3 className="text-lg font-bold mb-8 text-foreground opacity-90 font-display uppercase tracking-tight">Tickets por Prioridade</h3>
                    <div className="h-64">
                        {isPriorityEmpty ? (
                            <EmptyState message="Defina prioridades nos seus tickets para visualizar este gráfico." />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={priorityData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        outerRadius={80}
                                        innerRadius={60}
                                        fill="#8884d8"
                                        dataKey="value"
                                        paddingAngle={5}
                                        label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                                    >
                                        {priorityData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'var(--color-card)',
                                            borderColor: 'var(--color-border-theme)',
                                            color: 'var(--color-foreground)',
                                            borderRadius: '16px',
                                            backdropFilter: 'blur(12px)',
                                            border: '1px solid var(--color-border-theme)',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                                            padding: '12px'
                                        }}
                                        itemStyle={{
                                            color: 'var(--color-foreground)',
                                            fontWeight: 'bold',
                                            fontSize: '12px',
                                            textTransform: 'capitalize'
                                        }}
                                        formatter={(value: any) => [`${value} Chamados`, 'Quantidade']}
                                    />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Evolução Temporal */}
                <div className="glass-card p-10 rounded-[2.5rem] md:col-span-2 transition-all border-border-theme relative overflow-hidden group">
                    <h3 className="text-lg font-bold mb-10 text-foreground opacity-90 font-display flex items-center gap-3 relative z-10 uppercase tracking-tight">
                        <div className="w-1.5 h-6 bg-accent-theme rounded-full" />
                        Volume de Chamados por Dia
                    </h3>

                    <div className="h-72 relative z-10">
                        {isDateEmpty ? (
                            <EmptyState message="Aguardando os primeiros chamados para gerar o histórico de volume diário." />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dateData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-accent-theme)" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="var(--color-accent-theme)" stopOpacity={0} />
                                        </linearGradient>
                                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                            <feGaussianBlur stdDeviation="3" result="blur" />
                                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                        </filter>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-theme)" vertical={false} opacity={0.5} />
                                    <XAxis
                                        dataKey="date"
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        dy={15}
                                        fontStyle="italic"
                                    />
                                    <YAxis
                                        stroke="var(--color-text-muted)"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        dx={-10}
                                        allowDecimals={false}
                                        domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(23, 23, 23, 0.8)',
                                            borderColor: 'var(--color-accent-theme)',
                                            color: 'white',
                                            borderRadius: '20px',
                                            backdropFilter: 'blur(16px)',
                                            border: '1px solid rgba(var(--color-accent-theme-rgb), 0.2)',
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                            padding: '16px'
                                        }}
                                        itemStyle={{
                                            color: 'white',
                                            fontWeight: '900',
                                            fontSize: '14px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}
                                        cursor={{ stroke: 'var(--color-accent-theme)', strokeWidth: 1, strokeDasharray: '5 5' }}
                                        formatter={(value: any) => [value, 'Tickets']}
                                        labelStyle={{ color: 'var(--color-accent-theme)', fontWeight: '900', marginBottom: '8px', fontSize: '10px' }}
                                        labelFormatter={(label) => `Data: ${label}`}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="var(--color-accent-theme)"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorCount)"
                                        filter="url(#glow)"
                                        animationDuration={2000}
                                        dot={{
                                            r: 5,
                                            fill: 'var(--color-background)',
                                            strokeWidth: 3,
                                            stroke: 'var(--color-accent-theme)',
                                            className: "drop-shadow-[0_0_8px_var(--color-accent-theme)]"
                                        }}
                                        activeDot={{
                                            r: 7,
                                            strokeWidth: 0,
                                            fill: 'white',
                                            className: "drop-shadow-[0_0_12px_var(--color-accent-theme)]"
                                        }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
