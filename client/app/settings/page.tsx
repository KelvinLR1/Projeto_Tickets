'use client';

import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Globe, Cpu, Palette, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { getOllamaModels } from '@/lib/ollama';
import { useTheme } from '@/components/ThemeProvider';
import { getCategories, createCategory, deleteCategory, Category, getStatuses, createStatus, deleteStatus, Status } from '@/lib/api';
import { FolderPlus, Tag, Trash2, PlusCircle } from 'lucide-react';
import { useNotification } from '@/components/NotificationProvider';
import clsx from 'clsx';

const MODEL_TIPS: Record<string, { label: string, color: string, speed: string, quality: string }> = {
    'phi3': { label: 'Ultra-Leve', color: 'text-green-400', speed: '⚡⚡⚡', quality: 'Normal' },
    'llama3': { label: 'Inteligente', color: 'text-blue-400', speed: '⚡⚡', quality: 'Alta' },
    'mistral': { label: 'Equilibrado', color: 'text-cyan-400', speed: '⚡⚡', quality: 'Sólida' },
    'moondream': { label: 'Visão Light', color: 'text-orange-400', speed: '⚡⚡⚡', quality: 'Específica' },
    'gemma': { label: 'Eficiente', color: 'text-yellow-400', speed: '⚡⚡', quality: 'Boa' },
    'llava': { label: 'Visão Full', color: 'text-red-400', speed: '⚡', quality: 'Máxima' },
};

