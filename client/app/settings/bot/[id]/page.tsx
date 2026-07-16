'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    Play, MessageSquare, HelpCircle, Clock, Users, Globe, Plus, Trash2, 
    Save, ArrowLeft, AlertCircle, X, ChevronRight, CheckCircle2, RotateCcw, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import clsx from 'clsx';
import { getSectors, Sector } from '@/lib/api';
import { useNotification } from '@/components/NotificationProvider';

type BotNode = {
    id: string;
    type: 'start' | 'message' | 'question' | 'condition' | 'sector' | 'http';
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
    };
};

type BotEdge = {
    id: string;
    source: string;
    sourceHandle?: string; // option index or 'yes'/'no'
    target: string;
    targetHandle?: string; // 'inlet'
    vertices?: { x: number; y: number }[];
};

type WhatsAppChannel = {
    id: string;
    name: string;
    port: number;
    color: string;
    description?: string;
    sector_id?: number | null;
    bot_flow?: {
        nodes: BotNode[];
        edges: BotEdge[];
    } | null;
};

// Altura de cada nó baseada no tipo para cálculos matemáticos precisos de cabos
const getNodeHeight = (node: BotNode) => {
    switch (node.type) {
        case 'question':
            const optCount = node.data.options?.length || 0;
            return 110 + optCount * 42;
        case 'condition':
            return 160;
        default:
            return 120;
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
    const [testMessages, setTestMessages] = useState<{ sender: 'bot' | 'client' | 'system'; text: string }[]>([]);
    const [testCurrentNodeId, setTestCurrentNodeId] = useState<string | null>(null);
    const [testActiveOptions, setTestActiveOptions] = useState<string[]>([]);

    // Carregar Canais e Setores
    useEffect(() => {
        const loadData = async () => {
            try {
                // Carregar setores do banco
                const sectorData = await getSectors();
                setSectors(sectorData);

                // Carregar canais
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
                // Notificar usuário ou redirecionar
                alert('Fluxo do Bot salvo com sucesso! Reinicie o projeto para aplicar.');
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
            setTestMessages(prev => [...prev, { sender: 'system', text: 'Conecte o nó de Início a um bloco de Mensagem ou Pergunta.' }]);
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
    };

    const handleSelectTestOption = (option: string) => {
        setTestMessages(prev => [...prev, { sender: 'client', text: option }]);
        setTestActiveOptions([]);

        const edge = edges.find(e => e.source === testCurrentNodeId && e.sourceHandle === option);
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
            case 'http':
                title = 'Requisição HTTP';
                data = { url: 'https://api.exemplo.com/webhooks', method: 'POST' };
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
        
        // Inicializa o ponto final temporário nas coordenadas do outlet
        const coords = getHandleCoords(nodeId, handleId, false);
        setTempConnectionEnd(coords);
    };

    // Arrastar Nós - Eventos
    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        if ((e.target as HTMLElement).closest('.handle-connector') || (e.target as HTMLElement).closest('button')) {
            return; // Ignora arrastar se clicou em conexões ou botões
        }
        e.preventDefault();
        e.stopPropagation(); // Evita que dispare o panning do background
        setDraggingNodeId(nodeId);
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            dragStartClient.current = { x: e.clientX, y: e.clientY };
            dragStartNodePos.current = { x: node.x, y: node.y };
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        // Inicia o panning do background se clicar no fundo do canvas
        if (target === canvasRef.current || target.classList.contains('canvas-background') || target.tagName.toLowerCase() === 'svg') {
            e.preventDefault();
            setIsPanning(true);
            panStartClient.current = { x: e.clientX, y: e.clientY };
            panStartPos.current = { x: pan.x, y: pan.y };
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (draggingNodeId) {
            // Drag de nó compensando a escala de zoom
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
            // Arrastar o background (Pan)
            const dx = e.clientX - panStartClient.current.x;
            const dy = e.clientY - panStartClient.current.y;
            setPan({
                x: panStartPos.current.x + dx,
                y: panStartPos.current.y + dy
            });
        } else if (isDrawingConnection && canvasRef.current) {
            // Desenhar cabo temporário seguindo a posição do mouse em coordenadas reais do Canvas
            const rect = canvasRef.current.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left - pan.x) / zoom;
            const canvasY = (e.clientY - rect.top - pan.y) / zoom;
            setTempConnectionEnd({ x: canvasX, y: canvasY });
        }
    };

    const handleCanvasMouseUp = () => {
        if (isDrawingConnection) {
            if (hoveredInletNodeId && connectingSource) {
                // Finaliza a nova conexão criada por arrasto (evita duplicados idênticos)
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

    // Helper para calcular a distância entre um ponto e um segmento de reta
    const getDistanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const l2 = (ax - bx) ** 2 + (ay - by) ** 2;
        if (l2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((px - (ax + t * (bx - ax))) ** 2 + (py - (ay + t * (by - ay))) ** 2);
    };

    // Localizar em qual segmento da linha de conexão inserir o novo vértice
    const getInsertionIndexForVertex = (edge: BotEdge, x: number, y: number) => {
        const start = getHandleCoords(edge.source, edge.sourceHandle, false);
        const end = getHandleCoords(edge.target, edge.targetHandle, true);
        const points = [start, ...(edge.vertices || []), end];
        
        let minDistance = Infinity;
        let insertIndex = 0;
        
        for (let i = 0; i < points.length - 1; i++) {
            const dist = getDistanceToSegment(x, y, points[i].x, points[i].y, points[i+1].x, points[i+1].y);
            if (dist < minDistance) {
                minDistance = dist;
                insertIndex = i;
            }
        }
        return insertIndex;
    };

    // Calcular o ponto médio de uma conexão para renderizar o botão de excluir
    const getEdgeMidpoint = (start: { x: number; y: number }, end: { x: number; y: number }, vertices?: { x: number; y: number }[]) => {
        const points = [start, ...(vertices || []), end];
        const midIdx = Math.floor((points.length - 1) / 2);
        const p1 = points[midIdx];
        const p2 = points[midIdx + 1];
        return {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        };
    };

    // Suavizar cantos das linhas com curvas de Bezier quadráticas
    const getRoundedCornerPath = (points: { x: number; y: number }[], radius: number) => {
        if (points.length === 0) return '';
        if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
        if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

        let path = `M ${points[0].x} ${points[0].y}`;

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
            const v2 = { x: next.x - curr.x, y: next.y - curr.y };

            const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
            const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

            const r = Math.min(radius, len1 / 2, len2 / 2);

            if (r > 0) {
                const a = {
                    x: curr.x - (v1.x / len1) * r,
                    y: curr.y - (v1.y / len1) * r
                };
                const b = {
                    x: curr.x + (v2.x / len2) * r,
                    y: curr.y + (v2.y / len2) * r
                };
                path += ` L ${a.x} ${a.y} Q ${curr.x} ${curr.y} ${b.x} ${b.y}`;
            } else {
                path += ` L ${curr.x} ${curr.y}`;
            }
        }

        const last = points[points.length - 1];
        path += ` L ${last.x} ${last.y}`;
        return path;
    };

    const handleAddVertex = (edgeId: string, x: number, y: number) => {
        setEdges(prev => prev.map(edge => {
            if (edge.id === edgeId) {
                const currentVertices = edge.vertices || [];
                const insertIndex = getInsertionIndexForVertex(edge, x, y);
                const newVertices = [...currentVertices];
                newVertices.splice(insertIndex, 0, { x, y });
                return { ...edge, vertices: newVertices };
            }
            return edge;
        }));
    };

    const handleRemoveVertex = (edgeId: string, index: number) => {
        setEdges(prev => prev.map(edge => {
            if (edge.id === edgeId) {
                const newVertices = (edge.vertices || []).filter((_, idx) => idx !== index);
                return { ...edge, vertices: newVertices };
            }
            return edge;
        }));
    };

    const handleVertexMouseDown = (e: React.MouseEvent, edgeId: string, index: number) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingVertex({ edgeId, index });
        dragStartClient.current = { x: e.clientX, y: e.clientY };
        
        const edge = edges.find(ed => ed.id === edgeId);
        const vertex = edge?.vertices?.[index];
        if (vertex) {
            dragStartNodePos.current = { x: vertex.x, y: vertex.y };
        }
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

    // Fechar menu de contexto da linha ao clicar fora
    useEffect(() => {
        const closeEdgeMenu = () => setEdgeContextMenu(null);
        window.addEventListener('click', closeEdgeMenu);
        window.addEventListener('contextmenu', closeEdgeMenu);
        return () => {
            window.removeEventListener('click', closeEdgeMenu);
            window.removeEventListener('contextmenu', closeEdgeMenu);
        };
    }, []);

    const adjustZoomAtPoint = (direction: 1 | -1, focusX?: number, focusY?: number, animate = false) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        const x = focusX !== undefined ? focusX : rect.width / 2;
        const y = focusY !== undefined ? focusY : rect.height / 2;

        if (animate) {
            setIsTransitionActive(true);
            setTimeout(() => {
                setIsTransitionActive(false);
            }, 250);
        } else {
            setIsTransitionActive(false);
        }

        const zoomFactor = 0.05;
        setZoom(prev => {
            const nextZoom = Math.max(0.3, Math.min(2.0, prev + direction * zoomFactor));
            const roundedZoom = parseFloat(nextZoom.toFixed(2));

            setPan(prevPan => {
                const canvasX = (x - prevPan.x) / prev;
                const canvasY = (y - prevPan.y) / prev;
                return {
                    x: x - canvasX * roundedZoom,
                    y: y - canvasY * roundedZoom
                };
            });

            return roundedZoom;
        });
    };

    const handleCanvasWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const direction = e.deltaY < 0 ? 1 : -1;
        adjustZoomAtPoint(direction, mouseX, mouseY, false);
    };

    const resetZoom = () => {
        setIsTransitionActive(true);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setTimeout(() => {
            setIsTransitionActive(false);
        }, 250);
    };

    // Gerenciador de conexões por cliques
    const handleHandleClick = (nodeId: string, handleId?: string, isInput?: boolean) => {
        if (isInput) {
            // Clicou em uma Entrada (Inlet)
            if (connectingSource) {
                // Se já temos uma Saída selecionada, cria a conexão (evita duplicados idênticos)
                const exists = edges.some(e => 
                    e.source === connectingSource.nodeId && 
                    e.sourceHandle === connectingSource.handleId && 
                    e.target === nodeId
                );
                if (!exists) {
                    const newEdge: BotEdge = {
                        id: `edge-${Date.now()}`,
                        source: connectingSource.nodeId,
                        sourceHandle: connectingSource.handleId,
                        target: nodeId,
                        targetHandle: 'inlet'
                    };
                    setEdges(prev => [...prev, newEdge]);
                }
                setConnectingSource(null);
            }
        } else {
            // Clicou em uma Saída (Outlet)
            setConnectingSource({ nodeId, handleId });
        }
    };

    // Calcular as coordenadas exatas dos conectores para desenhar os cabos SVG
    const getHandleCoords = (nodeId: string, handleId?: string, isInput?: boolean) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { x: 0, y: 0 };

        const nodeWidth = 260; // Largura do nó configurada no Tailwind
        const nodeHeight = getNodeHeight(node);

        if (isInput) {
            // Conector esquerdo (inlet)
            return { x: node.x, y: node.y + 60 };
        } else {
            // Conectores direitos (outlets)
            if (node.type === 'condition') {
                if (handleId === 'yes') {
                    return { x: node.x + nodeWidth, y: node.y + 68 };
                } else if (handleId === 'no') {
                    return { x: node.x + nodeWidth, y: node.y + 110 };
                }
            } else if (node.type === 'question') {
                const options = node.data.options || [];
                const idx = options.indexOf(handleId || '');
                if (idx !== -1) {
                    return { x: node.x + nodeWidth, y: node.y + 75 + idx * 42 };
                }
            }
            // Saída padrão para outros nós
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
                        onClick={() => {
                            if(confirm('Limpar fluxo de bot?')) {
                                setNodes([{ id: 'node-start', type: 'start', x: 100, y: 250, title: 'Início', data: {} }]);
                                setEdges([]);
                                setSelectedNodeId(null);
                            }
                        }}
                        className="px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-theme text-text-muted hover:text-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 duration-300"
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
            <div className="h-14 bg-background/40 border-b border-border-theme flex items-center px-6 gap-3.5 z-20 shrink-0 relative backdrop-blur-md overflow-x-auto custom-scrollbar">
                <span className="text-[9px] font-black text-text-muted uppercase tracking-[0.2em] mr-2 shrink-0">Adicionar Bloco:</span>
                
                <button 
                    onClick={() => handleAddNode('message')} 
                    className="flex items-center gap-2 px-4 py-2 bg-accent-theme/5 hover:bg-accent-theme/10 border border-accent-theme/15 hover:border-accent-theme/30 text-accent-theme hover:text-accent-theme/90 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 shrink-0"
                >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Enviar Mensagem
                </button>
                
                <button 
                    onClick={() => handleAddNode('question')} 
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/15 hover:border-blue-500/30 text-blue-400 hover:text-blue-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 shrink-0"
                >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Fazer Pergunta (Menu)
                </button>
                
                <button 
                    onClick={() => handleAddNode('condition')} 
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 hover:border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 shrink-0"
                >
                    <Clock className="w-3.5 h-3.5" />
                    Horário Funcionamento
                </button>
                
                <button 
                    onClick={() => handleAddNode('sector')} 
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 text-red-400 hover:text-red-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 shrink-0"
                >
                    <Users className="w-3.5 h-3.5" />
                    Direcionar Setor
                </button>
                
                <button 
                    onClick={() => handleAddNode('http')} 
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/15 hover:border-cyan-500/30 text-cyan-400 hover:text-cyan-300 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 duration-200 shrink-0"
                >
                    <Globe className="w-3.5 h-3.5" />
                    Integração HTTP
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
                            
                            // Calcula a linha de caminho: Bezier clássica se não houver vértices, cantos suavizados caso existam
                            let d = '';
                            if (!edge.vertices || edge.vertices.length === 0) {
                                const dx = Math.abs(end.x - start.x) * 0.5;
                                const controlOffset = Math.max(80, dx);
                                d = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
                            } else {
                                const points = [start, ...edge.vertices, end];
                                d = getRoundedCornerPath(points, 20); // Raio de 20px para cantos suavizados e premium
                            }

                            const midPoint = getEdgeMidpoint(start, end, edge.vertices);

                            return (
                                <g key={edge.id} className="group pointer-events-auto">
                                    {/* Linha invisível maior para facilitar cliques e duplo clique para vértice */}
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
                                    {/* A linha visível */}
                                    <path 
                                        d={d} 
                                        stroke="var(--color-accent-theme)" 
                                        strokeWidth="3" 
                                        fill="none" 
                                        className="transition-[stroke,stroke-width] duration-200 group-hover:stroke-red-500 group-hover:stroke-[4px]"
                                        markerEnd="url(#arrow)"
                                        onContextMenu={(e) => handleEdgeContextMenu(e, edge.id)}
                                    />
                                    
                                    {/* Alças/Handles de controle dos vértices (Apenas visíveis ao passar o mouse sobre o grupo/linha) */}
                                    {(edge.vertices || []).map((vertex, vIdx) => (
                                        <circle
                                            key={`${edge.id}-v-${vIdx}`}
                                            cx={vertex.x}
                                            cy={vertex.y}
                                            r={7}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 fill-[var(--color-accent-theme)] stroke-[var(--color-card)] stroke-2 cursor-grab active:cursor-grabbing hover:fill-[var(--color-primary-theme)] hover:stroke-white transition-colors duration-150"
                                            onMouseDown={(e) => handleVertexMouseDown(e, edge.id, vIdx)}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveVertex(edge.id, vIdx);
                                            }}
                                        >
                                            <title>Arraste para mover. Clique duplo para excluir.</title>
                                        </circle>
                                    ))}
                                </g>
                            );
                        })}
                        
                        {/* Linha de conexão temporária ao arrastar */}
                        {isDrawingConnection && tempConnectionEnd && connectingSource && (() => {
                            const start = getHandleCoords(connectingSource.nodeId, connectingSource.handleId, false);
                            const dx = Math.abs(tempConnectionEnd.x - start.x) * 0.5;
                            const controlOffset = Math.max(80, dx);
                            const d = `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${tempConnectionEnd.x - controlOffset} ${tempConnectionEnd.y}, ${tempConnectionEnd.x} ${tempConnectionEnd.y}`;
                            
                            return (
                                <path 
                                    d={d} 
                                    stroke="var(--color-accent-theme)" 
                                    strokeWidth="2.5" 
                                    strokeDasharray="4 4" 
                                    fill="none" 
                                    className="animate-[dash_10s_linear_infinite]"
                                    markerEnd="url(#arrow)"
                                />
                            );
                        })()}
                    </svg>
{/* Renderizador de Nós (Cards) */}
                    {nodes.map(node => {
                        const isSelected = selectedNodeId === node.id;
                        const nHeight = getNodeHeight(node);
                        const isConnecting = connectingSource !== null;
                        
                        return (
                            <div
                                key={node.id}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                className={clsx(
                                    "absolute w-[260px] bg-card border rounded-3xl shadow-2xl select-none z-10 flex flex-col backdrop-blur-md group",
                                    draggingNodeId !== node.id && "transition-[border-color,transform,box-shadow,ring] duration-200",
                                    isSelected 
                                        ? "border-accent-theme ring-2 ring-accent-theme/20 scale-[1.01]" 
                                        : "border-border-theme hover:border-border-theme/70"
                                )}
                                style={{ 
                                    left: node.x, 
                                    top: node.y,
                                    height: nHeight
                                }}
                            >
                                {/* Cabeçalho do Bloco */}
                                <div 
                                    className={clsx(
                                        "px-4 py-3 flex items-center justify-between border-b shrink-0 cursor-move rounded-t-3xl",
                                        node.type === 'start' ? "bg-green-500/5 border-green-500/10" :
                                        node.type === 'message' ? "bg-violet-500/5 border-violet-500/10" :
                                        node.type === 'question' ? "bg-blue-500/5 border-blue-500/10" :
                                        node.type === 'condition' ? "bg-amber-500/5 border-amber-500/10" :
                                        node.type === 'sector' ? "bg-red-500/5 border-red-500/10" :
                                        "bg-cyan-500/5 border-cyan-500/10"
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className={clsx(
                                                "w-6 h-6 rounded-lg flex items-center justify-center text-white",
                                                node.type === 'start' ? "bg-green-500" :
                                                node.type === 'message' ? "bg-violet-500" :
                                                node.type === 'question' ? "bg-blue-500" :
                                                node.type === 'condition' ? "bg-amber-500" :
                                                node.type === 'sector' ? "bg-red-500" :
                                                "bg-cyan-500"
                                            )}
                                        >
                                            {node.type === 'start' && <Play className="w-3.5 h-3.5 fill-white" />}
                                            {node.type === 'message' && <MessageSquare className="w-3.5 h-3.5" />}
                                            {node.type === 'question' && <HelpCircle className="w-3.5 h-3.5" />}
                                            {node.type === 'condition' && <Clock className="w-3.5 h-3.5" />}
                                            {node.type === 'sector' && <Users className="w-3.5 h-3.5" />}
                                            {node.type === 'http' && <Globe className="w-3.5 h-3.5" />}
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-foreground">{node.title}</span>
                                    </div>
                                    {node.id !== 'node-start' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                                            className="p-1 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-text-muted hover:text-red-400 rounded-lg transition-all"
                                            title="Excluir Bloco"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Conector de Entrada (Esquerda) */}
                                {node.type !== 'start' && (
                                    <div 
                                        onMouseEnter={() => {
                                            if (isDrawingConnection) {
                                                setHoveredInletNodeId(node.id);
                                            }
                                        }}
                                        onMouseLeave={() => {
                                            setHoveredInletNodeId(null);
                                        }}
                                        className={clsx(
                                            "handle-connector absolute -left-2.5 top-13 w-4.5 h-4.5 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
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
                                <div className="p-4 flex-1 flex flex-col justify-center leading-normal text-left select-none text-[10px]">
                                    {node.type === 'start' && (
                                        <span className="font-bold text-green-400 uppercase tracking-widest">Início das Interações</span>
                                    )}
                                    {node.type === 'message' && (
                                        <p className="text-foreground/80 line-clamp-3 font-medium leading-relaxed">{node.data.text}</p>
                                    )}
                                    {node.type === 'question' && (
                                        <div className="space-y-2">
                                            <p className="text-foreground/80 font-bold truncate">{node.data.text}</p>
                                            <div className="space-y-1 relative">
                                                {(node.data.options || []).map((opt, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className="flex items-center justify-between px-2.5 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-md text-[9px] font-black uppercase tracking-wider text-blue-400 relative"
                                                    >
                                                        <span className="truncate pr-4">{idx + 1}. {opt}</span>
                                                        <div 
                                                            onMouseDown={(e) => handleOutletMouseDown(e, node.id, opt)}
                                                            className={clsx(
                                                                "handle-connector absolute -right-4.5 top-1 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                                "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-blue-500 hover:scale-125"
                                                            )}
                                                        >
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {node.type === 'condition' && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                                                <Clock className="w-3.5 h-3.5" />
                                                <span>{node.data.startTime} - {node.data.endTime}</span>
                                            </div>
                                            <div className="space-y-2 relative">
                                                {/* Saída SIM */}
                                                <div className="flex items-center justify-between px-2 py-1 bg-green-500/5 border border-green-500/10 rounded-md text-[9px] font-black uppercase tracking-wider text-green-400">
                                                    <span>Dentro do Horário</span>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'yes')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-4.5 top-1 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-green-500 hover:scale-125"
                                                        )}
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                                                    </div>
                                                </div>

                                                {/* Saída NÃO */}
                                                <div className="flex items-center justify-between px-2 py-1 bg-red-500/5 border border-red-500/10 rounded-md text-[9px] font-black uppercase tracking-wider text-red-400 mt-1.5">
                                                    <span>Fora do Horário</span>
                                                    <div 
                                                        onMouseDown={(e) => handleOutletMouseDown(e, node.id, 'no')}
                                                        className={clsx(
                                                            "handle-connector absolute -right-4.5 top-8 w-4 h-4 rounded-full border bg-background flex items-center justify-center cursor-pointer transition-all z-20",
                                                            "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 border-border-theme hover:border-red-500 hover:scale-125"
                                                        )}
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {node.type === 'sector' && (
                                        <div className="flex flex-col gap-2">
                                            <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Direcionar para:</p>
                                            <div className="text-xs font-black text-foreground/90">
                                                {sectors.find(s => s.id === node.data.sectorId)?.name || 'Setor Padrão'}
                                            </div>
                                        </div>
                                    )}
                                    {node.type === 'http' && (
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">Webhook URL:</p>
                                            <p className="text-[9px] font-mono text-text-muted truncate">{node.data.url}</p>
                                            <span className="text-[8px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded font-black tracking-widest">{node.data.method}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Saída Direita Única (Apenas para nós de fluxo sequencial simples) */}
                                {node.type !== 'question' && node.type !== 'condition' && (
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

            {/* Painel Lateral de Configurações (Slide-In) */}
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

                            {/* Conteúdo específico por tipo */}
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
                                                            
                                                            // Se alterou a chave da opção, precisamos ajustar as conexões apontando para a chave antiga!
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
                                                            // Remove conexões vinculadas à opção excluída
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
                                        "max-w-[85%] rounded-2xl p-3.5 text-[11px] leading-relaxed font-medium break-words",
                                        msg.sender === 'bot' ? "bg-foreground/5 text-foreground self-start border border-border-theme" :
                                        msg.sender === 'client' ? "bg-primary-theme text-white self-end shadow-md shadow-primary-theme/10" :
                                        "bg-card/50 text-text-muted border border-border-theme self-center text-center text-[9px] font-black uppercase tracking-widest max-w-full"
                                    )}
                                >
                                    {msg.text}
                                </div>
                            ))}
                        </div>

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
