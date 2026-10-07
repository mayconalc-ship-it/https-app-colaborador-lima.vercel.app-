import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { lerTudo } from "@/lib/ler-tudo";
import { diasAtrasISO, hojeISO, TURNOS, ehTurno } from "@/lib/produtividade-armazem";
import {
  COLUNAS_BAIXA_WQI,
  ROTULO_TURNO_WQI,
  ROTULO_UNIDADE_WQI_CURTO,
  agruparWqi,
  dataBR,
  ehUnidadeWqi,
  rotuloMes,
  temPessoaResponsavel,
  totaisWqi,
  type Agrupado,
  type BaixaWqi,
} from "@/lib/wqi";
import { BarraRanking, CartaoHero, type ItemBarra } from "../armazem/Graficos";
import { excluirBaixaWqi } from "@/app/wqi/actions";

export const dynamic = "force-dynamic";

type Metrica = "unidades" | "hl" | "lancamentos";
const METRICAS: { id: Metrica; rotulo: string; sufixo: string }[] = [
  { id: "unidades", rotulo: "Unidades", sufixo: "un" },
  { id: "hl", rotulo: "HL", sufixo: "HL" },
  { id: "lancamentos", rotulo: "Lançamentos", sufixo: "" },
];

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

function fmt(n: number, casas = 0) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 });
}

/**
 * O PAINEL DO WQI -- o que quebra, onde, em que turno e com quem.
 *
 * Mesma leitura da planilha que ele substitui (a aba de tabela dinâmica
 * "Local x Turno" e "Motivo x Turno"), agora com filtro e sem montar
 * tabela à mão. A régua padrão é UNIDADES, porque é como a operação
 * conta quebra; HL e número de lançamentos ficam a um toque.
 */
