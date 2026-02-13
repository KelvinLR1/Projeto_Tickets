'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useSystemSettings } from '@/components/SystemSettingsProvider';
import { Lock, User as UserIcon, Loader2, Ticket, Sparkles, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const { login } = useAuth();
    const { systemName, logoUrlOnAccent } = useSystemSettings();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);

        try {
            await login(username, password);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Credenciais inválidas. Tente novamente.');
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
            {/* Elementos Decorativos de Fundo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-theme/10 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-theme/10 blur-[120px] rounded-full animate-pulse delay-700" />

            <div className="w-full max-w-md p-4 relative z-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 space-y-10 border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">

                    {/* Header com Branding */}
                    <div className="text-center space-y-6">
                        <div className="inline-flex relative">
                            <div className="absolute -inset-4 bg-accent-theme/20 blur-2xl rounded-full opacity-50 animate-pulse" />
                            <div className="relative w-20 h-20 rounded-[2rem] premium-gradient flex items-center justify-center shadow-2xl shadow-accent-theme/30 group overflow-hidden">
                                {logoUrlOnAccent ? (
                                    <img src={logoUrlOnAccent} alt="Logo" className="w-full h-full object-contain p-4" />
                                ) : (
                                    <Ticket className="w-10 h-10 text-white group-hover:rotate-12 transition-transform duration-500" />
                                )}
                                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-accent-theme animate-bounce" />
                            </div>
                        </div>

                        <div>
                            <h2 className="text-4xl font-black italic tracking-tighter uppercase font-display">
                                {systemName === 'TicketFlow' ? (
                                    <>Ticket<span className="text-accent-theme">Flow</span></>
                                ) : (
                                    systemName
                                )}
                            </h2>
                            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-text-muted)] opacity-80">
                                ERP de Atendimento & Suporte Técnico
                            </p>
                        </div>
                    </div>

                    <form className="space-y-8" onSubmit={handleSubmit}>
                        <div className="space-y-5">
                            {/* Input Usuário */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <UserIcon className="w-3 h-3 opacity-70" /> Usuário de Acesso
                                </label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/30 transition-all placeholder:text-[var(--color-text-muted)]/30"
                                        placeholder="Seu usuário"
                                    />
                                </div>
                            </div>

                            {/* Input Senha */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <Lock className="w-3 h-3 opacity-70" /> Senha Segura
                                </label>
                                <div className="relative group">
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/30 transition-all placeholder:text-[var(--color-text-muted)]/30"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoggingIn}
                            className="w-full group relative flex items-center justify-center gap-4 py-6 px-4 premium-gradient rounded-2xl text-white font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isLoggingIn ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    AUTENTICAR ACESSO
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer com Dica */}
                    <div className="text-center">
                        <div className="inline-block p-4 bg-white/5 border border-white/5 rounded-2xl">
                            <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest">
                                Ambiente <span className="text-foreground">Homologação</span> Local
                            </p>
                            <div className="flex gap-4 mt-2 justify-center opacity-40 grayscale group-hover:grayscale-0 transition-all">
                                <span className="text-[9px] font-mono">root / admin</span>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="text-center mt-10 text-[9px] font-black uppercase tracking-[0.4em] text-[var(--color-text-muted)] opacity-30">
                    © 2026 TicketFlow System | LAN Secured
                </p>
            </div>
        </div>
    );
}
