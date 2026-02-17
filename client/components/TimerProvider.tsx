'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TimeLog, Ticket, startTimer, stopTimer, getActiveTimers, getTicket, getTickets } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { useNotification } from './NotificationProvider';
import TimerWidget from './TimerWidget';
import InternalPiP from './InternalPiP';
import { AnimatePresence } from 'framer-motion';

interface TrackedTicket {
    id: number;
    title: string;
    clientName: string;
    total_duration: number;
    session_duration: number;
    status: string;
    assigned_user_id?: number | null;
}

interface TimerContextType {
    activeTimers: TimeLog[];
    trackedTickets: TrackedTicket[];
    handleStartTimer: (ticketId: number) => Promise<void>;
    handleStopTimer: (ticketId: number, remove?: boolean) => Promise<void>;
    removeFromWidget: (ticketId: number) => void;
    isPiPOpen: boolean;
    isInternalPiPOpen: boolean;
    openPiP: () => Promise<void>;
    closePiP: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const { showNotification } = useNotification();
    const [activeTimers, setActiveTimers] = useState<TimeLog[]>([]);
    const [trackedTickets, setTrackedTickets] = useState<TrackedTicket[]>([]);
    const [isPiPOpen, setIsPiPOpen] = useState(false);
    const [isInternalPiPOpen, setIsInternalPiPOpen] = useState(false);
    const [pipWindow, setPipWindow] = useState<any>(null);

