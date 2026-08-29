import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  META_PADRAO_PCT,
  RESPONSABILIDADES,
  ROTULO_RESPONSABILIDADE,
  type Responsabilidade,
} from "@/lib/devolucao";
import { classificarMotivo, importarDevolucao, salvarConfigDeDevolucao } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Motivo = {
  codigo: string;
  descricao: string;
  responsabilidade: Responsabilidade;
  conta_no_indicador: boolean;
};

export default async function AdminDevolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; todos?: string }>;
}) {
  await requireModulo("devolucao", "ver");
  const sp = await searchParams;
  const mostrarTodos = sp.todos === "1";

  const revendaId = await getRevendaId();
  const admin = createAdminClient();

  const [{ data: cfg }, { data: motivosBanco }, { count: notas }, { count: dias }, { count: justificativas }, { data: ratingCfg }, { data: usados }] =
    await Promise.all([
      admin.from("devolucao_config").select("pasta_link, meta_pct, ultima_sincronizacao, ultimo_resultado").eq("revenda_id", revendaId).maybeSingle(),
      admin.from("devolucao_motivos").select("codigo, descricao, responsabilidade, conta_no_indicador").eq("revenda_id", revendaId).order("codigo"),
      admin.from("devolucao_notas").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("devolucao_dia").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("devolucao_justificativas").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("rating_config").select("pasta_link").eq("revenda_id", revendaId).maybeSingle(),
      admin.from("devolucao_notas").select("motivo_codigo").eq("revenda_id", revendaId).limit(1000),
    ]);

  const todosMotivos = (motivosBanco ?? []) as Motivo[];
  // A tabela tem 94 códigos, mas só 30 aparecem de verdade. Mostrar os 94
  // faria a liderança classificar 64 motivos que nunca vão acontecer.
  const codigosUsados = new Set((usados ?? []).map((n) => n.motivo_codigo).filter(Boolean));
  const motivos = mostrarTodos ? todosMotivos : todosMotivos.filter((m) => codigosUsados.has(m.codigo));
  const aClassificar = motivos.filter((m) => m.responsabilidade === "nao_classificado").length;
  const meta = cfg?.meta_pct ?? META_PADRAO_PCT;

  return (
    <div>
      <PageHeader
        title="Devolução"
        subtitle="Importa as notas devolvidas e define de quem é cada motivo."
        fecharHref="/admin"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
          ℹ️ Por que os motivos são classificados
        </summary>
        <div className="space-y-2 border-t border-slate-100 p-3 text-xs text-slate-600">
          <p>
            Os três motivos mais frequentes são <strong>PDV Fechado</strong>, <strong>Sem Dinheiro</strong> e{" "}
            <strong>Cliente Cancelou</strong> — 57% das ocorrências, e nenhum deles é falha de quem entrega.
          </p>
          <p>
            E o motivo que mais pesa em dinheiro, <strong>“Mapa não carregado”</strong>, carrega quatro notas de
            transferência para a fábrica que somam R$ 836 mil — 58% do valor devolvido do ano.
          </p>
          <p className="text-amber-700">
            Sem separar por responsabilidade, o motorista abriria o app e leria “você devolveu R$ 547 mil”. A
            classificação abaixo é o que decide o que entra no número de cada um.
          </p>
        </div>
      </details>

      <form action={salvarConfigDeDevolucao} className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className={rotulo} htmlFor="meta">Meta de devolução (%)</label>
          <input
            id="meta"
            name="meta"
            inputMode="decimal"
            defaultValue={String(meta).replace(".", ",")}
            className={campo}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Acima disso no dia, o colaborador precisa dizer o que aconteceu. Nos 8 meses de 2026 a operação rodou
            a 1,98% do valor entregue (0,78% sem a transferência) — com 1,6%, cerca de 11% dos dias pedem
            justificativa.
          </p>
        </div>
        <div>
          <label className={rotulo} htmlFor="link">Pasta do Drive (opcional)</label>
          <input
            id="link"
            name="link"
            defaultValue={cfg?.pasta_link ?? ""}
            placeholder={ratingCfg?.pasta_link ? "usando a mesma pasta do Rating" : "https://drive.google.com/drive/folders/..."}
            className={campo}
          />
        </div>
        <BotaoEnviar
          textoEnviando="Salvando..."
          className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Salvar
        </BotaoEnviar>
      </form>

      <form action={importarDevolucao} className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="tudo" className="mt-0.5" />
          <span>
            Importar <strong>todos os meses</strong>
            <span className="block text-[11px] text-slate-400">
              Cada arquivo mensal tem ~7 mil linhas e 9 MB. Sem marcar, traz só o mês corrente.
            </span>
          </span>
        </label>
        <BotaoEnviar
          textoEnviando="Importando... (pode levar alguns minutos)"
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ↩️ Importar devoluções
        </BotaoEnviar>
      </form>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Cartao titulo="Devoluções" valor={(notas ?? 0).toLocaleString("pt-BR")} />
        <Cartao titulo="Dias" valor={(dias ?? 0).toLocaleString("pt-BR")} />
        <Cartao titulo="Justificativas" valor={(justificativas ?? 0).toLocaleString("pt-BR")} />
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

      {/* ---------- Classificação dos motivos ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">De quem é cada motivo</h2>
          <a
            href={mostrarTodos ? "/admin/devolucao" : "/admin/devolucao?todos=1"}
            className="shrink-0 text-xs font-semibold text-primary"
          >
            {mostrarTodos ? "só os usados" : `ver todos (${todosMotivos.length})`}
          </a>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {mostrarTodos
            ? "Todos os motivos da tabela do ERP."
            : "Só os motivos que apareceram de verdade nas devoluções importadas."}
        </p>

        {aClassificar > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <strong>{aClassificar} motivo(s) a classificar.</strong> Enquanto isso, essas devoluções ficam fora
            do número do colaborador — nunca entram como culpa de alguém por engano.
          </p>
        )}

        {motivos.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
            Nenhum motivo ainda. Importe as devoluções primeiro.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {motivos.map((m) => (
              <li
                key={m.codigo}
                className={`rounded-xl border p-3 ${
                  m.conta_no_indicador ? "border-slate-200" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{m.descricao}</p>
                    <p className="font-mono text-[11px] text-slate-400">código {m.codigo}</p>
                  </div>
                  {!m.conta_no_indicador && (
                    <span className="shrink-0 rounded-lg bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      fora da conta
                    </span>
                  )}
                </div>
                <form action={classificarMotivo} className="space-y-2">
                  <input type="hidden" name="codigo" value={m.codigo} />
                  <div className="flex items-center gap-2">
                    <select name="responsabilidade" defaultValue={m.responsabilidade} className={`${campo} flex-1`}>
                      {RESPONSABILIDADES.filter((r) => r !== "nao_conta").map((r) => (
                        <option key={r} value={r}>
                          {ROTULO_RESPONSABILIDADE[r].longo}
                        </option>
                      ))}
                    </select>
                    <BotaoEnviar
                      compacto
                      className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
                    >
                      Salvar
                    </BotaoEnviar>
                  </div>
                  {/* Eixo separado de propósito: NF rejeitada é da
                      operação E não entra no percentual da revenda. */}
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      name="conta"
                      defaultChecked={m.conta_no_indicador}
                      className="mt-0.5"
                    />
                    <span>
                      Entra no <strong>% de devolução</strong>
                      <span className="block text-[11px] text-slate-400">
                        Desmarque para o motivo aparecer no histórico mas ficar fora do percentual.
                      </span>
                    </span>
                  </label>
                </form>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer list-none text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
            O que significa cada faixa
          </summary>
          <ul className="mt-2 space-y-1.5">
            {RESPONSABILIDADES.map((r) => (
              <li key={r} className="text-xs text-slate-600">
                <strong>{ROTULO_RESPONSABILIDADE[r].longo}:</strong> {ROTULO_RESPONSABILIDADE[r].ajuda}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        Na tela do colaborador o valor em reais aparece sempre separado por responsabilidade.
      </p>
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center">
      <p className="truncate text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
    </div>
  );
}
