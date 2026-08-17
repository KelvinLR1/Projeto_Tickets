import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const baseUrl = whatsappUrl.replace(/\/$/, '');

    const queryParams = new URLSearchParams();
    ['usuario_id', 'search', 'categoria', 'grupo', 'setor_id', 'escopo'].forEach(param => {
        const val = req.nextUrl.searchParams.get(param);
        if (val) queryParams.set(param, val);
    });

    const targetUrl = `${baseUrl}/api/quick-replies?${queryParams.toString()}`;

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
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/quick-replies`;

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

export async function PUT(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });

    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/quick-replies/${id}`;

    try {
        const body = await req.json();
        const response = await fetch(targetUrl, {
            method: 'PUT',
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
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });

    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/quick-replies/${id}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
