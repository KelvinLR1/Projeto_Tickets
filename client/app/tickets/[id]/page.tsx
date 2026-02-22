'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTicket, Ticket, getCategories, Category, getClients, getClient, Client, getTickets, getStatuses, Status, updateTicket, getTicketHistory, TicketHistory, getAttendants, uploadFile, getSectors, Sector, followTicket, unfollowTicket, getTicketTimerStats, StatusTimeGroup } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowLeft, Clock, AlertCircle, CheckCircle, User, Tag, Calendar, Paperclip, MessageSquare, ShieldCheck, ChevronDown, History, Info, Send, UserPlus, Briefcase, Plus, Image as ImageIcon, FileText, X, PlayCircle, Download, ZoomIn, Users, MapPin, Phone, Mail, Package, CreditCard, Building2, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import clsx from 'clsx';
import { useNotification } from '@/components/NotificationProvider';
import CustomSelect from '@/components/CustomSelect';
import CategorySelect from '@/components/CategorySelect';
import { useTimer } from '@/components/TimerProvider';
import { useAuth } from '@/components/AuthProvider';
import { Flag, Play, Pause } from 'lucide-react';

export default function TicketDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const { showNotification, confirm: askConfirm } = useNotification();
    const { user } = useAuth();
    const { activeTimers, handleStartTimer, handleStopTimer } = useTimer();

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [loading, setLoading] = useState(true);
    const [client, setClient] = useState<Client | null>(null);
    const [category, setCategory] = useState<Category | null>(null);
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [isUpdatingSector, setIsUpdatingSector] = useState(false);

    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isClosingClientModal, setIsClosingClientModal] = useState(false);
    const [clientTickets, setClientTickets] = useState<Ticket[]>([]);
    const [loadingClientTickets, setLoadingClientTickets] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [updatingPriority, setUpdatingPriority] = useState(false);
    const [updatingCategory, setUpdatingCategory] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'history' | 'timer'>('details');
    const [timerStats, setTimerStats] = useState<StatusTimeGroup[]>([]);
    const [loadingTimerStats, setLoadingTimerStats] = useState(false);
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
    const [targetSectorId, setTargetSectorId] = useState<string>('');
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [loadingAttendants, setLoadingAttendants] = useState(false);
    const [isAddFollowerModalOpen, setIsAddFollowerModalOpen] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<any[]>([]);
    const canManage = ticket?.assigned_user_id === user?.id || user?.role === 'ADMIN' || user?.role === 'ROOT';
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const infoDescriptionRef = React.useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isTransferModalOpen) {
            const fetchFilteredAttendants = async () => {
                setLoadingAttendants(true);
                try {
                    const sectorId = targetSectorId === '' ? undefined : parseInt(targetSectorId);
                    const data = await getAttendants(sectorId);
                    setAttendants(data);

                    // If current target attendant is not in the new list, clear it
                    if (targetAttendantId && !data.find(a => a.id.toString() === targetAttendantId)) {
                        setTargetAttendantId('');
                    }
                } catch (error) {
                    console.error('Error fetching attendants:', error);
                } finally {
                    setLoadingAttendants(false);
                }
            };
            fetchFilteredAttendants();
        }
    }, [targetSectorId, isTransferModalOpen]);

    useEffect(() => {
        if (params.id) {
            loadData();
        }
    }, [params.id]);

    const formatDuration = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const data = await getTicketHistory(parseInt(params.id as string));
            setHistory(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchTimerStats = async () => {
        setLoadingTimerStats(true);
        try {
            const data = await getTicketTimerStats(parseInt(params.id as string));
            setTimerStats(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingTimerStats(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history') fetchHistory();
        if (activeTab === 'timer') fetchTimerStats();
    }, [activeTab]);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const ticketId = parseInt(params.id as string);

            const [ticketData, statusesRaw, categoriesRaw, sectorsData] = await Promise.all([
                getTicket(ticketId),
                getStatuses(),
                getCategories(),
                getSectors()
            ]);

            setSectors(sectorsData);

            // Se o ticket tem setor, busca status e categorias específicos
            let statusesData = statusesRaw;
            let categoriesData = categoriesRaw;

            if (ticketData.sector_id) {
                const [sData, cData] = await Promise.all([
                    getStatuses(ticketData.sector_id),
                    getCategories(ticketData.sector_id)
                ]);
                statusesData = sData;
                categoriesData = cData;
            }

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

            // Carrega histórico e estatísticas se necessário
            if (activeTab === 'history') fetchHistory();
            if (activeTab === 'timer') fetchTimerStats();

        } catch (error) {
            console.error('Failed to load ticket details:', error);
            showNotification('Erro ao carregar detalhes', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    };



    const fetchAvailableUsers = async () => {
        try {
            const allUsers = await getAttendants(); // Reusing getAttendants to get simple user list
            // Filter out users who are already following
            const currentFollowerIds = ticket?.followers?.map(f => f.id) || [];
            // Also filter out the assigned user (can't follow own ticket largely redundant but good for UI)
            // AND filter out the current user if they are the assigned one (which they must be to see this)
            const filtered = allUsers.filter(u => !currentFollowerIds.includes(u.id) && u.id !== ticket?.assigned_user_id);
            setAvailableUsers(filtered);
        } catch (error) {
            console.error('Error fetching users:', error);
            showNotification('Erro ao buscar usuários', 'error');
        }
    };

    const handleOpenAddFollowerModal = () => {
        fetchAvailableUsers();
        setIsAddFollowerModalOpen(true);
        setSelectedUserId('');
    };

    const handleAddFollower = async () => {
        if (!ticket || !selectedUserId) return;
        setPerformingAction(true);
        try {
            const updatedTicket = await followTicket(ticket.id, parseInt(selectedUserId));
            setTicket(updatedTicket);
            showNotification('Acompanhante adicionado com sucesso.', 'success');
            setIsAddFollowerModalOpen(false);
            fetchHistory();
        } catch (error) {
            console.error(error);
            showNotification('Erro ao adicionar acompanhante.', 'error');
        } finally {
            setPerformingAction(false);
        }
    };

    const handleRemoveFollower = async (followerId: number) => {
        if (!ticket) return;
        if (!await askConfirm({
            title: 'Remover Acompanhante',
            message: 'Tem certeza que deseja remover este acompanhante?',
            type: 'danger',
            confirmText: 'Remover',
            cancelText: 'Cancelar'
        })) return;

        setPerformingAction(true);
        try {
            const updatedTicket = await unfollowTicket(ticket.id, followerId);
            setTicket(updatedTicket);
            showNotification('Acompanhante removido com sucesso.', 'success');
            fetchHistory();
        } catch (error) {
            console.error(error);
            showNotification('Erro ao remover acompanhante.', 'error');
        } finally {
            setPerformingAction(false);
        }
    };

    const handleFollowToggle = async () => {
        if (!ticket || !user) return;
        setPerformingAction(true);
        try {
            const isFollowing = ticket.followers?.some(f => f.id === user.id);
            const updatedTicket = isFollowing
                ? await unfollowTicket(ticket.id)
                : await followTicket(ticket.id);

            setTicket(updatedTicket);
            showNotification(
                isFollowing ? "Você deixou de acompanhar este ticket." : "Você agora está acompanhando este ticket.",
                "success"
            );
            fetchHistory();
        } catch (error) {
            console.error(error);
            showNotification("Erro ao processar ação de acompanhamento.", "error");
        } finally {
            setPerformingAction(false);
        }
    };

    const handleSelfAssignment = async () => {
        if (!user || !ticket) return;
        setPerformingAction(true);
        try {
            await updateTicket(ticket.id, { assigned_user_id: user.id });
            showNotification("Ticket atribuído a você com sucesso!", "success");
            await loadData(); // Refresh ticket and history
        } catch (error) {
            showNotification("Erro ao se vincular ao ticket.", "error");
        } finally {
            setPerformingAction(false);
        }
    };


    const loadClientTickets = async (clientId: number) => {
        setLoadingClientTickets(true);
        try {
            const tickets = await getTickets({ clientId });
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

        // Find category for notification and history
        const findCat = (cats: Category[], id: number): Category | undefined => {
            for (const cat of cats) {
                if (cat.id === id) return cat;
                if (cat.subcategories) {
                    const found = findCat(cat.subcategories, id);
                    if (found) return found;
                }
            }
        };
        const selectedCat = findCat(allCategories, categoryId);
        if (!selectedCat) return;

        setUpdatingCategory(true);
        try {
            await updateTicket(ticket.id, {
                category_id: selectedCat.id
            });

            setTicket({
                ...ticket,
                category_id: selectedCat.id
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

    const handleSectorChange = async (newSectorId: string) => {
        if (!ticket) return;

        const sId = newSectorId === '' ? null : parseInt(newSectorId);
        setIsUpdatingSector(true);
        try {
            await updateTicket(ticket.id, {
                sector_id: sId,
                category_id: undefined // Reset category when sector changes as it might not be compatible
            });

            showNotification('Setor atualizado com sucesso!', 'success');
            await loadData(true); // Silent reload to get correct categories/statuses
        } catch (error) {
            console.error(error);
            showNotification('Erro ao atualizar setor', 'error');
        } finally {
            setIsUpdatingSector(false);
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
            } else {
                const type = isVideo ? 'VIDEO' : 'FILE';
                markdown = `\n\n[ATTACHMENT:${type}:${file.name}](${url})\n\n`;
            }

            setNewInfoContent(prev => prev.trim() + markdown);
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
            const separator = `\n\n---\n\n`;
            const header = `### [UPDATE] ${timestamp.toUpperCase()}\n\n`;
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
                assigned_user_id: attendantId,
                sector_id: targetSectorId === '' ? ticket.sector_id : parseInt(targetSectorId)
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
            await loadData(true); // Silent reload to get correct categories/statuses and update UI labels
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
            if (ticket?.sector_id) {
                setTargetSectorId(ticket.sector_id.toString());
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
                                className: "text-xs font-bold"
                            }))}
                            placeholder="Status..."
                            className="w-[240px] !space-y-0"
                            disabled={!canManage}
                        />

                        <CustomSelect
                            value={ticket.priority?.toLowerCase() || ''}
                            onChange={handlePriorityChange}
                            options={[
                                { value: 'baixa', label: 'Baixa', icon: <Flag className="w-3 h-3 text-green-500" /> },
                                { value: 'média', label: 'Média', icon: <Flag className="w-3 h-3 text-blue-500" /> },
                                { value: 'alta', label: 'Alta', icon: <Flag className="w-3 h-3 text-orange-500" /> },
                                { value: 'crítica', label: 'Crítica', icon: <Flag className="w-3 h-3 text-red-500" /> }
                            ]}
                            placeholder="Prioridade..."
                            className="w-[160px] !space-y-0"
                            disabled={!canManage}
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
                                <span>{ticket.id}</span>
                                <span className="w-1 h-1 rounded-full bg-border-theme" />
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight uppercase italic leading-tight max-w-full break-words">
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
                                    <ShieldCheck className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-accent-theme uppercase tracking-widest mb-1 font-shadow-none">Responsável</p>
                                    <p className="font-bold text-lg">
                                        {ticket.assigned_user?.full_name || ticket.assigned_user?.username || 'Não Atribuído'}
                                    </p>
                                </div>
                                {ticket.assigned_user_id === user?.id && (
                                    <div className="flex items-center gap-2">
                                        {activeTimers.some(t => t.ticket_id === ticket.id) ? (
                                            <button
                                                onClick={() => handleStopTimer(ticket.id)}
                                                className="w-12 h-12 rounded-2xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 flex items-center justify-center transition-all active:scale-95 group/timer shadow-lg shadow-orange-500/5"
                                                title="Pausar Cronômetro"
                                            >
                                                <Pause className="w-6 h-6 fill-current" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleStartTimer(ticket.id)}
                                                className="w-12 h-12 rounded-2xl bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 flex items-center justify-center transition-all active:scale-95 group/timer shadow-lg shadow-green-500/5"
                                                title="Iniciar Cronômetro"
                                            >
                                                <Play className="w-6 h-6 fill-current ml-1" />
                                            </button>
                                        )}
                                    </div>
                                )}
                                {!ticket.assigned_user && (
                                    <button
                                        onClick={handleSelfAssignment}
                                        disabled={performingAction}
                                        className="px-4 py-2 bg-accent-theme/10 hover:bg-accent-theme/20 text-accent-theme text-[9px] font-black uppercase tracking-widest rounded-xl border border-accent-theme/30 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        {performingAction ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                                        Me Vincular
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <motion.div layout className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                    {/* Description Area */}
                    <motion.div layout className="lg:col-span-2 flex flex-col gap-6 h-[1px] min-h-full">
                        {/* Tabs Switcher */}
                        <div className="flex p-1.5 bg-background/40 backdrop-blur-xl border border-border-theme/30 rounded-[2rem] w-fit relative">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={clsx(
                                    "relative z-10 flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'details'
                                        ? "text-background"
                                        : "text-gray-500 hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <Info className="w-4 h-4" />
                                Detalhes
                                {activeTab === 'details' && (
                                    <motion.div
                                        layoutId="active-tab"
                                        className="absolute inset-0 bg-foreground rounded-[1.5rem] -z-10 shadow-lg shadow-white/5"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={clsx(
                                    "relative z-10 flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'history'
                                        ? "text-background"
                                        : "text-gray-500 hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <History className="w-4 h-4" />
                                Histórico
                                {history.length > 0 && (
                                    <span className={clsx(
                                        "px-1.5 py-0.5 rounded-md text-[8px] ml-1 transition-colors",
                                        activeTab === 'history' ? "bg-background text-foreground" : "bg-accent-theme text-foreground"
                                    )}>
                                        {history.length}
                                    </span>
                                )}
                                {activeTab === 'history' && (
                                    <motion.div
                                        layoutId="active-tab"
                                        className="absolute inset-0 bg-foreground rounded-[1.5rem] -z-10 shadow-lg shadow-white/5"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('timer')}
                                className={clsx(
                                    "relative z-10 flex items-center gap-2.5 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all",
                                    activeTab === 'timer'
                                        ? "text-background"
                                        : "text-gray-500 hover:text-foreground hover:bg-white/5"
                                )}
                            >
                                <Clock className="w-4 h-4" />
                                Cronômetro
                                {activeTab === 'timer' && (
                                    <motion.div
                                        layoutId="active-tab"
                                        className="absolute inset-0 bg-foreground rounded-[1.5rem] -z-10 shadow-lg shadow-white/5"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </button>
                        </div>

                        <motion.div layout className="glass-card px-10 py-6 rounded-[2.5rem] border border-border-theme shadow-lg min-h-[500px] flex-1 flex flex-col min-h-0 overflow-hidden">
                            <AnimatePresence mode="wait">
                                {activeTab === 'details' ? (
                                    <motion.div
                                        key="details"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex-1 flex flex-col min-h-0"
                                    >
                                        <div className="flex items-center gap-3 pb-6 mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400 sticky top-0 bg-transparent z-20 -mt-6 pt-6">
                                            <MessageSquare className="w-4 h-4 text-accent-theme" />
                                            Descrição Técnica e Detalhes
                                        </div>

                                        <div className="space-y-8 pr-4 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                            {(function renderFormattedDescription() {
                                                const parts = ticket.description.split(/\n\s*---\s*\n/);
                                                const originalPart = parts[0];
                                                const reversedParts = [...parts].reverse();

                                                // Custom component for ReactMarkdown to handle premium attachments
                                                const MarkdownComponents = {
                                                    a: ({ href, children }: any) => {
                                                        const content = String(children);
                                                        if (content.startsWith('ATTACHMENT:')) {
                                                            const [_, type, filename] = content.split(':');
                                                            const isVideo = type === 'VIDEO';

                                                            return (
                                                                <a
                                                                    href={href}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-4 p-5 rounded-[1.5rem] bg-white/[0.03] border border-white/5 hover:bg-white/5 hover:border-accent-theme/30 transition-all group/attach my-6 no-underline"
                                                                >
                                                                    <span className="w-14 h-14 rounded-2xl bg-accent-theme/10 flex items-center justify-center text-accent-theme group-hover/attach:scale-110 transition-transform shadow-lg shadow-accent-theme/5">
                                                                        {isVideo ? <PlayCircle className="w-7 h-7" /> : <FileText className="w-7 h-7" />}
                                                                    </span>
                                                                    <span className="flex-1 min-w-0">
                                                                        <span className="flex items-center gap-2 mb-1">
                                                                            <span className="text-[9px] font-black text-accent-theme uppercase tracking-[0.2em]">Anexo Disponível</span>
                                                                            <span className="w-1 h-1 rounded-full bg-white/20" />
                                                                            <span className="text-[9px] font-bold text-gray-500 uppercase">{isVideo ? 'VÍDEO' : 'DOCUMENTO'}</span>
                                                                        </span>
                                                                        <span className="text-sm font-black text-foreground truncate group-hover/attach:text-accent-theme transition-colors block">{filename}</span>
                                                                    </span>
                                                                    <span className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover/attach:bg-accent-theme group-hover/attach:text-background transition-all">
                                                                        <Download className="w-4 h-4" />
                                                                    </span>
                                                                </a>
                                                            );
                                                        }
                                                        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-theme hover:underline font-bold"># {children}</a>;
                                                    },
                                                    img: ({ src, alt }: any) => {
                                                        return (
                                                            <motion.span
                                                                initial="initial"
                                                                whileHover="hover"
                                                                className="relative my-6 cursor-zoom-in block w-fit"
                                                                onClick={() => setZoomedImage(src)}
                                                            >
                                                                <motion.img
                                                                    src={src}
                                                                    alt={alt}
                                                                    variants={{
                                                                        initial: { filter: "brightness(1) contrast(1)" },
                                                                        hover: { filter: "brightness(0.7) contrast(1.1)" }
                                                                    }}
                                                                    transition={{ duration: 0.3 }}
                                                                    className="max-h-[300px] w-auto rounded-2xl shadow-xl border border-white/5"
                                                                />
                                                            </motion.span>
                                                        );
                                                    }
                                                };

                                                return reversedParts.map((part, index) => {
                                                    const isOriginal = part === originalPart;

                                                    if (isOriginal) {
                                                        return (
                                                            <div key={index} className="relative group/original">
                                                                <div className="flex items-center gap-3 mb-8">
                                                                    <div className="w-8 h-8 rounded-lg bg-accent-theme/10 flex items-center justify-center border border-accent-theme/20">
                                                                        <ShieldCheck className="w-4 h-4 text-accent-theme" />
                                                                    </div>
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-theme/60">Descrição Principal</span>
                                                                    <div className="flex-1 h-px bg-white/5" />
                                                                </div>
                                                                <div className="prose prose-invert prose-p:text-gray-300 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-accent-theme prose-img:rounded-3xl prose-img:shadow-2xl prose-img:border prose-img:border-white/5 max-w-full break-words overflow-hidden">
                                                                    <ReactMarkdown components={MarkdownComponents}>{part}</ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    // Parse header for additional info
                                                    // Support both old and new header formats for backward compatibility
                                                    const headerMatch = part.match(/### (?:📝 INFORMAÇÃO ADICIONADA EM|\[UPDATE\]) (.*?)\n\n/);
                                                    const cleanPart = headerMatch ? part.replace(headerMatch[0], '') : part;
                                                    const timestamp = headerMatch ? headerMatch[1] : '';

                                                    return (
                                                        <div key={index} className="relative group/update mb-12 last:mb-0">
                                                            <div className="absolute -left-8 inset-y-0 w-1.5 bg-gradient-to-b from-accent-theme to-transparent rounded-full opacity-20 group-hover/update:opacity-100 transition-opacity" />
                                                            <div className="glass-card p-10 rounded-[2.5rem] border border-white/5 bg-white/[0.01] shadow-2xl relative overflow-hidden group-hover/update:border-accent-theme/20 transition-all">
                                                                <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none group-hover/update:scale-110 transition-transform duration-1000">
                                                                    <MessageSquare className="w-32 h-32 rotate-12" />
                                                                </div>

                                                                {timestamp && (
                                                                    <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="w-12 h-12 rounded-2xl bg-accent-theme/10 text-accent-theme flex items-center justify-center shadow-inner">
                                                                                <MessageSquare className="w-6 h-6" />
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-theme/80">Atualização do Técnico</p>
                                                                                <p className="text-sm font-black text-foreground/40">{timestamp}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-gray-500">
                                                                            <Clock className="w-3 h-3" />
                                                                            Novos Dados
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <div className="prose prose-invert prose-p:text-foreground/90 prose-headings:text-accent-theme prose-headings:italic prose-headings:mt-0 prose-strong:text-foreground prose-a:text-accent-theme prose-img:rounded-3xl max-w-full break-words overflow-hidden relative z-10 font-medium">
                                                                    <ReactMarkdown components={MarkdownComponents}>{cleanPart}</ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </motion.div>
                                ) : activeTab === 'history' ? (
                                    <motion.div
                                        key="history"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex-1 flex flex-col min-h-0"
                                    >
                                        <div className="flex items-center gap-3 pb-6 mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400 sticky top-0 bg-transparent z-20 -mt-6 pt-6">
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
                                            <div className="relative pl-8 pr-4 space-y-10 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0">
                                                {history.map((event, idx) => {
                                                    const nextEvent = history[idx + 1];
                                                    const isSameUserAsNext = nextEvent && (
                                                        (nextEvent.user?.id && event.user?.id && nextEvent.user.id === event.user.id) ||
                                                        (!nextEvent.user && !event.user)
                                                    );

                                                    return (
                                                        <div key={event.id} className="relative group/item">
                                                            {/* Line Connector (only if same user) */}
                                                            {isSameUserAsNext && (
                                                                <div className="absolute -left-[19px] top-6 bottom-[-2.5rem] w-0.5 bg-accent-theme/30 rounded-full" />
                                                            )}

                                                            {/* Timeline Point */}
                                                            <div className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-full bg-background border-2 border-accent-theme shadow-[0_0_10px_rgba(var(--accent-rgb),0.3)] z-10 group-hover/item:scale-125 transition-transform duration-300" />

                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between gap-4 min-w-0">
                                                                    <div className="flex items-center gap-3 min-w-0 shrink-0">
                                                                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-accent-theme/10 text-accent-theme rounded-lg border border-accent-theme/20">
                                                                            {(function translate(type: string, desc: string): string {
                                                                                const t = type.toUpperCase();
                                                                                if (t === 'DESCRIPTION_CHANGE') {
                                                                                    return desc.includes('Adicionada nova informação') ? 'NOVA INFORMAÇÃO' : 'DESCRIÇÃO ATUALIZADA';
                                                                                }
                                                                                const map: Record<string, string> = {
                                                                                    'STATUS_CHANGE': 'MUDANÇA DE STATUS',
                                                                                    'PRIORITY_CHANGE': 'MUDANÇA DE PRIORIDADE',
                                                                                    'CATEGORY_CHANGE': 'MUDANÇA DE CATEGORIA',
                                                                                    'CATEGORY_ID_CHANGE': 'MUDANÇA DE CATEGORIA',
                                                                                    'FOLLOW': 'NOVO ACOMPANHANTE',
                                                                                    'UNFOLLOW': 'SAÍDA DE ACOMPANHANTE',

                                                                                    'ASSIGNED_USER_CHANGE': 'TROCA DE TÉCNICO',
                                                                                    'ASSIGNED_USER_ID_CHANGE': 'TROCA DE TÉCNICO',
                                                                                    'SECTOR_CHANGE': 'TRANSFERÊNCIA DE SETOR',
                                                                                    'SECTOR_ID_CHANGE': 'TRANSFERÊNCIA DE SETOR'
                                                                                };
                                                                                return map[t] || t.replaceAll('_', ' ');
                                                                            })(event.event_type, event.description)}
                                                                        </span>
                                                                        <span className="text-[10px] font-bold text-gray-500 bg-white/5 px-2.5 py-1 rounded-lg">
                                                                            {formatDateTime(event.created_at)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 min-w-0 shrink">
                                                                        <User className="w-3.5 h-3.5 text-accent-theme/50" />
                                                                        <span className="truncate">{event.user?.full_name || event.user?.username || 'Sistema'}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-sm text-gray-300 font-medium leading-relaxed pl-1 prose-none max-w-full break-words overflow-hidden">
                                                                    <ReactMarkdown
                                                                        components={{
                                                                            strong: ({ node, ...props }) => (
                                                                                <strong
                                                                                    className="inline-block px-1.5 py-0.5 rounded bg-accent-theme/20 text-accent-theme border border-accent-theme/30 font-bold mx-0.5"
                                                                                    {...props}
                                                                                />
                                                                            )
                                                                        }}
                                                                    >
                                                                        {event.description.replace(/'([^']+)'/g, '**$1**')}
                                                                    </ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="timer"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex-1 flex flex-col min-h-0"
                                    >
                                        <div className="flex items-center justify-between pb-6 mb-4 sticky top-0 bg-transparent z-20 -mt-6 pt-6">
                                            <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                <Clock className="w-4 h-4 text-accent-theme" />
                                                Análise de Tempo por Etapa
                                            </div>
                                            {!loadingTimerStats && timerStats.length > 0 && (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Tempo Total Investido</span>
                                                    <span className="text-sm font-black text-accent-theme tabular-nums">
                                                        {formatDuration(timerStats.reduce((acc, curr) => acc + curr.total_duration, 0))}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {loadingTimerStats ? (
                                            <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-30">
                                                <Loader2 className="w-10 h-10 animate-spin" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">Carregando dados...</p>
                                            </div>
                                        ) : timerStats.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-20 italic">
                                                <Clock className="w-16 h-16" />
                                                <p className="text-sm">Nenhum registro de tempo finalizado.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-6 pr-4 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                                {timerStats.map((group) => (
                                                    <div key={group.status_id} className="glass-card p-10 rounded-[2.5rem] border border-white/5 bg-white/[0.01] shadow-2xl relative overflow-hidden group/timer-card">
                                                        <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none group-hover/timer-card:scale-110 transition-transform duration-1000">
                                                            <Clock className="w-24 h-24 rotate-12" />
                                                        </div>
                                                        <div className="flex items-center justify-between mb-6">
                                                            <div className="flex items-center gap-3">
                                                                <div
                                                                    className="w-3 h-3 rounded-full"
                                                                    style={{ backgroundColor: group.status_color }}
                                                                />
                                                                <span className="text-xs font-black uppercase tracking-wider">{group.status_name}</span>
                                                            </div>
                                                            <div className="px-3 py-1.5 rounded-xl bg-accent-theme/10 border border-accent-theme/20">
                                                                <span className="text-xs font-black text-accent-theme">{formatDuration(group.total_duration)}</span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {group.users.map((userTime) => (
                                                                <div key={userTime.user_id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                                            <User className="w-4 h-4 text-gray-500" />
                                                                        </div>
                                                                        <span className="text-[11px] font-bold text-gray-400">{userTime.full_name}</span>
                                                                    </div>
                                                                    <span className="text-[11px] font-black tabular-nums">{formatDuration(userTime.duration)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </motion.div>

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

                                {canManage && (
                                    <button
                                        onClick={openTransferModal}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-border-theme hover:bg-white/10 transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Send className="w-4 h-4 text-gray-500 group-hover:text-accent-theme transition-colors font-shadow-none" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-foreground transition-colors font-shadow-none">Transferir Ticket</span>
                                        </div>
                                    </button>
                                )}

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



                                {canManage && (
                                    <button
                                        onClick={handleCloseTicket}
                                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all group mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <CheckCircle className="w-4 h-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Encerrar Ticket</span>
                                        </div>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme space-y-6 relative z-20">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Classificação</h3>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme/50 mb-3 font-shadow-none">Setor Responsável</p>
                                    <div className="flex items-center gap-2 py-1 select-none">
                                        <Users className="w-4 h-4 text-accent-theme/70" />
                                        <span className="text-sm font-bold text-foreground/90 uppercase tracking-wide italic">
                                            {ticket.sector?.name || 'Global (Geral)'}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme/50 mb-3 font-shadow-none">Categoria Técnica</p>
                                    <CategorySelect
                                        value={ticket.category_id || ''}
                                        onChange={handleCategoryChange}
                                        categories={allCategories}
                                        placeholder="Selecionar Categoria..."
                                        className="!space-y-0"
                                        icon={<Tag className="w-4 h-4" />}
                                        disabled={!canManage}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-8 rounded-[2rem] border border-border-theme relative z-10">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6">Metadados</h3>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Criado em:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">{formatDateTime(ticket.created_at)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Última atualização:</span>
                                    <span className="font-mono text-[var(--color-text-muted)]">
                                        {history.length > 0
                                            ? formatDateTime(history[0].created_at)
                                            : formatDateTime(ticket.updated_at || ticket.created_at)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Criado por:</span>
                                    <span className="font-bold text-accent-theme truncate max-w-[120px] text-right">
                                        {ticket.created_by?.full_name || ticket.created_by?.username || 'Sistema'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Card de Acompanhantes */}
                        {/* Card de Acompanhantes */}
                        {/* Card de Acompanhantes */}
                        <motion.div layout className="glass-card p-8 rounded-[2rem] border border-border-theme relative z-10">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Acompanhantes</h3>
                                {ticket.assigned_user_id === user?.id ? (
                                    <button
                                        onClick={handleOpenAddFollowerModal}
                                        className="p-1.5 rounded-lg hover:bg-white/5 text-accent-theme transition-colors"
                                        title="Adicionar Acompanhante"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleFollowToggle}
                                        disabled={performingAction}
                                        className={clsx(
                                            "p-1.5 rounded-lg transition-colors flex items-center gap-2 px-3",
                                            ticket.followers?.some(f => f.id === user?.id)
                                                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                                : "bg-accent-theme/10 text-accent-theme hover:bg-accent-theme/20"
                                        )}
                                        title={ticket.followers?.some(f => f.id === user?.id) ? "Deixar de acompanhar" : "Acompanhar este ticket"}
                                    >
                                        {ticket.followers?.some(f => f.id === user?.id) ? (
                                            <>
                                                <X className="w-3 h-3" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Sair</span>
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus className="w-3 h-3" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Acompanhar</span>
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            <motion.div layout className="space-y-3">
                                <AnimatePresence initial={false}>
                                    {ticket.followers && ticket.followers.length > 0 ? (
                                        ticket.followers.map(follower => (
                                            <motion.div
                                                key={follower.id}
                                                layout
                                                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-border-theme/30 group/follower relative"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-accent-theme/10 flex items-center justify-center border border-accent-theme/20">
                                                    <User className="w-4 h-4 text-accent-theme" />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[11px] font-bold text-foreground/90 truncate">{follower.full_name || follower.username}</span>
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{follower.username}</span>
                                                </div>

                                                {ticket.assigned_user_id === user?.id && (
                                                    <button
                                                        onClick={() => handleRemoveFollower(follower.id)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover/follower:opacity-100 transition-opacity hover:bg-red-500/20"
                                                        title="Remover Acompanhante"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </motion.div>
                                        ))
                                    ) : (
                                        <motion.p
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 0.5 }}
                                            className="text-[10px] text-gray-500 font-bold italic text-center py-4"
                                        >
                                            Nenhum acompanhante neste ticket
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </motion.div>
                    </div>
                </motion.div>

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
                                    {/* Blocos Superiores: Identificação e Localização */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Bloco 1: Identificação Fiscal */}
                                        <div className="glass-card p-6 rounded-3xl border border-border-theme/50 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-2 rounded-xl bg-accent-theme/10 text-accent-theme">
                                                    <ShieldCheck className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dados Fiscais</h3>
                                            </div>
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">CPF / CNPJ</p>
                                                    <p className="text-sm font-bold font-mono text-accent-theme">{client?.cpf_cnpj || 'Não informado'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Inscrição Estadual</p>
                                                    <p className="text-sm font-bold text-foreground">{client?.state_registration || 'Isento/Não informado'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Regime Tributário</p>
                                                    <p className="text-xs font-bold text-foreground/80">{client?.tax_regime || 'Não definido'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Bloco 2: Contatos e Social */}
                                        <div className="glass-card p-6 rounded-3xl border border-border-theme/50 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                                                    <Phone className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Contatos</h3>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                        <Mail className="w-3.5 h-3.5 text-gray-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">E-mail Principal</p>
                                                        <p className="text-xs font-bold">{client?.email || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                        <Phone className="w-3.5 h-3.5 text-gray-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Telefone</p>
                                                        <p className="text-xs font-bold">{client?.phone || 'N/A'}</p>
                                                    </div>
                                                </div>
                                                {client?.extra_contacts && client.extra_contacts.length > 0 && (
                                                    <div className="pt-2 border-t border-border-theme/30 space-y-2">
                                                        {client.extra_contacts.map((contact, idx) => (
                                                            <div key={idx} className="flex items-center gap-2 text-[10px] text-gray-400">
                                                                <span className="font-black uppercase">{contact.type}:</span>
                                                                <span className="font-bold text-foreground/70">{contact.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bloco 3: Endereço Completo */}
                                    <div className="glass-card p-6 rounded-3xl border border-border-theme/50">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                                                <MapPin className="w-4 h-4" />
                                            </div>
                                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Endereço e Localização</h3>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="md:col-span-2">
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Logradouro</p>
                                                <p className="text-sm font-bold">
                                                    {client?.street}{client?.number ? `, ${client.number}` : ''}
                                                </p>
                                                <p className="text-xs text-gray-500 italic mt-0.5">
                                                    {client?.complement || 'Sem complemento'} - {client?.neighborhood || 'Bairro N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Cidade / UF</p>
                                                <p className="text-sm font-bold uppercase">{client?.city} - {client?.uf}</p>
                                                <p className="text-xs font-mono text-gray-500">CEP: {client?.cep || '00000-000'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bloco 4: Produtos/Serviços e Próximos Passos */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Produtos Contratados */}
                                        <div className="glass-card p-6 rounded-3xl border border-border-theme/50">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                                                    <Package className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Produtos / Serviços</h3>
                                            </div>
                                            <div className="space-y-3">
                                                {client?.contracted_items && client.contracted_items.length > 0 ? (
                                                    client.contracted_items.map((item, idx) => (
                                                        <div key={idx} className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-tight">{item.name}</p>
                                                            {item.description && <p className="text-[10px] text-emerald-600/70">{item.description}</p>}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-[10px] text-gray-500 italic py-2">Nenhum produto listado.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Chamados Recentes */}
                                        <div className="glass-card p-6 rounded-3xl border border-border-theme/50">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                                                    <History className="w-4 h-4" />
                                                </div>
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Últimos Chamados</h3>
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
                                                                className="w-full p-3 rounded-xl bg-background border border-border-theme/30 hover:bg-white/5 transition-all flex items-center justify-between text-left group"
                                                            >
                                                                <div className="min-w-0 pr-2">
                                                                    <p className="text-[11px] font-bold truncate group-hover:text-accent-theme transition-colors">{t.title}</p>
                                                                    <span className="text-[9px] text-gray-500">#{t.id} - {new Date(t.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                                <div
                                                                    className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                                                                    style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}40` }}
                                                                />
                                                            </button>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="text-[10px] text-gray-500 italic py-2 text-center">Sem histórico adicional.</p>
                                                )}
                                            </div>
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
                    )
                }

                {/* Modal Adicionar Informação */}
                {
                    isInfoModalOpen && (
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
                    )
                }

                {/* Modal Transferir Ticket */}
                <AnimatePresence>
                    {isTransferModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                                onClick={() => !performingAction && setIsTransferModalOpen(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 30,
                                    mass: 0.8
                                }}
                                className="relative w-full max-w-md glass-card rounded-[3rem] border border-border-theme shadow-2xl overflow-hidden"
                            >
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
                                            <Briefcase className="w-3 h-3 text-accent-theme font-shadow-none" />
                                            Novo Setor Responsável
                                        </label>
                                        <CustomSelect
                                            value={targetSectorId}
                                            onChange={setTargetSectorId}
                                            placeholder="Manter setor atual..."
                                            options={[
                                                ...sectors.map(s => ({
                                                    value: s.id.toString(),
                                                    label: s.name,
                                                    icon: <Users className="w-3 h-3" />
                                                }))
                                            ]}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                            <User className="w-3 h-3 text-accent-theme font-shadow-none" />
                                            Novo Atendente Responsável
                                        </label>
                                        <CustomSelect
                                            value={targetAttendantId}
                                            onChange={setTargetAttendantId}
                                            placeholder={loadingAttendants ? "Carregando..." : "Selecione um atendente..."}
                                            disabled={loadingAttendants}
                                            options={[
                                                ...attendants.map(a => ({
                                                    value: a.id.toString(),
                                                    label: a.name,
                                                    icon: <User className="w-3 h-3" />
                                                }))
                                            ]}
                                        />
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border-theme/50">
                                        <button
                                            onClick={() => !performingAction && setIsTransferModalOpen(false)}
                                            disabled={performingAction}
                                            className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-widest"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleTransferTicket}
                                            disabled={performingAction}
                                            className="px-6 py-3 rounded-xl bg-accent-theme text-white font-bold shadow-lg shadow-accent-theme/20 hover:shadow-accent-theme/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm uppercase tracking-widest"
                                        >
                                            {performingAction ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Transferindo...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-4 h-4" />
                                                    Transferir
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Modal de Adicionar Acompanhante */}
                <AnimatePresence>
                    {isAddFollowerModalOpen && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                                onClick={() => setIsAddFollowerModalOpen(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.98, y: 10 }}
                                transition={{
                                    type: "spring",
                                    stiffness: 400,
                                    damping: 30,
                                    mass: 0.8
                                }}
                                className="relative w-full max-w-md glass-card rounded-[2.5rem] border border-border-theme shadow-2xl p-8"
                            >
                                <h2 className="text-xl font-black text-foreground mb-6 uppercase tracking-wider">Adicionar Acompanhante</h2>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Usuário</label>
                                        <CustomSelect
                                            options={[
                                                { value: '', label: 'Selecione um usuário' },
                                                ...availableUsers.map(u => ({ value: u.id.toString(), label: u.name || u.full_name || u.username }))
                                            ]}
                                            value={selectedUserId}
                                            onChange={setSelectedUserId}
                                            placeholder="Selecione..."
                                        />
                                        {availableUsers.length === 0 && (
                                            <p className="text-[10px] text-yellow-500 font-bold mt-2 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Nenhum usuário disponível para adicionar.
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-3 pt-4 border-t border-border-theme/50">
                                        <button
                                            onClick={() => setIsAddFollowerModalOpen(false)}
                                            className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all text-xs uppercase tracking-widest"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleAddFollower}
                                            disabled={!selectedUserId || performingAction}
                                            className="px-6 py-3 rounded-xl bg-accent-theme text-white font-bold shadow-lg shadow-accent-theme/20 hover:shadow-accent-theme/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-xs uppercase tracking-widest"
                                        >
                                            {performingAction ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Adicionando...
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus className="w-4 h-4" />
                                                    Adicionar
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>


                {/* Image Zoom Modal */}
                <AnimatePresence>
                    {zoomedImage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setZoomedImage(null)}
                            className="fixed inset-0 z-[2000] bg-background/95 backdrop-blur-xl flex items-center justify-center p-8 cursor-zoom-out"
                        >
                            <motion.button
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </motion.button>
                            <motion.img
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.9, y: 20 }}
                                src={zoomedImage || undefined}
                                alt="Zoomed"
                                className="max-w-full max-h-full rounded-3xl shadow-2xl border border-white/10"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}
