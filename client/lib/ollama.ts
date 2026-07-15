import axios from 'axios';

// Usando proxy interno do Next.js para evitar problemas de CORS
// Usando proxy interno do Next.js para evitar problemas de CORS
const OLLAMA_PROXY_URL = '/api/ollama';

const getSystemConfig = () => {
    if (typeof window !== 'undefined') {
        const localConfig = localStorage.getItem('system_config');
        if (localConfig) return JSON.parse(localConfig);
    }
    return null;
};

const getOllamaUrl = () => {
    if (typeof window === 'undefined') return '/api/ollama';

    const config = getSystemConfig();
    // aiSource can be 'local' or 'centralized' (default)
    if (config?.aiSource === 'local') {
        return config.ollamaUrl || 'http://localhost:11434';
    }
    return '/api/ollama';
};

// Configurar CORS no Ollama pode ser necessário.
// No Windows: set OLLAMA_ORIGINS="*" e reiniciar ollama.

export const chatWithOllama = async (
    model: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
) => {
    try {
        // Ollama espera apenas a string base64, sem o prefixo "data:image/..."
        // Precisamos limpar as imagens antes de enviar
        const cleanMessages = messages.map((msg) => ({
            ...msg,
            images: msg.images
                ? msg.images.map((img) => (img.includes(',') ? img.split(',')[1] : img))
                : undefined,
        }));

        const response = await fetch(getOllamaUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: cleanMessages,
                options: {
                    num_ctx: 512, // Reduzido de 1024 - menos contexto = mais rápido
                    temperature: 0.2, // Aumentado de 0.1 - mais rápido com boa qualidade
                    num_predict: 80, // Reduzido de 150 - respostas curtas são suficientes
                    top_k: 20, // Aumentado para mais variedade
                    top_p: 0.5, // Aumentado para respostas mais naturais
                },
                keep_alive: "1h", // Mantém o modelo na memória por 1 hora (evita delay de carregamento)
                stream: true,
            }),
            signal,
        });

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            // Ollama envia JSONs separados por linha ou em chunks incompletos?
            // Geralmente envia objetos JSON completos por linha no modo stream.
            // Precisamos parsear cada linha.
            const lines = chunk.split('\n').filter((line) => line.trim() !== '');

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.message && json.message.content) {
                        onChunk(json.message.content);
                    }
                    if (json.done) {
                        return;
                    }
                } catch (e) {
                    console.error('Error parsing JSON chunk:', e);
                }
            }
        }
    } catch (error) {
        console.error('Ollama Chat Error:', error);
        throw error;
    }
};

export const getOllamaModels = async () => {
    try {
        const response = await fetch(getOllamaUrl());
        if (!response.ok) {
            console.log('[Ollama] Servico indisponivel ou nao instalado localmente (Ollama offline).');
            return [];
        }
        const data = await response.json();
        return data.models || [];
    } catch (error) {
        console.log('[Ollama] Nao foi possivel obter modelos (Ollama provavelmente offline).');
        return [];
    }
};
