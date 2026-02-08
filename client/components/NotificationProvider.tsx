'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
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
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
        const id = Date.now();
        setNotifications((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 5000);
    }, []);

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
        <NotificationContext.Provider value={{ showNotification, confirm }}>
            {children}

            {/* Toasts Container */}
            <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3 pointer-events-none">
                {notifications.map((n) => (
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
                            onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}
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
