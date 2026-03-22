'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import api, { getDynamicApiUrl } from '@/lib/api';
import { useTheme } from './ThemeProvider';

/**
 * Interface que define as configurações brutas vindas do banco de dados.
 */
interface SystemSettings {
    system_name: string;             // Nome do sistema (ex: Projeto Tickets)
    logo_url_light: string | null;   // Logo para temas claros
    logo_url_dark: string | null;    // Logo para temas escuros
    custom_colors: Record<string, string> | null; // Mapeamento de cores para o tema customizado
    favicon_url: string | null;      // URL do ícone da aba do navegador
}

/**
 * Interface que define os dados e funções expostos pelo contexto.
 */
interface SystemSettingsContextType {
    systemName: string;              // Nome atual do sistema
    logoUrl: string | null;          // URL do logo adequado para o tema atual
    logoUrlLight: string | null;     // URL absoluta do logo claro
    logoUrlDark: string | null;      // URL absoluta do logo escuro
    logoUrlOnAccent: string | null;  // URL do logo para uso sobre a cor de destaque (Navbar/Sidebar)
    faviconUrl: string | null;       // URL do favicon
    customColors: Record<string, string> | null; // Cores do tema custom
    refreshSettings: () => Promise<void>;        // Força a atualização das configurações
    isLoading: boolean;              // Indica se as configurações estão sendo baixadas
}

// Criação do contexto
const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

/**
 * Hook customizado para acessar as configurações visuais do sistema.
 */
export const useSystemSettings = () => {
    const context = useContext(SystemSettingsContext);
    if (!context) {
        throw new Error('useSystemSettings deve ser usado dentro de um SystemSettingsProvider');
    }
    return context;
};

/**
 * Provider que gerencia a identidade visual dinâmica do sistema.
 * Carrega nome, logos, favicon e cores customizadas do backend.
 */
