'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User, getCurrentUser, login as apiLogin } from '@/lib/api';
import { getFirstAllowedPath, canAccessPath } from '@/lib/permissions';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    const loadUser = async () => {
        const token = localStorage.getItem('auth_token');

        // Validação básica do token antes de tentar carregar
        if (!token || token === 'undefined' || token === 'null') {
            if (token) localStorage.removeItem('auth_token'); // Limpa se for lixo
            setLoading(false);
            return;
        }

        try {
            const userData = await getCurrentUser();
            setUser(userData);
        } catch (error: any) {
            console.error('Failed to load user:', error.response?.status === 401 ? 'Unauthorized (Invalid Token)' : error.message);
            localStorage.removeItem('auth_token');
            setUser(null);

            // Se falhou com 401 num caminho privado, força redirecionamento
            const publicPaths = ['/login'];
            if (!publicPaths.includes(pathname)) {
                router.push('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUser();
    }, []);

    // Proteção de rotas simples
    useEffect(() => {
        const publicPaths = ['/login'];
        const isPublicPath = publicPaths.includes(pathname);

        if (!loading && !user && !isPublicPath) {
            router.push('/login');
        }

        if (!loading && user && isPublicPath) {
            const firstPath = getFirstAllowedPath(user);
            router.push(firstPath);
        }

        // Se estiver logado em um caminho não público, verifica se tem permissão
        // NOTA: O redirecionamento imediato foi removido para permitir que o AppLayout exiba
        // a mensagem de acesso restrito com delay conforme solicitado.
        /*
        if (!loading && user && !isPublicPath) {
            if (!canAccessPath(user, pathname)) {
                const firstPath = getFirstAllowedPath(user);
                if (pathname !== firstPath) {
                    router.push(firstPath);
                }
            }
        }
        */
    }, [user, loading, pathname, router]);

    const login = async (username: string, password: string) => {
        try {
            const { access_token } = await apiLogin(username, password);
            localStorage.setItem('auth_token', access_token);
            const userData = await getCurrentUser();
            setUser(userData);

            // Redireciona para o primeiro menu permitido
            const firstPath = getFirstAllowedPath(userData);
            router.push(firstPath);
        } catch (error: any) {
            // Só loga se não for erro de credenciais (401)
            if (error.response?.status !== 401) {
                console.error('Login failed:', error);
            }
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('auth_token');
        setUser(null);
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
