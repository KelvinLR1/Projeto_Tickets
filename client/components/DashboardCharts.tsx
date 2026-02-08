'use client';

import React, { useEffect, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import { getDashboardStats, DashboardStats } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

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
        <div className="flex items-center justify-center h-64 bg-card rounded-lg border border-border-theme">
            <Loader2 className="animate-spin w-8 h-8 text-accent-theme" />
        </div>
    );

    if (!stats) return <div className="text-gray-400">Nenhum dado disponível.</div>;

    // Formatação de dados para Recharts
    const statusData = Object.entries(stats.summary.by_status || {}).map(([name, value]) => ({ name, value }));
    const priorityData = Object.entries(stats.summary.by_priority || {}).map(([name, value]) => ({ name, value }));
    const dateData = Object.entries(stats.summary.by_date || {})
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Gráfico de Status */}
            <div className="glass-card p-6 rounded-3xl transition-all border-border-theme">
                <h3 className="text-lg font-bold mb-6 text-foreground opacity-90 font-display">Tickets por Status</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={statusData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-theme)" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border-theme)',
                                    color: 'var(--color-foreground)',
                                    borderRadius: '16px',
                                    backdropFilter: 'blur(10px)',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                }}
                                itemStyle={{ color: 'var(--color-foreground)' }}
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            />
                            <Bar dataKey="value" fill="var(--color-primary-theme)" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Gráfico de Prioridade */}
            <div className="glass-card p-6 rounded-3xl transition-all border-border-theme">
                <h3 className="text-lg font-bold mb-6 text-foreground opacity-90 font-display">Tickets por Prioridade</h3>
                <div className="h-64">
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
                                    <Cell key={`cell-${index}`} fill={`var(--color-${['primary', 'accent', 'text-muted', 'primary-theme'][index % 4]})`} />
                                ))}
                                <Cell fill="var(--color-primary-theme)" />
                                <Cell fill="var(--color-accent-theme)" />
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border-theme)',
                                    borderRadius: '16px',
                                    backdropFilter: 'blur(10px)'
                                }}
                            />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Evolução Temporal */}
            <div className="glass-card p-8 rounded-3xl md:col-span-2 transition-all border-border-theme">
                <h3 className="text-lg font-bold mb-6 text-foreground opacity-90 font-display">Volume de Chamados por Dia</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dateData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-theme)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: 'var(--color-border-theme)',
                                    borderRadius: '16px',
                                    backdropFilter: 'blur(10px)'
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="var(--color-accent-theme)"
                                strokeWidth={4}
                                dot={{ r: 6, fill: 'var(--color-accent-theme)', strokeWidth: 2, stroke: 'var(--color-background)' }}
                                activeDot={{ r: 8, strokeWidth: 0 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
