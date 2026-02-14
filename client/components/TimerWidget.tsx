'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Clock, ChevronRight } from 'lucide-react';
import { useTimer } from './TimerProvider';
import clsx from 'clsx';

const TimerWidget: React.FC = () => {
    const { activeTimers, trackedTickets, handleStartTimer, handleStopTimer, removeFromWidget } = useTimer();
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + 'h ' : ''}${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    };

    const getTicketDisplayTime = (ticket: any) => {
        const activeTimer = activeTimers.find(t => t.ticket_id === ticket.id);
        const baseDuration = ticket.total_duration || 0;

        if (activeTimer) {
            const dateStr = activeTimer.start_time.endsWith('Z') ? activeTimer.start_time : activeTimer.start_time + 'Z';
            const start = new Date(dateStr).getTime();
            const elapsedSinceStart = Math.max(0, Math.floor((currentTime.getTime() - start) / 1000));
            return baseDuration + elapsedSinceStart;
        }

        return baseDuration;
    };

    return (
        <div className="h-full bg-background text-foreground p-4 font-sans select-none overflow-hidden flex flex-col transition-colors duration-500">
            <div className="flex items-center justify-between mb-6 border-b border-border-theme pb-4">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-theme animate-pulse" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme">Atendimentos em Fila</h2>
                </div>
                <Clock className="w-4 h-4 opacity-20" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {trackedTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 opacity-30 text-center">
                        <Clock className="w-12 h-12 mb-2 stroke-[1px]" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Nenhum ticket rastreado</p>
                    </div>
                ) : (
                    trackedTickets.map((ticket) => {
                        const isActive = activeTimers.some(t => t.ticket_id === ticket.id);
                        const totalSeconds = getTicketDisplayTime(ticket);

                        return (
                            <div key={ticket.id} className="glass-card p-4 rounded-2xl border border-border-theme bg-card/40 hover:bg-card/60 transition-all group relative">
                                {/* Botão de remover do widget */}
                                <button
                                    onClick={() => removeFromWidget(ticket.id)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-card border border-border-theme rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all z-10"
                                    title="Remover do widget"
                                >
                                    ✕
                                </button>

                                <div className="flex items-start justify-between gap-3 mb-4">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[8px] font-black text-accent-theme/60 uppercase tracking-tighter mb-1">
                                            Ticket #{ticket.id}
                                        </p>
                                        <h3 className="text-xs font-bold truncate leading-tight mb-1 text-foreground">
                                            {ticket.title}
                                        </h3>
                                        <p className="text-[9px] font-bold text-[var(--color-text-muted)] truncate opacity-60">
                                            {ticket.clientName}
                                        </p>
                                    </div>
                                    <div className={clsx(
                                        "text-[10px] font-mono font-bold px-2 py-1 rounded-lg shrink-0 transition-all",
                                        isActive
                                            ? "text-accent-theme bg-accent-theme/10 shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]"
                                            : "text-[var(--color-text-muted)] bg-background/50"
                                    )}>
                                        {formatTime(totalSeconds)}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isActive ? (
                                        <button
                                            onClick={() => handleStopTimer(ticket.id)}
                                            className="flex-1 py-2.5 bg-accent-theme/10 hover:bg-accent-theme/20 text-accent-theme rounded-xl transition-all flex items-center justify-center gap-2 border border-accent-theme/20"
                                        >
                                            <Pause className="w-3 h-3 fill-current" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Pausar</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleStartTimer(ticket.id)}
                                            className="flex-1 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-500 rounded-xl transition-all flex items-center justify-center gap-2 border border-green-500/20"
                                        >
                                            <Play className="w-3 h-3 fill-current" />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Retomar</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => handleStopTimer(ticket.id, true)}
                                        className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all flex items-center justify-center gap-2 border border-red-500/20 group/end"
                                        title="Finalizar atendimento e remover"
                                    >
                                        <Square className="w-3 h-3 fill-current group-hover/end:scale-110" />
                                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Finalizar</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-border-theme flex items-center justify-between opacity-30">
                <p className="text-[8px] font-bold uppercase tracking-widest italic">TicketFlow OS</p>
                <div className="flex items-center gap-2 text-[8px] font-black">
                    {activeTimers.length > 0 && <span className="animate-pulse text-accent-theme uppercase">Live Session</span>}
                    <ChevronRight className="w-2 h-2" />
                </div>
            </div>

            <style jsx global>{`
                :root {
                    --accent-rgb: 59, 130, 246; /* fallback */
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: var(--border-theme);
                    border-radius: 10px;
                }
                .glass-card {
                    backdrop-filter: blur(12px);
                }
            `}</style>
        </div>
    );
};

export default TimerWidget;
