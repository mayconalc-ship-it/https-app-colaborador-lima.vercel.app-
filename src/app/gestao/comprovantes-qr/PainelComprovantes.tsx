import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { formatarReais } from "@/lib/qr-contingencia";
import type { ComprovanteComFotos, EdicaoDoComprovante } from "@/lib/qr-contingencia-server";
import { BotaoConferir, CopiarResumo } from "./Conferir";

// O mesmo campo e rótulo das outras telas da Gestão (armazém, AG).
const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

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
};

/** "valor R$ 80,00 → R$ 85,00 · 1 foto tirada · 2 novas" -- o que a edição mudou. */
function oQueMudou(e: EdicaoDoComprovante) {
  const partes: string[] = [];
  if (e.valorAntes !== e.valorDepois) partes.push(`valor ${formatarReais(e.valorAntes)} → ${formatarReais(e.valorDepois)}`);
  if (e.fotosTiradas > 0) partes.push(`${e.fotosTiradas} foto${e.fotosTiradas === 1 ? " tirada" : "s tiradas"}`);
  if (e.fotosNovas > 0) partes.push(`${e.fotosNovas} foto${e.fotosNovas === 1 ? " nova" : "s novas"}`);
  return partes.join(" · ") || "sem mudança";
}

const valorDe = (l: LinhaComprovante) => (l.valor == null ? 0 : Number(l.valor));

/** O que merece um segundo olhar de quem concilia, por comprovante. */
function pontosDeAtencao(l: LinhaComprovante, repetidos: Set<string>) {
  const p: string[] = [];
  if (l.valor == null) p.push("sem valor");
  if (l.editado_em) p.push("editado");
  if (repetidos.has(`${l.mapa ?? "-"}|${l.cod_pdv}`)) p.push("cliente com mais de um comprovante");
  return p;
}

