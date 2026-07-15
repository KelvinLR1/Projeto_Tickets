import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const ollamaUrl = 'http://127.0.0.1:11434/api/chat';

        const response = await fetch(ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
        return new NextResponse(response.body, {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        if (error.code === 'ECONNREFUSED') {
            console.log('[Ollama Proxy] Ollama offline ou nao instalado localmente (127.0.0.1:11434).');
        } else {
            console.error('Proxy POST Error:', error);
        }
        return NextResponse.json({ error: 'Ollama offline or not installed' }, { status: 503 });
    }
}

export async function GET() {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
            console.log('[Ollama Proxy] Ollama offline ou nao instalado localmente (127.0.0.1:11434).');
        } else {
            console.error('Proxy GET Error:', error);
        }
        return NextResponse.json({ error: 'Ollama offline or not installed' }, { status: 503 });
    }
}
