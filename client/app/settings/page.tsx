'use client';

import React, { useState, useEffect } from 'react';
import {
    Save, RotateCcw, Globe, Cpu, Palette, CheckCircle2, ChevronDown, Loader2, Ticket,
    Plus, Edit2, Trash2, Shield, User as UserIcon, Mail, ShieldCheck,
    Settings as SettingsIcon, Key, UserSquare2, Users, ArrowLeft, ArrowRight,
    ArrowUp, ArrowDown,
    Link2, Tag, PlusCircle, HardDrive, FolderPlus, Download, Upload, AlertTriangle,
    XCircle, Eye, EyeOff, Check, Layers, MessageSquare, Bot, Zap, FileText,
    Image, Video, Music, Sparkles, Folder, Search, Filter, ExternalLink, Copy,
    CheckCheck, RefreshCw, Paperclip, Lock, Smartphone, Clock, Phone, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getOllamaModels } from '@/lib/ollama';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import api, {
    getCategories, createCategory, updateCategory, deleteCategory, Category,
    getStatuses, createStatus, updateStatus, deleteStatus, Status,
    getUsers, createUser, updateUser, deleteUser, uploadUserAvatar, removeUserAvatar, User,
    resetDatabase, downloadBackup, restoreSystem,
    getProfiles, createProfile, updateProfile, deleteProfile, Profile,
    getSectors, createSector, updateSector, deleteSector, Sector,
    getCatalogItems, createCatalogItem, updateCatalogItem, deleteCatalogItem, CatalogItem,
    getDefaultBaseURL
} from '@/lib/api';
import { useNotification } from '@/components/NotificationProvider';
import { useSystemSettings } from '@/components/SystemSettingsProvider';
import CustomSelect from '@/components/CustomSelect';
import clsx from 'clsx';

const MODEL_TIPS: Record<string, { label: string, color: string, speed: string, quality: string }> = {
    'phi3': { label: 'Ultra-Leve', color: 'text-green-400', speed: '⚡⚡⚡', quality: 'Normal' },
    'llama3': { label: 'Inteligente', color: 'text-blue-400', speed: '⚡⚡', quality: 'Alta' },
    'mistral': { label: 'Equilibrado', color: 'text-cyan-400', speed: '⚡⚡', quality: 'Sólida' },
    'moondream': { label: 'Visão Light', color: 'text-orange-400', speed: '⚡⚡⚡', quality: 'Específica' },
    'gemma': { label: 'Eficiente', color: 'text-yellow-400', speed: '⚡⚡', quality: 'Boa' },
    'llava': { label: 'Visão Full', color: 'text-red-400', speed: '⚡', quality: 'Máxima' },
};

const SETTINGS_TABS = [
    { id: 'general', label: 'Conectividade', icon: Globe, color: 'text-blue-400' },
    { id: 'ai', label: 'Motores IA', icon: Cpu, color: 'text-purple-400' },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-violet-400' },
    { id: 'org', label: 'Organização', icon: Tag, color: 'text-emerald-400' },
    { id: 'users', label: 'Usuários', icon: Users, color: 'text-amber-400', roles: ['ADMIN', 'ROOT'] },
    { id: 'appearance', label: 'Aparência', icon: Palette, color: 'text-pink-400' },
    { id: 'profiles', label: 'Perfis de Acesso', icon: ShieldCheck, color: 'text-orange-400', roles: ['ADMIN', 'ROOT'] },
    { id: 'system', label: 'Identidade', icon: Shield, color: 'text-accent-theme', roles: ['ADMIN', 'ROOT'] },
    { id: 'advanced', label: 'Avançado', icon: SettingsIcon, color: 'text-red-400', roles: ['ROOT'] },
];

const AVAILABLE_MENUS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'reports', label: 'Relatórios' },
    { id: 'tickets', label: 'Chamados' },
    { id: 'clients', label: 'Clientes' },
    { id: 'knowledge', label: 'Base IA' },
    { id: 'chat', label: 'Soluções IA' },
    { id: 'settings', label: 'Ajustes' },
];

const AVAILABLE_ACTIONS = [
    { id: 'create_ticket', label: 'Criar Chamados' },
    { id: 'edit_ticket', label: 'Editar Chamados' },
    { id: 'transfer_ticket', label: 'Transferir Chamados' },
    { id: 'delete_ticket', label: 'Excluir Chamados (Cuidado)' },
    { id: 'view_reports', label: 'Visualizar Relatórios' },
    { id: 'view_all_users_reports', label: 'Ver Relatórios de Outros Usuários' },
    { id: 'view_all_sectors_reports', label: 'Ver Relatórios de Outros Setores' },
    { id: 'manage_users', label: 'Gerenciar Usuários' },
    { id: 'manage_profiles', label: 'Gerenciar Perfis' },
    { id: 'manage_sectors', label: 'Gerenciar Setores' },
    { id: 'manage_categories', label: 'Gerenciar Categorias & Status' },
    { id: 'manage_system', label: 'Configurações do Sistema' },
    { id: 'view_financial', label: 'Ver Dados Financeiros' },
];

