'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User, getCurrentUser, login as apiLogin } from '@/lib/api';
import { getFirstAllowedPath, canAccessPath } from '@/lib/permissions';

/**
 * Interface que define os dados expostos pelo contexto de autenticação.
 */
interface AuthContextType {
    user: User | null;         // Usuário autenticado ou null
    loading: boolean;          // Indica se o estado de autenticação está sendo carregado
    login: (username: string, password: string) => Promise<void>; // Função para realizar login
    logout: () => void;        // Função para realizar logout
    isAuthenticated: boolean;  // Atalho para saber se há um usuário logado
}

// Cria o contexto de autenticação
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provider que envolve a aplicação e gerencia o estado global de autenticação.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    /**
     * Tenta carregar os dados do usuário atual a partir do token armazenado no localStorage.
     */
    const loadUser = async () => {
        const token = localStorage.getItem('auth_token');

        // Validação básica do token antes de tentar carregar (evita chamadas desnecessárias)
        if (!token || token === 'undefined' || token === 'null') {
            if (token) localStorage.removeItem('auth_token'); // Limpa se for um valor inválido
            setLoading(false);
            return;
        }

        try {
            const userData = await getCurrentUser();
            setUser(userData);
        } catch (error: any) {
            const isUnauthorized = error.response?.status === 401;

            if (isUnauthorized) {
                console.warn('Sessão expirada ou token inválido. Redirecionando para login.');
            } else {
                const isNetworkError = !error.response && (error.message === 'Network Error' || error.code === 'ERR_NETWORK');
                if (!isNetworkError) {
                    console.error('Falha ao carregar usuário:', error.message);
                }
            }

            if (isUnauthorized) {
                // Se o erro for 401 (Não autorizado), limpa os dados locais
                localStorage.removeItem('auth_token');
                setUser(null);

                // Se falhou num caminho privado (ex: dashboard), força o redirecionamento para o login
                const publicPaths = ['/login'];
                if (!publicPaths.includes(pathname)) {
                    router.push('/login');
                }
            } else {
                // Erro de rede ou servidor - mantemos o estado mas paramos o loading
                // Isso evita deslogar o usuário em falhas temporárias de conexão (ex: servidor reiniciando)
            }
        } finally {
            setLoading(false);
        }
    };

    // Tenta carregar o usuário assim que o componente é montado
    useEffect(() => {
        loadUser();
    }, []);

    /**
     * Lógica de proteção de rotas:
     * - Se não estiver logado e tentar acessar área privada -> login.
     * - Se estiver logado e tentar acessar o login -> primeira página permitida.
     */
    useEffect(() => {
        const publicPaths = ['/login'];
        const isPublicPath = publicPaths.includes(pathname);

        if (!loading && !user && !isPublicPath) {
            router.push('/login');
        }

        if (!loading && user && isPublicPath) {
            // Se já está logado e tenta ir para a página de login, redireciona para a home/dashboard
            const firstPath = getFirstAllowedPath(user);
            router.push(firstPath);
        }

        // NOTA: A verificação de permissões por caminho (RBAC) é tratada visualmente no AppLayout
        // para permitir feedback de "Acesso Negado" antes do redirecionamento automático.
    }, [user, loading, pathname, router]);

    /**
     * Realiza o login via API, armazena o token e busca os dados do perfil.
     * Após o sucesso, redireciona o usuário para a sua Home correspondente.
     */
    const login = async (username: string, password: string) => {
        try {
            const { access_token } = await apiLogin(username, password);
            localStorage.setItem('auth_token', access_token);
            const userData = await getCurrentUser();
            setUser(userData);

            // Redirecionamento baseado em permissões (RBAC)
            const firstPath = getFirstAllowedPath(userData);
            router.push(firstPath);
        } catch (error: any) {
            // Só loga no console se não for um erro comum de credenciais (401)
            if (error.response?.status !== 401) {
                console.error('Erro no login:', error);
            }
            throw error; // Repassa o erro para o formulário de login tratar visualmente
        }
    };

    /**
     * Limpa a sessão e redireciona para o login.
     */
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

/**
 * Hook customizado para acessar os dados de autenticação em qualquer componente.
 */
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }
    return context;
};
