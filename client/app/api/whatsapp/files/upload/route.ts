import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const whatsappUrl = req.nextUrl.searchParams.get('url') || 'http://127.0.0.1:5000';
    const targetUrl = `${whatsappUrl.replace(/\/$/, '')}/api/files/bank/upload`;

    try {
        const formData = await req.formData();
        const response = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return NextResponse.json({ error: errData.error || `Erro do servidor WhatsApp: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Servidor WhatsApp inacessível' }, { status: 503 });
    }
}
