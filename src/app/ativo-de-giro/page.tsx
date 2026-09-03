import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import {
  COLUNAS_CONTAGEM,
  COLUNAS_RECONTAGEM,
  FORMATOS,
  LIMITE_DIFERENCA_PCT,
  TIPOS,
  chave,
  comodatoDeLinhas,
  conciliar,
  conciliarPorDia,
  contadoresDeLinhas,
  juntarParcelas,
  diasAtrasISO,
  fatoresDeLinhas,
  formatarData,
  hojeISO,
  paletesEquivalentes,
  parqueDeLinhas,
  recontagensDeLinhas,
  resumirConciliacao,
  totaisPorFormato,
  totalEmCaixas,
  transitoDeLinhas,
  type Contador,
  type Contagem,
} from "@/lib/ativo-giro";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { lerTudo } from "@/lib/ler-tudo";
import { getUltimaCombinacao } from "./ultima-combinacao";
import { Lancamento } from "./Lancamento";
import {
  cancelarRecontagem,
  dispensarRecontagem,
  excluirContagem,
  podeLancarTransito,
  salvarComodato,
  salvarTransito,
  solicitarRecontagem,
} from "./actions";
import { ExportarContagens } from "./ExportarContagens";

export const dynamic = "force-dynamic";

type Aba = "contagem" | "painel" | "conciliacao" | "historico";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "contagem", rotulo: "Contagem" },
  { id: "painel", rotulo: "Painel" },
  { id: "conciliacao", rotulo: "Concil." },
  { id: "historico", rotulo: "Histórico" },
];

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * O filtro por colaborador, igual nas três abas.
 *
 * A lista é sempre a mesma (quem contou nos últimos 180 dias), e não
 * "quem aparece neste recorte": se ela encolhesse conforme o dia ou o
 * período escolhido, a pessoa filtrada sumiria da própria lista ao trocar
 * de data, e a tela voltaria sozinha para "Todos".
 *
 * É um `<select>` dentro do FiltroNoLugar -- mesma mecânica do filtro de
 * data, que atualiza a tela sem rolar de volta para o topo, e ainda cai
 * num GET comum se o JavaScript não carregar.
 */
