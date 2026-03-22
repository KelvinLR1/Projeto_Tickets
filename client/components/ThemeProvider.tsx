'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

/**
 * Lista de todos os temas suportados pelo sistema.
 * Os temas são aplicados via classes CSS no elemento <html> (ex: theme-dark, theme-cyberpunk).
 */
type Theme = 'dark' | 'light' | 'cyberpunk' | 'matrix' | 'antigravity' | 'sunset' | 'nordic' | 'gold' | 'carbon-red' | 'obsidian-red' | 'office-red' | 'ash-red' | 'hub' | 'hub-dark' | 'midnight-purple' | 'emerald-dark' | 'custom';

/**
 * Interface que define os dados expostos pelo contexto de tema.
 */
interface ThemeContextType {
    theme: Theme;                   // Tema atual
    setTheme: (theme: Theme) => void; // Função para mudar o tema
}

// Criação do contexto
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Array constante com todos os temas para facilitar a remoção de classes antigas
const THEMES: Theme[] = ['dark', 'light', 'cyberpunk', 'matrix', 'antigravity', 'sunset', 'nordic', 'gold', 'carbon-red', 'obsidian-red', 'office-red', 'ash-red', 'hub', 'hub-dark', 'midnight-purple', 'emerald-dark', 'custom'];

/**
 * Provider que gerencia a troca dinâmica de temas visuais.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    /**
     * Aplica o tema selecionado no elemento raiz (<html>) da página.
     */
    const applyTheme = (newTheme: Theme) => {
        if (typeof window === 'undefined') return;
        const root = document.documentElement;

        // Remove todas as classes de tema existentes para evitar conflitos
        THEMES.forEach(t => root.classList.remove(`theme-${t}`));

        // Adiciona a classe do novo tema
        root.classList.add(`theme-${newTheme}`);

        // Atualiza o estado local
        setThemeState(newTheme);
    };

    /**
     * Efeito inicial: carrega o tema salvo no localStorage ao montar o componente.
     */
    useEffect(() => {
        setMounted(true);

        // Busca a configuração guardada (que contém o tema, porta da API, etc.)
        const config = localStorage.getItem('system_config');
        if (config) {
            try {
                const parsed = JSON.parse(config);
                const savedTheme = parsed.theme;
                if (savedTheme) applyTheme(savedTheme as Theme);
            } catch (e) {
                console.error("[ThemeProvider] Erro ao carregar tema inicial:", e);
            }
        }

        /**
         * Sincroniza o tema entre diferentes abas do navegador.
         */
        const handleStorageChange = () => {
            const updatedConfig = localStorage.getItem('system_config');
            if (updatedConfig) {
                try {
                    const { theme: savedTheme } = JSON.parse(updatedConfig);
                    if (savedTheme) applyTheme(savedTheme as Theme);
                } catch (e) { }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, setTheme: applyTheme }}>
            {/* 
                Envolvemos o conteúdo em uma div com transição de opacidade 
                para evitar o "FOUC" (Flash of Unstyled Content) enquanto o tema é carregado.
            */}
            <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.2s ease', height: '100%' }}>
                {children}
            </div>
        </ThemeContext.Provider>
    );
}

/**
 * Hook customizado para acessar e gerenciar o tema atual.
 */
export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme deve ser usado dentro de um ThemeProvider');
    return context;
};
