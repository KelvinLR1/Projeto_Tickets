import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TicketFlow",
  description: "Sistema de Gestão de Atendimento",
};

import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NotificationProvider } from "@/components/NotificationProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { TimerProvider } from "@/components/TimerProvider";
import { SystemSettingsProvider } from "@/components/SystemSettingsProvider";
import AppLayout from "@/components/AppLayout";

/**
 * Layout Raiz (Global Entry Point).
 * Define as fontes globais, metadados básicos e a hierarquia de Provedores de Contexto.
 * A ordem dos provedores é crítica para o funcionamento das dependências (ex: Notification precisa do Auth).
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" translate="no" className={`notranslate ${geistSans.variable} ${geistMono.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <script src="/config.js" suppressHydrationWarning></script>
      </head>
      <body className="notranslate" translate="no">
        {/* Hierarquia de Provedores: Tema -> Configurações -> Autenticação -> Notificações -> Timer -> Layout */}
        <ThemeProvider>
          <SystemSettingsProvider>
            <AuthProvider>
              <NotificationProvider>
                <TimerProvider>
                  <AppLayout>
                    {children}
                  </AppLayout>
                </TimerProvider>
              </NotificationProvider>
            </AuthProvider>
          </SystemSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