export default function SettingsPage() {
    const { setTheme } = useTheme();
    const { showNotification, confirm: askConfirm } = useNotification();
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

    useEffect(() => {
        const localConfig = localStorage.getItem('system_config');
        if (localConfig) {
            setConfig(prev => ({ ...prev, ...JSON.parse(localConfig) }));
        }
        loadModels();
        fetchCategories();
        fetchStatuses();
    }, []);

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

        // Separa modelos por capacidade
        const vision = allModels.filter((m: any) => {
            const families = m.details?.families || [];
            const name = m.name.toLowerCase();
            return families.includes('clip') || families.includes('vision') || name.includes('llava') || name.includes('moondream');
        });

        const text = allModels.filter((m: any) => {
            const families = m.details?.families || [];
            // Basicamente todos podem fazer texto, mas evitamos mostrar os que são EXCLUSIVAMENTE de visão no seletor de texto se houver outros
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
        setTheme(config.theme); // Aplica no provedor global
        // Notifica outras abas/componentes que a config mudou
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
        setTheme(newTheme); // Preview instantâneo
    };

    const getModelTip = (modelName: string) => {
        const baseName = modelName.split(':')[0].toLowerCase();
        return MODEL_TIPS[baseName] || { label: 'Desconhecido', color: 'text-gray-500', speed: '?', quality: '?' };
    };

    return (
        <main className="min-h-screen bg-background text-foreground p-8 transition-colors">
            <div className="max-w-4xl mx-auto space-y-12">
                <div className="border-b border-border-theme pb-8 transition-colors">
                    <h1 className="text-4xl font-black font-display tracking-tight text-foreground">Ajustes do Sistema</h1>
                    <p className="text-[var(--color-text-muted)] italic">Gerencie conectividade, inteligência artificial e identidade visual</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    {/* Conectividade */}
                    <div className="glass-card p-8 rounded-3xl space-y-8 relative overflow-hidden group transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Globe className="w-20 h-20" />
                        </div>
                        <div className="flex items-center gap-3 text-accent-theme">
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

                    {/* Motores de IA */}
                    <div className="glass-card p-8 rounded-3xl space-y-8 relative overflow-hidden group transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Cpu className="w-20 h-20" />
                        </div>
                        <div className="flex items-center gap-3 text-accent-theme">
                            <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <h2 className="font-bold text-lg uppercase tracking-widest text-foreground">Motores de IA</h2>
                        </div>

                        <div className="space-y-6">
                            {/* Modelo de Texto */}
                            <div className="relative">
                                <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 flex justify-between items-center border-l-2 border-accent-theme pl-2">
                                    <span>Modelo de Texto</span>
                                    {loadingModels && <Loader2 className="w-3 h-3 animate-spin text-accent-theme" />}
                                </label>
                                {textModels.length > 0 ? (
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all pr-12 font-mono text-sm cursor-pointer shadow-inner"
                                            value={config.textModel}
                                            onChange={(e) => setConfig({ ...config, textModel: e.target.value })}
                                        >
                                            {textModels.map(m => (
                                                <option key={m.name} value={m.name} className="bg-background text-foreground">{m.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                                    </div>
                                ) : (
                                    <input
                                        className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-accent-theme/30 outline-none font-mono text-sm shadow-inner"
                                        type="text"
                                        placeholder="Ex: phi3"
                                        value={config.textModel}
                                        onChange={(e) => setConfig({ ...config, textModel: e.target.value })}
                                    />
                                )}
                                {/* Tip Texto */}
                                {config.textModel && (
                                    <div className="mt-3 flex items-center justify-between px-1">
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-accent-theme/10 ${getModelTip(config.textModel).color}`}>
                                            {getModelTip(config.textModel).label}
                                        </span>
                                        <span className="text-[9px] text-[var(--color-text-muted)] font-mono font-bold">
                                            V: {getModelTip(config.textModel).speed} | Q: {getModelTip(config.textModel).quality}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Modelo de Visão */}
                            <div className="relative">
                                <label className="block text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-2 border-l-2 border-accent-theme pl-2">Visão (Multimodal)</label>
                                {visionModels.length > 0 ? (
                                    <div className="relative">
                                        <select
                                            className="w-full appearance-none bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground focus:ring-2 focus:ring-accent-theme/30 outline-none transition-all pr-12 font-mono text-sm cursor-pointer shadow-inner"
                                            value={config.visionModel}
                                            onChange={(e) => setConfig({ ...config, visionModel: e.target.value })}
                                        >
                                            {visionModels.map(m => (
                                                <option key={m.name} value={m.name} className="bg-background text-foreground">{m.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <input
                                            className="w-full bg-[var(--color-input)] border border-border-theme rounded-2xl p-4 text-foreground placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-accent-theme/30 outline-none font-mono text-sm opacity-60 shadow-inner"
                                            type="text"
                                            placeholder="Nenhum modelo detectado"
                                            value={config.visionModel}
                                            onChange={(e) => setConfig({ ...config, visionModel: e.target.value })}
                                        />
                                        <p className="text-[10px] text-orange-500 font-mono font-bold">⚠️ Nenhum modelo CLIP detectado.</p>
                                    </div>
                                )}
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

                {/* Personalização Visual */}
                <div className="glass-card p-10 rounded-3xl space-y-10 relative overflow-hidden transition-all">
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
                                    <div className="absolute top-4 right-4 animate-in zoom-in duration-300">
                                        <div className="bg-accent-theme text-white rounded-full p-1 shadow-lg shadow-accent-theme/30">
                                            <CheckCircle2 className="w-3 h-3" />
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Ações de Rodapé */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-12 border-t border-border-theme">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-10 py-5 rounded-2xl border border-border-theme text-[var(--color-text-muted)] hover:bg-card hover:text-foreground transition-all font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 shadow-sm"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Restaurar Padrões
                    </button>

                    <button
                        onClick={handleSave}
                        className="w-full sm:w-auto flex items-center justify-center gap-3 px-12 py-5 rounded-2xl premium-gradient hover:brightness-110 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-2xl shadow-accent-theme/30 active:scale-95 group"
                    >
                        {saved ? <CheckCircle2 className="w-5 h-5 animate-in zoom-in" /> : <Save className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
                        {saved ? 'CONFIGURAÇÕES APLICADAS' : 'SALVAR E ATUALIZAR'}
                    </button>
                </div>
            </div>
        </main >
    );
}
