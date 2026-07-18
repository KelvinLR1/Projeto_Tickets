'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from "@/components/AuthProvider";
import { usePathname } from "next/navigation";
import { canAccessMenu, getFirstAllowedPath, canPerformAction } from '@/lib/permissions';
import { useTimer } from './TimerProvider';
import { useNotification } from './NotificationProvider';
import { useSystemSettings } from './SystemSettingsProvider';
import { motion, AnimatePresence } from 'framer-motion';
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

    // Menu de opções do usuário logado
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);

    // Estado do card de identificação (tooltip) — rastreia item hovered e posição Y
    const [hoveredNav, setHoveredNav] = useState<{ id: string; name: string; isActive: boolean; top: number } | null>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Helper para calcular posição do tooltip relativo ao aside
    const getTooltipTop = (el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        const asideRect = el.closest('aside')!.getBoundingClientRect();
        return rect.top - asideRect.top + rect.height / 2;
    };

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
            {/* Área do Logo */}
            <div className={clsx(
                "flex flex-col items-center overflow-hidden transition-all w-full",
                isCollapsed ? "p-0 py-8 gap-8" : "p-6 flex-row gap-2"
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
            </div>

            {/* Zona de hover dedicada na borda direita — botão aparece apenas aqui */}
            <div className="group/toggle absolute top-0 right-0 h-full w-4 z-[60] flex items-center justify-end">
                <button
                    onClick={onToggle}
                    title={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
                    className="absolute -right-3.5 flex items-center justify-center w-7 h-14 rounded-full text-white transition-all duration-300 active:scale-90 opacity-0 pointer-events-none group-hover/toggle:opacity-100 group-hover/toggle:pointer-events-auto hover:brightness-110 hover:scale-105"
                    style={{ backgroundColor: 'var(--color-primary-theme)', boxShadow: '0 4px 20px color-mix(in srgb, var(--color-primary-theme) 40%, transparent)' }}
                >
                    <ChevronRight
                        className={clsx(
                            "w-4 h-4 transition-transform duration-300",
                            isCollapsed ? "rotate-0" : "rotate-180"
                        )}
                    />
                </button>
            </div>

            {/* Card de identificação — renderizado no aside, fora do nav, para evitar clipping do overflow */}
            <AnimatePresence>
                {isCollapsed && hoveredNav && (
                    <motion.div
                        key={hoveredNav.id}
                        initial={{ opacity: 0, x: -6, y: '-50%' }}
                        animate={{ opacity: 1, x: 0, y: '-50%' }}
                        exit={{ opacity: 0, x: -4, y: '-50%' }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className={clsx(
                            "pointer-events-none absolute left-full ml-3 z-[200] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border shadow-xl whitespace-nowrap",
                            hoveredNav.id === 'new_ticket' && "premium-gradient"
                        )}
                        style={{
                            top: hoveredNav.top,
                            ...(hoveredNav.id === 'new_ticket'
                                ? {
                                    borderColor: 'transparent',
                                    boxShadow: '0 8px 32px color-mix(in srgb, var(--color-accent-theme) 35%, transparent)',
                                }
                                : {
                                    backgroundColor: 'var(--color-card)',
                                    borderColor: hoveredNav.isActive ? 'var(--color-primary-theme)' : 'var(--color-border-theme)',
                                    boxShadow: hoveredNav.isActive
                                        ? '0 8px 32px color-mix(in srgb, var(--color-primary-theme) 25%, transparent)'
                                        : '0 8px 32px rgba(0,0,0,0.5)',
                                }
                            ),
                        }}
                    >
                        {/* Barra de destaque lateral */}
                        <span
                            className="w-0.5 h-5 rounded-full shrink-0"
                            style={{
                                backgroundColor: hoveredNav.id === 'new_ticket'
                                    ? 'rgba(255,255,255,0.6)'
                                    : hoveredNav.isActive ? 'var(--color-primary-theme)' : 'var(--color-text-muted)'
                            }}
                        />
                        <span
                            className="text-[11px] font-black uppercase tracking-widest"
                            style={{
                                color: hoveredNav.id === 'new_ticket'
                                    ? 'white'
                                    : hoveredNav.isActive ? 'var(--color-primary-theme)' : 'var(--color-text-muted)'
                            }}
                        >
                            {hoveredNav.name}
                        </span>
                        {/* Badge de notificações no card */}
                        {hoveredNav.id === 'notifications' && unreadCount > 0 && (
                            <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-accent-theme text-[8px] font-black text-white">
                                {unreadCount}
                            </span>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

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
                            onMouseEnter={isCollapsed ? (e) => {
                                setHoveredNav({ id: item.id, name: item.name, isActive, top: getTooltipTop(e.currentTarget as HTMLElement) });
                            } : undefined}
                            onMouseLeave={isCollapsed ? () => setHoveredNav(null) : undefined}
                        >
                            <div className={clsx("flex items-center z-10 shrink-0", isCollapsed ? "gap-0" : "gap-3")}>
                                <Icon className={clsx("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground")} />
                                {!isCollapsed && (
                                    <span className="text-[11px] font-black uppercase tracking-widest truncate animate-in fade-in duration-500">
                                        {item.name}
                                    </span>
                                )}
                            </div>

                            {/* Badge de notificações no ícone */}
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
                        onMouseEnter={isCollapsed ? (e) => {
                            setHoveredNav({ id: 'new_ticket', name: 'Novo Ticket', isActive: false, top: getTooltipTop(e.currentTarget as HTMLElement) });
                        } : undefined}
                        onMouseLeave={isCollapsed ? () => setHoveredNav(null) : undefined}
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
                    onMouseEnter={isCollapsed ? (e) => {
                        const label = (isPiPOpen || isInternalPiPOpen) ? 'Fechar Cronômetro' : 'Cronômetro';
                        setHoveredNav({ id: 'timer', name: label, isActive: activeTimers.length > 0 || isPiPOpen || isInternalPiPOpen, top: getTooltipTop(e.currentTarget as HTMLElement) });
                    } : undefined}
                    onMouseLeave={isCollapsed ? () => setHoveredNav(null) : undefined}
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
            <div
                ref={userMenuRef}
                className={clsx(
                    "border-t border-border-theme bg-card/10 backdrop-blur-md transition-all relative",
                    isCollapsed ? "p-0 py-6 flex flex-col items-center w-full" : "p-4"
                )}
            >
                {/* Menu Popover de Opções */}
                <AnimatePresence>
                    {isUserMenuOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className={clsx(
                                "absolute z-50 premium-gradient border border-white/10 p-1.5 rounded-2xl shadow-2xl w-48 flex flex-col gap-1 shadow-accent-theme/20 left-full ml-4",
                                isCollapsed ? "bottom-6" : "bottom-4"
                            )}
                        >
                            <Link
                                href="/profile"
                                onClick={() => setIsUserMenuOpen(false)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                            >
                                <Settings className="w-4 h-4" />
                                <span>Configurações</span>
                            </Link>
                            <button
                                onClick={() => {
                                    setIsUserMenuOpen(false);
                                    logout();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-white/90 hover:text-white hover:bg-black/15 transition-all text-left cursor-pointer"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>Sair</span>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div
                    onClick={() => setIsUserMenuOpen(prev => !prev)}
                    className={clsx(
                        "flex items-center hover:bg-white/5 transition-all cursor-pointer group shrink-0 overflow-hidden select-none",
                        isCollapsed ? "w-12 h-12 justify-center rounded-2xl" : "w-full p-2 rounded-2xl gap-3"
                    )}
                    onMouseEnter={isCollapsed ? (e) => {
                        const label = user?.full_name || user?.username || 'Perfil';
                        setHoveredNav({ id: 'user_profile', name: label, isActive: false, top: getTooltipTop(e.currentTarget as HTMLElement) });
                    } : undefined}
                    onMouseLeave={isCollapsed ? () => setHoveredNav(null) : undefined}
                >
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

                        {/* Indicador de status online */}
                        <div className={clsx(
                            "absolute w-2.5 h-2.5 bg-emerald-500 border-2 border-card rounded-full",
                            isCollapsed ? "bottom-0.5 right-0.5" : "bottom-0 right-0"
                        )} />
                    </div>
                    {!isCollapsed && (
                        <div className="flex flex-col truncate animate-in fade-in duration-500 flex-1">
                            <span className="text-xs font-bold text-foreground opacity-90 truncate">
                                {user?.full_name || user?.username || 'Carregando...'}
                            </span>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">
                                {user?.role || 'Visitante'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}
