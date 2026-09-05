import { MenuCard } from "@/components/MenuCard";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaAtiva, getModulosDaRevenda } from "@/lib/revendas";
import { DESTAQUES_DO_MENU, MENU_PADRAO, MODULO_DO_ITEM, agruparItens } from "@/lib/menu";

/**
 * A frase abaixo do título nos cartões grandes. Só nos destaques: num
 * cartão pequeno ela viraria ruído, e num grande o espaço já existe.
 */
const LEGENDA_DO_DESTAQUE: Record<string, string> = {
  rv: "Seu resultado do mês e a composição do valor",
  "produtividade-armazem": "Reepack, despejo, empilhadeira e recebimento",
};
import { getModulosAcessiveis } from "@/lib/require-admin";
import { MODULOS_OPCIONAIS } from "@/lib/acessos";
import { CartaoDePainel } from "@/components/gestao/CartaoDePainel";
import { BLOCOS_DA_GESTAO } from "@/lib/gestao";
import { paineisVisiveis, sinaisDosPaineis } from "@/lib/gestao-server";
import { RodapeCanais } from "@/components/RodapeCanais";
import { FaixaParcerias } from "@/components/FaixaParcerias";
import { LampadaVoceSabia } from "@/components/LampadaVoceSabia";

export default async function Home() {
  const supabase = await createClient();

  const [perfil, revenda, modulosAcessiveis, paineis] = await Promise.all([
    getPerfil(),
    getRevendaAtiva(),
    getModulosAcessiveis(),
    // As análises que ESTA pessoa pode abrir. A régua é a mesma de sempre
    // -- `ver` no módulo de cada painel; a lista já vem filtrada.
    paineisVisiveis(),
  ]);

  // Sem revenda não há menu: o layout já mostra o aviso de cadastro
  // incompleto no lugar desta tela.
  if (!revenda) return null;

  // O que está esperando em cada análise. Só roda para quem tem análise
  // liberada -- e, dentro disso, só conta o que é pendência.
  const sinais = paineis.length > 0 ? await sinaisDosPaineis(paineis, revenda.id) : {};

  const [{ data: itensBanco }, modulosDaRevenda] = await Promise.all([
    supabase
      .from("menu_itens")
      .select("chave, titulo, emoji, href, ordem, visivel")
      .eq("revenda_id", revenda.id)
      .order("ordem", { ascending: true }),
    getModulosDaRevenda(revenda.id),
  ]);

  const primeiroNome = perfil?.nome?.split(" ")[0] ?? "";
  const todos = itensBanco && itensBanco.length > 0 ? itensBanco : MENU_PADRAO;
  const itens = todos.filter((item) => {
    if (!item.visivel) return false;

    // A revenda usa este módulo? Vem antes de tudo: não adianta o cartão
    // estar visível e ordenado se a tela dele não existe aqui.
    const modulo = MODULO_DO_ITEM[item.chave];
    if (modulo && !modulosDaRevenda.has(modulo)) return false;

    // Módulo opcional (a lista em lib/acessos.ts): só entra quem tem
    // concessão -- ver getModulosAcessiveis. Módulo fora dessa lista
    // (ex.: 5S, que tem controle próprio) passa direto.
    if (modulo && (MODULOS_OPCIONAIS as string[]).includes(modulo)) {
      return modulosAcessiveis.has(modulo);
    }
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Olá{primeiroNome ? `, ${primeiroNome}` : ""}! 👋
        </h1>
        <p className="text-slate-500">Escolha uma opção abaixo</p>
      </div>
      {/*
        AS ANÁLISES DA GESTÃO, NA PRÓPRIA HOME.

        Pedido do dono (05/09/2026): "as pessoas que possuir acesso não
        precisar ir em adm ou liderança". Antes, ler um painel custava
        entrar no Modo Liderança e trocar de área -- três toques para
        chegar num número que a pessoa consulta todo dia. Aqui é um.

        NENHUMA PERMISSÃO NOVA. `paineisVisiveis` é a mesma função que
        monta a barra da Gestão, com a mesma régua (`ver` no módulo do
        painel). Quem não tinha acesso continua sem ver o bloco; quem
        tinha, deixou de precisar do desvio. É endereço, não porta.

        PRIMEIRO NA TELA, e separado por cor: quem tem análise liberada
        abre o app por causa dela. Misturado com os cartões de operação,
        seria mais um quadrado entre treze -- que é exatamente de onde
        estas telas vieram.
      */}
      {paineis.length > 0 && (
        <section className="mb-7 rounded-2xl border border-primary/25 bg-primary-soft/40 p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary-dark">
                📊 Gestão
              </h2>
              <p className="text-xs text-slate-500">O que os números dizem</p>
            </div>
            <a
              href="/gestao"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Abrir o painel completo →
            </a>
          </div>
          {BLOCOS_DA_GESTAO.map((bloco) => {
            const doBloco = paineis.filter((p) => p.bloco === bloco);
            if (doBloco.length === 0) return null;
            return (
              <div key={bloco} className="mt-3 first:mt-0">
                {/* O subtítulo do bloco só aparece quando há mais de um --
                    com um bloco só ele repetiria o título acima. */}
                {paineis.some((p) => p.bloco !== bloco) && (
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {bloco}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {doBloco.map((p) => (
                    <CartaoDePainel key={p.id} painel={p} sinal={sinais[p.id]} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Agrupado, não uma grade de 13. Cada bloco responde a uma pergunta
          diferente, e a ordem é a do dia: o que eu consulto sobre mim, o
          que eu executo, o que a empresa me diz, o que me engaja. */}
      <div className="flex flex-col gap-7">
        {agruparItens(itens).map((bloco) => (
          <section key={bloco.id}>
            <div className="mb-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                {bloco.titulo}
              </h2>
              <p className="text-xs text-slate-400">{bloco.subtitulo}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {bloco.itens.map((item) => (
                <MenuCard
                  key={item.chave}
                  chave={item.chave}
                  href={item.href}
                  title={item.titulo}
                  emoji={item.emoji}
                  destaque={DESTAQUES_DO_MENU.has(item.chave)}
                  legenda={LEGENDA_DO_DESTAQUE[item.chave]}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Depois do menu e antes do rodapé, de propósito.
          Acima, competiria com o trabalho -- e parceria é um benefício,
          não uma tarefa. Dentro de um dos blocos, viraria mais um cartão
          quadrado entre treze, que é exatamente onde ela já estava
          escondida. Retangular e larga, no fim, ela tem forma própria sem
          precisar de cor forte -- o cartão é branco como o resto da tela
          (ver o comentário em FaixaParcerias).

          Só para quem tem o Jornal: a faixa leva a uma editoria dele, e
          oferecer um caminho que termina em "sem acesso" é pior do que
          não oferecer. */}
      {modulosAcessiveis.has("comunicados") && <FaixaParcerias />}

      <RodapeCanais />

      {/* A LÂMPADA DO "VOCÊ SABIA?" -- só aqui, e não no app inteiro.
          A home é a única tela sem o ✕ de fechar (com quem a lâmpada
          colidia no canto de cima) e é onde a pessoa está entre uma
          tarefa e outra, que é o momento de parar para ler uma dica. Nas
          telas de trabalho ela não tinha o que fazer: ninguém interrompe
          um apontamento de reepack para revisar pergunta de desafio.
          Some sozinha quando não há dica nova -- ver LampadaVoceSabia. */}
      {perfil && revenda && (
        <LampadaVoceSabia colaboradorId={perfil.id} revendaId={revenda.id} />
      )}
    </div>
  );
}
