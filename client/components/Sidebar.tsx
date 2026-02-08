'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    BookOpen,
    ListFilter,
    MessageSquarePlus,
    Sparkles,
    Ticket,
    Settings,
    Users,
    BarChart3,
    ChevronRight,
    Search,
    PlusCircle,
    User
} from 'lucide-react';
import clsx from 'clsx';

export default function Sidebar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { name: 'Chamados', href: '/tickets', icon: ListFilter },
        { name: 'Clientes', href: '/clients', icon: Users },
        { name: 'Base IA', href: '/knowledge', icon: BookOpen },
        { name: 'Soluções IA', href: '/chat', icon: Sparkles },
        { name: 'Ajustes', href: '/settings', icon: Settings },
    ];

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-card border-r border-border-theme flex flex-col z-50">
            {/* Logo Area */}
            <div className="p-8 pb-10">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="bg-accent-theme p-2 rounded-2xl group-hover:rotate-12 transition-transform shadow-lg shadow-accent-theme/20">
                        <Ticket className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tighter uppercase italic text-foreground">
                        Ticket<span className="text-accent-theme">Flow</span>
                    </span>
                </Link>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-6 space-y-3 overflow-y-auto custom-scrollbar">
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
                            <div className="flex items-center gap-4 z-10">
                                <Icon className={clsx("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-accent-theme" : "text-[var(--color-text-muted)] group-hover:text-foreground")} />
                                <span>{item.name}</span>
                            </div>
                            {isActive && <ChevronRight className="w-4 h-4 z-10 animate-in slide-in-from-left duration-300" />}
                            {isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-accent-theme/10 to-transparent pointer-events-none" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Quick Action */}
            <div className="p-6">
                <button className="w-full premium-gradient text-white p-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 group">
                    <PlusCircle className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                    NOVO TICKET
                </button>
            </div>

            {/* Footer / Profile Placeholder */}
            <div className="p-6 mt-auto border-t border-border-theme bg-card/10 backdrop-blur-md">
                <div className="flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group">
                    <div className="w-10 h-10 rounded-full bg-accent-theme/20 border border-accent-theme/30 flex items-center justify-center text-accent-theme group-hover:scale-105 transition-transform">
                        <User className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground opacity-90">Administrador</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono">v1.2.0-exec</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
