import { NextRequest, NextResponse } from 'next/server';

// Proxy server-side para desconectar a sessão do WhatsApp.
// Evita bloqueios de CORS/loopback do browser (Kaspersky/Opera GX).
export async function POST(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/disconnect`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Servidor WhatsApp respondeu com status ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') {
            console.log(`[WhatsApp Proxy] Servidor offline ou inacessível ao desconectar.`);
        } else {
            console.error('[WhatsApp Proxy Disconnect] Erro:', error.message);
        }
        return NextResponse.json({ error: 'Servidor WhatsApp offline ou inacessível' }, { status: 503 });
    }
}
