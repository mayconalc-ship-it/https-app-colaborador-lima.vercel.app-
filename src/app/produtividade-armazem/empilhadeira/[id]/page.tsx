import { redirect, notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { CampoHorimetroComFoto } from "@/components/produtividade-armazem/CampoHorimetroComFoto";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  formatarDataHora,
  horasAtivasDeOperacao,
  horasDeOperacao,
  horasMediasPorTrocaGas,
  operacaoEmpilhadeiraDeLinha,
  trocaGasDeLinha,
} from "@/lib/produtividade-armazem";
import { abrirOperacao, fecharOperacao, registrarTrocaGas } from "../actions";
import { AlertaGasP20 } from "@/components/produtividade-armazem/AlertaGasP20";
import { lerConfigDeGas, pedidoDeGasAberto } from "@/lib/gas-p20-server";

export const dynamic = "force-dynamic";

type Aba = "operacao" | "gas" | "historico";
const ABAS: { id: Aba; rotulo: string; emoji: string }[] = [
  { id: "operacao", rotulo: "Operação", emoji: "🕐" },
  { id: "gas", rotulo: "Troca de Gás", emoji: "🔥" },
  { id: "historico", rotulo: "Histórico", emoji: "📋" },
];

export default async function EmpilhadeiraDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("pa-empilhadeira");

  const { id } = await params;
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "operacao") as Aba;
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: maquina }, { data: abertaBanco }, { data: historicoBanco }, { data: trocasGasBanco }] = await Promise.all([
    supabase.from("pa_empilhadeiras").select("id, numero").eq("id", id).eq("revenda_id", revendaId).maybeSingle(),
    supabase
      .from("pa_empilhadeira_operacoes")
      .select(
        "id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, foto_inicial_url, inicio, horimetro_final, foto_final_url, fim, encerrado_por_nome, status",
      )
      .eq("empilhadeira_id", id)
      .eq("revenda_id", revendaId)
      .eq("status", "aberta")
      .maybeSingle(),
    supabase
      .from("pa_empilhadeira_operacoes")
      .select(
        "id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, foto_inicial_url, inicio, horimetro_final, foto_final_url, fim, encerrado_por_nome, status",
      )
      .eq("empilhadeira_id", id)
      .eq("revenda_id", revendaId)
      .eq("status", "encerrada")
      .order("fim", { ascending: false })
      .limit(10),
    supabase
      .from("pa_empilhadeira_trocas_gas")
      .select("id, empilhadeira_id, operador_id, operador_nome, horimetro, foto_url, realizada_em")
      .eq("empilhadeira_id", id)
      .eq("revenda_id", revendaId)
      .order("realizada_em", { ascending: false })
      .limit(10),
  ]);

  if (!maquina) notFound();

  const [pedidoGas, configGas] = await Promise.all([
    pedidoDeGasAberto(revendaId),
    lerConfigDeGas(revendaId),
  ]);

  const aberta = abertaBanco ? operacaoEmpilhadeiraDeLinha(abertaBanco) : null;
  const historico = (historicoBanco ?? []).map(operacaoEmpilhadeiraDeLinha);
  const trocasGas = (trocasGasBanco ?? []).map(trocaGasDeLinha);
  const ultimaTrocaGas = trocasGas[0] ?? null;

  // Última leitura conhecida da máquina -- o campo compara com ela
  // enquanto a pessoa digita, e é assim que "5485,0" digitado como
  // "54850" aparece na hora como um salto impossível.
  const ultimoHorimetro =
    [
      aberta?.horimetroInicial ?? null,
      historico[0]?.horimetroFinal ?? null,
      historico[0]?.horimetroInicial ?? null,
      ultimaTrocaGas?.horimetro ?? null,
    ].filter((v): v is number => v !== null && Number.isFinite(v)).length > 0
      ? Math.max(
          ...[
            aberta?.horimetroInicial ?? null,
            historico[0]?.horimetroFinal ?? null,
            historico[0]?.horimetroInicial ?? null,
            ultimaTrocaGas?.horimetro ?? null,
          ].filter((v): v is number => v !== null && Number.isFinite(v)),
        )
      : null;
  const mediaGas = horasMediasPorTrocaGas([...trocasGas].reverse());

  return (
    <div>
      <PageHeader
        title={`🏗️ Empilhadeira ${maquina.numero}`}
        subtitle={aberta ? `Em uso por ${aberta.operadorNome} desde ${formatarDataHora(aberta.inicio)}` : "Livre no momento."}
        fecharHref="/produtividade-armazem/empilhadeira"
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      {pedidoGas && (
        <AlertaGasP20
          pedido={pedidoGas}
          config={configGas}
          voltarPara={`/produtividade-armazem/empilhadeira/${maquina.id}?aba=gas`}
        />
      )}

      {/* Mesmo padrão de segmented control do resto do módulo -- Troca de
          Gás vira uma aba própria, separada de abrir/fechar operação, em
          vez de morar embaixo do mesmo formulário. */}
      <nav className="mb-6 grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={`?aba=${a.id}`}
            aria-current={a.id === aba ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors ${
              a.id === aba ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span className="text-base leading-none">{a.emoji}</span>
            {a.rotulo}
          </a>
        ))}
      </nav>

      {aba === "operacao" &&
        (aberta ? (
          <section className="space-y-4">
            <div className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="break-words text-sm font-bold text-amber-900">
                Operação aberta por {aberta.operadorNome}
              </p>
              <p className="mt-1 break-words text-xs text-amber-800">
                Desde {formatarDataHora(aberta.inicio)} — horímetro inicial{" "}
                {aberta.horimetroInicial} — {horasDeOperacao(aberta).toFixed(1)}h rodando.
              </p>
              {aberta.operadorId !== perfil.id && (
                <p className="mt-2 break-words text-xs font-medium text-amber-900">
                  Não foi você quem abriu. Se {aberta.operadorNome} não vai voltar, preencha o
                  horímetro final abaixo para fechar a operação antes de abrir a sua.
                </p>
              )}
            </div>

            <form
              action={fecharOperacao}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <input type="hidden" name="operacao_id" value={aberta.id} />
              <input type="hidden" name="empilhadeira_id" value={maquina.id} />

              <CampoHorimetroComFoto
                idFoto="foto-fim"
                nomeFoto="foto"
                idHorimetro="horimetro_final"
                nomeHorimetro="horimetro_final"
                labelFoto="Foto do horímetro final (obrigatória)"
                labelHorimetro="Horímetro final"
                min={aberta.horimetroInicial}
                ultimoHorimetro={ultimoHorimetro}
              />

              <BotaoEnviar
                textoEnviando="Enviando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                {aberta.operadorId === perfil.id
                  ? "Encerrar minha operação"
                  : `Fechar operação de ${aberta.operadorNome}`}
              </BotaoEnviar>
            </form>
          </section>
        ) : (
          <form
            action={abrirOperacao}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <input type="hidden" name="empilhadeira_id" value={maquina.id} />

            <CampoHorimetroComFoto
              idFoto="foto-inicio"
              nomeFoto="foto"
              idHorimetro="horimetro_inicial"
              nomeHorimetro="horimetro_inicial"
              labelFoto="Foto do horímetro inicial (obrigatória)"
              labelHorimetro="Horímetro inicial"
              min={0}
              ultimoHorimetro={ultimoHorimetro}
            />

            <p className="text-xs text-slate-500">
              A operação fica aberta até você (ou outra pessoa) registrar o horímetro
              final, no fim do expediente.
            </p>

            <BotaoEnviar
              textoEnviando="Abrindo..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              ▶️ Abrir operação
            </BotaoEnviar>
          </form>
        ))}

      {aba === "gas" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {ultimaTrocaGas && (
              <p className="mb-3 text-xs text-slate-500">
                Última troca: {ultimaTrocaGas.horimetro} h, por {ultimaTrocaGas.operadorNome} em{" "}
                {formatarDataHora(ultimaTrocaGas.realizadaEm)}.
                {mediaGas !== null && ` Média entre trocas: ${mediaGas}h por garrafa.`}
              </p>
            )}
            <form action={registrarTrocaGas} className="space-y-3">
              <input type="hidden" name="empilhadeira_id" value={maquina.id} />

              <CampoHorimetroComFoto
                idFoto="foto-gas"
                nomeFoto="foto"
                idHorimetro="horimetro-gas"
                nomeHorimetro="horimetro"
                labelFoto="Foto do horímetro (obrigatória)"
                labelHorimetro="Horímetro no momento da troca"
                min={0}
                ultimoHorimetro={ultimoHorimetro}
              />

              {/* A contagem do DEPÓSITO, não da máquina. É ela que acende
                  o alerta de reposição -- por isso é pedida em toda troca,
                  e não só quando alguém lembra. */}
              <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <legend className="px-1 text-xs font-semibold uppercase text-slate-500">
                  Botijões P20 no estoque
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label
                      htmlFor="botijoes_cheios"
                      className="mb-1 block text-xs font-semibold text-slate-600"
                    >
                      🟢 Cheios
                    </label>
                    <input
                      id="botijoes_cheios"
                      name="botijoes_cheios"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={999}
                      step={1}
                      required
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor="botijoes_vazios"
                      className="mb-1 block text-xs font-semibold text-slate-600"
                    >
                      ⚪ Vazios
                    </label>
                    <input
                      id="botijoes_vazios"
                      name="botijoes_vazios"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={999}
                      step={1}
                      required
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Conte os botijões do depósito depois de trocar. Com{" "}
                  {configGas.estoqueMinimo} cheio(s) ou menos, o app abre um pedido de gás e avisa
                  quem precisa saber.
                </p>
              </fieldset>

              <BotaoEnviar
                textoEnviando="Registrando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                🔥 Registrar troca de gás
              </BotaoEnviar>
            </form>
          </div>

          {trocasGas.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Últimas trocas</h2>
              {/* Data, nome e horímetro em UMA linha flex estouravam a
                  tela: item de flex não encolhe abaixo do conteúdo, e nome
                  completo de operador é comprido. Duas linhas, com o
                  horímetro fixo à direita. */}
              <ul className="space-y-2">
                {trocasGas.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-2 text-xs text-slate-600"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{t.operadorNome}</p>
                      <p className="text-slate-500">{formatarDataHora(t.realizadaEm)}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-700">
                      {t.horimetro} h
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {aba === "historico" &&
        (historico.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Nenhuma operação encerrada ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {historico.map((op) => (
              <li key={op.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{op.operadorNome}</p>
                    <p className="text-xs text-slate-500">
                      {formatarDataHora(op.inicio)} – {op.fim ? formatarDataHora(op.fim) : "—"} ·{" "}
                      {op.horimetroInicial} → {op.horimetroFinal} h
                      {op.encerradoPorNome && ` · fechada por ${op.encerradoPorNome}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" title="Horas ativas pelo horímetro">
                    {(horasAtivasDeOperacao(op) ?? 0).toFixed(1)}h
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FotoEvidencia src={op.fotoInicialUrl} alt="Horímetro inicial" classeCaixa="h-20 w-full" />
                  {op.fotoFinalUrl && (
                    <FotoEvidencia src={op.fotoFinalUrl} alt="Horímetro final" classeCaixa="h-20 w-full" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
