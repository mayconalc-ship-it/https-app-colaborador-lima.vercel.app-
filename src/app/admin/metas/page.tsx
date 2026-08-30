import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import {
  CATALOGO_DE_METAS,
  GRUPOS_DE_METAS,
  ROTULO_GRUPO,
  metasDoGrupo,
  type DefinicaoDeMeta,
  type GrupoDeMetas as IdDeGrupo,
} from "@/lib/metas";
import {
  AMOSTRA_MINIMA,
  DIAS_DE_HISTORICO,
  confiavel,
  historicoDasMetas,
  historicoPorItem,
  type Realizado,
} from "@/lib/metas-historico";
import { GrupoDeMetas } from "./GrupoDeMetas";
import { salvarMetas, salvarMetasPorItem } from "./actions";

/** Número no formato da meta, para virar valor de campo. */
function paraTexto(v: number, casas: number): string {
  return String(Number(v.toFixed(casas)));
}

/**
 * O rodapé de cada campo: o que a operação já faz, com a amostra.
 *
 * A amostra é o que separa "21,1 cx/h em 34 lançamentos" de "411 L/h em
 * um lançamento de dois minutos". Sem ela, o segundo vira meta.
 */
function Historico({
  realizado,
  casas,
  sufixo,
  sugerido,
}: {
  realizado: Realizado | undefined;
  casas: number;
  sufixo: string;
  sugerido: boolean;
}) {
  if (!realizado) {
    return (
      <p className="mt-1.5 text-[11px] text-slate-400">
        Sem apontamento nos últimos {DIAS_DE_HISTORICO} dias.
      </p>
    );
  }

  const pouco = !confiavel(realizado);
  return (
    <p className={`mt-1.5 text-[11px] ${pouco ? "text-amber-600" : "text-slate-500"}`}>
      {pouco ? "⚠️ " : "📊 "}
      Realizado:{" "}
      <strong className="tabular-nums">
        {realizado.valor.toLocaleString("pt-BR", {
          minimumFractionDigits: casas,
          maximumFractionDigits: casas,
        })}
        {sufixo ? ` ${sufixo}` : ""}
      </strong>{" "}
      em {realizado.amostra} {realizado.unidadeDaAmostra}
      {pouco && " — amostra pequena, use com cuidado"}
      {sugerido && !pouco && " · já preenchido para você"}
    </p>
  );
}

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

/** Só os campos que a tela precisa devolver depois de salvar. `sucesso` e
 *  `erro` ficam de fora: são do salvamento que acabou, não do estado. */
function estadoDaTela(sp: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const chave of ["abertos", "buscaProduto", "buscaEmbalagem"]) {
    const v = sp[chave];
    if (v) p.set(chave, v);
  }
  return p.toString();
}

