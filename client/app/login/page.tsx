'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useSystemSettings } from '@/components/SystemSettingsProvider';
import { Lock, User as UserIcon, Loader2, Ticket, Sparkles, ShieldCheck, Settings, Globe, X, RefreshCw, AlertCircle, Save, Database, CheckCircle2 } from 'lucide-react';
import { getDefaultBaseURL, getDynamicApiUrl } from '@/lib/api';
import axios from 'axios';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const { login } = useAuth();
    const { systemName, logoUrlOnAccent } = useSystemSettings();

    // Estado para Configuração de Servidor
    const [showServerSettings, setShowServerSettings] = useState(false);
    const [apiUrl, setApiUrl] = useState('');
    const [aiSource, setAiSource] = useState<'centralized' | 'local'>('centralized');
    const [isTesting, setIsTesting] = useState(false);
    const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);

    // Estado para Configuração de Banco de Dados
    const [configTab, setConfigTab] = useState<'network' | 'database'>('network');
    const [dbEngine, setDbEngine] = useState<'sqlite' | 'postgres'>('sqlite');
    const [dbSqliteName, setDbSqliteName] = useState('tickets.db');
    const [dbPgHost, setDbPgHost] = useState('localhost');
    const [dbPgPort, setDbPgPort] = useState('5432');
    const [dbPgUser, setDbPgUser] = useState('postgres');
    const [dbPgPass, setDbPgPass] = useState('');
    const [dbPgName, setDbPgName] = useState('ticketflow_db');
    const [isConfiguringDb, setIsConfiguringDb] = useState(false);
    const [successNotification, setSuccessNotification] = useState<{ message: string; submessage?: string } | null>(null);

    // Info do Banco Ativo
    interface DBInfo {
        type: 'sqlite' | 'postgresql';
        details: string;
        label: string;
    }
    const [dbInfo, setDbInfo] = useState<DBInfo | null>(null);

    // Verifica conexão proativamente
    const checkInitialConnection = useCallback(async (targetUrl?: string) => {
        let urlToCheck = (targetUrl || apiUrl).trim().replace(/\/$/, "");
        if (urlToCheck && !urlToCheck.startsWith('http')) {
            urlToCheck = `http://${urlToCheck}`;
        }
        try {
            // Tenta um ping leve para validar frontend e banco
            const healthRes = await axios.get<{ status: string, db: string, detail?: string }>(`${urlToCheck}/health`, { timeout: 5000 });

            if (healthRes.data.db === 'error') {
                const detail = healthRes.data.detail || '';
                let friendlyMsg = `Há um erro no banco de dados: ${detail}`;

                if (detail.includes('3D000') || detail.includes('does not exist')) {
                    friendlyMsg = 'O banco de dados configurado não foi encontrado no servidor. Verifique o nome do banco nos Ajustes.';
                } else if (detail.includes('28P01') || detail.includes('password authentication failed')) {
                    friendlyMsg = 'Falha na autenticação do banco de dados. Verifique o usuário e senha nos Ajustes.';
                } else if (detail.includes('is not a database file')) {
                    friendlyMsg = 'O arquivo SQLite selecionado é inválido ou está corrompido.';
                } else if (!detail) {
                    friendlyMsg = 'Não foi possível conectar ao banco de dados. Verifique as configurações nos Ajustes.';
                }

                setError(friendlyMsg);
            } else {
                setError('');
            }

            // Busca Info do Banco se o health check passou ou se pelo menos o servidor respondeu
            try {
                const dbRes = await axios.get(`${urlToCheck}/api/system/db-info`, { timeout: 3000 });
                setDbInfo(dbRes.data);

                // Pre-seleciona o motor ativo
                if (dbRes.data.type === 'postgresql') {
                    setDbEngine('postgres');
                } else {
                    setDbEngine('sqlite');
                }
            } catch (e) {
                console.error("Erro ao buscar db-info:", e);
            }

        } catch (err) {
            // Se for Network Error (servidor offline), já avisa o usuário
            const isNetworkError = !axios.isAxiosError(err) || (!err.response && (err.message === 'Network Error' || (err as any).code === 'ERR_NETWORK'));
            if (isNetworkError) {
                setError('O servidor não responde no endereço configurado. Verifique se o serviço está rodando.');
            }
        }
    }, [apiUrl]);

    // Carrega URL do Servidor inicialmente
    useEffect(() => {
        const localConfig = localStorage.getItem('system_config');
        // Pega a URL dinâmica resolvida (já com migração de porta se necessário)
        const currentUrl = getDynamicApiUrl();

        if (localConfig) {
            try {
                const { aiSource: storedAiSource } = JSON.parse(localConfig);
                if (storedAiSource) {
                    setAiSource(storedAiSource);
                }
            } catch (e) { }
        }
        setApiUrl(currentUrl);
        checkInitialConnection(currentUrl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Executa apenas na montagem do componente para evitar loop com apiUrl

    const handleSaveSettings = () => {
        const localConfig = localStorage.getItem('system_config');
        let currentConfig = {};
        if (localConfig) {
            try { currentConfig = JSON.parse(localConfig); } catch (e) { }
        }

        let normalizedUrl = apiUrl.trim().replace(/\/$/, "");
        if (normalizedUrl && !normalizedUrl.startsWith('http')) {
            normalizedUrl = `http://${normalizedUrl}`;
        }

        const config = {
            ...currentConfig,
            apiUrl: normalizedUrl,
            aiSource: aiSource,
            userConfigured: true // Marca como configuração manual para evitar auto-reversão
        };
        localStorage.setItem('system_config', JSON.stringify(config));
        setShowServerSettings(false);
        setError(''); // Limpa erro anterior se houver
        // Força recarregamento da página para o axios interceptor pegar a nova URL
        window.location.reload();
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestStatus(null);

        let urlToTest = apiUrl.trim().replace(/\/$/, "");
        if (urlToTest && !urlToTest.startsWith('http')) {
            urlToTest = `http://${urlToTest}`;
        }

        try {
            await axios.get(`${urlToTest}/health`, { timeout: 5000 });
            setTestStatus('success');
        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                setTestStatus('success');
            } else {
                setTestStatus('error');
            }
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveDatabase = async () => {
        setIsConfiguringDb(true);
        try {
            const configData = {
                engine: dbEngine,
                sqlite: dbEngine === 'sqlite' ? { dbname: dbSqliteName } : null,
                postgres: dbEngine === 'postgres' ? {
                    host: dbPgHost,
                    port: parseInt(dbPgPort),
                    user: dbPgUser,
                    password: dbPgPass,
                    dbname: dbPgName
                } : null
            };

            const response = await axios.post(`${apiUrl.replace(/\/$/, "")}/api/system/config-db`, configData);

            setSuccessNotification({
                message: response.data.message,
                submessage: "O sistema agora está conectado ao seu novo banco de dados."
            });

            // Auto-hide e recarrega após 3 segundos
            setTimeout(() => {
                setSuccessNotification(null);
                setShowServerSettings(false);
                checkInitialConnection(); // Atualiza o status na tela
            }, 3000);

        } catch (err: any) {
            setError(err.response?.data?.detail || 'Erro ao configurar banco de dados.');
        } finally {
            setIsConfiguringDb(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);

        try {
            await login(username, password);
        } catch (err: any) {
            const isNetworkError = !err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK');
            if (isNetworkError) {
                setError('Não foi possível conectar ao servidor. Verifique o endereço configurado.');
            } else {
                setError(err.response?.data?.detail || 'Credenciais inválidas. Tente novamente.');
            }
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
            {/* Elementos Decorativos de Fundo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-theme/10 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-theme/10 blur-[120px] rounded-full animate-pulse delay-700" />

            {/* Botão de Configuração Flutuante */}
            <button
                onClick={() => setShowServerSettings(true)}
                className="absolute top-8 right-8 p-3 glass-card rounded-2xl text-[var(--color-text-muted)] hover:text-accent-theme hover:scale-110 transition-all z-20 group"
                title="Configurar Servidor"
            >
                <Settings className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            </button>

            <div className="w-full max-w-md p-4 relative z-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="glass-card rounded-[2.5rem] p-10 space-y-10 border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">

                    {/* Header com Branding */}
                    <div className="text-center space-y-6">
                        <div className="inline-flex relative">
                            <div className="absolute -inset-4 bg-accent-theme/20 blur-2xl rounded-full opacity-50 animate-pulse" />
                            <div className="relative w-20 h-20 rounded-[2rem] premium-gradient flex items-center justify-center shadow-2xl shadow-accent-theme/30 group overflow-hidden">
                                {logoUrlOnAccent ? (
                                    <img src={logoUrlOnAccent} alt="Logo" className="w-full h-full object-contain p-4" />
                                ) : (
                                    <Ticket className="w-10 h-10 text-white group-hover:rotate-12 transition-transform duration-500" />
                                )}
                                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-accent-theme animate-bounce" />
                            </div>
                        </div>

                        <div>
                            <h2 className="text-4xl font-black italic tracking-tighter uppercase font-display">
                                {systemName === 'TicketFlow' ? (
                                    <>Ticket<span className="text-accent-theme">Flow</span></>
                                ) : (
                                    systemName
                                )}
                            </h2>
                            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-text-muted)] opacity-80">
                                ERP de Atendimento & Suporte Técnico
                            </p>
                        </div>
                    </div>

                    <form className="space-y-8" onSubmit={handleSubmit}>
                        <div className="space-y-5">
                            {/* Input Usuário */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <UserIcon className="w-3 h-3 opacity-70" /> Usuário de Acesso
                                </label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        required
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/30 transition-all placeholder:text-[var(--color-text-muted)]/30"
                                        placeholder="Seu usuário"
                                    />
                                </div>
                            </div>

                            {/* Input Senha */}
                            <div className="space-y-3">
                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                    <Lock className="w-3 h-3 opacity-70" /> Senha Segura
                                </label>
                                <div className="relative group">
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/30 transition-all placeholder:text-[var(--color-text-muted)]/30"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                <div className="p-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                    {error}
                                </div>
                                {error.includes('conectar') && (
                                    <button
                                        type="button"
                                        onClick={() => setShowServerSettings(true)}
                                        className="w-full p-4 border border-accent-theme/30 rounded-2xl text-[9px] font-black uppercase tracking-widest text-accent-theme hover:bg-accent-theme/10 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Globe className="w-4 h-4" />
                                        Configurar Caminho do Servidor
                                    </button>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoggingIn}
                            className="w-full group relative flex items-center justify-center gap-4 py-6 px-4 premium-gradient rounded-2xl text-white font-black text-[12px] uppercase tracking-[0.3em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isLoggingIn ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    AUTENTICAR ACESSO
                                </>
                            )}
                        </button>
                    </form>

                </div>

                <p className="text-center mt-10 text-[9px] font-black uppercase tracking-[0.4em] text-[var(--color-text-muted)] opacity-30">
                    © 2026 TicketFlow System | LAN Secured
                </p>
            </div>

            {/* Notificação de Sucesso Integrada */}
            {successNotification && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="glass-card !bg-green-500/10 border-green-500/20 p-6 rounded-[2rem] shadow-2xl flex items-center gap-4">
                        <div className="p-3 bg-green-500/20 rounded-2xl text-green-500">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div>
                            <h4 className="text-[11px] font-black uppercase tracking-widest text-green-500">Sucesso</h4>
                            <p className="text-xs font-bold text-foreground/90 leading-tight mt-1">{successNotification.message}</p>
                            {successNotification.submessage && (
                                <p className="text-[10px] text-green-500/60 mt-1 font-medium italic">{successNotification.submessage}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Configuração de Servidor */}
            {showServerSettings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-md glass-card rounded-[2.5rem] p-8 border-white/10 shadow-2xl relative">
                        <button
                            onClick={() => setShowServerSettings(false)}
                            className="absolute top-6 right-6 p-2 text-[var(--color-text-muted)] hover:text-foreground transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="space-y-6">
                            <div className="flex items-center gap-3 text-accent-theme">
                                <div className="p-2.5 bg-accent-theme/10 rounded-xl">
                                    <Settings className="w-6 h-6" />
                                </div>
                                <h3 className="text-2xl font-black font-display tracking-tight italic uppercase text-foreground">Ajustes do <span className="text-accent-theme">Sistema</span></h3>
                            </div>

                            {/* Tabs Internas */}
                            <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                                <button
                                    onClick={() => setConfigTab('network')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${configTab === 'network' ? 'bg-accent-theme/20 text-accent-theme' : 'text-[var(--color-text-muted)] hover:bg-white/5'}`}
                                >
                                    Conexão
                                </button>
                                <button
                                    onClick={() => setConfigTab('database')}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${configTab === 'database' ? 'bg-accent-theme/20 text-accent-theme' : 'text-[var(--color-text-muted)] hover:bg-white/5'}`}
                                >
                                    Banco de Dados
                                </button>
                            </div>

                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                                {configTab === 'network' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                Endereço do Backend (URL)
                                            </label>
                                            <input
                                                type="text"
                                                value={apiUrl}
                                                onChange={(e) => setApiUrl(e.target.value)}
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/30 transition-all"
                                                placeholder="http://192.168.0.10:8080"
                                            />
                                            <p className="text-[9px] text-[var(--color-text-muted)] italic px-1 pt-1">
                                                IP do servidor onde o backend está rodando.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                Fonte do Processamento de IA
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setAiSource('centralized')}
                                                    className={`p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${aiSource === 'centralized'
                                                        ? 'bg-accent-theme/20 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10'
                                                        : 'bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    IA do Servidor
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAiSource('local')}
                                                    className={`p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${aiSource === 'local'
                                                        ? 'bg-accent-theme/20 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10'
                                                        : 'bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    IA Local (PC)
                                                </button>
                                            </div>
                                            <p className="text-[8px] text-[var(--color-text-muted)] italic px-1 leading-tight">
                                                Escolha 'Servidor' para usar a placa de vídeo do servidor principal, economizando recursos desta máquina.
                                            </p>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleTestConnection}
                                                disabled={isTesting}
                                                className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${testStatus === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-500' :
                                                    testStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-500' :
                                                        'bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10'
                                                    }`}
                                            >
                                                {isTesting ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : testStatus === 'success' ? (
                                                    <ShieldCheck className="w-4 h-4" />
                                                ) : testStatus === 'error' ? (
                                                    <AlertCircle className="w-4 h-4" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4" />
                                                )}
                                                {isTesting ? 'Testando...' : testStatus === 'success' ? 'Conectado' : testStatus === 'error' ? 'Falhou' : 'Testar'}
                                            </button>

                                            <button
                                                onClick={handleSaveSettings}
                                                className="flex-[1.5] flex items-center justify-center gap-2 py-4 premium-gradient rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-accent-theme/20 hover:brightness-110 active:scale-95 transition-all"
                                            >
                                                <Save className="w-4 h-4" />
                                                Salvar Rede
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                                        {/* Informativo de Banco Ativo */}
                                        {dbInfo && (
                                            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl animate-in fade-in zoom-in-95 duration-500">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Database className="w-3.5 h-3.5 text-accent-theme" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Banco em Uso</span>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider ${dbInfo.type === 'postgresql' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/10 text-green-400'
                                                        }`}>
                                                        {dbInfo.type === 'postgresql' ? 'PostgreSQL' : 'SQLite'}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-bold text-foreground/70 break-all leading-tight font-mono">
                                                    {dbInfo.details}
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                Motor de Banco de Dados
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setDbEngine('sqlite')}
                                                    className={`p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${dbEngine === 'sqlite'
                                                        ? 'bg-accent-theme/20 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10'
                                                        : 'bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    SQLite (Local)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDbEngine('postgres')}
                                                    className={`p-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${dbEngine === 'postgres'
                                                        ? 'bg-accent-theme/20 border-accent-theme text-accent-theme shadow-lg shadow-accent-theme/10'
                                                        : 'bg-white/5 border-white/10 text-[var(--color-text-muted)] hover:bg-white/10'
                                                        }`}
                                                >
                                                    PostgreSQL
                                                </button>
                                            </div>
                                        </div>

                                        {dbEngine === 'sqlite' ? (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">
                                                    Nome do Arquivo (.db)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={dbSqliteName}
                                                    onChange={(e) => setDbSqliteName(e.target.value)}
                                                    className="w-full bg-background/50 border border-border-theme rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-mono"
                                                    placeholder="tickets.db"
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="col-span-2 space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Host/IP</label>
                                                        <input value={dbPgHost} onChange={e => setDbPgHost(e.target.value)} className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-[12px] font-bold" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Porta</label>
                                                        <input value={dbPgPort} onChange={e => setDbPgPort(e.target.value)} className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-[12px] font-bold" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Usuário</label>
                                                        <input value={dbPgUser} onChange={e => setDbPgUser(e.target.value)} className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-[12px] font-bold" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Senha</label>
                                                        <input type="password" value={dbPgPass} onChange={e => setDbPgPass(e.target.value)} className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-[12px] font-bold" />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] ml-1">Nome do Banco</label>
                                                    <input value={dbPgName} onChange={e => setDbPgName(e.target.value)} className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-[12px] font-bold" />
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleSaveDatabase}
                                            disabled={isConfiguringDb}
                                            className="w-full group relative flex items-center justify-center gap-3 py-5 premium-gradient rounded-2xl text-white font-black text-[11px] uppercase tracking-[0.25em] shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            {isConfiguringDb ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <>
                                                    <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                                    Gravar Configuração
                                                </>
                                            )}
                                        </button>
                                        <p className="text-[7px] text-[var(--color-text-muted)] uppercase tracking-widest text-center leading-relaxed opacity-60">
                                            ⚠️ A troca do banco não migra dados automaticamente entre motores.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
