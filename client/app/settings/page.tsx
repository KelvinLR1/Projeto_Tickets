'use client';

import React, { useState, useEffect } from 'react';
import {
    Save, RotateCcw, Globe, Cpu, Palette, CheckCircle2, ChevronDown, Loader2,
    Plus, Edit2, Trash2, Shield, User as UserIcon, Mail, ShieldCheck,
    Settings as SettingsIcon, Key, UserSquare2, Users, ArrowLeft, ArrowRight,
    Link2, Tag, PlusCircle, HardDrive, FolderPlus, Download, Upload, AlertTriangle
} from 'lucide-react';
import { getOllamaModels } from '@/lib/ollama';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/components/AuthProvider';
import {
    getCategories, createCategory, deleteCategory, Category,
    getStatuses, createStatus, deleteStatus, Status,
    getUsers, createUser, updateUser, deleteUser, User,
    resetDatabase, downloadBackup, restoreSystem,
    getProfiles, createProfile, updateProfile, deleteProfile, Profile
} from '@/lib/api';
import { useNotification } from '@/components/NotificationProvider';
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
    { id: 'delete_ticket', label: 'Excluir Chamados (Cuidado)' },
    { id: 'manage_users', label: 'Gerenciar Usuários' },
    { id: 'manage_profiles', label: 'Gerenciar Perfis' },
    { id: 'view_financial', label: 'Ver Dados Financeiros' },
];