export default async function AdminMetasPage({
  searchParams,
}: {
  searchParams: Promise<{
    abertos?: string;
    buscaProduto?: string;
    buscaEmbalagem?: string;
    sucesso?: string;
    erro?: string;
  }>;
}) {
  await requireModulo("metas", "ver");

  const sp = await searchParams;
  const abertos = (sp.abertos ?? "").split(",").filter(Boolean);
  const buscaProduto = (sp.buscaProduto ?? "").trim();
  const buscaEmbalagem = (sp.buscaEmbalagem ?? "").trim();
  const estado = estadoDaTela(sp);

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return <PageHeader title="🎯 Metas" subtitle="Você não está em nenhuma revenda." />;
  }

  const admin = createAdminClient();
  const [
    { data: metasBanco },
    { data: recebimento },
    { data: devolucao },
    { data: produtos },
    { data: embalagens },
    historico,
    porItem,
  ] = await Promise.all([
      admin.from("pa_metas").select("chave, valor").eq("revenda_id", revendaId),
      admin.from("pa_recebimento_config").select("tma_alvo_minutos").eq("revenda_id", revendaId).maybeSingle(),
      admin.from("devolucao_config").select("meta_pct").eq("revenda_id", revendaId).maybeSingle(),
      admin
        .from("pa_produtos")
        .select("id, codigo, descricao, meta_reepack_hora, ativo")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .order("descricao"),
      admin
        .from("pa_embalagens_despejo")
        .select("id, nome, meta_litros_hora")
        .eq("revenda_id", revendaId)
        .order("nome"),
      historicoDasMetas(revendaId),
      historicoPorItem(revendaId),
    ]);

  const porChave = new Map(
    ((metasBanco ?? []) as { chave: string; valor: number }[]).map((m) => [m.chave, Number(m.valor)]),
  );

  /** O valor atual de uma meta, venha ela de onde vier. */
  const valorDe = (def: DefinicaoDeMeta): number | null => {
    if (def.fonte === "pa_metas") return porChave.get(def.chave) ?? null;
    if (def.fonte === "recebimento_config") {
      const v = recebimento?.[def.coluna as keyof typeof recebimento];
      return v === null || v === undefined ? null : Number(v);
    }
    const v = devolucao?.[def.coluna as keyof typeof devolucao];
    return v === null || v === undefined ? null : Number(v);
  };

  /**
   * O que aparece no campo.
   *
   * Meta cadastrada manda sempre. Sem meta, entra o REALIZADO como
   * sugestão -- mas só quando a amostra sustenta: preencher o campo com
   * um número tirado de um lançamento de dois minutos seria pior que
   * deixar vazio, porque o vazio pelo menos não é salvo por engano.
   */
  const paraCampo = (v: number | null, casas: number, sugestao?: Realizado) => {
    if (v !== null) return casas === 0 ? String(v) : paraTexto(v, casas);
    if (sugestao && confiavel(sugestao)) {
      const arredondado = Number(sugestao.valor.toFixed(casas));
      // Sugestão que arredonda para ZERO não preenche. Meta zero não é um
      // ponto de partida: em "maior é melhor" ela é batida por qualquer
      // coisa, e em "menor é melhor" ela é impossível. Aconteceu com o 5S
      // (0,33 execução por pessoa/mês vira "0") e com a devolução.
      if (arredondado > 0) return String(arredondado);
    }
    return "";
  };

  // Listas por item, já filtradas pela busca.
  const produtosFiltrados = (produtos ?? []).filter((p) =>
    buscaProduto
      ? `${p.codigo ?? ""} ${p.descricao ?? ""}`.toLowerCase().includes(buscaProduto.toLowerCase())
      : true,
  );
  const embalagensFiltradas = (embalagens ?? []).filter((e) =>
    buscaEmbalagem ? (e.nome ?? "").toLowerCase().includes(buscaEmbalagem.toLowerCase()) : true,
  );

  const totalCadastradas = CATALOGO_DE_METAS.filter((d) => valorDe(d) !== null).length;
  const produtosComMeta = (produtos ?? []).filter((p) => p.meta_reepack_hora !== null).length;
  const embalagensComMeta = (embalagens ?? []).filter((e) => e.meta_litros_hora !== null).length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="🎯 Metas"
        subtitle="A régua de cada indicador. Onde há meta, o cartão se pinta sozinho: verde batendo, vermelho não."
      />

      {sp.erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">✅ {sp.sucesso}</p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Metas gerais</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {totalCadastradas}
              <span className="text-base font-semibold text-slate-400"> de {CATALOGO_DE_METAS.length}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Produtos com meta</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {produtosComMeta}
              <span className="text-base font-semibold text-slate-400"> de {(produtos ?? []).length}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-500">Embalagens com meta</p>
            <p className="text-2xl font-extrabold text-slate-900">
              {embalagensComMeta}
              <span className="text-base font-semibold text-slate-400"> de {(embalagens ?? []).length}</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Onde não há meta cadastrada, o campo já vem com o{" "}
          <strong>realizado dos últimos {DIAS_DE_HISTORICO} dias</strong> como ponto de partida —
          destacado em azul, e só quando a amostra tem pelo menos {AMOSTRA_MINIMA} apontamentos.{" "}
          <strong>É sugestão: só vira meta quando você clicar em Salvar.</strong> Ajuste antes, se
          a régua for outra.
        </p>
        <p className="mt-1.5 text-xs text-slate-500">
          Deixar um campo <strong>em branco apaga a meta</strong> — o cartão volta a ficar neutro,
          sem cor. É diferente de cadastrar zero, que passa a cobrar zero.
        </p>
      </div>

      {GRUPOS_DE_METAS.map((grupo) => {
        const def = ROTULO_GRUPO[grupo];
        const metas = metasDoGrupo(grupo);
        const temListaDeItens = grupo === "bancada" || grupo === "despejo";
        const cadastradas = metas.filter((m) => valorDe(m) !== null).length;

        const resumo =
          grupo === "despejo"
            ? `${embalagensComMeta}/${(embalagens ?? []).length} embalagens`
            : grupo === "bancada"
              ? `${cadastradas}/${metas.length} + ${produtosComMeta}/${(produtos ?? []).length} produtos`
              : `${cadastradas}/${metas.length}`;

        return (
          <GrupoDeMetas
            key={grupo}
            id={grupo}
            emoji={def.emoji}
            titulo={def.titulo}
            ajuda={def.ajuda}
            resumo={resumo}
            aberto={abertos.includes(grupo)}
          >
            <div className="space-y-5">
              {metas.length > 0 && (
                <form action={salvarMetas} className="space-y-3">
                  <input type="hidden" name="grupo" value={grupo} />
                  <input type="hidden" name="estado" value={estado} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    {metas.map((m) => {
                      const atual = valorDe(m);
                      const realizado = historico.get(m.chave);
                      const valor = paraCampo(atual, m.casas, realizado);
                      return (
                        <CampoDeMeta
                          key={m.chave}
                          def={m}
                          valor={valor}
                          realizado={realizado}
                          // Sugerido = veio do histórico, não do cadastro.
                          // Derivado do valor final para não destacar em
                          // azul um campo que acabou ficando vazio.
                          sugerido={atual === null && valor !== ""}
                        />
                      );
                    })}
                  </div>

                  <BotaoEnviar
                    textoEnviando="Salvando..."
                    className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark sm:w-auto"
                  >
                    Salvar {def.titulo.toLowerCase()}
                  </BotaoEnviar>
                </form>
              )}

              {grupo === "bancada" && (
                <ListaDeItens
                  tipo="reepack"
                  titulo="Repack: meta de caixas por hora, por produto"
                  ajuda="Cada produto embala num ritmo diferente — por isso a meta é por produto, não uma só para a bancada."
                  campoBusca="buscaProduto"
                  busca={buscaProduto}
                  estado={estado}
                  sufixo="cx/h"
                  passo="0.1"
                  casas={1}
                  itens={produtosFiltrados.map((p) => {
                    const r = porItem.repack.get(p.id);
                    const atual = p.meta_reepack_hora === null ? null : Number(p.meta_reepack_hora);
                    const valor = paraCampo(atual, 1, r);
                    return {
                      id: p.id,
                      rotulo: p.descricao ?? p.codigo ?? "(sem descrição)",
                      detalhe: p.codigo ?? undefined,
                      valor,
                      realizado: r,
                      sugerido: atual === null && valor !== "",
                    };
                  })}
                  total={(produtos ?? []).length}
                  comHistorico={porItem.repack.size}
                />
              )}

              {grupo === "despejo" && (
                <ListaDeItens
                  tipo="despejo"
                  titulo="Despejo: meta de litros por hora, por embalagem"
                  ajuda="Garrafa de 300ml e de 1L não despejam no mesmo ritmo."
                  campoBusca="buscaEmbalagem"
                  busca={buscaEmbalagem}
                  estado={estado}
                  sufixo="L/h"
                  passo="0.1"
                  casas={1}
                  itens={embalagensFiltradas.map((e) => {
                    const r = porItem.despejo.get(e.id);
                    const atual = e.meta_litros_hora === null ? null : Number(e.meta_litros_hora);
                    const valor = paraCampo(atual, 1, r);
                    return {
                      id: e.id,
                      rotulo: e.nome ?? "(sem nome)",
                      valor,
                      realizado: r,
                      sugerido: atual === null && valor !== "",
                    };
                  })}
                  total={(embalagens ?? []).length}
                  comHistorico={porItem.despejo.size}
                />
              )}

              {metas.length === 0 && !temListaDeItens && (
                <p className="text-sm text-slate-400">Nada para cadastrar aqui ainda.</p>
              )}
            </div>
          </GrupoDeMetas>
        );
      })}

      <Link href="/admin" className="block pt-2 text-center text-sm font-semibold text-primary hover:underline">
        ← Voltar ao painel
      </Link>
    </div>
  );
}

