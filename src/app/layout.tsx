import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPerfil, getUsuarioId } from "@/lib/sessao";
import { getRevendaAtiva } from "@/lib/revendas";
import { LogoutButton } from "@/components/LogoutButton";
import { SessaoInvalida } from "@/components/SessaoInvalida";
import { RegistroDeUso } from "@/components/RegistroDeUso";
import { PresencaAoVivo } from "@/components/PresencaAoVivo";
import { PesquisaSatisfacao } from "@/components/PesquisaSatisfacao";
import { BotaoLideranca } from "@/components/BotaoLideranca";
import { Notificacoes } from "@/components/Notificacoes";
import { SeletorRevenda } from "@/components/SeletorRevenda";
import { ToastProvider } from "@/components/Toast";
import { SincronizarPush } from "@/components/SincronizarPush";
import "./globals.css";

export const metadata: Metadata = {
  title: "App Colaborador — LIMA",
  description: "App interno de colaboradores da LIMA Logística",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "App Colaborador",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b4da2",
  width: "device-width",
  initialScale: 1,
  // No iPhone, tocar num campo com fonte menor que 16px faz o Safari dar
  // zoom sozinho e não voltar. A causa foi corrigida (campos agora têm 16px
  // no celular); travar a escala evita o zoom acidental por pinça.
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [usuarioId, perfil, revenda] = await Promise.all([
    getUsuarioId(),
    getPerfil(),
    getRevendaAtiva(),
  ]);
  const user = perfil ? { id: perfil.id } : null;

  // Login válido mas sem cadastro (conta removida, por exemplo): mostramos
  // um aviso com saída em vez da tela quebrada, sem "Olá!" sem nome.
  const sessaoOrfa = Boolean(usuarioId) && !perfil;

  // Cadastrado, mas sem vínculo com revenda nenhuma. Não é erro da pessoa:
  // é cadastro pela metade. O app não tem o que mostrar -- todo conteúdo
  // pertence a uma revenda -- então avisa em vez de abrir vazio.
  const semRevenda = Boolean(perfil) && !revenda;

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ToastProvider>
          <header className="relative bg-primary text-white">
            <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4">
              <div className="flex h-11 shrink-0 items-center rounded-lg bg-white px-2 py-1 shadow-md sm:h-14 sm:rounded-xl sm:px-3 sm:py-2">
                <Image
                  src="/logo-v2.png"
                  alt="Cervejaria Ambev Lima"
                  width={195}
                  height={130}
                  quality={100}
                  className="h-8 w-auto object-contain sm:h-11"
                  priority
                />
              </div>
              {/* No celular o titulo sai: o logo ja identifica, e o espaco e
                  necessario para os botoes caberem sem cortar. */}
              <div className="hidden min-w-0 flex-1 sm:block">
                <p className="text-base font-bold leading-tight">
                  App do Colaborador
                </p>
                <p className="text-xs font-medium leading-tight text-gold">
                  LIMA Logística
                </p>
              </div>
              {user && (
                <nav className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                  <SeletorRevenda />
                  <Notificacoes />
                  <BotaoLideranca />
                  <Link
                    href="/minha-conta"
                    className="rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20"
                  >
                    <span className="sm:hidden">Conta</span>
                    <span className="hidden sm:inline">Minha conta</span>
                  </Link>
                  <LogoutButton />
                </nav>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-6">
            {sessaoOrfa ? (
              <SessaoInvalida />
            ) : semRevenda ? (
              <SessaoInvalida
                titulo="Cadastro sem revenda"
                mensagem="Seu acesso ainda não foi vinculado a uma revenda. Peça ao Admin para concluir o cadastro."
              />
            ) : (
              children
            )}
          </main>
          {perfil && (
            <>
              <RegistroDeUso />
              <PresencaAoVivo
                id={perfil.id}
                nome={perfil.nome}
                cargo={perfil.cargo}
              />
              <PesquisaSatisfacao />
              <SincronizarPush />
            </>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
