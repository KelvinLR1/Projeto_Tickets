'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'cyberpunk' | 'matrix' | 'antigravity' | 'sunset' | 'nordic' | 'gold' | 'carbon-red' | 'obsidian-red' | 'office-red' | 'ash-red';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEMES: Theme[] = ['dark', 'light', 'cyberpunk', 'matrix', 'antigravity', 'sunset', 'nordic', 'gold', 'carbon-red', 'obsidian-red', 'office-red', 'ash-red'];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    const applyTheme = (newTheme: Theme) => {
        if (typeof window === 'undefined') return;
        const root = document.documentElement;

        console.log(`[ThemeProvider] Sincronizando classes. Removendo antigos, adicionando: ${newTheme}`);

        // Remove todos os temas possíveis
        THEMES.forEach(t => root.classList.remove(`theme-${t}`));

        // Adiciona o novo tema (inclusive dark se quisermos especificidade)
        root.classList.add(`theme-${newTheme}`);

        setThemeState(newTheme);
    };

    useEffect(() => {
        setMounted(true);
        // Carrega tema inicial
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
            {/* O conteúdo só é estilizado via classes no <html>, 
                então o Provider pode existir sempre. 
                A visibilidade pode ser controlada aqui se necessário. */}
            <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.2s ease' }}>
                {children}
            </div>
        </ThemeContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};
