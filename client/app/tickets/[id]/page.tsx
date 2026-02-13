'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTicket, Ticket, getCategories, Category, getClients, Client, getTickets, getStatuses, Status, updateTicket, getTicketHistory, TicketHistory, getAttendants, uploadFile } from '@/lib/api';
import { Loader2, ArrowLeft, Clock, AlertCircle, CheckCircle, User, Tag, Calendar, Paperclip, MessageSquare, ShieldCheck, ChevronDown, History, Info, Send, UserPlus, Briefcase, Plus, Image as ImageIcon, FileText, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import clsx from 'clsx';
import { useNotification } from '@/components/NotificationProvider';
import CustomSelect from '@/components/CustomSelect';
import CategorySelect from '@/components/CategorySelect';
import { Flag } from 'lucide-react';

export default function TicketDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { showNotification, confirm: askConfirm } = useNotification();

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<Client | null>(null);
    const [category, setCategory] = useState<Category | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);

    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isClosingClientModal, setIsClosingClientModal] = useState(false);
    const [clientTickets, setClientTickets] = useState<Ticket[]>([]);
    const [loadingClientTickets, setLoadingClientTickets] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [updatingPriority, setUpdatingPriority] = useState(false);
    const [updatingCategory, setUpdatingCategory] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
    const [history, setHistory] = useState<TicketHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [newInfoContent, setNewInfoContent] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);
    const [attendants, setAttendants] = useState<{ id: number; name: string }[]>([]);
    const [targetAttendantId, setTargetAttendantId] = useState<string>('');
    const [targetSector, setTargetSector] = useState<string>('');
    const [performingAction, setPerformingAction] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const infoDescriptionRef = React.useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (params.id) {
            loadData();
        }
    }, [params.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const ticketId = parseInt(params.id as string);

            const [ticketData, statusesData, categoriesData] = await Promise.all([
                getTicket(ticketId),
                getStatuses(),
                getCategories()
            ]);

            setAllCategories(categoriesData);

            // Se o ticket não tiver status_id mas tiver o nome (legado), tenta encontrar o ID correspondente
            if (!ticketData.status_id && ticketData.status && statusesData.length > 0) {
                const found = statusesData.find((s: Status) => s.name.toLowerCase() === ticketData.status.toLowerCase());
                if (found) {
                    ticketData.status_id = found.id;
                    ticketData.status_obj = found;
                }
            }

            setTicket(ticketData);
            setStatuses(statusesData);

            if (ticketData.client_id) {
                const clients = await getClients();
                const foundClient = clients.find(c => c.id === ticketData.client_id);
                setClient(foundClient || null);
            }

            // Busca recursiva da categoria
            const findCategory = (cats: Category[], id: number): Category | undefined => {
                for (const cat of cats) {
                    if (cat.id === id) return cat;
                    if (cat.subcategories) {
                        const found = findCategory(cat.subcategories, id);
                        if (found) return found;
                    }
                }
            };

            if (ticketData.category_id) {
                const foundCat = findCategory(categoriesData, ticketData.category_id);
                setCategory(foundCat || null);
            }

            // Carrega histórico
            fetchHistory();

        } catch (error) {
            console.error('Failed to load ticket details:', error);
            showNotification('Erro ao carregar detalhes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const historyData = await getTicketHistory(parseInt(params.id as string));
            setHistory(historyData);
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const loadClientTickets = async (clientId: number) => {
        setLoadingClientTickets(true);
        try {
            const tickets = await getTickets(clientId);
            // Ordena por data e pega os últimos 5 (exceto o atual)
            const filtered = tickets
                .filter((t: Ticket) => t.id !== ticket?.id)
                .sort((a: Ticket, b: Ticket) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 5);
            setClientTickets(filtered);
        } catch (error) {
            console.error('Failed to load client tickets:', error);
        } finally {
            setLoadingClientTickets(false);
        }
    };

    const handleClientClick = () => {
        if (client) {
            setIsClientModalOpen(true);
            setIsClosingClientModal(false);
            loadClientTickets(client.id);
        }
    };

    const closeClientModal = () => {
        setIsClosingClientModal(true);
    };

    const handleStatusChange = async (newStatusId: string) => {
        if (!ticket) return;

        const statusId = parseInt(newStatusId);
        const selectedStatus = statuses.find(s => s.id === statusId);

        if (!selectedStatus) return;

        setUpdatingStatus(true);
        try {
            await updateTicket(ticket.id, {
                status_id: selectedStatus.id,
                status: selectedStatus.name
            });

            setTicket({
                ...ticket,
                status: selectedStatus.name,
                status_id: selectedStatus.id,
                status_obj: selectedStatus
            });

            showNotification(`Status atualizado para ${selectedStatus.name}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro ao atualizar status', 'error');
        } finally {
            setUpdatingStatus(false);
            fetchHistory();
        }
    };

    const handlePriorityChange = async (newPriority: string) => {
        if (!ticket) return;

        setUpdatingPriority(true);
        try {
            await updateTicket(ticket.id, {
                priority: newPriority
            });

            setTicket({
                ...ticket,
                priority: newPriority
            });

            showNotification(`Prioridade atualizada para ${newPriority.toUpperCase()}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro ao atualizar prioridade', 'error');
        } finally {
            setUpdatingPriority(false);
            fetchHistory();
        }
    };

    const handleCategoryChange = async (categoryId: number) => {
        if (!ticket) return;

        // Find category name for notification and history
        const findCategory = (cats: Category[], id: number): Category | undefined => {
            for (const cat of cats) {
                if (cat.id === id) return cat;
                if (cat.subcategories) {
                    const found = findCategory(cat.subcategories, id);
                    if (found) return found;
                }
            }
        };
        const selectedCat = findCategory(allCategories, categoryId);
        if (!selectedCat) return;

        setUpdatingCategory(true);
        try {
            await updateTicket(ticket.id, {
                category_id: selectedCat.id
            });

            setTicket({
                ...ticket,
                category_id: selectedCat.id,
                category: selectedCat
            });
            setCategory(selectedCat);

            showNotification(`Categoria atualizada para ${selectedCat.name}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro ao atualizar categoria', 'error');
        } finally {
            setUpdatingCategory(false);
            fetchHistory();
        }
    };

    const handleCloseTicket = async () => {
        if (!ticket) return;

        const confirmed = await askConfirm({
            title: 'Encerrar Ticket',
            message: 'Deseja marcar este ticket como concluído?',
            type: 'info'
        });

        if (!confirmed) return;

        // Tenta encontrar um status que pareça "Concluído"
        const closedStatus = statuses.find(s =>
            ['concluído', 'concluido', 'fechado', 'closed', 'finalizado', 'resolvido'].includes(s.name.toLowerCase())
        ) || statuses[statuses.length - 1]; // Fallback: último status da lista (geralmente o final do fluxo)

        if (closedStatus) {
            handleStatusChange(closedStatus.id.toString());
        } else {
            showNotification('Nenhum status de conclusão encontrado.', 'warning');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const { url } = await uploadFile(file);
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');

            let markdown = '';
            if (isImage) {
                markdown = `\n\n![Anexo - ${file.name}](${url})\n\n`;
            } else if (isVideo) {
                markdown = `\n\n<video src="${url}" controls className="w-full rounded-2xl border border-border-theme my-4" />\n\n`;
            } else {
                markdown = `\n\n[📂 **Download de Arquivo:** ${file.name}](${url})\n\n`;
            }

            setNewInfoContent(prev => prev + markdown);
            showNotification('Arquivo anexado!', 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro no upload', 'error');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleImageInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        setUploadingImage(true);
        try {
            const { url } = await uploadFile(file);
            const markdownImage = `\n![img](${url})\n`;

            const textarea = infoDescriptionRef.current;
            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const val = newInfoContent;
                const newVal = val.substring(0, start) + markdownImage + val.substring(end);
                setNewInfoContent(newVal);
            } else {
                setNewInfoContent(prev => prev + markdownImage);
            }
            showNotification('Imagem inserida!', 'success');
        } catch (error) {
            console.error(error);
            showNotification('Erro no upload da imagem', 'error');
        } finally {
            setUploadingImage(false);
            e.target.value = '';
        }
    };

    const handleAddInfo = async () => {
        if (!ticket || !newInfoContent.trim()) return;

        setPerformingAction(true);
        try {
            const timestamp = new Date().toLocaleString();
            // Formato simples e robusto com o separador que o renderizador usa para quebrar em blocos
            const separator = `\n\n---\n\n`;
            const header = `### 📝 INFORMAÇÃO ADICIONADA EM ${timestamp.toUpperCase()}\n\n`;
            const updatedDescription = ticket.description + separator + header + newInfoContent.trim();

            await updateTicket(ticket.id, { description: updatedDescription });
            setTicket({ ...ticket, description: updatedDescription });

            showNotification('Informação adicionada com sucesso!', 'success');
            setIsInfoModalOpen(false);
            setNewInfoContent('');
            fetchHistory();
        } catch (error) {
            console.error(error);
            showNotification('Erro ao adicionar informação', 'error');
        } finally {
            setPerformingAction(false);
        }
    };

    const handleTransferTicket = async () => {
        if (!ticket || !targetAttendantId) return;

        setPerformingAction(true);
        try {
            const attendantId = parseInt(targetAttendantId);
            const attendant = attendants.find(a => a.id === attendantId);

            await updateTicket(ticket.id, {
                assigned_user_id: attendantId
            });

            // Atualiza o estado local do ticket
            setTicket({
                ...ticket,
                assigned_user_id: attendantId,
                assigned_user: attendant ? {
                    ...ticket.assigned_user,
                    id: attendant.id,
                    username: attendant.name,
                    full_name: attendant.name,
                    is_active: ticket.assigned_user?.is_active || true,
                    created_at: ticket.assigned_user?.created_at || new Date().toISOString()
                } : ticket.assigned_user
            } as Ticket);

            showNotification(`Ticket transferido para ${attendant?.name}`, 'success');
            setIsTransferModalOpen(false);
            fetchHistory();
        } catch (error) {
            console.error(error);
            showNotification('Erro ao transferir ticket', 'error');
        } finally {
            setPerformingAction(false);
        }
    };

    const openTransferModal = async () => {
        setIsTransferModalOpen(true);
        try {
            const data = await getAttendants();
            setAttendants(data);
            if (ticket?.assigned_user_id) {
                setTargetAttendantId(ticket.assigned_user_id.toString());
            }
        } catch (error) {
            console.error(error);
        }
    };

    const getStatusStyle = (statusObj?: Status, statusName?: string) => {
        if (statusObj) return { color: statusObj.color };

        const found = statuses.find(s => s.name === statusName);
        if (found) return { color: found.color };

        return { color: '#9ca3af' }; // gray-400 fallback
    };

    const currentStatusStyle = getStatusStyle(ticket?.status_obj, ticket?.status);

    const priorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'bg-red-500 text-white shadow-lg shadow-red-500/30';
            case 'high': return 'bg-orange-500 text-white shadow-lg shadow-orange-500/30';
            case 'medium': return 'bg-blue-500 text-white shadow-lg shadow-blue-500/30';
            case 'low': return 'bg-green-500 text-white shadow-lg shadow-green-500/30';
            default: return 'bg-gray-500 text-white';
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-20" />
                <p className="text-gray-500 text-xs font-black uppercase tracking-widest animate-pulse">Carregando Detalhes...</p>
            </div>
        );
    }

    if (!ticket) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 animate-bounce">
                    <AlertCircle className="w-12 h-12 text-red-500" />
                </div>
                <h1 className="text-2xl font-black uppercase tracking-tight italic">Ticket não encontrado</h1>
                <Link href="/tickets" className="px-8 py-4 rounded-2xl bg-background border border-border-theme hover:bg-white/5 transition-all font-bold text-xs uppercase tracking-widest">
                    Voltar para Listagem
                </Link>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Top Navigation */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="group flex items-center gap-3 px-6 py-3 rounded-xl hover:bg-white/5 transition-all text-gray-500 hover:text-foreground"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Voltar</span>
                    </button>

                    <div className="flex items-center gap-4">
                        <CustomSelect
                            value={ticket.status_id || ''}
                            onChange={handleStatusChange}
                            options={statuses.map(s => ({
                                value: s.id,
                                label: s.name,
                                icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />,
                                className: "text-[10px] font-black uppercase tracking-widest"
                            }))}
                            placeholder="Status..."
                            className="w-[180px] !space-y-0"
                        />

                        <CustomSelect
                            value={ticket.priority}
                            onChange={handlePriorityChange}
                            options={[
                                { value: 'low', label: 'BAIXA', icon: <Flag className="w-3 h-3 text-green-500" /> },
                                { value: 'medium', label: 'MÉDIA', icon: <Flag className="w-3 h-3 text-blue-500" /> },
                                { value: 'high', label: 'ALTA', icon: <Flag className="w-3 h-3 text-orange-500" /> },
                                { value: 'critical', label: 'CRÍTICA', icon: <Flag className="w-3 h-3 text-red-500" /> }
                            ]}
                            placeholder="Prioridade..."
                            className="w-[160px] !space-y-0"
                        />
                    </div>
                </div>

                {/* Main Header Card */}
                <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-1000">
                        <Paperclip className="w-32 h-32" />
                    </div>

                    <div className="relative space-y-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 text-accent-theme font-mono text-xs">
                                <span>#{ticket.id}</span>
                                <span className="w-1 h-1 rounded-full bg-border-theme" />
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight uppercase italic leading-tight max-w-3xl">
                                {ticket.title}
                            </h1>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            <button
                                onClick={handleClientClick}
                                className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30 hover:bg-white/5 hover:border-accent-theme/30 transition-all text-left group/client"
                            >
                                <div className="w-14 h-14 rounded-2xl premium-gradient flex items-center justify-center text-white shadow-xl group-hover/client:scale-110 transition-transform">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 group-hover/client:text-accent-theme transition-colors">Solicitante</p>
                                    <p className="font-bold text-lg">{client?.name || 'Cliente Desconhecido'}</p>
                                    <p className="text-xs text-gray-500">{client?.email || 'Sem e-mail'}</p>
                                </div>
                            </button>

                            <div className="flex items-center gap-5 p-5 rounded-3xl bg-background/40 border border-border-theme/30">
                                <div className="w-14 h-14 rounded-2xl bg-accent-theme/10 border border-accent-theme/20 flex items-center justify-center text-accent-theme shadow-xl">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-1">Criado Por</p>
                                    <p className="font-bold text-lg">
                                        {ticket.created_by?.full_name || ticket.created_by?.username || 'Sistema'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Description Area */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                        {/* Tabs Switcher */}
                        <div className="flex p-1.5 bg-background/40 backdrop-blur-xl border border-border-theme/30 rounded-[2rem] w-fit">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={clsx(
                                    "flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'details'
                                        ? "bg-foreground text-background shadow-lg shadow-white/5"
                                        : "text-gray-500 hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <Info className="w-4 h-4" />
                                Detalhes
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={clsx(
                                    "flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'history'
                                        ? "bg-foreground text-background shadow-lg shadow-white/5"
                                        : "text-gray-500 hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <History className="w-4 h-4" />
                                Histórico
                                {history.length > 0 && (
                                    <span className="bg-accent-theme text-foreground px-1.5 py-0.5 rounded-md text-[8px] ml-1">
                                        {history.length}
                                    </span>
                                )}
                            </button>
                        </div>

                        <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-lg min-h-[500px] flex-1 transition-all duration-500">
                            {activeTab === 'details' ? (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center gap-3 pb-6 mb-8 text-[10px] font-black uppercase tracking-widest text-gray-400 sticky top-0 bg-transparent z-20 -mt-10 pt-10">
                                        <MessageSquare className="w-4 h-4 text-accent-theme" />
                                        Descrição Técnica e Detalhes
                                    </div>

                                    <div className="space-y-8 pr-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                                        {(function renderFormattedDescription() {
                                            const parts = ticket.description.split(/\n\s*---\s*\n/);
                                            // Guardamos qual é a parte original (a primeira da string original)
                                            const originalPart = parts[0];

                                            // Revertemos para mostrar o mais recente em cima
                                            const reversedParts = [...parts].reverse();

                                            return reversedParts.map((part, index) => {
                                                const isOriginal = part === originalPart;

                                                if (isOriginal) {
                                                    // Descrição Original (agora no final se houver updates, ou única)
                                                    return (
                                                        <div key={index} className="relative group/original">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <span className="text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 bg-white/5 text-gray-400 rounded-md border border-white/10">Descrição Inicial</span>
                                                            </div>
                                                            <div className="prose prose-invert prose-p:text-gray-300 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-accent-theme prose-img:rounded-2xl prose-img:shadow-2xl prose-img:border prose-img:border-border-theme max-w-none">
                                                                <ReactMarkdown>{part}</ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                // Blocos Adicionais (Updates)
                                                return (
                                                    <div key={index} className="relative group/update">
                                                        <div className="absolute -left-4 inset-y-0 w-1 bg-accent-theme rounded-full opacity-50 group-hover/update:opacity-100 transition-opacity" />
                                                        <div className="glass-card p-8 rounded-[1.5rem] border border-accent-theme/20 bg-accent-theme/5 shadow-xl shadow-accent-theme/5">
                                                            <div className="prose prose-invert prose-p:text-foreground/80 prose-headings:text-accent-theme prose-headings:italic prose-headings:mt-0 prose-strong:text-foreground prose-a:text-accent-theme prose-img:rounded-xl max-w-none">
                                                                <ReactMarkdown>{part}</ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center gap-3 pb-6 mb-8 text-[10px] font-black uppercase tracking-widest text-gray-400 sticky top-0 bg-transparent z-20 -mt-10 pt-10">
                                        <History className="w-4 h-4 text-accent-theme" />
                                        Linha do Tempo de Alterações
                                    </div>

                                    {loadingHistory && history.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-30">
                                            <Loader2 className="w-10 h-10 animate-spin" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Carregando Histórico...</p>
                                        </div>
                                    ) : history.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-20 italic">
                                            <History className="w-16 h-16" />
                                            <p className="text-sm">Nenhuma alteração registrada ainda.</p>
                                        </div>
                                    ) : (
                                        <div className="relative pl-8 pr-4 space-y-10 max-h-[600px] overflow-y-auto custom-scrollbar before:absolute before:inset-y-0 before:left-[11px] before:w-0.5 before:bg-border-theme/30">
                                            {history.map((event, idx) => (
                                                <div key={event.id} className="relative group/item">
                                                    {/* Timeline Point */}
                                                    <div className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-full bg-background border-2 border-accent-theme shadow-[0_0_10px_rgba(var(--accent-rgb),0.3)] z-10 group-hover/item:scale-125 transition-transform duration-300" />

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-accent-theme/10 text-accent-theme rounded-lg border border-accent-theme/20">
                                                                    {(function translate(type: string, desc: string): string {
                                                                        const t = type.toUpperCase();
                                                                        if (t === 'DESCRIPTION_CHANGE') {
                                                                            return desc.includes('Adicionada nova informação') ? 'NOVA INFORMAÇÃO' : 'DESCRIÇÃO ATUALIZADA';
                                                                        }
                                                                        const map: Record<string, string> = {
                                                                            'STATUS_CHANGE': 'MUDANÇA DE STATUS',
                                                                            'PRIORITY_CHANGE': 'MUDANÇA DE PRIORIDADE',
                                                                            'CATEGORY_ID_CHANGE': 'MUDANÇA DE CATEGORIA',
                                                                            'ASSIGNED_USER_CHANGE': 'TROCA DE TÉCNICO'
                                                                        };
                                                                        return map[t] || t.replaceAll('_', ' ');
                                                                    })(event.event_type, event.description)}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-500 bg-white/5 px-2.5 py-1 rounded-lg">
                                                                    {new Date(event.created_at).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                                                                <User className="w-3.5 h-3.5 text-accent-theme/50" />
                                                                {event.user?.full_name || event.user?.username || 'Sistema'}
                                                            </div>
                                                        </div>
                                                        <p className="text-sm text-gray-300 font-medium leading-relaxed pl-1">
                                                            {event.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6 lg:pt-[82px]">
                        {/* Ações Rápidas */}
                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme space-y-6">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Ações Rápidas</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => setIsInfoModalOpen(true)}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-accent-theme text-foreground hover:bg-accent-theme/90 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Plus className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Informação</span>
                                    </div>
                                </button>

                                <button
                                    onClick={openTransferModal}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-border-theme hover:bg-white/10 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <Send className="w-4 h-4 text-gray-500 group-hover:text-accent-theme transition-colors font-shadow-none" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-foreground transition-colors font-shadow-none">Transferir Ticket</span>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(window.location.href);
                                        showNotification('Link do ticket copiado!', 'info');
                                    }}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-border-theme hover:bg-white/10 transition-all group"
                                >
                                    <div className="flex items-center gap-3 border-none shadow-none">
                                        <Paperclip className="w-4 h-4 text-gray-500 group-hover:text-accent-theme transition-colors shadow-none" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-foreground transition-colors shadow-none">Copiar Link</span>
                                    </div>
                                </button>

                                <button
                                    onClick={handleCloseTicket}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all group mt-2"
                                >
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Encerrar Ticket</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme space-y-6 relative z-20">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Classificação</h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme/50 mb-3">Categoria / Setor</p>
                                    <CategorySelect
                                        value={ticket.category_id || ''}
                                        onChange={handleCategoryChange}
                                        categories={allCategories}
                                        placeholder="Selecionar Categoria..."
                                        className="!space-y-0"
                                        icon={<Tag className="w-4 h-4" />}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme relative z-10">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6">Metadados</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Criado em:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">{new Date(ticket.created_at).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Última atualização:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">
                                        {history.length > 0
                                            ? new Date(history[0].created_at).toLocaleString()
                                            : new Date(ticket.updated_at || ticket.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Atribuído a:</span>
                                    <span className="font-bold text-accent-theme truncate max-w-[120px] text-right">
                                        {ticket?.assigned_user?.full_name || ticket?.assigned_user?.username || 'Sistema'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal de Detalhes do Cliente */}
                {
                    (isClientModalOpen || isClosingClientModal) && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <div
                                className={clsx(
                                    "absolute inset-0 bg-background/80 backdrop-blur-sm",
                                    isClosingClientModal ? "animate-fade-out" : "animate-fade-in"
                                )}
                                onClick={closeClientModal}
                            />

                            <div
                                className={clsx(
                                    "relative w-full max-w-2xl glass-card rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden",
                                    isClosingClientModal ? "animate-modal-out" : "animate-modal-in"
                                )}
                                onAnimationEnd={(e) => {
                                    if (e.animationName === 'modal-out') {
                                        setIsClosingClientModal(false);
                                        setIsClientModalOpen(false);
                                    }
                                }}
                            >
                                {/* Header do Modal */}
                                <div className="premium-gradient p-8 text-white relative">
                                    <button
                                        onClick={closeClientModal}
                                        className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
                                    >
                                        <ArrowLeft className="w-5 h-5 rotate-90" />
                                    </button>
                                    <div className="flex items-center gap-6">
                                        <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <User className="w-10 h-10" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black uppercase italic tracking-tight">{client?.name}</h2>
                                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-1">Perfil do Cliente</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    {/* Informações Cadastrais */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">E-mail</p>
                                            <p className="text-sm font-medium">{client?.email || 'N/A'}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">CPF / CNPJ</p>
                                            <p className="text-sm font-medium">{client?.cpf_cnpj || 'N/A'}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Telefone</p>
                                            <p className="text-sm font-medium">{client?.phone || 'N/A'}</p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-border-theme">
                                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Desde</p>
                                            <p className="text-sm font-medium">{client?.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}</p>
                                        </div>
                                    </div>

                                    {/* Histórico de Chamados */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme flex items-center gap-2">
                                                <Clock className="w-3 h-3" />
                                                Últimos Chamados
                                            </h3>
                                            {loadingClientTickets && <Loader2 className="w-4 h-4 animate-spin text-accent-theme" />}
                                        </div>

                                        <div className="space-y-3">
                                            {clientTickets.length > 0 ? (
                                                clientTickets.map(t => {
                                                    const statusColor = t.status_obj?.color || '#9ca3af';
                                                    return (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => {
                                                                closeClientModal();
                                                                setTimeout(() => {
                                                                    router.push(`/tickets/${t.id}`);
                                                                }, 400);
                                                            }}
                                                            className="w-full p-4 rounded-2xl bg-background border border-border-theme hover:bg-white/5 transition-all flex items-center justify-between text-left group"
                                                        >
                                                            <div className="space-y-1">
                                                                <p className="text-xs font-bold group-hover:text-accent-theme transition-colors line-clamp-1">{t.title}</p>
                                                                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                                                    <span>#{t.id}</span>
                                                                    <span className="w-1 h-1 rounded-full bg-border-theme" />
                                                                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                            </div>
                                                            <span
                                                                className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border shrink-0 ml-4"
                                                                style={{
                                                                    color: statusColor,
                                                                    borderColor: `${statusColor}30`,
                                                                    backgroundColor: `${statusColor}10`
                                                                }}
                                                            >
                                                                {t.status}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            ) : !loadingClientTickets && (
                                                <p className="text-center py-8 text-gray-500 text-xs italic">Nenhum outro chamado encontrado.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-6 border-t border-border-theme flex justify-end">
                                    <button
                                        onClick={closeClientModal}
                                        className="px-8 py-3 rounded-xl bg-background border border-border-theme text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                {/* Modal Adicionar Informação */}
                {isInfoModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={() => !performingAction && setIsInfoModalOpen(false)} />
                        <div className="relative w-full max-w-2xl glass-card rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden animate-modal-in">
                            <div className="premium-gradient p-8 text-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                        <MessageSquare className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-2xl font-black uppercase italic">Adicionar Informação</h2>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">O que você deseja adicionar?</label>
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('info-image-insert')?.click()}
                                            disabled={uploadingImage}
                                            className="text-[9px] font-black uppercase tracking-widest text-accent-theme hover:brightness-125 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                                            {uploadingImage ? 'INSERINDO...' : 'INSERIR IMAGEM NO TEXTO'}
                                        </button>
                                        <input
                                            id="info-image-insert"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleImageInsert}
                                        />
                                    </div>
                                    <textarea
                                        ref={infoDescriptionRef}
                                        value={newInfoContent}
                                        onChange={(e) => setNewInfoContent(e.target.value)}
                                        placeholder="Digite aqui as informações adicionais..."
                                        className="w-full bg-background/50 border border-border-theme rounded-3xl p-6 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[200px] transition-all font-bold placeholder:font-normal"
                                    />
                                </div>

                                <div className="flex items-center gap-4">
                                    <input
                                        type="file"
                                        id="file-upload"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={uploadingFile || performingAction}
                                    />
                                    <label
                                        htmlFor="file-upload"
                                        className={clsx(
                                            "flex items-center gap-2 px-6 py-3 rounded-xl border border-border-theme text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-white/5 transition-all",
                                            (uploadingFile || performingAction) && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                                        Anexar Qualquer Arquivo
                                    </label>
                                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Suporta Excel, Vídeos, Documentos e mais</span>
                                </div>
                            </div>
                            <div className="p-8 border-t border-border-theme flex justify-end gap-4">
                                <button
                                    onClick={() => setIsInfoModalOpen(false)}
                                    className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAddInfo}
                                    disabled={performingAction || !newInfoContent.trim()}
                                    className="px-10 py-4 rounded-2xl bg-accent-theme text-foreground text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                    {performingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                    Salvar e Atualizar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Transferir Ticket */}
                {isTransferModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in" onClick={() => !performingAction && setIsTransferModalOpen(false)} />
                        <div className="relative w-full max-w-md glass-card rounded-[3rem] border border-border-theme shadow-2xl overflow-hidden animate-modal-in">
                            <div className="premium-gradient p-8 text-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                        <UserPlus className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-2xl font-black uppercase italic">Transferir Ticket</h2>
                                </div>
                            </div>
                            <div className="p-8 space-y-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                        <User className="w-3 h-3 text-accent-theme" />
                                        Novo Atendente Responsável
                                    </label>
                                    <CustomSelect
                                        value={targetAttendantId}
                                        onChange={setTargetAttendantId}
                                        placeholder="Selecionar atendente..."
                                        options={attendants.map(a => ({
                                            value: a.id,
                                            label: a.name,
                                            icon: <User className="w-3 h-3" />
                                        }))}
                                    />
                                </div>

                                <div className="space-y-3 opacity-50">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                        <Briefcase className="w-3 h-3 text-accent-theme" />
                                        Novo Setor (Em breve)
                                    </label>
                                    <div className="w-full p-4 rounded-2xl bg-white/5 border border-border-theme text-[10px] font-bold uppercase text-gray-500 italic">
                                        Funcionalidade de setores em desenvolvimento
                                    </div>
                                </div>
                            </div>
                            <div className="p-8 border-t border-border-theme flex justify-end gap-4">
                                <button
                                    onClick={() => setIsTransferModalOpen(false)}
                                    className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleTransferTicket}
                                    disabled={performingAction || !targetAttendantId}
                                    className="px-10 py-4 rounded-2xl bg-foreground text-background text-[10px] font-black uppercase tracking-widest hover:bg-foreground/90 transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                    {performingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Confirmar Transferência
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main >
    );
}
