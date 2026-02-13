'use client';

import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { canAccessPath, getFirstAllowedPath } from "@/lib/permissions";
import { Ticket, ShieldAlert, ArrowLeft, Clock } from "lucide-react";
import React, { useState, useEffect } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [timer, setTimer] = useState(5);
    const [lastPath, setLastPath] = useState(pathname);

    // Reset síncrono do timer quando a rota muda (evita piscadas)
    if (pathname !== lastPath) {
        setLastPath(pathname);
        setTimer(5);
    }

    const isLoginPage = pathname === "/login";
    const accessAllowed = user ? canAccessPath(user, pathname) : true;

    useEffect(() => {
        if (!user || accessAllowed) return;

        // Se o timer chegar a zero, redireciona
        if (timer <= 0) {
            const firstPath = getFirstAllowedPath(user);
            router.push(firstPath);
            return;
        }

        const interval = setInterval(() => {
            setTimer((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [user, accessAllowed, timer, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
                <div className="relative">
                    <div className="w-20 h-20 border-4 border-accent-theme/20 border-t-accent-theme rounded-full animate-spin" />
                    <Ticket className="w-8 h-8 text-accent-theme absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-accent-theme animate-pulse">Sincronizando Sistema</p>
                    <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                        <div className="absolute inset-y-0 h-full premium-gradient w-1/3 animate-loading-bar" />
                    </div>
                </div>
            </div>
        );
    }

    if (isLoginPage) {
        return <>{children}</>;
    }

    if (!user) {
        return null; // O AuthProvider tratará o redirecionamento
    }

    if (!accessAllowed) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-8 p-8 text-center animate-in fade-in duration-700">
                <div className="relative">
                    <div className="w-28 h-28 bg-red-500/10 rounded-[2rem] flex items-center justify-center border border-red-500/20 text-red-500 shadow-2xl shadow-red-500/10 mb-2">
                        <ShieldAlert className="w-14 h-14" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-background border border-border-theme rounded-full flex items-center justify-center text-xs font-black text-accent-theme shadow-lg">
                        {timer}s
                    </div>
                </div>

                <div className="space-y-3">
                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">Acesso Restrito</h2>
                    <p className="text-sm text-[var(--color-text-muted)] max-w-md leading-relaxed">
                        Seu perfil de acesso não possui permissão para visualizar esta página. <br />
                        Você será redirecionado automaticamente em alguns segundos.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-6">
                    <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div
                            className="h-full bg-accent-theme transition-all duration-1000 ease-linear"
                            style={{ width: `${(timer / 5) * 100}%` }}
                        />
                    </div>

                    <button
                        onClick={() => router.push(getFirstAllowedPath(user))}
                        className="flex items-center gap-3 px-8 py-4 bg-card border border-border-theme rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/5 hover:border-accent-theme/30 transition-all active:scale-95 group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Voltar Agora
                    </button>
                </div>
            </div>
        );
    }

    const isMonitorPage = pathname === "/monitor";

    if (isMonitorPage) {
        return <main className="min-h-screen">{children}</main>;
    }

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 pl-64 transition-all duration-300">
                {children}
            </main>
        </div>
    );
}
