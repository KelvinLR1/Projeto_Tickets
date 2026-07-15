import { NextRequest, NextResponse } from 'next/server';

// Esta rota roda no servidor Node.js do Next.js, sem restrições de CORS do browser.
// Faz o proxy da requisição do browser → Next.js server → WhatsApp Node.js service.
export async function GET(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/status`;

    try {
        const response = await fetch(targetUrl, {
            cache: 'no-store',
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Servidor WhatsApp respondeu com status ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
            console.log(`[WhatsApp Proxy] Servidor offline ou inacessível em: ${targetUrl}`);
        } else {
            console.error('[WhatsApp Proxy Status] Erro:', error.message);
        }
        return NextResponse.json({ error: 'Servidor WhatsApp offline ou inacessível' }, { status: 503 });
    }
}
