import DashboardCharts from '@/components/DashboardCharts';
import Link from 'next/link';
import { MessageSquarePlus, ListFilter, LayoutDashboard, BookOpen, Search, Monitor } from 'lucide-react';

/**
 * Página Inicial (Dashboard Executivo).
 * Ponto de entrada do sistema que apresenta indicadores de desempenho,
 * acesso rápido a funcionalidades de IA e atalhos para os principais módulos.
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Cabeçalho da Página com Título de Impacto */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border-theme pb-10">
          <div className="space-y-2">
            <h1 className="text-4xl font-black font-display tracking-tight italic uppercase">
              Dashboard <span className="text-accent-theme">Executivo</span>
            </h1>
            <p className="text-[var(--color-text-muted)] text-sm font-medium mt-1">Visão geral do sistema e indicadores operacionais</p>
          </div>

          <Link
            href="/monitor"
            className="p-3 bg-accent-theme/10 hover:bg-accent-theme/20 rounded-2xl text-accent-theme transition-all group"
            title="Abrir Painel de Monitoramento"
          >
            <Monitor className="w-8 h-8 group-hover:scale-110 transition-transform" />
          </Link>
        </div>

        {/* Gráficos e Matriz de Situação (Componente Dinâmico) */}
        <DashboardCharts />

        {/* Grid de Ações Rápidas e Informações do Sistema */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card: Chat IA / Busca Técnica */}
          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme">
            <div className="p-3 bg-blue-500/10 rounded-2xl w-fit mb-6 text-blue-500 group-hover:scale-110 transition-transform">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-[0.625rem] font-black italic text-[var(--color-text-muted)] uppercase tracking-[-0.05em] mb-4">Busca Rápida IA</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">Utilize o assistente de IA para consultar manuais e resolver problemas técnicos usando a nossa base de conhecimento.</p>
            <Link href="/chat" className="text-accent-theme hover:underline text-sm font-black flex items-center gap-1 uppercase tracking-widest">
              Procurar solução &rarr;
            </Link>
          </div>

          {/* Card: Atalho para Abrir Ticket (com IA) */}
          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme">
            <div className="p-3 bg-accent-theme/10 rounded-2xl w-fit mb-6 text-accent-theme group-hover:scale-110 transition-transform">
              <MessageSquarePlus className="w-6 h-6" />
            </div>
            <h3 className="text-[0.625rem] font-black italic text-[var(--color-text-muted)] uppercase tracking-[-0.05em] mb-4">Abertura de Chamados</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">Crie novos tickets manualmente ou use a IA para preencher os dados a partir de logs ou prints de erro.</p>
            <Link href="/tickets/new" className="text-accent-theme hover:underline text-sm font-black flex items-center gap-1 uppercase tracking-widest">
              Abrir ticket &rarr;
            </Link>
          </div>

          {/* Card: Info de Backup e Operação Local */}
          <div className="glass-card p-8 rounded-3xl transition-all group hover:scale-[1.02] border-border-theme relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <BookOpen className="w-16 h-16" />
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-2xl w-fit mb-6 text-emerald-500 group-hover:scale-110 transition-transform">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-[0.625rem] font-black italic text-[var(--color-text-muted)] uppercase tracking-[-0.05em] mb-4">Soberania de Dados</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6 leading-relaxed">O sistema opera 100% offline. Seus dados estão salvos de forma segura e privada no servidor central.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
