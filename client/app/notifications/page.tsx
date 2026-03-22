'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNotification } from '@/components/NotificationProvider';
import { Bell, CheckCircle2, Info, AlertTriangle, Clock, Check, Send, User, Ticket as TicketIcon, Reply, Trash2, Undo } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { Ticket as ApiTicket } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import NotificationComposer from '@/components/NotificationComposer';

export default function NotificationsPage() {
    const { user: currentUser } = useAuth();
    const {
        notifications,
        unreadCount,
        fetchNotifications,
        markAsRead,
        markAsUnread,
        deleteNotif,
        markAllAsRead,
        confirm,
        showNotification
    } = useNotification();

    const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
    const [mainTab, setMainTab] = useState<'notifications' | 'followed'>('notifications');
    const [showSendModal, setShowSendModal] = useState(false);

    // Followed Tickets State
    const [followedTickets, setFollowedTickets] = useState<ApiTicket[]>([]);
    const [isLoadingFollowed, setIsLoadingFollowed] = useState(false);

    // Modal State
    // Removed redundant state managed by NotificationComposer

    const fetchFollowedTickets = useCallback(async () => {
        setIsLoadingFollowed(true);
        try {
            const { getFollowedTickets } = await import('@/lib/api');
            const data = await getFollowedTickets();
            setFollowedTickets(data);
        } catch (error) {
            console.error('Failed to fetch followed tickets:', error);
        } finally {
            setIsLoadingFollowed(false);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        fetchFollowedTickets();
    }, [fetchNotifications, fetchFollowedTickets]);

    const filteredNotifications = useMemo(() => {
        if (filter === 'all') return notifications;
        if (filter === 'read') return notifications.filter(n => n.read);
        return notifications.filter(n => !n.read);
    }, [notifications, filter]);

    const handleDelete = async (id: number) => {
        const ok = await confirm({
            title: 'Excluir Notificação',
            message: 'Tem certeza que deseja excluir esta notificação permanentemente?',
            confirmText: 'Excluir',
            type: 'danger'
        });
        if (ok) {
            await deleteNotif(id);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-2"
                    >
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Central de <span className="text-accent-theme">Notificações</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">
                            Gerencie sua caixa de entrada e envie avisos para outros usuários.
                        </p>
                    </motion.div>

                    <motion.div
                        layout
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex gap-4"
                    >
                        <motion.button
                            layout
                            transition={{ type: "spring", stiffness: 450, damping: 35 }}
                            onClick={() => setShowSendModal(true)}
                            className="flex items-center justify-center gap-3 px-8 py-4 rounded-2xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                        >
                            <Send className="w-4 h-4" />
                            Enviar Notificação
                        </motion.button>

                        <AnimatePresence mode="popLayout">
                            {unreadCount > 0 && (
                                <motion.button
                                    layout
                                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 450,
                                        damping: 35
                                    }}
                                    onClick={markAllAsRead}
                                    className="flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 whitespace-nowrap overflow-hidden"
                                >
                                    <Check className="w-4 h-4" />
                                    Marcar todas como lidas
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                {/* Main Tabs Switcher */}
                <div className="flex gap-4 p-1 bg-white/5 border border-border-theme rounded-2xl w-full max-w-2xl mx-auto shadow-2xl relative overflow-hidden">
                    <button
                        onClick={() => setMainTab('notifications')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative z-10",
                            mainTab === 'notifications' ? "text-white" : "text-[var(--color-text-muted)] hover:text-foreground"
                        )}
                    >
                        <Bell className="w-4 h-4" />
                        Notificações
                        {unreadCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-accent-theme animate-pulse" />
                        )}
                        {mainTab === 'notifications' && (
                            <motion.div
                                layoutId="main-tab-pill"
                                className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                    </button>
                    <button
                        onClick={() => setMainTab('followed')}
                        className={clsx(
                            "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative z-10",
                            mainTab === 'followed' ? "text-white" : "text-[var(--color-text-muted)] hover:text-foreground"
                        )}
                    >
                        <TicketIcon className="w-4 h-4" />
                        Chamados Acompanhados
                        {followedTickets.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] font-black">
                                {followedTickets.length}
                            </span>
                        )}
                        {mainTab === 'followed' && (
                            <motion.div
                                layoutId="main-tab-pill"
                                className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {mainTab === 'notifications' ? (
                        <motion.div
                            key="tab-notifications"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-10"
                        >
                            {/* Filters Tabs */}
                            <div className="flex gap-2 p-1 bg-white/5 border border-border-theme rounded-2xl w-fit relative">
                                {(['all', 'unread', 'read'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setFilter(t)}
                                        className={clsx(
                                            "px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative z-10",
                                            filter === t ? "text-white" : "text-[var(--color-text-muted)] hover:text-foreground"
                                        )}
                                    >
                                        {t === 'all' ? 'Todas' : t === 'unread' ? `Não Lidas (${unreadCount})` : 'Já Lidas'}
                                        {filter === t && (
                                            <motion.div
                                                layoutId="filter-pill"
                                                className="absolute inset-0 bg-accent-theme rounded-xl -z-10 shadow-lg shadow-accent-theme/20"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Notifications List */}
                            <div className="relative min-h-[400px]">
                                <AnimatePresence mode="wait" initial={false}>
                                    {filteredNotifications.length === 0 ? (
                                        <motion.div
                                            key="empty-notifs"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 0.5, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2 }}
                                            className="glass-card p-20 rounded-3xl border border-border-theme flex flex-col items-center justify-center text-center space-y-4"
                                        >
                                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                                <Bell className="w-10 h-10" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-bold uppercase tracking-tight">Nada encontrado!</h3>
                                                <p className="text-sm italic">Não existem notificações para este filtro no momento.</p>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="notifications-grid"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="space-y-4"
                                        >
                                            {filteredNotifications.map((notif) => (
                                                <motion.div
                                                    key={notif.id}
                                                    layout
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, scale: 0.98, x: 20 }}
                                                    className={clsx(
                                                        "glass-card p-6 rounded-3xl border transition-all relative overflow-hidden group",
                                                        notif.read
                                                            ? "bg-background/20 border-border-theme opacity-60"
                                                            : "bg-accent-theme/5 border-accent-theme/20 shadow-xl shadow-accent-theme/5"
                                                    )}
                                                >
                                                    <div className="flex items-start gap-6">
                                                        {/* Icon Column */}
                                                        <div className={clsx(
                                                            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110",
                                                            notif.read ? "bg-white/5 text-gray-500" : "bg-accent-theme/10 text-accent-theme shadow-lg shadow-accent-theme/10"
                                                        )}>
                                                            {notif.type === 'success' && <CheckCircle2 className="w-6 h-6" />}
                                                            {notif.type === 'error' && <AlertTriangle className="w-6 h-6" />}
                                                            {notif.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                                                            {(!notif.type || notif.type === 'info') && <Info className="w-6 h-6" />}
                                                        </div>

                                                        {/* Content Column */}
                                                        <div className="flex-1 space-y-4">
                                                            <div className="flex items-start justify-between gap-4">
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <h3 className={clsx(
                                                                            "text-lg font-black font-display uppercase italic tracking-tight transition-colors",
                                                                            notif.read ? "text-foreground/70" : "text-foreground"
                                                                        )}>
                                                                            {notif.title}
                                                                        </h3>
                                                                        {notif.created_by_username && (
                                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-theme/10 text-accent-theme text-[9px] font-black uppercase tracking-widest border border-accent-theme/20">
                                                                                <User className="w-2.5 h-2.5" />
                                                                                {notif.created_by_username}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest opacity-40">
                                                                        <Clock className="w-3 h-3" />
                                                                        {formatDateTime(notif.created_at)}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1">
                                                                    {notif.read ? (
                                                                        <button
                                                                            onClick={() => markAsUnread(notif.id)}
                                                                            className="p-2 hover:bg-white/10 rounded-xl text-[var(--color-text-muted)] transition-colors flex items-center gap-2 group/btn"
                                                                            title="Marcar como não lida"
                                                                        >
                                                                            <Undo className="w-4 h-4" />
                                                                            <span className="text-[9px] font-black uppercase tracking-widest hidden group-hover/btn:block whitespace-nowrap">Não lida</span>
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => markAsRead(notif.id)}
                                                                            className="p-2 hover:bg-accent-theme/10 rounded-xl text-accent-theme transition-colors flex items-center gap-2 group/btn"
                                                                            title="Marcar como lida"
                                                                        >
                                                                            <Check className="w-4 h-4" />
                                                                            <span className="text-[9px] font-black uppercase tracking-widest hidden group-hover/btn:block whitespace-nowrap">Lido</span>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        onClick={() => handleDelete(notif.id)}
                                                                        className="p-2 hover:bg-red-500/10 rounded-xl text-red-500/50 hover:text-red-500 transition-colors group/del"
                                                                        title="Excluir notificação"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <p className={clsx(
                                                                "text-sm leading-relaxed max-w-2xl",
                                                                notif.read ? "text-[var(--color-text-muted)] italic" : "text-foreground opacity-90"
                                                            )}>
                                                                {notif.message}
                                                            </p>

                                                            <div className="flex items-center gap-3 pt-2">
                                                                {notif.link && (
                                                                    <Link
                                                                        href={notif.link}
                                                                        onClick={() => !notif.read && markAsRead(notif.id)}
                                                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-theme text-white text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all"
                                                                    >
                                                                        Acessar Conteúdo
                                                                    </Link>
                                                                )}

                                                                {notif.created_by_user_id && notif.created_by_user_id !== currentUser?.id && (
                                                                    <button
                                                                        onClick={() => setShowSendModal(true)}
                                                                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 active:scale-95 transition-all"
                                                                    >
                                                                        <Reply className="w-3.5 h-3.5" />
                                                                        Responder
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Unread Indicator */}
                                                        {!notif.read && (
                                                            <div className="absolute top-0 right-0 p-4">
                                                                <div className="w-2 h-2 rounded-full bg-accent-theme animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="tab-followed"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-6"
                        >
                            {isLoadingFollowed ? (
                                <div className="flex flex-col items-center justify-center p-20 space-y-4 opacity-50">
                                    <div className="w-12 h-12 rounded-full border-4 border-accent-theme/20 border-t-accent-theme animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Carregando Chamados...</p>
                                </div>
                            ) : followedTickets.length === 0 ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 0.5, y: 0 }}
                                    className="glass-card p-20 rounded-3xl border border-border-theme flex flex-col items-center justify-center text-center space-y-4"
                                >
                                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                        <TicketIcon className="w-10 h-10" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold uppercase tracking-tight">Vazio!</h3>
                                        <p className="text-sm italic">Você não está acompanhando nenhum chamado no momento.</p>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {followedTickets.map((ticket) => (
                                        <motion.div
                                            key={ticket.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="glass-card group p-6 rounded-[2.5rem] border border-border-theme hover:border-accent-theme/30 transition-all duration-500 hover:shadow-2xl hover:shadow-accent-theme/5 relative overflow-hidden"
                                        >
                                            {/* ID Badge */}
                                            <div className="absolute top-0 right-0 p-6">
                                                <span className="text-[10px] font-mono font-bold opacity-20 group-hover:opacity-40 transition-opacity">
                                                    #{ticket.id}
                                                </span>
                                            </div>

                                            <div className="space-y-6">
                                                {/* Header */}
                                                <div className="flex items-center gap-4">
                                                    <div className={clsx(
                                                        "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:rotate-3 duration-500",
                                                        ticket.status === 'Finalizado' ? "bg-green-500/10 text-green-500 shadow-green-500/10" : "bg-accent-theme/10 text-accent-theme shadow-accent-theme/10"
                                                    )}>
                                                        <TicketIcon className="w-6 h-6" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-black uppercase tracking-tight truncate group-hover:text-accent-theme transition-colors">
                                                            {ticket.title}
                                                        </h4>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-accent-theme">
                                                                {ticket.status}
                                                            </span>
                                                            <span className="w-1 h-1 rounded-full bg-[var(--color-text-muted)] opacity-30" />
                                                            <span className="text-[9px] font-mono opacity-40">
                                                                {formatDateTime(ticket.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                                                        <User className="w-4 h-4 opacity-40" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-40">Responsável</p>
                                                            <p className="text-[10px] font-bold truncate">
                                                                {ticket.assigned_user?.full_name || ticket.assigned_user?.username || 'Não atribuído'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                                                        <Info className="w-4 h-4 opacity-40" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-40">Cliente</p>
                                                            <p className="text-[10px] font-bold truncate">
                                                                {ticket.client?.name || 'Não informado'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-3 pt-2">
                                                    <Link
                                                        href={`/tickets/${ticket.id}`}
                                                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent-theme text-white text-[9px] font-black uppercase tracking-widest shadow-lg shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                        Ver Detalhes
                                                    </Link>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Send Notification Modal */}
            <AnimatePresence>
                {showSendModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <NotificationComposer
                            onClose={() => setShowSendModal(false)}
                            onSuccess={() => {
                                setShowSendModal(false);
                                fetchNotifications();
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
