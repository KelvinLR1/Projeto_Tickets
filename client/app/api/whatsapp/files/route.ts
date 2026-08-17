import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const action = req.nextUrl.searchParams.get('action') || 'search';
    const baseUrl = whatsappUrl.replace(/\/$/, '');

    let targetUrl = `${baseUrl}/api/files/search`;
    if (action === 'stats') {
        targetUrl = `${baseUrl}/api/files/stats`;
    } else {
        const queryParams = new URLSearchParams();
        ['q', 'type', 'grupo', 'setor_id', 'page', 'limit', 'cliente_jid'].forEach(param => {
            const val = req.nextUrl.searchParams.get(param);
            if (val) queryParams.set(param, val);
        });
        targetUrl = `${baseUrl}/api/files/search?${queryParams.toString()}`;
    }

    try {
        const response = await fetch(targetUrl, { cache: 'no-store' });
        if (!response.ok) {
            return NextResponse.json({ error: `Erro do servidor WhatsApp: ${response.status}` }, { status: response.status });
        }
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Servidor WhatsApp inacessível' }, { status: 503 });
    }
}

export async function POST(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/files/metadata`;

    try {
        const body = await req.json();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/files/delete`;

    try {
        const body = await req.json();
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
