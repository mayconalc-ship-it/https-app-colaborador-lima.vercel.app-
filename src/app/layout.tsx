import type { Metadata, Viewport } from "next";
import { after } from "next/server";
import Link from "next/link";
import { varrerSeVencida } from "@/lib/lembretes-server";
import { getPerfil, getUsuarioId } from "@/lib/sessao";
import { getRevendaAtiva } from "@/lib/revendas";
import { MarcaApp } from "@/components/MarcaApp";
import { LogoutButton } from "@/components/LogoutButton";
import { SessaoInvalida } from "@/components/SessaoInvalida";
import { RegistroDeUso } from "@/components/RegistroDeUso";
import { PresencaAoVivo } from "@/components/PresencaAoVivo";
import { PesquisaSatisfacao } from "@/components/PesquisaSatisfacao";
import { BotaoLideranca } from "@/components/BotaoLideranca";
import { Notificacoes } from "@/components/Notificacoes";
import { SeletorRevenda } from "@/components/SeletorRevenda";
import { Provedores } from "@/components/Provedores";
import { SincronizarPush } from "@/components/SincronizarPush";
import "./globals.css";

export const metadata: Metadata = {
  title: "App do Colaborador",
  description:
    "O dia a dia da operação na mão do colaborador: jornal, rota, remuneração, 5S e mais.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // É este nome que fica embaixo do ícone na tela inicial do iPhone.
    title: "Colaborador",
    statusBarStyle: "default",
  },
  // Sem `icons` aqui de propósito: o próprio Next monta as tags a partir
  // de app/icon.svg e app/apple-icon.png. Repetir nesta lista sobrescreve
  // o que ele gerou -- e foi assim que o ícone antigo sobrevivia.
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

  // O app é o próprio relógio dos lembretes.
  //
  // `after` roda DEPOIS que a resposta já foi entregue, então isto não
  // custa um milissegundo de tela para ninguém. A trava está no banco
  // (migration 045): a esmagadora maioria das visitas só faz um UPDATE
  // que não casa e volta -- varrer de verdade acontece no máximo uma vez
  // a cada 5 minutos, não uma vez por visita.
  //
  // Só para quem está logado: a tela de login não tem por que mexer na
  // fila, e deixá-la de fora mantém o caminho do primeiro acesso limpo.
  //
  // Nasceu porque o GitHub Actions não cumpre o `*/15` que promete --
  // medido em 21/08/2026, o intervalo real ficou entre 54 e 216 minutos.
  // Com isto, no expediente a fila anda em minutos; de madrugada, quando
  // ninguém abre o app, o GitHub continua sendo a rede de segurança.
  //
  // Falha calada de propósito: o app não pode quebrar porque a varredura
  // deu erro, e o próximo visitante tenta de novo.
  if (perfil) {
    after(async () => {
      try {
        await varrerSeVencida();
      } catch {
        // idem
      }
    });
  }

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Provedores>
          {/* sticky, não fixed: o cabeçalho continua ocupando espaço no
              fluxo, então o conteúdo começa abaixo dele sem precisar de
              padding-top compensatório espalhado por cada página.

              z-30 fica acima do conteúdo mas ABAIXO dos overlays de tela
              cheia (foto ampliada e pesquisa em z-50, toast em z-60,
              confirmação em z-70) -- modal cobrindo o cabeçalho é o certo.
              A lista do sino é filha daqui e sobe junto. */}
          <header className="sticky top-0 z-30 bg-primary text-white shadow-md">
            {/* A marca não encolhe: espremida virava uma tira de 12px,
                pior que ausente. Abaixo de 360px ela sai de cena --
                nessa largura a escolha é entre a marca e o botão Sair, e
                Sair ganha. Acima disso tudo cabe junto.

                Quem manda aqui é a revenda: a logo da empresa é conteúdo,
                sobe pelo Admin em Revendas. Sem logo, fica a marca do
                próprio app -- que é o certo para uma unidade que ainda
                não mandou a dela, e não um buraco no cabeçalho.

                A logo da empresa ganha caixa branca porque marca de
                empresa é desenhada para fundo claro; a marca do app já
                nasceu para viver no azul e dispensa a caixa. */}
            <div className="mx-auto flex min-w-0 max-w-3xl items-center gap-1.5 px-2 py-3 sm:gap-3 sm:px-4 sm:py-4">
              {revenda?.logoUrl ? (
                <div className="flex h-10 shrink-0 items-center rounded-lg bg-white px-1.5 py-1 shadow-md max-[359px]:hidden sm:h-14 sm:rounded-xl sm:px-3 sm:py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={revenda.logoUrl}
                    alt={revenda.nome}
                    className="h-7 w-auto max-w-[120px] object-contain sm:h-11 sm:max-w-[180px]"
                  />
                </div>
              ) : (
                <MarcaApp
                  tamanho={40}
                  className="h-10 w-10 shrink-0 text-white max-[359px]:hidden sm:h-12 sm:w-12"
                />
              )}
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
                <nav className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                  <SeletorRevenda />
                  <Notificacoes />
                  <BotaoLideranca />
                  <Link
                    href="/minha-conta"
                    aria-label="Minha conta"
                    className="shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20"
                  >
                    {/* No celular vira só o ícone: com o sino, a revenda e
                        o Sair na mesma linha, a palavra "Conta" era o que
                        sobrava de menos essencial. */}
                    <span className="sm:hidden" aria-hidden="true">
                      👤
                    </span>
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
        </Provedores>
      </body>
    </html>
  );
}
