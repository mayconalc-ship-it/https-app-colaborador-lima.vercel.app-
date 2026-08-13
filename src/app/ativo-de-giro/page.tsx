import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import {
  COLUNAS_CONTAGEM,
  COLUNAS_RECONTAGEM,
  FORMATOS,
  conciliar,
  contadoresDeLinhas,
  diasAtrasISO,
  fatoresDeLinhas,
  formatarData,
  hojeISO,
  paletesEquivalentes,
  parqueDeLinhas,
  recontagensDeLinhas,
  totaisPorFormato,
  totalEmCaixas,
  type Contador,
  type Contagem,
} from "@/lib/ativo-giro";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { getUltimaCombinacao } from "./ultima-combinacao";
import { Lancamento } from "./Lancamento";
import {
  cancelarRecontagem,
  dispensarRecontagem,
  excluirContagem,
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
 * É um `<select>` dentro de um form `method="get"` -- mesma mecânica do
 * filtro de data que já existia, e que funciona sem JavaScript.
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
    aba === "historico"
      ? (() => {
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
            .order("id", { ascending: false });
        })()
      : Promise.resolve({ data: null }),
    // Quem alimenta o menu suspenso. Duas colunas só, e uma janela larga
    // de propósito: a lista precisa ser a MESMA nas três abas, senão trocar
    // de aba faria o colaborador escolhido sumir da lista. Ordenada da mais
    // nova para a mais velha para o nome mais recente de cada pessoa ganhar.
    aba === "contagem"
      ? Promise.resolve({ data: null })
      : supabase
          .from("ag_contagens")
          .select("colaborador_id, colaborador_nome")
          .eq("revenda_id", revendaId)
          .gte("data", diasAtrasISO(180))
          .order("data", { ascending: false }),
    // Pedidos de recontagem em aberto: alimentam o banner do colaborador
    // (aba Contagem) e o painel do controle (aba Conciliação).
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
  const contagens = (minhas ?? []) as Contagem[];
  const contadores = contadoresDeLinhas(quemContou);
  const nomeFiltrado = contadores.find((c) => c.id === colab)?.nome;
  const contagensPeriodo = (doPeriodo ?? []) as Contagem[];

  // O dia inteiro vem do banco e o filtro acontece aqui: uma contagem de
  // pátio são dezenas de linhas, então filtrar no caminho de volta não
  // pagaria o preço de uma consulta a mais.
  const contagensDia = ((doDia ?? []) as Contagem[]).filter(soDe);

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

  const linhas = conciliar(contagensDia, parque, fatores);
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
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
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
        </form>
      )}

      {aba === "conciliacao" && (
        <section>
          {/* Filtrar por pessoa muda o significado da coluna Diferença, e
              isso precisa estar escrito: o parque é o saldo da revenda
              inteira, então comparar com o que UMA pessoa contou acusa uma
              falta que provavelmente está com o resto do time. */}
          {nomeFiltrado && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Mostrando só o que <strong>{nomeFiltrado}</strong> contou. O
              parque continua sendo o da revenda inteira, então a diferença
              não fecha enquanto o filtro estiver ligado.
            </p>
          )}

          {linhas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma contagem em {formatarData(dia)}
              {nomeFiltrado ? ` de ${nomeFiltrado}` : ""}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Formato</th>
                    <th className="p-2 text-right">Contado</th>
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
                      <td className="p-2 text-right">{l.contado}</td>
                      <td className="p-2 text-right">{l.parque}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          l.diferenca === 0
                            ? "text-slate-500"
                            : l.diferenca > 0
                              ? "text-green-600"
                              : "text-red-600"
                        }`}
                      >
                        {l.diferenca > 0 ? "+" : ""}
                        {l.diferenca}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
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
          </form>

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
