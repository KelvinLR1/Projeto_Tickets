'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    Play, MessageSquare, HelpCircle, Clock, Users, Globe, Plus, Trash2, 
    Save, ArrowLeft, AlertCircle, X, ChevronRight, CheckCircle2, RotateCcw, Loader2, Pencil,
    Timer, Star, Image as ImageIcon, FileText, Bot, Sparkles, UserCheck, Ticket, User as UserIcon,
    Upload, ExternalLink, Paperclip, Check, Music, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import clsx from 'clsx';
import { getSectors, Sector, getUsers, User, getCategories, Category } from '@/lib/api';
import { getOllamaModels } from '@/lib/ollama';
import { useNotification } from '@/components/NotificationProvider';

export type BotNode = {
    id: string;
    type: 'start' | 'message' | 'question' | 'condition' | 'sector' | 'http' | 'close' | 'delay' | 'media' | 'ai' | 'operator' | 'create_ticket';
    x: number;
    y: number;
    title: string;
    data: {
        text?: string;
        options?: string[];
        sectorId?: number;
        startTime?: string;
        endTime?: string;
        workDays?: number[]; // 0 = Dom, 1 = Seg, ..., 6 = Sab
        url?: string;
        method?: 'GET' | 'POST';
        // Configurações de Finalização
        requestRating?: boolean;
        ratingMessage?: string;
        ratingThanksMessage?: string;
        ratingTimeoutMinutes?: number; // 1 a 15 min
        // Configurações de Tempo de Espera
        delaySeconds?: number;
        delayValue?: number;
        delayUnit?: 'seconds' | 'minutes';
        // 1. Configurações de Mídia / Arquivo
        mediaType?: 'image' | 'document' | 'audio' | 'video';
        mediaSource?: 'library' | 'url';
        mediaUrl?: string;
        mediaCaption?: string;
        mediaFileName?: string;
        // 2. Configurações de Resposta por IA
        aiModel?: string;
        aiSystemPrompt?: string;
        aiFallbackMessage?: string;
        // 3. Configurações de Atendente Específico
        operatorId?: string | number;
        operatorName?: string;
        operatorTransferMessage?: string;
        // 4. Configurações de Criar Chamado
        ticketTitle?: string;
        ticketPriority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
        ticketCategoryId?: number;
        ticketSectorId?: number;
        ticketConfirmationMessage?: string;
    };
};

export type BotEdge = {
    id: string;
    source: string;
    sourceHandle?: string; // option index or 'yes'/'no' or 'reply'/'timeout'
    target: string;
    targetHandle?: string; // 'inlet'
    vertices?: { x: number; y: number }[];
};

export type WhatsAppChannel = {
    id: string;
    name: string;
    port: number;
    color: string;
    description?: string;
    sector_id?: number | null;
    sector_ids?: number[] | null;
    all_sectors?: boolean;
    bot_flow?: {
        nodes: BotNode[];
        edges: BotEdge[];
    } | null;
};

// Altura de cada nó baseada no tipo para cálculos matemáticos precisos de cabos
const getNodeHeight = (node: BotNode) => {
    switch (node.type) {
        case 'start':
            return 120;
        case 'message':
            return 145;
        case 'question':
            const optCount = node.data.options?.length || 0;
            return 135 + optCount * 46;
        case 'condition':
            return 185;
        case 'delay':
            return 185;
        case 'close':
            return node.data.requestRating ? 175 : 155;
        case 'sector':
            return 140;
        case 'operator':
            return 140;
        case 'media':
            return 165;
        case 'ai':
            return 160;
        case 'create_ticket':
            return 165;
        case 'http':
            return 145;
        default:
            return 145;
    }
};

