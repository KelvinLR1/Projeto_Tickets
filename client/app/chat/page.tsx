import Chat from '@/components/Chat';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ChatPage() {
    return (
        <main className="min-h-screen p-8 bg-background text-foreground transition-all duration-500">
            <div className="w-full space-y-10">
                {/* Header Area */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-border-theme pb-10">
                    <div className="space-y-2">
                        <h1 className="text-5xl font-black font-display tracking-tight italic uppercase">
                            Soluções <span className="text-accent-theme">IA</span>
                        </h1>
                        <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">
                            Inteligência artificial integrada à base de conhecimento.
                        </p>
                    </div>
                </div>

                <div className="w-full">
                    <Chat />
                </div>
            </div>
        </main>
    );
}