const THEMES = [
    { id: 'dark', name: 'Nocturne', bg: 'bg-[#0f172a]', accent: 'bg-blue-600' },
    { id: 'light', name: 'Alabaster', bg: 'bg-[#f1f5f9]', accent: 'bg-blue-600' },
    { id: 'cyberpunk', name: 'Neon City', bg: 'bg-[#0d0221]', accent: 'bg-[#ff007f]' },
    { id: 'matrix', name: 'The Source', bg: 'bg-[#000000]', accent: 'bg-[#00ff41]' },
    { id: 'antigravity', name: 'Antigravity', bg: 'bg-[#ffffff]', accent: 'bg-[#f59e0b]' },
    { id: 'sunset', name: 'Solstício', bg: 'bg-[#1a0b2e]', accent: 'bg-[#f06292]' },
    { id: 'nordic', name: 'Ártico', bg: 'bg-[#242933]', accent: 'bg-[#88c0d0]' },
    { id: 'gold', name: 'Real Gold', bg: 'bg-[#050505]', accent: 'bg-[#d4af37]' },
    { id: 'carbon-red', name: 'Carbon Red', bg: 'bg-[#1c1917]', accent: 'bg-[#ef4444]' },
    { id: 'obsidian-red', name: 'Obsidian Red', bg: 'bg-[#000000]', accent: 'bg-[#991b1b]' },
    { id: 'office-red', name: 'Office Red', bg: 'bg-[#f8fafc]', accent: 'bg-[#e11d48]' },
    { id: 'ash-red', name: 'Ash Red', bg: 'bg-[#e2e8f0]', accent: 'bg-[#dc2626]' },
    { id: 'hub', name: 'HUB', bg: 'bg-[#f8fafc]', accent: 'bg-[#b91c1c]' },
    { id: 'hub-dark', name: 'HUB Dark', bg: 'bg-[#0d0d0d]', accent: 'bg-[#dc2626]' },
    { id: 'midnight-purple', name: 'Midnight', bg: 'bg-[#0b061a]', accent: 'bg-[#8b5cf6]' },
    { id: 'emerald-dark', name: 'Emerald', bg: 'bg-[#021a14]', accent: 'bg-[#10b981]' },
    { id: 'custom', name: 'Personalizado', bg: 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500', accent: 'bg-white' },
];

export default function SettingsPage() {
    const { theme, setTheme } = useTheme();
    const { user } = useAuth();
    const { showNotification, confirm: askConfirm } = useNotification();
    const { refreshSettings } = useSystemSettings();

    // Estado Navegação
    const [activeTab, setActiveTab] = useState('general');

    // Estado Configurações
    const [config, setConfig] = useState({
        apiUrl: 'http://127.0.0.1:8080',
        ollamaUrl: 'http://localhost:11434',
        whatsappUrl: 'http://localhost:5000',
        aiSource: 'centralized' as 'centralized' | 'local',
        textModel: 'phi3',
        visionModel: 'moondream',
        theme: 'dark' as any
    });
    const [textModels, setTextModels] = useState<any[]>([]);
    const [visionModels, setVisionModels] = useState<any[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'success' | 'error' | null>(null);

    // Estados WhatsApp Multi-Canal
    type WhatsAppChannel = {
        id: string;
        name: string;
        port: number;
        color: string;
        description?: string;
        sector_id?: number | null;
        sector_ids?: number[] | null;
        all_sectors?: boolean;
        bot_flow?: any;
    };
    const [whatsappChannels, setWhatsappChannels] = useState<WhatsAppChannel[]>([]);
    const [loadingChannels, setLoadingChannels] = useState(false);
    const [channelStatuses, setChannelStatuses] = useState<Record<string, { status: string; qr: string | null } | null>>({});
    const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<WhatsAppChannel | null>(null);
    const [zoomedChannelId, setZoomedChannelId] = useState<string | null>(null);
    const [channelForm, setChannelForm] = useState<{
        id?: string;
        name: string;
        port: number;
        color: string;
        description?: string;
        sector_id?: number | null;
        sector_ids: number[];
        allSectors: boolean;
    }>({
        name: '',
        port: 5000,
        color: '#8b5cf6',
        description: '',
        sector_id: null,
        sector_ids: [],
        allSectors: true
    });
    const [savingChannel, setSavingChannel] = useState(false);
    // Legacy single-channel states (mantidos para compatibilidade com código de teste de conexão)
    const [whatsappStatus, setWhatsappStatus] = useState<{ status: string; qr: string | null } | null>(null);
    const [loadingWhatsappStatus, setLoadingWhatsappStatus] = useState(false);
    const [testingWhatsapp, setTestingWhatsapp] = useState(false);
    const [whatsappConnectionStatus, setWhatsappConnectionStatus] = useState<'success' | 'error' | null>(null);

    // =========================================================================
    // 🔀 SUB-ABAS DE WHATSAPP ('channels' | 'files' | 'quick_replies')
    // =========================================================================
    const [whatsappSubTab, setWhatsappSubTab] = useState<'channels' | 'files' | 'quick_replies'>('channels');

    // --- Estados da Base de Arquivos Pré-Salvos (Biblioteca) ---
    interface FileItem {
        id: number;
        url: string;
        filename: string;
        titulo?: string;
        ext: string;
        mimetype?: string;
        caption?: string;
        grupo?: string;
        setores?: (number | string)[] | null;
        descricao?: string | null;
        size_bytes?: number;
        size_formatted?: string;
        cliente_jid?: string;
        cliente_nome?: string;
        cliente_avatar?: string | null;
        remetente?: string;
        atendente_nome?: string | null;
        timestamp?: string;
        created_at?: string;
    }

    interface FileStats {
        total_files: number;
        total_size_bytes: number;
        total_size_formatted: string;
        categories: {
            image: { count: number; bytes: number; formatted: string };
            video: { count: number; bytes: number; formatted: string };
            audio: { count: number; bytes: number; formatted: string };
            doc: { count: number; bytes: number; formatted: string };
            other: { count: number; bytes: number; formatted: string };
        };
    }

    const [fileStats, setFileStats] = useState<FileStats | null>(null);
    const [filesList, setFilesList] = useState<FileItem[]>([]);
    const [fileGruposList, setFileGruposList] = useState<{ name: string; count: number }[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [fileTypeFilter, setFileTypeFilter] = useState('all');
    const [fileGroupFilter, setFileGroupFilter] = useState('all');
    const [fileSectorFilter, setFileSectorFilter] = useState('all');
    const [fileSearchQuery, setFileSearchQuery] = useState('');
    const [filesPage, setFilesPage] = useState(1);
    const [filesTotal, setFilesTotal] = useState(0);
    const [filePreviewItem, setFilePreviewItem] = useState<FileItem | null>(null);
    const [editingFile, setEditingFile] = useState<FileItem | null>(null);
    const [isEditFileModalOpen, setIsEditFileModalOpen] = useState(false);
    const [fileMetaForm, setFileMetaForm] = useState<{
        titulo: string;
        grupo: string;
        setores: number[];
        descricao: string;
        allSectors: boolean;
    }>({
        titulo: '',
        grupo: 'Geral',
        setores: [],
        descricao: '',
        allSectors: true
    });
    const [savingFileMeta, setSavingFileMeta] = useState(false);

    // Modal de Novo Arquivo Pré-Salvo
    const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
    const [newFileForm, setNewFileForm] = useState<{
        titulo: string;
        grupo: string;
        setores: number[];
        allSectors: boolean;
        descricao: string;
    }>({
        titulo: '',
        grupo: 'Geral',
        setores: [],
        allSectors: true,
        descricao: ''
    });

    // --- Estados de Mensagens Rápidas (Sequência com Submensagens & Arquivos) ---
    type QuickReplyBlock =
        | {
            id: string;
            tipo: 'texto';
            texto: string;
        }
        | {
            id: string;
            tipo: 'arquivo';
            url: string;
            filename: string;
            titulo?: string;
            ext?: string;
            mimetype?: string;
            size_bytes?: number;
            size_formatted?: string;
            legenda?: string;
        };

    interface QuickReplyItem {
        id: number;
        titulo: string;
        atalho: string;
        conteudo: string;
        categoria: string;
        grupo?: string;
        escopo: 'global' | 'pessoal';
        setores?: (number | string)[] | null;
        blocos?: QuickReplyBlock[] | null;
        usuario_id?: string | null;
        usuario_nome?: string | null;
        favorito?: number;
        midia_url?: string | null;
        created_at?: string;
    }

    const [quickReplies, setQuickReplies] = useState<QuickReplyItem[]>([]);
    const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);
    const [qrScopeFilter, setQrScopeFilter] = useState<'all' | 'global' | 'pessoal'>('all');
    const [qrGroupFilter, setQrGroupFilter] = useState('ALL');
    const [qrSectorFilter, setQrSectorFilter] = useState('all');
    const [qrSearchQuery, setQrSearchQuery] = useState('');
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [isQrFilePickerOpen, setIsQrFilePickerOpen] = useState(false);
    const [editingQr, setEditingQr] = useState<QuickReplyItem | null>(null);
    const [qrForm, setQrForm] = useState<{
        titulo: string;
        atalho: string;
        conteudo: string;
        categoria: string;
        grupo: string;
        escopo: 'global' | 'pessoal';
        setores: number[];
        allSectors: boolean;
        blocos: QuickReplyBlock[];
    }>({
        titulo: '',
        atalho: '',
        conteudo: '',
        categoria: '👋 Atendimento Inicial',
        grupo: '👋 Atendimento Inicial',
        escopo: 'global',
        setores: [],
        allSectors: true,
        blocos: [{ id: 'b_1', tipo: 'texto', texto: '' }]
    });
    const [savingQr, setSavingQr] = useState(false);

    // Carregar dados da sub-aba ativa do WhatsApp
    useEffect(() => {
        if (activeTab === 'whatsapp') {
            if (whatsappSubTab === 'files') {
                fetchFileStats();
                fetchFilesList(1, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery);
            } else if (whatsappSubTab === 'quick_replies') {
                fetchQuickReplies(qrGroupFilter, qrSectorFilter);
            }
        }
    }, [activeTab, whatsappSubTab]);
    // Usamos refs para evitar problemas com closures nos cleanups do useEffect
    const savedRef = React.useRef(false);
    const originalThemeRef = React.useRef<any>(null);
    const themeRef = React.useRef<any>(theme);

    // Salvar tema original ao entrar na tela apenas uma vez
    useEffect(() => {
        if (!originalThemeRef.current) {
            originalThemeRef.current = theme;
        }
    }, []);

    // Manter themeRef atualizado
    useEffect(() => {
        themeRef.current = theme;
    }, [theme]);

    // Atualizar ref de salvo quando o estado mudar
    useEffect(() => {
        savedRef.current = saved;
    }, [saved]);

    // Reverter tema ao sair se não salvou
    useEffect(() => {
        return () => {
            // Verifica o valor atual do ref no momento do unmount
            if (!savedRef.current && originalThemeRef.current && themeRef.current !== originalThemeRef.current) {
                console.log('Reverting theme to:', originalThemeRef.current);
                setTheme(originalThemeRef.current);
            }
        };
    }, []); // Empty dependency array = runs only on mount/unmount logic

    // Estado Categorias
    const [categories, setCategories] = useState<Category[]>([]);

    // Estado Perfis
    const [profiles, setProfiles] = useState<Profile[]>([]);

    // Estado Setores
    const [sectors, setSectors] = useState<Sector[]>([]);

    // Form States
    const [newSectorName, setNewSectorName] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [parentCategory, setParentCategory] = useState<string>('');
    const [loadingCats, setLoadingCats] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);

    // Estado Status
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [newStatusName, setNewStatusName] = useState('');
    const [newStatusColor, setNewStatusColor] = useState('#3b82f6');
    const [newStatusIsFinal, setNewStatusIsFinal] = useState(false);
    const [loadingStatuses, setLoadingStatuses] = useState(false);
    const [editingStatus, setEditingStatus] = useState<Status | null>(null);
    const [selectedSectorIdStatus, setSelectedSectorIdStatus] = useState<number | undefined>(undefined);
    const [newStatusSectorId, setNewStatusSectorId] = useState<number | undefined>(undefined);
    const [selectedSectorIdCategory, setSelectedSectorIdCategory] = useState<number | undefined>(undefined);
    const [newCategorySectorId, setNewCategorySectorId] = useState<number | undefined>(undefined);

    // Estado de informações do banco de dados
    const [dbInfo, setDbInfo] = useState<{ type: string; label: string; details: string } | null>(null);

    // Estado da Limpeza de Dados (Danger Zone)
    const [resetEntities, setResetEntities] = useState<string[]>([]);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [loadingReset, setLoadingReset] = useState(false);
    const [loadingRestore, setLoadingRestore] = useState(false);
    const [backupProgress, setBackupProgress] = useState<number | null>(null);
    const [restoreProgress, setRestoreProgress] = useState<number | null>(null);

    // Estado Gestão de Usuários
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<Partial<User & { password?: string }>>({});
    const [isEditingUser, setIsEditingUser] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<number[]>([]);

    // Estado Gestão de Perfis
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [currentProfile, setCurrentProfile] = useState<Partial<Profile>>({ permissions: { menus: [], actions: [] } });

    // Estado Customização do Sistema
    const [systemSettings, setSystemSettings] = useState({
        system_name: 'TicketFlow',
        logo_url_light: '',
        logo_url_dark: '',
        custom_colors: {} as Record<string, string>,
        favicon_url: '',
        whatsapp_warn_new_number: true,
        whatsapp_limit_active_chats: true,
        whatsapp_limit_count: 10,
        whatsapp_send_signature: true
    });
    const [logoFileLight, setLogoFileLight] = useState<File | null>(null);
    const [logoFileDark, setLogoFileDark] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [logoPreviewLight, setLogoPreviewLight] = useState<string | null>(null);
    const [logoPreviewDark, setLogoPreviewDark] = useState<string | null>(null);
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
    const [isSavingSystem, setIsSavingSystem] = useState(false);
    const [editingSector, setEditingSector] = useState<Sector | null>(null);
    const [showOnlyActiveSectors, setShowOnlyActiveSectors] = useState(false);
    const [showOnlyActiveCategories, setShowOnlyActiveCategories] = useState(false);
    const [showOnlyActiveStatuses, setShowOnlyActiveStatuses] = useState(false);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [newCatalogItemName, setNewCatalogItemName] = useState('');
    const [newCatalogItemDescription, setNewCatalogItemDescription] = useState('');
    const [loadingCatalog, setLoadingCatalog] = useState(false);
    const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
    const [showOnlyActiveCatalog, setShowOnlyActiveCatalog] = useState(false);

    const expandAllCategories = () => {
        const allParentIdsWithSubs = categories
            .filter(c => !c.parent_id && c.subcategories && c.subcategories.length > 0)
            .map(c => c.id);
        setExpandedCategories(allParentIdsWithSubs);
    };

    const collapseAllCategories = () => {
        setExpandedCategories([]);
    };

    // Real-time Preview de Cores Customizadas
    useEffect(() => {
        if (theme === 'custom' && systemSettings.custom_colors) {
            const root = document.documentElement;
            // Forçamos a classe de tema customizado se estivermos editando cores
            if (!root.classList.contains('theme-custom')) {
                root.classList.add('theme-custom');
            }

            const mapping: Record<string, string> = {
                'bg': '--color-background',
                'fg': '--color-foreground',
                'card': '--color-card',
                'card-hover': '--color-card-hover',
                'primary': '--color-primary-theme',
                'border': '--color-border-theme',
                'accent': '--color-accent-theme',
                'muted': '--color-text-muted'
            };

            Object.entries(systemSettings.custom_colors).forEach(([key, value]) => {
                const varName = mapping[key];
                if (varName && value) {
                    root.style.setProperty(varName, value as string);
                }
            });
        }
    }, [theme, systemSettings.custom_colors]);

    const toggleCategory = (id: number) => {
        setExpandedCategories(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    const fetchCatalogItemsData = async () => {
        setLoadingCatalog(true);
        try {
            const data = await getCatalogItems();
            setCatalogItems(data || []);
        } catch (error) {
            console.error('Failed to fetch catalog items:', error);
        } finally {
            setLoadingCatalog(false);
        }
    };

    const handleCreateCatalogItem = async () => {
        if (!newCatalogItemName.trim()) return;
        setLoadingCatalog(true);
        try {
            if (editingCatalogItem) {
                await updateCatalogItem(editingCatalogItem.id, {
                    name: newCatalogItemName,
                    description: newCatalogItemDescription,
                    is_active: editingCatalogItem.is_active
                });
                showNotification('Item do catálogo atualizado!', 'success');
            } else {
                await createCatalogItem({
                    name: newCatalogItemName,
                    description: newCatalogItemDescription,
                    is_active: true
                });
                showNotification('Item do catálogo criado!', 'success');
            }
            setNewCatalogItemName('');
            setNewCatalogItemDescription('');
            setEditingCatalogItem(null);
            fetchCatalogItemsData();
        } catch (error) {
            showNotification(editingCatalogItem ? 'Erro ao atualizar item' : 'Erro ao criar item', 'error');
        } finally {
            setLoadingCatalog(false);
        }
    };

    const handleToggleCatalogItemActive = async (item: CatalogItem) => {
        const previousItems = [...catalogItems];
        const newIsActive = !item.is_active;

        setCatalogItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: newIsActive } : i));

        try {
            await updateCatalogItem(item.id, { is_active: newIsActive });
            showNotification(`Item ${newIsActive ? 'ativado' : 'desativado'}`, 'success');
        } catch (error) {
            setCatalogItems(previousItems);
            showNotification('Erro ao alterar status do item', 'error');
        }
    };

    const handleEditCatalogItem = (item: CatalogItem) => {
        setEditingCatalogItem(item);
        setNewCatalogItemName(item.name);
        setNewCatalogItemDescription(item.description || '');
    };

    const cancelEditCatalogItem = () => {
        setEditingCatalogItem(null);
        setNewCatalogItemName('');
        setNewCatalogItemDescription('');
    };

    const handleDeleteCatalogItem = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Item do Catálogo',
            message: 'Deseja excluir este serviço/produto do catálogo?',
            type: 'danger',
            confirmText: 'Excluir'
        });

        if (confirmed) {
            try {
                await deleteCatalogItem(id);
                showNotification('Item removido', 'success');
                fetchCatalogItemsData();
            } catch (error) {
                showNotification('Erro ao excluir item', 'error');
            }
        }
    };

    useEffect(() => {
        const localConfig = localStorage.getItem('system_config');
        if (localConfig) {
            setConfig(prev => ({ ...prev, ...JSON.parse(localConfig) }));
        }
        loadModels();
        fetchCategories();
        fetchStatuses();
        fetchSectors();
        fetchCatalogItemsData();
        if (user && (user.role === 'ADMIN' || user.role === 'ROOT')) {
            fetchUsers();
            fetchProfiles();
        }
        fetchSystemSettings();
    }, [user]);

    // Refresh lists when sector filters change
    useEffect(() => {
        fetchStatuses(true, selectedSectorIdStatus);
    }, [selectedSectorIdStatus]);

    useEffect(() => {
        fetchCategories(true, selectedSectorIdCategory);
    }, [selectedSectorIdCategory]);

    // Carrega informações do banco de dados uma vez ao montar
    useEffect(() => {
        const fetchDbInfo = async () => {
            try {
                const response = await api.get('/api/system/db-info');
                setDbInfo(response.data);
            } catch (error) {
                console.error('Failed to fetch db info:', error);
            }
        };
        fetchDbInfo();
    }, []);

    const fetchSystemSettings = async () => {
        try {
            const response = await api.get('/system-settings');
            const data = response.data;

            // Tenta obter a API URL das configurações locais ou do default do axios
            const getBaseURL = () => {
                let url = api.defaults.baseURL?.replace(/\/$/, "") || "";

                if (typeof window !== 'undefined') {
                    const localConfig = localStorage.getItem('system_config');
                    if (localConfig) {
                        try {
                            const configData = JSON.parse(localConfig);
                            if (configData.apiUrl) url = configData.apiUrl.replace(/\/$/, "");
                        } catch (e) { }
                    }

                    // INTELLIGENT HOSTNAME: Se url for localhost/127.0.0.1 mas estivermos acessando remotamente
                    const currentHost = window.location.hostname;
                    const isRemoteAccess = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
                    const isApiLocal = url.includes('localhost') || url.includes('127.0.0.1');

                    if (isRemoteAccess && isApiLocal) {
                        url = url.replace(/localhost|127\.0\.0\.1/g, currentHost);
                    }
                }
                return url;
            };

            const baseURL = getBaseURL();

            const resolveUrl = (url: string | null) => {
                if (url && !url.startsWith('http') && !url.startsWith('data:')) {
                    return `${baseURL}${url.startsWith('/') ? '' : '/'}${url}`;
                }
                return url;
            };

            setSystemSettings({
                ...data,
                logo_url_light: resolveUrl(data.logo_url_light) || resolveUrl(data.logo_url) || null,
                logo_url_dark: resolveUrl(data.logo_url_dark) || resolveUrl(data.logo_url) || null,
                favicon_url: resolveUrl(data.favicon_url) || null,
                custom_colors: data.custom_colors || {}
            });
        } catch (error) {
            console.error("Failed to fetch system settings:", error);
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, theme: 'light' | 'dark') => {
        const file = e.target.files?.[0];
        if (file) {
            if (theme === 'light') setLogoFileLight(file);
            else setLogoFileDark(file);

            const reader = new FileReader();
            reader.onloadend = () => {
                if (theme === 'light') setLogoPreviewLight(reader.result as string);
                else setLogoPreviewDark(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFaviconFile(file);

            const reader = new FileReader();
            reader.onloadend = () => {
                setFaviconPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveSystemSettings = async () => {
        setIsSavingSystem(true);
        try {
            // 1. Salvar Nome e Cores
            await api.patch('/system-settings', {
                system_name: systemSettings.system_name,
                custom_colors: systemSettings.custom_colors
            });

            // 2. Salvar Logos se houver novos arquivos
            if (logoFileLight) {
                const formData = new FormData();
                formData.append('file', logoFileLight);
                await api.post('/system-settings/logo?theme=light', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            if (logoFileDark) {
                const formData = new FormData();
                formData.append('file', logoFileDark);
                await api.post('/system-settings/logo?theme=dark', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            if (faviconFile) {
                const formData = new FormData();
                formData.append('file', faviconFile);
                await api.post('/system-settings/favicon', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            showNotification('Configurações de identidade salvas!', 'success');
            // Recarrega as configurações globalmente sem reload da página
            refreshSettings();
        } catch (error) {
            console.error("Error saving system settings:", error);
            showNotification('Erro ao salvar identidade: Verifique as permissões.', 'error');
        } finally {
            setIsSavingSystem(false);
        }
    };

    const handleRemoveLogo = async (theme: 'light' | 'dark') => {
        const confirmed = await askConfirm({
            title: 'Remover Logo',
            message: `Deseja remover o logo do tema ${theme === 'light' ? 'claro' : 'escuro'} e voltar ao padrão?`,
            confirmText: 'Sim, Remover',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (!confirmed) return;
        setIsSavingSystem(true);
        try {
            const field = theme === 'light' ? 'logo_url_light' : 'logo_url_dark';
            await api.patch('/system-settings', { [field]: '' });
            showNotification('Logo removido com sucesso!', 'success');

            // Atualiza estado local e global
            setSystemSettings({ ...systemSettings, [field]: null });
            if (theme === 'light') setLogoPreviewLight(null);
            else setLogoPreviewDark(null);

            refreshSettings();
        } catch (error) {
            console.error("Error removing logo:", error);
            showNotification('Erro ao remover logo', 'error');
        } finally {
            setIsSavingSystem(false);
        }
    };

    const handleRemoveFavicon = async () => {
        const confirmed = await askConfirm({
            title: 'Remover Favicon',
            message: 'Deseja remover o favicon personalizado e voltar ao padrão?',
            confirmText: 'Sim, Remover',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (!confirmed) return;
        setIsSavingSystem(true);
        try {
            await api.patch('/system-settings', { favicon_url: '' });
            showNotification('Favicon removido com sucesso!', 'success');

            setSystemSettings({ ...systemSettings, favicon_url: '' });
            setFaviconPreview(null);
            setFaviconFile(null);

            refreshSettings();
        } catch (error) {
            console.error("Error removing favicon:", error);
            showNotification('Erro ao remover favicon', 'error');
        } finally {
            setIsSavingSystem(false);
        }
    };

    const [isSavingWhatsappSafety, setIsSavingWhatsappSafety] = useState(false);

    const handleSaveWhatsappSafetySettings = async () => {
        setIsSavingWhatsappSafety(true);
        try {
            await api.patch('/system-settings', {
                whatsapp_warn_new_number: systemSettings.whatsapp_warn_new_number,
                whatsapp_limit_active_chats: systemSettings.whatsapp_limit_active_chats,
                whatsapp_limit_count: systemSettings.whatsapp_limit_count,
                whatsapp_send_signature: systemSettings.whatsapp_send_signature
            });
            showNotification('Configurações de WhatsApp salvas com sucesso!', 'success');
            refreshSettings();
        } catch (error) {
            console.error("Error saving WhatsApp settings:", error);
            showNotification('Erro ao salvar configurações do WhatsApp', 'error');
        } finally {
            setIsSavingWhatsappSafety(false);
        }
    };

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const data = await getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingUsers(true);
        try {
            let savedUser: User;
            if (isEditingUser && currentUser.id) {
                savedUser = await updateUser(currentUser.id, currentUser);
                showNotification('Usuário atualizado!', 'success');
            } else {
                savedUser = await createUser(currentUser as User);
                showNotification('Usuário criado!', 'success');
            }
            // Upload do avatar se houver arquivo selecionado
            if (avatarFile && savedUser.id) {
                try {
                    await uploadUserAvatar(savedUser.id, avatarFile);
                } catch (avatarError) {
                    console.error('Erro ao fazer upload do avatar:', avatarError);
                    showNotification('Usuário salvo, mas houve um erro ao enviar a foto.', 'warning');
                }
            }
            setIsUserModalOpen(false);
            setAvatarFile(null);
            setAvatarPreview(null);
            fetchUsers();
        } catch (error) {
            showNotification('Erro ao salvar usuário', 'error');
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleDeleteUser = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Usuário',
            message: 'Tem certeza que deseja excluir este usuário? Esta ação é permanente.',
            type: 'danger',
            confirmText: 'Excluir'
        });

        if (confirmed) {
            try {
                await deleteUser(id);
                fetchUsers();
                showNotification('Usuário removido', 'success');
            } catch (error) {
                showNotification('Erro ao excluir usuário', 'error');
            }
        }
    };

    // --- Profile Logic ---
    const fetchProfiles = async () => {
        setLoadingProfiles(true);
        try {
            const data = await getProfiles();
            setProfiles(data);
        } catch (error) {
            console.error('Erro ao buscar perfis:', error);
        } finally {
            setLoadingProfiles(false);
        }
    };

    const fetchSectors = async () => {
        try {
            const data = await getSectors();
            setSectors(data);
        } catch (error) {
            console.error('Failed to fetch sectors:', error);
        }
    };

    const handleCreateSector = async () => {
        if (!newSectorName.trim()) return;
        try {
            if (editingSector) {
                await updateSector(editingSector.id, {
                    name: newSectorName,
                    is_active: editingSector.is_active
                });
                showNotification('Setor atualizado!', 'success');
            } else {
                await createSector({
                    name: newSectorName,
                    is_active: true
                });
                showNotification('Setor criado!', 'success');
            }
            setNewSectorName('');
            setEditingSector(null);
            fetchSectors();
        } catch (error) {
            showNotification(editingSector ? 'Erro ao atualizar setor' : 'Erro ao criar setor', 'error');
        }
    };

    const handleToggleSectorActive = async (sector: Sector) => {
        const previousSectors = [...sectors];
        const newIsActive = !sector.is_active;

        // Optimistic update
        setSectors(prev => prev.map(s => s.id === sector.id ? { ...s, is_active: newIsActive } : s));

        try {
            await updateSector(sector.id, { is_active: newIsActive });
            showNotification(`Setor ${newIsActive ? 'ativado' : 'desativado'}`, 'success');
            fetchSectors();
        } catch (error) {
            setSectors(previousSectors); // Rollback
            showNotification('Erro ao alterar status do setor', 'error');
        }
    };

    const handleEditSector = (sector: Sector) => {
        setEditingSector(sector);
        setNewSectorName(sector.name);
    };

    const cancelEditSector = () => {
        setEditingSector(null);
        setNewSectorName('');
    };

    const handleDeleteSector = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Setor',
            message: 'Deseja excluir este setor?',
            type: 'danger',
            confirmText: 'Excluir'
        });

        if (confirmed) {
            try {
                await deleteSector(id);
                showNotification('Setor removido', 'success');
                fetchSectors();
            } catch (error: any) {
                const detail = error.response?.data?.detail || 'Erro ao excluir setor';
                showNotification(detail, 'error');
            }
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoadingProfiles(true);
        try {
            const profileData = {
                ...currentProfile,
                permissions: currentProfile.permissions || { menus: [], actions: [] }
            };

            if (currentProfile.id) {
                // @ts-ignore
                await updateProfile(currentProfile.id, profileData);
                showNotification('Perfil atualizado!', 'success');
            } else {
                // @ts-ignore
                await createProfile(profileData);
                showNotification('Perfil criado!', 'success');
            }
            setIsProfileModalOpen(false);
            fetchProfiles();
        } catch (error) {
            showNotification('Erro ao salvar perfil', 'error');
        } finally {
            setLoadingProfiles(false);
        }
    };

    const handleDeleteProfile = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Perfil?',
            message: 'Tem certeza que deseja excluir este perfil? Usuários vinculados podem perder acesso.',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            await deleteProfile(id);
            showNotification('Perfil excluído!', 'success');
            fetchProfiles();
        } catch (error) {
            showNotification('Erro ao excluir: Perfil em uso?', 'error');
        }
    };

    const toggleProfilePermission = (type: 'menus' | 'actions', value: string) => {
        setCurrentProfile(prev => {
            const perms = prev.permissions || { menus: [], actions: [] };
            const list = perms[type] || [];
            if (value === '*') {
                const newList = list.includes('*') ? [] : ['*'];
                return { ...prev, permissions: { ...perms, [type]: newList } };
            }
            const newList = list.includes(value)
                ? list.filter(item => item !== value)
                : [...list, value];
            return { ...prev, permissions: { ...perms, [type]: newList } };
        });
    };

    useEffect(() => {
        if (activeTab === 'profiles' || activeTab === 'users') {
            fetchProfiles();
        }
    }, [activeTab]);

    const fetchStatuses = async (silent = false, sectorId?: number) => {
        if (!silent) setLoadingStatuses(true);
        try {
            const data = await getStatuses(sectorId);
            setStatuses(data);
        } catch (error) {
            console.error('Failed to statuses:', error);
        } finally {
            if (!silent) setLoadingStatuses(false);
        }
    };

    const fetchCategories = async (silent = false, sectorId?: number) => {
        if (!silent) setLoadingCats(true);
        try {
            const data = await getCategories(sectorId);
            setCategories(data);
        } catch (error) {
            console.error('Failed to categories:', error);
        } finally {
            if (!silent) setLoadingCats(false);
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            if (editingCategory) {
                await updateCategory(editingCategory.id, {
                    name: newCategoryName,
                    parent_id: parentCategory ? parseInt(parentCategory) : undefined,
                    sector_id: newCategorySectorId,
                    is_active: editingCategory.is_active
                } as any);
                showNotification('Categoria atualizada!', 'success');
            } else {
                await createCategory({
                    name: newCategoryName,
                    parent_id: parentCategory ? parseInt(parentCategory) : undefined,
                    sector_id: newCategorySectorId,
                    is_active: true
                } as any);
                showNotification('Categoria criada!', 'success');
            }
            setNewCategoryName('');
            setParentCategory('');
            setEditingCategory(null);
            fetchCategories(true, selectedSectorIdCategory);
        } catch (error) {
            showNotification(editingCategory ? 'Erro ao atualizar categoria' : 'Erro ao criar categoria', 'error');
        }
    };

    const handleEditCategory = (cat: Category) => {
        setEditingCategory(cat);
        setNewCategoryName(cat.name);
        setParentCategory(cat.parent_id?.toString() || '');
        setNewCategorySectorId(cat.sector_id);
        // Scroll para o formulário
        window.scrollTo({ top: 300, behavior: 'smooth' });
    };

    const cancelEditCategory = () => {
        setEditingCategory(null);
        setNewCategoryName('');
        setParentCategory('');
        setNewCategorySectorId(undefined);
    };

    const handleUpdateCategory = async (id: number, data: Partial<Category>) => {
        // Optimistic update
        const previousCategories = [...categories];
        const updateNested = (cats: Category[]): Category[] => {
            return cats.map(c => {
                if (c.id === id) {
                    const updated = { ...c, ...data };
                    // Se estiver desativando, desativa os filhos localmente também
                    if (data.is_active === false && updated.subcategories) {
                        const deactivateSub = (subs: Category[]): Category[] => {
                            return subs.map(s => ({
                                ...s,
                                is_active: false,
                                subcategories: s.subcategories ? deactivateSub(s.subcategories) : undefined
                            }));
                        };
                        updated.subcategories = deactivateSub(updated.subcategories);
                    }
                    return updated;
                }
                if (c.subcategories) return { ...c, subcategories: updateNested(c.subcategories) };
                return c;
            });
        };
        setCategories(updateNested(categories));

        try {
            await updateCategory(id, data);
            showNotification('Categoria atualizada!', 'success');
            // Silent refresh to ensure sync
            fetchCategories(true, selectedSectorIdCategory);
        } catch (error: any) {
            console.error('Failed to update category:', error);
            setCategories(previousCategories); // Rollback
            showNotification('Erro ao atualizar categoria', 'error');
        }
    };

    const handleDeleteCategory = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Categoria',
            message: 'Excluir esta categoria? Subcategorias também serão removidas.',
            type: 'danger',
            confirmText: 'Excluir'
        });

        if (confirmed) {
            const previousCategories = [...categories];
            // Optimistic removal
            const removeNested = (cats: Category[]): Category[] => {
                return cats.filter(c => c.id !== id).map(c => ({
                    ...c,
                    subcategories: c.subcategories ? removeNested(c.subcategories) : undefined
                }));
            };
            setCategories(removeNested(categories));

            try {
                await deleteCategory(id);
                showNotification('Categoria removida', 'success');
                fetchCategories(true, selectedSectorIdCategory);
            } catch (error: any) {
                setCategories(previousCategories); // Rollback
                const detail = error.response?.data?.detail || 'Erro ao excluir categoria';
                showNotification(detail, 'error');
            }
        }
    };

    const handleCreateStatus = async () => {
        if (!newStatusName.trim()) return;
        try {
            if (editingStatus) {
                await updateStatus(editingStatus.id, {
                    name: newStatusName,
                    color: newStatusColor,
                    is_final: newStatusIsFinal,
                    sector_id: newStatusSectorId,
                    is_active: editingStatus.is_active
                });
                showNotification('Status atualizado!', 'success');
            } else {
                await createStatus({
                    name: newStatusName,
                    color: newStatusColor,
                    is_final: newStatusIsFinal,
                    sector_id: newStatusSectorId,
                    is_active: true
                });
                showNotification('Status criado!', 'success');
            }
            setNewStatusName('');
            setNewStatusIsFinal(false);
            setEditingStatus(null);
            fetchStatuses(true, selectedSectorIdStatus);
        } catch (error) {
            showNotification(editingStatus ? 'Erro ao atualizar status' : 'Erro ao criar status', 'error');
        }
    };

    const handleToggleStatusActivation = async (status: Status) => {
        const previousStatuses = [...statuses];
        const newIsActive = !status.is_active;

        // Optimistic update
        setStatuses(prev => prev.map(s => s.id === status.id ? { ...s, is_active: newIsActive } : s));

        try {
            await updateStatus(status.id, {
                name: status.name,
                color: status.color,
                is_final: status.is_final,
                is_active: newIsActive
            });
            showNotification(`Status ${newIsActive ? 'ativado' : 'desativado'}`, 'success');
            fetchStatuses(true, selectedSectorIdStatus);
        } catch (error) {
            setStatuses(previousStatuses); // Rollback
            showNotification('Erro ao alterar status', 'error');
        }
    };

    const handleDeleteStatus = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Status',
            message: 'Deseja excluir este status? Tickets associados manterão o nome do status mas perderão o vínculo de cor.',
            type: 'danger',
            confirmText: 'Excluir'
        });

        if (confirmed) {
            const previousStatuses = [...statuses];
            // Optimistic update
            setStatuses(prev => prev.filter(s => s.id !== id));

            try {
                await deleteStatus(id);
                showNotification('Status removido', 'success');
                fetchStatuses(true, selectedSectorIdStatus);
            } catch (error: any) {
                setStatuses(previousStatuses); // Rollback
                const detail = error.response?.data?.detail || 'Erro ao excluir status';
                showNotification(detail, 'error');
            }
        }
    };

    const handleEditStatus = (status: Status) => {
        setEditingStatus(status);
        setNewStatusName(status.name);
        setNewStatusColor(status.color);
        setNewStatusIsFinal(status.is_final);
        setNewStatusSectorId(status.sector_id);
    };

    const cancelEditStatus = () => {
        setEditingStatus(null);
        setNewStatusName('');
        setNewStatusIsFinal(false);
        setNewStatusSectorId(undefined);
    };

    const loadModels = async () => {
        setLoadingModels(true);
        const allModels = await getOllamaModels();

        const vision = allModels.filter((m: any) => {
            const families = m.details?.families || [];
            const name = m.name.toLowerCase();
            return families.includes('clip') || families.includes('vision') || name.includes('llava') || name.includes('moondream');
        });

        const text = allModels.filter((m: any) => {
            const families = m.details?.families || [];
            return !families.includes('clip') || allModels.length < 3;
        });

        setVisionModels(vision);
        setTextModels(text.length > 0 ? text : allModels);
        setLoadingModels(false);
    };

    const handleSave = () => {
        const configToSave = {
            ...config,
            userConfigured: true // Marca como configuração manual para evitar auto-reversão
        };
        setConfig(configToSave); // Atualiza o estado também
        localStorage.setItem('system_config', JSON.stringify(configToSave));
        setSaved(true);
        savedRef.current = true; // Força atualização imediata do ref
        originalThemeRef.current = config.theme; // Atualiza o "original" para o novo salvo

        showNotification('Configurações salvas com sucesso!', 'success');
        setTheme(config.theme);
        window.dispatchEvent(new Event('storage'));
        refreshSettings();
        setTimeout(() => setSaved(false), 3000);
    };

    const handleTestConnection = async () => {
        setTestingConnection(true);
        setConnectionStatus(null);
        try {
            // Tenta uma chamada simples ao backend usando a URL atual do estado
            const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });

            if (response.ok) {
                setConnectionStatus('success');
                showNotification('Conexão com o servidor estabelecida!', 'success');
            } else {
                throw new Error('Servidor respondeu com erro');
            }
        } catch (error) {
            setConnectionStatus('error');
            showNotification('Não foi possível conectar ao servidor.', 'error');
        } finally {
            setTestingConnection(false);
        }
    };

    const fetchWhatsappStatus = async (wsUrlInput?: string) => {
        setLoadingWhatsappStatus(true);
        try {
            // Usa proxy server-side do Next.js para evitar bloqueios de CORS/loopback do browser
            const wsUrl = encodeURIComponent(wsUrlInput || config.whatsappUrl || 'http://127.0.0.1:5000');
            const response = await fetch(`/api/whatsapp/status?url=${wsUrl}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                setWhatsappStatus(data);
            } else {
                setWhatsappStatus(null);
            }
        } catch (error) {
            setWhatsappStatus(null);
        } finally {
            setLoadingWhatsappStatus(false);
        }
    };

    const handleTestWhatsappConnection = async () => {
        setTestingWhatsapp(true);
        setWhatsappConnectionStatus(null);
        try {
            const wsUrl = encodeURIComponent(config.whatsappUrl || 'http://127.0.0.1:5000');
            const response = await fetch(`/api/whatsapp/status?url=${wsUrl}`, { cache: 'no-store' });
            if (response.ok) {
                setWhatsappConnectionStatus('success');
                const data = await response.json();
                setWhatsappStatus(data);
                showNotification('Conexão com o servidor WhatsApp estabelecida!', 'success');
            } else {
                throw new Error('Servidor WhatsApp respondeu com erro');
            }
        } catch (error) {
            setWhatsappConnectionStatus('error');
            showNotification('Não foi possível conectar ao servidor WhatsApp.', 'error');
        } finally {
            setTestingWhatsapp(false);
        }
    };

    const handleDisconnectWhatsapp = async () => {
        const confirmed = await askConfirm({
            title: 'Desconectar WhatsApp',
            message: 'Tem certeza que deseja desconectar o celular do WhatsApp? Isso encerrará a sessão atual e exigirá uma nova leitura de QR Code.',
            type: 'danger'
        });

        if (confirmed) {
            try {
                const wsUrl = encodeURIComponent(config.whatsappUrl || 'http://127.0.0.1:5000');
                const response = await fetch(`/api/whatsapp/disconnect?url=${wsUrl}`, {
                    method: 'POST'
                });
                if (response.ok) {
                    showNotification('Sessão do WhatsApp encerrada com sucesso!', 'success');
                    fetchWhatsappStatus();
                } else {
                    showNotification('Falha ao encerrar sessão do WhatsApp.', 'error');
                }
            } catch (error) {
                showNotification('Não foi possível se comunicar com o servidor do WhatsApp.', 'error');
            }
        }
    };

    const fetchChannels = async () => {
        setLoadingChannels(true);
        try {
            const res = await fetch('/api/whatsapp/channels');
            if (res.ok) setWhatsappChannels(await res.json());
        } catch { /* noop */ } finally {
            setLoadingChannels(false);
        }
    };

    const fetchAllChannelStatuses = async (channels: any[]) => {
        const results: Record<string, any> = {};
        await Promise.all(channels.map(async (c) => {
            try {
                const wsUrl = encodeURIComponent(`http://127.0.0.1:${c.port}`);
                const res = await fetch(`/api/whatsapp/status?url=${wsUrl}`, { cache: 'no-store' });
                results[c.id] = res.ok ? await res.json() : null;
            } catch { results[c.id] = null; }
        }));
        setChannelStatuses(results);
    };

    useEffect(() => {
        if (activeTab === 'whatsapp') {
            fetchChannels().then(() => {
                // statuses are fetched after channels load via the next effect
            });
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'whatsapp' && whatsappChannels.length > 0) {
            fetchAllChannelStatuses(whatsappChannels);
            const interval = setInterval(() => fetchAllChannelStatuses(whatsappChannels), 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab, whatsappChannels]);

    const saveChannels = async (channels: any[]) => {
        setSavingChannel(true);
        try {
            const res = await fetch('/api/whatsapp/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(channels)
            });
            if (res.ok) {
                setWhatsappChannels(channels);
                showNotification('Canais salvos! Reinicie o projeto para aplicar.', 'success');
            }
        } catch { showNotification('Erro ao salvar canais.', 'error'); }
        finally { setSavingChannel(false); }
    };

    const openChannelModal = (channel?: any) => {
        if (channel) {
            setEditingChannel(channel);
            const secIds: number[] = Array.isArray(channel.sector_ids) && channel.sector_ids.length > 0
                ? channel.sector_ids.map(Number)
                : (channel.sector_id ? [Number(channel.sector_id)] : []);
            setChannelForm({
                id: channel.id,
                name: channel.name || '',
                port: channel.port || 5000,
                color: channel.color || '#8b5cf6',
                description: channel.description || '',
                sector_id: secIds[0] || null,
                sector_ids: secIds,
                allSectors: channel.all_sectors ?? (secIds.length === 0)
            });
        } else {
            setEditingChannel(null);
            const nextPort = whatsappChannels.length > 0
                ? Math.max(...whatsappChannels.map(c => c.port)) + 1
                : 5000;
            setChannelForm({
                name: '',
                port: nextPort,
                color: '#8b5cf6',
                description: '',
                sector_id: null,
                sector_ids: [],
                allSectors: true
            });
        }
        setIsChannelModalOpen(true);
    };

    // Mapeamento dos setores que já estão em uso por outras conexões WhatsApp
    const occupiedSectorsMap = React.useMemo(() => {
        const map: Record<number, string> = {};
        whatsappChannels.forEach(c => {
            if (c.id === editingChannel?.id) return;
            if (c.all_sectors) {
                sectors.forEach(s => {
                    map[s.id] = c.name;
                });
            } else {
                const secIds: number[] = Array.isArray(c.sector_ids) && c.sector_ids.length > 0
                    ? c.sector_ids.map(Number)
                    : (c.sector_id ? [Number(c.sector_id)] : []);
                secIds.forEach(id => {
                    map[id] = c.name;
                });
            }
        });
        return map;
    }, [whatsappChannels, editingChannel, sectors]);

    const handleSaveChannel = async () => {
        if (!channelForm.name || !channelForm.port) {
            showNotification('Nome e Porta são obrigatórios.', 'error');
            return;
        }

        const otherChannels = whatsappChannels.filter(c => c.id !== editingChannel?.id);

        // Validação: 'Todos os Setores' não pode sobrepor outros canais com setores vinculados
        if (channelForm.allSectors) {
            if (otherChannels.length > 0) {
                const conflicting = otherChannels.find(c => {
                    const hasSectors = c.all_sectors || (Array.isArray(c.sector_ids) && c.sector_ids.length > 0) || c.sector_id;
                    return hasSectors;
                });
                if (conflicting) {
                    showNotification(`Não é possível definir "Todos os Setores" pois a conexão "${conflicting.name}" já possui setores vinculados. Cada setor só pode pertencer a uma conexão WhatsApp.`, 'error');
                    return;
                }
            }
        } else {
            // Validação: se nenhum setor foi marcado
            if (channelForm.sector_ids.length === 0) {
                showNotification('Selecione ao menos um setor ou marque a opção "Utilizar em Todos os Setores".', 'warning');
                return;
            }

            // Validação: conflito de setor já utilizado por outra conexão
            const conflictingSectorIds = channelForm.sector_ids.filter(id => occupiedSectorsMap[id]);
            if (conflictingSectorIds.length > 0) {
                const conflictNames = conflictingSectorIds.map(id => {
                    const sec = sectors.find(s => s.id === id);
                    return `"${sec?.name || id}" (já em uso por ${occupiedSectorsMap[id]})`;
                }).join(', ');
                showNotification(`O setor ${conflictNames} não pode ser vinculado. Um mesmo setor não pode pertencer a duas conexões WhatsApp.`, 'error');
                return;
            }
        }

        const id = editingChannel?.id || channelForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const cleanChannelData = {
            ...channelForm,
            id,
            sector_id: channelForm.allSectors ? null : (channelForm.sector_ids[0] || null),
            sector_ids: channelForm.allSectors ? [] : channelForm.sector_ids,
            all_sectors: channelForm.allSectors
        };
        const updated = editingChannel
            ? whatsappChannels.map(c => c.id === editingChannel.id ? { ...c, ...cleanChannelData } : c)
            : [...whatsappChannels, cleanChannelData as any];
        await saveChannels(updated);
        setIsChannelModalOpen(false);
    };

    const handleDeleteChannel = async (channelId: string) => {
        const confirmed = await askConfirm({
            title: 'Excluir Canal',
            message: 'Tem certeza que deseja excluir este canal WhatsApp? Esta ação não pode ser desfeita.',
            type: 'danger'
        });
        if (confirmed) {
            await saveChannels(whatsappChannels.filter(c => c.id !== channelId));
        }
    };

    const handleDisconnectChannel = async (channel: any) => {
        const confirmed = await askConfirm({
            title: 'Desconectar WhatsApp',
            message: `Deseja desconectar a sessão do canal "${channel.name}"? O QR Code precisará ser lido novamente.`,
            type: 'danger'
        });
        if (confirmed) {
            try {
                const wsUrl = encodeURIComponent(`http://127.0.0.1:${channel.port}`);
                await fetch(`/api/whatsapp/disconnect?url=${wsUrl}`, { method: 'POST' });
                showNotification('Sessão encerrada!', 'success');
                fetchAllChannelStatuses(whatsappChannels);
            } catch { showNotification('Erro ao desconectar.', 'error'); }
        }
    };

    // =========================================================================
    // 📁 FUNÇÕES DA BASE DE ARQUIVOS (Métricas, Busca, Grupos e Setores)
    // =========================================================================
    const fetchFileStats = async () => {
        try {
            const res = await fetch('/api/whatsapp/files?action=stats', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setFileStats(data);
            }
        } catch (e) {
            console.error('Erro ao buscar estatísticas de arquivos:', e);
        }
    };

    const fetchFilesList = async (
        page = filesPage,
        type = fileTypeFilter,
        grupo = fileGroupFilter,
        setor = fileSectorFilter,
        search = fileSearchQuery
    ) => {
        setLoadingFiles(true);
        try {
            const queryParams = new URLSearchParams({
                action: 'search',
                page: String(page),
                limit: '12',
                type: type,
                grupo: grupo === 'all' ? '' : grupo,
                setor_id: setor === 'all' ? '' : setor,
                q: search
            });
            const res = await fetch(`/api/whatsapp/files?${queryParams.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setFilesList(data.files || []);
                setFilesTotal(data.total || 0);
                setFilesPage(data.page || 1);
                if (data.grupos) setFileGruposList(data.grupos);
            }
        } catch (e) {
            console.error('Erro ao buscar lista de arquivos:', e);
        } finally {
            setLoadingFiles(false);
        }
    };

    const handleOpenNewFileModal = () => {
        setSelectedUploadFile(null);
        setNewFileForm({
            titulo: '',
            grupo: 'Geral',
            setores: [],
            allSectors: true,
            descricao: ''
        });
        setIsNewFileModalOpen(true);
    };

    const handleUploadNewFile = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedUploadFile) {
            showNotification('Selecione um arquivo para cadastrar na base.', 'warning');
            return;
        }

        setUploadingFile(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedUploadFile);
            formData.append('titulo', newFileForm.titulo.trim() || selectedUploadFile.name);
            formData.append('grupo', newFileForm.grupo.trim() || 'Geral');
            formData.append('descricao', newFileForm.descricao.trim());
            formData.append('setores', JSON.stringify(newFileForm.allSectors ? [] : newFileForm.setores));

            const res = await fetch('/api/whatsapp/files/upload', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                showNotification('Arquivo pré-salvo cadastrado com sucesso!', 'success');
                setIsNewFileModalOpen(false);
                setSelectedUploadFile(null);
                setNewFileForm({
                    titulo: '',
                    grupo: 'Geral',
                    setores: [],
                    allSectors: true,
                    descricao: ''
                });
                fetchFileStats();
                fetchFilesList(1, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery);
            } else {
                const data = await res.json().catch(() => ({}));
                showNotification(data.error || 'Erro ao enviar arquivo.', 'error');
            }
        } catch {
            showNotification('Erro ao conectar ao servidor.', 'error');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleOpenEditFileModal = (file: FileItem) => {
        setEditingFile(file);
        const hasSpecificSectors = Array.isArray(file.setores) && file.setores.length > 0;
        setFileMetaForm({
            titulo: file.titulo || file.filename,
            grupo: file.grupo || 'Geral',
            setores: hasSpecificSectors ? (file.setores as any[]).map(s => Number(s)) : [],
            descricao: file.descricao || '',
            allSectors: !hasSpecificSectors
        });
        setIsEditFileModalOpen(true);
    };

    const handleSaveFileMetadata = async () => {
        if (!editingFile) return;
        setSavingFileMeta(true);
        try {
            const payload = {
                id: editingFile.id,
                url: editingFile.url,
                filename: editingFile.filename,
                titulo: fileMetaForm.titulo?.trim() || editingFile.filename,
                grupo: fileMetaForm.grupo?.trim() || 'Geral',
                setores: fileMetaForm.allSectors ? null : fileMetaForm.setores,
                descricao: fileMetaForm.descricao?.trim() || ''
            };

            const res = await fetch('/api/whatsapp/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                showNotification('Dados e permissões do arquivo salvos com sucesso!', 'success');
                setIsEditFileModalOpen(false);
                fetchFilesList(filesPage, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery);
            } else {
                showNotification('Erro ao salvar permissões do arquivo.', 'error');
            }
        } catch {
            showNotification('Erro ao conectar ao servidor.', 'error');
        } finally {
            setSavingFileMeta(false);
        }
    };

    const handleDeleteFile = async (file: FileItem) => {
        const confirmed = await askConfirm({
            title: 'Excluir Arquivo',
            message: `Deseja realmente excluir o arquivo "${file.filename}"? Ele será removido permanentemente do disco do servidor.`,
            type: 'danger'
        });
        if (confirmed) {
            try {
                const res = await fetch('/api/whatsapp/files', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: file.url, filename: file.filename, id: file.id })
                });
                if (res.ok) {
                    showNotification('Arquivo excluído com sucesso!', 'success');
                    fetchFileStats();
                    fetchFilesList(filesPage, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery);
                    if (filePreviewItem?.id === file.id) setFilePreviewItem(null);
                } else {
                    showNotification('Erro ao excluir arquivo.', 'error');
                }
            } catch {
                showNotification('Erro ao conectar ao servidor.', 'error');
            }
        }
    };

    // =========================================================================
    // ⚡ FUNÇÕES DE MENSAGENS RÁPIDAS (Globais da Empresa + Grupos + Setores)
    // =========================================================================
    const fetchQuickReplies = async (grupo = qrGroupFilter, setor = qrSectorFilter) => {
        setLoadingQuickReplies(true);
        try {
            const queryParams = new URLSearchParams();
            queryParams.set('escopo', 'global');
            if (grupo && grupo !== 'ALL' && grupo !== 'Todos') queryParams.set('grupo', grupo);
            if (setor && setor !== 'all') queryParams.set('setor_id', setor);

            const res = await fetch(`/api/whatsapp/quick-replies?${queryParams.toString()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setQuickReplies(data.quick_replies || []);
            }
        } catch (e) {
            console.error('Erro ao buscar respostas rápidas:', e);
        } finally {
            setLoadingQuickReplies(false);
        }
    };

    const openQrModal = (qr?: QuickReplyItem) => {
        if (qr) {
            setEditingQr(qr);
            const hasSpecificSectors = Array.isArray(qr.setores) && qr.setores.length > 0;
            const targetGroup = qr.grupo || qr.categoria || 'Geral';
            let initialBlocks: QuickReplyBlock[] = [];
            if (qr.blocos && Array.isArray(qr.blocos) && qr.blocos.length > 0) {
                initialBlocks = qr.blocos;
            } else if (qr.conteudo) {
                initialBlocks = [{ id: 'b_' + Date.now(), tipo: 'texto', texto: qr.conteudo }];
            } else {
                initialBlocks = [{ id: 'b_' + Date.now(), tipo: 'texto', texto: '' }];
            }

            setQrForm({
                titulo: qr.titulo,
                atalho: qr.atalho || '',
                conteudo: qr.conteudo || '',
                categoria: targetGroup,
                grupo: targetGroup,
                escopo: 'global',
                setores: hasSpecificSectors ? (qr.setores as any[]).map(s => Number(s)) : [],
                allSectors: !hasSpecificSectors,
                blocos: initialBlocks
            });
        } else {
            setEditingQr(null);
            setQrForm({
                titulo: '',
                atalho: '',
                conteudo: '',
                categoria: '👋 Atendimento Inicial',
                grupo: '👋 Atendimento Inicial',
                escopo: 'global',
                setores: [],
                allSectors: true,
                blocos: [{ id: 'b_' + Date.now(), tipo: 'texto', texto: '' }]
            });
        }
        setIsQrModalOpen(true);
    };

    const addQrTextBlock = () => {
        setQrForm(prev => ({
            ...prev,
            blocos: [...prev.blocos, { id: 'b_' + Date.now() + Math.random().toString(36).substring(2, 5), tipo: 'texto', texto: '' }]
        }));
    };

    const addQrFileBlock = (file: FileItem) => {
        setQrForm(prev => ({
            ...prev,
            blocos: [
                ...prev.blocos,
                {
                    id: 'b_' + Date.now() + Math.random().toString(36).substring(2, 5),
                    tipo: 'arquivo',
                    url: file.url,
                    filename: file.filename,
                    titulo: file.titulo || file.filename,
                    ext: file.ext,
                    mimetype: file.mimetype,
                    size_bytes: file.size_bytes,
                    size_formatted: file.size_formatted,
                    legenda: ''
                }
            ]
        }));
        setIsQrFilePickerOpen(false);
    };

    const removeQrBlock = (id: string) => {
        setQrForm(prev => ({
            ...prev,
            blocos: prev.blocos.length > 1 ? prev.blocos.filter(b => b.id !== id) : prev.blocos
        }));
    };

    const moveQrBlock = (index: number, direction: 'up' | 'down') => {
        setQrForm(prev => {
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= prev.blocos.length) return prev;
            const newBlocks = [...prev.blocos];
            const temp = newBlocks[index];
            newBlocks[index] = newBlocks[targetIndex];
            newBlocks[targetIndex] = temp;
            return { ...prev, blocos: newBlocks };
        });
    };

    const updateQrBlock = (id: string, patch: Partial<QuickReplyBlock>) => {
        setQrForm(prev => ({
            ...prev,
            blocos: prev.blocos.map(b => b.id === id ? ({ ...b, ...patch } as QuickReplyBlock) : b)
        }));
    };

    const insertVariableInBlock = (blockId: string, variableTag: string) => {
        setQrForm(prev => ({
            ...prev,
            blocos: prev.blocos.map(b => {
                if (b.id === blockId && b.tipo === 'texto') {
                    return { ...b, texto: (b.texto || '') + variableTag };
                }
                return b;
            })
        }));
    };

    const resolvePreviewVariables = (text: string) => {
        if (!text) return '';
        const now = new Date();
        const hours = now.getHours();
        const saudacao = hours >= 5 && hours < 12 ? 'Bom dia' : (hours >= 12 && hours < 18 ? 'Boa tarde' : 'Boa noite');
        const dataStr = now.toLocaleDateString('pt-BR');
        const atendenteNome = user?.full_name?.split(' ')[0] || user?.username || 'Atendente';

        return text
            .replace(/\{cliente_nome\}/gi, 'Maria Silva')
            .replace(/\{atendente_nome\}/gi, atendenteNome)
            .replace(/\{saudacao\}/gi, saudacao)
            .replace(/\{data_atual\}/gi, dataStr);
    };

    const handleSaveQuickReply = async () => {
        if (!qrForm.titulo?.trim()) {
            showNotification('Preencha o título da mensagem rápida.', 'error');
            return;
        }

        const validBlocks = qrForm.blocos.filter(b => {
            if (b.tipo === 'texto') return b.texto.trim().length > 0;
            if (b.tipo === 'arquivo') return Boolean(b.url);
            return false;
        });

        if (validBlocks.length === 0) {
            showNotification('Adicione ao menos um bloco de texto ou arquivo na sequência.', 'error');
            return;
        }

        // Sintetiza conteúdo de texto para listagem/fallback
        const textParts = validBlocks.filter(b => b.tipo === 'texto').map(b => (b as any).texto);
        const synthesizedContent = textParts.length > 0 ? textParts.join('\n\n') : `[${validBlocks.length} arquivo(s)]`;

        setSavingQr(true);
        try {
            const finalGroup = qrForm.grupo?.trim() || qrForm.categoria?.trim() || 'Geral';
            const payload = {
                titulo: qrForm.titulo.trim(),
                atalho: qrForm.atalho?.trim() || '',
                conteudo: synthesizedContent,
                blocos: validBlocks,
                categoria: finalGroup,
                grupo: finalGroup,
                escopo: qrForm.escopo || 'global',
                setores: qrForm.allSectors ? null : qrForm.setores,
                usuario_id: qrForm.escopo === 'pessoal' ? (user?.id ? String(user.id) : 'user') : null,
                usuario_nome: user?.full_name || user?.username || 'Gestor'
            };

            let res;
            if (editingQr) {
                res = await fetch(`/api/whatsapp/quick-replies?id=${editingQr.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/whatsapp/quick-replies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                showNotification(editingQr ? 'Mensagem rápida atualizada!' : 'Mensagem rápida criada com sucesso!', 'success');
                setIsQrModalOpen(false);
                fetchQuickReplies(qrGroupFilter, qrSectorFilter);
            } else {
                showNotification('Erro ao salvar mensagem rápida.', 'error');
            }
        } catch {
            showNotification('Erro ao conectar ao servidor.', 'error');
        } finally {
            setSavingQr(false);
        }
    };

    const handleDeleteQuickReply = async (qr: QuickReplyItem) => {
        const confirmed = await askConfirm({
            title: 'Excluir Mensagem Rápida',
            message: `Deseja realmente excluir a mensagem rápida "${qr.titulo}"?`,
            type: 'danger'
        });
        if (confirmed) {
            try {
                const res = await fetch(`/api/whatsapp/quick-replies?id=${qr.id}`, { method: 'DELETE' });
                if (res.ok) {
                    showNotification('Mensagem rápida excluída!', 'success');
                    fetchQuickReplies(qrGroupFilter, qrSectorFilter);
                } else {
                    showNotification('Erro ao excluir mensagem rápida.', 'error');
                }
            } catch {
                showNotification('Erro de conexão.', 'error');
            }
        }
    };

    const handleReset = async () => {
        const confirmed = await askConfirm({
            title: 'Restaurar Padrões',
            message: 'Deseja restaurar as configurações padrão? Esta ação não pode ser desfeita.',
            type: 'info'
        });

        if (confirmed) {
            const defaults = {
                apiUrl: getDefaultBaseURL(),
                ollamaUrl: 'http://localhost:11434',
                whatsappUrl: 'http://localhost:5000',
                aiSource: 'centralized' as 'centralized' | 'local',
                textModel: 'phi3',
                visionModel: 'moondream',
                theme: 'dark' as any,
                userConfigured: false // Resetar para automático ao restaurar padrões
            };
            setConfig(defaults);
            setTheme('dark');
            localStorage.setItem('system_config', JSON.stringify(defaults));
            window.dispatchEvent(new Event('storage'));
            refreshSettings();
            showNotification('Configurações restauradas para o padrão.', 'info');
        }
    };

    const changeThemePreview = (newTheme: any) => {
        setConfig({ ...config, theme: newTheme });
        setTheme(newTheme);
    };

    const getModelTip = (modelName: string) => {
        const baseName = modelName.split(':')[0].toLowerCase();
        return MODEL_TIPS[baseName] || { label: 'Desconhecido', color: 'text-gray-500', speed: '?', quality: '?' };
    };

    const zoomedQr = zoomedChannelId ? channelStatuses[zoomedChannelId]?.qr : null;

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="w-full p-8 pb-32 space-y-10 animate-page-in">
                    {/* Header Integrado */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                        <div className="space-y-2">
                            <h1 className="text-5xl font-black font-display tracking-tight text-foreground uppercase italic px-1">
                                Ajustes <span className="text-accent-theme">do Sistema</span>
                            </h1>
                            <p className="text-[var(--color-text-muted)] text-sm font-medium pl-1">
                                {SETTINGS_TABS.find(t => t.id === activeTab)?.label} Centralizado
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-10 items-start">
                        {/* Navegação Lateral de Abas */}
                        <div className="w-full lg:w-72 space-y-2 shrink-0">
                            {SETTINGS_TABS.filter(tab => !tab.roles || (user && tab.roles.includes(user.role))).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        "w-full flex items-center gap-4 px-6 py-4 rounded-3xl transition-colors duration-200 group relative",
                                        activeTab === tab.id
                                            ? "text-white z-20"
                                            : "glass-card hover:bg-white/5 text-[var(--color-text-muted)] hover:text-foreground hover:scale-[1.02] active:scale-95"
                                    )}
                                >
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="activeTabBackground"
                                            className="absolute inset-0 bg-accent-theme shadow-xl shadow-accent-theme/20 rounded-3xl"
                                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                        />
                                    )}
                                    <tab.icon className={clsx("w-5 h-5 relative z-10", activeTab === tab.id ? "text-white" : tab.color)} />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] relative z-10">{tab.label}</span>
                                    {activeTab === tab.id && (
                                        <motion.div
                                            layoutId="activeTabSideIndicator"
                                            className="absolute left-0 top-4 bottom-4 w-1 bg-white/40 rounded-r-full shadow-[2px_0_8px_rgba(255,255,255,0.3)] z-10"
                                            transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Área de Conteúdo Dinâmico */}
                        <div className="flex-1 w-full space-y-10">

                            {activeTab === 'general' && (
                                <motion.div
                                    key="general"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="glass-card p-8 rounded-3xl space-y-8 relative group transition-all z-10"
                                >
                                    <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Globe className="w-20 h-20" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-accent-theme relative z-10">
                                        <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                            <Globe className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                            Conectividade <span className="text-accent-theme">de Rede</span>
                                        </h2>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="block text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80 mb-4">Servidor Central (API)</h4>
                                            <input
                                                className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all placeholder-[var(--color-text-muted)] font-mono text-sm shadow-inner"
                                                type="text"
                                                placeholder="Ex: http://192.168.1.50:8000"
                                                value={config.apiUrl}
                                                onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                                            />
                                            <div className="mt-4 flex items-center justify-between">
                                                <p className="text-[10px] text-[var(--color-text-muted)] font-mono italic">Backend FastAPI na rede local (Porta 8080).</p>
                                                <button
                                                    onClick={handleTestConnection}
                                                    disabled={testingConnection}
                                                    className={clsx(
                                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                                        connectionStatus === 'success' ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                                                            connectionStatus === 'error' ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                                                                "bg-white/5 hover:bg-white/10 text-foreground border border-white/10"
                                                    )}
                                                >
                                                    {testingConnection ? (
                                                        <>
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                            Testando...
                                                        </>
                                                    ) : connectionStatus === 'success' ? (
                                                        <>
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            Conectado
                                                        </>
                                                    ) : connectionStatus === 'error' ? (
                                                        <>
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Falha na Conexão
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Globe className="w-3 h-3" />
                                                            Testar Conexão
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h4 className="block text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80 mb-4">Processamento de IA (Ollama)</h4>
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={() => setConfig({ ...config, aiSource: 'centralized' })}
                                                    className={clsx(
                                                        "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                                                        config.aiSource === 'centralized'
                                                            ? "bg-accent-theme/10 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10"
                                                            : "bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10"
                                                    )}
                                                >
                                                    <Globe className="w-5 h-5" />
                                                    <span className="text-[10px] font-black uppercase">IA do Servidor</span>
                                                </button>
                                                <button
                                                    onClick={() => setConfig({ ...config, aiSource: 'local' })}
                                                    className={clsx(
                                                        "flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                                                        config.aiSource === 'local'
                                                            ? "bg-accent-theme/10 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10"
                                                            : "bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10"
                                                    )}
                                                >
                                                    <Cpu className="w-5 h-5" />
                                                    <span className="text-[10px] font-black uppercase">IA Local (PC)</span>
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-[var(--color-text-muted)] italic px-1">
                                                {config.aiSource === 'centralized'
                                                    ? "A estação usará a IA instalada no servidor central (Recomendado)."
                                                    : "A estação usará o Ollama instalado localmente neste computador."}
                                            </p>
                                        </div>

                                        <div className={clsx("transition-all duration-300", config.aiSource === 'local' ? "opacity-100 scale-100" : "opacity-40 grayscale pointer-events-none scale-95 origin-top")}>
                                            <h4 className="block text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80 mb-2">Ollama Local (URL)</h4>
                                            <input
                                                className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all font-mono text-sm shadow-inner"
                                                type="text"
                                                value={config.ollamaUrl}
                                                onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })}
                                            />
                                        </div>

                                        {/* Banco de Dados Ativo */}
                                        <div className="border-t border-border-theme pt-6 space-y-3">
                                            <h4 className="block text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80 mb-4">Banco de Dados Ativo</h4>
                                            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-border-theme">
                                                {dbInfo ? (
                                                    <>
                                                        <div className={clsx(
                                                            "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 border",
                                                            dbInfo.type === 'sqlite'
                                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                                : dbInfo.type === 'postgresql'
                                                                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                                    : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                                                        )}>
                                                            <HardDrive className="w-3 h-3" />
                                                            {dbInfo.label}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-mono text-foreground truncate">{dbInfo.details || '\u2014'}</p>
                                                            <p className="text-[9px] text-[var(--color-text-muted)] italic mt-0.5">
                                                                {dbInfo.type === 'sqlite'
                                                                    ? 'Arquivo local. Ideal para instalações simples.'
                                                                    : dbInfo.type === 'postgresql'
                                                                        ? 'Banco de dados remoto (PostgreSQL).'
                                                                        : 'Conexão personalizada.'}
                                                            </p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        <span className="text-xs">Carregando...</span>
                                                    </div>
                                                )}
                                            </div>
                                                <p className="text-[9px] text-[var(--color-text-muted)] italic px-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                                                Para alterar o banco de dados, execute o{' '}
                                                <code className="font-mono bg-white/5 px-1 rounded">config_db.exe</code>
                                                {' '}na pasta de instalação.
                                            </p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: WhatsApp */}
                            {activeTab === 'whatsapp' && (
                                <motion.div
                                    key="whatsapp"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="glass-card p-8 rounded-3xl space-y-8 relative group transition-all z-10"
                                >
                                    <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <MessageSquare className="w-20 h-20" />
                                        </div>
                                    </div>

                                    {/* Sub-Abas de Navegação com Indicador Deslizante Suave */}
                                    <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white/5 rounded-2xl border border-white/10 w-fit relative z-10">
                                        {[
                                            {
                                                id: 'channels' as const,
                                                label: 'Canais & Anti-Ban',
                                                icon: MessageSquare,
                                                onClick: () => setWhatsappSubTab('channels')
                                            },
                                            {
                                                id: 'files' as const,
                                                label: 'Base de Arquivos',
                                                icon: Folder,
                                                onClick: () => {
                                                    setWhatsappSubTab('files');
                                                    fetchFileStats();
                                                    fetchFilesList(1, fileTypeFilter, fileSearchQuery);
                                                }
                                            },
                                            {
                                                id: 'quick_replies' as const,
                                                label: 'Mensagens Rápidas',
                                                icon: Zap,
                                                onClick: () => {
                                                    setWhatsappSubTab('quick_replies');
                                                    fetchQuickReplies();
                                                }
                                            }
                                        ].map(tab => {
                                            const Icon = tab.icon;
                                            const isActive = whatsappSubTab === tab.id;

                                            return (
                                                <button
                                                    key={tab.id}
                                                    onClick={tab.onClick}
                                                    className={clsx(
                                                        "relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer select-none",
                                                        isActive
                                                            ? "text-white"
                                                            : "text-[var(--color-text-muted)] hover:text-foreground hover:bg-white/5"
                                                    )}
                                                >
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="activeWhatsappSubTabPill"
                                                            className="absolute inset-0 bg-accent-theme rounded-xl shadow-lg shadow-accent-theme/25"
                                                            transition={{ type: "spring", stiffness: 450, damping: 35 }}
                                                        />
                                                    )}
                                                    <span className="relative z-10 flex items-center gap-2">
                                                        <Icon className="w-4 h-4" />
                                                        {tab.label}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* ========================================================================= */}
                                    {/* CONTEÚDO DAS SUB-ABAS COM TRANSIÇÃO SUAVE (AnimatePresence)               */}
                                    {/* ========================================================================= */}
                                    <AnimatePresence mode="wait">
                                        {/* ========================================================================= */}
                                        {/* SUB-ABA 1: CANAIS & SEGURANÇA ANTI-BAN                                   */}
                                        {/* ========================================================================= */}
                                        {whatsappSubTab === 'channels' && (
                                            <motion.div
                                                key="channels"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                                className="space-y-8"
                                            >
                                                {/* Header */}
                                                <div className="flex items-center justify-between relative z-10">
                                                    <div className="flex items-center gap-3 text-accent-theme">
                                                        <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                                        <MessageSquare className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                                            Canais <span className="text-accent-theme">WhatsApp</span>
                                                        </h2>
                                                        <p className="text-xs text-[var(--color-text-muted)]">Gerencie instâncias, conexão de números e regras de envio</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => openChannelModal()}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-accent-theme hover:opacity-90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-accent-theme/20"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Novo Canal
                                                </button>
                                            </div>

                                            <div className="space-y-4">
                                                {loadingChannels ? (
                                                    <div className="flex items-center gap-2 text-[var(--color-text-muted)] p-6 bg-white/5 rounded-2xl">
                                                        <Loader2 className="w-4 h-4 animate-spin text-accent-theme" />
                                                        <span className="text-xs">Carregando canais...</span>
                                                    </div>
                                                ) : whatsappChannels.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center p-12 bg-white/3 rounded-2xl border border-dashed border-white/10 space-y-4 text-center">
                                                        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                                                            <MessageSquare className="w-7 h-7 text-violet-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-foreground">Nenhum canal configurado</p>
                                                            <p className="text-xs text-[var(--color-text-muted)] mt-1">Clique em "Novo Canal" para adicionar seu primeiro número de WhatsApp.</p>
                                                        </div>
                                                        <button
                                                            onClick={() => openChannelModal()}
                                                            className="flex items-center gap-2 px-4 py-2 bg-accent-theme hover:opacity-90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                            Adicionar Primeiro Canal
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {whatsappChannels.map(channel => {
                                                            const st = channelStatuses[channel.id];
                                                            const isReady = st?.status === 'pronto' || st?.status === 'autenticado';
                                                            const isWaiting = st?.status === 'aguardando_qr';
                                                            const isOffline = st === null || st === undefined;
                                                            const channelSectorIds: number[] = Array.isArray(channel.sector_ids) && channel.sector_ids.length > 0
                                                                ? channel.sector_ids.map(Number)
                                                                : (channel.sector_id ? [Number(channel.sector_id)] : []);
                                                            const linkedSectors = sectors.filter(s => channelSectorIds.includes(s.id));
                                                            const isAllSectors = channel.all_sectors || channelSectorIds.length === 0;

                                                            return (
                                                                <div key={channel.id} className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all space-y-4">
                                                                    {/* Card Header */}
                                                                    <div className="flex items-center gap-3">
                                                                        <div
                                                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0"
                                                                            style={{ backgroundColor: channel.color || '#8b5cf6' }}
                                                                        >
                                                                            {channel.name.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2">
                                                                                <p className="text-sm font-bold text-foreground truncate">{channel.name}</p>
                                                                                <span className={clsx(
                                                                                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0",
                                                                                    isReady ? "bg-green-500/15 text-green-400" :
                                                                                    isWaiting ? "bg-amber-500/15 text-amber-400" :
                                                                                    "bg-white/10 text-[var(--color-text-muted)]"
                                                                                )}>
                                                                                    <span className={clsx(
                                                                                        "w-1.5 h-1.5 rounded-full",
                                                                                        isReady ? "bg-green-400 animate-pulse" :
                                                                                        isWaiting ? "bg-amber-400 animate-pulse" : "bg-slate-500"
                                                                                    )} />
                                                                                    {isReady ? 'Conectado' : isWaiting ? 'Aguardando QR' : isOffline ? 'Offline' : 'Desconectado'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                                <p className="text-[10px] text-[var(--color-text-muted)] font-mono">Porta {channel.port}</p>
                                                                                <span className="text-[var(--color-text-muted)] text-[10px]">·</span>
                                                                                {isAllSectors ? (
                                                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 text-[9px] font-bold">
                                                                                        🌐 Todos os Setores (Geral)
                                                                                    </span>
                                                                                ) : (
                                                                                    <div className="flex items-center gap-1 flex-wrap">
                                                                                        {linkedSectors.map(sec => (
                                                                                            <span key={sec.id} className="px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/25 text-[9px] font-bold">
                                                                                                🏢 {sec.name}
                                                                                            </span>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                                {channel.description && (
                                                                                    <>
                                                                                        <span className="text-[var(--color-text-muted)] text-[10px]">·</span>
                                                                                        <p className="text-[10px] text-[var(--color-text-muted)] truncate">{channel.description}</p>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                            {isReady && (
                                                                                <button
                                                                                    onClick={() => handleDisconnectChannel(channel)}
                                                                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                                                                                >
                                                                                    Desconectar
                                                                                </button>
                                                                            )}
                                                                            <Link
                                                                                href={`/settings/bot/${channel.id}`}
                                                                                className="p-2 bg-white/5 hover:bg-violet-500/20 border border-white/5 hover:border-violet-500/30 text-[var(--color-text-muted)] hover:text-violet-400 rounded-lg transition-all"
                                                                                title="Configurar Bot"
                                                                            >
                                                                                <Bot className="w-3.5 h-3.5" />
                                                                            </Link>
                                                                            <button
                                                                                onClick={() => openChannelModal(channel)}
                                                                                className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-[var(--color-text-muted)] hover:text-foreground rounded-lg transition-all"
                                                                                title="Editar canal"
                                                                            >
                                                                                <Edit2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteChannel(channel.id)}
                                                                                className="p-2 bg-white/5 hover:bg-red-500/20 border border-white/5 hover:border-red-500/30 text-[var(--color-text-muted)] hover:text-red-400 rounded-lg transition-all"
                                                                                title="Excluir canal"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* QR Code Display */}
                                                                    {isWaiting && st?.qr && (
                                                                        <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                                                                            <div 
                                                                                className="p-2 bg-white rounded-xl shadow-lg shrink-0 cursor-zoom-in transition-all duration-300 hover:scale-[1.03] hover:shadow-xl active:scale-[0.98]"
                                                                                onClick={() => setZoomedChannelId(channel.id)}
                                                                                title="Clique para ampliar o QR Code"
                                                                            >
                                                                                <img src={st.qr} alt="QR Code" className="w-36 h-36 block" />
                                                                            </div>
                                                                            <div className="space-y-1 text-center sm:text-left">
                                                                                <p className="text-xs font-bold text-amber-400">Aguardando Scan do QR Code</p>
                                                                                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                                                                                    Abra o WhatsApp no celular do número <strong>{channel.name}</strong>,<br />
                                                                                    vá em <strong>Aparelhos Conectados</strong> e aponte a câmera para o QR ao lado.
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {whatsappChannels.length > 0 && (
                                                    <p className="text-[9px] text-[var(--color-text-muted)] italic flex items-center gap-1 px-1">
                                                        <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                                                        Após adicionar ou remover canais, reinicie o projeto para que os novos servidores sejam iniciados.
                                                    </p>
                                                )}
                                            </div>

                                            {/* Configurações de Segurança */}
                                            <hr className="border-white/5 my-6" />
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-3 text-accent-theme">
                                                    <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                                        <Shield className="w-5 h-5 text-accent-theme" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-bold text-foreground">Segurança e Proteção Anti-Ban</h3>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-medium">Controles para mitigar o risco de bloqueio da linha</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {/* Toggle 1: Warn on new number */}
                                                    <div className="flex items-start justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                                Aviso ao iniciar nova conversa ativa
                                                            </label>
                                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                                Exibe um alerta de segurança na tela antes de abrir conversas com contatos novos.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                const newVal = !systemSettings.whatsapp_warn_new_number;
                                                                if (!newVal) {
                                                                    const confirmed = await askConfirm({
                                                                        title: '⚠️ Aviso de Segurança',
                                                                        message: 'Desativar o aviso visual aumenta a chance de disparos acidentais a contatos não autorizados. Deseja mesmo desativar?',
                                                                        confirmText: 'Sim, Desativar',
                                                                        cancelText: 'Cancelar',
                                                                        type: 'danger'
                                                                    });
                                                                    if (!confirmed) return;
                                                                }
                                                                setSystemSettings({ ...systemSettings, whatsapp_warn_new_number: newVal });
                                                            }}
                                                            className={clsx(
                                                                "w-10 h-6 rounded-full p-1 transition-colors relative shrink-0",
                                                                systemSettings.whatsapp_warn_new_number ? "bg-accent-theme" : "bg-white/10"
                                                            )}
                                                        >
                                                            <span className={clsx(
                                                                "w-4 h-4 rounded-full bg-white block transition-all shadow",
                                                                systemSettings.whatsapp_warn_new_number ? "translate-x-4" : "translate-x-0"
                                                            )} />
                                                        </button>
                                                    </div>

                                                    {/* Toggle 2: Limit active chats */}
                                                    <div className="flex items-start justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-foreground">
                                                                Limitar novas conversas ativas por hora
                                                            </label>
                                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                                Impede disparos rápidos bloqueando o início de novos chats ativos acima de um limite definido.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                const newVal = !systemSettings.whatsapp_limit_active_chats;
                                                                if (!newVal) {
                                                                    const confirmed = await askConfirm({
                                                                        title: '⚠️ Aviso de Segurança',
                                                                        message: 'Desativar o limite de conversas por hora remove a proteção de envio em lote, elevando gravemente o risco de bloqueio da linha. Deseja prosseguir?',
                                                                        confirmText: 'Sim, Desativar',
                                                                        cancelText: 'Cancelar',
                                                                        type: 'danger'
                                                                    });
                                                                    if (!confirmed) return;
                                                                }
                                                                setSystemSettings({ ...systemSettings, whatsapp_limit_active_chats: newVal });
                                                            }}
                                                            className={clsx(
                                                                "w-10 h-6 rounded-full p-1 transition-colors relative shrink-0",
                                                                systemSettings.whatsapp_limit_active_chats ? "bg-accent-theme" : "bg-white/10"
                                                            )}
                                                        >
                                                            <span className={clsx(
                                                                "w-4 h-4 rounded-full bg-white block transition-all shadow",
                                                                systemSettings.whatsapp_limit_active_chats ? "translate-x-4" : "translate-x-0"
                                                            )} />
                                                        </button>
                                                    </div>

                                                    {/* Limit Input */}
                                                    {systemSettings.whatsapp_limit_active_chats && (
                                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-bold text-foreground">
                                                                    Limite de novos chats iniciados por hora
                                                                </label>
                                                                <p className="text-[10px] text-[var(--color-text-muted)]">
                                                                    Quantidade máxima de novas conversas ativas por hora, por atendente.
                                                                </p>
                                                            </div>
                                                            <input
                                                                type="number"
                                                                value={systemSettings.whatsapp_limit_count || 10}
                                                                onChange={e => setSystemSettings({ ...systemSettings, whatsapp_limit_count: Math.max(1, Number(e.target.value)) })}
                                                                className="w-24 bg-background/50 border border-white/10 rounded-xl px-3 py-2 text-center text-sm font-mono text-foreground focus:ring-1 focus:ring-accent-theme/30 outline-none"
                                                                min={1}
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Toggle 3: Operator Signature */}
                                                    <div className="flex items-start justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                                        <div className="space-y-1">
                                                            <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                                Assinatura do Atendente nas Mensagens
                                                            </label>
                                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                                Envia automaticamente o nome do atendente no cabeçalho das mensagens entregues ao cliente no WhatsApp.
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => setSystemSettings({ ...systemSettings, whatsapp_send_signature: !systemSettings.whatsapp_send_signature })}
                                                            className={clsx(
                                                                "w-10 h-6 rounded-full p-1 transition-colors relative shrink-0",
                                                                systemSettings.whatsapp_send_signature ? "bg-accent-theme" : "bg-white/10"
                                                            )}
                                                        >
                                                            <span className={clsx(
                                                                "w-4 h-4 rounded-full bg-white block transition-all shadow",
                                                                systemSettings.whatsapp_send_signature ? "translate-x-4" : "translate-x-0"
                                                            )} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="pt-2">
                                                    <button
                                                        onClick={handleSaveWhatsappSafetySettings}
                                                        disabled={isSavingWhatsappSafety}
                                                        className="premium-gradient text-white px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                                                    >
                                                        {isSavingWhatsappSafety ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                        Salvar Configurações de Atendimento e Segurança
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                        {/* ========================================================================= */}
                                        {/* SUB-ABA 2: BASE DE ARQUIVOS (Métricas, Grupos, Setores e Limpeza)        */}
                                        {/* ========================================================================= */}
                                        {whatsappSubTab === 'files' && (
                                            <motion.div
                                                key="files"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                                className="space-y-8"
                                            >
                                                {/* Header */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                                                    <div className="flex items-center gap-3 text-accent-theme">
                                                        <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                                            <Folder className="w-6 h-6 text-accent-theme" />
                                                        </div>
                                                        <div>
                                                            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                                                Central de <span className="text-accent-theme">Arquivos Pré-Salvos</span>
                                                            </h2>
                                                            <p className="text-xs text-[var(--color-text-muted)]">
                                                                Cadastre catálogos, manuais, tabelas e mídias da empresa para envio rápido durante os atendimentos
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={handleOpenNewFileModal}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-accent-theme hover:opacity-90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-accent-theme/20 cursor-pointer"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                            Novo Arquivo
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                fetchFileStats();
                                                                fetchFilesList(filesPage, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery);
                                                            }}
                                                            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                                            title="Recarregar arquivos"
                                                        >
                                                            <RefreshCw className={clsx("w-3.5 h-3.5", loadingFiles && "animate-spin")} />
                                                            Atualizar
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Métricas de Armazenamento em Disco */}
                                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Total Arquivos</span>
                                                        <p className="text-xl font-black text-foreground font-mono">{fileStats?.total_files || 0}</p>
                                                        <p className="text-[10px] text-accent-theme font-medium">pré-salvos na base</p>
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Espaço Ocupado</span>
                                                        <p className="text-xl font-black text-amber-400 font-mono">{fileStats?.total_size_formatted || '0 B'}</p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-medium">em disco</p>
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">🖼️ Imagens</span>
                                                        <p className="text-lg font-black text-foreground font-mono">{fileStats?.categories?.image?.count || 0}</p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{fileStats?.categories?.image?.formatted || '0 B'}</p>
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-violet-400">🎬 Vídeos</span>
                                                        <p className="text-lg font-black text-foreground font-mono">{fileStats?.categories?.video?.count || 0}</p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{fileStats?.categories?.video?.formatted || '0 B'}</p>
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">🎵 Áudios</span>
                                                        <p className="text-lg font-black text-foreground font-mono">{fileStats?.categories?.audio?.count || 0}</p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{fileStats?.categories?.audio?.formatted || '0 B'}</p>
                                                    </div>
                                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">📄 Documentos</span>
                                                        <p className="text-lg font-black text-foreground font-mono">{fileStats?.categories?.doc?.count || 0}</p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{fileStats?.categories?.doc?.formatted || '0 B'}</p>
                                                    </div>
                                                </div>

                                                {/* Barra de Filtros, Grupos e Busca */}
                                                <div className="space-y-3.5 bg-white/3 p-4 rounded-3xl border border-white/5">
                                                    {/* Linha 1: Busca e Filtro de Setor */}
                                                    <div className="flex flex-col sm:flex-row items-center gap-3">
                                                        <div className="relative flex-1 w-full">
                                                            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                            <input
                                                                type="text"
                                                                placeholder="Buscar por título, nome do arquivo, grupo ou descrição..."
                                                                value={fileSearchQuery}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setFileSearchQuery(val);
                                                                    fetchFilesList(1, fileTypeFilter, fileGroupFilter, fileSectorFilter, val);
                                                                }}
                                                                className="w-full pl-10 pr-9 h-10 rounded-2xl text-xs bg-white/5 border border-white/10 text-foreground placeholder-[var(--color-text-muted)] focus:outline-none focus:border-accent-theme transition-all"
                                                            />
                                                            {fileSearchQuery && (
                                                                <button
                                                                    onClick={() => {
                                                                        setFileSearchQuery('');
                                                                        fetchFilesList(1, fileTypeFilter, fileGroupFilter, fileSectorFilter, '');
                                                                    }}
                                                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center text-[10px] cursor-pointer"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Filtro por Setor Autorizado */}
                                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                                            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider shrink-0">
                                                                Setor:
                                                            </span>
                                                            <select
                                                                value={fileSectorFilter}
                                                                onChange={e => {
                                                                    const val = e.target.value;
                                                                    setFileSectorFilter(val);
                                                                    fetchFilesList(1, fileTypeFilter, fileGroupFilter, val, fileSearchQuery);
                                                                }}
                                                                className="h-10 px-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-foreground font-medium outline-none focus:border-accent-theme cursor-pointer"
                                                            >
                                                                <option value="all" className="bg-slate-900 text-white">🌐 Todos os Setores</option>
                                                                {sectors.map(sec => (
                                                                    <option key={sec.id} value={sec.id} className="bg-slate-900 text-white">
                                                                        🏢 {sec.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </div>

                                                    {/* Linha 2: Tipo de Arquivo & Grupos de Arquivos */}
                                                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pt-2 border-t border-white/5">
                                                        {/* Tipo */}
                                                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full lg:w-auto pb-1 lg:pb-0">
                                                            {[
                                                                { id: 'all', label: 'Todos os Tipos' },
                                                                { id: 'doc', label: '📄 Documentos' },
                                                                { id: 'image', label: '🖼️ Imagens' },
                                                                { id: 'video', label: '🎬 Vídeos' },
                                                                { id: 'audio', label: '🎵 Áudios' }
                                                            ].map(cat => (
                                                                <button
                                                                    key={cat.id}
                                                                    onClick={() => {
                                                                        setFileTypeFilter(cat.id);
                                                                        fetchFilesList(1, cat.id, fileGroupFilter, fileSectorFilter, fileSearchQuery);
                                                                    }}
                                                                    className={clsx(
                                                                        "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                                                                        fileTypeFilter === cat.id
                                                                            ? "bg-accent-theme text-white shadow-md shadow-accent-theme/20"
                                                                            : "bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground border border-white/5"
                                                                    )}
                                                                >
                                                                    {cat.label}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        {/* Grupos / Pastas */}
                                                        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar w-full lg:w-auto pb-1 lg:pb-0">
                                                            <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider shrink-0 mr-1">
                                                                Grupo:
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    setFileGroupFilter('all');
                                                                    fetchFilesList(1, fileTypeFilter, 'all', fileSectorFilter, fileSearchQuery);
                                                                }}
                                                                className={clsx(
                                                                    "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer",
                                                                    fileGroupFilter === 'all'
                                                                        ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                                                                        : "bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] border border-white/5"
                                                                )}
                                                            >
                                                                Todos os Grupos
                                                            </button>
                                                            {fileGruposList.map(g => (
                                                                <button
                                                                    key={g.name}
                                                                    onClick={() => {
                                                                        setFileGroupFilter(g.name);
                                                                        fetchFilesList(1, fileTypeFilter, g.name, fileSectorFilter, fileSearchQuery);
                                                                    }}
                                                                    className={clsx(
                                                                        "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
                                                                        fileGroupFilter === g.name
                                                                            ? "bg-violet-500/20 text-violet-300 border border-violet-500/40"
                                                                            : "bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] border border-white/5"
                                                                    )}
                                                                >
                                                                    <span>📁 {g.name}</span>
                                                                    <span className="text-[9px] px-1 rounded bg-white/10">{g.count}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Listagem de Arquivos */}
                                                {loadingFiles ? (
                                                    <div className="flex items-center justify-center gap-3 p-12 text-[var(--color-text-muted)] bg-white/5 rounded-3xl border border-white/5">
                                                        <Loader2 className="w-5 h-5 animate-spin text-accent-theme" />
                                                        <span className="text-sm font-medium">Carregando arquivos da biblioteca...</span>
                                                    </div>
                                                ) : filesList.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center p-12 bg-white/3 rounded-3xl border border-dashed border-white/10 space-y-3 text-center">
                                                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-[var(--color-text-muted)]">
                                                            <Folder className="w-6 h-6" />
                                                        </div>
                                                        <p className="text-sm font-bold text-foreground">Nenhum arquivo pré-salvo cadastrado</p>
                                                        <p className="text-xs text-[var(--color-text-muted)] max-w-md">
                                                            {fileSearchQuery || fileGroupFilter !== 'all' || fileSectorFilter !== 'all'
                                                                ? 'Nenhum arquivo corresponde aos filtros aplicados.'
                                                                : 'Adicione documentos, catálogos em PDF, tabelas de preços ou vídeos institucionais para que os atendentes possam enviar aos clientes com 1 clique.'}
                                                        </p>
                                                        {!fileSearchQuery && fileGroupFilter === 'all' && fileSectorFilter === 'all' && (
                                                            <button
                                                                onClick={handleOpenNewFileModal}
                                                                className="mt-2 flex items-center gap-2 px-4 py-2 bg-accent-theme text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-accent-theme/20"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                Cadastrar Primeiro Arquivo
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                                        {filesList.map(f => {
                                                            const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(f.ext);
                                                            const isVid = ['mp4', 'webm', 'mov'].includes(f.ext);
                                                            const isAud = ['mp3', 'ogg', 'wav', 'aac', 'opus'].includes(f.ext);
                                                            const hasSectors = Array.isArray(f.setores) && f.setores.length > 0;

                                                            return (
                                                                <div key={f.id} className="p-4 rounded-2xl bg-white/5 hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-3 group">
                                                                    <div className="space-y-2.5">
                                                                        {/* Header do Card: Grupo & Setores */}
                                                                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                                                            <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-[9px] font-bold text-slate-200 flex items-center gap-1">
                                                                                <Folder className="w-2.5 h-2.5 text-amber-400" />
                                                                                {f.grupo || 'Geral'}
                                                                            </span>

                                                                            {hasSectors ? (
                                                                                <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] font-bold">
                                                                                    🏢 {f.setores?.length} setor{(f.setores?.length || 0) > 1 ? 'es' : ''}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                                                                    🌐 Todos os Setores
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex items-start gap-3">
                                                                            {/* Thumbnail / Icon */}
                                                                            <div
                                                                                onClick={() => setFilePreviewItem(f)}
                                                                                className="w-14 h-14 rounded-xl bg-black/40 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden cursor-pointer relative group/preview"
                                                                            >
                                                                                {isImg ? (
                                                                                    <img src={f.url} alt={f.filename} className="w-full h-full object-cover group-hover/preview:scale-105 transition-transform" />
                                                                                ) : isVid ? (
                                                                                    <Video className="w-6 h-6 text-violet-400" />
                                                                                ) : isAud ? (
                                                                                    <Music className="w-6 h-6 text-cyan-400" />
                                                                                ) : (
                                                                                    <FileText className="w-6 h-6 text-blue-400" />
                                                                                )}
                                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 flex items-center justify-center transition-opacity">
                                                                                    <Eye className="w-4 h-4 text-white" />
                                                                                </div>
                                                                            </div>

                                                                            {/* File Info */}
                                                                            <div className="flex-1 min-w-0 space-y-1">
                                                                                <p className="text-xs font-bold text-foreground truncate" title={f.titulo || f.filename}>
                                                                                    {f.titulo || f.filename}
                                                                                </p>
                                                                                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] font-mono">
                                                                                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold uppercase">{f.ext}</span>
                                                                                    <span>{f.size_formatted || '—'}</span>
                                                                                </div>
                                                                                {f.descricao && (
                                                                                    <p className="text-[10px] text-[var(--color-text-muted)] truncate" title={f.descricao}>
                                                                                        {f.descricao}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Actions */}
                                                                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                                                                        <span className="text-[9px] text-[var(--color-text-muted)] font-mono">
                                                                            {f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''}
                                                                        </span>
                                                                        <div className="flex items-center gap-1.5">
                                                                            <button
                                                                                onClick={() => handleOpenEditFileModal(f)}
                                                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                                                                title="Editar Título, Grupo e Permissões"
                                                                            >
                                                                                <Edit2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setFilePreviewItem(f)}
                                                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                                                                title="Visualizar"
                                                                            >
                                                                                <Eye className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <a
                                                                                href={f.url}
                                                                                download={f.filename}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-accent-theme/20 text-[var(--color-text-muted)] hover:text-accent-theme transition-all cursor-pointer"
                                                                                title="Baixar Arquivo"
                                                                            >
                                                                                <Download className="w-3.5 h-3.5" />
                                                                            </a>
                                                                            <button
                                                                                onClick={() => handleDeleteFile(f)}
                                                                                className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-all cursor-pointer"
                                                                                title="Excluir arquivo"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                            {/* Paginação */}
                                            {filesTotal > 12 && (
                                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                                    <span className="text-xs text-[var(--color-text-muted)]">
                                                        Total de <strong>{filesTotal}</strong> arquivos
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            disabled={filesPage <= 1}
                                                            onClick={() => fetchFilesList(filesPage - 1, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery)}
                                                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold disabled:opacity-30 transition-all cursor-pointer"
                                                        >
                                                            Anterior
                                                        </button>
                                                        <span className="text-xs font-mono font-bold px-2">Página {filesPage}</span>
                                                        <button
                                                            disabled={filesPage * 12 >= filesTotal}
                                                            onClick={() => fetchFilesList(filesPage + 1, fileTypeFilter, fileGroupFilter, fileSectorFilter, fileSearchQuery)}
                                                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold disabled:opacity-30 transition-all cursor-pointer"
                                                        >
                                                            Próxima
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            </motion.div>
                                        )}

                                        {/* ========================================================================= */}
                                        {/* SUB-ABA 3: MENSAGENS RÁPIDAS GLOBAIS (GRUPOS E SETORES)                  */}
                                        {/* ========================================================================= */}
                                        {whatsappSubTab === 'quick_replies' && (
                                            <motion.div
                                                key="quick_replies"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                                className="space-y-8"
                                            >
                                                {/* Header */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                                                <div className="flex items-center gap-3 text-accent-theme">
                                                    <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                                        <Zap className="w-6 h-6 text-accent-theme" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                                            Central de <span className="text-accent-theme">Mensagens Rápidas</span>
                                                        </h2>
                                                        <p className="text-xs text-[var(--color-text-muted)]">
                                                            Organize templates da empresa em grupos e defina o controle de acesso por setor
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => openQrModal()}
                                                    className="flex items-center gap-2 px-4 py-2.5 bg-accent-theme hover:opacity-90 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-accent-theme/20 cursor-pointer"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Nova Mensagem Rápida
                                                </button>
                                            </div>

                                            {/* Barra de Filtros: Setores, Busca e Grupos */}
                                            <div className="space-y-3.5 bg-white/3 p-4 rounded-3xl border border-white/5">
                                                {/* Linha 1: Busca e Setor */}
                                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                                    {/* Busca */}
                                                    <div className="relative flex-1 w-full">
                                                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        <input
                                                            type="text"
                                                            placeholder="Buscar por título, atalho (/pix), grupo ou conteúdo..."
                                                            value={qrSearchQuery}
                                                            onChange={e => setQrSearchQuery(e.target.value)}
                                                            className="w-full pl-10 pr-4 h-10 rounded-2xl text-xs bg-white/5 border border-white/10 text-foreground placeholder-[var(--color-text-muted)] focus:outline-none focus:border-accent-theme transition-all"
                                                        />
                                                    </div>

                                                    {/* Filtro de Setor */}
                                                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                                                        <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider shrink-0">
                                                            Setor:
                                                        </span>
                                                        <select
                                                            value={qrSectorFilter}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setQrSectorFilter(val);
                                                                fetchQuickReplies(qrGroupFilter, val);
                                                            }}
                                                            className="h-10 px-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-foreground font-medium outline-none focus:border-accent-theme cursor-pointer"
                                                        >
                                                            <option value="all" className="bg-slate-900 text-white">🌐 Todos os Setores</option>
                                                            {sectors.map(sec => (
                                                                <option key={sec.id} value={sec.id} className="bg-slate-900 text-white">
                                                                    🏢 {sec.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Linha 2: Grupos / Categorias de Mensagens Rápidas */}
                                                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-2 border-t border-white/5 pb-1">
                                                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider shrink-0 mr-1">
                                                        Grupo:
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            setQrGroupFilter('ALL');
                                                            fetchQuickReplies('ALL', qrSectorFilter);
                                                        }}
                                                        className={clsx(
                                                            "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                                                            qrGroupFilter === 'ALL'
                                                                ? "bg-accent-theme text-white shadow-md shadow-accent-theme/20"
                                                                : "bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] border border-white/5"
                                                        )}
                                                    >
                                                        Todos os Grupos
                                                    </button>
                                                    {Array.from(new Set(quickReplies.map(r => r.grupo || r.categoria || 'Geral'))).map(g => (
                                                        <button
                                                            key={g}
                                                            onClick={() => {
                                                                setQrGroupFilter(g);
                                                                fetchQuickReplies(g, qrSectorFilter);
                                                            }}
                                                            className={clsx(
                                                                "px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
                                                                qrGroupFilter === g
                                                                    ? "bg-accent-theme text-white shadow-md shadow-accent-theme/20"
                                                                    : "bg-white/5 hover:bg-white/10 text-[var(--color-text-muted)] border border-white/5"
                                                            )}
                                                        >
                                                            <span>📁 {g}</span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/10">
                                                                {quickReplies.filter(r => (r.grupo || r.categoria || 'Geral') === g).length}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Listagem de Mensagens Rápidas */}
                                            {loadingQuickReplies ? (
                                                <div className="flex items-center justify-center gap-3 p-12 text-[var(--color-text-muted)] bg-white/5 rounded-3xl border border-white/5">
                                                    <Loader2 className="w-5 h-5 animate-spin text-accent-theme" />
                                                    <span className="text-sm font-medium">Carregando mensagens rápidas...</span>
                                                </div>
                                            ) : (
                                                (() => {
                                                    let filtered = quickReplies;
                                                    if (qrSearchQuery.trim()) {
                                                        const s = qrSearchQuery.toLowerCase().trim();
                                                        filtered = filtered.filter(r =>
                                                            r.titulo.toLowerCase().includes(s) ||
                                                            (r.atalho && r.atalho.toLowerCase().includes(s)) ||
                                                            r.conteudo.toLowerCase().includes(s) ||
                                                            ((r.grupo || r.categoria) && (r.grupo || r.categoria).toLowerCase().includes(s))
                                                        );
                                                    }

                                                    if (filtered.length === 0) {
                                                        return (
                                                            <div className="flex flex-col items-center justify-center p-12 bg-white/3 rounded-3xl border border-dashed border-white/10 space-y-3 text-center">
                                                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-amber-400">
                                                                    <Zap className="w-6 h-6" />
                                                                </div>
                                                                <p className="text-sm font-bold text-foreground">Nenhuma mensagem rápida encontrada</p>
                                                                <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
                                                                    Crie templates globais com <strong>/atalho</strong> e vincule aos setores para agilizar o atendimento da equipe.
                                                                </p>
                                                                <button
                                                                    onClick={() => openQrModal()}
                                                                    className="flex items-center gap-2 px-4 py-2 bg-accent-theme text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                                                                >
                                                                    <Plus className="w-3.5 h-3.5" />
                                                                    Criar Primeira Mensagem
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {filtered.map(qr => {
                                                                const hasSectors = Array.isArray(qr.setores) && qr.setores.length > 0;

                                                                return (
                                                                    <div
                                                                        key={qr.id}
                                                                        className="p-5 rounded-2xl bg-white/5 hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4 group"
                                                                    >
                                                                        <div className="space-y-2.5">
                                                                            {/* Header do Card */}
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                                    <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/10 text-[9px] font-bold text-slate-200 flex items-center gap-1">
                                                                                        <Folder className="w-2.5 h-2.5 text-amber-400" />
                                                                                        {qr.grupo || qr.categoria || 'Geral'}
                                                                                    </span>

                                                                                    {hasSectors ? (
                                                                                        <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[9px] font-bold">
                                                                                            🏢 {qr.setores?.length} setor{(qr.setores?.length || 0) > 1 ? 'es' : ''}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                                                                            🌐 Todos os Setores
                                                                                        </span>
                                                                                    )}

                                                                                    {qr.blocos && qr.blocos.length > 1 && (
                                                                                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[9px] font-bold flex items-center gap-1">
                                                                                            <Layers className="w-2.5 h-2.5" />
                                                                                            {qr.blocos.length} passos ({qr.blocos.filter(b => b.tipo === 'texto').length} textos, {qr.blocos.filter(b => b.tipo === 'arquivo').length} anexos)
                                                                                        </span>
                                                                                    )}
                                                                                    {qr.blocos && qr.blocos.length === 1 && qr.blocos[0].tipo === 'arquivo' && (
                                                                                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[9px] font-bold flex items-center gap-1">
                                                                                            <Paperclip className="w-2.5 h-2.5" /> 1 arquivo
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                {qr.atalho && (
                                                                                    <span className="px-2 py-0.5 rounded-lg bg-accent-theme/15 text-accent-theme border border-accent-theme/25 font-mono text-xs font-bold">
                                                                                        {qr.atalho}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* Título */}
                                                                            <h4 className="text-sm font-bold text-foreground">{qr.titulo}</h4>

                                                                            {/* Conteúdo */}
                                                                            <p className="text-xs text-[var(--color-text-muted)] bg-black/20 p-3 rounded-xl border border-white/5 line-clamp-3 font-normal leading-relaxed">
                                                                                "{qr.conteudo}"
                                                                            </p>
                                                                        </div>

                                                                        {/* Footer com Ações */}
                                                                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px]">
                                                                            <span className="text-[9px] text-[var(--color-text-muted)]">
                                                                                Template global para a equipe
                                                                            </span>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <button
                                                                                    onClick={() => openQrModal(qr)}
                                                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                                                                    title="Editar mensagem"
                                                                                >
                                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeleteQuickReply(qr)}
                                                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-all cursor-pointer"
                                                                                    title="Excluir mensagem"
                                                                                >
                                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                </div>
                                            );
                                        })()
                                    )}
                                </motion.div>
                            )}
                                    </AnimatePresence>

                                </motion.div>
                            )}

                            {/* Aba: Motores IA */}
                            {activeTab === 'ai' && (
                                <motion.div
                                    key="ai"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="glass-card p-8 rounded-3xl space-y-8 relative group transition-all z-10"
                                >
                                    <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Cpu className="w-20 h-20" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-accent-theme relative z-10">
                                        <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                            <Cpu className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                            Motores <span className="text-accent-theme">de IA</span>
                                        </h2>
                                    </div>

                                    <div className="space-y-6">
                                        <CustomSelect
                                            label="Modelo de Texto"
                                            value={config.textModel}
                                            onChange={val => setConfig({ ...config, textModel: val })}
                                            icon={loadingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3" />}
                                            options={textModels.map(m => ({
                                                value: m.name,
                                                label: m.name,
                                                icon: <Cpu className="w-4 h-4" />,
                                                subtitle: getModelTip(m.name).label
                                            }))}
                                        />
                                        {config.textModel && (
                                            <div className="mt-1 flex items-center justify-between px-2">
                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-accent-theme/10 ${getModelTip(config.textModel).color}`}>
                                                    {getModelTip(config.textModel).label}
                                                </span>
                                                <span className="text-[8px] text-[var(--color-text-muted)] font-mono font-bold">
                                                    V: {getModelTip(config.textModel).speed} | Q: {getModelTip(config.textModel).quality}
                                                </span>
                                            </div>
                                        )}

                                        <CustomSelect
                                            label="Visão (Multimodal)"
                                            value={config.visionModel}
                                            onChange={val => setConfig({ ...config, visionModel: val })}
                                            icon={<HardDrive className="w-3 h-3" />}
                                            options={visionModels.length > 0 ? visionModels.map(m => ({
                                                value: m.name,
                                                label: m.name,
                                                icon: <HardDrive className="w-4 h-4" />
                                            })) : [{ value: '', label: 'Nenhum modelo detectado', className: 'opacity-50' }]}
                                        />
                                        {visionModels.length === 0 && (
                                            <p className="mt-1 text-[8px] text-orange-500 font-mono font-bold px-2">⚠️ Nenhum modelo CLIP detectado.</p>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: Organização */}
                            {activeTab === 'org' && (
                                <motion.div
                                    key="org"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-10"
                                >
                                    {/* Gestão de Setores */}
                                    <div className="glass-card p-10 rounded-3xl space-y-10 relative group transition-all z-0">
                                        <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                                <FolderPlus className="w-24 h-24" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-emerald-500 relative z-10">
                                            <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                                                <Layers className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">
                                                Gestão <span className="text-emerald-500">de Setores</span>
                                            </h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h4 className="text-[13px] font-black font-display text-[var(--color-text-muted)] uppercase italic tracking-[0.15em]">
                                                        {editingSector ? 'Editar Setor' : 'Novo Setor'}
                                                    </h4>
                                                    {editingSector && (
                                                        <button
                                                            onClick={cancelEditSector}
                                                            className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-wider flex items-center gap-1"
                                                        >
                                                            <RotateCcw className="w-3 h-3" /> Cancelar
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
                                                    <div>
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Nome do Setor</label>
                                                        <input
                                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-xl p-4 text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all shadow-sm"
                                                            placeholder="Ex: Comercial, Administrativo, Suporte..."
                                                            value={newSectorName}
                                                            onChange={e => setNewSectorName(e.target.value)}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleCreateSector}
                                                        className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-theme/20 active:scale-95"
                                                    >
                                                        {editingSector ? <Save className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                                                        {editingSector ? 'Salvar Alterações' : 'Criar Setor'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Listagem */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-[13px] font-black font-display italic text-foreground uppercase tracking-[0.15em]">Setores <span className="text-accent-theme">Ativos</span></h4>
                                                        <button
                                                            onClick={() => setShowOnlyActiveSectors(!showOnlyActiveSectors)}
                                                            className={clsx(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase transition-all border",
                                                                showOnlyActiveSectors
                                                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                                                    : "bg-white/5 text-[var(--color-text-muted)] border-white/5 hover:bg-white/10"
                                                            )}
                                                            title={showOnlyActiveSectors ? "Mostrar todos" : "Mostrar apenas ativos"}
                                                        >
                                                            {showOnlyActiveSectors ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="bg-background/20 rounded-3xl border border-border-theme p-6 space-y-2 shadow-inner">
                                                    {sectors.filter(s => !showOnlyActiveSectors || s.is_active).length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhum setor encontrado.</div> :
                                                        sectors.filter(s => !showOnlyActiveSectors || s.is_active).map(sector => (
                                                            <div key={sector.id} className={clsx(
                                                                "flex items-center justify-between p-4 rounded-2xl border border-border-theme group/item transition-all shadow-sm",
                                                                sector.is_active ? "bg-card/40 hover:bg-card/60" : "bg-card/20 opacity-60 hover:opacity-100"
                                                            )}>
                                                                <div className="flex items-center gap-3">
                                                                    <Tag className={clsx("w-4 h-4", sector.is_active ? "text-emerald-500" : "text-gray-500")} />
                                                                    <span className={clsx("text-sm font-bold tracking-tight", !sector.is_active && "line-through text-gray-500")}>
                                                                        {sector.name}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1 opacity-100">
                                                                    <button
                                                                        onClick={() => handleToggleSectorActive(sector)}
                                                                        title={sector.is_active ? "Desativar" : "Ativar"}
                                                                        className={clsx(
                                                                            "p-2 rounded-xl transition-colors",
                                                                            sector.is_active ? "text-gray-500 hover:text-orange-500 hover:bg-orange-500/10" : "text-green-500 hover:bg-green-500/10"
                                                                        )}
                                                                    >
                                                                        {sector.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleEditSector(sector)}
                                                                        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl"
                                                                    >
                                                                        <Edit2 className="w-3 h-3" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteSector(sector.id)}
                                                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gestão de Categorias */}
                                    <div className="glass-card p-10 rounded-3xl space-y-10 relative group transition-all z-10">
                                        <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                                <FolderPlus className="w-24 h-24" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-blue-500 relative z-10">
                                            <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                                <FolderPlus className="w-5 h-5 text-blue-500" />
                                            </div>
                                            <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">
                                                Estrutura <span className="text-blue-500">de Categorias</span>
                                            </h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h4 className="text-[13px] font-black font-display text-[var(--color-text-muted)] uppercase italic tracking-[0.15em]">
                                                        {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                                                    </h4>
                                                    {editingCategory && (
                                                        <button onClick={cancelEditCategory} className="text-[9px] font-black text-red-500 uppercase hover:underline">Cancelar Edição</button>
                                                    )}
                                                </div>
                                                <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
                                                    <CustomSelect
                                                        label="Setor Relacionado"
                                                        value={newCategorySectorId || ''}
                                                        onChange={(val) => setNewCategorySectorId(val === '' ? undefined : Number(val))}
                                                        options={[
                                                            { value: '', label: 'Global (Todos os Setores)', icon: <Users className="w-4 h-4 opacity-50" /> },
                                                            ...sectors.map(s => ({
                                                                value: s.id,
                                                                label: s.name,
                                                                icon: <Users className="w-4 h-4 text-emerald-500" />
                                                            }))
                                                        ]}
                                                    />
                                                    <div>
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Nome da Categoria</label>
                                                        <input
                                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-xl p-4 text-sm focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all shadow-sm"
                                                            placeholder="Ex: Hardware, Software, Financeiro..."
                                                            value={newCategoryName}
                                                            onChange={e => setNewCategoryName(e.target.value)}
                                                        />
                                                    </div>
                                                    <CustomSelect
                                                        label="Categoria Pai (Opcional)"
                                                        value={parentCategory}
                                                        onChange={setParentCategory}
                                                        options={[
                                                            { value: '', label: 'Nenhuma (Categoria Principal)', icon: <Tag className="w-4 h-4 opacity-50" /> },
                                                            ...categories.filter(c => !c.parent_id).map(cat => ({
                                                                value: cat.id,
                                                                label: cat.name,
                                                                icon: <Tag className="w-4 h-4 text-accent-theme" />
                                                            }))
                                                        ]}
                                                    />
                                                    <button
                                                        onClick={handleCreateCategory}
                                                        className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-theme/20 active:scale-95"
                                                    >
                                                        {editingCategory ? <Save className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                                                        {editingCategory ? 'Salvar Alterações' : 'Criar Categoria'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Listagem */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-[13px] font-black font-display italic text-foreground/80 uppercase tracking-[0.15em]">Categorias <span className="text-accent-theme">Ativas</span></h4>

                                                        {/* Bulk Expand/Collapse */}
                                                        <div className="flex items-center bg-background/40 rounded-full border border-border-theme p-0.5">
                                                            <button
                                                                onClick={expandAllCategories}
                                                                className="p-1.5 hover:bg-white/10 rounded-full text-[var(--color-text-muted)] hover:text-accent-theme transition-all"
                                                                title="Expandir todas"
                                                            >
                                                                <ChevronDown className="w-3.5 h-3.5" />
                                                            </button>
                                                            <div className="w-[1px] h-3 bg-border-theme" />
                                                            <button
                                                                onClick={collapseAllCategories}
                                                                className="p-1.5 hover:bg-white/10 rounded-full text-[var(--color-text-muted)] hover:text-accent-theme transition-all"
                                                                title="Recolher todas"
                                                            >
                                                                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                                                            </button>
                                                        </div>

                                                        {/* Active Filter */}
                                                        <button
                                                            onClick={() => setShowOnlyActiveCategories(!showOnlyActiveCategories)}
                                                            className={clsx(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase transition-all border",
                                                                showOnlyActiveCategories
                                                                    ? "bg-accent-theme/20 text-accent-theme border-accent-theme/40"
                                                                    : "bg-white/5 text-[var(--color-text-muted)] border-white/5 hover:bg-white/10"
                                                            )}
                                                            title={showOnlyActiveCategories ? "Mostrar todas" : "Mostrar apenas ativas"}
                                                        >
                                                            {showOnlyActiveCategories ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <div className="w-48">
                                                        <CustomSelect
                                                            value={selectedSectorIdCategory || ''}
                                                            onChange={(val) => setSelectedSectorIdCategory(val === '' ? undefined : Number(val))}
                                                            options={[
                                                                { value: '', label: 'Ver Todas', icon: <Users className="w-3 h-3 opacity-50" /> },
                                                                ...sectors.map(s => ({
                                                                    value: s.id,
                                                                    label: s.name,
                                                                    icon: <Users className="w-3 h-3 text-emerald-500" />
                                                                }))
                                                            ]}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="bg-background/20 rounded-3xl border border-border-theme p-6 space-y-2 shadow-inner">
                                                    {loadingCats ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-accent-theme" /></div> :
                                                        categories.filter(c => !c.parent_id && (!showOnlyActiveCategories || c.is_active)).length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhuma categoria encontrada.</div> :
                                                            categories.filter(c => !c.parent_id && (!showOnlyActiveCategories || c.is_active)).map(cat => {
                                                                const isExpanded = expandedCategories.includes(cat.id);
                                                                const subcats = (cat.subcategories || []).filter(sub => !showOnlyActiveCategories || sub.is_active);
                                                                const hasSubcats = subcats.length > 0;

                                                                return (
                                                                    <div key={cat.id} className="space-y-1">
                                                                        <div
                                                                            onClick={() => hasSubcats && toggleCategory(cat.id)}
                                                                            className={clsx(
                                                                                "flex items-center justify-between p-4 bg-card/40 rounded-2xl border border-border-theme group/item hover:bg-card/60 transition-all shadow-sm",
                                                                                hasSubcats && "cursor-pointer"
                                                                            )}
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                <Tag className={clsx("w-4 h-4", cat.is_active ? "text-accent-theme" : "text-gray-500")} />
                                                                                <span className={clsx("text-sm font-bold tracking-tight", !cat.is_active && "text-gray-500 line-through opacity-50")}>{cat.name}</span>
                                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                                                    {cat.sector_id ? sectors.find(s => s.id === cat.sector_id)?.name || 'Setor' : 'Global'}
                                                                                </span>
                                                                                {hasSubcats && (
                                                                                    <span className="px-2 py-0.5 bg-accent-theme/10 text-accent-theme rounded-full text-[9px] font-black">
                                                                                        {subcats.length} sub
                                                                                    </span>
                                                                                )}
                                                                                {!cat.is_active && (
                                                                                    <span className="px-2 py-0.5 bg-red-500/10 text-red-500 rounded-full text-[9px] font-black uppercase tracking-wider">
                                                                                        Inativa
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleUpdateCategory(cat.id, { ...cat, is_active: !cat.is_active });
                                                                                    }}
                                                                                    title={cat.is_active ? "Desativar" : "Ativar"}
                                                                                    className={clsx(
                                                                                        "p-2 rounded-xl transition-colors",
                                                                                        cat.is_active ? "text-gray-500 hover:text-orange-500 hover:bg-orange-500/10" : "text-green-500 hover:bg-green-500/10"
                                                                                    )}
                                                                                >
                                                                                    {cat.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }}
                                                                                    className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl"
                                                                                >
                                                                                    <Edit2 className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                                                                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                                {hasSubcats && (
                                                                                    <div className={clsx("p-1.5 transition-transform duration-300", isExpanded ? "rotate-180" : "rotate-0")}>
                                                                                        <ChevronDown className="w-4 h-4 opacity-50" />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {/* Subcategorias com Animação */}
                                                                        {isExpanded && subcats.map((sub, index) => (
                                                                            <div
                                                                                key={sub.id}
                                                                                className="flex items-center justify-between p-3 ml-8 bg-card/20 rounded-xl border border-dashed border-border-theme group/sub hover:bg-card/40 transition-all"
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className={clsx("w-2 h-2 rounded-full", sub.is_active ? "bg-accent-theme/40" : "bg-gray-500/40")} />
                                                                                    <span className={clsx("text-xs font-medium", !sub.is_active && "text-gray-500 line-through opacity-50")}>{sub.name}</span>
                                                                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                                                        {sub.sector_id ? sectors.find(s => s.id === sub.sector_id)?.name || 'Setor' : 'Global'}
                                                                                    </span>
                                                                                    {!sub.is_active && (
                                                                                        <span className="px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded-full text-[8px] font-black uppercase tracking-wider">
                                                                                            Inativa
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-all">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleUpdateCategory(sub.id, { ...sub, is_active: !sub.is_active });
                                                                                        }}
                                                                                        title={sub.is_active ? "Desativar" : "Ativar"}
                                                                                        className={clsx(
                                                                                            "p-2 rounded-xl transition-colors",
                                                                                            sub.is_active ? "text-gray-500 hover:text-orange-500 hover:bg-orange-500/10" : "text-green-500 hover:bg-green-500/10"
                                                                                        )}
                                                                                    >
                                                                                        {sub.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleEditCategory(sub)}
                                                                                        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl"
                                                                                    >
                                                                                        <Edit2 className="w-3 h-3" />
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={() => handleDeleteCategory(sub.id)}
                                                                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl"
                                                                                    >
                                                                                        <Trash2 className="w-3 h-3" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>


                                    {/* Catálogo de Serviços/Produtos */}
                                    <div className="glass-card p-10 rounded-3xl space-y-10 relative group transition-all z-10">
                                        <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                                <Layers className="w-24 h-24" />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 text-amber-500 relative z-10">
                                            <div className="p-2.5 bg-amber-500/10 rounded-xl">
                                                <Layers className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div className="flex-1">
                                                <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">
                                                    Catálogo de <span className="text-amber-500">Serviços e Produtos</span>
                                                </h2>
                                                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-widest opacity-60">Cadastre os itens que podem ser contratados pelos clientes.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h4 className="text-[13px] font-black font-display text-[var(--color-text-muted)] uppercase italic tracking-[0.15em]">
                                                        {editingCatalogItem ? 'Editar Item' : 'Novo Item'}
                                                    </h4>
                                                    {editingCatalogItem && (
                                                        <button onClick={cancelEditCatalogItem} className="text-[9px] font-black text-red-500 uppercase hover:underline">Cancelar Edição</button>
                                                    )}
                                                </div>
                                                <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
                                                    <div>
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Nome do Serviço/Produto</label>
                                                        <input
                                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500/30 outline-none transition-all shadow-sm"
                                                            placeholder="Ex: Consultoria, Pacote 10h, Licença X..."
                                                            value={newCatalogItemName}
                                                            onChange={e => setNewCatalogItemName(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Descrição (Opcional)</label>
                                                        <textarea
                                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-xl p-4 text-sm focus:ring-2 focus:ring-amber-500/30 outline-none transition-all shadow-sm min-h-[100px]"
                                                            placeholder="Detalhes sobre o serviço ou produto..."
                                                            value={newCatalogItemDescription}
                                                            onChange={e => setNewCatalogItemDescription(e.target.value)}
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleCreateCatalogItem}
                                                        className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-theme/20 active:scale-95"
                                                    >
                                                        {editingCatalogItem ? <Save className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                                                        {editingCatalogItem ? 'Salvar Alterações' : 'Adicionar ao Catálogo'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Listagem */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-[13px] font-black font-display italic text-foreground uppercase tracking-[0.15em]">Itens do <span className="text-amber-500">Catálogo</span></h4>
                                                        <button
                                                            onClick={() => setShowOnlyActiveCatalog(!showOnlyActiveCatalog)}
                                                            className={clsx(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase transition-all border",
                                                                showOnlyActiveCatalog
                                                                    ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                                                                    : "bg-white/5 text-[var(--color-text-muted)] border-white/5 hover:bg-white/10"
                                                            )}
                                                            title={showOnlyActiveCatalog ? "Mostrar todos" : "Mostrar apenas ativos"}
                                                        >
                                                            {showOnlyActiveCatalog ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="bg-background/20 rounded-3xl border border-border-theme p-6 space-y-2 shadow-inner max-h-[500px] overflow-y-auto custom-scrollbar">
                                                    {loadingCatalog ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500" /></div> :
                                                        catalogItems.filter(item => !showOnlyActiveCatalog || item.is_active).length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhum item cadastrado no catálogo.</div> :
                                                            catalogItems.filter(item => !showOnlyActiveCatalog || item.is_active).map(item => (
                                                                <div key={item.id} className={clsx(
                                                                    "flex items-center justify-between p-4 bg-card/40 rounded-2xl border border-border-theme group/item hover:bg-card/60 transition-all shadow-sm",
                                                                    !item.is_active && "opacity-50 grayscale-[0.5]"
                                                                )}>
                                                                    <div className="flex items-center gap-3">
                                                                        <Layers className={clsx("w-4 h-4", item.is_active ? "text-amber-500" : "text-gray-500")} />
                                                                        <div className="flex flex-col">
                                                                            <span className={clsx(
                                                                                "text-sm font-bold tracking-tight",
                                                                                !item.is_active && "line-through"
                                                                            )}>{item.name}</span>
                                                                            {item.description && (
                                                                                <span className="text-[10px] text-[var(--color-text-muted)] line-clamp-1">{item.description}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                                                                        <button
                                                                            onClick={() => handleToggleCatalogItemActive(item)}
                                                                            className={clsx(
                                                                                "p-2 rounded-xl transition-all",
                                                                                item.is_active ? "text-amber-500 hover:bg-amber-500/10" : "text-gray-400 hover:text-amber-500 hover:bg-amber-500/10"
                                                                            )}
                                                                            title={item.is_active ? "Desativar" : "Ativar"}
                                                                        >
                                                                            {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                                        </button>
                                                                        <button onClick={() => handleEditCatalogItem(item)} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all">
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </button>
                                                                        <button onClick={() => handleDeleteCatalogItem(item.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gestão de Status */}
                                    <div className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden group transition-all">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <CheckCircle2 className="w-24 h-24" />
                                        </div>
                                        <div className="flex items-center gap-3 text-blue-500">
                                            <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                                <CheckCircle2 className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h2 className="text-xl font-black italic uppercase tracking-tighter text-foreground">
                                                    Fluxo e Status <span className="text-accent-theme">de Chamado</span>
                                                </h2>
                                                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-widest opacity-60">Gerencie os estados dos chamados por setor.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h4 className="text-[13px] font-black font-display text-[var(--color-text-muted)] uppercase italic tracking-[0.15em]">
                                                        {editingStatus ? 'Editar Estado' : 'Novo Estado'}
                                                    </h4>
                                                    {editingStatus && (
                                                        <button onClick={cancelEditStatus} className="text-[9px] font-black text-red-500 uppercase hover:underline">Cancelar Edição</button>
                                                    )}
                                                </div>
                                                <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
                                                    <CustomSelect
                                                        label="Setor Relacionado"
                                                        value={newStatusSectorId || ''}
                                                        onChange={(val) => setNewStatusSectorId(val === '' ? undefined : Number(val))}
                                                        options={[
                                                            { value: '', label: 'Global (Todos os Setores)', icon: <Users className="w-4 h-4 opacity-50" /> },
                                                            ...sectors.map(s => ({
                                                                value: s.id,
                                                                label: s.name,
                                                                icon: <Users className="w-4 h-4 text-emerald-500" />
                                                            }))
                                                        ]}
                                                    />
                                                    <div>
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Nome do Status</label>
                                                        <input
                                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500/30 outline-none transition-all shadow-sm"
                                                            placeholder="Ex: Em Teste, Aguardando Cliente..."
                                                            value={newStatusName}
                                                            onChange={e => setNewStatusName(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <h4 className="block text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80 mb-3">Representação Visual (Cor)</h4>
                                                        <div className="flex items-center gap-4 p-3 rounded-2xl border border-border-theme group/color bg-background/40">
                                                            <div className="relative flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
                                                                <input
                                                                    type="color"
                                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                                    value={newStatusColor}
                                                                    onChange={e => setNewStatusColor(e.target.value)}
                                                                />
                                                                <div
                                                                    className="w-12 h-12 rounded-xl border border-white/20 shadow-lg flex items-center justify-center relative overflow-hidden transition-all duration-500"
                                                                    style={{
                                                                        backgroundColor: newStatusColor,
                                                                        boxShadow: `0 8px 20px -6px ${newStatusColor}66`
                                                                    }}
                                                                >
                                                                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />
                                                                    <Palette className="w-5 h-5 text-white/80 drop-shadow-md relative z-0" />
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 space-y-1">
                                                                <div className="flex items-center justify-between px-1">
                                                                    <span className="text-[8px] font-black uppercase text-[var(--color-text-muted)] tracking-tighter">Hex Code</span>
                                                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: newStatusColor }} />
                                                                </div>
                                                                <input
                                                                    className="w-full bg-white/5 border border-border-theme rounded-xl p-2.5 text-xs font-mono outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all uppercase"
                                                                    value={newStatusColor}
                                                                    maxLength={7}
                                                                    onChange={e => {
                                                                        let val = e.target.value;
                                                                        if (!val.startsWith('#') && val.length > 0) val = '#' + val;
                                                                        setNewStatusColor(val);
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div
                                                        onClick={() => setNewStatusIsFinal(!newStatusIsFinal)}
                                                        className={clsx(
                                                            "flex items-center justify-between p-4 bg-background/40 rounded-2xl border transition-all cursor-pointer group hover:bg-background/60",
                                                            newStatusIsFinal ? "border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-border-theme"
                                                        )}
                                                    >
                                                        <div className="flex flex-col gap-1">
                                                            <label className={clsx(
                                                                "text-[9px] font-black uppercase tracking-[0.1em] transition-colors",
                                                                newStatusIsFinal ? "text-blue-400" : "text-[var(--color-text-muted)]"
                                                            )}>
                                                                Status Finalizador
                                                            </label>
                                                            <span className="text-[8px] font-medium text-[var(--color-text-muted)] opacity-60 uppercase tracking-tight">Gera encerramento automático</span>
                                                        </div>
                                                        <div className={clsx(
                                                            "w-12 h-6 rounded-full relative transition-all duration-300 border",
                                                            newStatusIsFinal ? "bg-blue-500/20 border-blue-500/40" : "bg-white/5 border-white/5"
                                                        )}>
                                                            <div className={clsx(
                                                                "absolute top-1 left-1 w-4 h-4 rounded-full transition-all duration-300 shadow-lg",
                                                                newStatusIsFinal
                                                                    ? "translate-x-6 bg-blue-500 shadow-blue-500/40"
                                                                    : "translate-x-0 bg-white/20"
                                                            )} />
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={handleCreateStatus}
                                                        className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-theme/20 active:scale-95"
                                                    >
                                                        <PlusCircle className="w-4 h-4" />
                                                        Adicionar ao Fluxo
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Listagem */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <h4 className="text-[13px] font-black font-display italic text-foreground uppercase tracking-[0.15em]">Estados do <span className="text-accent-theme">Fluxo</span></h4>
                                                        <button
                                                            onClick={() => setShowOnlyActiveStatuses(!showOnlyActiveStatuses)}
                                                            className={clsx(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase transition-all border",
                                                                showOnlyActiveStatuses
                                                                    ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                                                    : "bg-white/5 text-[var(--color-text-muted)] border-white/5 hover:bg-white/10"
                                                            )}
                                                            title={showOnlyActiveStatuses ? "Mostrar todos" : "Mostrar apenas ativos"}
                                                        >
                                                            {showOnlyActiveStatuses ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <div className="w-48">
                                                        <CustomSelect
                                                            value={selectedSectorIdStatus || ''}
                                                            onChange={(val) => setSelectedSectorIdStatus(val === '' ? undefined : Number(val))}
                                                            options={[
                                                                { value: '', label: 'Ver Todos', icon: <Users className="w-3 h-3 opacity-50" /> },
                                                                ...sectors.map(s => ({
                                                                    value: s.id,
                                                                    label: s.name,
                                                                    icon: <Users className="w-3 h-3 text-emerald-500" />
                                                                }))
                                                            ]}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="bg-background/20 rounded-3xl border border-border-theme p-6 space-y-2 shadow-inner">
                                                    {loadingStatuses ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> :
                                                        statuses.filter(st => !showOnlyActiveStatuses || st.is_active).length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhum status encontrado.</div> :
                                                            statuses.filter(st => !showOnlyActiveStatuses || st.is_active).map(st => (
                                                                <div key={st.id} className={clsx(
                                                                    "flex items-center justify-between p-4 bg-card/40 rounded-2xl border border-border-theme group/item hover:bg-card/60 transition-all shadow-sm",
                                                                    !st.is_active && "opacity-50 grayscale-[0.5]"
                                                                )}>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-4 h-4 rounded-full border border-white/10 shadow-sm" style={{ backgroundColor: st.color }} />
                                                                        <span className={clsx(
                                                                            "text-sm font-bold tracking-tight",
                                                                            !st.is_active && "line-through"
                                                                        )}>{st.name}</span>
                                                                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                                            {st.sector_id ? sectors.find(s => s.id === st.sector_id)?.name || 'Setor' : 'Global'}
                                                                        </span>
                                                                        {st.is_final && (
                                                                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">Finalizado</span>
                                                                        )}
                                                                        {!st.is_active && (
                                                                            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/20">Inativo</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                                                                        <button
                                                                            onClick={() => handleToggleStatusActivation(st)}
                                                                            className={clsx(
                                                                                "p-2 rounded-xl transition-all",
                                                                                st.is_active ? "text-blue-500 hover:bg-blue-500/10" : "text-gray-400 hover:text-blue-500 hover:bg-blue-500/10"
                                                                            )}
                                                                            title={st.is_active ? "Desativar" : "Ativar"}
                                                                        >
                                                                            {st.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                                        </button>
                                                                        <button onClick={() => handleEditStatus(st)} className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-xl transition-all">
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </button>
                                                                        <button onClick={() => handleDeleteStatus(st.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: Usuários */}
                            {activeTab === 'users' && (user?.role === 'ADMIN' || user?.role === 'ROOT') && (
                                <motion.div
                                    key="users"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-8"
                                >
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black italic uppercase tracking-tight">
                                                Gestão <span className="text-accent-theme">de Equipe</span>
                                            </h2>
                                            <p className="text-[var(--color-text-muted)] text-[10px] font-black uppercase tracking-widest pl-1">Controle de acesso granular e perfis de permissão.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setCurrentUser({ role: 'AGENT', is_active: true });
                                                setIsEditingUser(false);
                                                setIsUserModalOpen(true);
                                            }}
                                            className="group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                                        >
                                            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                            Novo Usuário
                                        </button>
                                    </div>

                                    <div className="glass-card rounded-[2.5rem] border border-border-theme overflow-hidden relative group">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-border-theme/50">
                                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Usuário</th>
                                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Acesso</th>
                                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Status</th>
                                                        <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] text-right">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-theme/30">
                                                    {users.map((u) => (
                                                        <tr key={u.id} className="group/row hover:bg-accent-theme/5 transition-all duration-200 cursor-default">
                                                            <td className="px-8 py-5 align-middle">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-10 h-10 rounded-xl border border-accent-theme/20 flex items-center justify-center text-accent-theme font-black shadow-inner group-hover/row:scale-105 transition-transform overflow-hidden flex-shrink-0">
                                                                        {u.avatar_url ? (
                                                                            <img src={`${typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : 'http://localhost:8080'}${u.avatar_url}`} alt={u.username} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="w-full h-full bg-gradient-to-br from-accent-theme/20 to-primary-theme/10 flex items-center justify-center">
                                                                                {u.username[0].toUpperCase()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-bold text-sm text-foreground">{u.full_name || u.username}</div>
                                                                        <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] opacity-60">{u.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 align-middle">
                                                                <div className={clsx(
                                                                    "inline-flex items-center justify-center gap-2 w-[120px] py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                                                                    u.profile_id ? "bg-orange-500/10 border-orange-500/20 text-orange-500" :
                                                                        u.role === 'ROOT' ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                                                                            u.role === 'ADMIN' ? "bg-accent-theme/10 border-accent-theme/20 text-accent-theme" :
                                                                                "bg-white/5 border-white/10 text-[var(--color-text-muted)]"
                                                                )}>
                                                                    <Shield className="w-2.5 h-2.5 flex-shrink-0" />
                                                                    <span className="truncate max-w-[80px]">
                                                                        {u.profile_id ? (profiles.find(p => p.id === u.profile_id)?.name || 'Custom') : u.role}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 align-middle">
                                                                <div className={clsx(
                                                                    "flex items-center gap-2 text-[9px] font-black uppercase tracking-widest",
                                                                    u.is_active ? "text-emerald-500" : "text-red-500"
                                                                )}>
                                                                    <div className={clsx("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-emerald-500" : "bg-red-500")} />
                                                                    {u.is_active ? 'Ativo' : 'Bloqueado'}
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 align-middle text-right">
                                                                <div className="flex justify-end gap-2 opacity-30 group-hover/row:opacity-100 transition-opacity duration-200">
                                                                    <button
                                                                        onClick={() => {
                                                                            setCurrentUser(u);
                                                                            setIsEditingUser(true);
                                                                            setIsUserModalOpen(true);
                                                                        }}
                                                                        className="p-2.5 bg-white/5 hover:bg-accent-theme/20 text-[var(--color-text-muted)] hover:text-accent-theme rounded-lg border border-white/5 hover:border-accent-theme/30 transition-all"
                                                                    >
                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    {user?.id !== u.id && u.role !== 'ROOT' && (
                                                                        <button
                                                                            onClick={() => handleDeleteUser(u.id)}
                                                                            className="p-2.5 bg-white/5 hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-500 rounded-lg border border-white/5 hover:border-red-500/30 transition-all"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: Identidade do Sistema */}
                            {activeTab === 'system' && (
                                <motion.div
                                    key="system"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden transition-all"
                                >
                                    <div className="flex items-center gap-3 text-accent-theme">
                                        <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                            <ShieldCheck className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                            Identidade <span className="text-accent-theme">do Sistema</span>
                                        </h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">
                                                    Nome do Projeto
                                                </label>
                                                <input
                                                    type="text"
                                                    value={systemSettings.system_name}
                                                    onChange={(e) => setSystemSettings({ ...systemSettings, system_name: e.target.value })}
                                                    className="w-full bg-background/40 border border-border-theme rounded-2xl px-6 py-4 text-sm font-bold focus:outline-none focus:border-accent-theme/50 transition-all"
                                                    placeholder="Ex: MyTicket Portal"
                                                />
                                                <p className="text-[9px] text-[var(--color-text-muted)] italic px-1">
                                                    Este nome será exibido na barra lateral, navegação e tela de login.
                                                </p>
                                            </div>

                                            <div className="pt-4">
                                                <button
                                                    onClick={handleSaveSystemSettings}
                                                    disabled={isSavingSystem}
                                                    className="premium-gradient text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                                                >
                                                    {isSavingSystem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    Salvar Alterações
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <h4 className="text-[13px] font-black font-display italic uppercase tracking-[0.15em] text-foreground/80 mb-4">Logos <span className="text-accent-theme">do Sistema</span></h4>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                    {/* Logo Tema Claro */}
                                                    <div className="space-y-3">
                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                            Tema Claro
                                                        </label>
                                                        <div className="flex flex-col gap-4">
                                                            <div className="w-full aspect-video rounded-3xl bg-slate-200 border-2 border-dashed border-slate-400 flex items-center justify-center overflow-hidden group relative">
                                                                {logoPreviewLight || systemSettings.logo_url_light ? (
                                                                    <img
                                                                        src={logoPreviewLight || systemSettings.logo_url_light}
                                                                        alt="Logo Light Preview"
                                                                        className="w-full h-full object-contain p-4"
                                                                    />
                                                                ) : (
                                                                    <Ticket className="w-8 h-8 text-slate-400 opacity-50" />
                                                                )}

                                                                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                                    <input
                                                                        type="file"
                                                                        className="hidden"
                                                                        accept="image/*"
                                                                        onChange={(e) => handleLogoUpload(e, 'light')}
                                                                    />
                                                                    <Edit2 className="w-5 h-5 text-white" />
                                                                </label>
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                {(logoPreviewLight || systemSettings.logo_url_light) && (
                                                                    <button
                                                                        onClick={() => handleRemoveLogo('light')}
                                                                        className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" /> Remover logo claro
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Logo Tema Escuro */}
                                                    <div className="space-y-3">
                                                        <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                            Tema Escuro
                                                        </label>
                                                        <div className="flex flex-col gap-4">
                                                            <div className="w-full aspect-video rounded-3xl bg-slate-900 border-2 border-dashed border-slate-700 flex items-center justify-center overflow-hidden group relative">
                                                                {logoPreviewDark || systemSettings.logo_url_dark ? (
                                                                    <img
                                                                        src={logoPreviewDark || systemSettings.logo_url_dark}
                                                                        alt="Logo Dark Preview"
                                                                        className="w-full h-full object-contain p-4"
                                                                    />
                                                                ) : (
                                                                    <Ticket className="w-8 h-8 text-slate-700 opacity-50" />
                                                                )}

                                                                <label className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                                    <input
                                                                        type="file"
                                                                        className="hidden"
                                                                        accept="image/*"
                                                                        onChange={(e) => handleLogoUpload(e, 'dark')}
                                                                    />
                                                                    <Edit2 className="w-5 h-5 text-white" />
                                                                </label>
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                {(logoPreviewDark || systemSettings.logo_url_dark) && (
                                                                    <button
                                                                        onClick={() => handleRemoveLogo('dark')}
                                                                        className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" /> Remover logo escuro
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-10">
                                                <h4 className="text-[13px] font-black font-display italic uppercase tracking-[0.15em] text-foreground/80 mb-4">Favicon <span className="text-accent-theme">do Sistema</span></h4>

                                                <div className="flex flex-col sm:flex-row items-center gap-8">
                                                    <div className="w-24 h-24 rounded-3xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden group relative flex-shrink-0">
                                                        {faviconPreview || systemSettings.favicon_url ? (
                                                            <img
                                                                src={faviconPreview || systemSettings.favicon_url}
                                                                alt="Favicon Preview"
                                                                className="w-full h-full object-contain p-4"
                                                            />
                                                        ) : (
                                                            <Ticket className="w-8 h-8 text-slate-600 opacity-50" />
                                                        )}

                                                        <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={handleFaviconUpload}
                                                            />
                                                            <Edit2 className="w-5 h-5 text-white" />
                                                        </label>
                                                    </div>

                                                    <div className="space-y-4 max-w-xs text-center sm:text-left">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-bold text-foreground">Ícone de Aba</p>
                                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                                Este ícone aparecerá na aba do seu navegador.
                                                                Recomendado: <span className="text-accent-theme font-black">32x32</span> ou <span className="text-accent-theme font-black">64x64</span> pixels.
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                                                            {(faviconPreview || systemSettings.favicon_url) && (
                                                                <button
                                                                    onClick={handleRemoveFavicon}
                                                                    className="px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                                                                >
                                                                    <Trash2 className="w-3 h-3" /> Remover
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: Aparência */}
                            {activeTab === 'appearance' && (
                                <motion.div
                                    key="appearance"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden transition-all"
                                >
                                    <div className="flex items-center gap-3 text-pink-500">
                                        <div className="p-2.5 bg-pink-500/10 rounded-xl">
                                            <Palette className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                            Identidade <span className="text-accent-theme">Visual</span>
                                        </h2>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                        {THEMES.map((theme) => (
                                            <button
                                                key={theme.id}
                                                onClick={() => changeThemePreview(theme.id)}
                                                className={clsx(
                                                    "group relative p-6 rounded-3xl border-2 transition-all text-left overflow-hidden",
                                                    config.theme === theme.id
                                                        ? "border-accent-theme bg-accent-theme/5 ring-4 ring-accent-theme/10 shadow-2xl shadow-accent-theme/20 scale-[1.02]"
                                                        : "border-border-theme bg-background/40 hover:border-[var(--color-text-muted)] hover:bg-card"
                                                )}
                                            >
                                                <div className="space-y-4">
                                                    <div className="flex gap-2 items-center">
                                                        {theme.id === 'custom' ? (
                                                            <div className={`w-20 h-10 rounded-2xl ${theme.bg} border border-white/20 shadow-lg flex items-center justify-center relative group-hover:scale-105 transition-transform`}>
                                                                <div className="absolute inset-0 bg-white/10 backdrop-blur-sm rounded-[inherit]" />
                                                                <Palette className="w-5 h-5 text-white z-10 drop-shadow-md" />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className={`w-10 h-10 rounded-2xl ${theme.bg} border border-border-theme shadow-md group-hover:scale-105 transition-transform`} />
                                                                <div className={`w-10 h-10 rounded-2xl ${theme.accent} shadow-md group-hover:scale-105 transition-transform`} />
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={clsx(
                                                            "text-[10px] font-black uppercase tracking-widest transition-colors",
                                                            config.theme === theme.id ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground"
                                                        )}>
                                                            {theme.name}
                                                        </span>
                                                    </div>
                                                </div>
                                                {config.theme === theme.id && (
                                                    <div className="absolute top-4 right-4 animate-zoom-in">
                                                        <div className="bg-accent-theme text-white rounded-full p-1 shadow-lg shadow-accent-theme/30">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                        </div>
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {config.theme === 'custom' && (
                                        <div className="pt-10 border-t border-border-theme space-y-8 animate-slide-in-bottom">
                                            <div className="flex items-center gap-3 text-accent-theme">
                                                <div className="p-2 bg-accent-theme/10 rounded-lg">
                                                    <Palette className="w-4 h-4" />
                                                </div>
                                                <h4 className="text-[13px] font-black font-display uppercase italic tracking-tighter text-foreground">Ajustar Cores <span className="text-accent-theme">Personalizadas</span></h4>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                                {[
                                                    { label: 'Fundo', key: 'bg', description: 'Cor principal do plano de fundo' },
                                                    { label: 'Texto', key: 'fg', description: 'Cor principal das fontes' },
                                                    { label: 'Primária', key: 'primary', description: 'Cor para botões e destaque principal' },
                                                    { label: 'Destaque (Accent)', key: 'accent', description: 'Cor secundária e ícones da lateral' },
                                                    { label: 'Cards', key: 'card', description: 'Cor de fundo dos cartões' },
                                                    { label: 'Hover dos Cards', key: 'card-hover', description: 'Cor ao passar o mouse nos cards' },
                                                    { label: 'Bordas', key: 'border', description: 'Cor das linhas divisórias' },
                                                    { label: 'Texto Mudo', key: 'muted', description: 'Cor para textos secundários' },
                                                ].map((color) => (
                                                    <div key={color.key} className="glass-card p-6 rounded-[2rem] border border-white/5 space-y-4 hover:border-accent-theme/20 transition-all group">
                                                        <div className="flex justify-between items-start">
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-black uppercase tracking-widest text-foreground opacity-90">
                                                                    {color.label}
                                                                </p>
                                                                <p className="text-[8px] font-medium text-[var(--color-text-muted)] uppercase tracking-tight">
                                                                    {color.description}
                                                                </p>
                                                            </div>
                                                            <div
                                                                className="w-8 h-8 rounded-full shadow-inner border border-white/10"
                                                                style={{ backgroundColor: systemSettings.custom_colors[color.key] || '#000000' }}
                                                            ></div>
                                                        </div>

                                                        <div className="flex gap-2 items-center">
                                                            <div className="relative flex-shrink-0">
                                                                <input
                                                                    type="color"
                                                                    value={systemSettings.custom_colors[color.key] || '#000000'}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setSystemSettings({
                                                                            ...systemSettings,
                                                                            custom_colors: { ...systemSettings.custom_colors, [color.key]: val }
                                                                        });
                                                                    }}
                                                                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-20"
                                                                />
                                                                <div className="w-10 h-10 rounded-xl bg-background border border-border-theme flex items-center justify-center group-hover:border-accent-theme/50 transition-all shadow-inner">
                                                                    <Palette className="w-4 h-4 text-accent-theme" />
                                                                </div>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={systemSettings.custom_colors[color.key] || ''}
                                                                maxLength={7}
                                                                onChange={(e) => {
                                                                    let val = e.target.value;
                                                                    if (!val.startsWith('#') && val.length > 0) val = '#' + val;
                                                                    setSystemSettings({
                                                                        ...systemSettings,
                                                                        custom_colors: { ...systemSettings.custom_colors, [color.key]: val }
                                                                    });
                                                                }}
                                                                className="w-full min-w-0 bg-background/50 border border-border-theme rounded-xl px-3 py-2 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-accent-theme/20 transition-all uppercase placeholder:opacity-30"
                                                                placeholder="#000000"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex justify-start pt-4">
                                                <button
                                                    onClick={handleSaveSystemSettings}
                                                    disabled={isSavingSystem}
                                                    className="premium-gradient text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                                                >
                                                    {isSavingSystem ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    Salvar Cores Customizadas
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* Aba: Perfis de Acesso */}
                            {activeTab === 'profiles' && (user?.role === 'ADMIN' || user?.role === 'ROOT') && (
                                <motion.div
                                    key="profiles"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-8"
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="space-y-1">
                                            <h2 className="text-2xl font-black italic uppercase tracking-tight">
                                                Perfis <span className="text-accent-theme">de Acesso</span>
                                            </h2>
                                            <p className="text-[var(--color-text-muted)] text-[10px] font-black uppercase tracking-widest pl-1">Defina permissões granulares.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setCurrentProfile({ permissions: { menus: [], actions: [] } });
                                                setIsProfileModalOpen(true);
                                            }}
                                            className="group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                                        >
                                            <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                            Novo Perfil
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {profiles.map(profile => (
                                            <div key={profile.id} className="glass-card p-6 rounded-3xl border border-border-theme relative group hover:border-accent-theme/30 transition-all hover:scale-[1.02]">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="p-3 bg-orange-500/10 rounded-xl">
                                                        <ShieldCheck className="w-6 h-6 text-orange-500" />
                                                    </div>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                setCurrentProfile(profile);
                                                                setIsProfileModalOpen(true);
                                                            }}
                                                            className="p-2 hover:bg-white/5 rounded-lg text-blue-400 transition-colors"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteProfile(profile.id)}
                                                            className="p-2 hover:bg-white/5 rounded-lg text-red-400 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <h4 className="text-[13px] font-black font-display italic uppercase tracking-[0.15em] text-foreground/80 mb-2">{profile.name}</h4>
                                                <p className="text-xs text-[var(--color-text-muted)] mb-6 h-8 line-clamp-2 leading-relaxed">
                                                    {profile.description || 'Sem descrição definida.'}
                                                </p>
                                                <div className="flex gap-2 text-[9px] font-mono uppercase tracking-wider">
                                                    <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                                                        {profile.permissions?.menus?.length || 0} Menus
                                                    </span>
                                                    <span className="px-3 py-1 bg-white/5 rounded-lg border border-white/10">
                                                        {profile.permissions?.actions?.length || 0} Ações
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {profiles.length === 0 && (
                                            <div className="col-span-full py-12 text-center text-[var(--color-text-muted)] text-sm italic opacity-50">
                                                Nenhum perfil encontrado. Crie um para começar.
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}

                            {/* Aba: Avançado */}
                            {activeTab === 'advanced' && user?.role === 'ROOT' && (
                                <motion.div
                                    key="advanced"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="lg:col-span-3 space-y-8"
                                >
                                    {/* Backup & Restore */}
                                    <div className="glass-card p-10 rounded-3xl space-y-8 relative overflow-hidden border border-blue-500/20 bg-blue-500/[0.02] group transition-all">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <HardDrive className="w-24 h-24 text-blue-500" />
                                        </div>
                                        <div className="flex items-center gap-3 text-blue-500">
                                            <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                                <HardDrive className="w-6 h-6" />
                                            </div>
                                            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground">
                                                Backup <span className="text-accent-theme">& Restauração</span>
                                            </h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Download Backup */}
                                            <div className="flex flex-col h-full bg-white/5 p-8 rounded-3xl border border-border-theme/50 hover:border-blue-500/30 transition-all group/backup">
                                                <div className="space-y-4 flex-grow">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                                            <Download className="w-5 h-5 text-blue-500" />
                                                        </div>
                                                        <h4 className="text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80">Exportar Dados</h4>
                                                    </div>
                                                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                                        Baixe um arquivo ZIP contendo todo o banco de dados, uploads e memória da IA.
                                                        Ideal para migração ou segurança.
                                                    </p>
                                                </div>
                                                <div className="mt-8 space-y-4">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                setBackupProgress(0);
                                                                await downloadBackup((p) => setBackupProgress(p));
                                                                showNotification('Backup concluído!', 'success');
                                                            } catch (error) {
                                                                showNotification('Erro ao baixar backup', 'error');
                                                            } finally {
                                                                setBackupProgress(null);
                                                            }
                                                        }}
                                                        disabled={backupProgress !== null}
                                                        className="w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 font-black text-[10px] uppercase transition-all disabled:opacity-50 border border-blue-500/20"
                                                    >
                                                        {backupProgress !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                        {backupProgress !== null ? 'Baixando...' : 'Fazer Backup Completo'}
                                                    </button>
                                                    {backupProgress !== null && (
                                                        <div className="space-y-2 animate-fade-in bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 text-center">
                                                            <div className="flex justify-between items-center text-[10px] font-black uppercase mb-1">
                                                                <span className="text-blue-500/70">Progresso</span>
                                                                <span className="text-blue-500">{backupProgress}%</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                                                    style={{ width: `${backupProgress}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Upload Restore */}
                                            <div className="flex flex-col h-full bg-white/5 p-8 rounded-3xl border border-border-theme/50 hover:border-emerald-500/30 transition-all group/restore">
                                                <div className="space-y-4 flex-grow">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 bg-emerald-500/10 rounded-xl">
                                                            <Upload className="w-5 h-5 text-emerald-500" />
                                                        </div>
                                                        <h4 className="text-[13px] font-black font-display uppercase italic tracking-[0.15em] text-foreground/80">Restaurar <span className="text-accent-theme">Sistema</span></h4>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                                            Carregue um arquivo de backup (.zip) para restaurar o sistema.
                                                        </p>
                                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 text-[9px] font-black uppercase tracking-wider">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Cuidado: Substitui todos os dados!
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-8 space-y-4">
                                                    <div className="relative">
                                                        <input
                                                            type="file"
                                                            accept=".zip"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;

                                                                const confirmed = await askConfirm({
                                                                    title: 'Confirmar Restauração?',
                                                                    message: 'Todos os dados atuais serão substituídos pelos do backup. Esta ação não pode ser desfeita.',
                                                                    type: 'danger',
                                                                    confirmText: 'RESTAURAR AGORA'
                                                                });

                                                                if (confirmed) {
                                                                    setLoadingRestore(true);
                                                                    setRestoreProgress(0);
                                                                    try {
                                                                        await restoreSystem(file, (p) => setRestoreProgress(p));
                                                                        showNotification('Sistema restaurado com sucesso!', 'success');
                                                                        setTimeout(() => window.location.reload(), 2000);
                                                                    } catch (error) {
                                                                        showNotification('Falha na restauração.', 'error');
                                                                    } finally {
                                                                        setLoadingRestore(false);
                                                                        setRestoreProgress(null);
                                                                        e.target.value = ''; // Reset input
                                                                    }
                                                                } else {
                                                                    e.target.value = ''; // Reset input
                                                                }
                                                            }}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                                            disabled={loadingRestore}
                                                        />
                                                        <button
                                                            disabled={loadingRestore}
                                                            className="w-full flex items-center justify-center gap-3 px-6 py-5 rounded-2xl border-2 border-dashed border-border-theme hover:border-emerald-500/50 hover:bg-emerald-500/5 text-[var(--color-text-muted)] hover:text-emerald-500 font-black text-[10px] uppercase transition-all"
                                                        >
                                                            {loadingRestore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                            {loadingRestore ? (restoreProgress === 100 ? 'Finalizando...' : 'Restaurando...') : 'Carregar Backup (.zip)'}
                                                        </button>
                                                    </div>
                                                    {restoreProgress !== null && (
                                                        <div className="space-y-2 animate-fade-in bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/10">
                                                            <div className="flex justify-between items-center text-[10px] font-black uppercase">
                                                                <span className="text-emerald-500/70">
                                                                    {restoreProgress === 100 ? 'Processando' : 'Upload'}
                                                                </span>
                                                                <span className="text-emerald-500">{restoreProgress}%</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-emerald-500/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-emerald-500 transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                                                    style={{ width: `${restoreProgress}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="glass-card p-10 rounded-3xl space-y-6 relative border border-border-theme/50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white/5 rounded-xl">
                                                <RotateCcw className="w-6 h-6" />
                                            </div>
                                            <h4 className="text-[13px] font-black font-display italic uppercase tracking-[0.15em] text-foreground/80">
                                                Ações <span className="text-accent-theme">do Sistema</span>
                                            </h4>
                                        </div>
                                        <p className="text-xs text-[var(--color-text-muted)]">Restaura as configurações de fábrica (Conectividade e Aparência).</p>
                                        <button
                                            onClick={handleReset}
                                            className="flex items-center gap-3 px-10 py-5 rounded-2xl border border-border-theme text-[var(--color-text-muted)] hover:bg-white/5 transition-all font-black text-[10px] uppercase shadow-sm"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            Restaurar Padrões
                                        </button>
                                    </div>

                                    {/* Danger Zone */}
                                    <div className="glass-card rounded-3xl p-10 relative overflow-hidden group border border-border-theme/50">
                                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                            <Trash2 className="w-24 h-24 text-red-500" />
                                        </div>
                                        <div className="flex items-center gap-3 text-red-500 mb-6">
                                            <div className="p-2.5 bg-red-500/10 rounded-xl">
                                                <Trash2 className="w-6 h-6" />
                                            </div>
                                            <h4 className="text-[13px] font-black font-display italic uppercase tracking-[0.15em] text-foreground/80">
                                                Zona <span className="text-accent-theme">de Perigo</span>
                                            </h4>
                                        </div>

                                        <p className="text-sm text-[var(--color-text-muted)] max-w-2xl leading-relaxed mb-8 font-medium">
                                            Selecione os módulos que deseja deletar permanentemente.
                                            Esta ação afetará o banco de dados e a base vetorial.
                                        </p>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {[
                                                { id: 'tickets', label: 'Tickets & Mensagens', icon: <Tag className="w-4 h-4" /> },
                                                { id: 'clients', label: 'Lista de Clientes', icon: <Users className="w-4 h-4" /> },
                                                { id: 'knowledge', label: 'Base de Conhecimento (RAG)', icon: <HardDrive className="w-4 h-4" /> },
                                                { id: 'settings', label: 'Categorias & Status', icon: <FolderPlus className="w-4 h-4" /> },
                                                { id: 'users', label: 'Usuários (Exceto Root)', icon: <Users className="w-4 h-4" /> },
                                            ].map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        const current = resetEntities.includes(item.id)
                                                            ? resetEntities.filter((id: string) => id !== item.id)
                                                            : [...resetEntities, item.id];
                                                        setResetEntities(current);
                                                    }}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-4 rounded-2xl border transition-all text-left",
                                                        resetEntities.includes(item.id)
                                                            ? "bg-red-500/10 border-red-500/30 text-red-500 shadow-xl"
                                                            : "bg-background/40 border-border-theme text-[var(--color-text-muted)] hover:border-red-500/30"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "p-2 rounded-lg",
                                                        resetEntities.includes(item.id) ? "bg-red-500 text-white" : "bg-white/5"
                                                    )}>
                                                        {item.icon}
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="pt-4">
                                            <button
                                                disabled={resetEntities.length === 0}
                                                onClick={() => setIsResetModalOpen(true)}
                                                className="w-full sm:w-auto flex items-center justify-center gap-3 px-12 py-5 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-2xl shadow-red-500/20 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                                Executar Limpeza
                                            </button>
                                        </div>
                                    </div>

                                </motion.div>
                            )}


                            {/* Botão Salvar (Visível em abas de config global) */}
                            {['general', 'ai', 'appearance'].includes(activeTab) && (
                                <div className="flex justify-end pt-12 border-t border-border-theme">
                                    <button
                                        onClick={handleSave}
                                        className="w-full sm:w-auto flex items-center justify-center gap-3 px-16 py-6 rounded-3xl premium-gradient hover:brightness-110 text-white font-black text-[11px] uppercase tracking-[0.3em] transition-all shadow-3xl shadow-accent-theme/30 active:scale-95 group"
                                    >
                                        {saved ? <CheckCircle2 className="w-6 h-6 animate-zoom-in" /> : <Save className="w-6 h-6 group-hover:rotate-12 transition-transform" />}
                                        {saved ? 'CONFIGURAÇÕES APLICADAS' : 'SALVAR E ATUALIZAR'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div >

                {/* Modais Consolidados */}
                {
                    isResetModalOpen && (
                        <div className="fixed inset-0 bg-background/90 backdrop-blur-2xl flex items-center justify-center z-[3000] p-4 animate-fade-in">
                            <div className="glass-card w-full max-w-md rounded-[3rem] border border-red-500/30 p-10 space-y-8 animate-zoom-in">
                                <div className="text-center space-y-6">
                                    <div className="inline-flex p-5 bg-red-500/20 rounded-3xl text-red-500 animate-bounce">
                                        <Trash2 className="w-10 h-10" />
                                    </div>
                                    <h2 className="text-4xl font-black italic uppercase tracking-tight text-red-500">
                                        Confirmação <span className="text-white">Crítica</span>
                                    </h2>
                                    <p className="text-xs text-[var(--color-text-muted)]">Ação irreversível em {resetEntities.length} módulo(s). Digite DELETAR para prosseguir.</p>
                                    <input
                                        type="text"
                                        className="w-full bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center text-red-500 font-black tracking-[0.3em] outline-none"
                                        value={resetConfirmation}
                                        onChange={e => setResetConfirmation(e.target.value)}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={() => setIsResetModalOpen(false)} className="px-6 py-4 rounded-2xl border border-border-theme font-black text-[10px] uppercase">Abortar</button>
                                        <button
                                            disabled={resetConfirmation !== 'DELETAR' || loadingReset}
                                            onClick={async () => {
                                                setLoadingReset(true);
                                                try {
                                                    const res = await resetDatabase(resetEntities, resetConfirmation);
                                                    showNotification(res.message || 'Dados limpos com sucesso!', 'success');
                                                    setIsResetModalOpen(false);
                                                    setResetConfirmation('');
                                                    setResetEntities([]);

                                                    // Atualiza todas as listas que podem ter sido afetadas
                                                    fetchCategories();
                                                    fetchStatuses();
                                                    fetchUsers();
                                                    fetchProfiles();
                                                    // Se houvesse fetchClientes aqui, deveríamos chamar também
                                                } catch (err: any) {
                                                    const msg = err.response?.data?.detail || 'Erro ao realizar limpeza';
                                                    showNotification(msg, 'error');
                                                } finally {
                                                    setLoadingReset(false);
                                                }
                                            }}
                                            className="px-6 py-4 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase shadow-xl shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                        >
                                            {loadingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            {loadingReset ? 'Limpando...' : 'Confirmar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    isUserModalOpen && (
                        <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 animate-fade-in">
                            <div className="glass-card w-full max-w-lg rounded-[2.5rem] border border-border-theme shadow-3xl animate-zoom-in max-h-[90vh] flex flex-col overflow-hidden">
                                <div className="p-10 border-b border-border-theme/50 flex-shrink-0">
                                    <h2 className="text-4xl font-black italic uppercase tracking-tight">
                                        {isEditingUser ? 'Editar' : 'Novo'} <span className="text-accent-theme">Usuário</span>
                                    </h2>
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar p-10">
                                    <form id="user-form" onSubmit={handleSaveUser} className="space-y-6">
                                        <div className="space-y-6">
                                            {/* Avatar Upload */}
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="relative group/avatar">
                                                    <div className="w-24 h-24 rounded-[2rem] border-2 border-dashed border-border-theme group-hover/avatar:border-accent-theme/50 overflow-hidden transition-all bg-background/50 flex items-center justify-center">
                                                        {avatarPreview || currentUser.avatar_url ? (
                                                            <img
                                                                src={avatarPreview || `${typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : 'http://localhost:8080'}${currentUser.avatar_url}`}
                                                                alt="Avatar"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-gradient-to-br from-accent-theme/20 to-primary-theme/10 flex items-center justify-center text-accent-theme text-3xl font-black">
                                                                {(currentUser.full_name || currentUser.username || '?')[0]?.toUpperCase()}
                                                            </div>
                                                        )}
                                                        <label className="absolute inset-0 flex items-center justify-center bg-background/80 opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer rounded-[2rem]">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <Upload className="w-5 h-5 text-accent-theme" />
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-accent-theme">Foto</span>
                                                            </div>
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/png,image/jpeg,image/webp"
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        setAvatarFile(file);
                                                                        const reader = new FileReader();
                                                                        reader.onloadend = () => setAvatarPreview(reader.result as string);
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                    {(avatarPreview || currentUser.avatar_url) && (
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                setAvatarPreview(null);
                                                                setAvatarFile(null);
                                                                if (isEditingUser && currentUser.id && currentUser.avatar_url) {
                                                                    try {
                                                                        await removeUserAvatar(currentUser.id);
                                                                        setCurrentUser({ ...currentUser, avatar_url: undefined });
                                                                        fetchUsers();
                                                                    } catch (err) {
                                                                        showNotification('Erro ao remover foto', 'error');
                                                                    }
                                                                }
                                                            }}
                                                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center border-2 border-background hover:bg-red-600 transition-all"
                                                        >
                                                            <XCircle className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                                <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-widest">Passe o mouse para alterar a foto</p>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Nome Completo</label>
                                                <input type="text" required value={currentUser.full_name || ''} onChange={e => setCurrentUser({ ...currentUser, full_name: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none focus:border-accent-theme/50 transition-all" />
                                            </div>

                                            <div className="grid grid-cols-1 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Username</label>
                                                    <input type="text" required disabled={isEditingUser} value={currentUser.username || ''} onChange={e => setCurrentUser({ ...currentUser, username: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none disabled:opacity-50 focus:border-accent-theme/50 transition-all" />
                                                </div>
                                            </div>

                                            <div className="space-y-2 pt-2">
                                                <CustomSelect
                                                    label="Perfil de Acesso (RBAC)"
                                                    value={currentUser.profile_id || ''}
                                                    onChange={val => {
                                                        const pid = Number(val) || undefined;
                                                        let newRole = currentUser.role || 'AGENT';

                                                        // Map profile to role automatically
                                                        if (pid === 1) { // Master
                                                            // Keep ROOT if already ROOT, otherwise elevate to ADMIN
                                                            newRole = currentUser.role === 'ROOT' ? 'ROOT' : 'ADMIN';
                                                        } else if (pid === 2 || pid === 3) { // Técnico ou Leitor
                                                            newRole = 'AGENT';
                                                        }

                                                        setCurrentUser({
                                                            ...currentUser,
                                                            profile_id: pid,
                                                            role: newRole
                                                        });
                                                    }}
                                                    icon={<ShieldCheck className="w-3 h-3 text-orange-400" />}
                                                    options={[
                                                        { value: '', label: 'Nenhum (Usar Role Padrão)', icon: <UserIcon className="w-4 h-4 opacity-50" /> },
                                                        ...profiles.map(p => ({
                                                            value: p.id,
                                                            label: p.name,
                                                            icon: <ShieldCheck className="w-4 h-4 text-orange-400" />
                                                        }))
                                                    ]}
                                                    placeholder="Selecione um perfil customizado..."
                                                />
                                                <p className="text-[9px] text-[var(--color-text-muted)] ml-1">* Perfis sobrescrevem permissões padrão da role.</p>
                                            </div>

                                            <div className="space-y-3 pt-2">
                                                <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Setores de Atuação</label>
                                                <div className="flex flex-col gap-2 p-4 bg-background/30 rounded-2xl border border-border-theme/50 max-h-[200px] overflow-y-auto custom-scrollbar">
                                                    {sectors.map(sector => {
                                                        const isSelected = (currentUser.sectors || []).some(s => s.id === sector.id) || (currentUser as any).sector_ids?.includes(sector.id);
                                                        return (
                                                            <button
                                                                key={sector.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    const currentSectors = currentUser.sectors || [];
                                                                    // @ts-ignore
                                                                    const currentIds = (currentUser as any).sector_ids || currentSectors.map(s => s.id);

                                                                    let newIds;
                                                                    if (currentIds.includes(sector.id)) {
                                                                        newIds = currentIds.filter((id: number) => id !== sector.id);
                                                                    } else {
                                                                        newIds = [...currentIds, sector.id];
                                                                    }

                                                                    setCurrentUser({
                                                                        ...currentUser,
                                                                        // @ts-ignore
                                                                        sector_ids: newIds,
                                                                        // Update sectors object array for UI feedback while editing (optimistic)
                                                                        sectors: sectors.filter(s => newIds.includes(s.id))
                                                                    });
                                                                }}
                                                                className={clsx(
                                                                    "group flex items-center justify-start gap-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase transition-all border shadow-sm relative overflow-hidden",
                                                                    isSelected
                                                                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-emerald-500/10"
                                                                        : "bg-background border-border-theme text-[var(--color-text-muted)] hover:border-emerald-500/30 hover:bg-background/60 hover:text-foreground"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "w-4 h-4 rounded-md flex items-center justify-center border transition-all flex-shrink-0",
                                                                    isSelected ? "bg-emerald-500 border-emerald-500" : "border-gray-500/30 group-hover:border-emerald-500/50"
                                                                )}>
                                                                    {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                                </div>
                                                                <span className="text-left leading-relaxed">{sector.name}</span>
                                                            </button>
                                                        );
                                                    })}
                                                    {sectors.length === 0 && (
                                                        <div className="col-span-full text-center text-[10px] text-gray-500 italic py-2">
                                                            Nenhum setor disponível.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Email</label>
                                                    <input type="email" required value={currentUser.email || ''} onChange={e => setCurrentUser({ ...currentUser, email: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none focus:border-accent-theme/50 transition-all" />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">{isEditingUser ? 'Nova Senha (Opcional)' : 'Senha'}</label>
                                                    <input type="password" required={!isEditingUser} value={currentUser.password || ''} onChange={e => setCurrentUser({ ...currentUser, password: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none focus:border-accent-theme/50 transition-all" />
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between p-5 bg-background/30 rounded-2xl border border-border-theme/50">
                                                <div className="flex items-center gap-3">
                                                    <div className={clsx("p-2 rounded-xl transition-colors", currentUser.is_active ? "bg-emerald-500/10 text-emerald-500" : "bg-gray-500/10 text-gray-500")}>
                                                        {currentUser.is_active ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-black uppercase tracking-wider">Status da Conta</div>
                                                        <div className="text-[10px] text-[var(--color-text-muted)]">{currentUser.is_active ? 'Usuário pode acessar o sistema' : 'Acesso bloqueado'}</div>
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => setCurrentUser({ ...currentUser, is_active: !currentUser.is_active })} className={clsx("w-12 h-7 rounded-full relative transition-all shadow-inner", currentUser.is_active ? "bg-emerald-500" : "bg-gray-600/30")}>
                                                    <div className={clsx("w-5 h-5 bg-white rounded-full absolute top-1 transition-all shadow-sm", currentUser.is_active ? "left-6" : "left-1")} />
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                    <div className="h-4"></div> {/* Spacer for scroll bottom */}
                                </div>
                                <div className="p-6 border-t border-border-theme/50 flex-shrink-0 flex justify-end gap-4 bg-background/50 backdrop-blur-md z-20 relative">
                                    <button type="button" onClick={() => setIsUserModalOpen(false)} className="text-[10px] font-black uppercase hover:bg-white/5 px-6 py-4 rounded-2xl transition-all">Cancelar</button>
                                    <button type="submit" form="user-form" className="px-10 py-4 premium-gradient text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:scale-105 active:scale-95 transition-all">Salvar</button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Modal de Perfis */}
                {
                    isProfileModalOpen && (
                        <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 animate-fade-in">
                            <div className="glass-card w-full max-w-2xl rounded-[2.5rem] border border-border-theme shadow-3xl animate-zoom-in max-h-[90vh] flex flex-col overflow-hidden">
                                <div className="p-10 border-b border-border-theme/50 flex-shrink-0 bg-background/50 backdrop-blur-md z-10">
                                    <h2 className="text-4xl font-black italic uppercase tracking-tight">
                                        {currentProfile.id ? 'Editar' : 'Novo'} <span className="text-accent-theme">Perfil</span>
                                    </h2>
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar p-10">
                                    <form id="profile-form" onSubmit={handleSaveProfile} className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Nome do Perfil</label>
                                            <input
                                                type="text"
                                                required
                                                value={currentProfile.name || ''}
                                                onChange={e => setCurrentProfile({ ...currentProfile, name: e.target.value })}
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none focus:border-orange-500/50 transition-colors"
                                                placeholder="Ex: Gerente de Contas"
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Descrição</label>
                                            <textarea
                                                rows={2}
                                                value={currentProfile.description || ''}
                                                onChange={e => setCurrentProfile({ ...currentProfile, description: e.target.value })}
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none focus:border-orange-500/50 transition-colors resize-none"
                                                placeholder="Breve descrição das responsabilidades..."
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Permissões de Menu */}
                                            <div className="space-y-4">
                                                <h3 className="text-[10px] font-black italic text-foreground uppercase tracking-widest border-l-4 border-accent-theme pl-3">Acesso <span className="text-accent-theme">a Menus</span></h3>
                                                <div className="space-y-2">
                                                    <div
                                                        onClick={() => toggleProfilePermission('menus', '*')}
                                                        className={clsx(
                                                            "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all group select-none active:scale-[0.98]",
                                                            currentProfile.permissions?.menus?.includes('*')
                                                                ? "bg-accent-theme/10 border-accent-theme/50"
                                                                : "bg-white/5 border-border-theme/50 hover:border-accent-theme/30"
                                                        )}
                                                    >
                                                        <div className={clsx(
                                                            "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                            currentProfile.permissions?.menus?.includes('*')
                                                                ? "border-accent-theme bg-accent-theme text-white shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.3)]"
                                                                : "border-white/20 bg-white/5 group-hover:border-white/40"
                                                        )}>
                                                            {currentProfile.permissions?.menus?.includes('*') && <Check size={12} strokeWidth={4} />}
                                                        </div>
                                                        <span className={clsx(
                                                            "text-xs font-black uppercase tracking-wider transition-colors",
                                                            currentProfile.permissions?.menus?.includes('*') ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground"
                                                        )}>Acesso Total (Admin)</span>
                                                    </div>

                                                    {!currentProfile.permissions?.menus?.includes('*') && AVAILABLE_MENUS.map(menu => {
                                                        const isChecked = currentProfile.permissions?.menus?.includes(menu.id) || false;
                                                        return (
                                                            <div
                                                                key={menu.id}
                                                                onClick={() => toggleProfilePermission('menus', menu.id)}
                                                                className={clsx(
                                                                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all group select-none active:scale-[0.98]",
                                                                    isChecked
                                                                        ? "bg-accent-theme/5 border-accent-theme/30"
                                                                        : "bg-transparent border-border-theme/30 hover:bg-white/5 hover:border-border-theme/50"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                                    isChecked
                                                                        ? "border-accent-theme bg-accent-theme text-white shadow-sm"
                                                                        : "border-white/10 bg-white/5 group-hover:border-white/30"
                                                                )}>
                                                                    {isChecked && <Check size={12} strokeWidth={4} />}
                                                                </div>
                                                                <span className={clsx(
                                                                    "text-xs font-bold transition-colors",
                                                                    isChecked ? "text-foreground" : "text-[var(--color-text-muted)] group-hover:text-foreground"
                                                                )}>{menu.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Permissões de Ação */}
                                            <div className="space-y-4">
                                                <h3 className="text-[10px] font-black italic text-foreground uppercase tracking-widest border-l-4 border-accent-theme pl-3">Permissões <span className="text-accent-theme">de Ação</span></h3>
                                                <div className="space-y-2">
                                                    <div
                                                        onClick={() => toggleProfilePermission('actions', '*')}
                                                        className={clsx(
                                                            "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all group select-none active:scale-[0.98]",
                                                            currentProfile.permissions?.actions?.includes('*')
                                                                ? "bg-accent-theme/10 border-accent-theme/50"
                                                                : "bg-white/5 border-border-theme/50 hover:border-accent-theme/30"
                                                        )}
                                                    >
                                                        <div className={clsx(
                                                            "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                            currentProfile.permissions?.actions?.includes('*')
                                                                ? "border-accent-theme bg-accent-theme text-white shadow-[0_0_10px_rgba(var(--accent-color-rgb),0.3)]"
                                                                : "border-white/20 bg-white/5 group-hover:border-white/40"
                                                        )}>
                                                            {currentProfile.permissions?.actions?.includes('*') && <Check size={12} strokeWidth={4} />}
                                                        </div>
                                                        <span className={clsx(
                                                            "text-xs font-black uppercase tracking-wider transition-colors",
                                                            currentProfile.permissions?.actions?.includes('*') ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground"
                                                        )}>Superusuário</span>
                                                    </div>

                                                    {!currentProfile.permissions?.actions?.includes('*') && AVAILABLE_ACTIONS.map(action => {
                                                        const isChecked = currentProfile.permissions?.actions?.includes(action.id) || false;
                                                        return (
                                                            <div
                                                                key={action.id}
                                                                onClick={() => toggleProfilePermission('actions', action.id)}
                                                                className={clsx(
                                                                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all group select-none active:scale-[0.98]",
                                                                    isChecked
                                                                        ? "bg-accent-theme/5 border-accent-theme/30"
                                                                        : "bg-transparent border-border-theme/30 hover:bg-white/5 hover:border-border-theme/50"
                                                                )}
                                                            >
                                                                <div className={clsx(
                                                                    "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-300",
                                                                    isChecked
                                                                        ? "border-accent-theme bg-accent-theme text-white shadow-sm"
                                                                        : "border-white/10 bg-white/5 group-hover:border-white/30"
                                                                )}>
                                                                    {isChecked && <Check size={12} strokeWidth={4} />}
                                                                </div>
                                                                <span className={clsx(
                                                                    "text-xs font-bold transition-colors",
                                                                    isChecked ? "text-foreground" : "text-[var(--color-text-muted)] group-hover:text-foreground"
                                                                )}>{action.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </form>
                                    <div className="h-4"></div> {/* Spacer for scroll bottom */}
                                </div>
                                <div className="p-6 border-t border-border-theme/50 flex-shrink-0 flex justify-end gap-4 bg-background/50 backdrop-blur-md z-20 relative">
                                    <button type="button" onClick={() => setIsProfileModalOpen(false)} className="px-6 py-4 rounded-2xl text-xs font-black uppercase hover:bg-white/5 transition-colors">Cancelar</button>
                                    <button type="submit" form="profile-form" className="px-10 py-4 premium-gradient text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:shadow-orange-500/20 transition-all transform active:scale-95">
                                        {loadingProfiles ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Perfil'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
                {zoomedQr && (
                    <div 
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300 cursor-zoom-out"
                        onClick={() => setZoomedChannelId(null)}
                    >
                        <div className="relative p-6 bg-white rounded-3xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-4 transition-transform duration-300 scale-100 cursor-default" onClick={(e) => e.stopPropagation()}>
                            <button 
                                onClick={() => setZoomedChannelId(null)} 
                                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                            <img src={zoomedQr} alt="QR Code Ampliado" className="w-[300px] h-[300px] sm:w-[450px] sm:h-[450px] block rounded-xl shadow-inner border border-slate-100" />
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider select-none">Clique fora para fechar</p>
                        </div>
                    </div>
                )}
                {/* ========================================================================= */}
                {/* MODAIS WHATSAPP (Nível Raiz para cobrir 100% da viewport/sidebar)         */}
                {/* ========================================================================= */}

                {/* Modal WhatsApp: Cadastrar Novo Arquivo Pré-Salvo na Biblioteca */}
                <AnimatePresence>
                    {isNewFileModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[3000] flex items-center justify-center p-4"
                            onClick={(e) => { if (e.target === e.currentTarget && !uploadingFile) setIsNewFileModalOpen(false); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 15 }}
                                className="relative w-full max-w-lg bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
                                style={{ background: 'var(--color-card)' }}
                            >
                                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-accent-theme/15 text-accent-theme rounded-xl">
                                            <Upload className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black italic uppercase tracking-tight text-foreground">
                                                Novo Arquivo Pré-Salvo
                                            </h3>
                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                Cadastre um documento ou mídia para envio rápido nos atendimentos
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        disabled={uploadingFile}
                                        onClick={() => setIsNewFileModalOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                <form onSubmit={handleUploadNewFile} className="p-6 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
                                    {/* Selecionar Arquivo */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Arquivo / Documento <span className="text-accent-theme">*</span>
                                        </label>
                                        <div
                                            onClick={() => document.getElementById('new-file-upload-input')?.click()}
                                            className={clsx(
                                                "p-5 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer",
                                                selectedUploadFile
                                                    ? "border-accent-theme/50 bg-accent-theme/5"
                                                    : "border-white/15 hover:border-accent-theme/50 bg-white/5 hover:bg-white/[0.08]"
                                            )}
                                        >
                                            <input
                                                id="new-file-upload-input"
                                                type="file"
                                                className="hidden"
                                                onChange={e => {
                                                    const f = e.target.files?.[0];
                                                    if (f) {
                                                        setSelectedUploadFile(f);
                                                        if (!newFileForm.titulo) {
                                                            setNewFileForm(p => ({ ...p, titulo: f.name.replace(/\.[^/.]+$/, '') }));
                                                        }
                                                    }
                                                }}
                                            />
                                            {selectedUploadFile ? (
                                                <div className="space-y-1">
                                                    <div className="w-10 h-10 rounded-xl bg-accent-theme/20 text-accent-theme flex items-center justify-center mx-auto mb-1.5">
                                                        <Check className="w-5 h-5" />
                                                    </div>
                                                    <p className="text-xs font-bold text-foreground truncate max-w-xs">{selectedUploadFile.name}</p>
                                                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                        {(selectedUploadFile.size / (1024 * 1024)).toFixed(2)} MB · Clique para trocar
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <div className="w-10 h-10 rounded-xl bg-white/10 text-[var(--color-text-muted)] flex items-center justify-center mx-auto mb-1.5">
                                                        <Upload className="w-5 h-5" />
                                                    </div>
                                                    <p className="text-xs font-bold text-foreground">Clique para escolher ou arraste o arquivo</p>
                                                    <p className="text-[10px] text-[var(--color-text-muted)]">PDF, DOC, XLS, Imagens, Vídeos, Áudios (até 50MB)</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Título de Apresentação */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Título de Exibição <span className="text-accent-theme">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Ex: Tabela de Preços 2026, Catálogo de Produtos..."
                                            value={newFileForm.titulo}
                                            onChange={e => setNewFileForm(p => ({ ...p, titulo: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                    </div>

                                    {/* Grupo / Pasta */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Grupo / Pasta de Organização <span className="text-accent-theme">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            list="file-group-suggestions"
                                            placeholder="Ex: Manuais, Tabelas de Preço, Comercial, Contratos..."
                                            value={newFileForm.grupo}
                                            onChange={e => setNewFileForm(p => ({ ...p, grupo: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                    </div>

                                    {/* Controle de Acesso por Setor */}
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                            Controle de Acesso por Setor
                                        </label>

                                        {/* Checkbox Todos os Setores */}
                                        <div
                                            onClick={() => setNewFileForm(p => ({
                                                ...p,
                                                allSectors: !p.allSectors,
                                                setores: !p.allSectors ? [] : p.setores
                                            }))}
                                            className={clsx(
                                                "flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                                                newFileForm.allSectors
                                                    ? "bg-accent-theme/15 border-accent-theme/60 shadow-sm shadow-accent-theme/10"
                                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                newFileForm.allSectors
                                                    ? "bg-accent-theme border-accent-theme text-white shadow-md shadow-accent-theme/30"
                                                    : "border-white/25 bg-white/5"
                                            )}>
                                                {newFileForm.allSectors && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                    🌐 <span>Acesso Livre para Todos os Setores</span>
                                                </p>
                                                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Qualquer atendente poderá ver e enviar este arquivo.</p>
                                            </div>
                                        </div>

                                        {/* Seleção de Setores Específicos com Animação Suave */}
                                        <AnimatePresence>
                                            {!newFileForm.allSectors && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                                    exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-2 mt-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                                                            Selecione os setores autorizados:
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {sectors.map(sec => {
                                                                const isSelected = newFileForm.setores.includes(sec.id);
                                                                return (
                                                                    <button
                                                                        key={sec.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setNewFileForm(p => ({
                                                                                ...p,
                                                                                setores: isSelected
                                                                                    ? p.setores.filter(id => id !== sec.id)
                                                                                    : [...p.setores, sec.id]
                                                                            }));
                                                                        }}
                                                                        className={clsx(
                                                                            "p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer select-none",
                                                                            isSelected
                                                                                ? "bg-accent-theme/20 border-accent-theme text-foreground shadow-sm shadow-accent-theme/10"
                                                                                : "bg-white/5 border-white/5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-foreground"
                                                                        )}
                                                                    >
                                                                        <span className="truncate flex items-center gap-1.5">🏢 {sec.name}</span>
                                                                        <div className={clsx(
                                                                            "w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0",
                                                                            isSelected
                                                                                ? "bg-accent-theme border-accent-theme text-white"
                                                                                : "border-white/20 bg-white/5"
                                                                        )}>
                                                                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Descrição Interna */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Observação / Descrição Interna
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="Notas internas sobre quando usar ou enviar este arquivo..."
                                            value={newFileForm.descricao}
                                            onChange={e => setNewFileForm(p => ({ ...p, descricao: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                    </div>

                                    <div className="pt-2 flex items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            disabled={uploadingFile}
                                            onClick={() => setIsNewFileModalOpen(false)}
                                            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-[var(--color-text-muted)] transition-all cursor-pointer"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={uploadingFile || !selectedUploadFile}
                                            className="px-5 py-2.5 rounded-xl bg-accent-theme hover:opacity-90 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-accent-theme/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                            Cadastrar Arquivo
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modal WhatsApp: Editar Metadados e Permissões do Arquivo */}
                <AnimatePresence>
                    {isEditFileModalOpen && editingFile && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[3000] flex items-center justify-center p-4"
                            onClick={(e) => { if (e.target === e.currentTarget) setIsEditFileModalOpen(false); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 15 }}
                                className="relative w-full max-w-lg bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
                                style={{ background: 'var(--color-card)' }}
                            >
                                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-accent-theme/15 text-accent-theme rounded-xl">
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black italic uppercase tracking-tight text-foreground">
                                                Editar Arquivo
                                            </h3>
                                            <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[280px]">
                                                {editingFile.filename}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsEditFileModalOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                    {/* Título de Exibição */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Título de Exibição <span className="text-accent-theme">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Tabela de Preços 2026..."
                                            value={fileMetaForm.titulo}
                                            onChange={e => setFileMetaForm(p => ({ ...p, titulo: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                    </div>

                                    {/* Grupo / Pasta */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Grupo / Pasta de Organização <span className="text-accent-theme">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            list="file-group-suggestions"
                                            placeholder="Ex: Manuais, Contratos, Comprovantes, Comercial"
                                            value={fileMetaForm.grupo}
                                            onChange={e => setFileMetaForm(p => ({ ...p, grupo: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                        <datalist id="file-group-suggestions">
                                            <option value="Manuais & Documentação" />
                                            <option value="Contratos & Modelos" />
                                            <option value="Comprovantes & Financeiro" />
                                            <option value="Tabelas de Preço & Comercial" />
                                            <option value="Institucional" />
                                            <option value="Geral" />
                                        </datalist>
                                    </div>

                                    {/* Controle de Acesso por Setor */}
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                            Controle de Acesso por Setores
                                        </label>

                                        {/* Checkbox Todos os Setores */}
                                        <div
                                            onClick={() => setFileMetaForm(p => ({
                                                ...p,
                                                allSectors: !p.allSectors,
                                                setores: !p.allSectors ? [] : p.setores
                                            }))}
                                            className={clsx(
                                                "flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                                                fileMetaForm.allSectors
                                                    ? "bg-accent-theme/15 border-accent-theme/60 shadow-sm shadow-accent-theme/10"
                                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                            )}
                                        >
                                            <div className={clsx(
                                                "w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                fileMetaForm.allSectors
                                                    ? "bg-accent-theme border-accent-theme text-white shadow-md shadow-accent-theme/30"
                                                    : "border-white/25 bg-white/5"
                                            )}>
                                                {fileMetaForm.allSectors && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                    🌐 <span>Acesso Livre para Todos os Setores</span>
                                                </p>
                                                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Disponível para todos os atendentes.</p>
                                            </div>
                                        </div>

                                        {/* Seleção de Setores Específicos com Animação Suave */}
                                        <AnimatePresence>
                                            {!fileMetaForm.allSectors && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                                    exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-2 mt-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                                                            Selecione os setores autorizados:
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {sectors.map(sec => {
                                                                const isSelected = fileMetaForm.setores.includes(sec.id);
                                                                return (
                                                                    <button
                                                                        key={sec.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setFileMetaForm(p => ({
                                                                                ...p,
                                                                                setores: isSelected
                                                                                    ? p.setores.filter(id => id !== sec.id)
                                                                                    : [...p.setores, sec.id]
                                                                            }));
                                                                        }}
                                                                        className={clsx(
                                                                            "p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer select-none",
                                                                            isSelected
                                                                                ? "bg-accent-theme/20 border-accent-theme text-foreground shadow-sm shadow-accent-theme/10"
                                                                                : "bg-white/5 border-white/5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-foreground"
                                                                        )}
                                                                    >
                                                                        <span className="truncate flex items-center gap-1.5">🏢 {sec.name}</span>
                                                                        <div className={clsx(
                                                                            "w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0",
                                                                            isSelected
                                                                                ? "bg-accent-theme border-accent-theme text-white"
                                                                                : "border-white/20 bg-white/5"
                                                                        )}>
                                                                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Descrição Interna */}
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                            Observação / Descrição Interna
                                        </label>
                                        <textarea
                                            rows={2}
                                            placeholder="Notas sobre o arquivo para a equipe..."
                                            value={fileMetaForm.descricao}
                                            onChange={e => setFileMetaForm(p => ({ ...p, descricao: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="p-6 border-t border-white/10 flex items-center justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditFileModalOpen(false)}
                                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-[var(--color-text-muted)] transition-all cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={savingFileMeta}
                                        onClick={handleSaveFileMetadata}
                                        className="px-5 py-2.5 rounded-xl bg-accent-theme hover:opacity-90 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-accent-theme/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                    >
                                        {savingFileMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        Salvar Alterações
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modal WhatsApp: Visualizar Arquivo (Lightbox) */}
                <AnimatePresence>
                    {filePreviewItem && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[3000] flex items-center justify-center p-4"
                            onClick={(e) => { if (e.target === e.currentTarget) setFilePreviewItem(null); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative w-full max-w-2xl bg-card rounded-3xl border border-white/10 p-6 space-y-4 shadow-2xl overflow-hidden"
                                style={{ background: 'var(--color-card)' }}
                            >
                                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                    <div className="min-w-0 flex-1 pr-4">
                                        <h3 className="text-sm font-bold text-foreground truncate">{filePreviewItem.titulo || filePreviewItem.filename}</h3>
                                        <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{filePreviewItem.size_formatted}</p>
                                    </div>
                                    <button
                                        onClick={() => setFilePreviewItem(null)}
                                        className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="flex items-center justify-center min-h-[240px] max-h-[60vh] overflow-hidden rounded-2xl bg-black/40 border border-white/5">
                                    {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(filePreviewItem.ext) ? (
                                        <img src={filePreviewItem.url} alt={filePreviewItem.filename} className="max-h-[60vh] w-auto object-contain" />
                                    ) : ['mp4', 'webm', 'mov'].includes(filePreviewItem.ext) ? (
                                        <video src={filePreviewItem.url} controls className="max-h-[60vh] w-full" />
                                    ) : ['mp3', 'ogg', 'wav', 'opus', 'aac'].includes(filePreviewItem.ext) ? (
                                        <audio src={filePreviewItem.url} controls className="w-full p-4" />
                                    ) : (
                                        <div className="p-8 text-center space-y-3">
                                            <FileText className="w-12 h-12 mx-auto text-blue-400" />
                                            <p className="text-xs text-foreground font-bold">Arquivo de Documento</p>
                                            <a
                                                href={filePreviewItem.url}
                                                download={filePreviewItem.filename}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-theme text-white text-xs font-bold cursor-pointer"
                                            >
                                                <Download className="w-4 h-4" />
                                                Baixar Arquivo
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modal WhatsApp: Criar/Editar Mensagem Rápida com Layout 2 Colunas (Configurações à Esquerda, Preview WhatsApp à Direita) */}
                <AnimatePresence>
                    {isQrModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[3000] flex items-center justify-center p-3 sm:p-5"
                            onClick={(e) => { if (e.target === e.currentTarget) setIsQrModalOpen(false); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                                className="relative w-full max-w-5xl max-h-[92vh] bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
                                style={{ background: 'var(--color-card)' }}
                            >
                                {/* Header do Modal */}
                                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-accent-theme/15 text-accent-theme rounded-xl">
                                            <Zap className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black italic uppercase tracking-tight text-foreground">
                                                {editingQr ? 'Editar Mensagem Rápida' : 'Nova Mensagem Rápida'}
                                            </h3>
                                            <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
                                                Configure os parâmetros à esquerda e acompanhe a pré-visualização em tempo real à direita
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsQrModalOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Corpo em 2 Colunas */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden">
                                    
                                    {/* COLUNA ESQUERDA: Formulário & Sequência de Blocos (7 colunas) */}
                                    <div className="lg:col-span-7 p-6 space-y-4 overflow-y-auto custom-scrollbar border-b lg:border-b-0 lg:border-r border-white/10">
                                        {/* Título & Atalho */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                                    Título / Nome <span className="text-accent-theme">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: Chave Pix Financeiro"
                                                    value={qrForm.titulo}
                                                    onChange={e => setQrForm(p => ({ ...p, titulo: e.target.value }))}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                                    Atalho de Teclado
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ex: /pix ou /ola"
                                                    value={qrForm.atalho}
                                                    onChange={e => {
                                                        let val = e.target.value;
                                                        if (val && !val.startsWith('/')) val = `/${val}`;
                                                        setQrForm(p => ({ ...p, atalho: val }));
                                                    }}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                                />
                                            </div>
                                        </div>

                                        {/* Grupo / Categoria */}
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                                                Grupo / Pasta de Agrupamento <span className="text-accent-theme">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                list="qr-group-suggestions"
                                                placeholder="Ex: 👋 Atendimento Inicial, 💳 Financeiro, ⏳ Em Análise"
                                                value={qrForm.grupo}
                                                onChange={e => setQrForm(p => ({ ...p, grupo: e.target.value, categoria: e.target.value }))}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                            />
                                            <datalist id="qr-group-suggestions">
                                                <option value="👋 Atendimento Inicial" />
                                                <option value="⏳ Em Análise / Aguarde" />
                                                <option value="📄 Documentos & Comprovantes" />
                                                <option value="💳 Financeiro / Cobrança" />
                                                <option value="✅ Finalização" />
                                                <option value="📍 Informações Gerais" />
                                                <option value="🛠️ Suporte Técnico" />
                                            </datalist>
                                        </div>

                                        {/* Controle de Acesso por Setores */}
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                                Controle de Acesso por Setores
                                            </label>

                                            <div
                                                onClick={() => setQrForm(p => ({
                                                    ...p,
                                                    allSectors: !p.allSectors,
                                                    setores: !p.allSectors ? [] : p.setores
                                                }))}
                                                className={clsx(
                                                    "flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer select-none",
                                                    qrForm.allSectors
                                                        ? "bg-accent-theme/15 border-accent-theme/60 shadow-sm shadow-accent-theme/10"
                                                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                                )}
                                            >
                                                <div className={clsx(
                                                    "w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                    qrForm.allSectors
                                                        ? "bg-accent-theme border-accent-theme text-white shadow-md shadow-accent-theme/30"
                                                        : "border-white/25 bg-white/5"
                                                )}>
                                                    {qrForm.allSectors && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                        🌐 <span>Acesso Livre para Todos os Setores</span>
                                                    </p>
                                                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">Disponível no chat para todos os atendentes da empresa.</p>
                                                </div>
                                            </div>

                                            {/* Seleção de Setores Específicos com Animação Suave */}
                                            <AnimatePresence>
                                                {!qrForm.allSectors && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                                        exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="p-3 rounded-2xl bg-black/25 border border-white/10 space-y-2 mt-1">
                                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                                                                Selecione os setores autorizados:
                                                            </p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {sectors.map(sec => {
                                                                    const isSelected = qrForm.setores.includes(sec.id);
                                                                    return (
                                                                        <button
                                                                            key={sec.id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setQrForm(p => ({
                                                                                    ...p,
                                                                                    setores: isSelected
                                                                                        ? p.setores.filter(id => id !== sec.id)
                                                                                        : [...p.setores, sec.id]
                                                                                }));
                                                                            }}
                                                                            className={clsx(
                                                                                "p-2 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer select-none",
                                                                                isSelected
                                                                                    ? "bg-accent-theme/20 border-accent-theme text-foreground shadow-sm shadow-accent-theme/10"
                                                                                    : "bg-white/5 border-white/5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-foreground"
                                                                            )}
                                                                        >
                                                                            <span className="truncate flex items-center gap-1.5">🏢 {sec.name}</span>
                                                                            <div className={clsx(
                                                                                "w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0",
                                                                                isSelected
                                                                                    ? "bg-accent-theme border-accent-theme text-white"
                                                                                    : "border-white/20 bg-white/5"
                                                                            )}>
                                                                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* Sequência de Mensagens & Arquivos (Pipeline de Blocos) */}
                                        <div className="space-y-3 pt-1">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                                        Sequência de Envio (Pipeline de Blocos) <span className="text-accent-theme">*</span>
                                                    </label>
                                                    <p className="text-[10px] text-[var(--color-text-muted)]">
                                                        Organize os passos na ordem exata de entrega.
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-theme/15 text-accent-theme border border-accent-theme/20">
                                                    {qrForm.blocos.length} passo{qrForm.blocos.length > 1 ? 's' : ''}
                                                </span>
                                            </div>

                                            {/* Lista de Blocos Ordenados */}
                                            <div className="space-y-2.5">
                                                {qrForm.blocos.map((block, idx) => (
                                                    <div
                                                        key={block.id}
                                                        className="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-2.5 animate-in fade-in duration-150 relative group/block"
                                                    >
                                                        {/* Header do Bloco */}
                                                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="px-2 py-0.5 rounded-lg bg-white/10 text-white font-mono text-[10px] font-bold">
                                                                    #{idx + 1}
                                                                </span>
                                                                <span className={clsx(
                                                                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1.5",
                                                                    block.tipo === 'texto'
                                                                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                                                        : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                                                                )}>
                                                                    {block.tipo === 'texto' ? <FileText className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
                                                                    {block.tipo === 'texto' ? 'Texto' : `Arquivo (${(block as any).ext || 'Anexo'})`}
                                                                </span>
                                                            </div>

                                                            {/* Ações do Bloco: Subir, Descer, Remover */}
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === 0}
                                                                    onClick={() => moveQrBlock(idx, 'up')}
                                                                    title="Mover para cima"
                                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--color-text-muted)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                                                                >
                                                                    <ArrowUp className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={idx === qrForm.blocos.length - 1}
                                                                    onClick={() => moveQrBlock(idx, 'down')}
                                                                    title="Mover para baixo"
                                                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-[var(--color-text-muted)] hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                                                                >
                                                                    <ArrowDown className="w-3 h-3" />
                                                                </button>
                                                                {qrForm.blocos.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeQrBlock(block.id)}
                                                                        title="Remover este passo"
                                                                        className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-[var(--color-text-muted)] hover:text-red-400 transition-all ml-1 cursor-pointer"
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Conteúdo do Bloco: Texto vs Arquivo */}
                                                        {block.tipo === 'texto' ? (
                                                            <div className="space-y-2">
                                                                <textarea
                                                                    rows={3}
                                                                    placeholder={`Digite o texto do passo #${idx + 1}...`}
                                                                    value={block.texto}
                                                                    onChange={e => updateQrBlock(block.id, { texto: e.target.value })}
                                                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all leading-relaxed custom-scrollbar"
                                                                />

                                                                {/* Variáveis Dinâmicas para este bloco */}
                                                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                                                    <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase mr-1">
                                                                        + Variáveis:
                                                                    </span>
                                                                    {[
                                                                        { tag: '{cliente_nome}', label: 'Cliente' },
                                                                        { tag: '{atendente_nome}', label: 'Atendente' },
                                                                        { tag: '{saudacao}', label: 'Saudação' },
                                                                        { tag: '{data_atual}', label: 'Data' }
                                                                    ].map(v => (
                                                                        <button
                                                                            key={v.tag}
                                                                            type="button"
                                                                            onClick={() => insertVariableInBlock(block.id, v.tag)}
                                                                            className="px-2 py-0.5 rounded-md bg-white/5 hover:bg-accent-theme/20 hover:text-accent-theme border border-white/10 text-[9px] font-mono text-[var(--color-text-muted)] transition-all cursor-pointer"
                                                                        >
                                                                            {v.tag}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2.5">
                                                                {/* Card do Arquivo Anexado */}
                                                                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                        <div className="w-9 h-9 rounded-lg bg-accent-theme/15 flex items-center justify-center text-accent-theme shrink-0">
                                                                            {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes((block.ext || '').toLowerCase()) ? (
                                                                                <Image className="w-5 h-5" />
                                                                            ) : ['mp4', 'webm', 'mov'].includes((block.ext || '').toLowerCase()) ? (
                                                                                <Video className="w-5 h-5" />
                                                                            ) : ['mp3', 'ogg', 'wav'].includes((block.ext || '').toLowerCase()) ? (
                                                                                <Music className="w-5 h-5" />
                                                                            ) : (
                                                                                <FileText className="w-5 h-5" />
                                                                            )}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-bold text-foreground truncate">
                                                                                {block.titulo || block.filename}
                                                                            </p>
                                                                            <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                                                {block.filename} • {block.size_formatted || 'Arquivo'}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setIsQrFilePickerOpen(true)}
                                                                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-[var(--color-text-muted)] hover:text-foreground border border-white/10 transition-all shrink-0 cursor-pointer"
                                                                    >
                                                                        Trocar Arquivo
                                                                    </button>
                                                                </div>

                                                                {/* Legenda Opcional */}
                                                                <div>
                                                                    <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                                                                        Legenda do Arquivo no WhatsApp (Opcional):
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Ex: Segue a tabela com as condições atualizadas..."
                                                                        value={block.legenda || ''}
                                                                        onChange={e => updateQrBlock(block.id, { legenda: e.target.value })}
                                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-foreground placeholder-[var(--color-text-muted)]/50 focus:border-accent-theme outline-none transition-all"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Botões para Adicionar Novos Passos */}
                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={addQrTextBlock}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-dashed border-white/15 hover:border-accent-theme/40 text-xs font-bold text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                                >
                                                    <Plus className="w-3.5 h-3.5 text-accent-theme" />
                                                    + Adicionar Texto
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        fetchFilesList(1, 'all', 'all', 'all', '');
                                                        setIsQrFilePickerOpen(true);
                                                    }}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent-theme/10 hover:bg-accent-theme/20 border border-dashed border-accent-theme/30 hover:border-accent-theme/60 text-xs font-bold text-accent-theme transition-all cursor-pointer"
                                                >
                                                    <Paperclip className="w-3.5 h-3.5" />
                                                    + Anexar do Banco de Arquivos
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* COLUNA DIREITA: Preview em Tempo Real no WhatsApp (5 colunas) */}
                                    <div className="lg:col-span-5 p-6 bg-black/40 flex flex-col justify-between overflow-y-auto custom-scrollbar border-t lg:border-t-0">
                                        <div className="space-y-4">
                                            {/* Cabeçalho do Preview */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                                                        <Smartphone className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-wider text-foreground">
                                                            Pré-visualização WhatsApp
                                                        </p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)]">
                                                            Visualização exata recebida pelo cliente
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                                    ● Ao Vivo
                                                </span>
                                            </div>

                                            {/* Card Mockup de Telefone / Conversa */}
                                            <div className="rounded-3xl border border-white/10 bg-[#0c1317] overflow-hidden shadow-2xl flex flex-col">
                                                {/* WhatsApp Header Mockup */}
                                                <div className="bg-[#202c33] px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-black text-xs text-white shadow-sm">
                                                            MS
                                                        </div>
                                                        <div className="leading-tight">
                                                            <p className="text-xs font-bold text-white">Maria Silva (Cliente)</p>
                                                            <p className="text-[10px] text-emerald-400 font-medium">online</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-slate-400">
                                                        <Video className="w-4 h-4" />
                                                        <Phone className="w-3.5 h-3.5" />
                                                    </div>
                                                </div>

                                                {/* WhatsApp Chat Area (Wallpaper) */}
                                                <div
                                                    className="p-4 space-y-3.5 min-h-[260px] max-h-[380px] overflow-y-auto custom-scrollbar flex flex-col justify-end"
                                                    style={{
                                                        backgroundColor: '#0b141a',
                                                        backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0)',
                                                        backgroundSize: '16px 16px'
                                                    }}
                                                >
                                                    {/* Data Chip */}
                                                    <div className="flex justify-center">
                                                        <span className="px-2.5 py-0.5 rounded-lg bg-[#182229] text-[10px] text-slate-400 shadow-sm">
                                                            Hoje
                                                        </span>
                                                    </div>

                                                    {/* Balões da Sequência */}
                                                    {qrForm.blocos.map((block, idx) => {
                                                        const isLast = idx === qrForm.blocos.length - 1;

                                                        if (block.tipo === 'texto') {
                                                            const resolved = resolvePreviewVariables(block.texto);
                                                            return (
                                                                <div key={block.id} className="space-y-1">
                                                                    <div className="flex justify-end">
                                                                        <div className="relative max-w-[85%] p-3 rounded-2xl rounded-tr-xs bg-[#005c4b] text-white shadow-md space-y-1">
                                                                            <p className="text-xs font-normal leading-relaxed whitespace-pre-wrap">
                                                                                {resolved || <span className="italic text-white/50">Texto do passo #{idx + 1}...</span>}
                                                                            </p>
                                                                            <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200/70 pt-0.5">
                                                                                <span>14:32</span>
                                                                                <CheckCheck className="w-3 h-3 text-cyan-300" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {!isLast && (
                                                                        <div className="flex items-center justify-end gap-1 text-[9px] text-[var(--color-text-muted)] pr-1">
                                                                            <Clock className="w-2.5 h-2.5 text-amber-400" />
                                                                            <span>intervalo seguro ~1s</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        } else {
                                                            const captionResolved = resolvePreviewVariables(block.legenda || '');
                                                            return (
                                                                <div key={block.id} className="space-y-1">
                                                                    <div className="flex justify-end">
                                                                        <div className="relative max-w-[85%] p-2 rounded-2xl rounded-tr-xs bg-[#005c4b] text-white shadow-md space-y-2">
                                                                            {/* Card Interno do Arquivo */}
                                                                            <div className="p-2.5 rounded-xl bg-black/20 border border-white/10 flex items-center gap-2.5">
                                                                                <div className="w-8 h-8 rounded-lg bg-emerald-700/60 flex items-center justify-center text-white shrink-0">
                                                                                    {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes((block.ext || '').toLowerCase()) ? (
                                                                                        <Image className="w-4 h-4" />
                                                                                    ) : ['mp4', 'webm', 'mov'].includes((block.ext || '').toLowerCase()) ? (
                                                                                        <Video className="w-4 h-4" />
                                                                                    ) : (
                                                                                        <FileText className="w-4 h-4" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1">
                                                                                    <p className="text-xs font-bold text-white truncate">
                                                                                        {block.titulo || block.filename || 'Documento'}
                                                                                    </p>
                                                                                    <p className="text-[9px] text-emerald-200/80 font-mono truncate">
                                                                                        {block.filename} {block.size_formatted ? `• ${block.size_formatted}` : ''}
                                                                                    </p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Legenda (se preenchida) */}
                                                                            {captionResolved && (
                                                                                <p className="text-xs leading-relaxed px-1 text-white/95">
                                                                                    {captionResolved}
                                                                                </p>
                                                                            )}

                                                                            <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200/70 pt-0.5 px-1">
                                                                                <span>14:32</span>
                                                                                <CheckCheck className="w-3 h-3 text-cyan-300" />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    {!isLast && (
                                                                        <div className="flex items-center justify-end gap-1 text-[9px] text-[var(--color-text-muted)] pr-1">
                                                                            <Clock className="w-2.5 h-2.5 text-amber-400" />
                                                                            <span>intervalo seguro ~1s</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Nota Informativa no Rodapé do Preview */}
                                        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 mt-4 space-y-1">
                                            <p className="text-[10px] font-bold text-foreground flex items-center gap-1.5">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                                <span>Pipeline Sequencial Seguro</span>
                                            </p>
                                            <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                                                Cada bloco é despachado separadamente com pausa simulada de digitação para garantir conformidade e evitar bloqueios.
                                            </p>
                                        </div>
                                    </div>

                                </div>

                                {/* Footer do Modal */}
                                <div className="p-4 px-6 border-t border-white/10 flex items-center justify-between bg-black/15 shrink-0">
                                    <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
                                        Atalho ativo: <strong className="text-foreground font-mono">{qrForm.atalho || '(nenhum)'}</strong>
                                    </span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsQrModalOpen(false)}
                                            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={savingQr}
                                            onClick={handleSaveQuickReply}
                                            className="px-6 py-2.5 rounded-xl bg-accent-theme hover:opacity-90 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-accent-theme/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {savingQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            {editingQr ? 'Salvar Alterações' : 'Criar Mensagem'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modal WhatsApp: Seletor do Banco de Arquivos para Respostas Rápidas */}
                <AnimatePresence>
                    {isQrFilePickerOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[3100] flex items-center justify-center p-4"
                            onClick={(e) => { if (e.target === e.currentTarget) setIsQrFilePickerOpen(false); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.94, y: 15 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.94, y: 15 }}
                                className="relative w-full max-w-2xl bg-card rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                                style={{ background: 'var(--color-card)' }}
                            >
                                {/* Header */}
                                <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-accent-theme/15 text-accent-theme rounded-xl">
                                            <HardDrive className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black italic uppercase tracking-tight text-foreground">
                                                Banco de Arquivos Pré-Salvos
                                            </h3>
                                            <p className="text-[10px] text-[var(--color-text-muted)] font-medium">
                                                Selecione um arquivo da biblioteca para incluir na sequência da resposta rápida
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsQrFilePickerOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                    >
                                        <XCircle className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Lista de Arquivos com Busca */}
                                <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1">
                                    {filesList.length === 0 ? (
                                        <div className="p-12 text-center space-y-3">
                                            <Folder className="w-10 h-10 mx-auto text-[var(--color-text-muted)]" />
                                            <p className="text-xs font-bold text-foreground">Nenhum arquivo pré-salvo cadastrado</p>
                                            <p className="text-[10px] text-[var(--color-text-muted)]">
                                                Cadastre novos arquivos na aba "Banco de Arquivos" para usá-los nas mensagens rápidas.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {filesList.map(file => (
                                                <div
                                                    key={file.id}
                                                    onClick={() => addQrFileBlock(file)}
                                                    className="p-3.5 rounded-2xl bg-white/5 hover:bg-accent-theme/15 border border-white/5 hover:border-accent-theme/50 transition-all cursor-pointer flex items-center justify-between gap-3 group/fcard"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-10 h-10 rounded-xl bg-white/5 group-hover/fcard:bg-accent-theme/20 flex items-center justify-center text-accent-theme shrink-0 transition-all">
                                                            {['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(file.ext) ? (
                                                                <Image className="w-5 h-5" />
                                                            ) : ['mp4', 'webm', 'mov'].includes(file.ext) ? (
                                                                <Video className="w-5 h-5" />
                                                            ) : ['mp3', 'ogg', 'wav'].includes(file.ext) ? (
                                                                <Music className="w-5 h-5" />
                                                            ) : (
                                                                <FileText className="w-5 h-5" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-foreground truncate group-hover/fcard:text-accent-theme transition-colors">
                                                                {file.titulo || file.filename}
                                                            </p>
                                                            <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                                                                {file.grupo || 'Geral'} • {file.size_formatted}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="px-2.5 py-1 rounded-lg bg-white/5 group-hover/fcard:bg-accent-theme group-hover/fcard:text-white text-[10px] font-bold text-[var(--color-text-muted)] transition-all shrink-0">
                                                        + Anexar
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-white/10 flex items-center justify-between text-[11px] text-[var(--color-text-muted)] px-6 shrink-0">
                                    <span>Total: {filesList.length} arquivos disponíveis</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsQrFilePickerOpen(false)}
                                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-foreground transition-all cursor-pointer"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Modal WhatsApp: Adicionar/Editar Canal */}
                <AnimatePresence>
                    {isChannelModalOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[3000] flex items-center justify-center p-4"
                            onClick={(e) => { if (e.target === e.currentTarget) setIsChannelModalOpen(false); }}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.93, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.93, y: 20 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                className="relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl border border-white/10"
                                style={{ background: 'var(--color-card)' }}
                            >
                                {/* Header */}
                                <div className="p-8 pb-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xl transition-transform"
                                                style={{
                                                    backgroundColor: channelForm.color || '#8b5cf6',
                                                    boxShadow: `0 8px 24px ${channelForm.color || '#8b5cf6'}40`
                                                }}
                                            >
                                                {channelForm.name?.charAt(0).toUpperCase() || <MessageSquare className="w-6 h-6" />}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-1">
                                                    {editingChannel ? 'Editando canal' : 'Novo canal'}
                                                </p>
                                                <h3 className="text-xl font-black italic uppercase tracking-tight text-foreground leading-none">
                                                    {channelForm.name || <span className="text-[var(--color-text-muted)] font-normal not-italic normal-case tracking-normal text-sm">Digite o nome abaixo</span>}
                                                </h3>
                                                {channelForm.port && (
                                                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-1">porta {channelForm.port}</p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setIsChannelModalOpen(false)}
                                            className="p-2 rounded-xl hover:bg-white/10 text-[var(--color-text-muted)] hover:text-foreground transition-all -mt-1 -mr-1 cursor-pointer"
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Separator */}
                                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                                {/* Form Body */}
                                <div className="px-8 py-6 space-y-5">

                                    {/* Nome */}
                                    <div>
                                        <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                                            <Tag className="w-3 h-3" />
                                            Nome do Canal
                                            <span className="text-accent-theme">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            autoFocus
                                            placeholder="Ex: Suporte, Comercial, Administrativo"
                                            value={channelForm.name || ''}
                                            onChange={e => setChannelForm(p => ({ ...p, name: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-accent-theme/50 rounded-xl px-4 py-3 text-foreground text-sm placeholder-[var(--color-text-muted)]/50 focus:ring-2 focus:ring-accent-theme/20 outline-none transition-all"
                                        />
                                    </div>

                                    {/* Porta + Cor */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                                                <Link2 className="w-3 h-3" />
                                                Porta
                                                <span className="text-accent-theme">*</span>
                                            </label>
                                            <input
                                                type="number"
                                                placeholder="5000"
                                                value={channelForm.port || ''}
                                                onChange={e => setChannelForm(p => ({ ...p, port: Number(e.target.value) }))}
                                                className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-accent-theme/50 rounded-xl px-4 py-3 text-foreground text-sm font-mono placeholder-[var(--color-text-muted)]/50 focus:ring-2 focus:ring-accent-theme/20 outline-none transition-all"
                                            />
                                            <p className="text-[9px] text-[var(--color-text-muted)]/60 mt-1.5 font-mono">Deve ser única por canal</p>
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                                                <Palette className="w-3 h-3" />
                                                Cor de Identificação
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="color"
                                                    value={channelForm.color || '#8b5cf6'}
                                                    onChange={e => setChannelForm(p => ({ ...p, color: e.target.value }))}
                                                    className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0"
                                                />
                                                <span className="text-xs font-mono text-[var(--color-text-muted)] uppercase">{channelForm.color || '#8b5cf6'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Setores Vinculados */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">
                                                <Layers className="w-3 h-3" />
                                                Setores Vinculados
                                            </label>
                                            <span className="text-[9px] text-[var(--color-text-muted)] font-medium">
                                                1 setor só pode pertencer a 1 conexão
                                            </span>
                                        </div>

                                        {/* Checkbox Todos os Setores */}
                                        {(() => {
                                            const isOccupiedGlobally = Object.keys(occupiedSectorsMap).length > 0;
                                            return (
                                                <div
                                                    onClick={() => {
                                                        if (isOccupiedGlobally) return;
                                                        setChannelForm(p => ({
                                                            ...p,
                                                            allSectors: !p.allSectors,
                                                            sector_ids: !p.allSectors ? [] : p.sector_ids
                                                        }));
                                                    }}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-3.5 rounded-2xl border transition-all select-none",
                                                        isOccupiedGlobally
                                                            ? "bg-white/[0.02] border-white/5 opacity-60 cursor-not-allowed"
                                                            : channelForm.allSectors
                                                                ? "bg-accent-theme/15 border-accent-theme/60 shadow-sm shadow-accent-theme/10 cursor-pointer"
                                                                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 cursor-pointer"
                                                    )}
                                                >
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                        isOccupiedGlobally
                                                            ? "border-white/10 bg-white/5 opacity-50"
                                                            : channelForm.allSectors
                                                                ? "bg-accent-theme border-accent-theme text-white shadow-md shadow-accent-theme/30"
                                                                : "border-white/25 bg-white/5"
                                                    )}>
                                                        {channelForm.allSectors && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                            🌐 <span>Utilizar em Todos os Setores (Geral)</span>
                                                        </p>
                                                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                                                            {isOccupiedGlobally
                                                                ? 'Indisponível pois já existem outros canais com setores vinculados.'
                                                                : 'Todos os operadores da empresa poderão atender por este número.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Seleção de Setores Individuais com Animação Suave */}
                                        <AnimatePresence>
                                            {!channelForm.allSectors && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                                    exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="p-3.5 rounded-2xl bg-black/25 border border-white/10 space-y-2 mt-1">
                                                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                                                            Selecione os setores deste canal:
                                                        </p>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {sectors.map(sec => {
                                                                const isSelected = channelForm.sector_ids.includes(sec.id);
                                                                const occupiedByOther = Boolean(occupiedSectorsMap[sec.id] && occupiedSectorsMap[sec.id] !== editingChannel?.id);
                                                                const occupiedChannelName = occupiedByOther ? (whatsappChannels.find(c => c.id === occupiedSectorsMap[sec.id])?.name || 'Outro canal') : '';

                                                                return (
                                                                    <button
                                                                        key={sec.id}
                                                                        type="button"
                                                                        disabled={occupiedByOther}
                                                                        onClick={() => {
                                                                            setChannelForm(p => ({
                                                                                ...p,
                                                                                sector_ids: isSelected
                                                                                    ? p.sector_ids.filter(id => id !== sec.id)
                                                                                    : [...p.sector_ids, sec.id]
                                                                            }));
                                                                        }}
                                                                        title={occupiedByOther ? `Já vinculado ao canal "${occupiedChannelName}"` : ''}
                                                                        className={clsx(
                                                                            "p-2.5 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between select-none",
                                                                            occupiedByOther
                                                                                ? "bg-white/[0.02] border-white/5 opacity-40 cursor-not-allowed text-slate-500"
                                                                                : isSelected
                                                                                    ? "bg-accent-theme/20 border-accent-theme text-foreground cursor-pointer shadow-sm shadow-accent-theme/10"
                                                                                    : "bg-white/5 border-white/5 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-foreground cursor-pointer"
                                                                        )}
                                                                    >
                                                                        <span className="truncate flex items-center gap-1.5">🏢 {sec.name}</span>
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            {occupiedByOther ? (
                                                                                <span className="text-[8px] text-amber-400 font-normal">Ocupado</span>
                                                                            ) : (
                                                                                <div className={clsx(
                                                                                    "w-4 h-4 rounded-md border flex items-center justify-center transition-all",
                                                                                    isSelected
                                                                                        ? "bg-accent-theme border-accent-theme text-white"
                                                                                        : "border-white/20 bg-white/5"
                                                                                )}>
                                                                                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Descrição Opcional */}
                                    <div>
                                        <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-2">
                                            Descrição / Observação
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ex: Canal principal de suporte ao cliente"
                                            value={channelForm.description || ''}
                                            onChange={e => setChannelForm(p => ({ ...p, description: e.target.value }))}
                                            className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-accent-theme/50 rounded-xl px-4 py-2.5 text-foreground text-xs placeholder-[var(--color-text-muted)]/50 focus:ring-2 focus:ring-accent-theme/20 outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="px-8 py-5 border-t border-white/10 flex items-center justify-end gap-3 bg-black/20">
                                    <button
                                        type="button"
                                        onClick={() => setIsChannelModalOpen(false)}
                                        className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-[var(--color-text-muted)] hover:text-foreground transition-all cursor-pointer"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={savingChannel || !channelForm.name || !channelForm.port}
                                        onClick={handleSaveChannel}
                                        className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg cursor-pointer"
                                        style={{
                                            backgroundColor: (!savingChannel && channelForm.name && channelForm.port)
                                                ? (channelForm.color || 'var(--color-accent)')
                                                : 'var(--color-accent)',
                                            boxShadow: (!savingChannel && channelForm.name && channelForm.port)
                                                ? `0 4px 20px ${channelForm.color || '#8b5cf6'}50`
                                                : 'none'
                                        }}
                                    >
                                        {savingChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        {editingChannel ? 'Salvar Alterações' : 'Criar Canal'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main >
        </div >
    );
}