    const fetchActiveTimers = useCallback(async () => {
        if (!user || loading) return;

        // Verifica se o token está presente antes de fazer a requisição
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('auth_token');
            if (!token || token === 'undefined' || token === 'null') {
                return;
            }
        }

        try {
            // Busca apenas timers ativos do usuário
            const timers = await getActiveTimers();

            setActiveTimers(timers);

            // Sincroniza trackedTickets com timers ativos e tickets atribuídos
            setTrackedTickets(prev => {
                const newTracked = [...prev];

                // Função auxiliar para adicionar ticket se não existir
                const addIfMissing = (ticket: any) => {
                    if (ticket && !newTracked.find(t => t.id === ticket.id)) {
                        newTracked.push({
                            id: ticket.id,
                            title: ticket.title,
                            clientName: ticket.client?.name || 'Cliente externo',
                            total_duration: ticket.total_duration || 0,
                            session_duration: 0,
                            status: ticket.status,
                            assigned_user_id: ticket.assigned_user_id
                        });
                    }
                };

                // 1. Adiciona tickets com timers ativos
                timers.forEach(timer => {
                    if (timer.ticket) {
                        addIfMissing({
                            ...timer.ticket,
                            id: timer.ticket_id // Garante ID correto
                        });
                    }
                });

                return newTracked;
            });
        } catch (error: any) {
            // Silencia 401 pois o AuthProvider lida com redirecionamento
            if (error.response?.status !== 401) {
                console.error('Erro ao buscar dados do widget:', error);
            }
        }
    }, [user, loading]);

    useEffect(() => {
        fetchActiveTimers();
        const interval = setInterval(fetchActiveTimers, 10000); // Polling a cada 10s para mais precisão
        return () => clearInterval(interval);
    }, [fetchActiveTimers]);


    const handleStartTimer = async (ticketId: number) => {
        try {
            // Busca dados do ticket para garantir que temos as informações mais recentes
            const ticketData = await getTicket(ticketId);

            if (ticketData.status === 'Finalizado') {
                showNotification('Não é possível iniciar cronômetro em chamados finalizados.', 'warning');
                return;
            }

            if (ticketData.assigned_user_id !== user?.id) {
                showNotification('Apenas o responsável pelo chamado pode iniciar o cronômetro.', 'error');
                return;
            }

            const newTimer = await startTimer(ticketId);
            setActiveTimers(prev => [...prev.filter(t => t.ticket_id !== ticketId), newTimer]);

            // Adiciona ou atualiza em trackedTickets
            setTrackedTickets(prev => {
                const updated: TrackedTicket = {
                    id: ticketData.id,
                    title: ticketData.title,
                    clientName: ticketData.client?.name || 'Cliente não identificado',
                    total_duration: ticketData.total_duration || 0,
                    session_duration: prev.find(t => t.id === ticketId)?.session_duration || 0,
                    status: ticketData.status,
                    assigned_user_id: ticketData.assigned_user_id
                };
                if (!prev.find(t => t.id === ticketId)) {
                    return [...prev, updated];
                }
                return prev.map(t => t.id === ticketId ? updated : t);
            });

            showNotification('Cronômetro iniciado!', 'success');
        } catch (error) {
            showNotification('Erro ao iniciar cronômetro.', 'error');
        }
    };

    const handleStopTimer = async (ticketId: number, remove: boolean = false) => {
        try {
            // Tenta parar o cronômetro no backend. 
            // Se já estiver parado, o backend retorna 400, mas ignoramos para permitir a finalização/limpeza local.
            try {
                await stopTimer(ticketId);
            } catch (e) {
                console.log('Cronômetro já estava parado ou erro ao parar:', e);
            }

            // Busca dados atualizados do ticket para pegar o novo total_duration
            const ticketData = await getTicket(ticketId);

            // Atualiza trackedTickets antes para evitar o reset visual
            setTrackedTickets(prev => prev.map(t => {
                if (t.id === ticketId) {
                    const activeTimer = activeTimers.find(at => at.ticket_id === ticketId);
                    let sessionDuration = t.session_duration;
                    if (activeTimer) {
                        const dateStr = activeTimer.start_time.endsWith('Z') ? activeTimer.start_time : activeTimer.start_time + 'Z';
                        const start = new Date(dateStr).getTime();
                        const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
                        sessionDuration += elapsed;
                    }
                    return {
                        ...t,
                        total_duration: ticketData.total_duration || 0,
                        session_duration: sessionDuration,
                        status: ticketData.status
                    };
                }
                return t;
            }));

            // Só agora remove dos timers ativos
            setActiveTimers(prev => prev.filter(t => t.ticket_id !== ticketId));

            if (remove) {
                setTrackedTickets(prev => prev.filter(t => t.id !== ticketId));
                showNotification('Atendimento finalizado e removido do widget.', 'success');
            } else {
                showNotification('Cronômetro pausado.', 'success');
            }
        } catch (error) {
            showNotification('Erro ao parar cronômetro.', 'error');
        }
    };

    const stopAllTimers = useCallback(async () => {
        if (activeTimers.length === 0) return;

        try {
            // Cria uma cópia para evitar problemas de concorrência com o estado
            const timersToStop = [...activeTimers];
            for (const timer of timersToStop) {
                await stopTimer(timer.ticket_id);
            }
            setActiveTimers([]);
            setTrackedTickets([]);
            console.log('Todos os cronômetros foram parados devido ao encerramento da sessão.');
        } catch (error) {
            console.error('Erro ao parar todos os cronômetros:', error);
        }
    }, [activeTimers]);

    const removeFromWidget = (ticketId: number) => {
        setTrackedTickets(prev => prev.filter(t => t.id !== ticketId));
        // Se houver um timer rodando, para ele
        if (activeTimers.find(t => t.ticket_id === ticketId)) {
            handleStopTimer(ticketId, true);
        }
    };

    const openPiP = async () => {
        if (!('documentPictureInPicture' in window)) {
            setIsInternalPiPOpen(true);
            return;
        }

        try {
            // @ts-ignore
            const pip = await window.documentPictureInPicture.requestWindow({
                width: 350,
                height: 450,
            });

            // Copiar estilos incluindo as variáveis do tema (:root)
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pip.document.head.appendChild(style);
                } catch (e) {
                    const link = document.createElement('link');
                    if (styleSheet.href) {
                        link.rel = 'stylesheet';
                        link.href = styleSheet.href;
                        pip.document.head.appendChild(link);
                    }
                }
            });

            // Garantir que as classes de tema e ESTILOS INLINE (variáveis custom) do root sejam copiadas
            pip.document.documentElement.className = document.documentElement.className;
            pip.document.body.className = document.body.className;
            pip.document.documentElement.style.cssText = document.documentElement.style.cssText;

            setPipWindow(pip);
            setIsPiPOpen(true);

            pip.addEventListener('pagehide', () => {
                setIsPiPOpen(false);
                setPipWindow(null);
            });

            const container = pip.document.createElement('div');
            container.id = 'pip-root';
            pip.document.body.appendChild(container);

        } catch (error) {
            console.error('Erro ao abrir PiP:', error);
        }
    };

    const closePiP = () => {
        if (pipWindow) {
            pipWindow.close();
        }
        setIsInternalPiPOpen(false);
    };

    // Limpeza ao deslogar
    useEffect(() => {
        if (!user && (isPiPOpen || isInternalPiPOpen || activeTimers.length > 0)) {
            closePiP();
            stopAllTimers();
        }
    }, [user, isPiPOpen, isInternalPiPOpen, activeTimers.length, closePiP, stopAllTimers]);

    // Limpeza ao fechar aba/navegador
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (activeTimers.length > 0) {
                stopAllTimers();
            }
            if (pipWindow) {
                pipWindow.close();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [activeTimers, pipWindow, stopAllTimers]);

    return (
        <TimerContext.Provider value={{
            activeTimers,
            trackedTickets,
            handleStartTimer,
            handleStopTimer,
            removeFromWidget,
            isPiPOpen,
            isInternalPiPOpen,
            openPiP,
            closePiP
        }}>
            {children}
            {isPiPOpen && pipWindow && createPortal(
                <TimerWidget />,
                pipWindow.document.getElementById('pip-root') || pipWindow.document.body
            )}
            <AnimatePresence>
                {isInternalPiPOpen && (
                    <InternalPiP onClose={closePiP} />
                )}
            </AnimatePresence>
        </TimerContext.Provider>
    );
};

export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error('useTimer deve ser usado dentro de um TimerProvider');
    return context;
};