export default function BotConfigPage() {
    const params = useParams();
    const router = useRouter();
    const channelId = params?.id as string;
    const { confirm: askConfirm } = useNotification();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
    const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [aiModels, setAiModels] = useState<any[]>([]);
    const [libraryFiles, setLibraryFiles] = useState<any[]>([]);

    // Estados do Construtor de Fluxo
    const [nodes, setNodes] = useState<BotNode[]>([]);
    const [edges, setEdges] = useState<BotEdge[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [connectingSource, setConnectingSource] = useState<{ nodeId: string; handleId?: string } | null>(null);

    // Estado de Arrastar (Drag & Drop)
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [draggingVertex, setDraggingVertex] = useState<{ edgeId: string; index: number } | null>(null);
    const [edgeContextMenu, setEdgeContextMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Estados de Pan e Zoom (Mesa de Trabalho)
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isTransitionActive, setIsTransitionActive] = useState(false);
    const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Estados de Arrastar Conexão (Drag to Connect)
    const [isDrawingConnection, setIsDrawingConnection] = useState(false);
    const [tempConnectionEnd, setTempConnectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [hoveredInletNodeId, setHoveredInletNodeId] = useState<string | null>(null);

    const panStartClient = useRef({ x: 0, y: 0 });
    const panStartPos = useRef({ x: 0, y: 0 });
    const dragStartClient = useRef({ x: 0, y: 0 });
    const dragStartNodePos = useRef({ x: 0, y: 0 });

    // Estados do Simulador de Fluxo
    const [isTestChatOpen, setIsTestChatOpen] = useState(false);
    const [testMessages, setTestMessages] = useState<{ sender: 'bot' | 'client' | 'system'; text: string; mediaUrl?: string; mediaType?: string }[]>([]);
    const [testCurrentNodeId, setTestCurrentNodeId] = useState<string | null>(null);
    const [testActiveOptions, setTestActiveOptions] = useState<string[]>([]);

    // Carregar Dados Iniciais
    useEffect(() => {
        const loadData = async () => {
            try {
                // Carregar setores do banco
                try {
                    const sectorData = await getSectors();
                    setSectors(sectorData || []);
                } catch (e) {
                    console.warn('Erro ao carregar setores:', e);
                }

                // Carregar usuários para o bloco de atendente
                try {
                    const userData = await getUsers();
                    setUsers(userData || []);
                } catch (e) {
                    console.warn('Erro ao carregar usuários:', e);
                }

                // Carregar categorias para o bloco de tickets
                try {
                    const catData = await getCategories();
                    setCategories(catData || []);
                } catch (e) {
                    console.warn('Erro ao carregar categorias:', e);
                }

                // Carregar modelos de IA (Ollama)
                try {
                    const models = await getOllamaModels();
                    setAiModels(models || []);
                } catch (e) {
                    console.warn('Erro ao carregar modelos Ollama:', e);
                }

                // Carregar biblioteca de arquivos pré-salvos do WhatsApp
                try {
                    const filesRes = await fetch('/api/whatsapp/files');
                    if (filesRes.ok) {
                        const filesData = await filesRes.json();
                        setLibraryFiles(filesData.files || filesData || []);
                    }
                } catch (e) {
                    console.warn('Erro ao carregar biblioteca de arquivos:', e);
                }

                // Carregar canais do WhatsApp
                const res = await fetch('/api/whatsapp/channels');
                if (res.ok) {
                    const data: WhatsAppChannel[] = await res.json();
                    setChannels(data);
                    const currentChannel = data.find(c => c.id === channelId);
                    if (currentChannel) {
                        setChannel(currentChannel);
                        if (currentChannel.bot_flow) {
                            setNodes(currentChannel.bot_flow.nodes || []);
                            setEdges(currentChannel.bot_flow.edges || []);
                        } else {
                            // Inicializa com um nó inicial de teste
                            const initialNodes: BotNode[] = [
                                {
                                    id: 'node-start',
                                    type: 'start',
                                    x: 100,
                                    y: 250,
                                    title: 'Início do Fluxo',
                                    data: {}
                                },
                                {
                                    id: 'node-welcome',
                                    type: 'message',
                                    x: 450,
                                    y: 250,
                                    title: 'Mensagem de Boas-vindas',
                                    data: { text: 'Olá! Seja bem-vindo ao nosso atendimento inteligente.' }
                                }
                            ];
                            const initialEdges: BotEdge[] = [
                                {
                                    id: 'edge-start-welcome',
                                    source: 'node-start',
                                    target: 'node-welcome',
                                    targetHandle: 'inlet'
                                }
                            ];
                            setNodes(initialNodes);
                            setEdges(initialEdges);
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar dados do bot:', err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [channelId]);

    // Salvar o Fluxo
    const handleSaveFlow = async () => {
        if (!channel) return;
        setSaving(true);
        try {
            const updatedChannels = channels.map(c => {
                if (c.id === channelId) {
                    return {
                        ...c,
                        bot_flow: { nodes, edges }
                    };
                }
                return c;
            });

            const res = await fetch('/api/whatsapp/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedChannels)
            });

            if (res.ok) {
                alert('Fluxo do Bot salvo com sucesso! As alterações serão aplicadas em tempo real.');
            } else {
                alert('Erro ao salvar o fluxo.');
            }
        } catch (err) {
            console.error('Erro ao salvar fluxo:', err);
            alert('Erro ao salvar fluxo.');
        } finally {
            setSaving(false);
        }
    };

    // Funções do Simulador de Chatbot
    const startFlowTest = () => {
        setIsTestChatOpen(true);
        setTestMessages([{ sender: 'system', text: 'Simulação Iniciada. O cliente envia a primeira mensagem.' }]);
        setTestActiveOptions([]);
        
        // Localiza nó posterior ao Start
        const startNode = nodes.find(n => n.type === 'start');
        if (!startNode) {
            setTestMessages(prev => [...prev, { sender: 'system', text: 'Erro: Nó de Início não encontrado.' }]);
            return;
        }

        const edge = edges.find(e => e.source === startNode.id);
        if (!edge) {
            setTestMessages(prev => [...prev, { sender: 'system', text: 'Conecte o nó de Início a um bloco para começar.' }]);
            return;
        }

        setTimeout(() => {
            runTestNode(edge.target);
        }, 600);
    };

    const runTestNode = (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) {
            setTestMessages(prev => [...prev, { sender: 'system', text: 'Fluxo concluído. Roteando para a Fila Geral.' }]);
            return;
        }

        setTestCurrentNodeId(node.id);

        if (node.type === 'message') {
            setTestMessages(prev => [...prev, { sender: 'bot', text: node.data.text || '' }]);
            
            // Avança automaticamente
            const edge = edges.find(e => e.source === node.id);
            if (edge) {
                setTimeout(() => {
                    runTestNode(edge.target);
                }, 1000);
            } else {
                setTimeout(() => {
                    setTestMessages(prev => [...prev, { sender: 'system', text: 'Fluxo finalizado. Cliente encaminhado para a Fila.' }]);
                }, 1000);
            }
        } 
        
        else if (node.type === 'media') {
            const caption = node.data.mediaCaption || node.data.text || '';
            const fileName = node.data.mediaFileName || 'arquivo_anexo';
            const mediaType = node.data.mediaType || 'image';
            const emoji = mediaType === 'image' ? '🖼️ Imagem' : mediaType === 'document' ? '📄 Documento PDF' : mediaType === 'audio' ? '🎵 Áudio' : '🎥 Vídeo';
            
            setTestMessages(prev => [...prev, { 
                sender: 'bot', 
                text: `${emoji} [${fileName}]: ${caption}`,
                mediaUrl: node.data.mediaUrl,
                mediaType
            }]);

            const edge = edges.find(e => e.source === node.id);
            if (edge) {
                setTimeout(() => {
                    runTestNode(edge.target);
                }, 1200);
            } else {
                setTimeout(() => {
                    setTestMessages(prev => [...prev, { sender: 'system', text: 'Mídia enviada com sucesso ao cliente.' }]);
                }, 1000);
            }
        }

        else if (node.type === 'ai') {
            const modelName = node.data.aiModel || 'phi3';
            setTestMessages(prev => [...prev, { sender: 'system', text: `🤖 Processando resposta via IA (${modelName})...` }]);
            
            setTimeout(() => {
                const sampleAiResponse = "Olá! Com base nas informações cadastradas, posso ajudar com orçamentos, status de chamados e orientações gerais de suporte. Como posso te auxiliar?";
                setTestMessages(prev => [...prev, { sender: 'bot', text: sampleAiResponse }]);
                
                const edge = edges.find(e => e.source === node.id);
                if (edge) {
                    setTimeout(() => {
                        runTestNode(edge.target);
                    }, 1200);
                }
            }, 1000);
        }

        else if (node.type === 'operator') {
            const opName = node.data.operatorName || (users.find(u => String(u.id) === String(node.data.operatorId))?.full_name || 'Atendente');
            const customMsg = node.data.operatorTransferMessage || `Estou transferindo seu atendimento diretamente para ${opName}. Aguarde um instante.`;
            
            setTestMessages(prev => [...prev, { sender: 'bot', text: customMsg }]);
            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'system', text: `👤 Atendimento transferido diretamente para ${opName}. Saindo do Bot.` }]);
            }, 600);
        }

        else if (node.type === 'create_ticket') {
            const ticketTitle = node.data.ticketTitle || 'Chamado Aberto via WhatsApp';
            const priority = node.data.ticketPriority || 'MEDIUM';
            const catName = categories.find(c => c.id === node.data.ticketCategoryId)?.name || 'Geral';
            const confirmMsg = node.data.ticketConfirmationMessage || `Chamado registrado com sucesso! Protocolo #${Math.floor(100000 + Math.random() * 900000)}.`;

            setTestMessages(prev => [...prev, { 
                sender: 'system', 
                text: `📝 Criando chamado no sistema: "${ticketTitle}" | Categoria: ${catName} | Prioridade: ${priority}` 
            }]);

            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'bot', text: confirmMsg }]);
                
                const edge = edges.find(e => e.source === node.id);
                if (edge) {
                    setTimeout(() => {
                        runTestNode(edge.target);
                    }, 1000);
                } else {
                    setTimeout(() => {
                        setTestMessages(prev => [...prev, { sender: 'system', text: '✅ Chamado aberto e associado ao contato.' }]);
                    }, 800);
                }
            }, 800);
        }

        else if (node.type === 'question') {
            setTestMessages(prev => [...prev, { sender: 'bot', text: node.data.text || '' }]);
            setTestActiveOptions(node.data.options || []);
        } 
        
        else if (node.type === 'condition') {
            setTestMessages(prev => [...prev, { sender: 'system', text: `Verificando Horário de Funcionamento (${node.data.startTime} às ${node.data.endTime})...` }]);
            
            // Simular como dentro do horário
            const isMatched = true;
            const handle = isMatched ? 'yes' : 'no';

            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'system', text: isMatched ? '✓ Dentro do horário de funcionamento.' : '✗ Fora do horário de funcionamento.' }]);
                const edge = edges.find(e => e.source === node.id && e.sourceHandle === handle);
                if (edge) {
                    setTimeout(() => {
                        runTestNode(edge.target);
                    }, 600);
                } else {
                    setTestMessages(prev => [...prev, { sender: 'system', text: 'Nenhuma conexão de saída para este cenário.' }]);
                }
            }, 800);
        } 
        
        else if (node.type === 'sector') {
            const sectorName = sectors.find(s => s.id === node.data.sectorId)?.name || 'Setor Padrão';
            setTestMessages(prev => [...prev, { sender: 'system', text: `Roteando cliente para o setor: ${sectorName}` }]);
            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'bot', text: 'Entendido! Estou transferindo você para o setor escolhido. Aguarde.' }]);
            }, 500);
        }

        else if (node.type === 'close') {
            if (node.data.text) {
                setTestMessages(prev => [...prev, { sender: 'bot', text: node.data.text || '' }]);
            }
            if (node.data.requestRating) {
                setTimeout(() => {
                    setTestMessages(prev => [...prev, { sender: 'bot', text: node.data.ratingMessage || 'Por favor, avalie nosso atendimento de 1 a 5 estrelas ⭐' }]);
                    setTestMessages(prev => [...prev, { 
                        sender: 'system', 
                        text: `⏳ Aguardando avaliação por até ${node.data.ratingTimeoutMinutes || 5} min. (Clique em uma nota abaixo para testar)` 
                    }]);
                }, 400);
            } else {
                setTimeout(() => {
                    setTestMessages(prev => [...prev, { sender: 'system', text: '✅ Atendimento finalizado e arquivado no histórico.' }]);
                }, 600);
            }
        }

        else if (node.type === 'delay') {
            const unit = node.data.delayUnit === 'minutes' ? 'minuto(s)' : 'segundo(s)';
            const val = node.data.delayValue || (node.data.delayUnit === 'minutes' ? Math.round((node.data.delaySeconds || 300) / 60) : (node.data.delaySeconds || 5));
            setTestMessages(prev => [...prev, { 
                sender: 'system', 
                text: `⏱️ Aguardando ${val} ${unit} por interação do cliente. (Simule o teste abaixo)` 
            }]);
        }
    };

    const handleSimulateRating = (star: number) => {
        const closeNode = nodes.find(n => n.id === testCurrentNodeId);
        setTestMessages(prev => [...prev, { sender: 'client', text: `${star} ⭐` }]);
        setTimeout(() => {
            setTestMessages(prev => [...prev, { 
                sender: 'bot', 
                text: closeNode?.data.ratingThanksMessage || 'Obrigado pela sua avaliação! Tenha um ótimo dia.' 
            }]);
            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'system', text: `⭐ Avaliação de ${star} estrelas registrada com sucesso! Atendimento concluído.` }]);
            }, 500);
        }, 500);
    };

    const handleSimulateDelayAction = (action: 'reply' | 'timeout') => {
        const delayNode = nodes.find(n => n.id === testCurrentNodeId);
        if (!delayNode) return;

        if (action === 'reply') {
            setTestMessages(prev => [...prev, { sender: 'client', text: 'Olá, ainda estou aqui!' }]);
            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'system', text: '✓ Mensagem recebida antes do tempo limite. Continuando pelo caminho [Se Enviar Mensagem].' }]);
                const edge = edges.find(e => e.source === delayNode.id && (e.sourceHandle === 'reply' || !e.sourceHandle));
                if (edge) {
                    setTimeout(() => {
                        runTestNode(edge.target);
                    }, 600);
                } else {
                    setTimeout(() => {
                        setTestMessages(prev => [...prev, { sender: 'system', text: 'Sem saída configurada para resposta do cliente. Enviando para fila.' }]);
                    }, 600);
                }
            }, 600);
        } else {
            setTestMessages(prev => [...prev, { sender: 'system', text: '⏱️ Tempo esgotado sem resposta do cliente (Timeout). Continuando pelo caminho [Sem Resposta].' }]);
            const edge = edges.find(e => e.source === delayNode.id && (e.sourceHandle === 'timeout' || !e.sourceHandle));
            if (edge) {
                setTimeout(() => {
                    runTestNode(edge.target);
                }, 600);
            } else {
                setTimeout(() => {
                    setTestMessages(prev => [...prev, { sender: 'system', text: 'Sem saída configurada para timeout. Enviando para fila.' }]);
                }, 600);
            }
        }
    };

    const handleSelectTestOption = (opt: string) => {
        setTestMessages(prev => [...prev, { sender: 'client', text: opt }]);
        setTestActiveOptions([]);

        const edge = edges.find(e => e.source === testCurrentNodeId && e.sourceHandle === opt);
        if (edge) {
            setTimeout(() => {
                runTestNode(edge.target);
            }, 800);
        } else {
            setTimeout(() => {
                setTestMessages(prev => [...prev, { sender: 'system', text: 'Esta opção não possui conexão com outro bloco.' }]);
            }, 800);
        }
    };

    // Adicionar um novo bloco ao fluxo
    const handleAddNode = (type: BotNode['type']) => {
        const id = `node-${Date.now()}`;
        let title = '';
        let data: BotNode['data'] = {};

        switch (type) {
            case 'message':
                title = 'Enviar Mensagem';
                data = { text: 'Digite sua mensagem aqui...' };
                break;
            case 'question':
                title = 'Fazer Pergunta';
                data = { text: 'Qual sua dúvida?', options: ['Opção 1', 'Opção 2'] };
                break;
            case 'condition':
                title = 'Horário de Funcionamento';
                data = { startTime: '08:00', endTime: '18:00', workDays: [1, 2, 3, 4, 5] };
                break;
            case 'sector':
                title = 'Direcionar Setor';
                data = { sectorId: sectors[0]?.id || 1 };
                break;
            case 'operator':
                title = 'Direcionar Atendente';
                data = { 
                    operatorId: users[0]?.id || '',
                    operatorName: users[0]?.full_name || users[0]?.username || 'Atendente',
                    operatorTransferMessage: 'Estou transferindo seu contato para nosso atendente. Aguarde um instante.'
                };
                break;
            case 'media':
                title = 'Enviar Mídia / Arquivo';
                data = {
                    mediaType: 'image',
                    mediaSource: 'library',
                    mediaUrl: '',
                    mediaCaption: 'Confira o arquivo em anexo:',
                    mediaFileName: 'arquivo_anexo'
                };
                break;
            case 'ai':
                title = 'Resposta com IA';
                data = {
                    aiModel: aiModels[0]?.name || 'phi3',
                    aiSystemPrompt: 'Você é um assistente prestativo da empresa. Responda com clareza, gentileza e brevidade em português.',
                    aiFallbackMessage: 'Desculpe, não consegui processar a informação no momento. Vou transferir seu contato.'
                };
                break;
            case 'create_ticket':
                title = 'Criar Chamado';
                data = {
                    ticketTitle: 'Atendimento Aberto via Chatbot WhatsApp',
                    ticketPriority: 'MEDIUM',
                    ticketCategoryId: categories[0]?.id || 1,
                    ticketConfirmationMessage: 'Seu chamado foi registrado em nosso sistema com sucesso!'
                };
                break;
            case 'http':
                title = 'Requisição HTTP';
                data = { url: 'https://api.exemplo.com/webhooks', method: 'POST' };
                break;
            case 'delay':
                title = 'Tempo de Espera';
                data = { delayValue: 5, delayUnit: 'minutes', delaySeconds: 300 };
                break;
            case 'close':
                title = 'Finalizar Atendimento';
                data = { 
                    text: 'Atendimento finalizado pelo assistente virtual. Obrigado pelo contato!',
                    requestRating: false,
                    ratingMessage: 'Por favor, avalie nosso atendimento de 1 a 5 estrelas ⭐',
                    ratingThanksMessage: 'Obrigado pela sua avaliação! Tenha um ótimo dia.',
                    ratingTimeoutMinutes: 5
                };
                break;
        }

        const newNode: BotNode = {
            id,
            type,
            x: 400 + Math.random() * 80,
            y: 200 + Math.random() * 80,
            title,
            data
        };

        setNodes(prev => [...prev, newNode]);
        setSelectedNodeId(id);
    };

    // Remover um nó e suas conexões
    const handleDeleteNode = async (id: string) => {
        if (id === 'node-start') return; // Impedir exclusão do nó principal
        const confirmed = await askConfirm({
            title: 'Excluir Bloco?',
            message: 'Tem certeza de que deseja remover este bloco e todas as suas conexões?',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'danger'
        });
        if (!confirmed) return;
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.source !== id && e.target !== id));
        if (selectedNodeId === id) setSelectedNodeId(null);
    };

    // Arrastar Conexões - Eventos
    const handleOutletMouseDown = (e: React.MouseEvent, nodeId: string, handleId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDrawingConnection(true);
        setConnectingSource({ nodeId, handleId });
        
        const coords = getHandleCoords(nodeId, handleId, false);
        setTempConnectionEnd(coords);
    };

    // Arrastar Nós - Eventos
    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        if ((e.target as HTMLElement).closest('.handle-connector') || (e.target as HTMLElement).closest('button')) {
            return;
        }
        e.stopPropagation();
        setSelectedNodeId(nodeId);
        setDraggingNodeId(nodeId);
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            dragStartClient.current = { x: e.clientX, y: e.clientY };
            dragStartNodePos.current = { x: node.x, y: node.y };
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target === canvasRef.current || target.classList.contains('canvas-background') || target.tagName.toLowerCase() === 'svg') {
            e.preventDefault();
            setIsPanning(true);
            panStartClient.current = { x: e.clientX, y: e.clientY };
            panStartPos.current = { x: pan.x, y: pan.y };
            setSelectedNodeId(null);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (draggingNodeId) {
            const dx = (e.clientX - dragStartClient.current.x) / zoom;
            const dy = (e.clientY - dragStartClient.current.y) / zoom;
            let newX = dragStartNodePos.current.x + dx;
            let newY = dragStartNodePos.current.y + dy;
            
            newX = Math.max(20, Math.min(2700, newX));
            newY = Math.max(20, Math.min(1800, newY));

            setNodes(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n));
        } else if (draggingVertex) {
            const dx = (e.clientX - dragStartClient.current.x) / zoom;
            const dy = (e.clientY - dragStartClient.current.y) / zoom;
            let newX = dragStartNodePos.current.x + dx;
            let newY = dragStartNodePos.current.y + dy;
            
            newX = Math.max(20, Math.min(2980, newX));
            newY = Math.max(20, Math.min(1980, newY));
            
            setEdges(prev => prev.map(edge => {
                if (edge.id === draggingVertex.edgeId) {
                    const newVertices = (edge.vertices || []).map((v, idx) => 
                        idx === draggingVertex.index ? { x: newX, y: newY } : v
                    );
                    return { ...edge, vertices: newVertices };
                }
                return edge;
            }));
        } else if (isPanning) {
            const dx = e.clientX - panStartClient.current.x;
            const dy = e.clientY - panStartClient.current.y;
            setPan({
                x: panStartPos.current.x + dx,
                y: panStartPos.current.y + dy
            });
        } else if (isDrawingConnection && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - pan.x) / zoom;
            const canvasY = (e.clientY - rect.top - pan.y) / zoom;
            setTempConnectionEnd({ x: canvasX, y: canvasY });
        }
    };

    const handleCanvasMouseUp = () => {
        if (isDrawingConnection) {
            if (hoveredInletNodeId && connectingSource) {
                setEdges(prev => {
                    const exists = prev.some(e => 
                        e.source === connectingSource.nodeId && 
                        e.sourceHandle === connectingSource.handleId && 
                        e.target === hoveredInletNodeId
                    );
                    if (exists) return prev;
                    
                    const newEdge: BotEdge = {
                        id: `edge-${Date.now()}`,
                        source: connectingSource.nodeId,
                        sourceHandle: connectingSource.handleId,
                        target: hoveredInletNodeId,
                        targetHandle: 'inlet'
                    };
                    return [...prev, newEdge];
                });
            }
            setIsDrawingConnection(false);
            setConnectingSource(null);
            setTempConnectionEnd(null);
            setHoveredInletNodeId(null);
        }
        setDraggingNodeId(null);
        setDraggingVertex(null);
        setIsPanning(false);
    };

    const getDistanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
        if (l2 === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = ax + t * (bx - ax);
        const projY = ay + t * (by - ay);
        return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    };

    const handleAddVertex = (edgeId: string, clickX: number, clickY: number) => {
        const edge = edges.find(e => e.id === edgeId);
        if (!edge) return;

        const start = getHandleCoords(edge.source, edge.sourceHandle, false);
        const end = getHandleCoords(edge.target, edge.targetHandle, true);

        const currentVertices = edge.vertices || [];
        const fullPoints = [start, ...currentVertices, end];

        let bestIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < fullPoints.length - 1; i++) {
            const p1 = fullPoints[i];
            const p2 = fullPoints[i + 1];
            const dist = getDistanceToSegment(clickX, clickY, p1.x, p1.y, p2.x, p2.y);
            if (dist < minDistance) {
                minDistance = dist;
                bestIndex = i;
            }
        }

        const newVertices = [...currentVertices];
        newVertices.splice(bestIndex, 0, { x: Math.round(clickX), y: Math.round(clickY) });

        setEdges(prev => prev.map(e => e.id === edgeId ? { ...e, vertices: newVertices } : e));
    };

    const handleEdgeContextMenu = (e: React.MouseEvent, edgeId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setEdgeContextMenu({
            edgeId,
            x: e.clientX,
            y: e.clientY
        });
    };

    const handleDeleteVertex = (edgeId: string, vertexIndex: number) => {
        setEdges(prev => prev.map(edge => {
            if (edge.id === edgeId && edge.vertices) {
                const newVertices = edge.vertices.filter((_, idx) => idx !== vertexIndex);
                return { ...edge, vertices: newVertices };
            }
            return edge;
        }));
    };

    const getRoundedCornerPath = (points: { x: number; y: number }[], radius: number = 20) => {
        if (points.length < 2) return '';
        if (points.length === 2) {
            const [start, end] = points;
            const dx = Math.abs(end.x - start.x) * 0.5;
            const controlOffset = Math.max(80, dx);
            return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
        }

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length - 1; i++) {
            const pPrev = points[i - 1];
            const pCurr = points[i];
            const pNext = points[i + 1];

            const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
            const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

            const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

            const r = Math.min(radius, len1 / 2, len2 / 2);
            if (r < 1) {
                path += ` L ${pCurr.x} ${pCurr.y}`;
                continue;
            }

            const pStart = {
                x: pCurr.x + (v1.x / len1) * r,
                y: pCurr.y + (v1.y / len1) * r
            };
            const pEnd = {
                x: pCurr.x + (v2.x / len2) * r,
                y: pCurr.y + (v2.y / len2) * r
            };

            path += ` L ${pStart.x} ${pStart.y} Q ${pCurr.x} ${pCurr.y}, ${pEnd.x} ${pEnd.y}`;
        }

        path += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
        return path;
    };

    const getEdgeMidpoint = (start: { x: number; y: number }, end: { x: number; y: number }, vertices?: { x: number; y: number }[]) => {
        if (!vertices || vertices.length === 0) {
            return {
                x: (start.x + end.x) / 2,
                y: (start.y + end.y) / 2
            };
        }
        const midIdx = Math.floor(vertices.length / 2);
        return vertices[midIdx];
    };

    const handleCanvasWheel = (e: React.WheelEvent) => {
        if (!canvasRef.current) return;
        e.preventDefault();

        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomDelta = e.deltaY < 0 ? 1 : -1;
        adjustZoomAtPoint(zoomDelta, mouseX, mouseY);
    };

    const adjustZoomAtPoint = (delta: number, mouseX?: number, mouseY?: number, animate = false) => {
        if (!canvasRef.current) return;

        if (animate) {
            setIsTransitionActive(true);
            if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
            wheelTimeoutRef.current = setTimeout(() => {
                setIsTransitionActive(false);
            }, 250);
        }

        setZoom(prevZoom => {
            const zoomStep = 0.15;
            const newZoom = delta > 0 ? prevZoom + zoomStep : prevZoom - zoomStep;
            const clampedZoom = Math.min(Math.max(newZoom, 0.4), 2.5);
            const roundedZoom = Math.round(clampedZoom * 100) / 100;

            if (roundedZoom === prevZoom) return prevZoom;

            const rect = canvasRef.current!.getBoundingClientRect();
            const targetMouseX = mouseX !== undefined ? mouseX : rect.width / 2;
            const targetMouseY = mouseY !== undefined ? mouseY : rect.height / 2;

            setPan(prevPan => {
                const canvasX = (targetMouseX - prevPan.x) / prevZoom;
                const canvasY = (targetMouseY - prevPan.y) / prevZoom;

                return {
                    x: targetMouseX - canvasX * roundedZoom,
                    y: targetMouseY - canvasY * roundedZoom
                };
            });

            return roundedZoom;
        });
    };

    const resetZoom = () => {
        setIsTransitionActive(true);
        if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = setTimeout(() => {
            setIsTransitionActive(false);
        }, 250);
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const getHandleCoords = (nodeId: string, handleId?: string, isInput?: boolean) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };

        const nodeWidth = 280;
        const nodeHeight = getNodeHeight(node);

        if (isInput) {
            return { x: node.x, y: node.y + 60 };
        } else {
            if (node.type === 'condition') {
                if (handleId === 'yes') {
                    return { x: node.x + nodeWidth, y: node.y + 104 };
                } else if (handleId === 'no') {
                    return { x: node.x + nodeWidth, y: node.y + 148 };
                }
            } else if (node.type === 'delay') {
                if (handleId === 'reply') {
                    return { x: node.x + nodeWidth, y: node.y + 104 };
                } else if (handleId === 'timeout') {
                    return { x: node.x + nodeWidth, y: node.y + 148 };
                }
            } else if (node.type === 'question') {
                const options = node.data.options || [];
                const idx = options.indexOf(handleId || '');
                if (idx !== -1) {
                    return { x: node.x + nodeWidth, y: node.y + 110 + idx * 46 };
                }
            }
            return { x: node.x + nodeWidth, y: node.y + 60 };
        }
    };

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    if (loading) {
        return (
            <main className="h-screen flex items-center justify-center bg-background text-foreground">
                <div className="flex flex-col items-center gap-3 text-text-muted">
                    <Loader2 className="w-8 h-8 animate-spin text-accent-theme" />
                    <p className="text-sm font-semibold uppercase tracking-widest">Carregando Construtor...</p>
                </div>
            </main>
        );
    }

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-background text-foreground select-none relative font-sans">
            {/* Header Superior */}
            <header className="h-16 border-b border-border-theme bg-card/70 backdrop-blur-xl flex items-center justify-between px-6 z-30 relative shrink-0">
                <div className="flex items-center gap-4">
                    <Link 
                        href="/settings"
                        className="p-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-theme rounded-xl transition-all duration-300 text-text-muted hover:text-foreground shrink-0 active:scale-95"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                        <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-foreground">
                            Fluxo do Bot 
                            <span className="px-2 py-0.5 text-[9px] font-black tracking-widest uppercase bg-gradient-to-r from-primary-theme/10 to-accent-theme/10 border border-accent-theme/20 text-accent-theme rounded-lg shadow-sm shadow-accent-theme/5">
                                {channel?.name || 'Carregando...'}
                            </span>
                        </div>
                        <p className="text-[9px] text-text-muted uppercase tracking-widest mt-1">Construa o roteamento automático de clientes</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {connectingSource && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-accent-theme/10 border border-accent-theme/20 text-accent-theme text-[9px] font-black uppercase tracking-wider rounded-xl animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Selecione uma entrada para conectar
                            <button onClick={() => setConnectingSource(null)} className="ml-1 hover:text-foreground"><X className="w-3 h-3" /></button>
                        </div>
                    )}
                    
                    <button
                        onClick={startFlowTest}
                        className="px-4 py-2.5 bg-accent-theme/10 hover:bg-accent-theme/20 border border-accent-theme/20 text-accent-theme rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5 duration-300 hover:shadow-lg hover:shadow-accent-theme/5"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-theme animate-pulse shrink-0" />
                        Testar Fluxo
                    </button>
                    
                    <button
                        onClick={async () => {
                            const confirmed = await askConfirm({
                                title: 'Limpar Fluxo do Bot',
                                message: 'Tem certeza que deseja limpar todos os blocos e conexões deste fluxo? As alterações só serão salvas no banco se você clicar em Salvar.',
                                type: 'danger',
                                confirmText: 'Limpar Fluxo'
                            });
                            if (confirmed) {
                                setNodes([{ id: 'node-start', type: 'start', x: 100, y: 250, title: 'Início', data: {} }]);
                                setEdges([]);
                                setSelectedNodeId(null);
                            }
                        }}
                        className="px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-theme text-text-muted hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 duration-300 cursor-pointer"
                    >
                        Limpar
                    </button>
                    
                    <button
                        onClick={handleSaveFlow}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-theme to-accent-theme hover:from-accent-theme hover:to-primary-theme text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-accent-theme/10 active:scale-95 disabled:opacity-50 duration-300"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Salvar Fluxo
                    </button>
                </div>
            </header>

            {/* Sub-Barra de Ferramentas / Blocos */}
            <div className="h-14 bg-background/40 border-b border-border-theme flex items-center px-6 gap-2.5 z-20 shrink-0 relative backdrop-blur-md overflow-x-auto custom-scrollbar">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] mr-1 shrink-0">Adicionar Bloco:</span>
                
                {/* 1. Mensagem */}
                <button 
                    onClick={() => handleAddNode('message')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent-theme/5 hover:bg-accent-theme/10 border border-accent-theme/15 hover:border-accent-theme/30 text-accent-theme hover:text-accent-theme/90 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Mensagem
                </button>
                
                {/* 2. Menu de Pergunta */}
                <button 
                    onClick={() => handleAddNode('question')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/15 hover:border-blue-500/30 text-blue-400 hover:text-blue-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Pergunta (Menu)
                </button>

                {/* 3. MÍDIA / ARQUIVO (NOVO) */}
                <button 
                    onClick={() => handleAddNode('media')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 hover:border-violet-500/40 text-violet-300 hover:text-violet-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 shadow-sm"
                >
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    Mídia / Arquivo
                </button>

                {/* 4. RESPOSTA IA (NOVO) */}
                <button 
                    onClick={() => handleAddNode('ai')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 hover:border-indigo-500/40 text-indigo-300 hover:text-indigo-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 shadow-sm"
                >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Resposta IA
                </button>
                
                {/* 5. Horário */}
                <button 
                    onClick={() => handleAddNode('condition')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <Clock className="w-3.5 h-3.5" />
                    Horário
                </button>
                
                {/* 6. Direcionar Setor */}
                <button 
                    onClick={() => handleAddNode('sector')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 text-red-400 hover:text-red-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <Users className="w-3.5 h-3.5" />
                    Direcionar Setor
                </button>

                {/* 7. ATENDENTE ESPECÍFICO (NOVO) */}
                <button 
                    onClick={() => handleAddNode('operator')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-300 hover:text-emerald-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 shadow-sm"
                >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Atendente Direto
                </button>

                {/* 8. CRIAR CHAMADO (NOVO) */}
                <button 
                    onClick={() => handleAddNode('create_ticket')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 hover:border-orange-500/40 text-orange-300 hover:text-orange-200 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 shadow-sm"
                >
                    <Ticket className="w-3.5 h-3.5 text-orange-400" />
                    Criar Chamado
                </button>
                
                {/* 9. HTTP */}
                <button 
                    onClick={() => handleAddNode('http')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/15 hover:border-cyan-500/30 text-cyan-400 hover:text-cyan-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <Globe className="w-3.5 h-3.5" />
                    HTTP
                </button>

                {/* 10. Tempo de Espera */}
                <button 
                    onClick={() => handleAddNode('delay')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <Timer className="w-3.5 h-3.5" />
                    Espera
                </button>

                {/* 11. Finalizar */}
                <button 
                    onClick={() => handleAddNode('close')} 
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/15 hover:border-emerald-500/30 text-emerald-400 hover:text-emerald-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shrink-0"
                >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Finalizar
                </button>
            </div>

            {/* Área Central - Canvas */}
            <div 
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onWheel={handleCanvasWheel}
                className={clsx(
                    "flex-1 overflow-hidden bg-background relative z-10 select-none",
                    isPanning ? "cursor-grabbing" : "cursor-grab"
                )}
                style={{ width: '100%', height: '100%' }}
            >
                {/* O container transformado que contém o SVG e as cartas */}
                <div 
                    className={clsx(
                        "w-[3000px] h-[2000px] absolute top-0 left-0 bg-[radial-gradient(var(--color-border-theme)_1.5px,transparent_1.5px)] [background-size:24px_24px] canvas-background",
                        isTransitionActive && "transition-transform duration-200 ease-out"
                    )}
                    style={{ 
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: '0 0'
                    }}
                >
                    {/* SVG overlay para os cabos de conexão */}
                    <svg className="absolute inset-0 pointer-events-none w-full h-full z-0">
                        <defs>
                            <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="var(--color-primary-theme)" stopOpacity="0.8" />
                                <stop offset="100%" stopColor="var(--color-accent-theme)" stopOpacity="0.8" />
                            </linearGradient>
                            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-accent-theme)" />
                            </marker>
                        </defs>
                        {edges.map(edge => {
                            const start = getHandleCoords(edge.source, edge.sourceHandle, false);
                            const end = getHandleCoords(edge.target, edge.targetHandle, true);
                            
                            let d = '';
                            if (!edge.vertices || edge.vertices.length === 0) {
                                const dx = Math.abs(end.x - start.x) * 0.5;
                                const controlOffset = Math.max(80, dx);
                                d = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
                            } else {
                                const points = [start, ...edge.vertices, end];
                                d = getRoundedCornerPath(points, 20);
                            }

                            const midPoint = getEdgeMidpoint(start, end, edge.vertices);

                            return (
                                <g key={edge.id} className="group pointer-events-auto">
                                    <path 
                                        d={d} 
                                        fill="none" 
                                        stroke="transparent" 
                                        strokeWidth={16} 
                                        className="cursor-pointer"
                                        onContextMenu={(e) => handleEdgeContextMenu(e, edge.id)}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (canvasRef.current) {
                                                const rect = canvasRef.current.getBoundingClientRect();
                                                const clickX = (e.clientX - rect.left - pan.x) / zoom;
                                                const clickY = (e.clientY - rect.top - pan.y) / zoom;
                                                handleAddVertex(edge.id, clickX, clickY);
                                            }
                                        }}
                                    />
                                    <path 
                                        d={d} 
                                        fill="none" 
                                        stroke="url(#edge-grad)" 
                                        strokeWidth={2.5} 
                                        markerEnd="url(#arrow)"
                                        className="transition-all duration-300 group-hover:stroke-accent-theme group-hover:stroke-[3.5]"
                                    />
                                    
                                    {/* Botão de Excluir Conexão ao passar o mouse sobre o cabo */}
                                    <g 
                                        transform={`translate(${midPoint.x}, ${midPoint.y})`}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer pointer-events-auto"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const confirmed = await askConfirm({
                                                title: 'Excluir Conexão?',
                                                message: 'Deseja desconectar estes dois blocos?',
                                                confirmText: 'Desconectar',
                                                type: 'danger'
                                            });
                                            if (confirmed) {
                                                setEdges(prev => prev.filter(item => item.id !== edge.id));
                                            }
                                        }}
                                    >
                                        <circle r="9" fill="var(--color-card, #172033)" stroke="var(--color-border-theme)" strokeWidth="1.5" className="hover:stroke-red-500" />
                                        <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                                        <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                                    </g>

                                    {/* Pontos de Vértices Intermediários */}
                                    {(edge.vertices || []).map((vertex, vIdx) => (
                                        <g 
                                            key={vIdx} 
                                            transform={`translate(${vertex.x}, ${vertex.y})`}
                                            className="pointer-events-auto"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                dragStartClient.current = { x: e.clientX, y: e.clientY };
                                                dragStartNodePos.current = { x: vertex.x, y: vertex.y };
                                                setDraggingVertex({ edgeId: edge.id, index: vIdx });
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteVertex(edge.id, vIdx);
                                            }}
                                        >
                                            <circle 
                                                r="6" 
                                                className="fill-accent-theme stroke-background stroke-2 cursor-move hover:scale-125 transition-transform" 
                                            />
                                        </g>
                                    ))}
                                </g>
                            );
                        })}

                        {/* Linha Temporária de Conexão durante o Arrasto */}
                        {isDrawingConnection && tempConnectionEnd && connectingSource && (
                            <path 
                                d={`M ${getHandleCoords(connectingSource.nodeId, connectingSource.handleId, false).x} ${getHandleCoords(connectingSource.nodeId, connectingSource.handleId, false).y} L ${tempConnectionEnd.x} ${tempConnectionEnd.y}`}
                                fill="none" 
                                stroke="var(--color-accent-theme)" 
                                strokeWidth={2} 
                                strokeDasharray="6 6"
                                className="animate-pulse"
                            />
                        )}
                    </svg>

                    {/* Renderização de todos os Nós / Blocos */}
                    {nodes.map(node => {
                        const isSelected = selectedNodeId === node.id;
                        const isConnecting = isDrawingConnection && connectingSource?.nodeId !== node.id;

                        return (
                            <div 
                                key={node.id}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                style={{
                                    left: `${node.x}px`,
                                    top: `${node.y}px`,
                                    width: '280px',
                                    height: `${getNodeHeight(node)}px`
                                }}
                                className={clsx(
                                    "absolute rounded-2xl border bg-card/95 shadow-xl transition-shadow duration-200 cursor-move flex flex-col group backdrop-blur-md z-10",
                                    isSelected ? "border-accent-theme ring-2 ring-accent-theme/20 shadow-2xl" : "border-border-theme hover:border-border-theme/80",
                                    node.type === 'start' ? "border-l-4 border-l-green-500" :
                                    node.type === 'message' ? "border-l-4 border-l-primary-theme" :
                                    node.type === 'media' ? "border-l-4 border-l-violet-500" :
                                    node.type === 'ai' ? "border-l-4 border-l-indigo-500" :
                                    node.type === 'operator' ? "border-l-4 border-l-emerald-500" :
                                    node.type === 'create_ticket' ? "border-l-4 border-l-orange-500" :
                                    node.type === 'question' ? "border-l-4 border-l-blue-500" :
                                    node.type === 'condition' ? "border-l-4 border-l-amber-500" :
                                    node.type === 'sector' ? "border-l-4 border-l-red-500" :
                                    node.type === 'delay' ? "border-l-4 border-l-amber-500" :
                                    node.type === 'close' ? "border-l-4 border-l-emerald-500" :
                                    "border-l-4 border-l-cyan-500"
                                )}
                            >
                                {/* Header do Bloco */}
                                <div className="px-3.5 py-2.5 border-b border-border-theme/60 flex items-center justify-between shrink-0 bg-foreground/[0.02]">
                                    <div className="flex items-center gap-2 truncate">
                                        {node.type === 'start' && <Play className="w-3.5 h-3.5 text-green-400 shrink-0" />}
                                        {node.type === 'message' && <MessageSquare className="w-3.5 h-3.5 text-primary-theme shrink-0" />}
                                        {node.type === 'media' && <ImageIcon className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                                        {node.type === 'ai' && <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                                        {node.type === 'operator' && <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                        {node.type === 'create_ticket' && <Ticket className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                                        {node.type === 'question' && <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                                        {node.type === 'condition' && <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                        {node.type === 'sector' && <Users className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                                        {node.type === 'delay' && <Timer className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                        {node.type === 'close' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                        {node.type === 'http' && <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}

                                        <span className="font-extrabold text-[10px] uppercase tracking-wider text-foreground truncate">{node.title}</span>
                                    </div>

                                    {node.type !== 'start' && (
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteNode(node.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 text-text-muted hover:text-red-400 rounded-lg transition-all"
                                            title="Excluir Bloco"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Entrada Esquerda Única (Exceto Nó Start) */}
                                {node.type !== 'start' && (
                                    <div 
                                        onMouseEnter={() => {
                                            if (isDrawingConnection && connectingSource?.nodeId !== node.id) {
                                                setHoveredInletNodeId(node.id);
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setHoveredInletNodeId(null);
                                        }}
                                        className={clsx(
                                            "handle-connector absolute -left-2.5 top-[52px] w-4.5 h-4.5 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100",
                                            isConnecting ? "opacity-100 pointer-events-auto scale-100" : "",
                                            hoveredInletNodeId === node.id 
                                                ? "border-green-500 bg-green-950 scale-125 shadow-lg shadow-green-500/20" 
                                                : (isConnecting ? "border-accent-theme animate-pulse" : "border-border-theme hover:border-accent-theme")
                                        )}
                                        title="Conectar Entrada"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent-theme" />
                                    </div>
                                )}

                                {/* Corpo do Bloco (Resumo/Config) */}
                                <div className="p-3.5 flex-1 flex flex-col justify-start leading-normal text-left select-none text-[10px]">
                                    {node.type === 'start' && (
                                        <div className="flex items-center gap-2 pt-2">
                                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
                                            <span className="font-black text-green-400 uppercase tracking-wider text-[10px]">Início das Interações</span>
                                        </div>
                                    )}

                                    {node.type === 'message' && (
                                        <p className="text-foreground/90 line-clamp-3 font-medium leading-relaxed break-words text-[11px] whitespace-pre-wrap">{node.data.text || 'Sem mensagem configurada.'}</p>
                                    )}

                                    {/* MÍDIA / ARQUIVO (RENDERIZAÇÃO NO CANVAS) */}
                                    {node.type === 'media' && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="px-2 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/25 text-violet-300 font-bold text-[9px] uppercase tracking-wider">
                                                    {node.data.mediaType === 'image' ? '🖼️ Imagem' : node.data.mediaType === 'document' ? '📄 Documento' : node.data.mediaType === 'audio' ? '🎵 Áudio' : '🎥 Vídeo'}
                                                </span>
                                                <span className="text-[8px] text-text-muted truncate max-w-[120px] font-mono">
                                                    {node.data.mediaFileName || 'anexo'}
                                                </span>
                                            </div>
                                            <p className="text-foreground/80 line-clamp-2 text-[10px] font-medium leading-relaxed italic">
                                                "{node.data.mediaCaption || node.data.text || 'Sem legenda'}"
                                            </p>
                                        </div>
                                    )}

                                    {/* RESPOSTA IA (RENDERIZAÇÃO NO CANVAS) */}
                                    {node.type === 'ai' && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                                                    {node.data.aiModel || 'phi3'}
                                                </span>
                                                <span className="text-[8px] text-emerald-400 font-black uppercase">LLM Ativo</span>
                                            </div>
                                            <p className="text-text-muted line-clamp-2 text-[9px] font-mono leading-relaxed">
                                                {node.data.aiSystemPrompt || 'Instruções padrão do assistente virtual.'}
                                            </p>
                                        </div>
                                    )}

                                    {/* ATENDENTE ESPECÍFICO (RENDERIZAÇÃO NO CANVAS) */}
                                    {node.type === 'operator' && (
                                        <div className="space-y-1.5">
                                            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Transferir para Atendente:</p>
                                            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl truncate">
                                                <UserIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                <span className="text-xs font-black text-foreground truncate">
                                                    {node.data.operatorName || (users.find(u => String(u.id) === String(node.data.operatorId))?.full_name || 'Atendente')}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* CRIAR CHAMADO (RENDERIZAÇÃO NO CANVAS) */}
                                    {node.type === 'create_ticket' && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">Abrir Ticket:</span>
                                                <span className={clsx(
                                                    "text-[8px] font-black uppercase px-1.5 py-0.5 rounded",
                                                    node.data.ticketPriority === 'URGENT' ? "bg-red-500/20 text-red-400" :
                                                    node.data.ticketPriority === 'HIGH' ? "bg-orange-500/20 text-orange-400" :
                                                    node.data.ticketPriority === 'LOW' ? "bg-blue-500/20 text-blue-400" :
                                                    "bg-amber-500/20 text-amber-400"
                                                )}>
                                                    {node.data.ticketPriority || 'MEDIUM'}
                                                </span>
                                            </div>
                                            <p className="text-xs font-black text-foreground truncate bg-orange-500/10 border border-orange-500/20 px-2.5 py-1.5 rounded-xl">
                                                {node.data.ticketTitle || 'Atendimento via Chatbot'}
                                            </p>
                                        </div>
                                    )}

                                    {node.type === 'question' && (
                                        <div className="space-y-2.5">
                                            <p className="text-foreground/90 font-bold truncate text-[11px] whitespace-pre-wrap">{node.data.text}</p>
                                            <div className="space-y-1.5">
                                                {(node.data.options || []).map((opt, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className="relative flex items-center justify-between px-3 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-blue-400"
                                                    >
                                                        <span className="truncate pr-4">{idx + 1}. {opt}</span>
                                                        <div 
                                                            onMouseDown={(e) => handleOutletMouseDown(e, node.id, opt)}
                                                            className={clsx(
                                                                "handle-connector absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                                "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-blue-500 hover:scale-125"
                                                            )}
                                                            title={`Saída da Opção ${idx + 1}`}
                                                        >
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {node.type === 'condition' && (
                                        <div className="space-y-2.5">
                                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px]">
                                                <Clock className="w-3.5 h-3.5" />
                                                <span>{node.data.startTime} às {node.data.endTime}</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="relative flex items-center justify-between px-3 py-1.5 bg-green-500/5 border border-green-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-green-400">
                                                    <span>Dentro do Horário</span>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'yes')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-green-500 hover:scale-125"
                                                        )}
                                                        title="Dentro do Horário de Atendimento"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                                    </div>
                                                </div>

                                                <div className="relative flex items-center justify-between px-3 py-1.5 bg-red-500/5 border border-red-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-red-400">
                                                    <span>Fora do Horário</span>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'no')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-red-500 hover:scale-125"
                                                        )}
                                                        title="Fora do Horário de Atendimento"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {node.type === 'sector' && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Direcionar para:</p>
                                            <div className="text-xs font-black text-foreground/90 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl truncate">
                                                {sectors.find(s => s.id === node.data.sectorId)?.name || 'Setor Padrão'}
                                            </div>
                                        </div>
                                    )}

                                    {node.type === 'http' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">Webhook URL:</p>
                                                <span className="text-[8px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded font-black tracking-widest">{node.data.method || 'POST'}</span>
                                            </div>
                                            <p className="text-[9px] font-mono text-text-muted truncate bg-foreground/5 p-2 rounded-xl border border-border-theme">{node.data.url || 'https://...'}</p>
                                        </div>
                                    )}

                                    {node.type === 'delay' && (
                                        <div className="space-y-2.5">
                                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[10px]">
                                                <Timer className="w-3.5 h-3.5" />
                                                <span>Aguardar {node.data.delayValue || (node.data.delayUnit === 'minutes' ? Math.round((node.data.delaySeconds || 300) / 60) : (node.data.delaySeconds || 5))} {node.data.delayUnit === 'minutes' ? 'min' : 'seg'}</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="relative flex items-center justify-between px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-emerald-400">
                                                    <div className="flex items-center gap-1">
                                                        <MessageSquare className="w-2.5 h-2.5" />
                                                        <span>Se Enviar Mensagem</span>
                                                    </div>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'reply')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-emerald-500 hover:scale-125"
                                                        )}
                                                        title="Se o cliente responder durante a espera"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    </div>
                                                </div>

                                                <div className="relative flex items-center justify-between px-3 py-1.5 bg-amber-500/5 border border-amber-500/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-amber-400">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        <span>Sem Resposta (Timeout)</span>
                                                    </div>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'timeout')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-amber-500 hover:scale-125"
                                                        )}
                                                        title="Se o tempo esgotar sem resposta"
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {node.type === 'close' && (
                                        <div className="space-y-2 py-0.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] uppercase tracking-wider">Encerra Atendimento</span>
                                                </div>
                                                {node.data.requestRating && (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[8px] font-black uppercase tracking-wider">
                                                        <Star className="w-2.5 h-2.5 fill-amber-300" />
                                                        Avaliação ({node.data.ratingTimeoutMinutes || 5} min)
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-foreground/80 line-clamp-3 font-medium text-[10px] leading-relaxed break-words whitespace-pre-wrap">{node.data.text || 'Sem mensagem de despedida.'}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Saída Direita Única (Apenas para nós que não são terminais nem de ramificação) */}
                                {node.type !== 'question' && node.type !== 'condition' && node.type !== 'close' && node.type !== 'delay' && (
                                    <div 
                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, undefined)}
                                        className={clsx(
                                            "handle-connector absolute -right-2.5 top-[52px] w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-accent-theme hover:scale-125"
                                        )}
                                        title="Saída do Fluxo"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent-theme" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Painel Flutuante de Zoom no Canto Inferior Esquerdo */}
                <div className="absolute left-6 bottom-6 bg-card/85 border border-border-theme rounded-2xl p-2 flex items-center gap-2.5 z-30 shadow-2xl backdrop-blur-xl transition-all hover:border-border-theme/70">
                    <button 
                        onClick={() => adjustZoomAtPoint(-1, undefined, undefined, true)}
                        className="w-7 h-7 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border-theme flex items-center justify-center text-xs text-text-muted hover:text-foreground transition-all font-black active:scale-95"
                        title="Diminuir Zoom"
                    >
                        -
                    </button>
                    <span className="text-[10px] font-black text-text-muted tracking-wider w-10 text-center select-none font-mono">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button 
                        onClick={() => adjustZoomAtPoint(1, undefined, undefined, true)}
                        className="w-7 h-7 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border-theme flex items-center justify-center text-xs text-text-muted hover:text-foreground transition-all font-black active:scale-95"
                        title="Aumentar Zoom"
                    >
                        +
                    </button>
                    <div className="h-4 w-px bg-border-theme" />
                    <button 
                        onClick={resetZoom}
                        className="px-2.5 py-1.5 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border-theme flex items-center justify-center text-[8px] font-black uppercase tracking-wider text-text-muted hover:text-foreground transition-all active:scale-95"
                        title="Centralizar Visualização"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Painel Lateral de Configurações (Slide-In Inspector) */}
            <AnimatePresence>
                {selectedNode && (
                    <motion.aside
                        initial={{ x: 380, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 380, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="fixed right-0 top-0 h-screen w-[380px] bg-card/95 border-l border-border-theme shadow-2xl z-40 p-6 flex flex-col gap-6 backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between border-b border-border-theme pb-4">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">Configurar Bloco</h3>
                                <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest mt-0.5">Defina as ações e propriedades</p>
                            </div>
                            <button 
                                onClick={() => setSelectedNodeId(null)}
                                className="p-2 hover:bg-foreground/5 border border-border-theme hover:border-border-theme/70 rounded-xl transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar text-xs">
                            {/* Nome do Bloco */}
                            <div className="space-y-2">
                                <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Identificação do Bloco</label>
                                <input
                                    type="text"
                                    value={selectedNode.title}
                                    onChange={(e) => {
                                        const text = e.target.value;
                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, title: text } : n));
                                    }}
                                    className="w-full bg-background border border-border-theme focus:border-accent-theme rounded-xl p-3.5 font-bold outline-none text-foreground"
                                />
                            </div>

                            {/* Conteúdo específico: Mensagem */}
                            {selectedNode.type === 'message' && (
                                <div className="space-y-2">
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem de Texto</label>
                                    <textarea
                                        rows={6}
                                        value={selectedNode.data.text || ''}
                                        onChange={(e) => {
                                            const text = e.target.value;
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, text } } : n));
                                        }}
                                        placeholder="Olá! Como posso te ajudar hoje?"
                                        className="w-full bg-background border border-border-theme focus:border-accent-theme rounded-xl p-3.5 font-medium outline-none text-foreground leading-relaxed resize-none"
                                    />
                                </div>
                            )}

                            {/* Conteúdo específico: 1. MÍDIA / ARQUIVO */}
                            {selectedNode.type === 'media' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Tipo de Mídia</label>
                                        <div className="grid grid-cols-4 gap-1.5 bg-background p-1 rounded-xl border border-border-theme">
                                            {(['image', 'document', 'audio', 'video'] as const).map((mType) => (
                                                <button
                                                    key={mType}
                                                    type="button"
                                                    onClick={() => {
                                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                            ...n, 
                                                            data: { ...n.data, mediaType: mType } 
                                                        } : n));
                                                    }}
                                                    className={clsx(
                                                        "py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                                                        (selectedNode.data.mediaType || 'image') === mType
                                                            ? "bg-violet-500 text-white shadow-md"
                                                            : "text-text-muted hover:text-foreground"
                                                    )}
                                                >
                                                    {mType === 'image' ? 'Imagem' : mType === 'document' ? 'Doc' : mType === 'audio' ? 'Áudio' : 'Vídeo'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Origem da Mídia: Biblioteca ou URL */}
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Origem do Arquivo</label>
                                        <div className="grid grid-cols-2 gap-2 bg-background p-1 rounded-xl border border-border-theme">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { ...n.data, mediaSource: 'library' } 
                                                    } : n));
                                                }}
                                                className={clsx(
                                                    "py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                                                    (selectedNode.data.mediaSource || 'library') === 'library'
                                                        ? "bg-violet-500 text-white shadow-md"
                                                        : "text-text-muted hover:text-foreground"
                                                )}
                                            >
                                                Biblioteca Salva
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { ...n.data, mediaSource: 'url' } 
                                                    } : n));
                                                }}
                                                className={clsx(
                                                    "py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                                                    selectedNode.data.mediaSource === 'url'
                                                        ? "bg-violet-500 text-white shadow-md"
                                                        : "text-text-muted hover:text-foreground"
                                                )}
                                            >
                                                URL Externa
                                            </button>
                                        </div>
                                    </div>

                                    {/* Seleção de arquivo da biblioteca */}
                                    {(selectedNode.data.mediaSource || 'library') === 'library' && (
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Selecionar Arquivo da Base</label>
                                            {libraryFiles.length > 0 ? (
                                                <select
                                                    value={selectedNode.data.mediaUrl || ''}
                                                    onChange={(e) => {
                                                        const fileUrl = e.target.value;
                                                        const selFile = libraryFiles.find(f => f.url === fileUrl);
                                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                            ...n, 
                                                            data: { 
                                                                ...n.data, 
                                                                mediaUrl: fileUrl,
                                                                mediaFileName: selFile?.titulo || selFile?.filename || 'arquivo',
                                                                mediaCaption: selFile?.descricao || n.data.mediaCaption || ''
                                                            } 
                                                        } : n));
                                                    }}
                                                    className="w-full bg-background border border-border-theme rounded-xl p-3 font-bold outline-none text-foreground"
                                                >
                                                    <option value="">-- Escolha um arquivo --</option>
                                                    {libraryFiles.map(f => (
                                                        <option key={f.id} value={f.url} className="bg-card text-foreground">
                                                            {f.titulo || f.filename} ({f.ext || 'arquivo'})
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <div className="p-3 bg-violet-500/5 border border-violet-500/15 rounded-xl text-[10px] text-text-muted">
                                                    Nenhum arquivo pré-salvo na aba <strong>Ajustes &gt; WhatsApp &gt; Arquivos</strong>. Você pode informar uma URL direta.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* URL Externa */}
                                    {selectedNode.data.mediaSource === 'url' && (
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">URL do Arquivo / Mídia</label>
                                            <input
                                                type="text"
                                                value={selectedNode.data.mediaUrl || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { ...n.data, mediaUrl: val } 
                                                    } : n));
                                                }}
                                                placeholder="https://exemplo.com/tabela_precos.pdf"
                                                className="w-full bg-background border border-border-theme focus:border-violet-500 rounded-xl p-3 font-mono text-xs outline-none text-foreground"
                                            />
                                        </div>
                                    )}

                                    {/* Legenda / Mensagem de Acompanhamento */}
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Legenda / Texto da Mensagem</label>
                                        <textarea
                                            rows={3}
                                            value={selectedNode.data.mediaCaption || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, mediaCaption: val, text: val } 
                                                } : n));
                                            }}
                                            placeholder="Ex: Segue em anexo nossa apresentação e catálogo de serviços."
                                            className="w-full bg-background border border-border-theme focus:border-violet-500 rounded-xl p-3 font-medium outline-none text-foreground resize-none text-xs"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: 2. RESPOSTA COM IA */}
                            {selectedNode.type === 'ai' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Modelo de Linguagem (LLM Local / Ollama)</label>
                                        <select
                                            value={selectedNode.data.aiModel || 'phi3'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, aiModel: val } 
                                                } : n));
                                            }}
                                            className="w-full bg-background border border-border-theme rounded-xl p-3 font-bold outline-none text-foreground"
                                        >
                                            {aiModels.length > 0 ? (
                                                aiModels.map((m, idx) => (
                                                    <option key={idx} value={m.name || m} className="bg-card text-foreground">
                                                        {m.name || m}
                                                    </option>
                                                ))
                                            ) : (
                                                <>
                                                    <option value="phi3" className="bg-card text-foreground">phi3 (Ultra-Rápido)</option>
                                                    <option value="llama3" className="bg-card text-foreground">llama3 (Alta Inteligência)</option>
                                                    <option value="mistral" className="bg-card text-foreground">mistral (Equilibrado)</option>
                                                    <option value="gemma" className="bg-card text-foreground">gemma (Eficiente)</option>
                                                </>
                                            )}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Instruções / Prompt do Sistema</label>
                                        <textarea
                                            rows={5}
                                            value={selectedNode.data.aiSystemPrompt || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, aiSystemPrompt: val } 
                                                } : n));
                                            }}
                                            placeholder="Ex: Você é a atendente virtual da empresa. Seja cordial, responda dúvidas frequentes sobre horários e envie o link de agendamento."
                                            className="w-full bg-background border border-border-theme focus:border-indigo-500 rounded-xl p-3 font-medium outline-none text-foreground resize-none text-xs leading-relaxed"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem de Fallback (Se a IA falhar)</label>
                                        <input
                                            type="text"
                                            value={selectedNode.data.aiFallbackMessage || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, aiFallbackMessage: val } 
                                                } : n));
                                            }}
                                            placeholder="Desculpe, não consegui entender. Vou transferir seu contato."
                                            className="w-full bg-background border border-border-theme focus:border-indigo-500 rounded-xl p-3 font-bold text-xs outline-none text-foreground"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: 3. ATENDENTE ESPECÍFICO */}
                            {selectedNode.type === 'operator' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Atendente de Destino</label>
                                        <select
                                            value={selectedNode.data.operatorId || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const selectedUser = users.find(u => String(u.id) === String(val));
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { 
                                                        ...n.data, 
                                                        operatorId: val,
                                                        operatorName: selectedUser?.full_name || selectedUser?.username || 'Atendente'
                                                    } 
                                                } : n));
                                            }}
                                            className="w-full bg-background border border-border-theme rounded-xl p-3.5 font-bold outline-none text-foreground"
                                        >
                                            <option value="">-- Selecione o atendente --</option>
                                            {users.map(u => (
                                                <option key={u.id} value={u.id} className="bg-card text-foreground">
                                                    {u.full_name || u.username} ({u.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem de Transferência ao Cliente</label>
                                        <textarea
                                            rows={3}
                                            value={selectedNode.data.operatorTransferMessage || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, operatorTransferMessage: val } 
                                                } : n));
                                            }}
                                            placeholder="Ex: Estou transferindo você diretamente para o nosso especialista. Aguarde um instante."
                                            className="w-full bg-background border border-border-theme focus:border-emerald-500 rounded-xl p-3 font-medium outline-none text-foreground text-xs resize-none leading-relaxed"
                                        />
                                    </div>
                                    <p className="text-[10px] text-text-muted">Ao atingir este bloco, o chatbot é pausado e a conversa é atribuída diretamente à caixa de entrada do operador.</p>
                                </div>
                            )}

                            {/* Conteúdo específico: 4. CRIAR CHAMADO AUTOMÁTICO */}
                            {selectedNode.type === 'create_ticket' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Assunto do Chamado</label>
                                        <input
                                            type="text"
                                            value={selectedNode.data.ticketTitle || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, ticketTitle: val } 
                                                } : n));
                                            }}
                                            placeholder="Ex: Solicitação de Suporte via WhatsApp"
                                            className="w-full bg-background border border-border-theme focus:border-orange-500 rounded-xl p-3 font-bold text-xs outline-none text-foreground"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Prioridade</label>
                                            <select
                                                value={selectedNode.data.ticketPriority || 'MEDIUM'}
                                                onChange={(e) => {
                                                    const val = e.target.value as any;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { ...n.data, ticketPriority: val } 
                                                    } : n));
                                                }}
                                                className="w-full bg-background border border-border-theme rounded-xl p-2.5 font-bold outline-none text-foreground text-xs"
                                            >
                                                <option value="LOW" className="bg-card text-foreground">Baixa</option>
                                                <option value="MEDIUM" className="bg-card text-foreground">Média</option>
                                                <option value="HIGH" className="bg-card text-foreground">Alta</option>
                                                <option value="URGENT" className="bg-card text-foreground">Urgente</option>
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Categoria</label>
                                            <select
                                                value={selectedNode.data.ticketCategoryId || ''}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { ...n.data, ticketCategoryId: val } 
                                                    } : n));
                                                }}
                                                className="w-full bg-background border border-border-theme rounded-xl p-2.5 font-bold outline-none text-foreground text-xs"
                                            >
                                                {categories.map(c => (
                                                    <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem de Confirmação ao Cliente</label>
                                        <textarea
                                            rows={2}
                                            value={selectedNode.data.ticketConfirmationMessage || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                    ...n, 
                                                    data: { ...n.data, ticketConfirmationMessage: val } 
                                                } : n));
                                            }}
                                            placeholder="Ex: Seu chamado foi aberto com sucesso em nosso sistema! Em breve nossa equipe entrará em contato."
                                            className="w-full bg-background border border-border-theme focus:border-orange-500 rounded-xl p-3 font-medium outline-none text-foreground text-xs resize-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: Pergunta / Menu */}
                            {selectedNode.type === 'question' && (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Texto da Pergunta</label>
                                        <textarea
                                            rows={3}
                                            value={selectedNode.data.text || ''}
                                            onChange={(e) => {
                                                const text = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, text } } : n));
                                            }}
                                            placeholder="Digite a pergunta..."
                                            className="w-full bg-background border border-border-theme focus:border-accent-theme rounded-xl p-3.5 font-bold outline-none text-foreground resize-none"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted flex items-center justify-between">
                                            Opções de Resposta
                                            <button
                                                onClick={() => {
                                                    const currentOpts = selectedNode.data.options || [];
                                                    const newOpt = `Opção ${currentOpts.length + 1}`;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: [...currentOpts, newOpt] } } : n));
                                                }}
                                                className="text-accent-theme hover:text-accent-theme/90 font-black text-[9px] flex items-center gap-1 uppercase tracking-widest"
                                            >
                                                <Plus className="w-3 h-3" /> Adicionar
                                            </button>
                                        </label>

                                        <div className="space-y-2.5">
                                            {(selectedNode.data.options || []).map((opt, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={opt}
                                                        onChange={(e) => {
                                                            const text = e.target.value;
                                                            const copy = [...(selectedNode.data.options || [])];
                                                            const oldKey = copy[idx];
                                                            setEdges(prev => prev.map(edge => {
                                                                if (edge.source === selectedNode.id && edge.sourceHandle === oldKey) {
                                                                    return { ...edge, sourceHandle: text };
                                                                }
                                                                return edge;
                                                            }));

                                                            copy[idx] = text;
                                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: copy } } : n));
                                                        }}
                                                        className="flex-1 bg-background border border-border-theme focus:border-accent-theme rounded-xl px-3 py-2 text-xs font-bold outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const optToDelete = selectedNode.data.options?.[idx];
                                                            const copy = (selectedNode.data.options || []).filter((_, i) => i !== idx);
                                                            setEdges(prev => prev.filter(e => !(e.source === selectedNode.id && e.sourceHandle === optToDelete)));
                                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: copy } } : n));
                                                        }}
                                                        className="p-2 hover:bg-red-500/10 border border-border-theme hover:border-red-500/20 text-text-muted hover:text-red-400 rounded-lg transition-colors shrink-0"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: Horário */}
                            {selectedNode.type === 'condition' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Início do Expediente</label>
                                            <input
                                                type="time"
                                                value={selectedNode.data.startTime || '08:00'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, startTime: val } } : n));
                                                }}
                                                className="w-full bg-background border border-border-theme rounded-xl p-3 font-bold outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Fim do Expediente</label>
                                            <input
                                                type="time"
                                                value={selectedNode.data.endTime || '18:00'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, endTime: val } } : n));
                                                }}
                                                className="w-full bg-background border border-border-theme rounded-xl p-3 font-bold outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2.5">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Dias de Funcionamento</label>
                                        <div className="space-y-2 bg-background p-4 rounded-2xl border border-border-theme">
                                            {['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map((day, idx) => {
                                                const currentDays = selectedNode.data.workDays || [];
                                                const checked = currentDays.includes(idx);
                                                return (
                                                    <label key={idx} className="flex items-center gap-3.5 cursor-pointer py-0.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                const newDays = checked 
                                                                    ? currentDays.filter(d => d !== idx)
                                                                    : [...currentDays, idx].sort();
                                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, workDays: newDays } } : n));
                                                            }}
                                                            className="w-4 h-4 rounded border-border-theme text-accent-theme focus:ring-accent-theme/20 bg-background"
                                                        />
                                                        <span className="font-bold text-foreground/90">{day}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: Setor */}
                            {selectedNode.type === 'sector' && (
                                <div className="space-y-2">
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Setor de Direcionamento</label>
                                    <select
                                        value={selectedNode.data.sectorId || ''}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, sectorId: val } } : n));
                                        }}
                                        className="w-full bg-background border border-border-theme rounded-xl p-3.5 font-bold outline-none text-foreground"
                                    >
                                        {sectors.map(s => (
                                            <option key={s.id} value={s.id} className="bg-card text-foreground">{s.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-text-muted mt-1">Ao atingir este ponto, o chatbot finaliza e o cliente entra na fila do departamento selecionado.</p>
                                </div>
                            )}

                            {/* Conteúdo específico: HTTP */}
                            {selectedNode.type === 'http' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Método HTTP</label>
                                        <select
                                            value={selectedNode.data.method || 'POST'}
                                            onChange={(e) => {
                                                const val = e.target.value as 'GET' | 'POST';
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, method: val } } : n));
                                            }}
                                            className="w-full bg-background border border-border-theme rounded-xl p-3.5 font-bold outline-none text-foreground"
                                        >
                                            <option value="GET" className="bg-card text-foreground">GET</option>
                                            <option value="POST" className="bg-card text-foreground">POST</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Webhook URL</label>
                                        <input
                                            type="text"
                                            value={selectedNode.data.url || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, url: val } } : n));
                                            }}
                                            placeholder="https://api.seuservidor.com/webhook"
                                            className="w-full bg-background border border-border-theme rounded-xl p-3.5 font-bold outline-none text-foreground"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: Tempo de Espera */}
                            {selectedNode.type === 'delay' && (
                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Unidade de Tempo</label>
                                        
                                        <div className="grid grid-cols-2 gap-2 bg-background p-1 rounded-xl border border-border-theme">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const curVal = selectedNode.data.delayValue || (selectedNode.data.delayUnit === 'minutes' ? Math.round((selectedNode.data.delaySeconds || 300) / 60) : (selectedNode.data.delaySeconds || 5));
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { 
                                                            ...n.data, 
                                                            delayUnit: 'seconds',
                                                            delayValue: curVal,
                                                            delaySeconds: curVal
                                                        } 
                                                    } : n));
                                                }}
                                                className={clsx(
                                                    "py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                                    (selectedNode.data.delayUnit || 'seconds') === 'seconds' 
                                                        ? "bg-amber-500 text-black shadow-md font-black" 
                                                        : "text-text-muted hover:text-foreground"
                                                )}
                                            >
                                                Segundos
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const curVal = selectedNode.data.delayValue || (selectedNode.data.delayUnit === 'minutes' ? Math.round((selectedNode.data.delaySeconds || 300) / 60) : Math.max(1, Math.round((selectedNode.data.delaySeconds || 300) / 60)));
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { 
                                                            ...n.data, 
                                                            delayUnit: 'minutes',
                                                            delayValue: curVal,
                                                            delaySeconds: curVal * 60
                                                        } 
                                                    } : n));
                                                }}
                                                className={clsx(
                                                    "py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                                                    selectedNode.data.delayUnit === 'minutes' 
                                                        ? "bg-amber-500 text-black shadow-md font-black" 
                                                        : "text-text-muted hover:text-foreground"
                                                )}
                                            >
                                                Minutos
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-text-muted font-bold">Duração do Intervalo</span>
                                                <span className="text-xs font-black text-amber-400 font-mono px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                    {selectedNode.data.delayValue || (selectedNode.data.delayUnit === 'minutes' ? Math.round((selectedNode.data.delaySeconds || 300) / 60) : (selectedNode.data.delaySeconds || 5))} {selectedNode.data.delayUnit === 'minutes' ? 'minuto(s)' : 'segundo(s)'}
                                                </span>
                                            </div>
                                            <input
                                                type="range"
                                                min={1}
                                                max={selectedNode.data.delayUnit === 'minutes' ? 60 : 120}
                                                step={1}
                                                value={selectedNode.data.delayValue || (selectedNode.data.delayUnit === 'minutes' ? Math.round((selectedNode.data.delaySeconds || 300) / 60) : (selectedNode.data.delaySeconds || 5))}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    const isMin = selectedNode.data.delayUnit === 'minutes';
                                                    setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                        ...n, 
                                                        data: { 
                                                            ...n.data, 
                                                            delayValue: val,
                                                            delaySeconds: isMin ? val * 60 : val
                                                        } 
                                                    } : n));
                                                }}
                                                className="w-full accent-amber-500 cursor-pointer h-2 bg-background rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-3.5 bg-amber-500/5 border border-amber-500/15 rounded-2xl space-y-2 text-[10px] text-amber-300/90 leading-relaxed">
                                        <div className="flex items-center gap-2 font-bold text-amber-400">
                                            <Timer className="w-4 h-4 shrink-0" />
                                            <span>Ramificação Inteligente de Inatividade</span>
                                        </div>
                                        <p>
                                            Este bloco possui <strong>2 saídas</strong>:
                                        </p>
                                        <ul className="list-disc pl-4 space-y-1 text-text-muted">
                                            <li><strong className="text-emerald-400">Se Enviar Mensagem:</strong> ativada se o cliente responder antes do tempo estipulado.</li>
                                            <li><strong className="text-amber-400">Sem Resposta (Timeout):</strong> ativada automaticamente se o tempo esgotar sem resposta.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Conteúdo específico: Finalizar Atendimento */}
                            {selectedNode.type === 'close' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem Final de Encerramento</label>
                                        <textarea
                                            rows={3}
                                            value={selectedNode.data.text || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, text: val } } : n));
                                            }}
                                            placeholder="Ex: Atendimento finalizado pelo assistente virtual. Obrigado pelo contato!"
                                            className="w-full bg-background border border-border-theme rounded-xl p-3.5 font-medium outline-none text-foreground text-xs resize-none"
                                        />
                                    </div>

                                    <div className="p-4 bg-background border border-border-theme rounded-2xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Star className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                                                <div>
                                                    <span className="text-[11px] font-bold text-foreground block">Solicitar Avaliação</span>
                                                    <span className="text-[9px] text-text-muted">Pesquisa de satisfação (1 a 5 ⭐)</span>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedNode.data.requestRating}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setNodes(prev => prev.map(n => n.id === selectedNode.id ? { 
                                                            ...n, 
                                                            data: { 
                                                                ...n.data, 
                                                                requestRating: checked,
                                                                ratingMessage: n.data.ratingMessage || 'Por favor, avalie nosso atendimento de 1 a 5 estrelas ⭐'
                                                            } 
                                                        } : n));
                                                    }}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-9 h-5 bg-foreground/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                            </label>
                                        </div>

                                        {selectedNode.data.requestRating && (
                                            <div className="space-y-3.5 pt-2 border-t border-border-theme/60 animate-in fade-in duration-200">
                                                <div className="space-y-1.5">
                                                    <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem da Avaliação</label>
                                                    <textarea
                                                        rows={2}
                                                        value={selectedNode.data.ratingMessage || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, ratingMessage: val } } : n));
                                                        }}
                                                        placeholder="Ex: Por favor, avalie nosso atendimento de 1 a 5 estrelas ⭐"
                                                        className="w-full bg-card border border-border-theme rounded-xl p-2.5 font-medium outline-none text-foreground text-xs resize-none leading-relaxed"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Mensagem de Agradecimento</label>
                                                    <textarea
                                                        rows={2}
                                                        value={selectedNode.data.ratingThanksMessage || ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, ratingThanksMessage: val } } : n));
                                                        }}
                                                        placeholder="Ex: Obrigado pela sua avaliação! Tenha um ótimo dia."
                                                        className="w-full bg-card border border-border-theme rounded-xl p-2.5 font-medium outline-none text-foreground text-xs resize-none leading-relaxed"
                                                    />
                                                </div>

                                                <div className="space-y-2 pt-1">
                                                    <div className="flex items-center justify-between">
                                                        <label className="block text-[9px] font-black uppercase tracking-widest text-text-muted">Tempo Limite para Avaliar</label>
                                                        <span className="text-xs font-black text-amber-400 font-mono px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                                            {selectedNode.data.ratingTimeoutMinutes || 5} min
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={15}
                                                        step={1}
                                                        value={selectedNode.data.ratingTimeoutMinutes || 5}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value);
                                                            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, ratingTimeoutMinutes: val } } : n));
                                                        }}
                                                        className="w-full accent-amber-500 cursor-pointer h-2 bg-card rounded-lg"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Simulador de Chatbot Flutuante (Lado Direito) */}
            <AnimatePresence>
                {isTestChatOpen && (
                    <motion.div
                        initial={{ x: 400, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 400, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="fixed right-4 bottom-4 top-20 w-[360px] bg-card/95 border border-border-theme shadow-2xl rounded-3xl z-40 p-5 flex flex-col backdrop-blur-xl"
                    >
                        {/* Chat Header */}
                        <div className="flex items-center justify-between border-b border-border-theme pb-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-accent-theme animate-pulse" />
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-wider">Testar Chatbot</h3>
                                    <p className="text-[8px] text-text-muted font-bold uppercase tracking-widest mt-0.5">Visualização em tempo real</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={startFlowTest}
                                    className="p-2 hover:bg-foreground/5 border border-border-theme rounded-xl transition-all text-text-muted hover:text-foreground"
                                    title="Reiniciar Simulação"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => setIsTestChatOpen(false)}
                                    className="p-2 hover:bg-foreground/5 border border-border-theme rounded-xl transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Chat Messages */}
                        <div className="flex-1 overflow-y-auto my-4 space-y-3.5 pr-1.5 custom-scrollbar flex flex-col">
                            {testMessages.map((msg, idx) => (
                                <div 
                                    key={idx}
                                    className={clsx(
                                        "max-w-[85%] rounded-2xl p-3.5 text-[11px] leading-relaxed font-medium break-words whitespace-pre-wrap",
                                        msg.sender === 'bot' ? "bg-foreground/5 text-foreground self-start border border-border-theme" :
                                        msg.sender === 'client' ? "bg-primary-theme text-white self-end shadow-md shadow-primary-theme/10" :
                                        "bg-card/50 text-text-muted border border-border-theme self-center text-center text-[9px] font-black uppercase tracking-widest max-w-full"
                                    )}
                                >
                                    {msg.text}
                                </div>
                            ))}
                        </div>

                        {/* Ações de Teste para Avaliação do Cliente */}
                        {nodes.find(n => n.id === testCurrentNodeId)?.type === 'close' && nodes.find(n => n.id === testCurrentNodeId)?.data.requestRating && (
                            <div className="border-t border-border-theme pt-3.5 space-y-2 shrink-0 animate-in fade-in duration-200">
                                <p className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1.5">Simular Avaliação do Cliente (1 a 5 ⭐):</p>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => handleSimulateRating(star)}
                                            className="py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 hover:scale-105 active:scale-95"
                                            title={`Avaliar com ${star} estrela(s)`}
                                        >
                                            <span>{star}</span>
                                            <Star className="w-3 h-3 fill-amber-400" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Ações de Teste para o Nó de Tempo de Espera */}
                        {nodes.find(n => n.id === testCurrentNodeId)?.type === 'delay' && (
                            <div className="border-t border-border-theme pt-3.5 space-y-2 shrink-0 animate-in fade-in duration-200">
                                <p className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-1.5">Simular Ação do Cliente durante a Espera:</p>
                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleSimulateDelayAction('reply')}
                                        className="w-full text-left px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span>Simular: Cliente Envia Mensagem</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSimulateDelayAction('timeout')}
                                        className="w-full text-left px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2"
                                    >
                                        <Clock className="w-3.5 h-3.5" />
                                        <span>Simular: Tempo Esgotado (Timeout)</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Chat Options (Buttons) */}
                        {testActiveOptions.length > 0 && (
                            <div className="border-t border-border-theme pt-3.5 space-y-2 shrink-0">
                                <p className="text-[8px] text-text-muted font-black uppercase tracking-widest mb-2.5">Escolha uma opção:</p>
                                <div className="grid grid-cols-1 gap-2">
                                    {testActiveOptions.map((opt, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSelectTestOption(opt)}
                                            className="w-full text-left px-4 py-3 bg-foreground/5 hover:bg-accent-theme/10 border border-border-theme hover:border-accent-theme/20 text-foreground/90 hover:text-accent-theme rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200"
                                        >
                                            {idx + 1}. {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Menu de Contexto da Linha de Conexão */}
            {edgeContextMenu && (
                <div 
                    style={{ 
                        left: edgeContextMenu.x, 
                        top: edgeContextMenu.y,
                    }}
                    className="fixed bg-card/95 border border-border-theme rounded-2xl shadow-2xl z-50 p-1.5 flex flex-col min-w-[140px] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={async () => {
                            const confirmed = await askConfirm({
                                title: 'Excluir Conexão?',
                                message: 'Tem certeza de que deseja remover esta linha de conexão do fluxo?',
                                confirmText: 'Excluir',
                                cancelText: 'Cancelar',
                                type: 'danger'
                            });
                            if (confirmed) {
                                setEdges(prev => prev.filter(e => e.id !== edgeContextMenu.edgeId));
                            }
                            setEdgeContextMenu(null);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 text-red-400 hover:text-red-300 font-bold rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-2 transition-all duration-200 cursor-pointer"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Linha
                    </button>
                </div>
            )}
        </div>
    );
}
