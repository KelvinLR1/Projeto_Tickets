'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNotification } from '@/components/NotificationProvider';
import { Bell, CheckCircle2, Info, AlertTriangle, Clock, X, Check, Send, User, Ticket as TicketIcon, Reply, Trash2, Undo } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { getUsers, getTickets, sendNotification, User as ApiUser, Ticket as ApiTicket } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import CustomSelect from '@/components/CustomSelect';
import { motion, AnimatePresence } from 'framer-motion';

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
    const [showSendModal, setShowSendModal] = useState(false);

    // Modal State
    const [receivers, setReceivers] = useState<ApiUser[]>([]);
    const [availableTickets, setAvailableTickets] = useState<ApiTicket[]>([]);
    const [formData, setFormData] = useState({
        recipient_user_id: '',
        title: '',
        message: '',
        type: 'info',
        ticket_id: ''
    });
    const [isSending, setIsSending] = useState(false);

    const loadInitialData = useCallback(async () => {
        try {
            const [usersData, ticketsData] = await Promise.all([
                getUsers(),
                getTickets()
            ]);
            setReceivers(usersData.filter(u => u.id !== currentUser?.id));
            setAvailableTickets(ticketsData);
        } catch (error) {
            console.error('Failed to load modal data:', error);
        }
    }, [currentUser]);

    useEffect(() => {
        fetchNotifications();
        loadInitialData();
    }, [fetchNotifications, loadInitialData]);

    const filteredNotifications = useMemo(() => {
        if (filter === 'all') return notifications;
        if (filter === 'read') return notifications.filter(n => n.read);
        return notifications.filter(n => !n.read);
    }, [notifications, filter]);

    const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.recipient_user_id || !formData.title || !formData.message) return;

        setIsSending(true);
        try {
            await sendNotification({
                recipient_user_id: parseInt(formData.recipient_user_id),
                title: formData.title,
                message: formData.message,
                type: formData.type,
                ticket_id: formData.ticket_id ? parseInt(formData.ticket_id) : undefined
            });
            setShowSendModal(false);
            setFormData({ recipient_user_id: '', title: '', message: '', type: 'info', ticket_id: '' });
            fetchNotifications();
            showNotification('Notificação enviada com sucesso!', 'success');
        } catch (error) {
            console.error('Failed to send notification:', error);
            showNotification('Erro ao enviar notificação.', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleReply = (notif: any) => {
        if (!notif.created_by_user_id) return;
        setFormData({
            ...formData,
            recipient_user_id: notif.created_by_user_id,
            title: `RE: ${notif.title}`,
            message: ''
        });
        setShowSendModal(true);
    };

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
                                key="empty-state"
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
                                transition={{ duration: 0.2 }}
                                className="space-y-4"
                            >
                                {filteredNotifications.map((notif) => (
                                    <motion.div
                                        key={notif.id}
                                        layout
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.98, x: 20 }}
                                        transition={{ duration: 0.2 }}
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
                                                                "text-lg font-black uppercase tracking-tight transition-colors",
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
                                                            onClick={() => handleReply(notif)}
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
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-card w-full max-w-lg rounded-3xl border border-border-theme shadow-2xl overflow-hidden text-foreground"
                        >
                            <div className="p-8 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-2xl font-black uppercase tracking-tight">Enviar <span className="text-accent-theme">Notificação</span></h3>
                                    <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                                        <X className="w-6 h-6 text-gray-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleSendNotification} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                                        <CustomSelect
                                            label="Destinatário"
                                            value={formData.recipient_user_id}
                                            onChange={(val) => setFormData({ ...formData, recipient_user_id: val })}
                                            options={receivers.map(u => ({
                                                value: u.id,
                                                label: u.full_name || u.username,
                                                icon: <User className="w-4 h-4" />,
                                                subtitle: u.role
                                            }))}
                                            placeholder="Selecione o usuário..."
                                            icon={<User className="w-4 h-4" />}
                                        />

                                        <CustomSelect
                                            label="Vincular Chamado"
                                            value={formData.ticket_id}
                                            onChange={(val) => setFormData({ ...formData, ticket_id: val })}
                                            options={[
                                                { value: '', label: 'Nenhum chamado vinculado' },
                                                ...availableTickets.map(t => ({
                                                    value: t.id,
                                                    label: `#${t.id} - ${t.title}`,
                                                    icon: <TicketIcon className="w-4 h-4" />,
                                                    subtitle: `Cliente: ${t.client?.name || 'Não informado'}`
                                                }))
                                            ]}
                                            placeholder="Vincular chamado..."
                                            icon={<TicketIcon className="w-4 h-4" />}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Título do Alerta</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Ex: Atualização no Chamado X"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Mensagem</label>
                                        <textarea
                                            required
                                            rows={4}
                                            value={formData.message}
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            placeholder="Descreva o que o usuário precisa saber..."
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold resize-none"
                                        />
                                    </div>

                                    <div className="flex gap-4 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowSendModal(false)}
                                            className="flex-1 p-5 rounded-2xl border border-border-theme font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSending}
                                            className="flex-1 premium-gradient text-white p-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            <Send className="w-4 h-4" />
                                            {isSending ? 'Enviando...' : 'Enviar Agora'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
