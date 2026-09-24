import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { formatarReais } from "@/lib/qr-contingencia";
import type { ComprovanteComFotos, EdicaoDoComprovante } from "@/lib/qr-contingencia-server";
import { LivroDoMapa, type LancamentoDoLivro } from "./Conferir";

// O mesmo campo e rótulo das outras telas da Gestão (armazém, AG).
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const diaHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export type LinhaComprovante = {
  id: string;
  data: string;
  mapa: string | null;
  cod_pdv: string;
  cliente_nome: string | null;
  cliente_cidade: string | null;
  valor: number | string | null;
  observacao: string | null;
  colaborador_id: string | null;
  colaborador_nome: string;
  criado_em: string;
  pago_em: string | null;
  editado_em: string | null;
  conferido_em: string | null;
  conferido_por_nome: string | null;
  conferencia_situacao: string | null;
  valor_extrato: number | string | null;
  conferencia_obs: string | null;
  notas_fiscais: string[] | null;
};

/** "valor R$ 80,00 → R$ 85,00 · 1 foto tirada · 2 novas" -- o que a edição mudou. */
function oQueMudou(e: EdicaoDoComprovante) {
  const partes: string[] = [];
  if (e.valorAntes !== e.valorDepois) partes.push(`valor ${formatarReais(e.valorAntes)} → ${formatarReais(e.valorDepois)}`);
  if (e.fotosTiradas > 0) partes.push(`${e.fotosTiradas} foto${e.fotosTiradas === 1 ? " tirada" : "s tiradas"}`);
  if (e.fotosNovas > 0) partes.push(`${e.fotosNovas} foto${e.fotosNovas === 1 ? " nova" : "s novas"}`);
  if (e.notasAntes && e.notasDepois && e.notasAntes.join(",") !== e.notasDepois.join(",")) {
    partes.push(`NF ${e.notasAntes.join(", ") || "—"} → ${e.notasDepois.join(", ") || "—"}`);
  }
  return partes.join(" · ") || "sem mudança";
}

const valorDe = (l: LinhaComprovante) => (l.valor == null ? 0 : Number(l.valor));

/** A situação na conciliação (o conferido da 128 sem situação vale como conferido). */
function situacaoDe(l: LinhaComprovante): "conferido" | "divergente" | "desconsiderado" | null {
  if (l.conferencia_situacao === "desconsiderado") return "desconsiderado";
  if (l.conferencia_situacao === "divergente") return "divergente";
  if (l.conferencia_situacao === "conferido" || l.conferido_em) return "conferido";
  return null;
}

const diferencaDe = (l: LinhaComprovante) =>
  situacaoDe(l) === "divergente" ? Number(l.valor_extrato ?? 0) - valorDe(l) : 0;

