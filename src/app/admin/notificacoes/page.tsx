import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  EMOJI_MODULO,
  ROTULO_MODULO,
  tempoRelativo,
  type ModuloNotificavel,
} from "@/lib/notificacoes";
import { salvarConfigAvisos, silenciarAviso } from "./actions";

/** O que cada chave liga, em linguagem de quem vai decidir. */
const EXPLICACAO: Record<string, string> = {
  comunicados: "Avisa quando uma matéria nova é publicada no Jornal",
  padroes: "Avisa quando padrões novos são enviados",
  ranking: "Avisa quando o ranking do mês é publicado",
  sonho: "Avisa quando o Sonho da Revenda é atualizado",
  escala: "Avisa quando a escala de trabalho muda",
  rv: "Permite o botão de avisar que a RV foi atualizada",
  feedback: "Lembra quem ainda não fez o feedback da rota no fim do dia",
  "ativo-giro": "Avisa quando o controle pede uma recontagem",
};

export default async function AdminNotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireOwner();
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");

  const [{ data: config }, { data: ajustes }, { data: recentes }] =
    await Promise.all([
      admin
        .from("notificacao_config")
        .select("modulo, ativa")
        .eq("revenda_id", revendaId)
        .order("modulo", { ascending: true }),
      admin
        .from("notificacao_ajustes")
        .select("hora_lembrete_feedback, max_por_acesso")
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      admin
        .from("notificacoes")
        .select("id, modulo, titulo, mensagem, criado_em, ativa")
        .eq("revenda_id", revendaId)
        .order("criado_em", { ascending: false })
        .limit(20),
    ]);

  const hora = ajustes?.hora_lembrete_feedback ?? 16;
  const maximo = ajustes?.max_por_acesso ?? 1;

  return (
    <div>
      <PageHeader
        title="🔔 Notificações"
        subtitle="O que o app avisa, e com que frequência"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <form
        action={salvarConfigAvisos}
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-1 text-sm font-semibold text-slate-800">
          Quais módulos podem avisar
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Desligar um módulo não apaga os avisos já enviados — só impede que
          ele gere novos.
        </p>

        <div className="space-y-3">
          {(config ?? []).map((c) => (
            <label key={c.modulo} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="modulo"
                value={c.modulo}
                defaultChecked={c.ativa}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
              />
              <span className="min-w-0">
                <span className="text-sm font-medium text-slate-800">
                  {EMOJI_MODULO[c.modulo as ModuloNotificavel] ?? "🔔"}{" "}
                  {ROTULO_MODULO[c.modulo as ModuloNotificavel] ?? c.modulo}
                </span>
                <span className="block text-xs text-slate-500">
                  {EXPLICACAO[c.modulo] ?? ""}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
          <div>
            <label
              htmlFor="hora_lembrete"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Lembrete do feedback a partir das
            </label>
            <input
              id="hora_lembrete"
              name="hora_lembrete"
              type="number"
              min={0}
              max={23}
              defaultValue={hora}
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Antes dessa hora o dia ainda está correndo — cobrar atrapalharia
              quem está na rua.
            </p>
          </div>

          <div>
            <label
              htmlFor="max_por_acesso"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Balões por acesso
            </label>
            <input
              id="max_por_acesso"
              name="max_por_acesso"
              type="number"
              min={0}
              max={3}
              defaultValue={maximo}
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              1 é o recomendado. Com 0, os avisos só aparecem no sino.
            </p>
          </div>
        </div>

        <BotaoEnviar
          textoEnviando="Salvando..."
          className="mt-4 w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          Salvar
        </BotaoEnviar>
      </form>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Últimos avisos enviados
      </h2>

      {(recentes ?? []).length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum aviso enviado ainda. Publique algo no Jornal para ver aqui.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {(recentes ?? []).map((n) => (
            <li key={n.id} className="flex items-start gap-3 p-4">
              <span className="text-xl leading-none">
                {EMOJI_MODULO[n.modulo as ModuloNotificavel] ?? "🔔"}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    n.ativa ? "text-slate-800" : "text-slate-400 line-through"
                  }`}
                >
                  {n.titulo}
                </p>
                <p className="truncate text-sm text-slate-600">{n.mensagem}</p>
                <p className="text-xs text-slate-400">
                  {tempoRelativo(n.criado_em)}
                  {n.ativa ? "" : " · retirado do ar"}
                </p>
              </div>
              {n.ativa && (
                <form action={silenciarAviso}>
                  <input type="hidden" name="id" value={n.id} />
                  <BotaoEnviar
                    compacto
                    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Silenciar
                  </BotaoEnviar>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Cada pessoa vê no máximo {maximo} balão por acesso. O resto fica no
        sino, e some sozinho depois de 21 dias.
      </p>
    </div>
  );
}
