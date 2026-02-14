'use client';

import React, { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { getDashboardStats, DashboardStats } from '@/lib/api';
import { Loader2 } from 'lucide-react';

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

export default function DashboardCharts() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const data = await getDashboardStats();
                setStats(data);
            } catch (error) {
                console.error("Erro ao buscar estatísticas:", error);
            } finally {
                setLoading(false);
            }
        }
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

    const isStatusEmpty = statusData.length === 0 || statusData.every(d => d.value === 0);
    const isPriorityEmpty = priorityData.length === 0 || priorityData.every(d => d.value === 0);
    const isDateEmpty = dateData.length === 0 || dateData.every(d => d.count === 0);

    return (
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

            {/* Evolução Temporal - Now as Premium AreaChart */}
            <div className="glass-card p-10 rounded-[2.5rem] md:col-span-2 transition-all border-border-theme relative overflow-hidden group">
                <h3 className="text-lg font-bold mb-10 text-foreground opacity-90 font-display flex items-center gap-3 relative z-10 uppercase tracking-tight">
                    <div className="w-1.5 h-6 bg-accent-theme rounded-full" />
                    Volume de Chamados por Dia
                </h3>

                <div className="h-72 relative z-10">
                    {isDateEmpty ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <EmptyState message="Aguardando os primeiros chamados para gerar o histórico de volume diário." />
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dateData}>
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
    );
}
