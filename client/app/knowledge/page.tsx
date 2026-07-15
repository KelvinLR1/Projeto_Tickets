'use client';

import React, { useEffect, useState } from 'react';
import { getKnowledge, createKnowledge, updateKnowledge, deleteKnowledge, KnowledgeDocument } from '@/lib/api';
import { BookOpen, Plus, Loader2, ArrowLeft, Save, X, Edit2, Trash2, Search, Filter, Calendar, Hash, Tag as TagIcon, ChevronDown, Book, FileText, Layout, HardDrive, Cpu } from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import Link from 'next/link';
import clsx from 'clsx';

export default function KnowledgePage() {
    const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingDocId, setEditingDocId] = useState<number | null>(null);
    const [newDoc, setNewDoc] = useState({ title: '', content: '', category: 'Manual' });
    const [saving, setSaving] = useState(false);

    // Estados de Filtro
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('Todos');
    const [filterDate, setFilterDate] = useState('Todos');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        fetchDocs();
    }, []);

    const fetchDocs = async () => {
        try {
            const data = await getKnowledge();
            setDocs(data);
        } catch (error) {
            console.error("Erro ao carregar documentos:", error);
        } finally {
            setLoading(false);
        }
    };

    // Lógica de Filtragem Orgânica
    const filteredDocs = docs.filter(doc => {
        const matchesSearch =
            doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            doc.id.toString() === searchTerm;

        const matchesCategory = filterCategory === 'Todos' || doc.category === filterCategory;

        let matchesDate = true;
        if (filterDate !== 'Todos') {
            const docDate = new Date(doc.created_at);
            const now = new Date();
            if (filterDate === 'Hoje') {
                matchesDate = docDate.toDateString() === now.toDateString();
            } else if (filterDate === 'Semana') {
                const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                matchesDate = docDate >= lastWeek;
            } else if (filterDate === 'Mes') {
                const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                matchesDate = docDate >= lastMonth;
            }
        }

        return matchesSearch && matchesCategory && matchesDate;
    });

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDoc.title || !newDoc.content) return;

        setSaving(true);
        try {
            if (editingDocId) {
                await updateKnowledge(editingDocId, newDoc);
            } else {
                await createKnowledge(newDoc);
            }
            setNewDoc({ title: '', content: '', category: 'Manual' });
            setShowForm(false);
            setEditingDocId(null);
            fetchDocs();
        } catch (error: any) {
            console.error("Erro completo:", error);
            const msg = error.response?.data?.detail || error.message || "Erro desconhecido";
            alert(`Erro ao salvar: ${msg}`);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (doc: KnowledgeDocument) => {
        setNewDoc({ title: doc.title, content: doc.content, category: doc.category || 'Manual' });
        setEditingDocId(doc.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Tem certeza que deseja excluir este documento?")) return;

        try {
            await deleteKnowledge(id);
            fetchDocs();
        } catch (error) {
            alert("Erro ao excluir documento.");
        }
    };

    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="w-full space-y-12">
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Base de <span className="text-accent-theme">Conhecimento</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">Gerencie manuais técnicos para treinar o cérebro da IA.</p>
                    </div>

                    <button
                        onClick={() => {
                            setShowForm(!showForm);
                            if (showForm) setEditingDocId(null);
                        }}
                        className="flex items-center justify-center gap-3 px-10 py-5 rounded-2xl premium-gradient text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-accent-theme/20 hover:brightness-110 transition-all active:scale-95"
                    >
                        {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />}
                        {showForm ? 'CANCELAR OPERAÇÃO' : 'ADICIONAR DOCUMENTO'}
                    </button>
                </div>

                {/* Search and Filters Bar */}
                {!showForm && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative group">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-muted)] group-focus-within:text-accent-theme transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Buscar por título, conteúdo ou ID (#123)..."
                                    className="w-full bg-card/50 border border-border-theme rounded-[2rem] pl-16 pr-6 py-6 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all shadow-xl placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={clsx(
                                    "flex items-center gap-3 px-8 py-6 rounded-[2rem] border transition-all font-black text-[10px] uppercase tracking-widest",
                                    showFilters ? "bg-accent-theme text-white border-accent-theme" : "bg-card/50 border-border-theme text-[var(--color-text-muted)] hover:bg-card hover:text-foreground"
                                )}
                            >
                                <Filter className="w-4 h-4" />
                                {showFilters ? 'FECHAR FILTROS' : 'MAIS FILTROS'}
                            </button>
                        </div>

                        {showFilters && (
                            <div className="glass-card p-8 rounded-[2.5rem] border border-border-theme grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-6">
                                    <CustomSelect
                                        label="Categoria"
                                        value={filterCategory}
                                        onChange={setFilterCategory}
                                        icon={<TagIcon className="w-3 h-3" />}
                                        options={[
                                            { value: 'Todos', label: 'Todas as Categorias', icon: <Layout className="w-4 h-4" /> },
                                            { value: 'Manual', label: 'Manuais Técnicos', icon: <Book className="w-4 h-4" /> },
                                            { value: 'FAQ', label: 'FAQs / Perguntas', icon: <FileText className="w-4 h-4" /> },
                                            { value: 'Tutorial', label: 'Tutorial Passo-a-Passo', icon: <Layout className="w-4 h-4" /> },
                                            { value: 'Hardware', label: 'Hardware / Equipamentos', icon: <Cpu className="w-4 h-4" /> },
                                            { value: 'Software', label: 'Software / Sistemas', icon: <Layout className="w-4 h-4" /> },
                                        ]}
                                    />
                                </div>

                                <div className="space-y-6">
                                    <CustomSelect
                                        label="Período"
                                        value={filterDate}
                                        onChange={setFilterDate}
                                        icon={<Calendar className="w-3 h-3" />}
                                        options={[
                                            { value: 'Todos', label: 'Todo o Tempo' },
                                            { value: 'Hoje', label: 'Hoje' },
                                            { value: 'Semana', label: 'Últimos 7 dias' },
                                            { value: 'Mes', label: 'Últimos 30 dias' },
                                        ]}
                                    />
                                </div>

                                <div className="flex items-end pb-1">
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setFilterCategory('Todos');
                                            setFilterDate('Todos');
                                        }}
                                        className="w-full flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 p-4 transition-colors"
                                    >
                                        Limpar Filtros
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Form to Add/Edit Document */}
                {showForm && (
                    <div className="glass-card p-10 rounded-[2.5rem] border border-border-theme shadow-2xl animate-in slide-in-from-top-6 duration-500 space-y-8 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                            <BookOpen className="w-16 h-16 text-accent-theme" />
                        </div>

                        <h2 className="text-2xl font-black font-display uppercase tracking-tight italic relative">
                            {editingDocId ? 'Atualizar' : 'Novo'} <span className="text-accent-theme">Documento</span>
                        </h2>

                        <form onSubmit={handleSave} className="space-y-8 relative">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Título do Documento</label>
                                    <input
                                        type="text"
                                        className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                        placeholder="Ex: Manual de Configuração de Impressoras"
                                        value={newDoc.title}
                                        onChange={e => setNewDoc({ ...newDoc, title: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <CustomSelect
                                        label="Categoria Técnica"
                                        value={newDoc.category}
                                        onChange={val => setNewDoc({ ...newDoc, category: val })}
                                        options={[
                                            { value: 'Manual', label: 'Manual Técnico', icon: <Book className="w-4 h-4" /> },
                                            { value: 'FAQ', label: 'FAQ / Perguntas', icon: <FileText className="w-4 h-4" /> },
                                            { value: 'Tutorial', label: 'Tutorial Passo-a-Passo', icon: <Layout className="w-4 h-4" /> },
                                            { value: 'Hardware', label: 'Hardware / Equipamentos', icon: <Cpu className="w-4 h-4" /> },
                                            { value: 'Software', label: 'Software / Sistemas', icon: <Layout className="w-4 h-4" /> },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-muted)] ml-1">Conteúdo do Conhecimento</label>
                                <textarea
                                    className="w-full bg-background/50 border border-border-theme rounded-2xl p-4 text-sm focus:outline-none focus:ring-4 focus:ring-accent-theme/10 min-h-[220px] transition-all font-bold placeholder:text-[var(--color-text-muted)] placeholder:font-normal"
                                    placeholder="Descreva aqui os detalhes técnicos, passos de resolução, etc..."
                                    value={newDoc.content}
                                    onChange={e => setNewDoc({ ...newDoc, content: e.target.value })}
                                    required
                                ></textarea>
                            </div>

                            <div className="flex justify-end gap-4 pt-4">
                                {editingDocId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowForm(false);
                                            setEditingDocId(null);
                                            setNewDoc({ title: '', content: '', category: 'Manual' });
                                        }}
                                        className="px-8 py-4 rounded-2xl border border-border-theme text-[10px] font-black uppercase tracking-widest hover:bg-card transition-all active:scale-95 shadow-sm"
                                    >
                                        Cancelar
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] disabled:opacity-50 transition-all shadow-2xl shadow-emerald-500/20 active:scale-95"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    {editingDocId ? 'ATUALIZAR REGISTRO' : 'SALVAR NA BASE IA'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Documents List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4">
                        <Loader2 className="w-12 h-12 animate-spin text-accent-theme opacity-20" />
                        <p className="text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-widest animate-pulse">Indexando Conhecimento...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {filteredDocs.length === 0 ? (
                            <div className="col-span-2 glass-card p-24 text-center rounded-[2.5rem] border border-border-theme border-dashed">
                                <BookOpen className="w-12 h-12 mx-auto text-[var(--color-text-muted)] opacity-20 mb-4" />
                                <p className="text-[var(--color-text-muted)] text-sm font-medium">Nenhum documento encontrado para estes critérios.</p>
                                <button
                                    onClick={() => { setSearchTerm(''); setFilterCategory('Todos'); setFilterDate('Todos'); }}
                                    className="mt-6 text-accent-theme text-[10px] font-black uppercase tracking-widest hover:underline"
                                >
                                    Limpar todos os filtros
                                </button>
                            </div>
                        ) : (
                            filteredDocs.map(doc => (
                                <div key={doc.id} className="glass-card p-8 rounded-[2rem] border border-border-theme hover:border-accent-theme/50 transition-all duration-500 group relative overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1">
                                    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                                        <BookOpen className="w-12 h-12 text-accent-theme" />
                                    </div>

                                    <div className="flex items-start justify-between mb-6">
                                        <div className="bg-accent-theme/10 p-3 rounded-2xl text-accent-theme shadow-inner border border-accent-theme/20 group-hover:scale-110 transition-transform">
                                            <BookOpen className="w-6 h-6" />
                                        </div>
                                        <div className="flex gap-2 relative z-10">
                                            <button
                                                onClick={() => handleEdit(doc)}
                                                className="p-3 bg-background/50 hover:bg-accent-theme/10 rounded-xl text-[var(--color-text-muted)] hover:text-accent-theme transition-all"
                                                title="Editar"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(doc.id)}
                                                className="p-3 bg-background/50 hover:bg-red-500/10 rounded-xl text-[var(--color-text-muted)] hover:text-red-500 transition-all"
                                                title="Excluir"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black px-3 py-1.5 rounded-full bg-accent-theme/5 text-accent-theme border border-accent-theme/10 uppercase tracking-widest">
                                                {doc.category}
                                            </span>
                                            <span className="text-[9px] font-black px-3 py-1.5 rounded-full bg-blue-500/5 text-blue-500 border border-blue-500/10 uppercase tracking-widest">
                                                ID: #{doc.id}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-black font-display uppercase tracking-tight italic group-hover:text-accent-theme transition-colors">{doc.title}</h3>
                                        <p className="text-[var(--color-text-muted)] text-sm leading-relaxed line-clamp-3 font-medium">{doc.content}</p>
                                    </div>

                                    <div className="mt-8 pt-6 border-t border-border-theme/30 flex items-center justify-between">
                                        <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-widest flex items-center gap-1.5">
                                            <Hash className="w-3 h-3" /> ref_knw_{doc.id}
                                        </div>
                                        <div className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase tracking-widest flex items-center gap-1.5">
                                            <Calendar className="w-3 h-3" /> {new Date(doc.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
