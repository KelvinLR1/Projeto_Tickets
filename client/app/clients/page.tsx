'use client';

import React, { useEffect, useState } from 'react';
import { getClients, createClient, updateClient, deleteClient, importClientsExcel, importClientsDB, Client } from '@/lib/api';
import { useNotification } from '@/components/NotificationProvider';
import { useAuth } from '@/components/AuthProvider';
import { UserPlus, Search, Mail, Phone, Calendar, Trash2, Pencil, X, Save, Loader2, User, Upload, Database, Server, FileSpreadsheet, ChevronDown, CheckCircle2, AlertCircle, Filter, Eraser, MapPin, Hash, Plus, Package, Briefcase } from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { ClientRowSkeleton } from '@/components/Skeleton';
import Pagination from '@/components/Pagination';
import { getClientsCount } from '@/lib/api';
import clsx from 'clsx';

// --- Constants ---
const TAX_REGIME_OPTIONS = [
    { value: '', label: 'Não informado', subtitle: 'Indefinido' },
    { value: 'Simples Nacional', label: 'Simples Nacional', subtitle: 'Regime Simplificado' },
    { value: 'Lucro Presumido', label: 'Lucro Presumido', subtitle: 'Tributação Simplificada' },
    { value: 'Lucro Real', label: 'Lucro Real', subtitle: 'Tributação sobre o lucro' },
    { value: 'MEI', label: 'MEI', subtitle: 'Microempreendedor Individual' },
];

const UF_OPTIONS = [
    { value: 'AC', label: 'Acre (AC)' }, { value: 'AL', label: 'Alagoas (AL)' },
    { value: 'AP', label: 'Amapá (AP)' }, { value: 'AM', label: 'Amazonas (AM)' },
    { value: 'BA', label: 'Bahia (BA)' }, { value: 'CE', label: 'Ceará (CE)' },
    { value: 'DF', label: 'Distrito Federal (DF)' }, { value: 'ES', label: 'Espírito Santo (ES)' },
    { value: 'GO', label: 'Goiás (GO)' }, { value: 'MA', label: 'Maranhão (MA)' },
    { value: 'MT', label: 'Mato Grosso (MT)' }, { value: 'MS', label: 'Mato Grosso do Sul (MS)' },
    { value: 'MG', label: 'Minas Gerais (MG)' }, { value: 'PA', label: 'Pará (PA)' },
    { value: 'PB', label: 'Paraíba (PB)' }, { value: 'PR', label: 'Paraná (PR)' },
    { value: 'PE', label: 'Pernambuco (PE)' }, { value: 'PI', label: 'Piauí (PI)' },
    { value: 'RJ', label: 'Rio de Janeiro (RJ)' }, { value: 'RN', label: 'Rio Grande do Norte (RN)' },
    { value: 'RS', label: 'Rio Grande do Sul (RS)' }, { value: 'RO', label: 'Rondônia (RO)' },
    { value: 'RR', label: 'Roraima (RR)' }, { value: 'SC', label: 'Santa Catarina (SC)' },
    { value: 'SP', label: 'São Paulo (SP)' }, { value: 'SE', label: 'Sergipe (SE)' },
    { value: 'TO', label: 'Tocantins (TO)' },
];

const DB_ENGINE_OPTIONS = [
    { value: 'mysql', label: 'MySQL / MariaDB', icon: <Database className="w-4 h-4" /> },
    { value: 'postgresql', label: 'PostgreSQL', icon: <Database className="w-4 h-4" /> },
    { value: 'sqlserver', label: 'SQL Server (MSSQL)', icon: <Server className="w-4 h-4" /> },
];

