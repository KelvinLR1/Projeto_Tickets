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
    BarChart3
} from 'lucide-react';
import clsx from 'clsx';

export default function Navbar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Relatórios', href: '/reports', icon: BarChart3 },
        { name: 'Conhecimento', href: '/knowledge', icon: BookOpen },
        { name: 'Tickets', href: '/tickets', icon: ListFilter },
        { name: 'Clientes', href: '/clients', icon: Users },
        { name: 'Soluções IA', href: '/chat', icon: Sparkles },
        { name: 'Configurações', href: '/settings', icon: Settings },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-border-theme bg-background/50 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    {/* Logo / Brand */}
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="bg-blue-600 p-1.5 rounded-lg group-hover:bg-blue-500 transition-colors">
                            <Ticket className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-foreground hidden sm:block">
                            Ticket<span className="text-blue-500">Flow</span>
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={clsx(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                        isActive
                                            ? "bg-border-theme text-foreground shadow-sm"
                                            : "text-gray-400 hover:text-foreground hover:bg-card"
                                    )}
                                >
                                    <Icon className={clsx("w-4 h-4", isActive ? "text-accent-theme" : "text-gray-500")} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="/tickets/new"
                            className={clsx(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg",
                                pathname === '/tickets/new'
                                    ? "bg-blue-600 text-white shadow-blue-500/20"
                                    : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:scale-[1.02]"
                            )}
                        >
                            <MessageSquarePlus className="w-4 h-4" />
                            <span className="hidden sm:inline">Novo Ticket</span>
                        </Link>
                    </div>
                </div>
            </div>
        </nav>
    );
}
