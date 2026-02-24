'use client';

import React, { useState, useEffect } from 'react';
import {
    Save, RotateCcw, Globe, Cpu, Palette, CheckCircle2, ChevronDown, Loader2, Ticket,
    Plus, Edit2, Trash2, Shield, User as UserIcon, Mail, ShieldCheck,
    Settings as SettingsIcon, Key, UserSquare2, Users, ArrowLeft, ArrowRight,
    Link2, Tag, PlusCircle, HardDrive, FolderPlus, Download, Upload, AlertTriangle,
    XCircle, Eye, EyeOff, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
        favicon_url: ''
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
        console.log('Toggling category:', id, 'Current expanded:', expandedCategories);
        setExpandedCategories(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
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
        localStorage.setItem('system_config', JSON.stringify(config));
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
                aiSource: 'centralized' as 'centralized' | 'local',
                textModel: 'phi3',
                visionModel: 'moondream',
                theme: 'dark' as any
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

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1440px] mx-auto p-8 pb-32 space-y-10 animate-page-in">
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
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Conectividade</h2>
                                    </div>

                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 border-l-2 border-accent-theme pl-2">Servidor Central (API)</label>
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
                                            <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-2">
                                                Processamento de IA (Ollama)
                                            </label>
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
                                            <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 border-l-2 border-accent-theme pl-2">Ollama Local (URL)</label>
                                            <input
                                                className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all font-mono text-sm shadow-inner"
                                                type="text"
                                                value={config.ollamaUrl}
                                                onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })}
                                            />
                                        </div>

                                        {/* Banco de Dados Ativo */}
                                        <div className="border-t border-border-theme pt-6 space-y-3">
                                            <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-2">
                                                Banco de Dados Ativo
                                            </label>
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
                                                                    ? 'Arquivo local. Ideal para instala\u00e7\u00f5es simples.'
                                                                    : dbInfo.type === 'postgresql'
                                                                        ? 'Banco de dados remoto (PostgreSQL).'
                                                                        : 'Conex\u00e3o personalizada.'}
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
                                                {' '}na pasta de instala\u00e7\u00e3o.
                                            </p>
                                        </div>
                                    </div>
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
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Motores de IA</h2>
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
                                                <Tag className="w-6 h-6" />
                                            </div>
                                            <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Gestão de Setores</h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-emerald-500 pl-3">
                                                        {editingSector ? 'Editar Setor' : 'Novo Setor'}
                                                    </h3>
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
                                                        className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
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
                                                        <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-emerald-500 pl-3">Setores Ativos</h3>
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
                                        <div className="flex items-center gap-3 text-accent-theme relative z-10">
                                            <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                                <Tag className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Organização de Categorias</h2>
                                                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-widest opacity-60">Categorização granular por setor.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-3">
                                                        {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
                                                    </h3>
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
                                                        <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-3">Categorias Ativas</h3>

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
                                                <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Fluxo e Status de Chamado</h2>
                                                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-widest opacity-60">Gerencie os estados dos chamados por setor.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                            {/* Formulário */}
                                            <div className="space-y-6">
                                                <div className="flex h-[42px] items-center justify-between">
                                                    <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-blue-500 pl-3">
                                                        {editingStatus ? 'Editar Estado' : 'Novo Estado'}
                                                    </h3>
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
                                                        <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-3 border-l-2 border-blue-500/50 pl-2">Representação Visual (Cor)</label>
                                                        <div className="flex items-center gap-4 bg-background/40 p-3 rounded-2xl border border-border-theme group/color">
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
                                                        <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-blue-500 pl-3">Lista de Estados Ativos</h3>
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
                                            <h2 className="text-2xl font-black italic uppercase tracking-tight">Gestão de Equipe</h2>
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
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Identidade do Sistema</h2>
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
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">
                                                    Logos do Sistema
                                                </h3>

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
                                                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1 mb-4 flex items-center gap-2">
                                                    <Globe className="w-3 h-3" /> Favicon do Sistema
                                                </h2>

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
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Identidade Visual</h2>
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
                                                <h3 className="font-bold text-sm uppercase tracking-widest text-foreground">Ajustar Cores Personalizadas</h3>
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
                                            <h2 className="text-2xl font-black italic uppercase tracking-tight">Perfis de Acesso</h2>
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
                                                <h3 className="font-bold text-lg mb-1 text-foreground">{profile.name}</h3>
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
                                            <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Backup & Restauração</h2>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {/* Download Backup */}
                                            <div className="flex flex-col h-full bg-white/5 p-8 rounded-3xl border border-border-theme/50 hover:border-blue-500/30 transition-all group/backup">
                                                <div className="space-y-4 flex-grow">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                                            <Download className="w-5 h-5 text-blue-500" />
                                                        </div>
                                                        <h3 className="text-base font-bold text-foreground">Exportar Dados</h3>
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
                                                        <h3 className="text-base font-bold text-foreground">Restaurar Sistema</h3>
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
                                            <h2 className="font-bold text-lg uppercase tracking-widest">Ações do Sistema</h2>
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
                                            <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Zona de Perigo: Limpeza</h2>
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
                                    <h2 className="text-3xl font-black italic uppercase tracking-tight text-red-500">Confirmação Crítica</h2>
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
                                    <h2 className="text-3xl font-black italic uppercase tracking-tight">
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
                                    <h2 className="text-3xl font-black italic uppercase tracking-tight">
                                        {currentProfile.id ? 'Editar' : 'Novo'} <span className="text-orange-500">Perfil</span>
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
                                                <h3 className="text-xs font-black uppercase text-accent-theme border-b border-white/10 pb-2">Acesso a Menus</h3>
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
                                                <h3 className="text-xs font-black uppercase text-accent-theme border-b border-white/10 pb-2">Permissões de Ação</h3>
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
            </main >
        </div >
    );
}
