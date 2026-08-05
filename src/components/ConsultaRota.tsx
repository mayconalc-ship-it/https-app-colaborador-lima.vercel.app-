"use client";

import { useState } from "react";
import {
  aferir,
  formatarCaixas,
  formatarDataBr,
  formatarKm,
  formatarPercentual,
  formatarPeso,
  formatarTempo,
  type Metas,
} from "@/lib/rotas";
import { consultarRota, type RotaEncontrada } from "@/app/minha-rota/actions";
import { gerarImagemPreRota } from "@/lib/imagem-rota";

/** Um número da faixa de indicadores. */
function Indicador({
  emoji,
  valor,
  rotulo,
  selo,
}: {
  emoji: string;
  valor: string;
  rotulo: string;
  selo?: string;
}) {
  return (
    <div className="relative flex-1 px-1 py-3 text-center">
      {selo && (
        <span className="absolute right-1.5 top-1.5 text-sm leading-none">
          {selo}
        </span>
      )}
      <p className="text-sm leading-none">{emoji}</p>
      <p className="mt-1.5 text-2xl font-bold leading-none tabular-nums text-slate-900">
        {valor}
      </p>
      <p className="mt-1 text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}

/** Barra de ocupação com a meta marcada. */
function BarraOcupacao({
  emoji,
  rotulo,
  valor,
  meta,
  complemento,
}: {
  emoji: string;
  rotulo: string;
  valor: number | null;
  meta: number;
  complemento?: string;
}) {
  const largura = Math.min(100, Math.max(0, valor ?? 0));
  const posicaoMeta = Math.min(100, Math.max(0, meta));
  const af = aferir(valor, meta);

  return (
    <div className="px-4 py-3">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">
            {emoji} {rotulo}
          </p>
          {complemento && (
            <p className="text-xs text-slate-400">{complemento}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-bold leading-none tabular-nums text-slate-900">
            {formatarPercentual(valor)}
          </p>
          <p className={`mt-0.5 text-xs font-semibold ${af.cor}`}>
            {af.icone} {af.rotulo}
          </p>
        </div>
      </div>

      <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${af.barra}`}
          style={{ width: `${largura}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-700/70"
          style={{ left: `${posicaoMeta}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-1 text-right text-[11px] text-slate-400">
        meta {meta}%
      </p>
    </div>
  );
}

/**
 * Uma região da rota, recolhida por padrão.
 *
 * Expandir mostra o detalhe por bairro -- só existe quando a planilha traz
 * a coluna de região; sem ela, o toque não faz nada visível e por isso a
 * seta some.
 */
function LinhaRegiao({
  cidade,
  entregas,
  bairros,
  maior,
}: {
  cidade: string;
  entregas: number;
  bairros?: { nome: string; entregas: number }[];
  maior: number;
}) {
  const [aberta, setAberta] = useState(false);
  const temDetalhe = Boolean(bairros && bairros.length > 0);

  return (
    <li className="overflow-hidden rounded-lg bg-white">
      <button
        type="button"
        disabled={!temDetalhe}
        onClick={() => setAberta((v) => !v)}
        aria-expanded={temDetalhe ? aberta : undefined}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {temDetalhe && (
            <span
              className={`shrink-0 text-xs text-slate-400 transition-transform ${aberta ? "rotate-90" : ""}`}
              aria-hidden="true"
            >
              ▸
            </span>
          )}
          <span className="min-w-0 truncate text-base font-medium text-slate-800">
            {cidade}
          </span>
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums text-primary">
          {entregas}
        </span>
      </button>

      <div
        className="h-1 bg-primary/60"
        style={{ width: `${(entregas / maior) * 100}%` }}
        aria-hidden="true"
      />

      {temDetalhe && aberta && (
        <ul className="divide-y divide-slate-50 border-t border-slate-100 bg-slate-50/60">
          {bairros!.map((b, i) => (
            <li
              key={`${b.nome}-${i}`}
              className="flex items-center justify-between gap-3 px-4 py-1.5"
            >
              <span className="min-w-0 truncate text-sm text-slate-600">
                {b.nome}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                {b.entregas}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ConsultaRota({ metas }: { metas: Metas }) {
  const [mapa, setMapa] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rota, setRota] = useState<RotaEncontrada | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [avisoCompartilhar, setAvisoCompartilhar] = useState<string | null>(
    null,
  );

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setRota(null);
    setBuscando(true);

    const r = await consultarRota(mapa);
    setBuscando(false);

    if (r.ok) setRota(r.rota);
    else setErro(r.erro);
  }

  async function compartilhar() {
    if (!rota) return;
    setAvisoCompartilhar(null);
    setCompartilhando(true);

    try {
      const blob = await gerarImagemPreRota(rota, metas);
      if (!blob) {
        setAvisoCompartilhar("Não consegui gerar a imagem. Tente de novo.");
        return;
      }

      const arquivo = new File([blob], `pre-rota-mapa-${rota.mapa}.png`, {
        type: "image/png",
      });

      // Compartilhamento nativo primeiro -- é o caminho direto para o
      // WhatsApp, sem o motorista precisar salvar e depois anexar.
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare?.({ files: [arquivo] })
      ) {
        await navigator.share({
          files: [arquivo],
          title: `Pré-rota · Mapa ${rota.mapa}`,
        });
        return;
      }

      // Sem suporte (a maioria dos navegadores de desktop): baixa a imagem.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pre-rota-mapa-${rota.mapa}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setAvisoCompartilhar(
        "Imagem baixada. Agora é só anexar no WhatsApp ou onde precisar.",
      );
    } catch (e) {
      // O usuário cancelar o compartilhamento também cai aqui -- não é erro.
      if ((e as Error).name !== "AbortError") {
        setAvisoCompartilhar("Não consegui compartilhar. Tente de novo.");
      }
    } finally {
      setCompartilhando(false);
    }
  }

  /* ---------- Rota encontrada ---------- */
  if (rota) {
    const totalCidades = rota.cidades.reduce((s, c) => s + c.entregas, 0);
    const maior = Math.max(1, ...rota.cidades.map((c) => c.entregas));
    const caixasNaMeta = aferir(rota.caixas, metas.caixas);

    // A soma das cidades deveria bater com o total de entregas do resumo.
    // Se a fonte divergir, é melhor avisar do que fingir que está tudo ok.
    const divergeDoResumo =
      rota.entregas !== null &&
      rota.cidades.length > 0 &&
      totalCidades !== rota.entregas;

    return (
      <div>
        {/* O formulário vira uma barrinha: a rota é o que interessa agora. */}
        <button
          type="button"
          onClick={() => {
            setRota(null);
            setMapa("");
            setAvisoCompartilhar(null);
          }}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
        >
          <span className="text-sm text-slate-600">
            📅 {formatarDataBr(rota.data)} · 🗺️ Mapa{" "}
            <strong className="tabular-nums text-slate-900">{rota.mapa}</strong>
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary">
            Trocar
          </span>
        </button>

        <div className="overflow-hidden rounded-2xl border-2 border-primary bg-white shadow-lg">
          <div className="flex items-center justify-between gap-2 bg-primary px-4 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
              🚚 Pré-rota
            </span>
            {rota.classificacao && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white">
                {rota.classificacao}
              </span>
            )}
          </div>

          {/* Veículo e motorista */}
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                Veículo
              </p>
              <p className="text-lg font-bold leading-tight text-slate-900">
                {rota.veiculo ?? "—"}
              </p>
              {rota.placa && (
                <p className="text-base font-semibold tabular-nums text-primary">
                  {rota.placa}
                </p>
              )}
            </div>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                Motorista
              </p>
              <p className="truncate text-lg font-bold leading-tight text-slate-900">
                {rota.motorista}
              </p>
              {rota.armazem && (
                <p className="text-xs text-slate-400">Armazém {rota.armazem}</p>
              )}
            </div>
          </div>

          {/* Indicadores */}
          <div className="flex divide-x divide-slate-100 border-y border-slate-100 bg-slate-50/60">
            <Indicador
              emoji="📏"
              valor={formatarKm(rota.kmPrev).replace(" km", "")}
              rotulo="km"
            />
            <Indicador
              emoji="⏱️"
              valor={formatarTempo(rota.tempoPrev)}
              rotulo="c/ almoço"
            />
            <Indicador
              emoji="📍"
              valor={rota.entregas?.toString() ?? "—"}
              rotulo="entregas"
            />
            <Indicador
              emoji="📦"
              valor={formatarCaixas(rota.caixas)}
              rotulo="caixas"
              selo={metas.caixas ? caixasNaMeta.icone : undefined}
            />
          </div>

          {/* Meta de caixas por viagem */}
          {metas.caixas && rota.caixas !== null && (
            <div
              className={`flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 ${caixasNaMeta.fundo}`}
            >
              <span className="text-sm font-medium text-slate-700">
                📦 Caixas por viagem
              </span>
              <span className={`text-sm font-bold ${caixasNaMeta.cor}`}>
                {caixasNaMeta.icone} {caixasNaMeta.rotulo} · meta{" "}
                {formatarCaixas(metas.caixas)}
              </span>
            </div>
          )}

          {/* Ocupação */}
          <div className="divide-y divide-slate-100">
            <BarraOcupacao
              emoji="📦"
              rotulo="Ocupação de caixas"
              valor={rota.ocupacaoCaixas}
              meta={metas.ocupacao}
            />
            <BarraOcupacao
              emoji="⚖️"
              rotulo="Ocupação de peso"
              complemento={formatarPeso(rota.peso)}
              valor={rota.ocupacaoPeso}
              meta={metas.ocupacao}
            />
          </div>

          {/* Região + entregas, recolhida por padrão */}
          {rota.cidades.length > 0 && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  🏙️ Região + entregas
                </span>
                <span className="text-xs text-slate-400">
                  toque para detalhar
                </span>
              </div>
              <ul className="space-y-1.5">
                {rota.cidades.map((c) => (
                  <LinhaRegiao
                    key={c.cidade}
                    cidade={c.cidade}
                    entregas={c.entregas}
                    bairros={c.bairros}
                    maior={maior}
                  />
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-primary-soft px-3 py-2">
                <span className="text-sm font-bold text-primary-dark">
                  Total
                </span>
                <span className="text-sm font-bold tabular-nums text-primary-dark">
                  {totalCidades} entregas
                </span>
              </div>
              {divergeDoResumo && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ A soma das regiões ({totalCidades}) não bate com o total
                  de entregas do resumo ({rota.entregas}). Confira com a
                  liderança antes de sair.
                </p>
              )}
            </div>
          )}

          {/* Compartilhar */}
          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={compartilhar}
              disabled={compartilhando}
              className="w-full rounded-xl border-2 border-primary py-3 font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {compartilhando ? "Gerando imagem..." : "📤 Compartilhar Pré-rota"}
            </button>
            {avisoCompartilhar && (
              <p className="mt-2 text-center text-xs text-slate-500">
                {avisoCompartilhar}
              </p>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-xs text-slate-400">
          Divergência? Procure a liderança antes de sair.
        </p>
      </div>
    );
  }

  /* ---------- Formulário ---------- */
  return (
    <div>
      <form
        onSubmit={buscar}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <p className="mb-3 text-sm text-slate-600">
          Consulte as informações do seu mapa antes de sair.
        </p>

        <label
          htmlFor="mapa-rota"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          🔢 Número do mapa
        </label>
        <input
          id="mapa-rota"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={mapa}
          onChange={(e) => setMapa(e.target.value.replace(/\D/g, ""))}
          placeholder="Digite o número do mapa"
          className="w-full rounded-xl border border-slate-200 p-3 text-base tabular-nums focus:border-primary focus:outline-none"
        />

        <button
          type="submit"
          disabled={buscando || !mapa}
          className="mt-3 w-full rounded-xl bg-primary py-4 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buscando ? "Consultando..." : "Consultar rota"}
        </button>

        <p className="mt-2 text-center text-xs text-slate-400">
          Pode digitar com ou sem os zeros da frente.
        </p>
      </form>

      {erro && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-2xl">🔍</p>
          <p className="mt-2 font-semibold text-amber-900">{erro}</p>
          <p className="mt-1 text-sm text-amber-800">
            Verifique o número informado ou procure a liderança.
          </p>
        </div>
      )}
    </div>
  );
}