export default function SettingsPage() {
    const { setTheme } = useTheme();
    const { user } = useAuth();
    const { showNotification, confirm: askConfirm } = useNotification();

    // Estado Navegação
    const [activeTab, setActiveTab] = useState('general');

    // Estado Configurações
    const [config, setConfig] = useState({
        apiUrl: 'http://127.0.0.1:8000',
        ollamaUrl: 'http://localhost:11434',
        textModel: 'phi3',
        visionModel: 'moondream',
        theme: 'dark' as any
    });
    const [textModels, setTextModels] = useState<any[]>([]);
    const [visionModels, setVisionModels] = useState<any[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [saved, setSaved] = useState(false);

    // Estado Categorias
    const [categories, setCategories] = useState<Category[]>([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [parentCategory, setParentCategory] = useState<string>('');
    const [loadingCats, setLoadingCats] = useState(false);

    // Estado Status
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [newStatusName, setNewStatusName] = useState('');
    const [newStatusColor, setNewStatusColor] = useState('#3b82f6');
    const [loadingStatuses, setLoadingStatuses] = useState(false);

    // Estado da Limpeza de Dados (Danger Zone)
    const [resetEntities, setResetEntities] = useState<string[]>([]);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetConfirmation, setResetConfirmation] = useState('');
    const [loadingReset, setLoadingReset] = useState(false);
    const [loadingRestore, setLoadingRestore] = useState(false);

    // Estado Gestão de Usuários
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState<Partial<User & { password?: string }>>({});
    const [isEditingUser, setIsEditingUser] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<number[]>([]);

    // Estado Gestão de Perfis
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [currentProfile, setCurrentProfile] = useState<Partial<Profile>>({ permissions: { menus: [], actions: [] } });

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
        if (user) {
            fetchUsers();
        }
    }, [user]);

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
            if (isEditingUser && currentUser.id) {
                await updateUser(currentUser.id, currentUser);
                showNotification('Usuário atualizado!', 'success');
            } else {
                await createUser(currentUser as User);
                showNotification('Usuário criado!', 'success');
            }
            setIsUserModalOpen(false);
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
            console.error('Failed to fetch profiles:', error);
        } finally {
            setLoadingProfiles(false);
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
        if (activeTab === 'profiles') {
            fetchProfiles();
        }
    }, [activeTab]);

    const fetchStatuses = async () => {
        setLoadingStatuses(true);
        try {
            const data = await getStatuses();
            setStatuses(data);
        } catch (error) {
            console.error('Failed to statuses:', error);
        } finally {
            setLoadingStatuses(false);
        }
    };

    const fetchCategories = async () => {
        setLoadingCats(true);
        try {
            const data = await getCategories();
            setCategories(data);
        } catch (error) {
            console.error('Failed to categories:', error);
        } finally {
            setLoadingCats(false);
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await createCategory({
                name: newCategoryName,
                parent_id: parentCategory ? parseInt(parentCategory) : undefined
            });
            setNewCategoryName('');
            setParentCategory('');
            fetchCategories();
            showNotification('Categoria criada!', 'success');
        } catch (error) {
            showNotification('Erro ao criar categoria', 'error');
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
            try {
                await deleteCategory(id);
                fetchCategories();
                showNotification('Categoria removida', 'success');
            } catch (error) {
                showNotification('Erro ao excluir categoria', 'error');
            }
        }
    };

    const handleCreateStatus = async () => {
        if (!newStatusName.trim()) return;
        try {
            await createStatus({
                name: newStatusName,
                color: newStatusColor
            });
            setNewStatusName('');
            fetchStatuses();
            showNotification('Status criado!', 'success');
        } catch (error) {
            showNotification('Erro ao criar status', 'error');
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
            try {
                await deleteStatus(id);
                fetchStatuses();
                showNotification('Status removido', 'success');
            } catch (error) {
                showNotification('Erro ao excluir status', 'error');
            }
        }
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
        showNotification('Configurações salvas com sucesso!', 'success');
        setTheme(config.theme);
        window.dispatchEvent(new Event('storage'));
        setTimeout(() => setSaved(false), 3000);
    };

    const handleReset = async () => {
        const confirmed = await askConfirm({
            title: 'Restaurar Padrões',
            message: 'Deseja restaurar as configurações padrão? Esta ação não pode ser desfeita.',
            type: 'info'
        });

        if (confirmed) {
            const defaults = {
                apiUrl: 'http://127.0.0.1:8000',
                ollamaUrl: 'http://localhost:11434',
                textModel: 'phi3',
                visionModel: 'moondream',
                theme: 'dark' as any
            };
            setConfig(defaults);
            setTheme('dark');
            localStorage.setItem('system_config', JSON.stringify(defaults));
            window.dispatchEvent(new Event('storage'));
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
        <main className="min-h-screen bg-background text-foreground p-4 md:p-8 transition-colors animate-fade-in">
            <div className="max-w-7xl mx-auto space-y-10">
                {/* Header Integrado */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border-theme pb-8">
                    <div className="space-y-2">
                        <h1 className="text-4xl font-black font-display tracking-tight text-foreground uppercase italic px-1">
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
                                    "w-full flex items-center gap-4 px-6 py-4 rounded-3xl transition-all duration-300 group relative overflow-hidden active:scale-95",
                                    activeTab === tab.id
                                        ? "bg-accent-theme text-white shadow-xl shadow-accent-theme/20"
                                        : "glass-card hover:bg-white/5 text-[var(--color-text-muted)] hover:text-foreground"
                                )}
                            >
                                <tab.icon className={clsx("w-5 h-5", activeTab === tab.id ? "text-white" : tab.color)} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{tab.label}</span>
                                {activeTab === tab.id && (
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/30 rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Área de Conteúdo Dinâmico */}
                    <div className="flex-1 w-full space-y-10">
                        {/* Aba: Conectividade */}
                        {activeTab === 'general' && (
                            <div className="glass-card p-8 rounded-3xl space-y-8 relative group transition-all z-10 animate-slide-in-right">
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
                                        <p className="text-[10px] text-[var(--color-text-muted)] mt-2 font-mono italic">Backend FastAPI na rede local.</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 border-l-2 border-accent-theme pl-2">Ollama Local (URL)</label>
                                        <input
                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all font-mono text-sm shadow-inner"
                                            type="text"
                                            value={config.ollamaUrl}
                                            onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Aba: Motores IA */}
                        {activeTab === 'ai' && (
                            <div className="glass-card p-8 rounded-3xl space-y-8 relative group transition-all z-10 animate-slide-in-right">
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
                            </div>
                        )}

                        {/* Aba: Organização */}
                        {activeTab === 'org' && (
                            <div className="space-y-10 animate-slide-in-right">
                                {/* Gestão de Status */}
                                <div className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden group transition-all">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <CheckCircle2 className="w-24 h-24" />
                                    </div>
                                    <div className="flex items-center gap-3 text-blue-500">
                                        <div className="p-2.5 bg-blue-500/10 rounded-xl">
                                            <CheckCircle2 className="w-6 h-6" />
                                        </div>
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Fluxo e Status de Chamado</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        {/* Formulário */}
                                        <div className="space-y-6">
                                            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-blue-500 pl-3">Novo Estado</h3>
                                            <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
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
                                                    <label className="block text-[9px] font-black text-[var(--color-text-muted)] uppercase mb-2">Representação Visual (Cor)</label>
                                                    <div className="flex items-center gap-4">
                                                        <input
                                                            type="color"
                                                            className="w-12 h-12 rounded-lg bg-transparent cursor-pointer border-none p-0 overflow-hidden"
                                                            value={newStatusColor}
                                                            onChange={e => setNewStatusColor(e.target.value)}
                                                        />
                                                        <input
                                                            className="flex-1 bg-[var(--color-input)] border border-border-theme rounded-xl p-3 text-xs font-mono outline-none"
                                                            value={newStatusColor}
                                                            onChange={e => setNewStatusColor(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleCreateStatus}
                                                    className="w-full flex items-center justify-center gap-2 premium-gradient hover:brightness-110 text-white p-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                                                >
                                                    <PlusCircle className="w-4 h-4" />
                                                    Adicionar ao Fluxo
                                                </button>
                                            </div>
                                        </div>

                                        {/* Listagem */}
                                        <div className="space-y-6">
                                            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-blue-500 pl-3">Lista de Estados Ativos</h3>
                                            <div className="bg-background/10 rounded-3xl border border-border-theme max-h-[350px] overflow-y-auto p-3 space-y-2 custom-scrollbar shadow-inner">
                                                {loadingStatuses ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div> :
                                                    statuses.length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhum status customizado.</div> :
                                                        statuses.map(st => (
                                                            <div key={st.id} className="flex items-center justify-between p-4 bg-card/40 rounded-2xl border border-border-theme group/item hover:bg-card/60 transition-all shadow-sm">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-4 h-4 rounded-full border border-white/10 shadow-sm" style={{ backgroundColor: st.color }} />
                                                                    <span className="text-sm font-bold tracking-tight">{st.name}</span>
                                                                </div>
                                                                <button onClick={() => handleDeleteStatus(st.id)} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl opacity-0 group-hover/item:opacity-100 transition-all">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
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
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Organização de Categorias</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        {/* Formulário */}
                                        <div className="space-y-6">
                                            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-3">Nova Categoria</h3>
                                            <div className="space-y-5 bg-background/20 p-6 rounded-3xl border border-border-theme shadow-inner">
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
                                                    <PlusCircle className="w-4 h-4" />
                                                    Criar Categoria
                                                </button>
                                            </div>
                                        </div>

                                        {/* Listagem */}
                                        <div className="space-y-6">
                                            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest border-l-2 border-accent-theme pl-3">Categorias Ativas</h3>
                                            <div className="bg-background/10 rounded-3xl border border-border-theme max-h-[350px] overflow-y-auto p-3 space-y-2 custom-scrollbar shadow-inner">
                                                {loadingCats ? <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-accent-theme" /></div> :
                                                    categories.length === 0 ? <div className="p-8 text-center text-xs text-[var(--color-text-muted)] italic">Nenhuma categoria cadastrada.</div> :
                                                        categories.filter(c => !c.parent_id).map(cat => {
                                                            const isExpanded = expandedCategories.includes(cat.id);
                                                            const subcats = cat.subcategories || [];
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
                                                                            <Tag className="w-4 h-4 text-accent-theme" />
                                                                            <span className="text-sm font-bold tracking-tight">{cat.name}</span>
                                                                            {hasSubcats && (
                                                                                <>
                                                                                    <span className="px-2 py-0.5 bg-accent-theme/10 text-accent-theme rounded-full text-[9px] font-black">
                                                                                        {subcats.length} sub
                                                                                    </span>
                                                                                    <ChevronDown className={clsx(
                                                                                        "w-3 h-3 text-[var(--color-text-muted)] transition-transform duration-300",
                                                                                        isExpanded && "rotate-180"
                                                                                    )} />
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl opacity-0 group-hover/item:opacity-100 transition-all">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                    {/* Subcategorias com Animação */}
                                                                    {isExpanded && subcats.map((sub, index) => (
                                                                        <div
                                                                            key={sub.id}
                                                                            className="flex items-center justify-between p-3 ml-8 bg-card/20 rounded-xl border border-dashed border-border-theme group/sub hover:bg-card/40 transition-all animate-slide-in-top"
                                                                            style={{
                                                                                animationDelay: `${index * 75}ms`,
                                                                                animationFillMode: 'both'
                                                                            }}
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="w-2 h-2 rounded-full bg-accent-theme/40" />
                                                                                <span className="text-xs text-foreground/80">{sub.name}</span>
                                                                            </div>
                                                                            <button onClick={() => handleDeleteCategory(sub.id)} className="p-1.5 text-gray-500 hover:text-red-500 opacity-0 group-hover/sub:opacity-100 transition-all">
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Aba: Usuários */}
                        {activeTab === 'users' && (user?.role === 'ADMIN' || user?.role === 'ROOT') && (
                            <div className="space-y-8 animate-slide-in-right">
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

                                <div className="glass-card rounded-[2.5rem] border border-border-theme overflow-visible relative group">
                                    <div className="overflow-x-auto custom-scrollbar">
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
                                                    <tr key={u.id} className="group/row hover:bg-white/5 transition-all duration-300">
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-theme/20 to-primary-theme/10 border border-accent-theme/20 flex items-center justify-center text-accent-theme font-black shadow-inner group-hover/row:scale-105 transition-transform">
                                                                    {u.username[0].toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-sm text-foreground">{u.full_name || u.username}</div>
                                                                    <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] opacity-60">{u.email}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <div className={clsx(
                                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                                                                u.role === 'ROOT' ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                                                                    u.role === 'ADMIN' ? "bg-accent-theme/10 border-accent-theme/20 text-accent-theme" :
                                                                        "bg-white/5 border-white/10 text-[var(--color-text-muted)]"
                                                            )}>
                                                                <Shield className="w-2.5 h-2.5" />
                                                                {u.role}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <div className={clsx(
                                                                "flex items-center gap-2 text-[9px] font-black uppercase tracking-widest",
                                                                u.is_active ? "text-emerald-500" : "text-red-500"
                                                            )}>
                                                                <div className={clsx("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-emerald-500" : "bg-red-500")} />
                                                                {u.is_active ? 'Ativo' : 'Bloqueado'}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
                                                            <div className="flex justify-end gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
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
                            </div>
                        )}

                        {/* Aba: Aparência */}
                        {activeTab === 'appearance' && (
                            <div className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden transition-all animate-slide-in-right">
                                <div className="flex items-center gap-3 text-pink-500">
                                    <div className="p-2.5 bg-pink-500/10 rounded-xl">
                                        <Palette className="w-6 h-6" />
                                    </div>
                                    <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Identidade Visual</h2>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                    {[
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
                                    ].map((theme) => (
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
                                                <div className="flex gap-2">
                                                    <div className={`w-8 h-8 rounded-xl ${theme.bg} border border-border-theme shadow-md`} />
                                                    <div className={`w-8 h-8 rounded-xl ${theme.accent} shadow-md`} />
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
                            </div>
                        )}

                        {/* Aba: Perfis de Acesso */}
                        {activeTab === 'profiles' && (user?.role === 'ADMIN' || user?.role === 'ROOT') && (
                            <div className="space-y-8 animate-slide-in-right">
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
                            </div>
                        )}

                        {/* Aba: Avançado */}
                        {activeTab === 'advanced' && user?.role === 'ROOT' && (
                            <div className="space-y-10 animate-slide-in-right">
                                <div className="glass-card p-10 rounded-3xl space-y-8 relative overflow-hidden border border-red-500/20 bg-red-500/[0.02] group transition-all">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Trash2 className="w-24 h-24 text-red-500" />
                                    </div>
                                    <div className="flex items-center gap-3 text-red-500">
                                        <div className="p-2.5 bg-red-500/10 rounded-xl">
                                            <Trash2 className="w-6 h-6" />
                                        </div>
                                        <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Zona de Perigo: Limpeza</h2>
                                    </div>

                                    <p className="text-xs text-[var(--color-text-muted)] max-w-2xl leading-relaxed">
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
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-foreground">Exportar Dados</h3>
                                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                                Baixe um arquivo ZIP contendo todo o banco de dados, uploads e memória da IA.
                                                Ideal para migração ou segurança.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    try {
                                                        downloadBackup();
                                                        showNotification('Backup iniciado!', 'success');
                                                    } catch (error) {
                                                        showNotification('Erro ao baixar backup', 'error');
                                                    }
                                                }}
                                                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 font-black text-[10px] uppercase transition-all"
                                            >
                                                <Download className="w-4 h-4" />
                                                Fazer Backup Completo
                                            </button>
                                        </div>

                                        {/* Upload Restore */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-foreground">Restaurar Sistema</h3>
                                            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                                                Carregue um arquivo de backup (.zip) para restaurar o sistema.
                                                <span className="block mt-1 text-red-400 font-bold">ATENÇÃO: Substitui todos os dados atuais!</span>
                                            </p>
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
                                                            try {
                                                                await restoreSystem(file);
                                                                showNotification('Sistema restaurado com sucesso!', 'success');
                                                                setTimeout(() => window.location.reload(), 2000);
                                                            } catch (error) {
                                                                showNotification('Falha na restauração.', 'error');
                                                            } finally {
                                                                setLoadingRestore(false);
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
                                                    className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border-2 border-dashed border-border-theme hover:border-blue-500/50 hover:bg-blue-500/5 text-[var(--color-text-muted)] hover:text-blue-500 font-black text-[10px] uppercase transition-all"
                                                >
                                                    {loadingRestore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                    {loadingRestore ? 'Restaurando...' : 'Carregar Backup (.zip)'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Botão Salvar (Visível em abas de config global) */}
                        {['general', 'ai', 'org', 'appearance'].includes(activeTab) && (
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
            </div>

            {/* Modais Consolidados */}
            {isResetModalOpen && (
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
                                            await resetDatabase(resetEntities, resetConfirmation);
                                            showNotification('Dados limpos!', 'success');
                                            setIsResetModalOpen(false);
                                            setResetConfirmation('');
                                            setResetEntities([]);
                                            fetchCategories();
                                            fetchStatuses();
                                        } catch (err) { showNotification('Erro ao limpar', 'error'); }
                                        finally { setLoadingReset(false); }
                                    }}
                                    className="px-6 py-4 rounded-2xl bg-red-500 text-white font-black text-[10px] uppercase disabled:opacity-50"
                                >
                                    {loadingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isUserModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 animate-fade-in">
                    <div className="glass-card w-full max-w-lg rounded-[2.5rem] border border-border-theme shadow-3xl animate-zoom-in">
                        <div className="p-10 border-b border-border-theme/50">
                            <h2 className="text-3xl font-black italic uppercase tracking-tight">
                                {isEditingUser ? 'Editar' : 'Novo'} <span className="text-accent-theme">Usuário</span>
                            </h2>
                        </div>
                        <form onSubmit={handleSaveUser} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Nome Completo</label>
                                    <input type="text" required value={currentUser.full_name || ''} onChange={e => setCurrentUser({ ...currentUser, full_name: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Username</label>
                                    <input type="text" required disabled={isEditingUser} value={currentUser.username || ''} onChange={e => setCurrentUser({ ...currentUser, username: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none disabled:opacity-50" />
                                </div>
                                <div className="space-y-2">
                                    <CustomSelect
                                        label="Nível"
                                        value={currentUser.role || 'AGENT'}
                                        onChange={val => setCurrentUser({ ...currentUser, role: val })}
                                        icon={<Shield className="w-3 h-3" />}
                                        options={[
                                            { value: 'AGENT', label: 'Agente', icon: <UserIcon className="w-4 h-4" /> },
                                            { value: 'ADMIN', label: 'Admin', icon: <ShieldCheck className="w-4 h-4 text-accent-theme" /> },
                                            ...(user?.role === 'ROOT' ? [{ value: 'ROOT', label: 'Root', icon: <SettingsIcon className="w-4 h-4 text-purple-500" /> }] : [])
                                        ]}
                                    />
                                    <div className="pt-4">
                                        <CustomSelect
                                            label="Perfil de Acesso (RBAC)"
                                            value={currentUser.profile_id || ''}
                                            onChange={val => setCurrentUser({ ...currentUser, profile_id: Number(val) || undefined })}
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
                                        <p className="text-[9px] text-[var(--color-text-muted)] mt-1 ml-1">* Perfis sobrescrevem permissões padrão da role.</p>
                                    </div>
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">Email</label>
                                    <input type="email" required value={currentUser.email || ''} onChange={e => setCurrentUser({ ...currentUser, email: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none" />
                                </div>
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[10px] font-black uppercase text-[var(--color-text-muted)]">{isEditingUser ? 'Nova Senha (Opcional)' : 'Senha'}</label>
                                    <input type="password" required={!isEditingUser} value={currentUser.password || ''} onChange={e => setCurrentUser({ ...currentUser, password: e.target.value })} className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm outline-none" />
                                </div>
                                <div className="col-span-2 flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                                    <span className="text-[10px] font-black uppercase">Ativo</span>
                                    <button type="button" onClick={() => setCurrentUser({ ...currentUser, is_active: !currentUser.is_active })} className={clsx("w-10 h-5 rounded-full relative transition-all", currentUser.is_active ? "bg-accent-theme" : "bg-white/10")}>
                                        <div className={clsx("w-3 h-3 bg-white rounded-full absolute top-1 transition-all", currentUser.is_active ? "left-6" : "left-1")} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex justify-end gap-4 pt-4">
                                <button type="button" onClick={() => setIsUserModalOpen(false)} className="text-[10px] font-black uppercase">Cancelar</button>
                                <button type="submit" className="px-10 py-4 premium-gradient text-white rounded-2xl font-black text-[10px] uppercase shadow-xl">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Perfis */}
            {isProfileModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 animate-fade-in">
                    <div className="glass-card w-full max-w-2xl rounded-[2.5rem] border border-border-theme shadow-3xl animate-zoom-in max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="p-10 border-b border-border-theme/50 sticky top-0 bg-background/50 backdrop-blur-md z-10">
                            <h2 className="text-3xl font-black italic uppercase tracking-tight">
                                {currentProfile.id ? 'Editar' : 'Novo'} <span className="text-orange-500">Perfil</span>
                            </h2>
                        </div>
                        <form onSubmit={handleSaveProfile} className="p-10 space-y-8">
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
                                        <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-all">
                                            <input
                                                type="checkbox"
                                                checked={currentProfile.permissions?.menus?.includes('*') || false}
                                                onChange={() => toggleProfilePermission('menus', '*')}
                                                className="w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-gray-700"
                                            />
                                            <span className="text-xs font-bold text-orange-400">Acesso Total (Admin)</span>
                                        </label>
                                        {!currentProfile.permissions?.menus?.includes('*') && AVAILABLE_MENUS.map(menu => (
                                            <label key={menu.id} className="flex items-center gap-3 p-3 rounded-xl border border-border-theme/50 cursor-pointer hover:border-orange-500/30 transition-all">
                                                <input
                                                    type="checkbox"
                                                    checked={currentProfile.permissions?.menus?.includes(menu.id) || false}
                                                    onChange={() => toggleProfilePermission('menus', menu.id)}
                                                    className="w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-gray-700"
                                                />
                                                <span className="text-xs font-medium">{menu.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Permissões de Ação */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black uppercase text-accent-theme border-b border-white/10 pb-2">Permissões de Ação</h3>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-all">
                                            <input
                                                type="checkbox"
                                                checked={currentProfile.permissions?.actions?.includes('*') || false}
                                                onChange={() => toggleProfilePermission('actions', '*')}
                                                className="w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-gray-700"
                                            />
                                            <span className="text-xs font-bold text-orange-400">Superusuário</span>
                                        </label>
                                        {!currentProfile.permissions?.actions?.includes('*') && AVAILABLE_ACTIONS.map(action => (
                                            <label key={action.id} className="flex items-center gap-3 p-3 rounded-xl border border-border-theme/50 cursor-pointer hover:border-orange-500/30 transition-all">
                                                <input
                                                    type="checkbox"
                                                    checked={currentProfile.permissions?.actions?.includes(action.id) || false}
                                                    onChange={() => toggleProfilePermission('actions', action.id)}
                                                    className="w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 bg-gray-700"
                                                />
                                                <span className="text-xs font-medium">{action.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-4 pt-6 border-t border-border-theme/50">
                                <button type="button" onClick={() => setIsProfileModalOpen(false)} className="px-6 py-3 rounded-xl text-xs font-black uppercase hover:bg-white/5 transition-colors">Cancelar</button>
                                <button type="submit" className="px-10 py-4 premium-gradient text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:shadow-orange-500/20 transition-all transform active:scale-95">
                                    {loadingProfiles ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Perfil'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>

    );
}
