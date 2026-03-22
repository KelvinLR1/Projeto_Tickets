import React, { useState, useEffect } from 'react';
import { X, Send, User, MessageSquare, AlertCircle, Info, CheckCircle, AlertTriangle, Tag, Layers, Users } from 'lucide-react';
import { sendNotification, getUsers, getSectors } from '@/lib/api';
import clsx from 'clsx';
import MultiSelectUser from './MultiSelectUser';
import MultiSelectSector from './MultiSelectSector';
import TicketSearchSelect from './TicketSearchSelect';

/**
 * Propriedades do componente de composição de notificações.
 */
interface NotificationComposerProps {
    onClose: () => void;   // Função para fechar o modal
    onSuccess: () => void; // Função chamada após envio bem-sucedido
}

/**
 * Componente Compositor de Notificações.
 * Permite criar e enviar mensagens personalizadas para usuários individuais
 * ou setores inteiros, com suporte a tipos de alerta e vínculo com tickets.
 */
export default function NotificationComposer({ onClose, onSuccess }: NotificationComposerProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [sectors, setSectors] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Estados de Seleção e Destinatários
    const [targetType, setTargetType] = useState<'users' | 'sectors'>('users');
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]);

    // Conteúdo da Notificação
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState('info');
    const [ticketId, setTicketId] = useState<number | null>(null);

    // Carrega usuários e setores disponíveis ao montar o componente
    useEffect(() => {
        loadData();
    }, []);

    /**
     * Busca dados necessários para popular as listas de seleção múltipla.
     */
    const loadData = async () => {
        try {
            const [usersData, sectorsData] = await Promise.all([
                getUsers(),
                getSectors()
            ]);
            setUsers(usersData);
            setSectors(sectorsData);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    };

    /**
     * Processa o envio da notificação para o servidor.
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Verifica se há destinatários selecionados conforme o tipo de alvo
        const hasRecipients = targetType === 'users'
            ? selectedUserIds.length > 0
            : selectedSectorIds.length > 0;

        if (!hasRecipients || !title || !message) {
            alert('Por favor, preencha todos os campos obrigatórios e selecione pelo menos um destinatário.');
            return;
        }

        setLoading(true);
        try {
            await sendNotification({
                recipient_user_id: 0, // Mantido por compatibilidade de tipo, mas ignorado pela lógica de múltiplos IDs no backend
                recipient_ids: targetType === 'users' ? selectedUserIds : undefined,
                sector_ids: targetType === 'sectors' ? selectedSectorIds : undefined,
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

    /**
     * Opções visuais para o tipo de notificação (estilização e ícones).
     */
    const typeOptions = [
        { value: 'info', label: 'Informação', icon: Info, color: 'text-blue-500' },
        { value: 'success', label: 'Sucesso', icon: CheckCircle, color: 'text-green-500' },
        { value: 'warning', label: 'Aviso', icon: AlertTriangle, color: 'text-orange-500' },
        { value: 'error', label: 'Erro', icon: AlertCircle, color: 'text-red-500' }
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card rounded-3xl max-w-2xl w-full p-8 border border-border-theme shadow-2xl animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">

                {/* Cabeçalho do Modal */}
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-border-theme">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl premium-gradient shadow-lg shadow-accent-theme/20">
                            <Send className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black font-display uppercase italic tracking-tight">Nova Notificação</h2>
                            <p className="text-sm text-muted-foreground">Envie mensagens para usuários ou setores</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Formulário de Criação */}
                <form onSubmit={handleSubmit} className="space-y-6">

                    {/* Abas de Tipo de Alvo (Usuários vs Setores) */}
                    <div className="flex bg-background/50 p-1 rounded-2xl border border-border-theme">
                        <button
                            type="button"
                            onClick={() => setTargetType('users')}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                                targetType === 'users'
                                    ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20"
                                    : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            <Users className="w-3.5 h-3.5" />
                            Usuários
                        </button>
                        <button
                            type="button"
                            onClick={() => setTargetType('sectors')}
                            className={clsx(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                                targetType === 'sectors'
                                    ? "bg-accent-theme text-white shadow-lg shadow-accent-theme/20"
                                    : "text-muted-foreground hover:bg-white/5"
                            )}
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Setores
                        </button>
                    </div>

                    {/* Seleção de Destinatários */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            {targetType === 'users' ? <User className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                            {targetType === 'users' ? 'Selecionar Usuários' : 'Selecionar Setores'} *
                        </label>

                        {targetType === 'users' ? (
                            <MultiSelectUser
                                users={users}
                                selectedIds={selectedUserIds}
                                onChange={setSelectedUserIds}
                            />
                        ) : (
                            <MultiSelectSector
                                sectors={sectors}
                                selectedIds={selectedSectorIds}
                                onChange={setSelectedSectorIds}
                            />
                        )}
                        <p className="text-xs text-muted-foreground text-right pt-1">
                            {targetType === 'users'
                                ? `${selectedUserIds.length} usuários selecionados`
                                : `${selectedSectorIds.length} setores selecionados`
                            }
                        </p>
                    </div>

                    {/* Seleção do Tipo de Alerta */}
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

                    {/* Título da Notificação */}
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

                    {/* Corpo da Mensagem */}
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

                    {/* Vínculo com Ticket (Opcional) */}
                    <div className="space-y-2">
                        <TicketSearchSelect
                            label="Vincular Ticket (Opcional)"
                            value={ticketId}
                            onChange={(id) => setTicketId(id)}
                        />
                    </div>

                    {/* Botões de Ação */}
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
                            disabled={loading || (targetType === 'users' ? selectedUserIds.length === 0 : selectedSectorIds.length === 0)}
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
