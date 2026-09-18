import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { formatarReais } from "@/lib/qr-contingencia";
import type { ComprovanteComFotos } from "@/lib/qr-contingencia-server";
import { ApagarComprovante } from "./ApagarComprovante";

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
};

/**
 * A TELA dos comprovantes, a partir dos dados já lidos. Separada da
 * página (que confere o acesso e lê o banco) para poder ser vista com
 * dados de exemplo antes de existir comprovante de verdade.
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
  podeExcluir,
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
  podeExcluir: boolean;
}) {
  // ---- Agrupado por mapa (e dia: o número do mapa pode se repetir) ----
  const grupos = new Map<string, { mapa: string | null; data: string; itens: ComprovanteComFotos[] }>();
  for (const c of comprovantes) {
    const chave = `${c.mapa ?? "-"}|${c.data}`;
    const g = grupos.get(chave) ?? { mapa: c.mapa, data: c.data, itens: [] };
    g.itens.push(c);
    grupos.set(chave, g);
  }
  const mapas = [...grupos.values()]
    .map((g) => ({
      ...g,
      itens: g.itens.sort((a, b) => a.pagoEm.localeCompare(b.pagoEm)),
      total: g.itens.reduce((s, c) => s + (c.valor ?? 0), 0),
      motoristas: [...new Set(g.itens.map((c) => c.colaboradorNome))],
    }))
    .sort((a, b) => b.data.localeCompare(a.data) || (a.mapa === null ? 1 : b.mapa === null ? -1 : Number(b.mapa) - Number(a.mapa)));

  const total = filtradas.reduce((s, l) => s + (l.valor == null ? 0 : Number(l.valor)), 0);
  const qtdMotoristas = new Set(filtradas.map((l) => l.colaborador_id ?? l.colaborador_nome)).size;
  const qtdMapas = new Set(filtradas.map((l) => `${l.mapa ?? "-"}|${l.data}`)).size;

  return (
    <div>
      <PageHeader
        title="🧾 Comprovantes de Pagamento"
        subtitle="Pagamentos pelo PIX da empresa, com a foto do comprovante, mapa a mapa."
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
          {de === ate ? `Dia ${dataBr(de)}` : `De ${dataBr(de)} a ${dataBr(ate)}`} — a data é a do pagamento, mesmo quando o
          comprovante foi enviado depois (sem internet).
        </p>
      </FiltroNoLugar>

      {/* ---- O RESUMO ---- */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero titulo="Comprovantes" valor={String(filtradas.length)} />
        <Numero titulo="Valor recebido" valor={formatarReais(total)} destaque />
        <Numero titulo="Mapas" valor={String(qtdMapas)} />
        <Numero titulo="Motoristas" valor={String(qtdMotoristas)} />
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Por mapa</h2>
        <ExportarCsv
          nome="comprovantes-qr"
          complemento={`${de}_a_${ate}`}
          cabecalho={["Data", "Hora do pagamento", "Mapa", "Código do cliente", "Cliente", "Cidade", "Valor", "Motorista", "Fotos", "Observação"]}
          linhas={filtradas.map((l) => [
            dataBr(l.data),
            hora(l.pago_em ?? l.criado_em),
            l.mapa ?? "",
            l.cod_pdv,
            l.cliente_nome ?? "",
            l.cliente_cidade ?? "",
            l.valor == null ? "" : Number(l.valor),
            l.colaborador_nome,
            comprovantes.find((c) => c.id === l.id)?.fotos.length ?? "",
            l.observacao ?? "",
          ])}
          rotulo="Exportar .csv"
        />
      </div>

      {mapas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🧾</p>
          <p className="mt-2 text-sm font-medium text-slate-700">Nenhum comprovante neste filtro.</p>
          <p className="mt-1 text-xs text-slate-500">
            Os comprovantes aparecem aqui assim que o motorista registra no Comprovante de Pagamento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mapas.map((g) => (
            <details
              key={`${g.mapa ?? "-"}|${g.data}`}
              open={mapas.length <= 6}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft text-primary-dark">
                  <span className="text-[10px] font-semibold uppercase leading-none">Mapa</span>
                  <span className="text-[11px] font-bold leading-tight tabular-nums">{dataCurta(g.data)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-slate-900">
                    {g.mapa ? `Mapa ${g.mapa}` : "Sem mapa informado"}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{g.motoristas.join(", ")}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-bold tabular-nums text-slate-900">{formatarReais(g.total)}</span>
                  <span className="block text-xs text-slate-500">
                    {g.itens.length} cliente{g.itens.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span
                  className="shrink-0 text-sm text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>

              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {g.itens.map((c) => (
                  <li key={c.id} className="flex gap-3 px-4 py-3">
                    <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-500">{hora(c.pagoEm)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {c.clienteNome ?? "Cliente sem cadastro"}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            <span className="rounded bg-slate-100 px-1 font-semibold tabular-nums text-slate-600">{c.codPdv}</span>
                            {c.clienteCidade && ` · ${c.clienteCidade}`}
                            {g.motoristas.length > 1 && ` · ${c.colaboradorNome}`}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                          {c.valor == null ? <span className="font-medium text-amber-700">sem valor</span> : formatarReais(c.valor)}
                        </span>
                      </div>

                      {(c.observacao || c.enviadoDepois) && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {c.enviadoDepois && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              📵 feito sem internet · enviado às {hora(c.criadoEm)}
                            </span>
                          )}
                          {c.observacao && <span className="text-xs italic text-slate-600">“{c.observacao}”</span>}
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto">
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
                            <span key={f.id} className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                              sem foto
                            </span>
                          ),
                        )}
                        {podeExcluir && (
                          <span className="ml-auto shrink-0">
                            <ApagarComprovante id={c.id} />
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {filtradas.length > 300 && (
        <p className="mt-3 text-center text-xs text-slate-400">
          Mostrando os 300 mais recentes de {filtradas.length}. Estreite o período para ver os outros — a planilha traz todos.
        </p>
      )}
    </div>
  );
}

function Numero({ titulo, valor, destaque = false }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p className={`mt-1 truncate text-xl font-bold tabular-nums ${destaque ? "text-primary-dark" : "text-slate-900"}`}>{valor}</p>
    </div>
  );
}
