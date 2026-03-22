'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TimeLog, Ticket, startTimer, stopTimer, getActiveTimers, getTicket, getTickets } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { useNotification } from './NotificationProvider';
import TimerWidget from './TimerWidget';
import InternalPiP from './InternalPiP';
import { AnimatePresence } from 'framer-motion';

/**
 * Interface que define um ticket sendo rastreado pelo cronômetro.
 */
interface TrackedTicket {
    id: number;
    title: string;
    clientName: string;
    total_duration: number;   // Tempo total acumulado no banco
    session_duration: number; // Tempo da sessão atual (se houver timer rodando)
    status: string;
    assigned_user_id?: number | null;
}

/**
 * Interface que define os dados e funções expostos pelo contexto do Timer.
 */
interface TimerContextType {
    activeTimers: TimeLog[];              // Lista de logs de tempo ativos no backend
    trackedTickets: TrackedTicket[];      // Dados completos dos tickets no widget
    handleStartTimer: (ticketId: number) => Promise<void>;
    handleStopTimer: (ticketId: number, remove?: boolean) => Promise<void>;
    removeFromWidget: (ticketId: number) => void;
    isPiPOpen: boolean;                   // Indica se a janela PiP externa está aberta
    isInternalPiPOpen: boolean;           // Indica se o widget interno está aberto
    openPiP: () => Promise<void>;         // Abre a janela PiP (ou fallback para widget interno)
    closePiP: () => void;
}

// Criação do contexto
const TimerContext = createContext<TimerContextType | undefined>(undefined);

/**
 * Provedor de Contexto do Sistema de Cronômetros (Time Tracking).
 * Centraliza a lógica de contagem de tempo, persistência via API e 
 * interface flutuante (Picture-in-Picture).
 */