// ==================== PEÇAS ====================

function CampoDeMeta({
  def,
  valor,
  realizado,
  sugerido,
}: {
  def: DefinicaoDeMeta;
  valor: string;
  realizado: Realizado | undefined;
  sugerido: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-3 ${
        sugerido ? "border-primary/40 bg-primary-soft/40" : "border-slate-200 bg-slate-50"
      }`}
    >
      <label
        className="block text-sm font-semibold text-slate-800"
        htmlFor={`meta_${def.chave}`}
      >
        {def.rotulo}
      </label>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{def.ajuda}</p>

      <div className="mt-2 flex items-center gap-2">
        <input
          id={`meta_${def.chave}`}
          name={`meta_${def.chave}`}
          type="number"
          inputMode="decimal"
          min={0}
          step={def.passo}
          defaultValue={valor}
          placeholder="sem meta"
          className={`${campo} flex-1`}
        />
        {def.sufixo && (
          <span className="shrink-0 text-sm font-semibold text-slate-500">{def.sufixo}</span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[11px] text-slate-400">
          {def.tipo === "referencia"
            ? "referência, não é meta"
            : def.sentido === "menor_melhor"
              ? "↓ menor é melhor"
              : "↑ maior é melhor"}
        </span>
      </div>
      <Historico realizado={realizado} casas={def.casas} sufixo={def.sufixo} sugerido={sugerido} />
    </div>
  );
}

function ListaDeItens({
  tipo,
  titulo,
  ajuda,
  campoBusca,
  busca,
  estado,
  sufixo,
  passo,
  casas,
  itens,
  total,
  comHistorico,
}: {
  tipo: "reepack" | "despejo";
  titulo: string;
  ajuda: string;
  campoBusca: string;
  busca: string;
  estado: string;
  sufixo: string;
  passo: string;
  casas: number;
  itens: {
    id: string;
    rotulo: string;
    detalhe?: string;
    valor: string;
    realizado?: Realizado;
    sugerido: boolean;
  }[];
  total: number;
  /** Quantos itens do cadastro TÊM apontamento. É o número que interessa
   *  para cadastrar: os outros nunca passaram pela bancada. */
  comHistorico: number;
}) {
  // A busca é um GET e precisa devolver o estado da tela, senão filtrar
  // fecharia o grupo que a pessoa acabou de abrir.
  const doEstado = new URLSearchParams(estado);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{ajuda}</p>

      {/* O número que decide o trabalho: dos itens cadastrados, só uma
          parte passou pela bancada nos últimos 90 dias. Cadastrar meta
          para os outros é adivinhar. */}
      <p className="mt-2 rounded-lg bg-primary-soft/50 p-2 text-[11px] text-slate-600">
        📊 <strong>{comHistorico}</strong> de {total} têm apontamento nos últimos{" "}
        {DIAS_DE_HISTORICO} dias — esses vêm com o realizado preenchido. Os demais nunca passaram
        pela bancada no período, e ficam em branco de propósito.
      </p>

      <form method="get" className="mt-3 flex gap-2">
        {[...doEstado.entries()]
          .filter(([k]) => k !== campoBusca)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input
          name={campoBusca}
          defaultValue={busca}
          placeholder="Filtrar pelo nome"
          className={`${campo} flex-1`}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
        >
          Filtrar
        </button>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        {busca && `Mostrando ${itens.length} de ${total}. `}
        Salvar grava <strong>tudo o que está na tela</strong>, incluindo os campos já preenchidos
        com o realizado. O que o filtro escondeu fica como estava.
      </p>

      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nada encontrado com esse filtro.</p>
      ) : (
        <form action={salvarMetasPorItem} className="mt-3 space-y-2">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="estado" value={estado} />

          <ul className="divide-y divide-slate-100">
            {itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{i.rotulo}</span>
                  {i.realizado ? (
                    <span
                      className={`block truncate text-[11px] ${
                        confiavel(i.realizado) ? "text-slate-500" : "text-amber-600"
                      }`}
                    >
                      {confiavel(i.realizado) ? "📊" : "⚠️"} realizado{" "}
                      <strong className="tabular-nums">
                        {i.realizado.valor.toLocaleString("pt-BR", {
                          minimumFractionDigits: casas,
                          maximumFractionDigits: casas,
                        })}{" "}
                        {sufixo}
                      </strong>{" "}
                      · {i.realizado.amostra} lanç.
                      {!confiavel(i.realizado) && ` (menos de ${AMOSTRA_MINIMA})`}
                    </span>
                  ) : i.detalhe ? (
                    <span className="block truncate text-[11px] text-slate-400">{i.detalhe}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <input
                    name={`item_${i.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={passo}
                    defaultValue={i.valor}
                    placeholder="—"
                    aria-label={`Meta de ${i.rotulo}`}
                    className={`w-24 rounded-lg border bg-white px-2 py-1.5 text-right text-sm text-slate-900 focus:border-primary focus:outline-none ${
                      i.sugerido ? "border-primary/50 bg-primary-soft/30" : "border-slate-300"
                    }`}
                  />
                  <span className="w-9 text-[11px] font-semibold text-slate-400">{sufixo}</span>
                </span>
              </li>
            ))}
          </ul>

          <BotaoEnviar
            textoEnviando="Salvando..."
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark sm:w-auto"
          >
            Salvar {itens.length} meta(s)
          </BotaoEnviar>
        </form>
      )}
    </div>
  );
}
