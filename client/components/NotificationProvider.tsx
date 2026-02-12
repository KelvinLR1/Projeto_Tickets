'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle, Bell } from 'lucide-react';
import clsx from 'clsx';
import {
    Notification as ApiNotification,
    getNotifications,
    getUnreadNotificationCount,
    markNotificationRead,
    markNotificationUnread,
    deleteNotification,
    markAllNotificationsRead
} from '@/lib/api';
import { useAuth } from './AuthProvider';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: number;
    message: string;
    type: NotificationType;
}

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'info';
}

interface NotificationContextType {
    showNotification: (message: string, type?: NotificationType) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    notifications: ApiNotification[];
    unreadCount: number;
    fetchNotifications: () => Promise<void>;
    markAsRead: (id: number) => Promise<void>;
    markAsUnread: (id: number) => Promise<void>;
    deleteNotif: (id: number) => Promise<void>;
    markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated } = useAuth();
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [notifications, setNotifications] = useState<ApiNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((n) => n.id !== id));
        }, 5000);
    }, []);

    const fetchNotifications = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const data = await getNotifications(0, 50);
            setNotifications(data);
            const countData = await getUnreadNotificationCount();
            setUnreadCount(countData.count);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    }, [isAuthenticated]);

    const markAsRead = useCallback(async (id: number) => {
        try {
            await markNotificationRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }, []);

    const markAsUnread = useCallback(async (id: number) => {
        try {
            await markNotificationUnread(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
            setUnreadCount(prev => prev + 1);
        } catch (error) {
            console.error('Failed to mark notification as unread:', error);
        }
    }, []);

    const deleteNotif = useCallback(async (id: number) => {
        try {
            const notif = notifications.find(n => n.id === id);
            await deleteNotification(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            if (notif && !notif.read) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
            showNotification('Notificação excluída.', 'success');
        } catch (error) {
            console.error('Failed to delete notification:', error);
            showNotification('Erro ao excluir notificação.', 'error');
        }
    }, [notifications, showNotification]);

    const markAllAsRead = useCallback(async () => {
        try {
            await markAllNotificationsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    }, []);

    // Polling de notificações
    useEffect(() => {
        if (!isAuthenticated) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000); // 1 minuto
        return () => clearInterval(interval);
    }, [isAuthenticated, fetchNotifications]);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setConfirmDialog({
                open: true,
                options,
                resolve: (value) => {
                    setConfirmDialog(null);
                    resolve(value);
                }
            });
        });
    }, []);

    return (
        <NotificationContext.Provider value={{
            showNotification,
            confirm,
            notifications,
            unreadCount,
            fetchNotifications,
            markAsRead,
            markAsUnread,
            deleteNotif,
            markAllAsRead
        }}>
            {children}

            {/* Toasts Container */}
            <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
                {toasts.map((n) => (
                    <div
                        key={n.id}
                        className={clsx(
                            "pointer-events-auto flex items-center gap-3 p-4 rounded-2xl border backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-right-8 duration-300 min-w-[300px] max-w-md",
                            n.type === 'success' && "bg-green-500/10 border-green-500/20 text-green-400",
                            n.type === 'error' && "bg-red-500/10 border-red-500/20 text-red-400",
                            n.type === 'warning' && "bg-orange-500/10 border-orange-500/20 text-orange-400",
                            n.type === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-400"
                        )}
                    >
                        {n.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
                        {n.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                        {n.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                        {n.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}

                        <span className="text-sm font-medium flex-1">{n.message}</span>

                        <button
                            onClick={() => setToasts(prev => prev.filter(item => item.id !== n.id))}
                            className="p-1 hover:bg-black/10 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Confirmation Modal */}
            {confirmDialog && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-sm rounded-3xl border border-border-theme shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-foreground">
                        <div className="p-8 space-y-6 text-center">
                            <div className={clsx(
                                "w-16 h-16 rounded-3xl mx-auto flex items-center justify-center",
                                confirmDialog.options.type === 'danger' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                            )}>
                                {confirmDialog.options.type === 'danger' ? <AlertTriangle className="w-8 h-8" /> : <Info className="w-8 h-8" />}
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-xl font-bold uppercase tracking-tight">{confirmDialog.options.title}</h3>
                                <p className="text-sm text-gray-500 italic">{confirmDialog.options.message}</p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => confirmDialog.resolve(false)}
                                    className="flex-1 p-4 rounded-2xl border border-border-theme font-bold text-xs uppercase tracking-widest hover:bg-card/40 transition-all active:scale-95"
                                >
                                    {confirmDialog.options.cancelText || 'Cancelar'}
                                </button>
                                <button
                                    onClick={() => confirmDialog.resolve(true)}
                                    className={clsx(
                                        "flex-1 p-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 text-white",
                                        confirmDialog.options.type === 'danger' ? "bg-red-600 hover:bg-red-500 shadow-red-500/20" : "bg-accent-theme hover:brightness-110 shadow-accent-theme/20"
                                    )}
                                >
                                    {confirmDialog.options.confirmText || 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
};
