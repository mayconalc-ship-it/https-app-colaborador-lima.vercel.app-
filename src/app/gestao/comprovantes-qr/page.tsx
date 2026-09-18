import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { lerTudo } from "@/lib/ler-tudo";
import { MODULO_QR, formatarReais, normalizarBusca } from "@/lib/qr-contingencia";
import { normalizarMapa } from "@/lib/rotas";
import { COLUNAS_COMPROVANTE, comFotos, hojeNaOperacao } from "@/lib/qr-contingencia-server";
import { ApagarComprovante } from "./ApagarComprovante";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * OS COMPROVANTES DO QR DE CONTINGÊNCIA (18/09/2026).
 *
 * Para quem concilia: o dia, o mapa, o cliente, quem registrou, o valor
 * (quando informado) e as fotos. Filtro por período, mapa e uma busca
 * livre por cliente ou motorista. As fotos são links assinados que valem
 * uma hora -- o bucket é privado.
 */
export default async function ComprovantesQrPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; mapa?: string; busca?: string }>;
}) {
  await requireModulo(MODULO_QR, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;

  const hoje = hojeNaOperacao();
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const de = valida(sp.de) ?? hoje;
  const ate = valida(sp.ate) ?? hoje;
  const mapa = normalizarMapa(sp.mapa ?? "");
  const busca = (sp.busca ?? "").trim();

  const [linhas, podeExcluir] = await Promise.all([
    lerTudo<Parameters<typeof comFotos>[0][number]>((a, b) => {
      let q = createAdminClient()
        .from("qr_comprovantes")
        .select(COLUNAS_COMPROVANTE)
        .eq("revenda_id", revendaId)
        .gte("data", de)
        .lte("data", ate);
      if (mapa) q = q.eq("mapa", mapa);
      return q.order("criado_em", { ascending: false }).range(a, b);
    }),
    podeNoModulo(MODULO_QR, "excluir"),
  ]);

  const termo = normalizarBusca(busca);
  const filtradas = termo
    ? linhas.filter((l) =>
        normalizarBusca(`${l.cod_pdv} ${l.cliente_nome ?? ""} ${l.colaborador_nome}`).includes(termo),
      )
    : linhas;
  // As fotos só dos 200 primeiros: link assinado custa uma ida ao
  // armazenamento, e ninguém confere 500 comprovantes rolando a tela.
  const comprovantes = await comFotos(filtradas.slice(0, 200));

  const total = filtradas.reduce((s, l) => s + (l.valor == null ? 0 : Number(l.valor)), 0);
  const semValor = filtradas.filter((l) => l.valor == null).length;
  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <PageHeader title="🧾 Comprovantes do QR de Contingência" subtitle="O que foi pago pelo PIX da empresa, com a foto do comprovante" />

      <form className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
        <label>
          <span className={rotulo}>De</span>
          <input type="date" name="de" defaultValue={de} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Até</span>
          <input type="date" name="ate" defaultValue={ate} className={campo} />
        </label>
        <label>
          <span className={rotulo}>Mapa</span>
          <input name="mapa" defaultValue={sp.mapa ?? ""} inputMode="numeric" className={campo} />
        </label>
        <label>
          <span className={rotulo}>Cliente ou motorista</span>
          <input name="busca" defaultValue={busca} className={campo} />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button type="submit" className="w-full rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
            Filtrar
          </button>
          <Link href="/gestao/comprovantes-qr" className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600">
            Hoje
          </Link>
        </div>
      </form>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{filtradas.length}</p>
          <p className="text-xs text-slate-500">comprovante(s)</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{formatarReais(total)}</p>
          <p className="text-xs text-slate-500">valor informado</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{semValor}</p>
          <p className="text-xs text-slate-500">sem valor (conferir na foto)</p>
        </div>
      </div>

      <div className="flex justify-end">
        <ExportarCsv
          nome="comprovantes-qr"
          complemento={`${de}_a_${ate}`}
          cabecalho={["Data", "Hora", "Mapa", "Código do cliente", "Cliente", "Cidade", "Valor", "Motorista", "Fotos", "Observação"]}
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

      {comprovantes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nenhum comprovante no período{mapa ? ` para o mapa ${mapa}` : ""}.
        </p>
      ) : (
        <ul className="space-y-3">
          {comprovantes.map((c) => (
            <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{c.clienteNome ?? `Cliente ${c.codPdv}`}</p>
                  <p className="text-xs text-slate-500">
                    {dataBr(c.data)} {hora(c.pagoEm)} · código {c.codPdv}
                    {c.clienteCidade && ` · ${c.clienteCidade}`}
                    {c.mapa && ` · mapa ${c.mapa}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Registrado por {c.colaboradorNome}
                    {c.enviadoDepois && ` · feito sem internet, enviado às ${hora(c.criadoEm)}`}
                  </p>
                  {c.observacao && <p className="mt-1 text-sm text-slate-700">“{c.observacao}”</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-800">
                    {c.valor == null ? "sem valor" : formatarReais(c.valor)}
                  </span>
                  {podeExcluir && <ApagarComprovante id={c.id} />}
                </div>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {c.fotos.map((f, i) =>
                  f.url ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                      <img
                        src={f.url}
                        alt={`Comprovante, foto ${i + 1}`}
                        className="h-28 w-20 rounded-lg border border-slate-200 object-cover"
                      />
                    </a>
                  ) : (
                    <span key={f.id} className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                      foto indisponível
                    </span>
                  ),
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {filtradas.length > 200 && (
        <p className="text-center text-xs text-slate-400">
          Mostrando os 200 mais recentes de {filtradas.length}. Estreite o período para ver os outros — a planilha traz todos.
        </p>
      )}
    </div>
  );
}