function SeletorColaborador({
  contadores,
  valor,
}: {
  contadores: Contador[];
  valor: string;
}) {
  return (
    <div className="min-w-[11rem] flex-1">
      <label className={rotulo} htmlFor="colab">
        Colaborador
      </label>
      <select id="colab" name="colab" defaultValue={valor} className={campo}>
        <option value="">Todos</option>
        {contadores.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function AtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    data?: string;
    de?: string;
    ate?: string;
    colab?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  // Módulo opcional: só quem o Admin liberou (ou gestor/dono) entra aqui.
  if (!(await temAcessoModulo("ativo-giro"))) {
    redirect(
      `/?erro=${encodeURIComponent(
        "Você não tem acesso ao Ativo de Giro. Fale com o Admin.",
      )}`,
    );
  }

  const sp = await searchParams;
  const aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "contagem") as Aba;
  const dia = sp.data ?? hojeISO();
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  // Filtro por colaborador: vale para painel, conciliação e histórico.
  // Guarda o id, e não o nome: nome se repete, muda, e vinha de uma busca
  // por pedaço de texto que casava duas pessoas de sobrenome parecido.
  const colab = (sp.colab ?? "").trim();
  const soDe = (c: Contagem) => !colab || c.colaborador_id === colab;

  // O parque de AG é físico e fica num pátio só, então TUDO nesta tela é de
  // uma revenda só -- do mesmo jeito que o lançamento já gravava (ver
  // `exigirRevendaAG` em actions.ts).
  //
  // O filtro precisa estar aqui, no código, e não só na RLS. A política de
  // `ag_contagens` libera "as revendas a que você pertence", que é mais de
  // uma para o dono (vê todas) e para a liderança que responde por São
  // Félix e Barreiras. Para essas pessoas o Painel somava as duas unidades,
  // e o Histórico misturava as duas listas. Pior na Conciliação: `ag_parque`
  // vinha das duas revendas e `parqueDeLinhas` indexa por tipo|formato, de
  // modo que a segunda linha sobrescrevia a primeira -- a coluna Diferença
  // comparava o contado das duas contra o parque de uma.
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect(
      `/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`,
    );
  }

  // Conciliação, painel e histórico enxergam o trabalho do time inteiro --
  // a RLS de ag_contagens já libera leitura para qualquer autenticado, então
  // isso não precisa do service role, só de estar logado.
  const supabase = await createClient();
  const colunas = COLUNAS_CONTAGEM;

  const [
    { data: fatoresBanco },
    { data: parqueBanco },
    { data: minhas },
    { data: doDia },
    { data: doPeriodo },
    { data: quemContou },
    { data: transitoBanco },
    { data: transitoPeriodoBanco },
    { data: comodatoBanco },
    podeTransito,
    { data: recontagensBanco },
    podeConfigurar,
    podeExcluirQualquer,
    ultimaCombinacao,
  ] = await Promise.all([
    supabase
      .from("ag_fatores")
      .select("formato, palete, lastro")
      .eq("revenda_id", revendaId),
    supabase
      .from("ag_parque")
      .select("tipo, formato, quantidade")
      .eq("revenda_id", revendaId),
    supabase
      .from("ag_contagens")
      .select(colunas)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id)
      .order("data", { ascending: false })
      .order("id", { ascending: false })
      .limit(60),
    aba === "painel" || aba === "conciliacao"
      ? supabase
          .from("ag_contagens")
          .select(colunas)
          .eq("revenda_id", revendaId)
          .eq("data", dia)
          .order("id")
      : Promise.resolve({ data: null }),
    // PAGINADO: o período pode ser de meses, e `ag_contagens` já passou
    // de 1.800 linhas (medido em 03/09/2026). O PostgREST corta em 1.000
    // sem avisar -- não dá erro, a lista só chega menor --, então o
    // Histórico de um período largo já vinha incompleto, e os totais
    // dele, errados. Ver lib/ler-tudo.ts.
    aba === "historico"
      ? lerTudo<Contagem>((inicio, fim) => {
          let consulta = supabase
            .from("ag_contagens")
            .select(colunas)
            .eq("revenda_id", revendaId)
            .gte("data", de)
            .lte("data", ate);
          // Aqui o filtro vai no BANCO, ao contrário do painel: o período
          // pode ser de meses, e não faz sentido trazer o time inteiro
          // para descartar tudo menos uma pessoa no caminho de volta.
          if (colab) consulta = consulta.eq("colaborador_id", colab);
          return consulta
            .order("data", { ascending: false })
            .order("id", { ascending: false })
            .range(inicio, fim);
        }).then((data) => ({ data }))
      : Promise.resolve({ data: null }),
    // Quem alimenta o menu suspenso. Duas colunas só, e uma janela larga
    // de propósito: a lista precisa ser a MESMA nas três abas, senão trocar
    // de aba faria o colaborador escolhido sumir da lista. Ordenada da mais
    // nova para a mais velha para o nome mais recente de cada pessoa ganhar.
    // PAGINADO pelo mesmo motivo do Histórico: 180 dias de contagens
    // passam de 1.000 linhas com folga, e o corte silencioso do PostgREST
    // fazia o menu perder justamente quem contou menos -- as pessoas que
    // alguém procuraria no filtro.
    aba === "contagem"
      ? Promise.resolve({ data: null })
      : lerTudo<{ colaborador_id: string; colaborador_nome: string }>(
          (inicio, fim) =>
            supabase
              .from("ag_contagens")
              .select("colaborador_id, colaborador_nome")
              .eq("revenda_id", revendaId)
              .gte("data", diasAtrasISO(180))
              .order("data", { ascending: false })
              .range(inicio, fim),
        ).then((data) => ({ data })),
    // Pedidos de recontagem em aberto: alimentam o banner do colaborador
    // (aba Contagem) e o painel do controle (aba Conciliação).
    // O trânsito do dia aberto. Lido pelo cliente de sessão: a tabela
    // libera leitura para qualquer autenticado de propósito (ver
    // migration 093) -- quem conta precisa ver de onde saiu a diferença.
    // Escrever é que exige liberação, e isso a ação confere.
    aba === "painel" || aba === "conciliacao"
      ? supabase
          .from("ag_transito")
          .select("tipo, formato, transito_rota, transito_carreta")
          .eq("revenda_id", revendaId)
          .eq("data", dia)
      : Promise.resolve({ data: null }),
    // O trânsito do PERÍODO, para o histórico de conciliações.
    aba === "historico"
      ? supabase
          .from("ag_transito")
          .select("data, tipo, formato, transito_rota, transito_carreta")
          .eq("revenda_id", revendaId)
          .gte("data", de)
          .lte("data", ate)
      : Promise.resolve({ data: null }),
    // O COMODATO não tem data: é um saldo que vale até alguém mudar, e
    // por isso serve para o dia aberto e para todos os dias do
    // histórico (ver migration 094). Oito linhas no máximo.
    aba === "painel" || aba === "conciliacao" || aba === "historico"
      ? supabase
          .from("ag_comodato")
          .select("tipo, formato, quantidade, atualizado_em, atualizado_por_nome")
          .eq("revenda_id", revendaId)
      : Promise.resolve({ data: null }),
    podeLancarTransito(),
    aba === "contagem" || aba === "conciliacao"
      ? supabase
          .from("ag_recontagens")
          .select(COLUNAS_RECONTAGEM)
          .eq("revenda_id", revendaId)
          .is("atendida_em", null)
          .is("cancelada_em", null)
          .order("criado_em", { ascending: false })
      : Promise.resolve({ data: null }),
    podeNoModulo("ativo-giro", "editar"),
    podeNoModulo("ativo-giro", "excluir"),
    getUltimaCombinacao(),
  ]);

  const fatores = fatoresDeLinhas(fatoresBanco);
  const parque = parqueDeLinhas(parqueBanco);
  // Rota e carreta são DO DIA; o comodato vale até alguém mudar. As duas
  // origens se juntam aqui, no formato que a conciliação consome.
  const doDiaTransito = transitoDeLinhas(transitoBanco);
  const comodato = comodatoDeLinhas(comodatoBanco);
  const transito = juntarParcelas(doDiaTransito, comodato);

  // Quem mexeu no comodato por último -- o número vale para todos os
  // dias, então saber de quem ele é importa mais aqui do que no
  // lançamento diário.
  const comodatoQuem = (() => {
    const linhas = (comodatoBanco ?? []) as {
      atualizado_em: string;
      atualizado_por_nome: string | null;
    }[];
    if (linhas.length === 0) return null;
    const maisRecente = linhas.reduce((a, b) =>
      a.atualizado_em > b.atualizado_em ? a : b,
    );
    const quem = maisRecente.atualizado_por_nome;
    return quem
      ? `${quem} em ${formatarData(maisRecente.atualizado_em.slice(0, 10))}`
      : formatarData(maisRecente.atualizado_em.slice(0, 10));
  })();

  // O trânsito do período, agrupado por dia -- é o que o histórico usa
  // para conciliar cada dia com o lançamento daquele dia.
  const transitoPorDia: Record<string, Record<string, { rota: number; carreta: number }>> = {};
  for (const l of (transitoPeriodoBanco ?? []) as {
    data: string;
    tipo: string;
    formato: string;
    transito_rota: number;
    transito_carreta: number;
  }[]) {
    transitoPorDia[l.data] = {
      ...(transitoPorDia[l.data] ?? {}),
      [chave(l.tipo, l.formato)]: {
        rota: l.transito_rota ?? 0,
        carreta: l.transito_carreta ?? 0,
      },
    };
  }

  const contagens = (minhas ?? []) as Contagem[];
  const contadores = contadoresDeLinhas(quemContou);
  // O nome mostrado é o da conciliação de fato -- inclui o caso em que a
  // tela escolheu sozinha porque só uma pessoa contou.
  const nomeFiltrado = contadores.find((c) => c.id === colab)?.nome;
  const contagensPeriodo = (doPeriodo ?? []) as Contagem[];

  // O dia inteiro vem do banco e o filtro acontece aqui: uma contagem de
  // pátio são dezenas de linhas, então filtrar no caminho de volta não
  // pagaria o preço de uma consulta a mais.
  /*
    QUEM CONTOU NESTE DIA -- e quanto cada um contou.

    Cada conferente conta o pátio INTEIRO, de forma independente: em
    29/08 o Denes fechou 16.617 caixas e o Lucas 16.611, quase idênticos.
    É dupla contagem cega, não divisão de área. Somar as duas dá 131% do
    parque.

    Por isso a conciliação precisa de UMA pessoa escolhida. Quando só uma
    contou, escolher seria burocracia: a tela usa ela sozinha.
  */
  const todasDoDia = (doDia ?? []) as Contagem[];
  const contadoresDoDia = (() => {
    const mapa = new Map<string, { id: string; nome: string; caixas: number }>();
    for (const c of todasDoDia) {
      const atual = mapa.get(c.colaborador_id) ?? {
        id: c.colaborador_id,
        nome: c.colaborador_nome,
        caixas: 0,
      };
      atual.caixas += totalEmCaixas(c, fatores[c.formato]);
      mapa.set(c.colaborador_id, atual);
    }
    return [...mapa.values()].sort((a, b) => b.caixas - a.caixas);
  })();

  // Uma pessoa só contou? Ela é a contagem do dia, sem pedir escolha.
  const colabDaConciliacao =
    colab || (contadoresDoDia.length === 1 ? contadoresDoDia[0].id : "");

  const contagensDia = colabDaConciliacao
    ? todasDoDia.filter((c) => c.colaborador_id === colabDaConciliacao)
    : todasDoDia.filter(soDe);

  const pendentesRecontagem = recontagensDeLinhas(recontagensBanco);

  // O banner da aba Contagem só mostra pedidos de dias em que ESTA pessoa
  // contou nesta revenda -- é o mesmo recorte que decide quem recebe o
  // sino e o push (ver solicitarRecontagem), só que calculado aqui para
  // quem já está com a tela aberta -- e exclui o que ela já recusou (pelo
  // botão ou arrastando o cartão). Duas consultas extras, só quando a aba
  // é Contagem e há pedido pendente para checar.
  const diasPedidos = [...new Set(pendentesRecontagem.map((r) => r.dia))];
  let recontagensParaMim: typeof pendentesRecontagem = [];
  if (aba === "contagem" && diasPedidos.length > 0) {
    const [{ data: meusDias }, { data: dispensadas }] = await Promise.all([
      supabase
        .from("ag_contagens")
        .select("data")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .in("data", diasPedidos),
      // Pela chave de administrador, e não pelo cliente de sessão: esta
      // tabela tem RLS ligada e política nenhuma, de propósito (migração
      // 028), então `authenticated` não enxerga linha nenhuma aqui. Lida
      // pelo cliente comum, a lista voltava sempre vazia e o cartão
      // recusado reaparecia no primeiro `router.refresh()` -- que a
      // própria `dispensarRecontagem` provoca ao revalidar a rota.
      // Quem limita a "só as minhas" é o filtro por colaborador logo
      // abaixo, do mesmo jeito que o bloco de recusas do controle.
      createAdminClient()
        .from("ag_recontagens_dispensas")
        .select("recontagem_id")
        .eq("colaborador_id", perfil.id)
        .in(
          "recontagem_id",
          pendentesRecontagem.map((r) => r.id),
        ),
    ]);
    const diasQueContei = new Set((meusDias ?? []).map((d) => d.data));
    const idsDispensados = new Set(
      (dispensadas ?? []).map((d) => d.recontagem_id),
    );
    recontagensParaMim = pendentesRecontagem.filter(
      (r) => diasQueContei.has(r.dia) && !idsDispensados.has(r.id),
    );
  }

  // Quem já recusou cada pedido -- só para o controle, na Conciliação.
  // Sem isso, um pedido parado parece a mesma coisa nos dois casos: pode
  // ser que ninguém tenha visto, ou que todo mundo tenha dito "não é
  // comigo". A diferença muda o que o controle faz a seguir.
  //
  // Passa pela chave de administrador porque `ag_recontagens_dispensas`
  // tem RLS ligada e política nenhuma, de propósito (ver migração 028).
  const recusasPorPedido = new Map<number, string[]>();
  if (aba === "conciliacao" && podeConfigurar && pendentesRecontagem.length > 0) {
    const admin = createAdminClient();
    const { data: dispensas } = await admin
      .from("ag_recontagens_dispensas")
      .select("recontagem_id, colaborador_id")
      .in(
        "recontagem_id",
        pendentesRecontagem.map((r) => r.id),
      );

    const quemRecusou = [
      ...new Set((dispensas ?? []).map((d) => d.colaborador_id)),
    ];
    const nomePorId = new Map<string, string>();
    if (quemRecusou.length > 0) {
      const { data: pessoas } = await admin
        .from("profiles")
        .select("id, nome")
        .in("id", quemRecusou);
      for (const p of pessoas ?? []) nomePorId.set(p.id, p.nome);
    }

    for (const d of dispensas ?? []) {
      const lista = recusasPorPedido.get(d.recontagem_id) ?? [];
      lista.push(nomePorId.get(d.colaborador_id) ?? "alguém");
      recusasPorPedido.set(d.recontagem_id, lista);
    }
  }

  const linhas = conciliar(contagensDia, parque, fatores, transito);
  const resumo = resumirConciliacao(linhas);

  // A evolução dia a dia, para a aba Histórico -- pedido do dono: ver a
  // curva das faltas e sobras, não só a foto de hoje.
  //
  // SÓ COM pessoa escolhida -- e eu tinha feito o contrário aqui.
  //
  // A regra é a mesma da aba Conciliação: cada conferente conta o pátio
  // inteiro, então somar os dois de um dia dá 131% do parque (medido em
  // 29/08). Um histórico somando todo mundo mostraria uma "sobra"
  // gigante nos dias em que duas pessoas contaram e um número normal nos
  // dias de uma só -- uma serra que não descreve a operação, e sim
  // quantas pessoas trabalharam naquele dia.
  const diasConciliados =
    aba === "historico" && colab
      ? conciliarPorDia(
          contagensPeriodo.filter((c) => c.colaborador_id === colab),
          parque,
          fatores,
          transitoPorDia,
          comodato,
        )
      : [];
  const totais = totaisPorFormato(contagensDia, fatores);
  const maiorTotal = Math.max(1, ...totais.map((t) => t.total));

  const garrafeira = FORMATOS.map((formato) => {
    const total = contagensDia
      .filter((c) => c.tipo === "GFE sem Garrafa" && c.formato === formato)
      .reduce((s, c) => s + totalEmCaixas(c, fatores[formato]), 0);
    return {
      formato,
      total,
      paletes: paletesEquivalentes(total, fatores[formato]),
    };
  }).filter((g) => g.total > 0);

  return (
    <div>
      <PageHeader
        title="Ativo de Giro"
        subtitle="Lance a contagem do dia, acompanhe o painel e a conciliação do time."
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {sp.erro}
        </p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          {sp.sucesso}
        </p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={`/ativo-de-giro?aba=${a.id}&data=${dia}&de=${de}&ate=${ate}&colab=${encodeURIComponent(colab)}`}
            // aria-current é o que faz o leitor de tela anunciar "página
            // atual". Sem ele a aba ativa só se distinguia pela cor -- e
            // cor sozinha não serve para quem não enxerga a diferença.
            aria-current={a.id === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a.id === aba
                ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a.rotulo}
          </a>
        ))}
      </nav>

      {/* O formulário e a lista vão juntos para o cliente: a lista precisa
          mostrar a linha recém-lançada antes de o servidor confirmar. */}
      {aba === "contagem" && (
        <Lancamento
          fatores={fatores}
          ultima={ultimaCombinacao}
          contagens={contagens}
          hoje={hojeISO()}
          recontagens={recontagensParaMim}
          aoDispensarRecontagem={dispensarRecontagem}
        />
      )}

      {(aba === "painel" || aba === "conciliacao") && (
        <FiltroNoLugar className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="aba" value={aba} />
          <div>
            <label className={rotulo} htmlFor="data">
              Dia
            </label>
            <input
              id="data"
              type="date"
              name="data"
              defaultValue={dia}
              className={campo}
            />
          </div>
          <SeletorColaborador contadores={contadores} valor={colab} />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
          >
            Ver
          </button>
        </FiltroNoLugar>
      )}

      {aba === "conciliacao" && (
        <section>
          {/*
            A CONCILIAÇÃO É DE UMA PESSOA, NÃO DA SOMA -- e eu tinha
            escrito o contrário aqui.

            O aviso antigo dizia que filtrar por pessoa fazia a diferença
            "não fechar", porque o parque é da revenda inteira. Está
            errado, e os dados provam: em 29/08 o Denes contou 16.617
            caixas e o Lucas 16.611 -- cada um 65% do parque, quase
            idênticos. Não é divisão de área, é DUPLA CONTAGEM CEGA do
            mesmo pátio. Somar os dois deu 131% do parque.

            Então o parque é para todos, sim, mas o contado tem de ser o
            de UMA pessoa: é a contagem dela contra o saldo oficial.
            Somar duas contagens do mesmo pátio conta tudo duas vezes.
            Corrigido a pedido do dono (03/09/2026).
          */}
          {!colab && contadoresDoDia.length > 1 && (
            <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-900">
                Escolha de quem é a contagem
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {contadoresDoDia.length} pessoas contaram em{" "}
                {formatarData(dia)}, e cada uma contou o pátio inteiro. Somar
                as duas contaria tudo duas vezes — a conciliação é de uma
                contagem contra o parque.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {contadoresDoDia.map((c) => (
                  <a
                    key={c.id}
                    href={`/ativo-de-giro?aba=conciliacao&data=${dia}&colab=${encodeURIComponent(c.id)}`}
                    className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {c.nome}
                    <span className="ml-1 font-normal text-amber-700">
                      {Math.round(c.caixas).toLocaleString("pt-BR")} cx
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {nomeFiltrado && (
            <p className="mb-3 rounded-xl bg-primary-soft p-3 text-sm text-primary-dark">
              Conciliando a contagem de <strong>{nomeFiltrado}</strong> contra o
              parque da revenda.
              {contadoresDoDia.length > 1 && (
                <>
                  {" "}
                  Outra pessoa também contou este dia — troque no filtro para
                  ver a dela.
                </>
              )}
            </p>
          )}

          {linhas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma contagem em {formatarData(dia)}
              {nomeFiltrado ? ` de ${nomeFiltrado}` : ""}.
            </p>
          ) : (
            <>
              {/* O FECHAMENTO DO DIA, antes da tabela.
                  Quem abre esta tela quer saber uma coisa: fechou ou não
                  fechou. A tabela responde item a item; este cartão
                  responde de uma vez, e é o número que vai para a
                  reunião. */}
              <div
                className={`mb-3 rounded-2xl border p-4 ${
                  resumo.dentroDoAceitavel === null
                    ? "border-slate-200 bg-white"
                    : resumo.dentroDoAceitavel
                      ? "border-green-300 bg-green-50"
                      : "border-red-300 bg-red-50"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Diferença do dia
                  </p>
                  {resumo.pctDiferenca !== null && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        resumo.dentroDoAceitavel
                          ? "bg-green-600 text-white"
                          : "bg-red-600 text-white"
                      }`}
                    >
                      {resumo.dentroDoAceitavel ? "✓ Dentro" : "⚠ Fora"} ·{" "}
                      {resumo.pctDiferenca.toLocaleString("pt-BR")}% do parque
                    </span>
                  )}
                </div>
                <p
                  className={`mt-1 text-3xl font-bold tabular-nums ${
                    resumo.dentroDoAceitavel === false
                      ? "text-red-700"
                      : "text-slate-900"
                  }`}
                >
                  {resumo.diferenca > 0 ? "+" : ""}
                  {resumo.diferenca.toLocaleString("pt-BR")}
                  <span className="ml-1 text-base font-medium text-slate-500">
                    caixas
                  </span>
                </p>
                {/* A conta escrita, parcela por parcela: é ela que
                    responde "de onde saiu esse número". Cada parcela só
                    aparece se tiver valor -- somar zeros na frase é
                    ruído. */}
                <p className="mt-1 text-xs text-slate-600">
                  {resumo.contado.toLocaleString("pt-BR")} contadas
                  {resumo.rota > 0 && (
                    <> + {resumo.rota.toLocaleString("pt-BR")} rota</>
                  )}
                  {resumo.carreta > 0 && (
                    <> + {resumo.carreta.toLocaleString("pt-BR")} carreta</>
                  )}
                  {resumo.comodato > 0 && (
                    <> + {resumo.comodato.toLocaleString("pt-BR")} comodato</>
                  )}{" "}
                  − {resumo.parque.toLocaleString("pt-BR")} do parque. Aceitável
                  até {LIMITE_DIFERENCA_PCT}%.
                </p>
                {resumo.linhasFora > 0 && resumo.dentroDoAceitavel && (
                  // O total pode fechar e uma linha estar muito fora --
                  // uma falta de 50 caixas some dentro de 18 mil. Sem
                  // este aviso o cartão verde esconderia o problema.
                  <p className="mt-2 rounded-lg bg-amber-100 p-2 text-xs font-medium text-amber-900">
                    O total está dentro, mas {resumo.linhasFora}{" "}
                    {resumo.linhasFora === 1 ? "linha passou" : "linhas passaram"}{" "}
                    dos {LIMITE_DIFERENCA_PCT}% — veja em vermelho abaixo.
                  </p>
                )}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Formato</th>
                      <th className="p-2 text-right">Contado</th>
                      {/* As três parcelas separadas: é o que diz ONDE
                          está o ativo que não foi contado. Com um número
                          só, sabia-se apenas que ele não estava aqui. */}
                      <th
                        className="p-2 text-right"
                        title="Saiu com a entrega e volta no mesmo dia. Lançado por quem tem liberação."
                      >
                        Rota
                      </th>
                      <th
                        className="p-2 text-right"
                        title="Está entre unidades, com o transportador. Lançado por quem tem liberação."
                      >
                        Carreta
                      </th>
                      <th
                        className="p-2 text-right"
                        title="Emprestado ao cliente. Vale até alguém mudar -- não se lança todo dia."
                      >
                        Comodato
                      </th>
                      <th className="p-2 text-right">Parque</th>
                      <th className="p-2 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr
                        key={`${l.tipo}-${l.formato}`}
                        className="border-t border-slate-100"
                      >
                        <td className="p-2">{l.tipo}</td>
                        <td className="p-2">{l.formato}</td>
                        <td className="p-2 text-right tabular-nums">{l.contado}</td>
                        {/* Só leitura para quem conta -- é o que o dono
                            pediu: os números aparecem do lado do contado
                            para explicar a diferença, mas quem edita é
                            quem tem liberação, nos blocos abaixo. */}
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {l.rota > 0 ? l.rota : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {l.carreta > 0 ? l.carreta : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {l.comodato > 0 ? l.comodato : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums">{l.parque}</td>
                        <td
                          className={`p-2 text-right font-bold tabular-nums ${
                            l.diferenca === 0
                              ? "text-slate-500"
                              : l.dentroDoAceitavel
                                ? "text-slate-700"
                                : "text-red-600"
                          }`}
                        >
                          {l.diferenca > 0 ? "+" : ""}
                          {l.diferenca}
                          {/* O percentual vem junto do número, e não numa
                              coluna própria: é ele que diz se a
                              diferença é grande, e 40 caixas significam
                              coisas opostas num parque de 400 e num de
                              18 mil. */}
                          {l.pctDiferenca !== null && l.diferenca !== 0 && (
                            <span className="ml-1 text-[11px] font-medium text-slate-400">
                              {l.pctDiferenca.toLocaleString("pt-BR")}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* A cor sozinha não serve para quem não a enxerga -- a
                  legenda diz a regra por escrito, e o ✓/⚠ do cartão
                  acima repete o sinal em símbolo. */}
              <p className="mt-2 text-xs text-slate-500">
                Em vermelho, a linha cuja diferença passa de{" "}
                {LIMITE_DIFERENCA_PCT}% do parque daquele item.
              </p>
            </>
          )}

          {/* ---- Lançar o trânsito (só quem tem liberação) ---- */}
          {podeTransito && (
            <section className="mt-6 rounded-2xl border border-primary/25 bg-primary-soft p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary-dark">
                🚚 Trânsito de {formatarData(dia)}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                O ativo que <strong>não está no pátio</strong> para ser contado.
                Ele soma no contado antes de comparar com o parque, senão todo
                dia com entrega na rua e carreta na estrada acusa falta.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                <li>
                  <strong>Rota</strong> — saiu com a entrega e volta no mesmo
                  dia.
                </li>
                <li>
                  <strong>Carreta</strong> — está entre unidades, com o
                  transportador.
                </li>
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Não confunda com os status <em>Trânsito Rota</em> e{" "}
                <em>Trânsito Fábrica</em> da contagem: aqueles são contados no
                pátio e já entram na coluna Contado.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Lançar de novo <strong>corrige</strong> o número do dia, não
                soma. O comodato fica no bloco abaixo — ele não é do dia.
              </p>

              {/* UM FORMULÁRIO, UM BOTÃO -- pedido do dono (03/09/2026),
                  e é a segunda vez que ele diz.

                  Um "Salvar" por linha seriam oito botões numa tela onde
                  a pessoa preenche as oito e quer sair: salva a
                  primeira, a tela recarrega, ela perde onde estava,
                  salva a segunda. Oito idas ao servidor para um trabalho
                  só -- e o dia fica pela metade se ela desistir no meio,
                  com a conciliação mostrando um número que não é nem o
                  antigo nem o novo. */}
              <form action={salvarTransito} className="mt-3">
                <input type="hidden" name="data" value={dia} />

                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <span className="min-w-0 flex-1">Item</span>
                  <span className="w-24 text-center">Rota</span>
                  <span className="w-24 text-center">Carreta</span>
                </div>

                <div className="space-y-2">
                  {TIPOS.flatMap((tipo) =>
                    FORMATOS.map((formato) => {
                      const atual = doDiaTransito[chave(tipo, formato)];
                      return (
                        <div
                          key={`t-${chave(tipo, formato)}`}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="tipo" value={tipo} />
                          <input type="hidden" name="formato" value={formato} />
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                            {tipo} · {formato}
                          </span>
                          <input
                            type="number"
                            name="transito_rota"
                            min={0}
                            defaultValue={atual?.rota ?? 0}
                            aria-label={`Trânsito rota de ${tipo} ${formato} em caixas`}
                            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base"
                          />
                          <input
                            type="number"
                            name="transito_carreta"
                            min={0}
                            defaultValue={atual?.carreta ?? 0}
                            aria-label={`Trânsito carreta de ${tipo} ${formato} em caixas`}
                            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base"
                          />
                        </div>
                      );
                    }),
                  )}
                </div>

                <BotaoEnviar
                  textoEnviando="Salvando o dia..."
                  className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
                >
                  Salvar o trânsito de {formatarData(dia)}
                </BotaoEnviar>
              </form>
            </section>
          )}

          {/* ---- Comodato: NÃO é do dia ---- */}
          {podeTransito && (
            <section className="mt-4 rounded-2xl border border-slate-300 bg-white p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                🤝 Comodato
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Ativo <strong>emprestado ao cliente</strong>. Diferente do
                trânsito, ele não é lançado por dia: o número{" "}
                <strong>vale até alguém mudar</strong>, e só se mexe quando há
                necessidade.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Por isso ele entra na conciliação de todos os dias, inclusive
                nos anteriores — mudar aqui muda o que o histórico mostra.
              </p>
              {comodatoQuem && (
                <p className="mt-1 text-xs text-slate-400">
                  Última alteração: {comodatoQuem}.
                </p>
              )}

              <form action={salvarComodato} className="mt-3">
                <div className="space-y-2">
                  {TIPOS.flatMap((tipo) =>
                    FORMATOS.map((formato) => (
                      <div
                        key={`c-${chave(tipo, formato)}`}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="tipo" value={tipo} />
                        <input type="hidden" name="formato" value={formato} />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                          {tipo} · {formato}
                        </span>
                        <input
                          type="number"
                          name="quantidade"
                          min={0}
                          defaultValue={comodato[chave(tipo, formato)] ?? 0}
                          aria-label={`Comodato de ${tipo} ${formato} em caixas`}
                          className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-base"
                        />
                      </div>
                    )),
                  )}
                </div>

                <BotaoEnviar
                  textoEnviando="Salvando..."
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Salvar o comodato
                </BotaoEnviar>
              </form>
            </section>
          )}

          <ExportarContagens
            contagens={contagensDia}
            fatores={fatores}
            data={dia}
          />

          {podeConfigurar && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
                Pedir recontagem
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                O aviso vai só para quem contou neste dia, nesta revenda --
                ninguém mais é incomodado.
              </p>
              <form
                action={solicitarRecontagem}
                className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
              >
                <div>
                  <label className={rotulo} htmlFor="rec-dia">
                    Dia
                  </label>
                  <input
                    id="rec-dia"
                    type="date"
                    name="dia"
                    defaultValue={dia}
                    required
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo} htmlFor="rec-descricao">
                    O que precisa ser recontado
                  </label>
                  <input
                    id="rec-descricao"
                    name="descricao"
                    required
                    maxLength={300}
                    className={campo}
                    placeholder="Ex.: Kit AG 600ml Cheio -- bateu diferença de 40 caixas"
                  />
                </div>
                {/* Pedir recontagem dispara sino e push para todo mundo que
                    contou naquele dia -- não volta instantâneo. */}
                <BotaoEnviar
                  textoEnviando="Solicitando..."
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Solicitar
                </BotaoEnviar>
              </form>

              {pendentesRecontagem.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">
                    Pendentes
                  </h3>
                  <ul className="space-y-2">
                    {pendentesRecontagem.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
                      >
                        <div className="min-w-0 text-sm text-amber-900">
                          <p className="font-semibold">{r.descricao}</p>
                          <p className="text-xs text-amber-700">
                            {formatarData(r.dia)} — pedido por{" "}
                            {r.solicitadoNome}
                          </p>
                          {(recusasPorPedido.get(r.id)?.length ?? 0) > 0 && (
                            <p className="mt-1 text-xs font-medium text-amber-800">
                              ✖️ Recusado por{" "}
                              {recusasPorPedido.get(r.id)!.join(", ")}
                            </p>
                          )}
                        </div>
                        <BotaoExcluir
                          action={cancelarRecontagem}
                          campos={{ id: r.id }}
                          confirmacao={`Cancelar o pedido de recontagem "${r.descricao}"?`}
                        >
                          Cancelar
                        </BotaoExcluir>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </section>
      )}

      {aba === "painel" && (
        <section className="space-y-6">
          {nomeFiltrado && (
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">
              Somando só as contagens de <strong>{nomeFiltrado}</strong>.
            </p>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Total contado por embalagem (caixas)
            </h2>
            <ul className="space-y-2">
              {totais.map((t) => (
                <li key={t.formato}>
                  <div className="flex justify-between text-sm text-slate-700">
                    <span>{t.formato}</span>
                    <span className="font-bold">{t.total}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${(t.total / maiorTotal) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Paletes de garrafeira sem garrafa
            </h2>
            {garrafeira.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma contagem de GFE sem Garrafa neste dia.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700">
                {garrafeira.map((g) => (
                  <li key={g.formato} className="flex justify-between">
                    <span>
                      {g.formato} — {g.total} cx
                    </span>
                    <span className="font-bold">
                      {g.paletes.toFixed(1)} paletes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {aba === "historico" && (
        <section>
          <FiltroNoLugar className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="aba" value="historico" />
            <div>
              <label className={rotulo} htmlFor="de">
                De
              </label>
              <input id="de" type="date" name="de" defaultValue={de} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="ate">
                Até
              </label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
            </div>
            <SeletorColaborador contadores={contadores} valor={colab} />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
              Filtrar
            </button>
          </FiltroNoLugar>

          {/* ---- A EVOLUÇÃO DAS DIFERENÇAS, dia a dia ----
              Pedido do dono: "ver a evolução por dia das faltas ou
              sobras". A foto de um dia não diz se a operação está
              melhorando; a sequência diz.

              Um dia sem contagem NÃO vira linha. Domingo e feriado não
              são dias com problema, são dias sem medição -- e enfiá-los
              aqui como diferença de 100% inventaria uma piora que não
              houve.

              O parque usado é o de HOJE, para todos os dias, porque é o
              único que existe: `ag_parque` guarda o saldo atual, não uma
              série. Isso é honesto para uma janela de semanas (o parque
              muda de mês em mês) e é a razão de este bloco não voltar
              anos. */}
          {/* Sem pessoa escolhida não há o que conciliar: somar duas
              contagens do mesmo pátio conta tudo duas vezes. A tela pede
              a escolha em vez de mostrar um número que engana. */}
          {!colab && contagensPeriodo.length > 0 && (
            <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Escolha um colaborador acima</strong> para ver a
              conciliação dia a dia. Cada conferente conta o pátio inteiro —
              somar as contagens de duas pessoas contaria tudo duas vezes.
            </p>
          )}

          {diasConciliados.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                📉 Conciliação por dia — {nomeFiltrado}
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="p-2">Dia</th>
                      <th className="p-2 text-right">Contado</th>
                      <th className="p-2 text-right">Rota</th>
                      <th className="p-2 text-right">Carreta</th>
                      <th className="p-2 text-right">Comodato</th>
                      <th className="p-2 text-right">Parque</th>
                      <th className="p-2 text-right">Diferença</th>
                      <th className="p-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diasConciliados.map((d) => (
                      <tr key={d.dia} className="border-t border-slate-100">
                        <td className="p-2 font-medium text-slate-700">
                          {formatarData(d.dia)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {d.contado.toLocaleString("pt-BR")}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {d.rota > 0 ? d.rota.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {d.carreta > 0 ? d.carreta.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {d.comodato > 0 ? d.comodato.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="p-2 text-right tabular-nums text-slate-500">
                          {d.parque.toLocaleString("pt-BR")}
                        </td>
                        <td
                          className={`p-2 text-right font-bold tabular-nums ${
                            d.dentroDoAceitavel === false
                              ? "text-red-600"
                              : "text-slate-700"
                          }`}
                        >
                          {d.diferenca > 0 ? "+" : ""}
                          {d.diferenca.toLocaleString("pt-BR")}
                        </td>
                        <td className="p-2 text-right">
                          {d.pctDiferenca === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                d.dentroDoAceitavel
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {d.dentroDoAceitavel ? "✓" : "⚠"}{" "}
                              {d.pctDiferenca.toLocaleString("pt-BR")}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Diferença = contado + rota + carreta + comodato − parque.
                Aceitável até {LIMITE_DIFERENCA_PCT}% do parque; acima disso,
                vermelho. Dias sem contagem não aparecem — não houve medição.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                O comodato é o mesmo em todos os dias: ele vale até alguém
                mudar, e não é lançado por dia. Mudá-lo hoje muda também o que
                estes dias mostram.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Só a contagem de <strong>{nomeFiltrado}</strong> entra aqui.
                Cada conferente conta o pátio inteiro, então somar duas
                contagens do mesmo dia contaria tudo duas vezes.
              </p>
            </section>
          )}

          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            Contagens do período
          </h2>

          {contagensPeriodo.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma contagem no período
              {nomeFiltrado ? ` para ${nomeFiltrado}` : ""}.
            </p>
          ) : (
            <ul className="space-y-2">
              {contagensPeriodo.map((c) => {
                const podeExcluirEsta =
                  c.colaborador_id === perfil.id || podeExcluirQualquer;
                return (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {c.tipo} · {c.formato} · {c.status}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatarData(c.data)} — {c.colaborador_nome} — Pal{" "}
                        {c.palete} / Las {c.lastro} / Cx {c.caixa}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        {totalEmCaixas(c, fatores[c.formato])} cx
                      </span>
                      {podeExcluirEsta && (
                        <BotaoExcluir
                          action={excluirContagem}
                          campos={{ id: c.id }}
                          confirmacao={`Excluir a contagem de ${c.colaborador_nome} em ${formatarData(c.data)}?`}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Excluir
                        </BotaoExcluir>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <ExportarContagens
            contagens={contagensPeriodo}
            fatores={fatores}
            data={ate}
          />
        </section>
      )}

      {podeConfigurar && (
        <a
          href="/admin/ativo-de-giro"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ⚙️ Abrir configuração (parque, fatores e acessos) →
        </a>
      )}
    </div>
  );
}
