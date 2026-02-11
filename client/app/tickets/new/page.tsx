'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Sparkles, Image as ImageIcon, CheckCircle2, User, Mail, Phone, ChevronDown, Tag, Eye, Edit2, Paperclip, Circle, Clock, AlertOctagon } from 'lucide-react';
import Link from 'next/link';
import { createTicket, getCategories, getClients, Category, Client } from '@/lib/api';
import { chatWithOllama } from '@/lib/ollama';
import { useNotification } from '@/components/NotificationProvider';
import CustomSelect from '@/components/CustomSelect';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

export default function NewTicket() {
    const router = useRouter();
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [aiGenerating, setAiGenerating] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [aiImage, setAiImage] = useState<string | null>(null);
    const [config, setConfig] = useState({ textModel: 'phi3', visionModel: 'moondream' });
    const [categories, setCategories] = useState<Category[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [isAiActive, setIsAiActive] = useState(false);
    const [isClosingModal, setIsClosingModal] = useState(false);
    const [showClientResults, setShowClientResults] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDescriptionPreview, setIsDescriptionPreview] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const descriptionRef = React.useRef<HTMLTextAreaElement>(null);

    const closeAiModal = () => {
        setIsClosingModal(true);
    };

    React.useEffect(() => {
        const localConfig = localStorage.getItem('system_config');
        if (localConfig) {
            setConfig(JSON.parse(localConfig));
        }
        loadCategories();
        loadClients();
    }, []);

    const loadClients = async () => {
        try {
            const data = await getClients();
            setClients(data);
        } catch (error) {
            console.error('Error fetching clients:', error);
        }
    };

    const loadCategories = async () => {
        try {
            const data = await getCategories();
            setCategories(data);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
    };

    // Ticket Form States
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priority: 'Média',
        client_name: '',
        category_id: undefined as number | undefined
    });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.client_name) {
            showNotification('Por favor, identifique o cliente solicitante.', 'warning');
            return;
        }

        if (!formData.title || !formData.description) {
            showNotification('Por favor, preencha o título e a descrição.', 'warning');
            return;
        }

        setLoading(true);
        try {
            await createTicket(formData);
            showNotification('Ticket criado com sucesso!', 'success');
            router.push('/tickets');
        } catch (error) {
            console.error(error);
            showNotification('Erro ao criar ticket.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setAiImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleDescriptionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadingImage(true);
            const formDataUpload = new FormData();
            formDataUpload.append('file', file);

            try {
                const response = await axios.post('http://localhost:8000/upload/', formDataUpload);
                const imageUrl = response.data.url;
                const markdownImage = `\n![img](${imageUrl})\n`;

                // Inserir no cursor ou no final
                const textarea = descriptionRef.current;
                if (textarea) {
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const val = formData.description;
                    const newVal = val.substring(0, start) + markdownImage + val.substring(end);
                    setFormData({ ...formData, description: newVal });
                } else {
                    setFormData({ ...formData, description: formData.description + markdownImage });
                }

                showNotification('Imagem inserida na descrição!', 'success');
            } catch (error) {
                console.error('Upload error:', error);
                showNotification('Erro ao fazer upload da imagem.', 'error');
            } finally {
                setUploadingImage(false);
                // Reset input
                e.target.value = '';
            }
        }
    };

    const generateWithAI = async () => {
        if (!aiInput.trim() && !aiImage) {
            showNotification('Forneça um histórico de conversa ou uma imagem do erro.', 'info');
            return;
        }

        setAiGenerating(true);
        try {
            const prompt = `Extraction Task:
Analyze the following context (chat log or error image description) and extract the key information to create a technical support ticket.
Return the result in JSON format with exactly these fields: "title", "description", "priority" (Baixa, Média, Alta), "category".

CONTEXT:
${aiInput || "Visual error from image"}

Note: Be concise in the title and detailed in the description.`;

            let extractedText = "";
            const targetModel = aiImage ? config.visionModel : config.textModel;
            const history = [{ role: 'user', content: prompt, images: aiImage ? [aiImage] : undefined }];

            await chatWithOllama(targetModel, history, (chunk) => {
                extractedText += chunk;
            });

            const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[0]);
                setFormData({
                    ...formData,
                    title: data.title || '',
                    description: data.description || '',
                    priority: data.priority || 'Média',
                    category_id: undefined
                });
            } else {
                setFormData({
                    ...formData,
                    description: extractedText
                });
            }
            closeAiModal(); // Fecha o modal com animação após preencher
        } catch (error) {
            console.error(error);
            showNotification('IA falhou na extração. Tente digitar manualmente.', 'error');
        } finally {
            setAiGenerating(false);
        }
    };

    const filteredClients = clients.filter(c => {
        const searchLower = searchTerm.toLowerCase();
        const searchClean = searchTerm.replace(/\D/g, '');
        const docClean = c.cpf_cnpj?.replace(/\D/g, '') || '';

        return c.name.toLowerCase().includes(searchLower) ||
            c.email.toLowerCase().includes(searchLower) ||
            (searchClean !== '' && docClean.includes(searchClean)) ||
            (c.cpf_cnpj && c.cpf_cnpj.toLowerCase().includes(searchLower));
    });

    const selectClient = (client: Client) => {
        setFormData({ ...formData, client_name: client.name });
        setSelectedClient(client);
        setSearchTerm(client.name);
        setShowClientResults(false);
    };

    const handleSearchChange = (val: string) => {
        setSearchTerm(val);
        setFormData({ ...formData, client_name: val });
        setShowClientResults(true);

        const searchClean = val.replace(/\D/g, '');
        const found = clients.find(c => {
            const docClean = c.cpf_cnpj?.replace(/\D/g, '') || '';
            return c.name.toLowerCase() === val.toLowerCase() ||
                (searchClean !== '' && docClean === searchClean);
        });
        setSelectedClient(found || null);
    };

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="max-w-7xl mx-auto space-y-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <Link href="/tickets" className="text-accent-theme flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:underline mb-4">
                            <ArrowLeft className="w-3 h-3" />
                            Voltar para chamados
                        </Link>
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Novo <span className="text-accent-theme">Chamado</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium">Preencha os dados técnicos do problema abaixo.</p>
                    </div>

                    <button
                        onClick={() => setIsAiActive(true)}
                        className={clsx(
                            "group flex items-center gap-3 px-8 py-5 rounded-2xl border transition-all text-[10px] font-black uppercase tracking-widest active:scale-95",
                            isAiActive
                                ? "bg-accent-theme border-accent-theme text-white shadow-2xl shadow-accent-theme/20"
                                : "bg-background/50 border-border-theme text-[var(--color-text-muted)] hover:bg-white/5"
                        )}
                    >
                        <Sparkles className={clsx("w-4 h-4 transition-transform group-hover:rotate-12", isAiActive && "animate-pulse")} />
                        USAR ASSISTENTE IA
                    </button>
                </div>

                {/* Grid Principal: 70/30 */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-10">

                    {/* Modal Overlay: Assistente IA */}
                    {(isAiActive || isClosingModal) && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
                            <div
                                className={clsx(
                                    "absolute inset-0 bg-background/40 backdrop-blur-md",
                                    isClosingModal ? "animate-fade-out" : "animate-fade-in"
                                )}
                                onClick={closeAiModal}
                            />

                            <div
                                className={clsx(
                                    "glass-card w-full max-w-2xl p-10 rounded-[2.5rem] border border-border-theme shadow-[0_0_100px_rgba(var(--accent-rgb),0.1)] space-y-8 relative overflow-hidden group transition-all duration-300",
                                    isClosingModal ? "animate-modal-out" : "animate-modal-in"
                                )}
                                onAnimationEnd={(e) => {
                                    if (e.animationName === 'modal-out') {
                                        setIsClosingModal(false);
                                        setIsAiActive(false);
                                    }
                                }}
                            >
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                                    <Sparkles className="w-16 h-16 text-accent-theme" />
                                </div>

                                <div className="flex items-center justify-between relative">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-accent-theme/10 rounded-2xl text-accent-theme shadow-inner border border-accent-theme/20">
                                            <Sparkles className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-black font-display uppercase tracking-tight italic">Assistente <span className="text-accent-theme">IA</span></h2>
                                    </div>
                                    <button
                                        onClick={closeAiModal}
                                        className="p-3 hover:bg-white/5 rounded-xl text-[var(--color-text-muted)] hover:text-foreground transition-all"
                                    >
                                        <ArrowLeft className="w-5 h-5 rotate-90" />
                                    </button>
                                </div>

                                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed relative">
                                    Cole aqui a conversa ou anexe um print. Nossa IA vai extrair automaticamente os detalhes técnicos e preencher o formulário para você.
                                </p>

                                <div className="space-y-6 relative">
                                    <textarea
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl p-5 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[220px] transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                        placeholder="Cole o histórico da conversa aqui..."
                                        value={aiInput}
                                        onChange={(e) => setAiInput(e.target.value)}
                                    />

                                    <div className="flex flex-col sm:flex-row items-center gap-4">
                                        <label className="flex-1 w-full cursor-pointer flex items-center justify-center gap-3 p-4 bg-background/50 hover:bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-border-theme border-dashed transition-all group/upload">
                                            <ImageIcon className="w-5 h-5 text-[var(--color-text-muted)] group-hover:text-accent-theme transition-colors" />
                                            <span>{aiImage ? 'Imagem Carregada' : 'Anexar Print do Erro'}</span>
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                                        </label>
                                        {aiImage && (
                                            <button onClick={() => setAiImage(null)} className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline px-4">Remover Anexo</button>
                                        )}
                                    </div>

                                    <button
                                        onClick={generateWithAI}
                                        disabled={aiGenerating || (!aiInput.trim() && !aiImage)}
                                        className="w-full flex items-center justify-center gap-3 py-6 premium-gradient text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                                    >
                                        {aiGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                        {aiGenerating ? 'ANALISANDO CONTEXTO...' : 'PROCESSAR E PREENCHER TICKET'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Coluna 1: Formulário do Ticket */}
                    <form onSubmit={handleSave} className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl space-y-10 relative overflow-hidden group transition-all duration-500">
                        {aiGenerating && (
                            <div className="absolute inset-0 bg-background/60 backdrop-blur-md z-20 flex items-center justify-center">
                                <div className="bg-card/80 p-6 rounded-3xl border border-accent-theme/30 flex items-center gap-4 shadow-2xl animate-pulse">
                                    <Loader2 className="w-6 h-6 animate-spin text-accent-theme" />
                                    <span className="text-xs font-black uppercase tracking-widest text-foreground">AI working...</span>
                                </div>
                            </div>
                        )}

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme ml-1 flex items-center gap-2">
                                    Identificação do Cliente
                                    <span className="text-[8px] bg-accent-theme/10 px-2 py-0.5 rounded-lg border border-accent-theme/20">OBRIGATÓRIO</span>
                                </label>
                                <div className="relative group/search">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-theme/50 group-focus-within/search:text-accent-theme transition-colors z-10">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <input
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                        placeholder="Busque pelo nome, e-mail ou documento..."
                                        value={searchTerm}
                                        onChange={(e) => handleSearchChange(e.target.value)}
                                        onFocus={() => setShowClientResults(true)}
                                        required
                                    />

                                    {showClientResults && searchTerm && (
                                        <div className="absolute top-full left-0 w-full mt-2 bg-card/95 backdrop-blur-xl border border-border-theme rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                                {filteredClients.length > 0 ? (
                                                    filteredClients.map(c => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => selectClient(c)}
                                                            className="w-full flex items-center justify-between p-4 hover:bg-accent-theme/10 rounded-xl transition-all group/item text-left border border-transparent hover:border-accent-theme/20"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-accent-theme/10 flex items-center justify-center text-[10px] font-black text-accent-theme">
                                                                    {c.name.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs font-bold text-foreground group-hover/item:text-accent-theme transition-colors italic">{c.name}</div>
                                                                    <div className="text-[9px] text-[var(--color-text-muted)] font-mono">{c.email}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-[8px] font-black text-accent-theme/50 uppercase tracking-widest">{c.cpf_cnpj}</div>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-8 text-center">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] opacity-50">Nenhum cliente encontrado</div>
                                                        <p className="text-[9px] text-[var(--color-text-muted)]/50 uppercase mt-1">Verifique a ortografia ou cadastre um novo cliente.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {showClientResults && (
                                    <div className="fixed inset-0 z-40" onClick={() => setShowClientResults(false)} />
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Título do Chamado</label>
                                <input
                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                    type="text"
                                    placeholder="Ex: Falha no módulo de faturamento"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            <CustomSelect
                                label="Prioridade"
                                value={formData.priority}
                                onChange={val => setFormData({ ...formData, priority: val })}
                                options={[
                                    { value: 'Baixa', label: 'Baixa', icon: <Circle className="w-4 h-4 text-emerald-500" /> },
                                    { value: 'Média', label: 'Média', icon: <Circle className="w-4 h-4 text-accent-theme" /> },
                                    { value: 'Alta', label: 'Alta', icon: <Circle className="w-4 h-4 text-orange-500" /> },
                                    { value: 'Crítica', label: 'Crítica', icon: <AlertOctagon className="w-4 h-4 text-red-500" /> },
                                ]}
                            />

                            <CustomSelect
                                label="Categoria Técnica"
                                value={formData.category_id || ''}
                                onChange={val => setFormData({ ...formData, category_id: val ? parseInt(val) : undefined })}
                                placeholder="Selecione categoria..."
                                options={categories.flatMap(cat => [
                                    { value: cat.id, label: cat.name, icon: <Tag className="w-4 h-4" /> },
                                    ...(cat.subcategories?.map(sub => ({
                                        value: sub.id,
                                        label: sub.name,
                                        icon: <Tag className="w-3 h-3 ml-2" />,
                                        className: "pl-8 opacity-80"
                                    })) || [])
                                ])}
                            />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Descrição Técnica Detalhada</label>
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setIsDescriptionPreview(!isDescriptionPreview)}
                                            className="text-[9px] font-black uppercase tracking-widest text-accent-theme hover:brightness-125 transition-all flex items-center gap-1.5"
                                        >
                                            {isDescriptionPreview ? <Edit2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                            {isDescriptionPreview ? 'EDITAR' : 'PREVIEW'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => document.getElementById('desc-image-upload')?.click()}
                                            disabled={uploadingImage}
                                            className="text-[9px] font-black uppercase tracking-widest text-accent-theme hover:brightness-125 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                                            {uploadingImage ? 'ENVIANDO...' : 'ANEXAR IMAGEM'}
                                        </button>
                                        <input
                                            id="desc-image-upload"
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleDescriptionImageUpload}
                                        />
                                    </div>
                                </div>

                                {isDescriptionPreview ? (
                                    <div className="w-full bg-background/30 border border-border-theme rounded-2xl p-6 min-h-[140px] prose prose-sm prose-invert max-w-none overflow-auto custom-scrollbar">
                                        <ReactMarkdown>{formData.description || '*Nenhuma descrição fornecida...*'}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <textarea
                                        ref={descriptionRef}
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[140px] transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                        placeholder="Descreva o problema com detalhes técnicos ou passos para reproduzir..."
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    />
                                )}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-3 py-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all shadow-2xl shadow-emerald-500/20 active:scale-95"
                        >
                            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                            {loading ? 'PROCESSANDO...' : 'FINALIZAR E CRIAR CHAMADO'}
                        </button>
                    </form>

                    {/* Coluna 2: Status/Infos do Cliente */}
                    <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                        {selectedClient ? (
                            <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl space-y-8 relative overflow-hidden">
                                <div className="flex flex-col items-center text-center gap-4">
                                    <div className="w-24 h-24 rounded-[2rem] bg-accent-theme/10 border border-accent-theme/20 flex items-center justify-center text-3xl font-black font-display text-accent-theme shadow-inner">
                                        {selectedClient.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black font-display uppercase italic">{selectedClient.name}</h3>
                                        <p className="text-[10px] font-bold text-accent-theme uppercase tracking-[0.2em] mt-1">Parceiro VIP</p>
                                    </div>
                                </div>

                                <div className="space-y-4 pt-6 border-t border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white/5 rounded-xl text-[var(--color-text-muted)]">
                                            <Mail className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">E-mail</div>
                                            <div className="text-xs font-bold text-foreground">{selectedClient.email}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white/5 rounded-xl text-[var(--color-text-muted)]">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">CPF / CNPJ</div>
                                            <div className="text-xs font-bold font-mono text-accent-theme">{selectedClient.cpf_cnpj || 'Não Informado'}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-white/5 rounded-xl text-[var(--color-text-muted)]">
                                            <Phone className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Telefone</div>
                                            <div className="text-xs font-bold text-foreground">{selectedClient.phone || 'Nenhum contato'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-accent-theme/5 border border-accent-theme/10 rounded-3xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="w-2 h-2 bg-accent-theme animate-pulse rounded-full" />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-accent-theme">Snapshot de Suporte</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-relaxed italic">
                                        "Este cliente possui 3 chamados ativos. Recomendamos atenção prioritária."
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme border-dashed bg-background/20 flex flex-col items-center justify-center text-center gap-4 h-full min-h-[400px]">
                                <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-[var(--color-text-muted)] opacity-30">
                                    <User className="w-10 h-10" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Aguardando Seleção</p>
                                    <p className="text-[9px] font-medium text-[var(--color-text-muted)]/50 uppercase mt-2 max-w-[180px]">Selecione um cliente para visualizar o perfil técnico aqui.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