export default async function GestaoWqiPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    turno?: string;
    local?: string;
    motivo?: string;
    responsavel?: string;
    m?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  await requireModulo("wqi", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;

  const hoje = hojeISO();
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  // Abre no mês corrente: é o período em que a baixa é cobrada.
  const de = valida(sp.de) ?? `${hoje.slice(0, 8)}01`;
  const ate = valida(sp.ate) ?? hoje;
  const turno = ehTurno(sp.turno) ? sp.turno : "";
  const local = (sp.local ?? "").trim();
  const motivo = (sp.motivo ?? "").trim();
  const responsavel = (sp.responsavel ?? "").trim();
  const metrica: Metrica = METRICAS.some((m) => m.id === sp.m) ? (sp.m as Metrica) : "unidades";
  const sufixo = METRICAS.find((m) => m.id === metrica)!.sufixo;

  const [doPeriodo, podeExcluir] = await Promise.all([
    lerTudo<BaixaWqi>((a, b) =>
      createAdminClient()
        .from("pa_wqi_baixas")
        .select(COLUNAS_BAIXA_WQI)
        .eq("revenda_id", revendaId)
        .gte("data_ocorrido", de)
        .lte("data_ocorrido", ate)
        .order("data_ocorrido", { ascending: false })
        .order("criado_em", { ascending: false })
        .range(a, b) as unknown as PromiseLike<{ data: BaixaWqi[] | null; error: unknown }>,
    ),
    podeNoModulo("wqi", "excluir"),
  ]);

  // As opções dos filtros saem do PERÍODO, antes dos outros filtros --
  // trocar o local não faz sumir da lista o motivo de outro local.
  const opcoes = (f: (b: BaixaWqi) => string | null) =>
    [...new Set(doPeriodo.map(f).filter((v): v is string => Boolean(v)))].sort((x, y) => x.localeCompare(y, "pt-BR"));
  const locais = opcoes((b) => b.local);
  const motivos = opcoes((b) => b.motivo);
  const responsaveis = opcoes((b) => b.responsavel_nome);

  const baixas = doPeriodo.filter(
    (b) =>
      (!turno || b.turno === turno) &&
      (!local || b.local === local) &&
      (!motivo || b.motivo === motivo) &&
      (!responsavel || b.responsavel_nome === responsavel),
  );

  const t = totaisWqi(baixas);
  const valorDe = (a: Agrupado) => (metrica === "hl" ? a.hl : metrica === "lancamentos" ? a.lancamentos : a.unidades);
  const barras = (grupos: Agrupado[], limite = 12, rotular: (k: string) => string = (k) => k): ItemBarra[] =>
    grupos
      .map((g) => ({ g, v: valorDe(g) }))
      .sort((x, y) => y.v - x.v)
      .slice(0, limite)
      .map(({ g, v }) => ({
        rotulo: rotular(g.chave),
        valor: v,
        nota: metrica === "lancamentos" ? undefined : `${g.lancamentos} lanç.`,
      }));

  const porMotivo = agruparWqi(baixas, (b) => b.motivo);
  const porLocal = agruparWqi(baixas, (b) => b.local);
  const porTurno = agruparWqi(baixas, (b) => b.turno);
  const porProduto = agruparWqi(baixas, (b) => `${b.produto_codigo} — ${b.produto_descricao}`);
  const porResponsavel = agruparWqi(
    // Só pessoas: "Sem colaborador" não entra no ranking de quem manuseava.
    baixas.filter(temPessoaResponsavel),
    (b) => `${b.responsavel_nome}${b.responsavel_funcao ? ` (${b.responsavel_funcao})` : ""}`,
  );

  // A evolução vai em ordem de tempo, não de tamanho: é uma sequência.
  // Período de até 31 dias mostra por dia; maior, por mês.
  const dias = (new Date(`${ate}T00:00:00`).getTime() - new Date(`${de}T00:00:00`).getTime()) / 86_400_000;
  const porDia = dias <= 31;
  const evolucao = agruparWqi(baixas, (b) => (porDia ? b.data_ocorrido : b.data_ocorrido.slice(0, 7)))
    .sort((x, y) => x.chave.localeCompare(y.chave))
    .map((g) => ({
      rotulo: porDia ? dataBR(g.chave).slice(0, 5) : rotuloMes(g.chave),
      valor: valorDe(g),
      nota: `${g.lancamentos} lanç.`,
    }));

  // Local x Turno, a tabela que a planilha montava à mão.
  const locaisDaTabela = porLocal.map((l) => l.chave);
  const cruzado = new Map<string, number>();
  for (const b of baixas) {
    const k = `${b.local}|${b.turno}`;
    const v = metrica === "hl" ? b.hl_calculado ?? 0 : metrica === "lancamentos" ? 1 : b.unidades_equivalentes ?? 0;
    cruzado.set(k, (cruzado.get(k) ?? 0) + v);
  }
  const casas = metrica === "hl" ? 2 : 0;

  const filtrosAtuais = new URLSearchParams(
    Object.entries({ de, ate, turno, local, motivo, responsavel, m: metrica }).filter(([, v]) => v) as [string, string][],
  );
  const hrefCom = (mudanca: Record<string, string>) => {
    const p = new URLSearchParams(filtrosAtuais);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };
  const volta = `/gestao/wqi?${filtrosAtuais.toString()}`;

  const ano = hoje.slice(0, 4);
  const atalhos = [
    { rotulo: "Este mês", de: `${hoje.slice(0, 8)}01`, ate: hoje },
    { rotulo: "90 dias", de: diasAtrasISO(89), ate: hoje },
    { rotulo: `Ano ${ano}`, de: `${ano}-01-01`, ate: hoje },
  ];

  const listadas = baixas.slice(0, 200);

  return (
    <div>
      <PageHeader title="💸 Quebras WQI" subtitle="Baixa de PA por manuseio no armazém — o que quebra, onde, quando e com quem." />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>}

      {/* FILTROS -- formulário GET: o link da tela É o filtro, dá para mandar no WhatsApp. */}
      <form className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input type="hidden" name="m" value={metrica} />
        <div className="flex flex-wrap gap-2">
          {atalhos.map((a) => (
            <a
              key={a.rotulo}
              href={hrefCom({ de: a.de, ate: a.ate })}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                a.de === de && a.ate === ate ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {a.rotulo}
            </a>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <div>
            <label className={rotulo} htmlFor="de">De</label>
            <input id="de" name="de" type="date" defaultValue={de} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="ate">Até</label>
            <input id="ate" name="ate" type="date" defaultValue={ate} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="turno">Turno</label>
            <select id="turno" name="turno" defaultValue={turno} className={campo}>
              <option value="">Todos</option>
              {TURNOS.map((x) => (
                <option key={x} value={x}>{ROTULO_TURNO_WQI[x]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="local">Local</label>
            <select id="local" name="local" defaultValue={local} className={campo}>
              <option value="">Todos</option>
              {locais.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="motivo">Motivo</label>
            <select id="motivo" name="motivo" defaultValue={motivo} className={campo}>
              <option value="">Todos</option>
              {motivos.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="responsavel">Colaborador</label>
            <select id="responsavel" name="responsavel" defaultValue={responsavel} className={campo}>
              <option value="">Todos</option>
              {responsaveis.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {METRICAS.map((m) => (
              <a
                key={m.id}
                href={hrefCom({ m: m.id })}
                aria-current={m.id === metrica ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  m.id === metrica ? "bg-white text-primary-dark shadow-sm" : "text-slate-500"
                }`}
              >
                {m.rotulo}
              </a>
            ))}
          </div>
          <div className="flex gap-2">
            <a href="/gestao/wqi" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
              Limpar
            </a>
            <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Filtrar
            </button>
          </div>
        </div>
      </form>

      {/* NÚMEROS DO PERÍODO */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <CartaoHero titulo="Unidades quebradas" valor={fmt(t.unidades)} legenda={`${dataBR(de)} a ${dataBR(ate)}`} />
        <CartaoHero titulo="HL baixado" valor={fmt(t.hl, 2)} legenda="pelo cadastro do produto" />
        <CartaoHero titulo="Lançamentos" valor={fmt(t.lancamentos)} />
        <CartaoHero
          titulo="Com responsável"
          valor={t.lancamentos ? `${fmt((t.comResponsavel / t.lancamentos) * 100)}%` : "—"}
          legenda={`${t.comResponsavel} de ${t.lancamentos} com quem manuseava${
            t.semColaborador ? ` · ${t.semColaborador} sem colaborador` : ""
          }`}
        />
      </div>
      {t.semConversao > 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          {t.semConversao} lançamento(s) em caixa/lastro/palete de produto sem &quot;unidades por caixa&quot; no cadastro
          ficam fora da soma de unidades (e, sem Fator Hecto, fora do HL). Complete o cadastro em Produtividade do
          Armazém &gt; Configuração &gt; Produtos.
        </p>
      )}

      {baixas.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Nenhuma baixa WQI com esses filtros.</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <BarraRanking
              titulo={porDia ? "Evolução por dia" : "Evolução por mês"}
              subtitulo="Em ordem de data"
              itens={evolucao}
              sufixo={sufixo}
              tom="vermelho"
              formatarValor={(v) => fmt(v, casas)}
            />
            <BarraRanking titulo="Por motivo" itens={barras(porMotivo)} sufixo={sufixo} tom="vermelho" formatarValor={(v) => fmt(v, casas)} />
            <BarraRanking titulo="Por local" itens={barras(porLocal)} sufixo={sufixo} tom="vermelho" formatarValor={(v) => fmt(v, casas)} />
            <BarraRanking
              titulo="Por turno"
              itens={barras(porTurno, 3, (k) => (ehTurno(k) ? ROTULO_TURNO_WQI[k] : k))}
              sufixo={sufixo}
              tom="vermelho"
              formatarValor={(v) => fmt(v, casas)}
            />
            <BarraRanking
              titulo="Produtos que mais quebram"
              subtitulo="Os 10 maiores"
              itens={barras(porProduto, 10)}
              sufixo={sufixo}
              tom="vermelho"
              formatarValor={(v) => fmt(v, casas)}
            />
            <BarraRanking
              titulo="Por colaborador (quem manuseava)"
              subtitulo={`Os 10 maiores · só as ${t.comResponsavel} baixas com responsável informado`}
              itens={barras(porResponsavel, 10)}
              sufixo={sufixo}
              tom="vermelho"
              vazio="Nenhuma baixa com responsável informado."
              formatarValor={(v) => fmt(v, casas)}
            />
          </div>

          {/* LOCAL x TURNO */}
          <div className="mb-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Local × turno</h3>
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Local</th>
                  {TURNOS.map((x) => (
                    <th key={x} className="py-2 pr-3 text-right">{ROTULO_TURNO_WQI[x]}</th>
                  ))}
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {locaisDaTabela.map((l) => {
                  const valores = TURNOS.map((x) => cruzado.get(`${l}|${x}`) ?? 0);
                  return (
                    <tr key={l} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-700">{l}</td>
                      {valores.map((v, i) => (
                        <td key={i} className="py-2 pr-3 text-right tabular-nums text-slate-600">{v ? fmt(v, casas) : "—"}</td>
                      ))}
                      <td className="py-2 text-right font-bold tabular-nums text-slate-900">
                        {fmt(valores.reduce((s, v) => s + v, 0), casas)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* LANÇAMENTOS */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Lançamentos{" "}
                <span className="font-normal text-slate-400">
                  ({baixas.length > listadas.length ? `200 mais recentes de ${baixas.length}` : baixas.length})
                </span>
              </h3>
              <ExportarCsv
                nome="baixas-wqi"
                complemento={`${de}_a_${ate}`}
                cabecalho={[
                  "Data Ocorrido", "Turno", "Local", "Motivo", "Nota Fiscal", "Código", "Produto", "Quantidade",
                  "Unidade", "Unidades equiv.", "HL", "Colaborador", "Função", "Lançado por", "Lançado em", "Origem", "Observação",
                ]}
                linhas={baixas.map((b) => [
                  dataBR(b.data_ocorrido),
                  ROTULO_TURNO_WQI[b.turno],
                  b.local,
                  b.motivo,
                  b.nota_fiscal,
                  b.produto_codigo,
                  b.produto_descricao,
                  b.quantidade,
                  b.unidade,
                  b.unidades_equivalentes,
                  b.hl_calculado,
                  b.responsavel_nome,
                  b.responsavel_funcao,
                  b.colaborador_nome,
                  b.criado_em,
                  b.origem === "planilha" ? "Planilha" : "App",
                  b.observacao,
                ])}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Local</th>
                    <th className="py-2 pr-3">Motivo</th>
                    <th className="py-2 pr-3">Produto</th>
                    <th className="py-2 pr-3 text-right">Qtd</th>
                    <th className="py-2 pr-3">NF</th>
                    <th className="py-2 pr-3">Colaborador</th>
                    <th className="py-2 pr-3">Lançado por</th>
                    {podeExcluir && <th className="py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {listadas.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-700">
                        {dataBR(b.data_ocorrido)}
                        <span className="block text-[11px] text-slate-400">{ROTULO_TURNO_WQI[b.turno]}</span>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{b.local}</td>
                      <td className="py-2 pr-3 text-slate-600">{b.motivo}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        <span className="font-semibold">{b.produto_codigo}</span> {b.produto_descricao}
                        {b.foto_url && (
                          <a href={b.foto_url} target="_blank" rel="noreferrer" className="ml-1 text-xs text-primary">📷</a>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-slate-900">
                        {b.quantidade} {ehUnidadeWqi(b.unidade) ? ROTULO_UNIDADE_WQI_CURTO[b.unidade] : b.unidade}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{b.nota_fiscal ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-600">
                        {b.responsavel_nome ?? <span className="text-slate-300">—</span>}
                        {b.responsavel_funcao && <span className="block text-[11px] text-slate-400">{b.responsavel_funcao}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">
                        {b.colaborador_nome}
                        {b.origem === "planilha" && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px]">planilha</span>}
                      </td>
                      {podeExcluir && (
                        <td className="py-2">
                          <BotaoExcluir
                            action={excluirBaixaWqi}
                            campos={{ id: b.id, volta }}
                            confirmacao={`Excluir a baixa de ${b.quantidade} ${b.produto_descricao} de ${dataBR(b.data_ocorrido)}?`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