/**
 * A TELA DA CONCILIAÇÃO -- refeita em 19/09/2026 (pedido do dono: "mapa
 * com data, estranho", "todos os mapas agrupados", sem o Apagar, e "algo
 * que ajude a conciliar e o trabalho do financeiro").
 *
 * De cima para baixo, na ordem do trabalho: quanto entrou em PIX e quanto
 * já foi conferido; o RESUMO DE TODOS OS MAPAS numa tabela (um clique abre
 * o mapa); e cada mapa com os clientes, o "Conferir" de cada comprovante,
 * o "conferir todos" e o resumo para copiar.
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
}) {
  const variosDias = de !== ate;

  // Cliente com dois comprovantes no mesmo mapa: pode ser pagamento em duas
  // partes -- ou o mesmo comprovante lançado duas vezes.
  const contagem = new Map<string, number>();
  for (const l of filtradas) {
    const k = `${l.mapa ?? "-"}|${l.cod_pdv}`;
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  const repetidos = new Set([...contagem].filter(([, n]) => n > 1).map(([k]) => k));

  // ---- Os números do período (todas as linhas, não só as 300 com foto) ----
  const total = filtradas.reduce((s, l) => s + valorDe(l), 0);
  const conferidas = filtradas.filter((l) => l.conferido_em);
  const totalConferido = conferidas.reduce((s, l) => s + valorDe(l), 0);
  const comAtencao = filtradas.filter((l) => pontosDeAtencao(l, repetidos).length > 0).length;

  // ---- AGRUPADO POR MAPA -- só o número; a data vai no comprovante ----
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
      total: linhas.reduce((s, l) => s + valorDe(l), 0),
      clientes: new Set(linhas.map((l) => l.cod_pdv)).size,
      conferidos: linhas.filter((l) => l.conferido_em).length,
      motoristas: [...new Set(linhas.map((l) => l.colaborador_nome))],
      atencao: linhas.filter((l) => pontosDeAtencao(l, repetidos).length > 0).length,
    }))
    .sort((a, b) => (a.mapa === null ? 1 : b.mapa === null ? -1 : Number(b.mapa) - Number(a.mapa)));

  const detalhe = new Map(comprovantes.map((c) => [c.id, c]));
  const umMapaSo = resumo.length === 1;
  const hrefMapa = (mapa: string) => `/gestao/comprovantes-qr?${new URLSearchParams({ de, ate, mapa })}`;

  return (
    <div>
      <PageHeader
        title="🧾 Comprovantes de Pagamento"
        subtitle="Os PIX recebidos na contingência, mapa a mapa, para conferir com o extrato."
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
            <label className={rotulo} htmlFor="busca">Cliente</label>
            <input id="busca" name="busca" defaultValue={busca} placeholder="Nome, código ou cidade" className={campo} />
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

      {/* ---- OS NÚMEROS DA CONCILIAÇÃO ---- */}
      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Numero
          titulo="Recebido em PIX"
          valor={formatarReais(total)}
          detalhe={`${filtradas.length} comprovante${filtradas.length === 1 ? "" : "s"} · ${resumo.length} mapa${resumo.length === 1 ? "" : "s"}`}
          destaque
        />
        <Numero
          titulo="Conferido"
          valor={formatarReais(totalConferido)}
          detalhe={`${conferidas.length} de ${filtradas.length}`}
          progresso={filtradas.length ? conferidas.length / filtradas.length : 0}
        />
        <Numero
          titulo="Falta conferir"
          valor={formatarReais(total - totalConferido)}
          detalhe={`${filtradas.length - conferidas.length} comprovante${filtradas.length - conferidas.length === 1 ? "" : "s"}`}
        />
        <Numero
          titulo="Pontos de atenção"
          valor={String(comAtencao)}
          detalhe={comAtencao ? "veja o ⚠️ nos mapas" : "nada fora do normal"}
          alerta={comAtencao > 0}
        />
      </div>

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
                <span className="text-xs text-slate-500">Toque no mapa para ver os clientes</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2">Mapa</th>
                      <th className="hidden px-2 py-2 sm:table-cell">Motorista</th>
                      <th className="hidden px-2 py-2 text-right sm:table-cell">Clientes</th>
                      <th className="px-2 py-2 text-right">PIX</th>
                      <th className="px-4 py-2 text-right">Conferência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumo.map((m) => (
                      <tr key={m.chave} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          {m.mapa ? (
                            <Link href={hrefMapa(m.mapa)} className="font-bold tabular-nums text-primary-dark hover:underline">
                              {m.mapa}
                            </Link>
                          ) : (
                            <span className="text-slate-500">Sem mapa</span>
                          )}
                          {m.atencao > 0 && (
                            <span className="ml-1.5 text-xs text-amber-600" title={`${m.atencao} ponto(s) de atenção`}>
                              ⚠️
                            </span>
                          )}
                        </td>
                        <td className="hidden max-w-[12rem] truncate px-2 py-2.5 text-slate-600 sm:table-cell">
                          {m.motoristas.join(", ")}
                        </td>
                        <td className="hidden px-2 py-2.5 text-right tabular-nums text-slate-600 sm:table-cell">{m.clientes}</td>
                        <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatarReais(m.total)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <StatusConferencia feitos={m.conferidos} total={m.linhas.length} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <td className="px-4 py-2.5 text-slate-700">Total</td>
                      <td className="hidden sm:table-cell" />
                      <td className="hidden px-2 py-2.5 text-right tabular-nums text-slate-700 sm:table-cell">
                        {resumo.reduce((s, m) => s + m.clientes, 0)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-slate-900">{formatarReais(total)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusConferencia feitos={conferidas.length} total={filtradas.length} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}

          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {umMapaSo ? "Clientes do mapa" : "Mapas"}
            </h2>
            <ExportarCsv
              nome="comprovantes-qr"
              complemento={`${de}_a_${ate}`}
              cabecalho={[
                "Data",
                "Hora do pagamento",
                "Mapa",
                "Código do cliente",
                "Cliente",
                "Cidade",
                "Valor",
                "Motorista",
                "Fotos",
                "Observação",
                "Conferido por",
                "Editado",
              ]}
              linhas={filtradas.map((l) => [
                dataBr(l.data),
                hora(l.pago_em ?? l.criado_em),
                l.mapa ?? "",
                l.cod_pdv,
                l.cliente_nome ?? "",
                l.cliente_cidade ?? "",
                l.valor == null ? "" : Number(l.valor),
                l.colaborador_nome,
                detalhe.get(l.id)?.fotos.length ?? "",
                l.observacao ?? "",
                l.conferido_em ? `${l.conferido_por_nome ?? ""} ${dataCurta(l.conferido_em.slice(0, 10))} ${hora(l.conferido_em)}`.trim() : "",
                // Só os 300 com fotos trazem o detalhe; os demais, a hora da última edição.
                l.editado_em
                  ? (detalhe
                      .get(l.id)
                      ?.edicoes.map((e) => `${hora(e.editadoEm)}: ${oQueMudou(e)}`)
                      .join(" | ") ?? `às ${hora(l.editado_em)}`)
                  : "",
              ])}
              rotulo="Exportar .csv"
            />
          </div>

          {/* ---- CADA MAPA ---- */}
          <div className="space-y-3">
            {resumo.map((m) => {
              const itens = m.linhas
                .map((l) => detalhe.get(l.id))
                .filter((c): c is ComprovanteComFotos => Boolean(c))
                .sort((a, b) => a.pagoEm.localeCompare(b.pagoEm));
              if (itens.length === 0) return null;
              const faltam = itens.filter((c) => !c.conferidoEm).map((c) => c.id);
              const dias = [...new Set(itens.map((c) => c.data))].sort();
              const textoResumo = [
                `Mapa ${m.mapa ?? "sem número"} — ${m.motoristas.join(", ")} — ${dias.map(dataCurta).join(", ")}`,
                ...itens.map(
                  (c) =>
                    `${variosDias ? `${dataCurta(c.data)} ` : ""}${hora(c.pagoEm)} · ${c.codPdv} ${c.clienteNome ?? ""} · ${formatarReais(c.valor)}`,
                ),
                `Total PIX: ${formatarReais(m.total)} (${itens.length} comprovante${itens.length === 1 ? "" : "s"})`,
              ].join("\n");

              return (
                <details
                  key={m.chave}
                  open={umMapaSo}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-lg font-bold tabular-nums text-slate-900">
                          {m.mapa ? `Mapa ${m.mapa}` : "Sem mapa informado"}
                        </span>
                        {m.atencao > 0 && <span className="text-xs font-semibold text-amber-600">⚠️ {m.atencao}</span>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {m.motoristas.join(", ")} · {m.clientes} cliente{m.clientes === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-bold tabular-nums text-slate-900">{formatarReais(m.total)}</span>
                      <StatusConferencia feitos={m.conferidos} total={m.linhas.length} />
                    </span>
                    <span
                      className="shrink-0 text-sm text-slate-400 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </summary>

                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {itens.map((c) => {
                      const linha = m.linhas.find((l) => l.id === c.id)!;
                      const atencao = pontosDeAtencao(linha, repetidos);
                      return (
                        <li key={c.id} className={`flex gap-3 px-4 py-3 ${c.conferidoEm ? "bg-emerald-50/40" : ""}`}>
                          <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-500">
                            {variosDias && <span className="block text-[10px] font-medium text-slate-400">{dataCurta(c.data)}</span>}
                            {hora(c.pagoEm)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {c.clienteNome ?? "Cliente sem cadastro"}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  <span className="rounded bg-slate-100 px-1 font-semibold tabular-nums text-slate-600">{c.codPdv}</span>
                                  {c.clienteCidade && ` · ${c.clienteCidade}`}
                                  {m.motoristas.length > 1 && ` · ${c.colaboradorNome}`}
                                </p>
                              </div>
                              <span className="shrink-0 text-base font-bold tabular-nums text-slate-900">
                                {c.valor == null ? <span className="text-sm font-medium text-amber-700">sem valor</span> : formatarReais(c.valor)}
                              </span>
                            </div>

                            {(atencao.includes("cliente com mais de um comprovante") || c.enviadoDepois || c.observacao) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {atencao.includes("cliente com mais de um comprovante") && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                    ⚠️ cliente com mais de um comprovante neste mapa
                                  </span>
                                )}
                                {c.enviadoDepois && (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    📵 feito sem internet · enviado às {hora(c.criadoEm)}
                                  </span>
                                )}
                                {c.observacao && <span className="text-xs italic text-slate-600">“{c.observacao}”</span>}
                              </div>
                            )}

                            {c.edicoes.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {c.edicoes.map((e, i) => (
                                  <li
                                    key={i}
                                    className="w-fit rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900"
                                  >
                                    ✏️ Editado às {hora(e.editadoEm)} por {e.colaboradorNome} · {oQueMudou(e)}
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div className="mt-2 flex items-end gap-1.5">
                              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                                {c.fotos.map((f, i) =>
                                  f.url ? (
                                    <a
                                      key={f.id}
                                      href={f.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Abrir a foto ${i + 1}`}
                                      className="shrink-0 overflow-hidden rounded-lg border border-slate-200 hover:border-primary"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                                      <img src={f.url} alt={`Comprovante, foto ${i + 1}`} className="h-14 w-11 object-cover" />
                                    </a>
                                  ) : (
                                    <span
                                      key={f.id}
                                      className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400"
                                    >
                                      sem foto
                                    </span>
                                  ),
                                )}
                              </div>
                              <span className="shrink-0 text-right">
                                {podeConferir ? (
                                  <BotaoConferir
                                    ids={[c.id]}
                                    conferido={Boolean(c.conferidoEm)}
                                    variante="item"
                                    titulo={
                                      c.conferidoEm
                                        ? `Conferido por ${c.conferidoPorNome ?? "—"} em ${dataCurta(c.conferidoEm.slice(0, 10))} às ${hora(c.conferidoEm)}`
                                        : undefined
                                    }
                                  />
                                ) : c.conferidoEm ? (
                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                    ✅ Conferido
                                  </span>
                                ) : null}
                                {c.conferidoEm && (
                                  <span className="mt-0.5 block text-[10px] text-slate-400">
                                    {c.conferidoPorNome} · {hora(c.conferidoEm)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm text-slate-600">
                      Total do mapa <strong className="tabular-nums text-slate-900">{formatarReais(m.total)}</strong>
                      {m.linhas.length > itens.length && ` (${itens.length} de ${m.linhas.length} na tela)`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <CopiarResumo texto={textoResumo} />
                      {podeConferir && faltam.length > 0 && <BotaoConferir ids={faltam} conferido={false} variante="mapa" />}
                    </div>
                  </div>
                </details>
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

function StatusConferencia({ feitos, total }: { feitos: number; total: number }) {
  if (total > 0 && feitos === total) {
    return <span className="inline-block whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">✅ Conferido</span>;
  }
  if (feitos === 0) {
    return <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">A conferir</span>;
  }
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
      {feitos} de {total}
    </span>
  );
}

function Numero({
  titulo,
  valor,
  detalhe,
  destaque = false,
  alerta = false,
  progresso,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  alerta?: boolean;
  progresso?: number;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm ${
        destaque ? "border-primary/30 bg-primary-soft" : alerta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p
        className={`mt-1 truncate text-xl font-bold tabular-nums ${
          destaque ? "text-primary-dark" : alerta ? "text-amber-800" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {progresso !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(progresso * 100)}%` }} />
        </div>
      )}
      <p className="mt-1 truncate text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}
