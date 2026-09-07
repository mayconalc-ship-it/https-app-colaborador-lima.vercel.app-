import { requireGestor } from "@/lib/require-admin";
import { VoltarAoPainel } from "@/components/VoltarAoPainel";
import { AdminSidebar, type GrupoNav } from "@/components/admin/AdminSidebar";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaAtiva, getModulosDaRevenda } from "@/lib/revendas";
import {
  EMOJI_GRUPO_ADMIN,
  GRUPOS_DO_ADMIN,
  MODULOS,
  MODULOS_DO_DONO,
  ehOwner,
  podeFazer,
} from "@/lib/acessos";

/**
 * Faixa presente em todo o Modo Liderança.
 *
 * Serve para a pessoa saber em qual modo está -- é fácil esquecer que
 * trocou. A saída para o app NÃO fica aqui: ela é o botão do topo, que
 * troca de modo. Ter as duas saídas obrigava a escolher entre dois botões
 * de destino parecido, e era daí que vinha a confusão.
 *
 * Sobra para esta faixa um caminho só: subir das telas internas de volta
 * ao painel do modo.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await requireGestor();
  const dono = ehOwner(perfil.role);

  // Mesmo filtro de admin/page.tsx: a revenda usa o módulo? e esta pessoa
  // pode abri-lo? A barra lateral só é a apresentação nova -- quem decide
  // o que aparece continua sendo exatamente essa dupla checagem.
  const [concessoes, revenda] = await Promise.all([
    getConcessoes(),
    getRevendaAtiva(),
  ]);
  const modulosDaRevenda = revenda
    ? await getModulosDaRevenda(revenda.id)
    : new Set<string>();

  const liberados = MODULOS.filter(
    (m) =>
      // Sem subGrupoDe: só o módulo "guarda-chuva" (ex.: Produtividade do
      // Armazém) aparece na barra lateral. Reepack, Despejo, Empilhadeira,
      // Recebimento, 5S do Armazém, Picking e Carretas continuam com o
      // próprio controle de acesso (tabela em /admin/acessos), só que agora
      // se abrem de dentro da tela de configuração do módulo pai, não como
      // um item a mais nesta barra.
      !m.subGrupoDe &&
      // Módulo sem tela de Admin (ex.: Meus Indicadores) fica de fora: o
      // href dele aponta para a tela do colaborador, e o item na barra
      // jogava o gestor para fora do Modo Liderança. A concessão continua
      // nos Acessos por Pessoa.
      !m.semTelaAdmin &&
      // A tela mudou de área: Feedbacks, Justificativas e Uso do App
      // passaram a morar em /gestao. Sair daqui é o ponto -- esta barra é
      // do que se CONFIGURA, e nenhum dos três configura coisa alguma.
      !m.emGestao &&
      /*
        PERFIS DE ACESSO SAI DA BARRA (07/09/2026, pedido do dono: "retire
        da barra lateral dentro de pessoas o perfis de acesso, pois já
        existe esse módulo dentro de Acessos por Pessoa").

        Ele está certo: desde que as duas telas ganharam a barra de abas
        compartilhada, Perfis é a primeira aba de Acessos por Pessoa. Ter
        também um item na gaveta dá dois caminhos para o mesmo lugar, e
        foi essa duplicação que fez as duas telas parecerem módulos
        repetidos.

        A ROTA CONTINUA VIVA, e a concessão também: quem tiver
        `perfis-acesso` liberado abre pela aba. Hoje ninguém tem --
        conferido na base --, então na prática só o dono chega lá, e ele
        chega pelas abas.
      */
      m.id !== "perfis-acesso" &&
      modulosDaRevenda.has(m.id) &&
      podeFazer(perfil.role, concessoes, m.id, "ver"),
  );

  // Tela do dono que mora numa gaveta normal (hoje: Notificações, em
  // Configuração). Continua sendo só do dono -- para quem não é, esta
  // lista é vazia e o item não entra em gaveta nenhuma.
  const doDonoEmGaveta = dono ? MODULOS_DO_DONO.filter((m) => m.grupo) : [];

  // A ordem vem de GRUPOS_DO_ADMIN, em lib/acessos.ts -- uma gaveta some
  // sozinha quando a pessoa não tem nada liberado dentro dela.
  const grupos: GrupoNav[] = GRUPOS_DO_ADMIN
    .map((titulo) => ({
      titulo: `${EMOJI_GRUPO_ADMIN[titulo]} ${titulo}`,
      itens: [
        ...liberados
          .filter((m) => m.grupo === titulo)
          .map((m) => ({ id: m.id, href: m.href, rotulo: m.rotulo, emoji: m.emoji })),
        ...doDonoEmGaveta
          .filter((m) => m.grupo === titulo)
          .map((m) => ({ id: m.href, href: m.href, rotulo: m.rotulo, emoji: m.emoji })),
      ],
    }))
    .filter((g) => g.itens.length > 0);

  const grupoDono = dono
    ? MODULOS_DO_DONO.filter((m) => !m.grupo).map((m) => ({
        id: m.href,
        href: m.href,
        rotulo: m.rotulo,
        emoji: m.emoji,
      }))
    : null;

  return (
    <div>
      <AdminSidebar
        grupos={grupos}
        grupoDono={grupoDono}
        home={{
          href: "/admin",
          rotulo: dono ? "Painel Admin" : "Painel da Liderança",
          emoji: "⚙️",
        }}
        /*
          SEM ATALHO PARA A GESTÃO (06/09/2026, pedido do dono: "o modo
          gestão deveria sair do menu lateral no modo liderança, já que ele
          fica liberado na home").

          Ele existia porque as análises só se alcançavam por aqui. Desde
          que o bloco 📊 Gestão passou a viver na home, a barra tinha um
          item para uma área que a pessoa já tinha um caminho mais curto
          para abrir -- e um segundo caminho para o mesmo lugar é o tipo de
          coisa que faz a barra crescer sem ajudar ninguém.

          O caminho de volta CONTINUA existindo do outro lado: a barra da
          Gestão mantém o atalho para o Modo Liderança, porque de lá não há
          equivalente na home.
        */
        atalho={null}
      />

      <div className="md:pl-20">
        <div className="mb-4 rounded-2xl border border-primary/25 bg-primary-soft p-3 pl-14 md:pl-3">
          <span className="text-xs font-bold uppercase tracking-wide text-primary-dark">
            {dono ? "⚙️ Modo administrador" : "⚙️ Modo liderança"}
          </span>
          <VoltarAoPainel dono={dono} />
        </div>

        {children}
      </div>
    </div>
  );
}