export default function ClientsPage() {
    const { user } = useAuth();
    const { showNotification, confirm: askConfirm } = useNotification();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [actionId, setActionId] = useState<number | null>(null);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    const [formData, setFormData] = useState<{
        name: string;
        nickname: string;
        email: string;
        cpf_cnpj: string;
        phone: string;
        cep: string;
        city: string;
        uf: string;
        street: string;
        number: string;
        complement: string;
        neighborhood: string;
        state_registration: string;
        tax_regime: string;
        extra_contacts: { type: 'phone' | 'email', value: string }[];
        contracted_items: { name: string, description: string }[];
    }>({
        name: '',
        nickname: '',
        email: '',
        cpf_cnpj: '',
        phone: '',
        cep: '',
        city: '',
        uf: '',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        state_registration: '',
        tax_regime: '',
        extra_contacts: [],
        contracted_items: []
    });
    const [isSearchingCNPJ, setIsSearchingCNPJ] = useState(false);

    // Advanced Filter states
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        docType: 'all', // all, cpf, cnpj
        hasPhone: 'all' // all, yes, no
    });

    // Import states
    const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [isDBModalOpen, setIsDBModalOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any>(null);

    const [dbConfig, setDbConfig] = useState({
        db_type: 'mysql',
        host: 'localhost',
        port: 3306,
        user: '',
        password: '',
        database: '',
        table: '',
        mapping: { name: 'name', email: 'email', cpf_cnpj: 'cpf_cnpj', phone: 'phone' }
    });

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filters]);

    useEffect(() => {
        if (user) {
            loadClients();
        }
    }, [currentPage, pageSize, user, searchTerm, filters]);

    const loadClients = async () => {
        setLoading(true);
        try {
            const [data, countData] = await Promise.all([
                getClients(
                    (currentPage - 1) * pageSize,
                    pageSize,
                    searchTerm,
                    filters.docType === 'all' ? undefined : filters.docType,
                    filters.hasPhone === 'all' ? undefined : filters.hasPhone,
                    filters.startDate || undefined,
                    filters.endDate || undefined
                ),
                getClientsCount(
                    searchTerm,
                    filters.docType === 'all' ? undefined : filters.docType,
                    filters.hasPhone === 'all' ? undefined : filters.hasPhone,
                    filters.startDate || undefined,
                    filters.endDate || undefined
                )
            ]);
            setClients(data);
            setTotalCount(countData.count);
        } catch (error) {
            showNotification('Erro ao carregar clientes', 'error');
        } finally {
            setLoading(false);
        }
    };

    const formatCPFCNPJ = (value: string) => {
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 11) {
            // CPF: 000.000.000-00
            return digits
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        } else {
            // CNPJ: 00.000.000/0000-00
            return digits
                .replace(/(\d{2})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1/$2')
                .replace(/(\d{4})(\d{1,2})/, '$1-$2')
                .replace(/(-\d{2})\d+?$/, '$1');
        }
    };

    const handleOpenModal = (client: Client | null = null) => {
        if (client) {
            setEditingClient(client);
            setFormData({
                name: client.name,
                nickname: client.nickname || '',
                email: client.email,
                cpf_cnpj: client.cpf_cnpj || '',
                phone: client.phone || '',
                cep: client.cep || '',
                city: client.city || '',
                uf: client.uf || '',
                street: client.street || '',
                number: client.number || '',
                complement: client.complement || '',
                neighborhood: client.neighborhood || '',
                state_registration: client.state_registration || '',
                tax_regime: client.tax_regime || '',
                extra_contacts: client.extra_contacts || [],
                contracted_items: client.contracted_items || []
            });
        } else {
            setEditingClient(null);
            setFormData({
                name: '',
                nickname: '',
                email: '',
                cpf_cnpj: '',
                phone: '',
                cep: '',
                city: '',
                uf: '',
                street: '',
                number: '',
                complement: '',
                neighborhood: '',
                state_registration: '',
                tax_regime: '',
                extra_contacts: [],
                contracted_items: []
            });
        }
        setIsModalOpen(true);
    };

    const handleCNPJLookup = async () => {
        const cnpj = formData.cpf_cnpj.replace(/\D/g, '');
        if (cnpj.length !== 14) {
            showNotification('O CNPJ deve ter 14 dígitos para a busca', 'warning');
            return;
        }

        if (typeof window !== 'undefined' && !window.navigator.onLine) {
            showNotification('Falha de conexão: Verifique sua internet', 'error');
            return;
        }

        setIsSearchingCNPJ(true);
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('CNPJ não encontrado na base do governo');
                }
                throw new Error('Erro ao consultar API do governo');
            }

            const data = await response.json();

            setFormData(prev => ({
                ...prev,
                name: data.razao_social || prev.name,
                nickname: data.nome_fantasia || prev.nickname,
                email: data.email || prev.email,
                phone: data.ddd_telefone_1 || prev.phone,
                cep: data.cep || prev.cep,
                city: data.municipio || prev.city,
                uf: data.uf || prev.uf,
                street: data.logradouro || prev.street,
                neighborhood: data.bairro || prev.neighborhood,
                number: data.numero || prev.number,
                complement: data.complemento || prev.complement,
            }));

            showNotification('Dados importados com sucesso!', 'success');
        } catch (error: any) {
            showNotification(error.message || 'Erro ao buscar dados do CNPJ', 'error');
        } finally {
            setIsSearchingCNPJ(false);
        }
    };

    const addContact = () => {
        setFormData(prev => ({
            ...prev,
            extra_contacts: [...prev.extra_contacts, { type: 'phone', value: '' }]
        }));
    };

    const removeContact = (index: number) => {
        setFormData(prev => ({
            ...prev,
            extra_contacts: prev.extra_contacts.filter((_, i) => i !== index)
        }));
    };

    const updateContact = (index: number, field: 'type' | 'value', val: string) => {
        setFormData(prev => ({
            ...prev,
            extra_contacts: prev.extra_contacts.map((c, i) => i === index ? { ...c, [field]: val } : c)
        }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            contracted_items: [...prev.contracted_items, { name: '', description: '' }]
        }));
    };

    const removeItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            contracted_items: prev.contracted_items.filter((_, i) => i !== index)
        }));
    };

    const updateItem = (index: number, field: 'name' | 'description', val: string) => {
        setFormData(prev => ({
            ...prev,
            contracted_items: prev.contracted_items.map((it, i) => i === index ? { ...it, [field]: val } : it)
        }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.cpf_cnpj) {
            showNotification('Nome e CPF/CNPJ são obrigatórios', 'warning');
            return;
        }

        setLoading(true);
        try {
            if (editingClient) {
                await updateClient(editingClient.id, formData);
                showNotification('Cliente atualizado!', 'success');
            } else {
                await createClient(formData);
                showNotification('Cliente cadastrado!', 'success');
            }
            setIsModalOpen(false);
            loadClients();
        } catch (error: any) {
            const message = error.response?.data?.detail || 'Erro ao salvar cliente';
            showNotification(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        const confirmed = await askConfirm({
            title: 'Excluir Cliente',
            message: 'Tem certeza que deseja remover este cliente? Tickets vinculados podem ser afetados.',
            type: 'danger',
            confirmText: 'Remover'
        });

        if (confirmed) {
            setActionId(id);
            try {
                await deleteClient(id);
                setClients(clients.filter(c => c.id !== id));
                showNotification('Cliente removido', 'success');
            } catch (error) {
                showNotification('Erro ao remover cliente', 'error');
            } finally {
                setActionId(null);
            }
        }
    };

    // Client-side filtering removed in favor of server-side filtering
    const filteredClients = clients;

    const clearFilters = () => {
        setFilters({
            startDate: '',
            endDate: '',
            docType: 'all',
            hasPhone: 'all'
        });
        setSearchTerm('');
    };

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportResult(null);
        try {
            const result = await importClientsExcel(file);
            setImportResult(result);
            showNotification(`Sucesso: ${result.imported} clientes importados.`, 'success');
            loadClients();
        } catch (error: any) {
            showNotification(error.response?.data?.detail || 'Erro na importação Excel', 'error');
        } finally {
            setImporting(false);
        }
    };

    const handleDBImport = async (e: React.FormEvent) => {
        e.preventDefault();
        setImporting(true);
        setImportResult(null);
        try {
            const result = await importClientsDB(dbConfig);
            setImportResult(result);
            showNotification(`Sucesso: ${result.imported} clientes importados do banco externo.`, 'success');
            loadClients();
        } catch (error: any) {
            showNotification(error.response?.data?.detail || 'Erro na conexão/importação DB', 'error');
        } finally {
            setImporting(false);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-10">

                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Gestão de <span className="text-accent-theme">Clientes</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">Administre sua base de solicitantes e contatos estratégicos.</p>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        <div className="relative">
                            <button
                                onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
                                className="flex items-center justify-center gap-3 px-8 py-5 rounded-2xl border border-border-theme bg-background/50 text-foreground font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white/5 transition-all group"
                            >
                                <Upload className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
                                IMPORTAR
                                <ChevronDown className={clsx("w-4 h-4 transition-transform", isImportMenuOpen && "rotate-180")} />
                            </button>

                            <AnimatePresence>
                                {isImportMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                        className="absolute top-full right-0 mt-4 w-64 glass-card rounded-2xl border border-border-theme shadow-2xl z-50 overflow-hidden"
                                    >
                                        <button
                                            onClick={() => { setIsExcelModalOpen(true); setIsImportMenuOpen(false); }}
                                            className="w-full flex items-center gap-4 px-6 py-5 hover:bg-white/5 transition-all text-left group"
                                        >
                                            <FileSpreadsheet className="w-5 h-5 text-green-500" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase tracking-widest">Excel / CSV</span>
                                                <span className="text-[9px] text-[var(--color-text-muted)] font-bold">Arquivos locais</span>
                                            </div>
                                        </button>
                                        <div className="h-px bg-border-theme/30" />
                                        <button
                                            onClick={() => { setIsDBModalOpen(true); setIsImportMenuOpen(false); }}
                                            className="w-full flex items-center gap-4 px-6 py-5 hover:bg-white/5 transition-all text-left group"
                                        >
                                            <Database className="w-5 h-5 text-blue-500" />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black uppercase tracking-widest">Base Externa</span>
                                                <span className="text-[9px] text-[var(--color-text-muted)] font-bold">SQL Server, MySQL, PG</span>
                                            </div>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                        >
                            <UserPlus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                            NOVO CLIENTE
                        </button>
                    </div>
                </div>

                {/* Filters and Search */}
                <div className="glass-card p-6 rounded-3xl border border-border-theme shadow-2xl relative overflow-hidden group">
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-accent-theme" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, email ou documento..."
                                className="w-full bg-background/50 border border-border-theme rounded-2xl pl-14 pr-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-4 w-full md:w-auto">
                            <button
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className={clsx(
                                    "flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest",
                                    showAdvancedFilters
                                        ? "bg-accent-theme border-accent-theme text-white shadow-lg shadow-accent-theme/20"
                                        : "bg-background/50 border-border-theme text-[var(--color-text-muted)] hover:bg-white/5"
                                )}
                            >
                                <Filter className="w-4 h-4" />
                                Filtros Avançados
                            </button>
                            {(searchTerm || filters.startDate || filters.endDate || filters.docType !== 'all' || filters.hasPhone !== 'all') && (
                                <button
                                    onClick={clearFilters}
                                    className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all"
                                    title="Limpar todos os filtros"
                                >
                                    <Eraser className="w-4 h-4" />
                                    Limpar
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Advanced Filters Panel */}
                    <AnimatePresence>
                        {showAdvancedFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="overflow-hidden"
                            >
                                <div className="mt-8 pt-8 border-t border-border-theme/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Data Inicial</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-theme/50" />
                                            <input
                                                type="date"
                                                className="w-full bg-background/50 border border-border-theme rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none"
                                                value={filters.startDate}
                                                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Data Final</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-theme/50" />
                                            <input
                                                type="date"
                                                className="w-full bg-background/50 border border-border-theme rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none"
                                                value={filters.endDate}
                                                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Tipo de Documento</label>
                                        <select
                                            className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-xs font-bold focus:outline-none appearance-none"
                                            value={filters.docType}
                                            onChange={(e) => setFilters({ ...filters, docType: e.target.value })}
                                        >
                                            <option value="all">Todos os tipos</option>
                                            <option value="cpf">Apenas CPF</option>
                                            <option value="cnpj">Apenas CNPJ</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Contato Telefônico</label>
                                        <select
                                            className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-xs font-bold focus:outline-none appearance-none"
                                            value={filters.hasPhone}
                                            onChange={(e) => setFilters({ ...filters, hasPhone: e.target.value })}
                                        >
                                            <option value="all">Todos os registros</option>
                                            <option value="yes">Apenas com telefone</option>
                                            <option value="no">Sem telefone</option>
                                        </select>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Content Area with Loading Logic */}
                <div className="min-h-[400px]">
                    <AnimatePresence mode="wait">
                        {loading && clients.length === 0 ? (
                            <motion.div
                                key="loading-skeletons"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="glass-card rounded-[2.5rem] border border-border-theme overflow-hidden shadow-2xl"
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead className="bg-background/20 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] border-b border-border-theme">
                                            <tr>
                                                <th className="px-8 py-6">Parceiro / Cliente</th>
                                                <th className="px-8 py-6 hidden md:table-cell">Identificação</th>
                                                <th className="px-8 py-6 hidden md:table-cell">Comunicação</th>
                                                <th className="px-8 py-6 hidden lg:table-cell">Integração</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-theme/30">
                                            {[1, 2, 3, 4, 5].map(i => <ClientRowSkeleton key={i} />)}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                animate={{ opacity: loading ? 0.5 : 1, filter: loading ? 'blur(2px)' : 'blur(0px)' }}
                                transition={{ duration: 0.2 }}
                                className="relative"
                            >
                                <div className="glass-card rounded-[2.5rem] border border-border-theme overflow-hidden shadow-2xl transition-all duration-500">
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead className="bg-background/20 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] border-b border-border-theme">
                                                <tr>
                                                    <th className="px-8 py-6">Parceiro / Cliente</th>
                                                    <th className="px-8 py-6 hidden md:table-cell">Identificação</th>
                                                    <th className="px-8 py-6 hidden md:table-cell">Comunicação</th>
                                                    <th className="px-8 py-6 hidden lg:table-cell">Integração</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-theme/30">
                                                {filteredClients.map((client) => (
                                                    <tr
                                                        key={client.id}
                                                        className="group hover:bg-background/50 transition-all duration-300 cursor-default"
                                                    >
                                                        <td className="px-8 py-5">
                                                            <div
                                                                className="flex items-center gap-5 cursor-pointer group/name"
                                                                onClick={() => handleOpenModal(client)}
                                                            >
                                                                <div className="w-12 h-12 rounded-[1rem] bg-accent-theme/10 flex items-center justify-center text-accent-theme group-hover/name:scale-110 transition-transform flex-shrink-0 shadow-inner border border-accent-theme/10">
                                                                    <User className="w-6 h-6" />
                                                                </div>
                                                                <div>
                                                                    <div className="font-black text-foreground group-hover/name:text-accent-theme transition-colors font-display uppercase tracking-tight italic">{client.name}</div>
                                                                    <div className="text-[10px] text-[var(--color-text-muted)] md:hidden font-mono">#{client.id} | {client.cpf_cnpj}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 hidden md:table-cell">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="text-[12px] font-black font-mono text-accent-theme/80">{client.cpf_cnpj}</div>
                                                                <div className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">Documento ID</div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 hidden md:table-cell">
                                                            <div className="flex flex-col gap-1.5">
                                                                <div className="flex items-center gap-3 text-foreground font-bold text-[13px]">
                                                                    <Mail className="w-3.5 h-3.5 text-accent-theme/60" />
                                                                    {client.email}
                                                                </div>
                                                                {client.phone && (
                                                                    <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)] font-medium">
                                                                        <Phone className="w-3 h-3" />
                                                                        {client.phone}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 hidden lg:table-cell">
                                                            <div className="flex items-center gap-3 text-[var(--color-text-muted)] font-mono text-[11px] uppercase tracking-widest">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                                {client.created_at ? new Date(client.created_at).toLocaleDateString() : 'LEGACY'}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}

                                                {filteredClients.length === 0 && !loading && (
                                                    <tr>
                                                        <td colSpan={5} className="py-24 text-center">
                                                            <div className="w-24 h-24 bg-background/30 rounded-full mx-auto flex items-center justify-center border border-border-theme shadow-inner opacity-20 mb-6 group-hover:scale-110 transition-transform">
                                                                <User className="w-12 h-12" />
                                                            </div>
                                                            <p className="text-[var(--color-text-muted)] text-sm font-medium italic">Nenhum parceiro encontrado nos registros.</p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Loading Overlay */}
                                    <AnimatePresence>
                                        {loading && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 z-10 flex items-center justify-center bg-background/10 backdrop-blur-[1px]"
                                            >
                                                <div className="bg-background/80 p-4 rounded-2xl shadow-2xl border border-border-theme flex items-center gap-3">
                                                    <Loader2 className="w-5 h-5 animate-spin text-accent-theme" />
                                                    <span className="text-xs font-black uppercase tracking-widest text-[var(--color-text-muted)]">Carregando...</span>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {!loading && totalCount > 0 && (
                                    <div className="mt-8 px-2">
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={Math.ceil(totalCount / pageSize)}
                                            onPageChange={(page) => {
                                                setLoading(true); // Start loading state
                                                // Do NOT clear clients here to prevent layout collapse
                                                setCurrentPage(page);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            totalCount={totalCount}
                                            pageSize={pageSize}
                                        />
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Modal de Cadastro/Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="glass-card w-full max-w-5xl rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 text-foreground relative group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform pointer-events-none">
                            <UserPlus className="w-20 h-20 text-accent-theme" />
                        </div>

                        <form onSubmit={handleSave} className="relative">
                            <div className="p-10 border-b border-white/5 flex justify-between items-center bg-background/30">
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tighter italic font-display">
                                        {editingClient ? 'Sincronizar' : 'Novo'} <span className="text-accent-theme">Parceiro</span>
                                    </h3>
                                    <p className="text-[10px] text-[var(--color-text-muted)] font-black uppercase tracking-[0.2em] mt-1">Expansão da rede de contatos estratégicos</p>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-white/5 rounded-2xl transition-all text-[var(--color-text-muted)] hover:text-foreground">
                                    <X className="w-7 h-7" />
                                </button>
                            </div>

                            <div className="p-10 space-y-12 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                {/* Seção: Identificação */}
                                <div className="space-y-6">
                                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-accent-theme border-b border-border-theme pb-2">
                                        <User className="w-4 h-4" /> Identificação
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Razão Social / Nome Completo</label>
                                            <input
                                                type="text"
                                                required
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Ex: Empresa de Tecnologia Ltda"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Nome Fantasia / Apelido</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Ex: TechFlow"
                                                value={formData.nickname}
                                                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Documento (CPF / CNPJ)</label>
                                            <div className="relative group/input">
                                                <input
                                                    type="text"
                                                    required
                                                    className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold pr-14"
                                                    placeholder="00.000.000/0001-00"
                                                    value={formData.cpf_cnpj}
                                                    onChange={(e) => setFormData({ ...formData, cpf_cnpj: formatCPFCNPJ(e.target.value) })}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleCNPJLookup}
                                                    disabled={isSearchingCNPJ || formData.cpf_cnpj.replace(/\D/g, '').length !== 14}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-accent-theme/10 text-accent-theme hover:bg-accent-theme hover:text-white transition-all disabled:opacity-30"
                                                >
                                                    {isSearchingCNPJ ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Inscrição Estadual</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Ex: 123.456.789.110"
                                                value={formData.state_registration}
                                                onChange={(e) => setFormData({ ...formData, state_registration: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-0">
                                            <CustomSelect
                                                label="Regime Tributário"
                                                value={formData.tax_regime}
                                                onChange={(val) => setFormData({ ...formData, tax_regime: val })}
                                                options={TAX_REGIME_OPTIONS}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Seção: Endereço */}
                                <div className="space-y-6">
                                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-accent-theme border-b border-border-theme pb-2">
                                        <MapPin className="w-4 h-4" /> Localização / Endereço
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">CEP</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="00000-000"
                                                value={formData.cep}
                                                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Logradouro (Rua/Av)</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Rua das Flores"
                                                value={formData.street}
                                                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Número</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="123"
                                                value={formData.number}
                                                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Complemento</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Sala 101"
                                                value={formData.complement}
                                                onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Bairro</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="Centro"
                                                value={formData.neighborhood}
                                                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Cidade</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="São Paulo"
                                                value={formData.city}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-0">
                                            <CustomSelect
                                                label="UF"
                                                value={formData.uf}
                                                onChange={(val) => setFormData({ ...formData, uf: val })}
                                                options={UF_OPTIONS}
                                                placeholder="Estado"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Seção: Contatos */}
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center border-b border-border-theme pb-2">
                                        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-accent-theme">
                                            <Mail className="w-4 h-4" /> Canais de Comunicação
                                        </h4>
                                        <button type="button" onClick={addContact} className="flex items-center gap-2 text-[10px] font-black text-accent-theme hover:brightness-125 transition-all uppercase tracking-widest bg-accent-theme/5 px-3 py-1.5 rounded-lg border border-accent-theme/10">
                                            <Plus className="w-3.5 h-3.5" /> Adicionar Contato
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">E-mail Principal</label>
                                            <input
                                                type="email"
                                                required
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="contato@empresa.com"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Telefone Principal</label>
                                            <input
                                                type="text"
                                                className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                placeholder="(00) 00000-0000"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {formData.extra_contacts.map((contact, idx) => (
                                            <div key={idx} className="flex gap-4 items-end animate-in slide-in-from-left-4 duration-300">
                                                <div className="w-32">
                                                    <select
                                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-4 py-4 text-xs font-bold focus:outline-none"
                                                        value={contact.type}
                                                        onChange={(e) => updateContact(idx, 'type', e.target.value as any)}
                                                    >
                                                        <option value="phone">Telefone</option>
                                                        <option value="email">E-mail</option>
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold"
                                                        placeholder={contact.type === 'email' ? 'outro@email.com' : '(00) 0000-0000'}
                                                        value={contact.value}
                                                        onChange={(e) => updateContact(idx, 'value', e.target.value)}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeContact(idx)}
                                                    className="p-4 bg-red-500/5 text-red-500 border border-red-500/10 rounded-2xl hover:bg-red-500/10 transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Seção: Contratos / Serviços */}
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center border-b border-border-theme pb-2">
                                        <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-accent-theme">
                                            <Package className="w-4 h-4" /> Serviços / Produtos Contratados
                                        </h4>
                                        <button type="button" onClick={addItem} className="flex items-center gap-2 text-[10px] font-black text-accent-theme hover:brightness-125 transition-all uppercase tracking-widest bg-accent-theme/5 px-3 py-1.5 rounded-lg border border-accent-theme/10">
                                            <Plus className="w-3.5 h-3.5" /> Adicionar Item
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        {formData.contracted_items.map((item, idx) => (
                                            <div key={idx} className="bg-white/[0.02] border border-white/5 p-6 rounded-[2rem] space-y-4 animate-in slide-in-from-right-4 duration-300 relative group/item">
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(idx)}
                                                    className="absolute top-4 right-4 p-2 text-red-500/50 hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                                <div className="space-y-3">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Nome do Serviço/Produto</label>
                                                    <input
                                                        type="text"
                                                        className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-sm font-bold focus:outline-none"
                                                        placeholder="Ex: Consultoria Semanal"
                                                        value={item.name}
                                                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Descrição / Observação</label>
                                                    <textarea
                                                        className="w-full bg-background/50 border border-border-theme rounded-xl px-4 py-3 text-sm font-bold focus:outline-none h-20 resize-none"
                                                        placeholder="Detalhes sobre o contrato..."
                                                        value={item.description}
                                                        onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        {formData.contracted_items.length === 0 && (
                                            <div className="text-center py-10 bg-background/20 rounded-[2rem] border border-dashed border-border-theme/30">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Nenhum serviço registrado</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-10 bg-background/30 border-t border-white/5 flex gap-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-8 py-5 rounded-2xl border border-border-theme text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95"
                                >
                                    DESISTIR
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-accent-theme text-white font-black text-[10px] uppercase tracking-[0.2em] hover:brightness-110 transition-all shadow-2xl shadow-accent-theme/20 disabled:opacity-50 active:scale-95"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    {editingClient ? 'PERSISTIR ALTERAÇÕES' : 'EFETIVAR REGISTRO'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Excel */}
            {isExcelModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="glass-card w-full max-w-2xl rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 text-foreground relative">
                        <div className="p-10 border-b border-white/5 flex justify-between items-center bg-background/30">
                            <h3 className="text-2xl font-black uppercase tracking-tighter italic font-display">
                                Importar <span className="text-accent-theme">Excel / CSV</span>
                            </h3>
                            <button onClick={() => { setIsExcelModalOpen(false); setImportResult(null); }} className="p-3 hover:bg-white/5 rounded-2xl transition-all text-[var(--color-text-muted)] hover:text-foreground">
                                <X className="w-7 h-7" />
                            </button>
                        </div>

                        <div className="p-10 space-y-8">
                            {!importResult ? (
                                <div className="space-y-6">
                                    <div className="border-2 border-dashed border-border-theme rounded-[2rem] p-12 text-center hover:border-accent-theme/50 transition-all group flex flex-col items-center gap-4 relative">
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls,.csv"
                                            onChange={handleExcelImport}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            disabled={importing}
                                        />
                                        <div className="w-20 h-20 bg-accent-theme/10 rounded-full flex items-center justify-center text-accent-theme group-hover:scale-110 transition-transform">
                                            {importing ? <Loader2 className="w-10 h-10 animate-spin" /> : <Upload className="w-10 h-10" />}
                                        </div>
                                        <div>
                                            <p className="font-black text-sm uppercase tracking-widest leading-relaxed">Clique ou arraste o arquivo</p>
                                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold mt-1 uppercase tracking-wider">Suporta .xlsx, .xls e .csv</p>
                                        </div>
                                    </div>

                                    {/* Guia de Colunas */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Estrutura de Colunas Obrigatória</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {[
                                                { label: 'name', desc: 'Nome Completo', req: true },
                                                { label: 'email', desc: 'E-mail Corporativo', req: true },
                                                { label: 'cpf_cnpj', desc: 'CPF ou CNPJ (X.XXX...)', req: true },
                                                { label: 'phone', desc: 'Telefone de Contato', req: false },
                                            ].map((col, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all">
                                                    <div className="flex flex-col">
                                                        <span className="text-[11px] font-mono font-black text-accent-theme forced-colors:text-accent-theme">{col.label}</span>
                                                        <span className="text-[9px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">{col.desc}</span>
                                                    </div>
                                                    {col.req ? (
                                                        <span className="px-2 py-0.5 bg-accent-theme/10 text-accent-theme text-[8px] font-black rounded-lg uppercase border border-accent-theme/20">REQUERIDO</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-white/5 text-[var(--color-text-muted)] text-[8px] font-black rounded-lg uppercase border border-white/5">OPCIONAL</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="p-4 bg-accent-theme/5 border border-accent-theme/10 rounded-2xl flex items-start gap-3">
                                            <AlertCircle className="w-4 h-4 text-accent-theme shrink-0 mt-0.5" />
                                            <p className="text-[9px] text-accent-theme/80 font-bold uppercase tracking-wide leading-relaxed">
                                                Certifique-se de que a primeira linha contém exatamente os nomes acima. O CPF/CNPJ é usado para evitar duplicatas.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-background/40 p-5 rounded-2xl border border-border-theme text-center">
                                            <div className="text-2xl font-black font-display italic">{importResult.total}</div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Total</div>
                                        </div>
                                        <div className="bg-green-500/10 p-5 rounded-2xl border border-green-500/20 text-center">
                                            <div className="text-2xl font-black font-display italic text-green-500">{importResult.imported}</div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-green-500">Importados</div>
                                        </div>
                                        <div className="bg-orange-500/10 p-5 rounded-2xl border border-orange-500/20 text-center">
                                            <div className="text-2xl font-black font-display italic text-orange-500">{importResult.duplicates}</div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-orange-500">Duplicados</div>
                                        </div>
                                    </div>

                                    {importResult.errors.length > 0 && (
                                        <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/20 space-y-3 max-h-40 overflow-y-auto custom-scrollbar">
                                            <div className="flex items-center gap-2 text-red-500 font-black text-[10px] uppercase tracking-widest">
                                                <AlertCircle className="w-4 h-4" /> Falhas registradas:
                                            </div>
                                            {importResult.errors.map((err: string, i: number) => (
                                                <div key={i} className="text-[10px] text-red-500/80 font-mono leading-relaxed">{err}</div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => { setIsExcelModalOpen(false); setImportResult(null); }}
                                        className="w-full py-5 rounded-2xl bg-foreground text-background font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95"
                                    >
                                        CONCLUIR OPERAÇÃO
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal DB */}
            {isDBModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="glass-card w-full max-w-2xl rounded-[2.5rem] border border-border-theme shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 text-foreground relative">
                        <div className="p-10 border-b border-white/5 flex justify-between items-center bg-background/30">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter italic font-display">
                                    Extração de <span className="text-accent-theme">Bases Externas</span>
                                </h3>
                                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-[0.2em] mt-1">Conexão direta com ERPs e Bancos Legados</p>
                            </div>
                            <button onClick={() => { setIsDBModalOpen(false); setImportResult(null); }} className="p-3 hover:bg-white/5 rounded-2xl transition-all text-[var(--color-text-muted)] hover:text-foreground">
                                <X className="w-7 h-7" />
                            </button>
                        </div>

                        {!importResult ? (
                            <form onSubmit={handleDBImport} className="p-10 space-y-8">
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-0">
                                        <CustomSelect
                                            label="Motor do Banco"
                                            value={dbConfig.db_type}
                                            onChange={(val) => setDbConfig({ ...dbConfig, db_type: val })}
                                            options={DB_ENGINE_OPTIONS}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Server Host</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none"
                                            value={dbConfig.host}
                                            onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Usuário</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none"
                                            value={dbConfig.user}
                                            onChange={(e) => setDbConfig({ ...dbConfig, user: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Senha</label>
                                        <input
                                            type="password"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none"
                                            value={dbConfig.password}
                                            onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Database</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none"
                                            value={dbConfig.database}
                                            onChange={(e) => setDbConfig({ ...dbConfig, database: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Nome da Tabela</label>
                                        <input
                                            type="text"
                                            className="w-full bg-background/50 border border-border-theme rounded-2xl px-6 py-5 text-sm font-bold focus:outline-none"
                                            placeholder="ex: tb_clientes"
                                            value={dbConfig.table}
                                            onChange={(e) => setDbConfig({ ...dbConfig, table: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="p-10 bg-background/30 border-t border-white/5 flex gap-6 mt-10 -mx-10 -mb-10">
                                    <button
                                        type="button"
                                        onClick={() => setIsDBModalOpen(false)}
                                        className="flex-1 px-8 py-5 rounded-2xl border border-border-theme text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all text-[var(--color-text-muted)] hover:text-foreground"
                                    >
                                        CANCELAR
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={importing}
                                        className="flex-1 flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-accent-theme text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                                        INICIAR EXTRAÇÃO
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="p-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex items-center gap-4 p-8 bg-green-500/10 border border-green-500/20 rounded-3xl">
                                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                                    <div>
                                        <h4 className="text-xl font-black uppercase tracking-tight italic">Extração Concluída</h4>
                                        <p className="text-[10px] text-green-500/70 font-bold uppercase tracking-widest">A sincronização com o banco externo foi finalizada.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="bg-background/40 p-6 rounded-2xl border border-border-theme text-center">
                                        <div className="text-3xl font-black font-display italic">{importResult.total}</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Extraídos</div>
                                    </div>
                                    <div className="bg-green-500/10 p-6 rounded-2xl border border-green-500/20 text-center">
                                        <div className="text-3xl font-black font-display italic text-green-500">{importResult.imported}</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-green-500">Novos</div>
                                    </div>
                                    <div className="bg-orange-500/10 p-6 rounded-2xl border border-orange-500/20 text-center">
                                        <div className="text-3xl font-black font-display italic text-orange-500">{importResult.duplicates}</div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-orange-500">Já Existiam</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { setIsDBModalOpen(false); setImportResult(null); }}
                                    className="w-full py-6 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95"
                                >
                                    VOLTAR PARA GESTÃO
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
