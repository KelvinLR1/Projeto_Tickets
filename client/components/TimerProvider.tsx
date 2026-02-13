'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TimeLog, Ticket, startTimer, stopTimer, getActiveTimers, getTicket } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { useNotification } from './NotificationProvider';
import TimerWidget from './TimerWidget';

interface TrackedTicket {
    id: number;
    title: string;
    clientName: string;
    total_duration: number;
    status: string;
}

interface TimerContextType {
    activeTimers: TimeLog[];
    trackedTickets: TrackedTicket[];
    handleStartTimer: (ticketId: number) => Promise<void>;
    handleStopTimer: (ticketId: number, remove?: boolean) => Promise<void>;
    removeFromWidget: (ticketId: number) => void;
    isPiPOpen: boolean;
    openPiP: () => Promise<void>;
    closePiP: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [activeTimers, setActiveTimers] = useState<TimeLog[]>([]);
    const [trackedTickets, setTrackedTickets] = useState<TrackedTicket[]>([]);
    const [isPiPOpen, setIsPiPOpen] = useState(false);
    const [pipWindow, setPipWindow] = useState<any>(null);

    const fetchActiveTimers = useCallback(async () => {
        if (!user) return;

        // Verifica se o token está presente antes de fazer a requisição
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('auth_token');
            if (!token || token === 'undefined' || token === 'null') {
                return;
            }
        }

        try {
            const timers = await getActiveTimers();
            setActiveTimers(timers);

            // Sincroniza os tickets que já possuem timers ativos com o widget
            if (timers.length > 0) {
                setTrackedTickets(prev => {
                    const newTracked = [...prev];
                    timers.forEach(timer => {
                        if (timer.ticket && !newTracked.find(t => t.id === timer.ticket_id)) {
                            newTracked.push({
                                id: timer.ticket_id,
                                title: timer.ticket.title,
                                clientName: timer.ticket.client?.name || 'Cliente não identificado',
                                total_duration: timer.ticket.total_duration || 0,
                                status: timer.ticket.status
                            });
                        }
                    });
                    return newTracked;
                });
            }
        } catch (error) {
            console.error('Erro ao buscar timers ativos:', error);
        }
    }, [user]);

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

            const newTimer = await startTimer(ticketId);
            setActiveTimers(prev => [...prev.filter(t => t.ticket_id !== ticketId), newTimer]);

            // Adiciona ou atualiza em trackedTickets
            setTrackedTickets(prev => {
                const updated: TrackedTicket = {
                    id: ticketData.id,
                    title: ticketData.title,
                    clientName: ticketData.client?.name || 'Cliente não identificado',
                    total_duration: ticketData.total_duration || 0,
                    status: ticketData.status
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
            await stopTimer(ticketId);

            // Busca dados atualizados do ticket para pegar o novo total_duration
            const ticketData = await getTicket(ticketId);

            // Atualiza trackedTickets antes para evitar o reset visual
            setTrackedTickets(prev => prev.map(t => t.id === ticketId ? {
                ...t,
                total_duration: ticketData.total_duration || 0,
                status: ticketData.status
            } : t));

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

    const removeFromWidget = (ticketId: number) => {
        setTrackedTickets(prev => prev.filter(t => t.id !== ticketId));
        // Se houver um timer rodando, para ele
        if (activeTimers.find(t => t.ticket_id === ticketId)) {
            handleStopTimer(ticketId, true);
        }
    };

    const openPiP = async () => {
        if (!('documentPictureInPicture' in window)) {
            showNotification('Seu navegador não suporta janelas flutuantes PiP.', 'error');
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
    };

    return (
        <TimerContext.Provider value={{
            activeTimers,
            trackedTickets,
            handleStartTimer,
            handleStopTimer,
            removeFromWidget,
            isPiPOpen,
            openPiP,
            closePiP
        }}>
            {children}
            {isPiPOpen && pipWindow && createPortal(
                <TimerWidget />,
                pipWindow.document.getElementById('pip-root') || pipWindow.document.body
            )}
        </TimerContext.Provider>
    );
};

export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error('useTimer deve ser usado dentro de um TimerProvider');
    return context;
};
