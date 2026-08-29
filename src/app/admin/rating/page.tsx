import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { importarRating, salvarPastaDeRating } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export default async function AdminRatingPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("rating", "ver");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  const admin = createAdminClient();

  const [{ data: config }, { count: avaliacoes }, { count: pessoas }, { count: viagens }, { count: feedbacks }, { data: semDono }] =
    await Promise.all([
      admin.from("rating_config").select("pasta_link, ultima_sincronizacao, ultimo_resultado").eq("revenda_id", revendaId).maybeSingle(),
      admin.from("rating_avaliacoes").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("rating_pessoas").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("rating_viagens").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("rating_feedbacks").select("*", { count: "exact", head: true }).eq("revenda_id", revendaId),
      admin.from("rating_pessoas").select("tipo, codigo, nome, cpf, colaborador_id").eq("revenda_id", revendaId).is("colaborador_id", null).limit(200),
    ]);

  // Quem está no cadastro do ERP mas não achou perfil no app: é aqui que
  // se descobre que alguém não vai ver o próprio rating.
  const naoVinculados = (semDono ?? []) as { tipo: string; codigo: string; nome: string; cpf: string | null }[];

  return (
    <div>
      <PageHeader
        title="Rating de Entrega"
        subtitle="Importa as avaliações do LOG.CO e liga cada uma ao motorista e ao ajudante."
        fecharHref="/admin"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
          ℹ️ Como o app descobre quem entregou
        </summary>
        <div className="space-y-2 border-t border-slate-100 p-3 text-xs text-slate-600">
          <p>
            A planilha do LOG.CO traz a nota do cliente, mas a coluna Motorista vem vazia. Quem entregou sai do
            relatório <strong>03.11.29</strong>, cruzando pelo número do mapa.
          </p>
          <p className="font-mono text-[11px] text-slate-500">
            avaliação → mapa → viagem → código → cadastro → CPF → perfil no app
          </p>
          <p>
            <strong>Motorista e ajudante são cadastros separados</strong> (01.20.01.47 e 01.20.01.48) cujos códigos
            se repetem: o código 1011 é uma pessoa como ajudante e outra como motorista. Por isso os dois arquivos
            são necessários — sem o de ajudantes, eles ficam sem rating.
          </p>
        </div>
      </details>

      {/* ---------- Pasta ---------- */}
      <form action={salvarPastaDeRating} className="mb-5 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <label className={rotulo} htmlFor="link">Pasta do Drive (a pasta MÃE, com as 4 subpastas)</label>
        <input
          id="link"
          name="link"
          defaultValue={config?.pasta_link ?? ""}
          placeholder="https://drive.google.com/drive/folders/..."
          className={campo}
        />
        <p className="text-[11px] text-slate-400">
          Precisa estar compartilhada como “Qualquer pessoa com o link”. O app procura sozinho as subpastas
          01.20.01.47, 01.20.01.48, 03.11.29 e LOG.CO.
        </p>
        <BotaoEnviar
          textoEnviando="Salvando..."
          className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Salvar pasta
        </BotaoEnviar>
      </form>

      {/* ---------- Importar ---------- */}
      <form action={importarRating} className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="tudo" className="mt-0.5" />
          <span>
            Importar <strong>todos os meses</strong>
            <span className="block text-[11px] text-slate-400">
              Sem marcar, traz só o mês corrente — é o que muda no dia a dia. Marque na primeira carga.
            </span>
          </span>
        </label>
        <BotaoEnviar
          textoEnviando="Importando... (pode levar um minuto)"
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          ⭐ Importar avaliações
        </BotaoEnviar>
      </form>

      {/* ---------- Situação ---------- */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao titulo="Avaliações" valor={avaliacoes ?? 0} />
        <Cartao titulo="Mapas" valor={viagens ?? 0} />
        <Cartao titulo="Pessoas" valor={pessoas ?? 0} />
        <Cartao titulo="Respostas" valor={feedbacks ?? 0} />
      </div>

      {config?.ultima_sincronizacao && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Última importação</p>
          <p className="text-sm font-semibold text-slate-700">
            {formatarDataHora(config.ultima_sincronizacao)}
          </p>
          {config.ultimo_resultado && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{config.ultimo_resultado}</p>
          )}
        </div>
      )}

      {naoVinculados.length > 0 && (
        <details className="rounded-2xl border border-amber-200 bg-amber-50">
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-amber-900 marker:content-none [&::-webkit-details-marker]:hidden">
            ⚠️ {naoVinculados.length} pessoa(s) do cadastro sem perfil no app
          </summary>
          <div className="border-t border-amber-200 p-4">
            <p className="mb-3 text-xs text-amber-800">
              Essas pessoas entregam, mas não vão ver o próprio rating: ou não têm login no app, ou o CPF do
              cadastro do ERP não bate com o do perfil. Muitas são de outras filiais e podem ser ignoradas.
            </p>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {naoVinculados.map((p) => (
                <li key={`${p.tipo}-${p.codigo}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-700">
                    <span className="mr-1 rounded bg-white px-1 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {p.tipo}
                    </span>
                    {p.nome}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {p.cpf ? `CPF ${p.cpf}` : "sem CPF"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center">
      <p className="truncate text-2xl font-bold tabular-nums text-slate-900">{valor.toLocaleString("pt-BR")}</p>
      <p className="text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
    </div>
  );
}
