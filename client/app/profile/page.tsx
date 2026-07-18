'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useNotification } from '@/components/NotificationProvider';
import { 
    updateUser, uploadUserAvatar, removeUserAvatar 
} from '@/lib/api';
import { 
    User as UserIcon, Mail, Key, Upload, Trash2, Loader2, Save, Camera, Check,
    Building2, Lock, ShieldCheck, Sparkles, Briefcase, Layers
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function ProfilePage() {
    const { user, refreshUser } = useAuth();
    const { showNotification } = useNotification();

    // Estado do formulário de dados cadastrais
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [savingInfo, setSavingInfo] = useState(false);

    // Estado do formulário de segurança (senha)
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);

    // Estado do upload da imagem
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Carrega dados iniciais do usuário logado
    useEffect(() => {
        if (user) {
            setFullName(user.full_name || '');
            setEmail(user.email || '');
        }
    }, [user]);

    if (!user) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin text-accent-theme" />
                    <p className="text-sm font-medium">Carregando dados do usuário...</p>
                </div>
            </main>
        );
    }

    // Salvar Dados Pessoais
    const handleSaveInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fullName.trim() || !email.trim()) {
            showNotification('Preencha todos os campos obrigatórios.', 'error');
            return;
        }

        setSavingInfo(true);
        try {
            await updateUser(user.id, {
                full_name: fullName,
                email: email
            });
            await refreshUser();
            showNotification('Dados pessoais salvos com sucesso!', 'success');
        } catch (error: any) {
            console.error('Erro ao atualizar dados:', error);
            const msg = error.response?.data?.detail || 'Erro ao atualizar os dados do perfil.';
            showNotification(msg, 'error');
        } finally {
            setSavingInfo(false);
        }
    };

    // Salvar Nova Senha
    const handleSavePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            showNotification('Digite a nova senha.', 'error');
            return;
        }
        if (password.length < 6) {
            showNotification('A senha deve conter no mínimo 6 caracteres.', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showNotification('As senhas não coincidem.', 'error');
            return;
        }

        setSavingPassword(true);
        try {
            await updateUser(user.id, {
                password: password
            });
            setPassword('');
            setConfirmPassword('');
            showNotification('Senha alterada com sucesso!', 'success');
        } catch (error: any) {
            console.error('Erro ao alterar senha:', error);
            const msg = error.response?.data?.detail || 'Erro ao alterar a senha da conta.';
            showNotification(msg, 'error');
        } finally {
            setSavingPassword(false);
        }
    };

    // Upload de Avatar
    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingAvatar(true);
        try {
            await uploadUserAvatar(user.id, file);
            await refreshUser();
            showNotification('Foto de perfil atualizada com sucesso!', 'success');
        } catch (error: any) {
            console.error('Erro no upload do avatar:', error);
            const msg = error.response?.data?.detail || 'Erro ao carregar imagem de perfil.';
            showNotification(msg, 'error');
        } finally {
            setUploadingAvatar(false);
        }
    };

    // Remoção de Avatar
    const handleAvatarRemove = async () => {
        if (!confirm('Deseja realmente remover sua foto de perfil?')) return;

        setUploadingAvatar(true);
        try {
            await removeUserAvatar(user.id);
            await refreshUser();
            showNotification('Foto de perfil removida.', 'success');
        } catch (error: any) {
            console.error('Erro ao remover avatar:', error);
            const msg = error.response?.data?.detail || 'Erro ao remover imagem de perfil.';
            showNotification(msg, 'error');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const avatarFullUrl = user.avatar_url 
        ? `http://${hostname}:8080${user.avatar_url}`
        : null;

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="w-full space-y-12 animate-page-in">
                
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Configurações de <span className="text-accent-theme">Perfil</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">
                            Gerencie suas informações de perfil, foto e segurança da conta.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    
                    {/* Coluna Lateral: Avatar, Setores e Carteira */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* Card: Avatar e Status */}
                        <div className="glass-card p-8 rounded-3xl border border-border-theme flex flex-col items-center text-center space-y-6">
                            <div className="relative group">
                                <div className="w-32 h-32 rounded-full bg-accent-theme/10 border-2 border-accent-theme/35 flex items-center justify-center text-accent-theme text-4xl font-black uppercase overflow-hidden relative shadow-xl">
                                    {avatarFullUrl ? (
                                        <img 
                                            src={avatarFullUrl} 
                                            alt={user.full_name || user.username} 
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        user.username[0]
                                    )}

                                    {uploadingAvatar && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 className="w-8 h-8 animate-spin text-white" />
                                        </div>
                                    )}
                                </div>

                                <label className="absolute bottom-0 right-0 p-2.5 bg-accent-theme hover:bg-accent-theme/90 text-white rounded-full cursor-pointer shadow-lg active:scale-95 transition-transform">
                                    <Camera className="w-4 h-4" />
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/webp, image/gif" 
                                        className="hidden" 
                                        onChange={handleAvatarUpload}
                                        disabled={uploadingAvatar}
                                    />
                                </label>
                            </div>

                            <div className="space-y-2 w-full">
                                <h2 className="text-xl font-bold text-foreground truncate">
                                    {user.full_name || user.username}
                                </h2>
                                <div className="flex justify-center gap-2">
                                    <span className="px-3.5 py-1.5 rounded-xl bg-card border border-border-theme text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                                        Papel: {user.role}
                                    </span>
                                    <span className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                                        Ativo
                                    </span>
                                </div>
                            </div>

                            {avatarFullUrl && (
                                <button
                                    onClick={handleAvatarRemove}
                                    disabled={uploadingAvatar}
                                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-500 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Remover Foto
                                </button>
                            )}
                        </div>

                        {/* Card: Setores Vinculados */}
                        <div className="glass-card p-8 rounded-3xl border border-border-theme space-y-6">
                            <div className="flex items-center gap-3 border-b border-border-theme pb-4">
                                <div className="p-2.5 bg-accent-theme/10 rounded-2xl text-accent-theme">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-foreground">Setores Vinculados</h3>
                                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Setores aos quais você possui permissão de atendimento.</p>
                                </div>
                            </div>

                            <div className="space-y-3 text-left">
                                {user.sectors && user.sectors.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {user.sectors.map((sector) => (
                                            <div 
                                                key={sector.id} 
                                                className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border-theme hover:border-accent-theme/35 transition-all group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                                                        <ShieldCheck className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-bold text-foreground">{sector.name}</h4>
                                                        {sector.description && (
                                                            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{sector.description}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                                                    Ativo
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-card border border-border-theme text-center space-y-2">
                                        <Building2 className="w-8 h-8 text-[var(--color-text-muted)] opacity-50" />
                                        <p className="text-xs font-bold text-foreground">Nenhum setor vinculado</p>
                                        <p className="text-[10px] text-[var(--color-text-muted)]">Entre em contato com seu administrador para vincular um setor.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Card: Carteira de Clientes */}
                        <div className="glass-card p-8 rounded-3xl border border-border-theme space-y-6 relative overflow-hidden group">
                            {/* Badge Em breve com gradiente */}
                            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full premium-gradient text-white text-[9px] font-black uppercase tracking-wider shadow-lg shadow-accent-theme/10">
                                <Sparkles className="w-3 h-3 animate-pulse" />
                                Em Breve
                            </div>

                            <div className="flex items-center gap-3 border-b border-border-theme pb-4">
                                <div className="p-2.5 bg-violet-500/10 rounded-2xl text-violet-400">
                                    <Briefcase className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-foreground">Carteira de Clientes</h3>
                                    <p className="text-xs text-[var(--color-text-muted)] font-medium">Clientes sob sua responsabilidade direta de atendimento.</p>
                                </div>
                            </div>

                            {/* Estatísticas Mockadas */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 rounded-2xl bg-card border border-border-theme text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Clientes</p>
                                    <p className="text-lg font-black text-foreground mt-1">12</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-card border border-border-theme text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Ativos</p>
                                    <p className="text-lg font-black text-emerald-400 mt-1">3</p>
                                </div>
                                <div className="p-3 rounded-2xl bg-card border border-border-theme text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">SLA Médio</p>
                                    <p className="text-lg font-black text-violet-400 mt-1">98%</p>
                                </div>
                            </div>

                            {/* Lista Preview de Clientes com Blur */}
                            <div className="space-y-3 relative text-left">
                                <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-4 backdrop-blur-[1.5px] rounded-2xl border border-border-theme z-10">
                                    <Lock className="w-5 h-5 text-accent-theme mb-1.5 animate-bounce" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Acesso Reservado</p>
                                    <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">Módulo de carteira de clientes em desenvolvimento.</p>
                                </div>

                                {/* Mock Clientes de Fundo */}
                                <div className="space-y-2 opacity-20 select-none pointer-events-none">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border-theme">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px] font-black text-blue-400">
                                                AC
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-foreground">Acme Corporation</p>
                                                <p className="text-[9px] text-[var(--color-text-muted)]">Premium</p>
                                            </div>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-[8px] font-black uppercase tracking-wider text-emerald-400">Ativo</span>
                                    </div>
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border-theme">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px] font-black text-purple-400">
                                                GI
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-foreground">Globex Industries</p>
                                                <p className="text-[9px] text-[var(--color-text-muted)]">Enterprise</p>
                                            </div>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-[8px] font-black uppercase tracking-wider text-emerald-400">Ativo</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Principal: Formulários */}
                    <div className="lg:col-span-8 space-y-8">
                        
                        {/* Card: Dados Pessoais */}
                        <div className="glass-card p-8 rounded-3xl border border-border-theme space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Dados Cadastrais</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">Atualize suas credenciais de contato no sistema.</p>
                            </div>

                            <form onSubmit={handleSaveInfo} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Nome Completo</label>
                                        <div className="relative">
                                            <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                                            <input 
                                                type="text" 
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                className="w-full h-11 pl-11 pr-4 rounded-xl bg-card border border-border-theme text-xs placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-accent-theme/20 transition-all"
                                                placeholder="Digite seu nome completo"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">E-mail</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                                            <input 
                                                type="email" 
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full h-11 pl-11 pr-4 rounded-xl bg-card border border-border-theme text-xs placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-accent-theme/20 transition-all"
                                                placeholder="Digite seu e-mail"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={savingInfo}
                                    className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {savingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Salvar Alterações
                                </button>
                            </form>
                        </div>

                        {/* Card: Alterar Senha */}
                        <div className="glass-card p-8 rounded-3xl border border-border-theme space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Alterar Senha</h3>
                                <p className="text-xs text-[var(--color-text-muted)] font-medium">Garanta a segurança da sua conta definindo uma senha forte.</p>
                            </div>

                            <form onSubmit={handleSavePassword} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Nova Senha</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                                            <input 
                                                type="password" 
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="w-full h-11 pl-11 pr-4 rounded-xl bg-card border border-border-theme text-xs placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-accent-theme/20 transition-all"
                                                placeholder="Nova senha (min. 6 carac.)"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Confirmar Nova Senha</label>
                                        <div className="relative">
                                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                                            <input 
                                                type="password" 
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="w-full h-11 pl-11 pr-4 rounded-xl bg-card border border-border-theme text-xs placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-accent-theme/20 transition-all"
                                                placeholder="Confirme a nova senha"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={savingPassword}
                                    className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Atualizar Senha
                                </button>
                            </form>
                        </div>

                    </div>
                </div>

            </div>
        </main>
    );
}
