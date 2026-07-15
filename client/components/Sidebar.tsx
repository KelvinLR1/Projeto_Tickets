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
    Bell,
    MessageSquare
} from 'lucide-react';
import clsx from 'clsx';

/**
 * Componente de Barra Lateral (Sidebar).
 * Contém a navegação principal, logo do sistema, ações rápidas e perfil do usuário.
 * Suporta modo expandido e colapsado (ícones apenas).
 */
interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { activeTimers, openPiP, closePiP, isPiPOpen, isInternalPiPOpen } = useTimer();
    const { unreadCount } = useNotification();
    const { systemName, logoUrlOnAccent } = useSystemSettings();

    /**
     * Filtra os itens do menu lateral com base nas permissões de cada perfil.
     */
    const navItems = [
        { id: 'dashboard', name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { id: 'reports', name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { id: 'tickets', name: 'Chamados', href: '/tickets', icon: ListFilter },
        { id: 'notifications', name: 'Notificações', href: '/notifications', icon: Bell },
        { id: 'clients', name: 'Clientes', href: '/clients', icon: Users },
        { id: 'knowledge', name: 'CONHECIMENTO', href: '/knowledge', icon: BookOpen },
        { id: 'chat', name: 'Soluções IA', href: '/chat', icon: Sparkles },
        { id: 'whatsapp', name: 'WhatsApp', href: '/whatsapp', icon: MessageSquare },
        { id: 'settings', name: 'Ajustes', href: '/settings', icon: Settings },
    ].filter(item => canAccessMenu(user, item.id));

    return (
        <aside 
            className={clsx(
                "fixed left-0 top-0 h-screen bg-card border-r border-border-theme flex flex-col z-50 transition-all",
                isCollapsed ? "w-[length:var(--sidebar-width-collapsed)]" : "w-[length:var(--sidebar-width-expanded)]"
            )}
            style={{ 
                transitionDuration: 'var(--sidebar-transition-duration)',
                transitionTimingFunction: 'var(--sidebar-transition-timing)'
            }}
        >
            {/* Área do Logo com Botão de Toggle */}
            <div className={clsx(
                "flex flex-col items-center overflow-hidden transition-all w-full", 
                isCollapsed ? "p-0 py-8 gap-8" : "p-6 flex-row justify-between gap-2"
            )}>
                <Link href={user ? getFirstAllowedPath(user) : "/"} className={clsx("flex items-center gap-3 group min-w-0 overflow-hidden", isCollapsed ? "justify-center w-full" : "flex-1")}>
                    <div className={clsx(
                        "bg-accent-theme rounded-2xl group-hover:rotate-12 transition-transform shadow-lg shadow-accent-theme/20 overflow-hidden flex items-center justify-center shrink-0",
                        isCollapsed ? "w-12 h-12 p-2.5" : "w-10 h-10 p-2"
                    )}>
                        {logoUrlOnAccent ? (
                            <img src={logoUrlOnAccent} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                            <Ticket className={clsx("text-white", isCollapsed ? "w-7 h-7" : "w-6 h-6")} />
                        )}
                    </div>
                    {!isCollapsed && (
                        <span className={clsx(
                            "font-black tracking-tighter uppercase italic text-foreground leading-[1] animate-in fade-in slide-in-from-left-4 duration-500 max-w-[120px] break-words",
                            systemName.length > 20 ? "text-sm" : "text-lg md:text-xl"
                        )}>
                            {systemName === 'TicketFlow' ? (
                                <>Ticket<span className="text-accent-theme">Flow</span></>
                            ) : (
                                systemName
                            )}
                        </span>
                    )}
                </Link>

                <button 
                    onClick={onToggle}
                    className="shrink-0 p-2 bg-foreground/5 hover:bg-accent-theme/10 text-[var(--color-text-muted)] hover:text-accent-theme rounded-xl transition-all active:scale-90"
                    title={isCollapsed ? "Expandir" : "Recolher"}
                >
                    {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronRight className="w-5 h-5 rotate-180" />}
                </button>
            </div>

            {/* Links de Navegação Dinâmicos */}
            <nav 
                className={clsx(
                    "flex-1 flex flex-col space-y-2 overflow-y-auto transition-all w-full",
                    isCollapsed ? "px-0 py-2 items-center [scrollbar-width:none] [&::-webkit-scrollbar]:display-none" : "px-[clamp(0.75rem,2vw,1.5rem)] custom-scrollbar"
                )}
            >
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                "flex items-center group rounded-2xl transition-all relative overflow-hidden active:scale-95 shrink-0",
                                isCollapsed ? "justify-center w-12 h-12 p-0" : "justify-between px-5 py-4",
                                isActive
                                    ? "bg-accent-theme/10 text-accent-theme border border-accent-theme/20 shadow-lg shadow-accent-theme/5"
                                    : "text-[var(--color-text-muted)] hover:text-foreground hover:bg-card-hover border border-transparent"
                            )}
                            title={isCollapsed ? item.name : ""}
                        >
                            <div className={clsx("flex items-center z-10 shrink-0", isCollapsed ? "gap-0" : "gap-3")}>
                                <Icon className={clsx("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground")} />
                                {!isCollapsed && (
                                    <span className="text-[11px] font-black uppercase tracking-widest truncate animate-in fade-in duration-500">
                                        {item.name}
                                    </span>
                                )}
                            </div>

                            {/* Badge de notificações */}
                            {item.id === 'notifications' && unreadCount > 0 && (
                                <div className={clsx(
                                    "flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-accent-theme text-[8px] font-black text-white shadow-lg shadow-accent-theme/20 z-10 animate-in zoom-in duration-300",
                                    isCollapsed ? "absolute top-0 right-0" : "relative"
                                )}>
                                    {unreadCount}
                                </div>
                            )}

                            {!isCollapsed && isActive && item.id !== 'notifications' && <ChevronRight className="w-4 h-4 z-10 animate-in slide-in-from-left duration-300" />}
                            {isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-accent-theme/10 to-transparent pointer-events-none" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Ações Rápidas */}
            <div className={clsx(
                "space-y-3 transition-all", 
                isCollapsed ? "p-0 py-4 flex flex-col items-center w-full" : "p-4"
            )}>
                {canPerformAction(user, 'create_ticket') && (
                    <Link 
                        href="/tickets/new" 
                        className={clsx(
                            "premium-gradient text-white rounded-2xl font-black transition-all flex items-center justify-center gap-2 group shadow-lg shadow-accent-theme/20",
                            isCollapsed ? "w-12 h-12 p-0" : "w-full p-4 text-[10px] uppercase tracking-[0.2em]"
                        )}
                        title="Novo Ticket"
                    >
                        <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        {!isCollapsed && "NOVO TICKET"}
                    </Link>
                )}

                <button
                    onClick={() => (isPiPOpen || isInternalPiPOpen) ? closePiP() : openPiP()}
                    className={clsx(
                        "rounded-2xl font-black transition-all flex items-center justify-center gap-2 group relative overflow-hidden",
                        isCollapsed ? "w-12 h-12 p-0" : "w-full p-4 text-[10px] uppercase tracking-[0.2em]",
                        (activeTimers.length > 0 || isPiPOpen || isInternalPiPOpen)
                            ? "bg-accent-theme/10 text-accent-theme border border-accent-theme/20 hover:bg-accent-theme/20"
                            : "bg-foreground/5 text-[var(--color-text-muted)] hover:bg-card-hover hover:text-foreground"
                    )}
                    title={isCollapsed ? "Cronômetro" : ""}
                >
                    <Clock className={clsx("w-5 h-5", (activeTimers.length > 0 || isPiPOpen || isInternalPiPOpen) && "animate-pulse")} />
                    {!isCollapsed && ((isPiPOpen || isInternalPiPOpen) ? 'FECHAR CRONÔMETRO' : 'CRONÔMETRO')}
                    
                    {activeTimers.length > 0 && (
                        <span className="absolute top-2 right-2 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-theme opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-theme"></span>
                        </span>
                    )}
                </button>
            </div>

            {/* Rodapé: Perfil e Logout */}
            <div className={clsx(
                "border-t border-border-theme bg-card/10 backdrop-blur-md transition-all", 
                isCollapsed ? "p-0 py-6 flex flex-col items-center w-full" : "p-4"
            )}>
                <div className={clsx("flex items-center w-full", isCollapsed ? "flex-col gap-6" : "justify-between")}>
                    <div className={clsx(
                        "flex items-center p-2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group shrink-0 overflow-hidden",
                        isCollapsed ? "justify-center gap-0" : "gap-3 mr-2"
                    )}>
                        <div className="w-9 h-9 shrink-0 rounded-full bg-accent-theme/20 border border-accent-theme/30 flex items-center justify-center text-accent-theme group-hover:scale-105 transition-transform overflow-hidden relative">
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
                            
                            {/* Indicador de status online (exemplo) */}
                            <div className={clsx(
                                "absolute w-2.5 h-2.5 bg-emerald-500 border-2 border-card rounded-full",
                                isCollapsed ? "bottom-0.5 right-0.5" : "bottom-0 right-0"
                            )} />
                        </div>
                        {!isCollapsed && (
                            <div className="flex flex-col truncate animate-in fade-in duration-500">
                                <span className="text-xs font-bold text-foreground opacity-90 truncate">
                                    {user?.full_name || user?.username || 'Carregando...'}
                                </span>
                                <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">
                                    {user?.role || 'Visitante'}
                                </span>
                            </div>
                        )}
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
