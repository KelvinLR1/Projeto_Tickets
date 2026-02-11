'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Loader2, ArrowLeft, Square, RefreshCw, BookOpen } from 'lucide-react';
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
    const abortControllerRef = useRef<AbortController | null>(null);

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

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
        setInput('');
        setSelectedImage(null);
    };

    const handleSend = async () => {
        if (!input.trim() && !selectedImage) return;

        // Cancelar requisição anterior se houver
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

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
        let displayedContent = "";
        let isStreaming = true;

        try {
            let knowledgeContext = "";
            const userInput = userMessage.originalContent || input;
            const isGreeting = userInput.trim().toLowerCase().length <= 3 ||
                ['ola', 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite'].includes(userInput.trim().toLowerCase());

            // OTIMIZAÇÃO: Pula busca no banco de dados para saudações
            if (!isGreeting && userInput.trim().length > 3) {
                try {
                    const searchResults = await searchKnowledge(userInput);
                    if (searchResults && searchResults.documents) {
                        const kbDocs = searchResults.documents[0] || [];
                        const ticketDocs = searchResults.documents[1] || [];

                        // Adiciona metadados de contagem
                        const kbCount = kbDocs.length;
                        const ticketCount = ticketDocs.length;
                        const totalCount = kbCount + ticketCount;

                        let contextHeader = `METADADOS: Total de ${totalCount} documento(s) encontrado(s) - ${kbCount} manual(is) técnico(s) e ${ticketCount} ticket(s) de histórico.\n\n`;

                        const kbContent = kbDocs.map((doc: string, i: number) => `[MANUAL: ${searchResults.metadatas?.[0]?.[i]?.title}]\n${doc}`).join("\n\n");
                        const ticketContent = ticketDocs.map((doc: string, i: number) => `[TICKET: ${searchResults.metadatas?.[1]?.[i]?.title}]\n${doc}`).join("\n\n");
                        knowledgeContext = contextHeader + `${kbContent}\n\n${ticketContent}`.trim();
                    }
                } catch (e) {
                    console.warn("Busca na base de conhecimento falhou.");
                }
            }



            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            // PROMPT ANTI-CONHECIMENTO EXTERNO
            let systemContent = '';
            let userPromptWithContext = userMessage.content;

            if (isGreeting) {
                systemContent = `Você DEVE responder EXATAMENTE estas palavras, nada mais: "Olá. Como posso ajudar?"`;
                userPromptWithContext = 'oi'; // Simplifica para evitar confusão
            } else if (knowledgeContext) {
                // Contexto disponível: FORÇAR uso exclusivo
                systemContent = `Você é um assistente técnico EXTREMAMENTE DIRETO.
REGRAS ABSOLUTAS:
1. Responda APENAS com base nos documentos fornecidos
2. PROIBIDO: Usar conhecimento externo, inventar informações, ou adicionar explicações desnecessárias
3. Vá DIRETO à solução - NÃO diga "os documentos indicam", "de acordo com", "isso geralmente", ou qualquer preâmbulo
4. Cite documentos APENAS se perguntado explicitamente "onde?" ou "qual documento?"
5. MÁXIMO 1-2 frases. PARE IMEDIATAMENTE após responder. NÃO adicione contexto extra ou explicações genéricas
6. Se a resposta completa couber em 1 frase, use APENAS 1 frase e PARE`;

                userPromptWithContext = `DOCUMENTOS DISPONÍVEIS:
${knowledgeContext}

PERGUNTA: ${userMessage.content}

INSTRUÇÃO: Responda a pergunta diretamente com a solução. Não mencione os documentos a menos que seja perguntado. Se não souber, diga: "Não encontrei essa informação."`;
            } else {
                // Sem contexto: admitir ignorância
                systemContent = `Você não tem acesso a documentos técnicos.`;
                userPromptWithContext = `${userMessage.content}\n\nResponda APENAS: "Não encontrei informações na base de conhecimento."`;
            }


            // Histórico da sessão atual (últimas 4 mensagens = 2 pares de perguntas/respostas)
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

            const hasImage = !!userMessage.images;
            history.push({
                role: userMessage.role,
                content: userPromptWithContext,
                images: userMessage.images
            });

            const targetModel = hasImage ? config.visionModel : config.textModel;

            // Efeito de Typewriter Fluido
            const typingInterval = setInterval(() => {
                if (displayedContent.length < responseBuffer.length) {
                    // Pega um pequeno pedaço para parecer que está digitando
                    const charsToAdd = Math.ceil((responseBuffer.length - displayedContent.length) / 3) || 1;
                    displayedContent += responseBuffer.substring(displayedContent.length, displayedContent.length + charsToAdd);

                    setMessages((prev) => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1].content = displayedContent;
                        return newMsgs;
                    });
                } else if (!isStreaming) {
                    clearInterval(typingInterval);
                }
            }, 30); // 30ms para um scroll suave

            await chatWithOllama(targetModel, history, (chunk) => {
                responseBuffer += chunk;
            }, abortControllerRef.current.signal);

            isStreaming = false;

        } catch (error: any) {
            isStreaming = false;
            if (error.name === 'AbortError') {
                console.log('IA Generation cancelled by user');
                setMessages((prev) => {
                    const newMsgs = [...prev];
                    if (newMsgs[newMsgs.length - 1].content === '') {
                        newMsgs[newMsgs.length - 1].content = '_Geração interrompida pelo usuário._';
                    } else {
                        newMsgs[newMsgs.length - 1].content += ' [INTERROMPIDO]';
                    }
                    return newMsgs;
                });
            } else {
                console.error(error);
                setMessages((prev) => [...prev, { role: 'assistant', content: 'Erro ao conectar com a IA local.' }]);
            }
        } finally {
            setLoading(false);
            abortControllerRef.current = null;
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
                {/* Header com botão Nova Conversa */}
                {messages.length > 0 && (
                    <div className="px-8 pt-6 pb-4 border-b border-white/5 bg-background/30 backdrop-blur-xl flex justify-between items-center">
                        <h3 className="text-sm font-black uppercase tracking-widest text-accent-theme">Conversa Atual</h3>
                        <button
                            onClick={clearChat}
                            className="flex items-center gap-2 px-4 py-2 bg-accent-theme/10 hover:bg-accent-theme/20 text-accent-theme rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-accent-theme/20 active:scale-95"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Nova Conversa
                        </button>
                    </div>
                )}
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
                                <button
                                    onClick={stopGeneration}
                                    className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/20"
                                >
                                    <Square className="w-2.5 h-2.5 fill-current" />
                                    CANCELAR
                                </button>
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
                            {loading ? (
                                <button
                                    onClick={stopGeneration}
                                    className="absolute right-4 bottom-4 p-3.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-xl shadow-red-500/20 active:scale-90 group"
                                >
                                    <Square className="w-5 h-5 fill-current" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() && !selectedImage}
                                    className="absolute right-4 bottom-4 p-3.5 bg-accent-theme text-white rounded-xl hover:brightness-110 disabled:opacity-30 transition-all shadow-xl shadow-accent-theme/20 active:scale-90 premium-gradient group"
                                >
                                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

