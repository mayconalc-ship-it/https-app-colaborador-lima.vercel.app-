/**
 * Peças do padrão "cadastro moderno" pra telas de configuração do Admin:
 * um cartão por catálogo, contador no cabeçalho, botão "+ Novo" que
 * revela o formulário sem sair da tela (um `<details>` estilizado, sem
 * JavaScript de cliente), e cada item da lista com ações em ícone e a
 * edição escondida atrás de um "✏️ Editar" -- em vez do formulário de
 * editar sempre visível brigando com a lista pelo olho de quem rola a
 * tela.
 *
 * Só troca a APRESENTAÇÃO das telas de config. Vira o padrão a repetir
 * nos próximos cadastros do app -- é por isso que mora em
 * components/admin, e não dentro de uma página só.
 */

import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MaisOuFechar } from "@/components/BotaoMais";

export function PainelCadastro({
  titulo,
  contagem,
  novoRotulo = "Novo",
  formNovo,
  vazio,
  temItens,
  faixaTopo,
  children,
}: {
  titulo: string;
  contagem?: number;
  novoRotulo?: string;
  formNovo: React.ReactNode;
  vazio?: string;
  temItens: boolean;
  /** Uma ação que NÃO cabe atrás do "+": ela aparece assim que o painel
   *  abre, antes do formulário de cadastrar. Hoje só a importação de
   *  planilha usa -- ver o comentário na faixa, abaixo. */
  faixaTopo?: React.ReactNode;
  children: React.ReactNode;
}) {
  /*
    O PAINEL INTEIRO COMEÇA FECHADO -- pedido do dono (03/09/2026):
    agrupar os campos da tela de Configuração do Armazém.

    Antes só o formulário de "Novo" era dobrável; a LISTA ficava sempre
    aberta. Numa aba com cinco catálogos de centenas de produtos, isso
    dava uma tela de milhares de pixels onde a pessoa rolava procurando o
    cartão certo -- e o cartão certo é o TÍTULO, que estava a três telas
    de distância do anterior.

    Fechado, a aba vira o que ela deveria ser: uma lista de catálogos com
    o tamanho de cada um do lado. Abre-se o que se veio mexer.

    São dois `<details>` aninhados, e é de propósito: o de fora abre o
    catálogo, o de dentro abre o formulário de cadastrar. O de dentro
    continua com a classe `group` sem nome, então o "+/✕" do
    MaisOuFechar continua respondendo a ele, e não ao painel.
  */
  return (
    <details className="group/painel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="text-slate-400 transition-transform group-open/painel:rotate-90"
            aria-hidden="true"
          >
            ▸
          </span>
          <h2 className="truncate text-sm font-bold text-slate-900">{titulo}</h2>
          {contagem !== undefined && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {contagem}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400 group-open/painel:hidden">
          abrir
        </span>
      </summary>

      <div className="border-t border-slate-100">
        {/*
          O CADASTRO VEM PRIMEIRO, e a faixa depois dele -- pedido do
          dono (05/09/2026).

          A faixa nasceu em cima porque a importação estava escondida
          atrás do "+", que quer dizer "mais um" e não "carregue 333".
          Resolveu isso e criou o inverso: cadastrar UM produto passou a
          ser a segunda coisa da tela, abaixo de um bloco de explicação
          sobre planilha. Cadastrar é a ação mais frequente e a mais
          simples; a importação é o evento raro. A ordem segue isso.
        */}
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-end gap-3 p-3 marker:content-none [&::-webkit-details-marker]:hidden">
            {/* Mesmo "+" quadrado azul do resto do app (ver BotaoMais) --
                vira "✕" quando o formulário está aberto. */}
            <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-primary-dark">
              <MaisOuFechar />
              <span className="group-open:hidden">{novoRotulo}</span>
              <span className="hidden group-open:inline">Fechar</span>
            </span>
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/70 p-4">{formNovo}</div>
        </details>

        {/* A FAIXA -- para a ação que carrega o catálogo INTEIRO, e para
            a busca. As duas valem para a lista toda, e não para um item;
            por isso continuam separadas do "+". */}
        {faixaTopo && (
          <div className="border-t border-slate-100 bg-primary-soft/40 p-4">{faixaTopo}</div>
        )}

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {temItens ? children : (
            <p className="p-6 text-center text-sm text-slate-400">{vazio ?? "Nada cadastrado ainda."}</p>
          )}
        </div>
      </div>
    </details>
  );
}

export function ItemCadastro({
  ativo = true,
  titulo,
  subtitulo,
  aviso,
  acoes,
  formEditar,
}: {
  ativo?: boolean;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  /** Um problema NESTE item, dito por extenso. Diferente do subtítulo:
   *  o subtítulo é truncado numa linha (é a ficha do item), e um aviso
   *  cortado no meio de uma conta não avisa nada. */
  aviso?: React.ReactNode;
  acoes?: React.ReactNode;
  formEditar?: React.ReactNode;
}) {
  return (
    <div className={`p-3.5 ${ativo ? "" : "bg-slate-50/70"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>
            {titulo}
          </p>
          {subtitulo && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex shrink-0 items-center gap-1">{acoes}</div>}
      </div>
      {aviso && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs leading-relaxed text-red-800">
          {aviso}
        </p>
      )}
      {formEditar && (
        <details className="group mt-2.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
            ✏️ Editar
          </summary>
          <div className="mt-2 rounded-xl bg-slate-50 p-3">{formEditar}</div>
        </details>
      )}
    </div>
  );
}

/** Botão de ícone só -- ativar/desativar, sem disputar espaço com o nome
 *  do item numa linha que já tem pouca largura no celular. Passa pelo
 *  BotaoEnviar de propósito: mesma rodinha de "enviando" que o resto do
 *  app usa, só que no tamanho de um ícone. */
export function BotaoIcone({
  action,
  campos,
  titulo,
  children,
}: {
  action: (formData: FormData) => void;
  campos: Record<string, string>;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar
        compacto
        ariaLabel={titulo}
        title={titulo}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-slate-100"
      >
        {children}
      </BotaoEnviar>
    </form>
  );
}