export const SystemSettingsProvider = ({ children }: { children: ReactNode }) => {
    const { theme } = useTheme();
    const [settings, setSettings] = useState<SystemSettings>({
        system_name: 'TicketFlow',
        logo_url_light: null,
        logo_url_dark: null,
        custom_colors: null,
        favicon_url: null
    });
    const [isLoading, setIsLoading] = useState(true);

    /**
     * Busca as configurações do sistema no backend e resolve as URLs de imagem.
     */
    const refreshSettings = useCallback(async () => {
        try {
            const response = await api.get('/system-settings');
            const data = response.data;

            const baseURL = getDynamicApiUrl();

            // Resolve caminhos relativos para URLs absolutas
            const resolveUrl = (url: string | null) => {
                if (url && !url.startsWith('http') && !url.startsWith('data:')) {
                    return `${baseURL}${url.startsWith('/') ? '' : '/'}${url}`;
                }
                return url;
            };

            setSettings({
                system_name: data.system_name || 'TicketFlow',
                logo_url_light: resolveUrl(data.logo_url_light) || resolveUrl(data.logo_url) || null,
                logo_url_dark: resolveUrl(data.logo_url_dark) || resolveUrl(data.logo_url) || null,
                custom_colors: data.custom_colors || null,
                favicon_url: resolveUrl(data.favicon_url) || null
            });
        } catch (error: any) {
            const isNetworkError = !error.response && (error.message === 'Network Error' || error.code === 'ERR_NETWORK');
            if (!isNetworkError) {
                console.error('Falha ao buscar configurações do sistema:', error);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Carrega as configurações ao montar o provedor
    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    /**
     * Atualiza o título e o favicon da aba do navegador dinamicamente.
     */
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if (settings.system_name) document.title = settings.system_name;

            if (settings.favicon_url) {
                let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
                link.href = settings.favicon_url;
            }
        }
    }, [settings.system_name, settings.favicon_url]);

    /**
     * Monitora mudanças no tema e aplica variáveis CSS customizadas (:root) 
     * se o tema 'custom' estiver ativo. Permite o White-Labeling dinâmico.
     */
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'custom' && settings.custom_colors) {
            const mapping: Record<string, string> = {
                'bg': '--color-background',
                'fg': '--color-foreground',
                'card': '--color-card',
                'card-hover': '--color-card-hover',
                'primary': '--color-primary-theme',
                'border': '--color-border-theme',
                'accent': '--color-accent-theme',
                'muted': '--color-text-muted'
            };

            Object.entries(settings.custom_colors).forEach(([key, value]) => {
                const varName = mapping[key];
                if (varName && value) {
                    root.style.setProperty(varName, value);
                }
            });
        } else {
            // Remove as propriedades customizadas se o usuário mudar para um tema padrão
            const vars = [
                '--color-background', '--color-foreground', '--color-card', '--color-card-hover',
                '--color-primary-theme', '--color-border-theme', '--color-accent-theme', '--color-text-muted'
            ];
            vars.forEach(v => root.style.removeProperty(v));
        }
    }, [theme, settings.custom_colors]);

    /**
     * Helper para calcular o brilho de uma cor hex e decidir se deve usar elementos claros ou escuros sobre ela.
     */
    const getBrightness = (hex: string): 'light' | 'dark' => {
        if (!hex || hex.length < 6) return 'dark';

        const color = hex.startsWith('#') ? hex.slice(1) : hex;
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);

        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 155 ? 'light' : 'dark';
    };

    // Mapeamento de brilho "hardcoded" para os temas padrão do sistema
    const THEME_ACCENT_BRIGHTNESS: Record<string, 'light' | 'dark'> = {
        'dark': 'light',
        'light': 'light',
        'cyberpunk': 'light',
        'matrix': 'light',
        'antigravity': 'light',
        'sunset': 'light',
        'nordic': 'light',
        'gold': 'light',
        'carbon-red': 'light',
        'obsidian-red': 'dark',
        'office-red': 'light',
        'ash-red': 'light',
        'hub': 'dark',
        'hub-dark': 'dark',
        'midnight-purple': 'light',
        'emerald-dark': 'light'
    };

    /**
     * Lógica para selecionar o Logo apropriado.
     * Considera se o tema atual é predominantemente escuro ou claro para 
     * escolher entre 'logo_url_dark' e 'logo_url_light'.
     */
    const currentLogoUrl = useMemo(() => {
        const isDarkTheme = theme.includes('dark') || ['cyberpunk', 'matrix', 'sunset', 'nordic', 'gold', 'carbon-red', 'obsidian-red', 'midnight-purple', 'emerald-dark'].includes(theme);

        if (isDarkTheme) {
            return settings.logo_url_dark || settings.logo_url_light;
        }
        return settings.logo_url_light || settings.logo_url_dark;
    }, [theme, settings.logo_url_light, settings.logo_url_dark]);

    /**
     * Logo específico para ser exibido sobre a cor 'accent' (geralmente na Sidebar/Navbar).
     */
    const logoUrlOnAccent = useMemo(() => {
        let accentBrightness: 'light' | 'dark' = 'light';

        if (theme === 'custom' && settings.custom_colors?.accent) {
            accentBrightness = getBrightness(settings.custom_colors.accent);
        } else {
            accentBrightness = THEME_ACCENT_BRIGHTNESS[theme] || 'light';
        }

        // Se o fundo for claro, usa o logo escuro (logo_url_light) e vice-versa
        if (accentBrightness === 'light') {
            return settings.logo_url_light || settings.logo_url_dark;
        }
        return settings.logo_url_dark || settings.logo_url_light;
    }, [theme, settings.logo_url_light, settings.logo_url_dark, settings.custom_colors]);

    return (
        <SystemSettingsContext.Provider value={{
            systemName: settings.system_name,
            logoUrl: currentLogoUrl,
            logoUrlLight: settings.logo_url_light,
            logoUrlDark: settings.logo_url_dark,
            logoUrlOnAccent: logoUrlOnAccent,
            faviconUrl: settings.favicon_url,
            customColors: settings.custom_colors,
            refreshSettings,
            isLoading
        }}>
            {children}
        </SystemSettingsContext.Provider>
    );
};
