'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { chatWithOllama } from '@/lib/ollama';
import { searchKnowledge } from '@/lib/api';
import Link from 'next/link';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    images?: string[];
    originalContent?: string;
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState({ textModel: 'phi3', visionModel: 'moondream' });
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        const localConfig = localStorage.getItem('system_config');
        if (localConfig) {
            setConfig(JSON.parse(localConfig));
        }
    }, []);

    const handleSend = async () => {
        if (!input.trim() && !selectedImage) return;

        let finalContent = input;
        if (selectedImage) {
            finalContent = `Using the provided image, answer the following question: "${input}".`;
        }

        const userMessage: Message = {
            role: 'user',
            content: finalContent,
            images: selectedImage ? [selectedImage] : undefined,
            originalContent: input
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setSelectedImage(null);
        setLoading(true);

        let responseBuffer = "";
        let lastRenderTime = 0;
        const RENDER_INTERVAL = 50;

        try {
            let knowledgeContext = "";
            try {
                const queryForSearch = userMessage.originalContent || input;
                const searchResults = await searchKnowledge(queryForSearch);

                if (searchResults && searchResults.documents && searchResults.documents[0]?.length > 0) {
                    knowledgeContext = searchResults.documents[0].map((doc: string, i: number) => {
                        const title = searchResults.metadatas?.[0]?.[i]?.title || "Documento";
                        return `[ARQUIVO: ${title}]\nCONTEÚDO: ${doc}`;
                    }).join("\n\n---\n\n");
                }
            } catch (e) {
                console.warn("Busca na base de conhecimento falhou.");
            }

            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            const systemContent = 'Você é um assistente técnico direto. Responda em pt-BR. Seja extremamente conciso. NÃO use saudações. Vá direto ao ponto.';

            const history = messages.slice(-4).map(m => ({
                role: m.role,
                content: m.content,
                images: m.images,
            }));

            history.unshift({
                role: 'system' as any,
                content: systemContent,
                images: undefined
            });

            let userPromptWithContext = userMessage.content;
            if (knowledgeContext) {
                userPromptWithContext = `CONTEXTO:\n${knowledgeContext}\n\nPERGUNTA: ${userMessage.content}\n\nResponda de forma curta e técnica usando o contexto acima.`;
            } else {
                userPromptWithContext = `${userMessage.content}\n\n(Responda de forma curta e direta)`;
            }

            const hasImage = !!userMessage.images;

            history.push({
                role: userMessage.role,
                content: userPromptWithContext,
                images: userMessage.images
            });

            const targetModel = hasImage ? config.visionModel : config.textModel;

            await chatWithOllama(targetModel, history, (chunk) => {
                responseBuffer += chunk;
                const now = Date.now();
                if (now - lastRenderTime > RENDER_INTERVAL) {
                    setMessages((prev) => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1].content = responseBuffer;
                        return newMsgs;
                    });
                    lastRenderTime = now;
                }
            });

            setMessages((prev) => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = responseBuffer;
                return newMsgs;
            });

        } catch (error) {
            console.error(error);
            setMessages((prev) => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA local.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setSelectedImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="w-full space-y-8 animate-in fade-in duration-700">
            {/* Chat Container */}
            <div className="flex flex-col h-[700px] glass-card rounded-[2.5rem] overflow-hidden shadow-2xl transition-all border-border-theme relative">
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar" ref={scrollRef}>
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-6">
                            <div className="p-6 bg-accent-theme/10 rounded-[2rem] shadow-inner border border-accent-theme/20 animate-pulse">
                                <BookOpen className="w-16 h-16 text-accent-theme" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-black font-display uppercase italic tracking-tight">Sincronização Ativa</h3>
                                <p className="text-xs font-medium max-w-xs mx-auto text-[var(--color-text-muted)] uppercase tracking-widest">Olá! Sou sua IA de suporte. Pronto para analisar sua base de conhecimento agora.</p>
                            </div>
                        </div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                            <div className={`max-w-[85%] p-6 rounded-[2rem] shadow-xl transition-all ${msg.role === 'user'
                                ? "bg-accent-theme text-white rounded-tr-none premium-gradient border border-white/10"
                                : "bg-[var(--color-input)] text-foreground rounded-tl-none border border-border-theme"
                                }`}>
                                {msg.images && (
                                    <div className="relative mb-4 group overflow-hidden rounded-2xl border border-white/10 shadow-lg">
                                        <img src={msg.images[0]} alt="Upload" className="max-w-xs group-hover:scale-105 transition-transform duration-500" />
                                    </div>
                                )}
                                <div className={`prose max-w-none prose-p:leading-relaxed prose-pre:bg-black/20 text-sm font-medium ${document.documentElement.classList.contains('theme-light') ? 'prose-slate' : 'prose-invert'
                                    }`}>
                                    <ReactMarkdown>{msg.originalContent || msg.content}</ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start animate-in fade-in duration-300">
                            <div className="bg-[var(--color-input)] p-5 rounded-[2rem] rounded-tl-none border border-border-theme flex items-center gap-4 shadow-xl">
                                <div className="relative">
                                    <Loader2 className="w-5 h-5 animate-spin text-accent-theme" />
                                    <div className="absolute inset-0 animate-ping bg-accent-theme/20 rounded-full" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-theme animate-pulse">Cruzando Dados Técnicos...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-8 bg-background/30 border-t border-white/5 backdrop-blur-xl">
                    {selectedImage && (
                        <div className="mb-6 relative inline-block group">
                            <div className="absolute -inset-2 bg-accent-theme/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                            <img src={selectedImage} alt="Preview" className="h-24 rounded-2xl border-2 border-accent-theme shadow-2xl transition-all group-hover:scale-105 relative z-10" />
                            <button onClick={() => setSelectedImage(null)} className="absolute -top-3 -right-3 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-2xl transition-all hover:scale-110 active:scale-90 z-20">
                                <ArrowLeft className="w-3.5 h-3.5 rotate-45" />
                            </button>
                        </div>
                    )}
                    <div className="flex gap-4 items-end">
                        <label className="cursor-pointer p-5 bg-background/50 hover:bg-accent-theme/10 rounded-2xl text-[var(--color-text-muted)] hover:text-accent-theme transition-all border border-border-theme active:scale-95 shadow-lg group">
                            <ImageIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </label>
                        <div className="flex-1 relative">
                            <textarea
                                className="w-full bg-background/50 border border-border-theme rounded-2xl p-5 pr-16 text-foreground placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-4 focus:ring-accent-theme/10 focus:border-accent-theme/50 transition-all resize-none min-h-[64px] max-h-48 shadow-2xl font-bold text-sm"
                                placeholder="Descreva sua dúvida técnica..."
                                rows={1}
                                value={input}
                                onChange={(e) => {
                                    setInput(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={loading || (!input.trim() && !selectedImage)}
                                className="absolute right-4 bottom-4 p-3.5 bg-accent-theme text-white rounded-xl hover:brightness-110 disabled:opacity-30 transition-all shadow-xl shadow-accent-theme/20 active:scale-90 premium-gradient group"
                            >
                                <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Add some styles for lucide icons that I missed in imports
import { BookOpen } from 'lucide-react';
