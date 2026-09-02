import { PageHeader } from "@/components/PageHeader";
import { FonteConfigurada } from "@/components/admin/FonteConfigurada";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { formatarReais } from "@/lib/refugo";
import { importarRefugo, salvarValorDoItem } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Item = { codigo: string; descricao: string; valor_unitario: number | null };

export default async function AdminRefugoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("refugo", "ver");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  const admin = createAdminClient();

  const [{ data: cfg }, { data: itensBanco }, { count: afericoes }, { data: ratingCfg }] = await Promise.all([
    admin.from("refugo_config").select("pasta_link, ultima_sincronizacao, ultimo_resultado").eq("revenda_id", revendaId).maybeSingle(),
    admin.from("refugo_itens").select("codigo, descricao, valor_unitario").eq("revenda_id", revendaId).order("descricao"),
    admin.from("refugo_afericoes").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
    admin.from("rating_config").select("pasta_link").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  const itens = (itensBanco ?? []) as Item[];
  const semValor = itens.filter((i) => i.valor_unitario === null).length;

  return (
    <div>
      <PageHeader
        title="Refugo de Vasilhame"
        subtitle="Importa a aferição de garrafas e calcula quanto o refugo custou."
        fecharHref="/admin"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
          ℹ️ Como o app descobre quem estava no mapa
        </summary>
        <div className="space-y-2 border-t border-slate-100 p-3 text-xs text-slate-600">
          <p>
            <strong>Motorista:</strong> vem no próprio relatório. Conferido nos 8 meses de 2026, bate com o
            03.11.29 em 434 de 434 linhas.
          </p>
          <p>
            <strong>Ajudante:</strong> sai do cruzamento pelo número do mapa, porque o campo de ajudante do
            relatório de refugo vem “Não cadastrado” em quase todas as linhas.
          </p>
          <p>
            <strong>Conferente:</strong> o relatório só traz o nome, então o app casa por nome com os perfis.
          </p>
          <p className="text-amber-700">
            Depende do <strong>Rating já ter sido importado</strong>: é de lá que vêm o cadastro de pessoas e a
            tabela de mapas.
          </p>
        </div>
      </details>

      {/* Configuração da pasta saiu daqui, para Admin > Fontes de Dados.
          Sem link não é erro no Refugo: significa usar a mesma pasta do
          Rating, que é o normal quando os relatórios chegam juntos. */}
      <FonteConfigurada
        rotulo="Refugo"
        link={cfg?.pasta_link ?? null}
        ultima={cfg?.ultima_sincronizacao ?? null}
        observacaoQuandoVazio={
          ratingCfg?.pasta_link
            ? "Sem pasta própria — usando a mesma pasta do Rating, que é o normal."
            : "Sem pasta própria e sem pasta do Rating. A importação não tem de onde ler."
        }
      />

      <form action={importarRefugo} className="mb-5">
        <BotaoEnviar
          textoEnviando="Importando..."
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ♻️ Importar aferições
        </BotaoEnviar>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Cartao titulo="Aferições" valor={(afericoes ?? 0).toLocaleString("pt-BR")} />
        <Cartao titulo="Itens cadastrados" valor={String(itens.length)} />
      </div>

      {cfg?.ultima_sincronizacao && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Última importação</p>
          <p className="text-sm font-semibold text-slate-700">{formatarDataHora(cfg.ultima_sincronizacao)}</p>
          {cfg.ultimo_resultado && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{cfg.ultimo_resultado}</p>
          )}
        </div>
      )}

      {/* ---------- Valor dos materiais ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-900">Valor dos materiais refugados</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Valor por unidade (garrafa). Os itens aparecem sozinhos depois da importação — só o preço é seu.
        </p>

        {semValor > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <strong>{semValor} item(ns) sem valor.</strong> Enquanto faltar preço de algum item do período, a tela
            do colaborador mostra a quantidade mas não o valor em reais — meio valor seria pior do que valor
            nenhum.
          </p>
        )}

        {itens.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
            Nenhum item ainda. Importe as aferições primeiro.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {itens.map((i) => (
              <li key={i.codigo} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2">
                  <p className="text-sm font-semibold text-slate-900">{i.descricao}</p>
                  <p className="font-mono text-[11px] text-slate-400">{i.codigo}</p>
                </div>
                <form action={salvarValorDoItem} className="flex items-end gap-2">
                  <input type="hidden" name="codigo" value={i.codigo} />
                  <div className="min-w-0 flex-1">
                    <label className={rotulo} htmlFor={`valor-${i.codigo}`}>
                      R$ por garrafa
                    </label>
                    <input
                      id={`valor-${i.codigo}`}
                      name="valor"
                      inputMode="decimal"
                      defaultValue={i.valor_unitario !== null ? String(i.valor_unitario).replace(".", ",") : ""}
                      placeholder="0,00"
                      className={campo}
                    />
                  </div>
                  <BotaoEnviar
                    compacto
                    className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Salvar
                  </BotaoEnviar>
                </form>
                {i.valor_unitario !== null && (
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Atual: {formatarReais(i.valor_unitario)} por garrafa
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center">
      <p className="truncate text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
    </div>
  );
}
