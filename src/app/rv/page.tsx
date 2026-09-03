import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getPerfil } from "@/lib/sessao";
import { requireAcessoModulo } from "@/lib/require-admin";
import { buscarRVdoColaborador } from "@/lib/rv-server";
import { chaveCompetencia, formatarCompetencia } from "@/lib/rv";
import {
  deveOcultarColuna,
  formatarCelula,
  formatarMoeda,
  rotuloExibido,
} from "@/lib/formatar";
import {
  ehColunaDoContracheque,
  montarMemoriaRV,
} from "@/lib/rv-contracheque";

export default async function RVPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireAcessoModulo("rv");
  const { mes: mesParam } = await searchParams;

  const perfil = await getPerfil();

  if (!perfil?.cpf) {
    return (
      <div>
        <PageHeader title="Minha Remuneração Variável" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Não foi possível identificar seu cadastro. Procure seu gestor.
        </div>
      </div>
    );
  }

  const { encontrados, configurado, falhas } = await buscarRVdoColaborador(
    perfil.cpf,
  );

  const competencias = Array.from(
    new Set(
      encontrados
        .map((e) => e.competencia)
        .filter((c): c is string => Boolean(c)),
    ),
  ).sort((a, b) => chaveCompetencia(b) - chaveCompetencia(a));

  const mesSelecionado =
    mesParam && competencias.includes(mesParam)
      ? mesParam
      : (competencias[0] ?? null);

  const visiveis = mesSelecionado
    ? encontrados.filter((e) => e.competencia === mesSelecionado)
    : encontrados;

  return (
    <div>
      <PageHeader
        title="Minha Remuneração Variável"
        subtitle="Valores individuais — só você vê os seus"
      />

      {!configurado ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          A planilha de RV ainda não foi conectada. Procure seu gestor.
        </div>
      ) : encontrados.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <p className="text-2xl">ℹ️</p>
          <p className="mt-2 font-semibold text-amber-900">
            Você não possui RV cadastrada
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Seu CPF não foi encontrado nas planilhas de remuneração variável.
            Se você acredita que deveria receber, verifique com o seu gestor.
          </p>
        </div>
      ) : (
        <>
          {competencias.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {competencias.map((c) => (
                <Link
                  key={c}
                  href={`/rv?mes=${encodeURIComponent(c)}`}
                  className={`rounded-full px-3 py-2 text-sm font-medium ${
                    c === mesSelecionado
                      ? "bg-primary text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {formatarCompetencia(c)}
                </Link>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {visiveis.map((item, i) => {
              const memoria = montarMemoriaRV(item.detalhes);

              // Colunas de controle interno e as que já aparecem em destaque
              // acima não precisam repetir no detalhamento.
              const detalhes = item.detalhes.filter(
                (d) =>
                  d.valor.trim() !== "" &&
                  !deveOcultarColuna(d.rotulo) &&
                  !(memoria && ehColunaDoContracheque(d.rotulo)),
              );

              return (
                <div
                  key={`${item.area}-${item.competencia}-${i}`}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {item.rotulo}
                    </span>
                    {item.competencia && (
                      <span className="text-xs text-slate-400">
                        Competência {formatarCompetencia(item.competencia)}
                      </span>
                    )}
                  </div>

                  <div className="p-6 text-center">
                    {item.nome && (
                      <p className="text-lg font-bold text-slate-900">
                        {item.nome}
                      </p>
                    )}
                    {memoria ? (
                      <>
                        <p className="mt-3 text-sm text-slate-500">
                          Total a receber
                        </p>
                        <p className="mt-1 text-4xl font-bold text-primary">
                          {formatarMoeda(memoria.total)}
                        </p>
                      </>
                    ) : (
                      item.valor && (
                        <>
                          <p className="mt-3 text-sm text-slate-500">
                            Total a receber
                          </p>
                          <p className="mt-1 text-4xl font-bold text-primary">
                            {formatarCelula("Total R$", item.valor)}
                          </p>
                        </>
                      )
                    )}
                  </div>

                  {memoria && (
                    <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="mb-1 text-sm font-semibold text-slate-700">
                        Como chegamos nesse valor
                      </p>
                      <p className="mb-3 text-xs text-slate-500">
                        Cada linha soma na linha de baixo.
                      </p>

                      <div className="space-y-3">
                        {memoria.passos.map((passo) => (
                          <div
                            key={passo.rotulo}
                            className={
                              passo.doContracheque
                                ? "rounded-lg border border-primary/30 bg-white p-3"
                                : ""
                            }
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <span
                                className={`text-sm ${
                                  passo.doContracheque
                                    ? "font-semibold text-primary-dark"
                                    : "font-medium text-slate-700"
                                }`}
                              >
                                {passo.rotulo}
                              </span>
                              <span className="shrink-0 text-base font-bold text-slate-900">
                                {formatarMoeda(passo.valor)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {passo.detalhe}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-baseline justify-between gap-3 border-t-2 border-slate-300 pt-3">
                        <span className="text-sm font-bold text-slate-800">
                          Total a receber
                        </span>
                        <span className="shrink-0 text-xl font-bold text-primary">
                          {formatarMoeda(memoria.total)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Produtividade + Prêmio. São essas 2 linhas que aparecem
                        no seu contracheque.
                      </p>
                    </div>
                  )}

                  {detalhes.length > 0 && (
                    <details className="border-t border-slate-100">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">
                        Ver como esse valor foi calculado
                      </summary>
                      <div className="divide-y divide-slate-100 border-t border-slate-100">
                        {detalhes.map((d) => (
                          <div
                            key={d.rotulo}
                            className="flex items-start justify-between gap-3 px-4 py-2 text-sm"
                          >
                            <span className="text-slate-500">
                              {rotuloExibido(d.rotulo)}
                            </span>
                            <span className="shrink-0 text-right font-medium text-slate-800">
                              {formatarCelula(d.rotulo, d.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {falhas.length > 0 && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          Não foi possível consultar: {falhas.map((f) => f.rotulo).join(", ")}.
          Avise o gestor.
        </p>
      )}

      {encontrados.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary-soft p-4">
          <p className="text-sm font-semibold text-primary-dark">
            ⚠️ Valor sujeito a alteração
          </p>
          <p className="mt-1 text-sm text-primary-dark">
            Este valor pode sofrer alteração conforme o atingimento dos
            indicadores e do ABS (absenteísmo). Em caso de dúvidas, entre em
            contato com o seu gestor imediato.
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Os valores vêm da planilha oficial de RV e são atualizados
        automaticamente sempre que ela é alterada.
      </p>
    </div>
  );
}
