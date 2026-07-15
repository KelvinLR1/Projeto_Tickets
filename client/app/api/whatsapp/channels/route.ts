import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// whatsapp-channels.json fica na raiz do projeto (um nível acima de /client)
const CHANNELS_FILE = path.join(process.cwd(), '..', 'whatsapp-channels.json');

export async function GET() {
    try {
        if (!fs.existsSync(CHANNELS_FILE)) {
            return NextResponse.json([]);
        }
        const raw = fs.readFileSync(CHANNELS_FILE, 'utf-8');
        return NextResponse.json(JSON.parse(raw));
    } catch {
        return NextResponse.json([]);
    }
}

export async function POST(req: NextRequest) {
    try {
        const channels = await req.json();
        fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
