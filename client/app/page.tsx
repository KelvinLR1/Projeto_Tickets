import DashboardCharts from '@/components/DashboardCharts';
import Link from 'next/link';
import { MessageSquarePlus, ListFilter, LayoutDashboard, BookOpen, Search } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-border-theme pb-8 transition-colors">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent-theme/10 rounded-2xl">
              <LayoutDashboard className="w-8 h-8 text-accent-theme" />
            </div>
            <div>
              <h1 className="text-4xl font-black font-display tracking-tight">Dashboard Executivo</h1>
              <p className="text-[var(--color-text-muted)] italic">Visão geral do sistema e indicadores LAN</p>
            </div>
          </div>
        </div>

        {/* Dashboards Visuais */}
        <DashboardCharts />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme">
            <div className="p-3 bg-blue-500/10 rounded-2xl w-fit mb-6 text-blue-500 group-hover:scale-110 transition-transform">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-4">Busca Rápida IA</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">Utilize o assistente de IA para consultar manuais e resolver problemas técnicos usando a nossa base de conhecimento.</p>
            <Link href="/chat" className="text-accent-theme hover:underline text-sm font-black flex items-center gap-1 uppercase tracking-widest">
              Procurar solução &rarr;
            </Link>
          </div>

          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme">
            <div className="p-3 bg-accent-theme/10 rounded-2xl w-fit mb-6 text-accent-theme group-hover:scale-110 transition-transform">
              <MessageSquarePlus className="w-6 h-6" />
            </div>
            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-4">Abertura de Chamados</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">Crie novos tickets manualmente ou use a IA para preencher os dados a partir de logs ou prints de erro.</p>
            <Link href="/tickets/new" className="text-accent-theme hover:underline text-sm font-black flex items-center gap-1 uppercase tracking-widest">
              Abrir ticket &rarr;
            </Link>
          </div>

          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <BookOpen className="w-16 h-16" />
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl w-fit mb-6 text-emerald-500 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-4">Backup Local</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">O sistema opera 100% offline. Seus dados estão salvos de forma segura no servidor central da LAN.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
