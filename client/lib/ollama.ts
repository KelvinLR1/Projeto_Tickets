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

// Configurar CORS no Ollama pode ser necessário.
// No Windows: set OLLAMA_ORIGINS="*" e reiniciar ollama.

export const chatWithOllama = async (
    model: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void
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

        const response = await fetch(OLLAMA_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: cleanMessages,
                options: {
                    num_ctx: 1024, // Limita contexto para economizar RAM/CPU (Padrão é 2048 ou 4096)
                    temperature: 0.3, // Mais focado, menos alucinações
                    num_thread: 4, // Tenta forçar uso de threads (pode variar por CPU)
                },
                stream: true,
            }),
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
        const response = await fetch(OLLAMA_PROXY_URL);
        if (!response.ok) throw new Error('Failed to fetch models');
        const data = await response.json();
        return data.models || [];
    } catch (error) {
        console.error('Error listing models:', error);
        return [];
    }
};
