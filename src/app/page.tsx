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
import { RodapeCanais } from "@/components/RodapeCanais";
import { FaixaParcerias } from "@/components/FaixaParcerias";
import { LampadaVoceSabia } from "@/components/LampadaVoceSabia";

export default async function Home() {
  const supabase = await createClient();

  const [perfil, revenda, modulosAcessiveis] = await Promise.all([
    getPerfil(),
    getRevendaAtiva(),
    getModulosAcessiveis(),
  ]);

  // Sem revenda não há menu: o layout já mostra o aviso de cadastro
  // incompleto no lugar desta tela.
  if (!revenda) return null;

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
