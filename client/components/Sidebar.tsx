'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from "@/components/AuthProvider";
import { usePathname } from "next/navigation";
import { canAccessMenu, getFirstAllowedPath, canPerformAction } from '@/lib/permissions';
import { useTimer } from './TimerProvider';
import { useNotification } from './NotificationProvider';
import { useSystemSettings } from './SystemSettingsProvider';
import {
    LayoutDashboard,
    BookOpen,
    ListFilter,
    Sparkles,
    Ticket,
    Settings,
    Users,
    BarChart3,
    ChevronRight,
    PlusCircle,
    User,
    LogOut,
    Clock,
    Bell
} from 'lucide-react';
import clsx from 'clsx';

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { activeTimers, openPiP, closePiP, isPiPOpen, isInternalPiPOpen } = useTimer();
    const { unreadCount } = useNotification();
    const { systemName, logoUrlOnAccent } = useSystemSettings();

    const navItems = [
        { id: 'dashboard', name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { id: 'reports', name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { id: 'tickets', name: 'Chamados', href: '/tickets', icon: ListFilter },
        { id: 'notifications', name: 'Notificações', href: '/notifications', icon: Bell },
        { id: 'clients', name: 'Clientes', href: '/clients', icon: Users },
        { id: 'knowledge', name: 'CONHECIMENTO', href: '/knowledge', icon: BookOpen },
        { id: 'chat', name: 'Soluções IA', href: '/chat', icon: Sparkles },
        { id: 'settings', name: 'Ajustes', href: '/settings', icon: Settings },
    ].filter(item => canAccessMenu(user, item.id));

    return (
        <aside className="fixed left-0 top-0 h-screen w-[clamp(240px,18vw,280px)] bg-card border-r border-border-theme flex flex-col z-50 transition-all duration-300">
            {/* Logo Area */}
            <div className="p-8 pb-10">
                <Link href={user ? getFirstAllowedPath(user) : "/"} className="flex items-center gap-3 group">
                    <div className="bg-accent-theme p-2 rounded-2xl group-hover:rotate-12 transition-transform shadow-lg shadow-accent-theme/20 overflow-hidden w-10 h-10 flex items-center justify-center">
                        {logoUrlOnAccent ? (
                            <img src={logoUrlOnAccent} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <Ticket className="w-6 h-6 text-white" />
                        )}
                    </div>
                    <span className={clsx(
                        "font-black tracking-tighter uppercase italic text-foreground leading-tight",
                        systemName.length > 15 ? "text-sm" : systemName.length > 10 ? "text-lg" : "text-xl"
                    )}>
                        {systemName === 'TicketFlow' ? (
                            <>Ticket<span className="text-accent-theme">Flow</span></>
                        ) : (
                            systemName
                        )}
                    </span>
                </Link>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-[clamp(0.75rem,2vw,1.5rem)] space-y-2 overflow-y-auto custom-scrollbar">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center justify-between group px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all relative overflow-hidden active:scale-95",
                                isActive
                                    ? "bg-accent-theme/10 text-accent-theme border border-accent-theme/20 shadow-lg shadow-accent-theme/5"
                                    : "text-[var(--color-text-muted)] hover:text-foreground hover:bg-card-hover border border-transparent"
                            )}
                        >
                            <div className="flex items-center gap-3 z-10">
                                <Icon className={clsx("w-[clamp(1.1rem,1.5vw,1.25rem)] h-[clamp(1.1rem,1.5vw,1.25rem)] transition-transform group-hover:scale-110", isActive ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground")} />
                                <span className="truncate">{item.name}</span>
                            </div>

                            {item.id === 'notifications' && unreadCount > 0 && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-accent-theme text-[8px] font-black text-white shadow-lg shadow-accent-theme/20 z-10 animate-in zoom-in duration-300">
                                    {unreadCount}
                                </div>
                            )}

                            {isActive && item.id !== 'notifications' && <ChevronRight className="w-4 h-4 z-10 animate-in slide-in-from-left duration-300" />}
                            {isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-accent-theme/10 to-transparent pointer-events-none" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Quick Action */}
            <div className="p-6 space-y-3">
                {canPerformAction(user, 'create_ticket') && (
                    <Link href="/tickets/new" className="w-full premium-gradient text-white p-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 group">
                        <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                        NOVO TICKET
                    </Link>
                )}

                <button
                    onClick={() => (isPiPOpen || isInternalPiPOpen) ? closePiP() : openPiP()}
                    className={clsx(
                        "w-full p-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 group relative overflow-hidden",
                        (activeTimers.length > 0 || isPiPOpen || isInternalPiPOpen)
                            ? "bg-accent-theme/10 text-accent-theme border border-accent-theme/20 hover:bg-accent-theme/20"
                            : "bg-foreground/5 text-[var(--color-text-muted)] hover:bg-card-hover hover:text-foreground"
                    )}
                >
                    <Clock className={clsx("w-4 h-4", (activeTimers.length > 0 || isPiPOpen || isInternalPiPOpen) && "animate-pulse")} />
                    {(isPiPOpen || isInternalPiPOpen) ? 'FECHAR WIDGET' : 'MODO WIDGET'}
                    {activeTimers.length > 0 && (
                        <span className="absolute top-2 right-2 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-theme opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-theme"></span>
                        </span>
                    )}
                </button>
            </div>

            {/* Footer / Profile */}
            <div className="p-6 mt-auto border-t border-border-theme bg-card/10 backdrop-blur-md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group flex-1 mr-2 overflow-hidden">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-accent-theme/20 border border-accent-theme/30 flex items-center justify-center text-accent-theme group-hover:scale-105 transition-transform overflow-hidden">
                            {user?.avatar_url ? (
                                <img
                                    src={`${typeof window !== 'undefined' ? `http://${window.location.hostname}:8080` : 'http://localhost:8080'}${user.avatar_url}`}
                                    alt={user.full_name || user.username}
                                    className="w-full h-full object-cover"
                                />
                            ) : user?.username ? (
                                <span className="font-bold">{(user.full_name || user.username)[0].toUpperCase()}</span>
                            ) : (
                                <User className="w-5 h-5" />
                            )}
                        </div>
                        <div className="flex flex-col truncate">
                            <span className="text-xs font-bold text-foreground opacity-90 truncate">
                                {user?.full_name || user?.username || 'Carregando...'}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">
                                {user?.role || 'Visitante'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                        title="Sair"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