/** O que merece um segundo olhar de quem concilia, por comprovante. */
function pontosDeAtencao(l: LinhaComprovante, repetidos: Set<string>) {
  const p: string[] = [];
  if (l.valor == null) p.push("sem valor");
  if (l.editado_em) p.push("editado");
  if (repetidos.has(`${l.mapa ?? "-"}|${l.cod_pdv}`)) p.push("cliente com mais de um comprovante");
  return p;
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/**
 * A TELA DA CONCILIAÇÃO -- refeita em 19/09/2026 (pedidos do dono: "mapa
 * com data, estranho", "todos os mapas agrupados", sem o Apagar, "algo que
 * ajude a conciliar" e, depois, "mais de contabilidade").
 *
 * De cima para baixo, na ordem do trabalho: o balanço do período
 * (recebido, conferido, divergente, a conferir); o RESUMO DE TODOS OS
 * MAPAS; e o LIVRO de cada mapa -- lançamentos com carimbo e o fechamento.
 */
export function PainelComprovantes({
  de,
  ate,
  mapaEscolhido,
  motoristaEscolhido,
  busca,
  temFiltro,
  mapasDoPeriodo,
  motoristasDoPeriodo,
  filtradas,
  comprovantes,
  podeConferir,
  clientesDaBase = {},
}: {
  de: string;
  ate: string;
  mapaEscolhido: string;
  motoristaEscolhido: string;
  busca: string;
  temFiltro: boolean;
  mapasDoPeriodo: string[];
  motoristasDoPeriodo: { valor: string; nome: string }[];
  filtradas: LinhaComprovante[];
  comprovantes: ComprovanteComFotos[];
  podeConferir: boolean;
  /** Razão social e fantasia pela base de clientes, por código. */
  clientesDaBase?: Record<string, { razaoSocial: string | null; fantasia: string | null }>;
}) {
  // Razão social em cima; fantasia embaixo só quando é outro nome. Cliente
  // fora da base: o nome gravado no comprovante.
  const nomesDo = (cod: string, gravado: string | null) => {
    const b = clientesDaBase[cod];
    const razaoSocial = b?.razaoSocial ?? b?.fantasia ?? gravado;
    const fantasia = b?.fantasia && b.fantasia !== razaoSocial ? b.fantasia : null;
    return { razaoSocial, fantasia };
  };
  const variosDias = de !== ate;

  // Cliente com dois comprovantes no mesmo mapa: pode ser pagamento em duas
  // partes -- ou o mesmo comprovante lançado duas vezes.
  const contagem = new Map<string, number>();
  for (const l of filtradas) {
    const k = `${l.mapa ?? "-"}|${l.cod_pdv}`;
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const repetidos = new Set([...contagem].filter(([, n]) => n > 1).map(([k]) => k));

  // ---- O BALANÇO DO PERÍODO (todas as linhas, não só as 300 com foto) ----
  // O desconsiderado (boleto, duplicado...) sai da conta: fica no livro,
  // riscado, mas não soma no PIX nem trava o fechamento (22/09/2026).
  const desconsideradas = filtradas.filter((l) => situacaoDe(l) === "desconsiderado");
  const considerados = filtradas.filter((l) => situacaoDe(l) !== "desconsiderado");
  const total = considerados.reduce((s, l) => s + valorDe(l), 0);
  const conferidas = filtradas.filter((l) => situacaoDe(l) === "conferido");
  const divergentes = filtradas.filter((l) => situacaoDe(l) === "divergente");
  const pendentes = filtradas.filter((l) => !situacaoDe(l));
  const soma = (ls: LinhaComprovante[]) => ls.reduce((s, l) => s + valorDe(l), 0);
  const diferencaTotal = divergentes.reduce((s, l) => s + diferencaDe(l), 0);
  const comAtencao = filtradas.filter((l) => pontosDeAtencao(l, repetidos).length > 0).length;

  // ---- AGRUPADO POR MAPA -- só o número; a data vai no lançamento ----
  const porMapa = new Map<string, LinhaComprovante[]>();
  for (const l of filtradas) {
    const k = l.mapa ?? "-";
    porMapa.set(k, [...(porMapa.get(k) ?? []), l]);
  }
  const resumo = [...porMapa]
    .map(([chave, linhas]) => ({
      chave,
      mapa: chave === "-" ? null : chave,
      linhas,
      total: soma(linhas.filter((l) => situacaoDe(l) !== "desconsiderado")),
      totalLancado: soma(linhas),
      desconsiderados: linhas.filter((l) => situacaoDe(l) === "desconsiderado").length,
      clientes: new Set(linhas.map((l) => l.cod_pdv)).size,
      conferidos: linhas.filter((l) => situacaoDe(l) === "conferido").length,
      divergentes: linhas.filter((l) => situacaoDe(l) === "divergente").length,
      diferenca: linhas.reduce((s, l) => s + diferencaDe(l), 0),
      motoristas: [...new Set(linhas.map((l) => l.colaborador_nome))],
      atencao: linhas.filter((l) => pontosDeAtencao(l, repetidos).length > 0).length,
    }))
    .sort((a, b) => (a.mapa === null ? 1 : b.mapa === null ? -1 : Number(b.mapa) - Number(a.mapa)));

  // ---- OS MAPAS DO FILTRO, pela situação (pedido do dono, 22/09/2026) ----
  // Fechado: tudo conciliado (desconsiderado conta) e sem divergência.
  // Aberto: nenhum comprovante conciliado ainda. Pendente: o resto --
  // conciliação começada ou com divergência.
  const situacaoDoMapa = (m: (typeof resumo)[number]) => {
    const feitos = m.conferidos + m.divergentes + m.desconsiderados;
    if (m.divergentes === 0 && feitos === m.linhas.length) return "fechado";
    if (feitos === 0) return "aberto";
    return "pendente";
  };
  const mapasFechados = resumo.filter((m) => situacaoDoMapa(m) === "fechado").length;
  const mapasAbertos = resumo.filter((m) => situacaoDoMapa(m) === "aberto").length;
  const mapasPendentes = resumo.length - mapasFechados - mapasAbertos;

  const detalhe = new Map(comprovantes.map((c) => [c.id, c]));
  const umMapaSo = resumo.length === 1;
  const hrefMapa = (mapa: string) => `/gestao/comprovantes-qr?${new URLSearchParams({ de, ate, mapa })}`;

  return (
    <div>
      <PageHeader
        title="🧾 Comprovantes de Pagamento"
        subtitle="A conciliação dos PIX da contingência com o extrato, mapa a mapa."
        fecharHref="/gestao"
      />

      {/* ---- FILTRO, no padrão das telas da Gestão ---- */}
      <FiltroNoLugar className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <div>
            <label className={rotulo} htmlFor="de">De</label>
            <input id="de" type="date" name="de" defaultValue={de} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="ate">Até</label>
            <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
          </div>
          <div>
            <label className={rotulo} htmlFor="mapa">Mapa</label>
            <select id="mapa" name="mapa" defaultValue={mapaEscolhido} className={campo}>
              <option value="">Todos</option>
              {mapasDoPeriodo.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={rotulo} htmlFor="motorista">Motorista</label>
            <select id="motorista" name="motorista" defaultValue={motoristaEscolhido} className={`${campo} sm:max-w-[16rem]`}>
              <option value="">Todos</option>
              {motoristasDoPeriodo.map((m) => (
                <option key={m.valor} value={m.valor}>{m.nome}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 min-w-0 sm:w-56">
            <label className={rotulo} htmlFor="busca">Cliente ou NF</label>
            <input id="busca" name="busca" defaultValue={busca} placeholder="Nome, código, cidade ou NF" className={campo} />
          </div>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white sm:flex-none">
              Filtrar
            </button>
            {temFiltro && (
              <Link
                href="/gestao/comprovantes-qr"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-primary"
              >
                Limpar
              </Link>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {variosDias ? `De ${dataBr(de)} a ${dataBr(ate)}` : `Dia ${dataBr(de)}`} — pela data do pagamento, mesmo quando o
          comprovante foi enviado depois (sem internet).
        </p>
      </FiltroNoLugar>

      {/* ---- O BALANÇO DO PERÍODO ---- */}
      {/* A área da Gestão tem ~650 px no computador (max-w-3xl menos a
          barra lateral): o "lg:" do Tailwind olha a janela, não a área, e
          cinco colunas ali cortavam os valores. Por isso: os mapas numa
          faixa inteira em cima e os quatro valores em 2 × 2. */}
      <section className="mb-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase text-slate-500">Mapas no filtro</p>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-700">{plural(resumo.length, "mapa", "mapas")}</p>
        </div>
        <dl className="mt-2 grid grid-cols-3 divide-x divide-slate-100 text-center">
          <div title="Nenhum comprovante conciliado ainda" className="px-2">
            <dd className="font-mono text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">{mapasAbertos}</dd>
            <dt className="mt-0.5 text-xs font-medium text-slate-500">Abertos</dt>
          </div>
          <div title="Conciliação começada ou com divergência" className="px-2">
            <dd className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${mapasPendentes ? "text-amber-600" : "text-slate-300"}`}>
              {mapasPendentes}
            </dd>
            <dt className="mt-0.5 text-xs font-medium text-amber-700">Pendentes</dt>
          </div>
          <div title="Tudo conciliado, sem divergência" className="px-2">
            <dd className={`font-mono text-2xl font-bold tabular-nums sm:text-3xl ${mapasFechados ? "text-emerald-600" : "text-slate-300"}`}>
              {mapasFechados}
            </dd>
            <dt className="mt-0.5 text-xs font-medium text-emerald-700">Fechados</dt>
          </div>
        </dl>
        {resumo.length > 0 && (
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-slate-300" style={{ width: `${(mapasAbertos / resumo.length) * 100}%` }} />
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${(mapasPendentes / resumo.length) * 100}%` }} />
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(mapasFechados / resumo.length) * 100}%` }} />
          </div>
        )}
      </section>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <Numero
          titulo="Recebido em PIX"
          valor={formatarReais(total)}
          detalhe={`${plural(considerados.length, "comprovante", "comprovantes")} · ${plural(resumo.length, "mapa", "mapas")}`}
          tom="destaque"
        />
        <Numero
          titulo="Conferido"
          valor={formatarReais(soma(conferidas))}
          detalhe={`${conferidas.length} de ${considerados.length} comprovantes`}
          progresso={considerados.length ? conferidas.length / considerados.length : 0}
          tom={considerados.length > 0 && conferidas.length === considerados.length ? "ok" : "neutro"}
        />
        <Numero
          titulo="Divergente"
          valor={formatarReais(soma(divergentes))}
          detalhe={divergentes.length ? `${divergentes.length} · diferença ${formatarReais(diferencaTotal)}` : "nenhuma divergência"}
          tom={divergentes.length ? "erro" : "neutro"}
        />
        <Numero
          titulo="A conferir"
          valor={formatarReais(soma(pendentes))}
          detalhe={plural(pendentes.length, "comprovante", "comprovantes")}
        />
      </div>
      {desconsideradas.length > 0 && (
        <p className="mb-2 px-1 text-xs text-slate-500">
          ⊘ {plural(desconsideradas.length, "comprovante desconsiderado", "comprovantes desconsiderados")} (
          {formatarReais(soma(desconsideradas))}) fora da conta — boleto, duplicado ou lançado errado. Continuam no
          livro do mapa, riscados.
        </p>
      )}
      {comAtencao > 0 && (
        <p className="mb-5 px-1 text-xs text-amber-800">
          ⚠️ {plural(comAtencao, "comprovante pede", "comprovantes pedem")} um segundo olhar — editado, sem valor ou cliente
          repetido no mapa. Estão marcados nos mapas.
        </p>
      )}
      {comAtencao === 0 && <div className="mb-5" />}

      {resumo.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🧾</p>
          <p className="mt-2 text-sm font-medium text-slate-700">Nenhum comprovante neste filtro.</p>
          <p className="mt-1 text-xs text-slate-500">
            Os comprovantes aparecem aqui assim que o motorista registra no Comprovante de Pagamento.
          </p>
        </div>
      ) : (
        <>
          {/* ---- RESUMO DE TODOS OS MAPAS ---- */}
          {!umMapaSo && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-800">Resumo por mapa</h2>
                <span className="text-xs text-slate-500">Toque no mapa para abrir o livro dele</span>
              </div>
              {/* TRÊS COLUNAS, não seis (24/09/2026: "está cortado"). A área
                  da Gestão tem ~650 px no computador, e os `sm:`/`md:` do
                  Tailwind olham a JANELA, não a área: as colunas apareciam
                  todas e a Situação ficava fora da tela. Motorista, clientes
                  e diferença viraram a segunda linha do mapa. */}
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Mapa</th>
                    <th className="w-[7.5rem] px-2 py-2 text-right">PIX</th>
                    <th className="w-[6.5rem] px-2 py-2 text-right">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumo.map((m) => (
                    <tr key={m.chave} className="align-top hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          {m.mapa ? (
                            <Link href={hrefMapa(m.mapa)} className="font-mono font-bold tabular-nums text-primary-dark hover:underline">
                              {m.mapa}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Sem mapa</span>
                          )}
                          {m.atencao > 0 && (
                            <span className="text-xs text-amber-600" title={`${m.atencao} ponto(s) de atenção`}>
                              ⚠️
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500" title={m.motoristas.join(", ")}>
                          {m.motoristas.join(", ")}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          {plural(m.clientes, "cliente", "clientes")}
                          {m.desconsiderados > 0 && ` · ${m.desconsiderados} desconsiderado${m.desconsiderados === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums text-slate-900">
                        {formatarReais(m.total)}
                        {m.divergentes > 0 && (
                          <span className="block whitespace-nowrap text-[11px] font-normal text-red-700">
                            dif. {formatarReais(m.diferenca)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Situacao divergentes={m.divergentes} feitos={m.conferidos + m.divergentes + m.desconsiderados} total={m.linhas.length} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-[3px] border-double border-slate-300 bg-slate-50 align-top font-semibold">
                    <td className="px-3 py-2.5 text-slate-700">
                      Total
                      <span className="block text-[11px] font-normal text-slate-400">
                        {plural(resumo.reduce((s, m) => s + m.clientes, 0), "cliente", "clientes")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[13px] tabular-nums text-slate-900">
                      {formatarReais(total)}
                      {divergentes.length > 0 && (
                        <span className="block whitespace-nowrap text-[11px] font-normal text-red-700">
                          dif. {formatarReais(diferencaTotal)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Situacao
                        divergentes={divergentes.length}
                        feitos={conferidas.length + divergentes.length + desconsideradas.length}
                        total={filtradas.length}
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {umMapaSo ? "Livro do mapa" : "Livro de cada mapa"}
            </h2>
            <ExportarCsv
              nome="conciliacao-pix"
              complemento={`${de}_a_${ate}`}
              cabecalho={[
                "Data",
                "Hora do pagamento",
                "Mapa",
                "Código do cliente",
                "Razão social",
                "Nome fantasia",
                "Cidade",
                "Valor do comprovante",
                "NF",
                "Situação",
                "Valor no extrato",
                "Diferença",
                "Motivo (divergência ou desconsiderado)",
                "Conciliado por",
                "Motorista",
                "Fotos",
                "Observação",
                "Editado",
              ]}
              linhas={filtradas.map((l) => {
                const s = situacaoDe(l);
                return [
                  dataBr(l.data),
                  hora(l.pago_em ?? l.criado_em),
                  l.mapa ?? "",
                  l.cod_pdv,
                  nomesDo(l.cod_pdv, l.cliente_nome).razaoSocial ?? "",
                  clientesDaBase[l.cod_pdv]?.fantasia ?? "",
                  l.cliente_cidade ?? "",
                  l.valor == null ? "" : Number(l.valor),
                  (l.notas_fiscais ?? []).join(", "),
                  s === "conferido" ? "Conferido" : s === "divergente" ? "Divergente" : s === "desconsiderado" ? "Desconsiderado" : "A conferir",
                  s === "conferido" ? valorDe(l) : s === "divergente" ? Number(l.valor_extrato ?? 0) : "",
                  s === "divergente" ? diferencaDe(l) : s === "conferido" ? 0 : "",
                  l.conferencia_obs ?? "",
                  l.conferido_em ? `${l.conferido_por_nome ?? ""} ${diaHora(l.conferido_em)}`.trim() : "",
                  l.colaborador_nome,
                  detalhe.get(l.id)?.fotos.length ?? "",
                  l.observacao ?? "",
                  // Só os 300 com fotos trazem o detalhe; os demais, a hora da última edição.
                  l.editado_em
                    ? (detalhe
                        .get(l.id)
                        ?.edicoes.map((e) => `${hora(e.editadoEm)}: ${oQueMudou(e)}`)
                        .join(" | ") ?? `às ${hora(l.editado_em)}`)
                    : "",
                ];
              })}
              rotulo="Exportar .csv"
            />
          </div>

          {/* ---- O LIVRO DE CADA MAPA ---- */}
          <div className="space-y-3">
            {resumo.map((m) => {
              const itens = m.linhas
                .map((l) => detalhe.get(l.id))
                .filter((c): c is ComprovanteComFotos => Boolean(c))
                .sort((a, b) => a.pagoEm.localeCompare(b.pagoEm));
              if (itens.length === 0) return null;
              const dias = [...new Set(itens.map((c) => c.data))].sort();
              const variasPessoas = m.motoristas.length > 1;

              const lancamentos: LancamentoDoLivro[] = itens.map((c) => {
                const linha = m.linhas.find((l) => l.id === c.id)!;
                const atencao = pontosDeAtencao(linha, repetidos);
                return {
                  id: c.id,
                  dia: variosDias ? dataCurta(c.data) : null,
                  hora: hora(c.pagoEm),
                  codPdv: c.codPdv,
                  ...nomesDo(c.codPdv, c.clienteNome),
                  clienteCidade: c.clienteCidade,
                  colaboradorNome: variasPessoas ? c.colaboradorNome : null,
                  valor: c.valor,
                  notas: c.notas,
                  fotos: c.fotos,
                  observacao: c.observacao,
                  avisos: [
                    ...(atencao.includes("cliente com mais de um comprovante") ? ["⚠️ cliente com mais de um comprovante neste mapa"] : []),
                    ...(c.enviadoDepois ? [`📵 feito sem internet · enviado às ${hora(c.criadoEm)}`] : []),
                  ],
                  edicoes: c.edicoes.map((e) => `Editado às ${hora(e.editadoEm)} por ${e.colaboradorNome} · ${oQueMudou(e)}`),
                  situacao: c.situacao,
                  valorExtrato: c.valorExtrato,
                  motivo: c.conferenciaObs,
                  conferidoPor: c.conferidoEm ? `${c.conferidoPorNome ?? "—"} · ${diaHora(c.conferidoEm)}` : null,
                };
              });

              const selo = (s: LancamentoDoLivro["situacao"]) =>
                s === "conferido" ? "[OK]" : s === "divergente" ? "[DIVERGENTE]" : s === "desconsiderado" ? "[DESCONSIDERADO]" : "[ ]";
              const textoResumo = [
                `Mapa ${m.mapa ?? "sem número"} — ${m.motoristas.join(", ")} — ${dias.map(dataCurta).join(", ")}`,
                ...lancamentos.map(
                  (l) =>
                    `${selo(l.situacao)} ${l.dia ? `${l.dia} ` : ""}${l.hora} · ${l.codPdv} ${l.razaoSocial ?? ""}${l.fantasia ? ` (${l.fantasia})` : ""}${
                      l.notas.length ? ` · NF ${l.notas.join(", ")}` : ""
                    } · ${formatarReais(l.valor)}${
                      l.situacao === "divergente"
                        ? ` (extrato ${formatarReais(l.valorExtrato)} — ${l.motivo ?? ""})`
                        : l.situacao === "desconsiderado"
                          ? ` (fora da conta — ${l.motivo ?? ""})`
                          : ""
                    }`,
                ),
                `Total PIX: ${formatarReais(m.total)} (${plural(m.linhas.length - m.desconsiderados, "comprovante", "comprovantes")})`,
                `Conferido ${m.conferidos} · Divergente ${m.divergentes}${m.desconsiderados ? ` · Desconsiderado ${m.desconsiderados}` : ""} · A conferir ${m.linhas.length - m.conferidos - m.divergentes - m.desconsiderados}`,
              ].join("\n");

              return (
                <LivroDoMapa
                  key={m.chave}
                  titulo={m.mapa ? `Mapa ${m.mapa}` : "Sem mapa informado"}
                  subtitulo={`${m.motoristas.join(", ")} · ${plural(m.clientes, "cliente", "clientes")}${
                    m.atencao > 0 ? ` · ⚠️ ${m.atencao}` : ""
                  }`}
                  aberto={umMapaSo}
                  lancamentos={lancamentos}
                  totalDoMapa={m.totalLancado}
                  qtdNoMapa={m.linhas.length}
                  podeConferir={podeConferir}
                  textoResumo={textoResumo}
                />
              );
            })}
          </div>
        </>
      )}

      {filtradas.length > 300 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Mostrando os 300 mais recentes de {filtradas.length}. Estreite o período para ver os outros — a planilha traz todos.
        </p>
      )}
    </div>
  );
}

function Situacao({ divergentes, feitos, total }: { divergentes: number; feitos: number; total: number }) {
  const base = "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (divergentes > 0) {
    return <span className={`${base} bg-red-100 text-red-800`}>≠ {divergentes} divergente{divergentes === 1 ? "" : "s"}</span>;
  }
  if (total > 0 && feitos === total) return <span className={`${base} bg-emerald-100 text-emerald-800`}>✓ Fechado</span>;
  if (feitos === 0) return <span className={`${base} bg-slate-100 text-slate-600`}>A conferir</span>;
  return (
    <span className={`${base} bg-amber-100 tabular-nums text-amber-800`}>
      {feitos} de {total}
    </span>
  );
}

function Numero({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
  progresso,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  tom?: "neutro" | "destaque" | "ok" | "erro";
  progresso?: number;
}) {
  const caixa = {
    neutro: "border-slate-200 bg-white",
    destaque: "border-primary/30 bg-primary-soft",
    ok: "border-emerald-200 bg-emerald-50",
    erro: "border-red-200 bg-red-50",
  }[tom];
  const numero = {
    neutro: "text-slate-900",
    destaque: "text-primary-dark",
    ok: "text-emerald-800",
    erro: "text-red-700",
  }[tom];
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${caixa}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p className={`mt-1 truncate font-mono text-xl font-bold tabular-nums ${numero}`}>{valor}</p>
      {progresso !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(progresso * 100)}%` }} />
        </div>
      )}
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}
