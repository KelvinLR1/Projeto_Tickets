'use client';

import React, { useState, useEffect } from 'react';
import { X, Send, User, MessageSquare, AlertCircle, Info, CheckCircle, AlertTriangle, Tag } from 'lucide-react';
import { sendNotification, getUsers, getTickets } from '@/lib/api';
import clsx from 'clsx';

interface NotificationComposerProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function NotificationComposer({ onClose, onSuccess }: NotificationComposerProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [recipientId, setRecipientId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState('info');
    const [ticketId, setTicketId] = useState<number | null>(null);

    useEffect(() => {
        loadUsers();
        loadTickets();
    }, []);

    const loadUsers = async () => {
        try {
            const data = await getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
        }
    };

    const loadTickets = async () => {
        try {
            const data = await getTickets();
            setTickets(data.slice(0, 20)); // Limit to 20 most recent
        } catch (error) {
            console.error('Erro ao carregar tickets:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!recipientId || !title || !message) {
            alert('Por favor, preencha todos os campos obrigatórios');
            return;
        }

        setLoading(true);
        try {
            await sendNotification({
                recipient_user_id: recipientId,
                title,
                message,
                type,
                ticket_id: ticketId || undefined
            });

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            alert('Erro ao enviar notificação');
        } finally {
            setLoading(false);
        }
    };

    const typeOptions = [
        { value: 'info', label: 'Informação', icon: Info, color: 'text-blue-500' },
        { value: 'success', label: 'Sucesso', icon: CheckCircle, color: 'text-green-500' },
        { value: 'warning', label: 'Aviso', icon: AlertTriangle, color: 'text-orange-500' },
        { value: 'error', label: 'Erro', icon: AlertCircle, color: 'text-red-500' }
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card rounded-3xl max-w-2xl w-full p-8 border border-border-theme shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-theme">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl premium-gradient shadow-lg shadow-accent-theme/20">
                            <Send className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-tight">Nova Notificação</h2>
                            <p className="text-sm text-muted-foreground">Envie uma mensagem para outro usuário</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Recipient */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <User className="w-3.5 h-3.5" />
                            Destinatário *
                        </label>
                        <select
                            value={recipientId || ''}
                            onChange={(e) => setRecipientId(Number(e.target.value))}
                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium"
                            required
                        >
                            <option value="">Selecione um usuário</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.full_name} (@{user.username})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Tipo
                        </label>
                        <div className="grid grid-cols-4 gap-3">
                            {typeOptions.map(option => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setType(option.value)}
                                        className={clsx(
                                            "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                                            type === option.value
                                                ? "bg-accent-theme/10 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10"
                                                : "bg-card border-border-theme hover:border-accent-theme/30"
                                        )}
                                    >
                                        <Icon className={clsx("w-5 h-5", type === option.value ? "text-accent-theme" : option.color)} />
                                        <span className="text-[9px] font-bold uppercase">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Título *
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Solicitação de aprovação"
                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium"
                            required
                            maxLength={100}
                        />
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Mensagem *
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Digite sua mensagem aqui..."
                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium resize-none"
                            rows={4}
                            required
                            maxLength={500}
                        />
                        <p className="text-xs text-muted-foreground text-right">{message.length}/500</p>
                    </div>

                    {/* Ticket (Optional) */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5" />
                            Vincular Ticket (Opcional)
                        </label>
                        <select
                            value={ticketId || ''}
                            onChange={(e) => setTicketId(e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-medium"
                        >
                            <option value="">Nenhum ticket</option>
                            {tickets.map(ticket => (
                                <option key={ticket.id} value={ticket.id}>
                                    {ticket.id} - {ticket.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-6 border-t border-border-theme">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 rounded-2xl bg-card border border-border-theme hover:border-accent-theme/30 transition-all text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-6 py-3 rounded-2xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-theme/20 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Enviar Notificação
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
