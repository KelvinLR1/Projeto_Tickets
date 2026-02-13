'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import api from '@/lib/api';
import { useTheme } from './ThemeProvider';

interface SystemSettings {
    system_name: string;
    logo_url_light: string | null;
    logo_url_dark: string | null;
    custom_colors: Record<string, string> | null;
}

interface SystemSettingsContextType {
    systemName: string;
    logoUrl: string | null;
    logoUrlLight: string | null;
    logoUrlDark: string | null;
    logoUrlOnAccent: string | null;
    customColors: Record<string, string> | null;
    refreshSettings: () => Promise<void>;
    isLoading: boolean;
}

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(undefined);

export const useSystemSettings = () => {
    const context = useContext(SystemSettingsContext);
    if (!context) {
        throw new Error('useSystemSettings must be used within a SystemSettingsProvider');
    }
    return context;
};

export const SystemSettingsProvider = ({ children }: { children: ReactNode }) => {
    const { theme } = useTheme();
    const [settings, setSettings] = useState<SystemSettings>({
        system_name: 'TicketFlow',
        logo_url_light: null,
        logo_url_dark: null,
        custom_colors: null
    });
    const [isLoading, setIsLoading] = useState(true);

    const refreshSettings = useCallback(async () => {
        try {
            const response = await api.get('/system-settings');
            const data = response.data;

            // Tenta obter a API URL das configurações locais ou do default do axios
            const getBaseURL = () => {
                let url = api.defaults.baseURL?.replace(/\/$/, "") || "";

                if (typeof window !== 'undefined') {
                    const localConfig = localStorage.getItem('system_config');
                    if (localConfig) {
                        try {
                            const configData = JSON.parse(localConfig);
                            if (configData.apiUrl) url = configData.apiUrl.replace(/\/$/, "");
                        } catch (e) { }
                    }

                    // INTELLIGENT HOSTNAME: Se url for localhost/127.0.0.1 mas estivermos acessando remotamente
                    const currentHost = window.location.hostname;
                    const isRemoteAccess = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
                    const isApiLocal = url.includes('localhost') || url.includes('127.0.0.1');

                    if (isRemoteAccess && isApiLocal) {
                        url = url.replace(/localhost|127\.0\.0\.1/g, currentHost);
                    }
                }
                return url;
            };

            const baseURL = getBaseURL();

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
                custom_colors: data.custom_colors || null
            });
        } catch (error) {
            console.error('Failed to fetch system settings:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshSettings();
    }, [refreshSettings]);

    // Aplicar cores customizadas se o tema for 'custom'
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
            // Limpa propriedades customizadas se sair do tema custom
            const vars = [
                '--color-background', '--color-foreground', '--color-card', '--color-card-hover',
                '--color-primary-theme', '--color-border-theme', '--color-accent-theme', '--color-text-muted'
            ];
            vars.forEach(v => root.style.removeProperty(v));
        }
    }, [theme, settings.custom_colors]);

    // Helper para determinar se uma cor é "clara" ou "escura" (Brightness)
    const getBrightness = (hex: string): 'light' | 'dark' => {
        if (!hex || hex.length < 6) return 'dark'; // Fallback

        // Remove # se existir
        const color = hex.startsWith('#') ? hex.slice(1) : hex;
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);

        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 155 ? 'light' : 'dark';
    };

    // Mapeamento de brilho por tema (para temas padrão)
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

    const currentLogoUrl = useMemo(() => {
        const isDarkTheme = theme.includes('dark') || ['cyberpunk', 'matrix', 'sunset', 'nordic', 'gold', 'carbon-red', 'obsidian-red', 'midnight-purple', 'emerald-dark'].includes(theme);

        if (isDarkTheme) {
            return settings.logo_url_dark || settings.logo_url_light;
        }
        return settings.logo_url_light || settings.logo_url_dark;
    }, [theme, settings.logo_url_light, settings.logo_url_dark]);

    const logoUrlOnAccent = useMemo(() => {
        let accentBrightness: 'light' | 'dark' = 'light';

        if (theme === 'custom' && settings.custom_colors?.accent) {
            accentBrightness = getBrightness(settings.custom_colors.accent);
        } else {
            accentBrightness = THEME_ACCENT_BRIGHTNESS[theme] || 'light';
        }

        // Se o fundo do acento for CLARO, usamos o logo para temas CLAROS (que é o logo escuro)
        if (accentBrightness === 'light') {
            return settings.logo_url_light || settings.logo_url_dark;
        }
        // Se o fundo do acento for ESCURO, usamos o logo para temas ESCUROS (que é o logo claro)
        return settings.logo_url_dark || settings.logo_url_light;
    }, [theme, settings.logo_url_light, settings.logo_url_dark, settings.custom_colors]);

    return (
        <SystemSettingsContext.Provider value={{
            systemName: settings.system_name,
            logoUrl: currentLogoUrl,
            logoUrlLight: settings.logo_url_light,
            logoUrlDark: settings.logo_url_dark,
            logoUrlOnAccent: logoUrlOnAccent,
            customColors: settings.custom_colors,
            refreshSettings,
            isLoading
        }}>
            {children}
        </SystemSettingsContext.Provider>
    );
};