export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const { showNotification } = useNotification();
    const [activeTimers, setActiveTimers] = useState<TimeLog[]>([]);
    const [trackedTickets, setTrackedTickets] = useState<TrackedTicket[]>([]);
    const [isPiPOpen, setIsPiPOpen] = useState(false);
    const [isInternalPiPOpen, setIsInternalPiPOpen] = useState(false);
    const [pipWindow, setPipWindow] = useState<any>(null);

    /**
     * Busca os cronômetros ativos do usuário no backend.
     */
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
            const timers = await getActiveTimers();
            setActiveTimers(timers);

            // Sincroniza a lista de tickets do widget com os timers ativos
            setTrackedTickets(prev => {
                const newTracked = [...prev];

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

                timers.forEach(timer => {
                    if (timer.ticket) {
                        addIfMissing({
                            ...timer.ticket,
                            id: timer.ticket_id
                        });
                    }
                });

                return newTracked;
            });
        } catch (error: any) {
            if (error.response?.status !== 401) {
                console.error('Erro ao buscar dados do widget:', error);
            }
        }
    }, [user, loading]);

    // Pooling para manter os cronômetros sincronizados entre dispositivos/abas.
    // O backend é a fonte da verdade para timers ativos.
    useEffect(() => {
        fetchActiveTimers();
        const interval = setInterval(fetchActiveTimers, 10000);
        return () => clearInterval(interval);
    }, [fetchActiveTimers]);

    /**
     * Inicia o cronômetro para um determinado ticket.
     */
    const handleStartTimer = async (ticketId: number) => {
        try {
            const ticketData = await getTicket(ticketId);

            // Validações de regra de negócio
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

            // Atualiza o estado visual do ticket no widget
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

    /**
     * Para o cronômetro de um ticket.
     * @param remove Se true, remove o ticket da lista do widget após parar.
     */
    const handleStopTimer = async (ticketId: number, remove: boolean = false) => {
        try {
            try {
                await stopTimer(ticketId);
            } catch (e) {
                console.log('Cronômetro já estava parado ou erro ao parar:', e);
            }

            const ticketData = await getTicket(ticketId);

            // Calcula a duração total final para evitar saltos visuais antes do refresh global
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

    /**
     * Para todos os cronômetros ativos do usuário (usado no logout).
     */
    const stopAllTimers = useCallback(async () => {
        if (activeTimers.length === 0) return;

        try {
            const timersToStop = [...activeTimers];
            for (const timer of timersToStop) {
                await stopTimer(timer.ticket_id);
            }
            setActiveTimers([]);
            setTrackedTickets([]);
        } catch (error) {
            console.error('Erro ao parar todos os cronômetros:', error);
        }
    }, [activeTimers]);

    /**
     * Remove um ticket da lista visual do widget.
     */
    const removeFromWidget = (ticketId: number) => {
        setTrackedTickets(prev => prev.filter(t => t.id !== ticketId));
        if (activeTimers.find(t => t.ticket_id === ticketId)) {
            handleStopTimer(ticketId, true);
        }
    };

    /**
     * Abre a janela móvel (Document Picture-in-Picture) com o TimerWidget.
     * Esta API permite 'desacoplar' uma janela do navegador com conteúdo HTML arbitrário. 
     * Caso o navegador não suporte a API (ex: Firefox ou versões antigas), 
     * abre o widget internamente sob a forma de modal flutuante.
     */
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

            // Copia os estilos da página principal para a janela PiP
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

            // Sincroniza as variáveis de tema (:root), classes do sistema e cores de fundo
            pip.document.documentElement.className = document.documentElement.className;
            pip.document.body.className = document.body.className;
            pip.document.documentElement.style.cssText = document.documentElement.style.cssText;

            const bodyStyle = window.getComputedStyle(document.body);
            pip.document.body.style.backgroundColor = bodyStyle.backgroundColor;
            pip.document.documentElement.style.backgroundColor = bodyStyle.backgroundColor;

            setPipWindow(pip);
            setIsPiPOpen(true);

            pip.addEventListener('pagehide', () => {
                setIsPiPOpen(false);
                setPipWindow(null);
            });

            const container = pip.document.createElement('div');
            container.id = 'pip-root';
            container.style.height = '100vh';
            container.style.width = '100vw';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            pip.document.body.appendChild(container);

            // Ajustes finos no layout da janela flutuante
            pip.document.body.style.margin = '0';
            pip.document.body.style.padding = '0';
            pip.document.body.style.height = '100vh';
            pip.document.body.style.overflow = 'hidden';
            pip.document.documentElement.style.height = '100vh';
            pip.document.documentElement.style.margin = '0';
            pip.document.documentElement.style.padding = '0';
            pip.document.documentElement.style.overflow = 'hidden';

        } catch (error) {
            console.error('Erro ao abrir PiP:', error);
        }
    };

    /**
     * Fecha a janela PiP ou o widget interno.
     */
    const closePiP = () => {
        if (pipWindow) {
            pipWindow.close();
        }
        setIsInternalPiPOpen(false);
    };

    // Garante que cronômetros sejam parados no logout
    useEffect(() => {
        if (!user && (isPiPOpen || isInternalPiPOpen || activeTimers.length > 0)) {
            closePiP();
            stopAllTimers();
        }
    }, [user, isPiPOpen, isInternalPiPOpen, activeTimers.length, closePiP, stopAllTimers]);

    // Proteção contra cronômetros "fantasmas" no fechamento da aba
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

            {/* Renderiza o Widget dentro da janela PiP (se aberta) via Portal React */}
            {isPiPOpen && pipWindow && createPortal(
                <TimerWidget />,
                pipWindow.document.getElementById('pip-root') || pipWindow.document.body
            )}

            {/* Renderiza o Widget interno como fallback animado */}
            <AnimatePresence>
                {isInternalPiPOpen && (
                    <InternalPiP onClose={closePiP} />
                )}
            </AnimatePresence>
        </TimerContext.Provider>
    );
};

/**
 * Hook customizado para gerenciar tempos em qualquer parte do sistema.
 */
export const useTimer = () => {
    const context = useContext(TimerContext);
    if (!context) throw new Error('useTimer deve ser usado dentro de um TimerProvider');
    return context;
};
