import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { FormularioComPessoa } from "@/components/admin/SeletorDePessoa";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FORMATOS,
  TIPOS,
  chave,
  fatoresDeLinhas,
  parqueDeLinhas,
} from "@/lib/ativo-giro";
import {
  buscarParaLiberarTransito,
  liberarTransito,
  salvarFator,
  salvarParque,
  tirarLiberacaoTransito,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminAtivoDeGiroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("ativo-giro", "editar");

  const sp = await searchParams;

  // Parque e fatores são da operação de cada revenda (a 021 até refez as
  // chaves primárias para isso). A tela lia sem filtro nenhum e contava com
  // a RLS -- que devolve TODAS as revendas para o dono. Como
  // `parqueDeLinhas` e `fatoresDeLinhas` indexam por tipo|formato e formato,
  // a última linha lida vencia: o campo mostrava o número da outra unidade,
  // e o Salvar ao lado gravava esse número na revenda ativa.
  const revendaId = await exigirRevenda("/admin");

  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data: fatoresBanco }, { data: parqueBanco }, { data: liberadosBanco }] =
    await Promise.all([
      supabase
        .from("ag_fatores")
        .select("formato, palete, lastro")
        .eq("revenda_id", revendaId),
      supabase
        .from("ag_parque")
        .select("tipo, formato, quantidade")
        .eq("revenda_id", revendaId),
      // Pela chave de administrador: `ag_transito_liberados` tem RLS
      // ligada e política nenhuma, de propósito (migration 093). Quem lê
      // pelo cliente comum descobriria quem pode mexer no número, e quem
      // escreve nela se libera sozinho.
      admin
        .from("ag_transito_liberados")
        .select("colaborador_id")
        .eq("revenda_id", revendaId),
    ]);
  const fatores = fatoresDeLinhas(fatoresBanco);
  const parque = parqueDeLinhas(parqueBanco);

  // Os nomes vêm à parte, e não por join: `colaborador_id` aponta para
  // auth.users, não para public.profiles, então o PostgREST não atravessa
  // a relação -- ele responde "Could not find a relationship" e devolve
  // NULL, que a tela leria como "ninguém liberado". Foi exatamente esse o
  // defeito do alerta de gás, corrigido em 03/09/2026.
  const idsLiberados = (liberadosBanco ?? []).map((l) => l.colaborador_id);
  const { data: perfisLiberados } = idsLiberados.length
    ? await admin.from("profiles").select("id, nome, cargo").in("id", idsLiberados)
    : { data: [] as { id: string; nome: string; cargo: string | null }[] };

  const liberados = idsLiberados
    .map((id) => {
      const p = (perfisLiberados ?? []).find((x) => x.id === id);
      return {
        colaborador_id: id,
        // Cadastro apagado deixa o vínculo para trás. A linha aparece
        // assim mesmo, para dar como tirá-la.
        nome: p?.nome ?? "(cadastro removido)",
        cargo: p?.cargo ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div>
      <PageHeader
        title="Ativo de Giro — Configuração"
        subtitle="Parque e fatores de conversão. Quem tem acesso ao módulo se gerencia em Colaboradores."
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {sp.erro}
        </p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          {sp.sucesso}
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        <a
          href="/ativo-de-giro"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Ir para contagem, painel, conciliação e histórico
        </a>
        <a
          href="/admin/colaboradores"
          className="text-sm font-medium text-primary hover:underline"
        >
          Gerenciar quem tem acesso →
        </a>
      </div>

      <section className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
            Parque de AG (saldo oficial, em caixas)
          </h2>
          <div className="space-y-2">
            {TIPOS.flatMap((tipo) =>
              FORMATOS.map((formato) => (
                <form
                  key={chave(tipo, formato)}
                  action={salvarParque}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="tipo" value={tipo} />
                  <input type="hidden" name="formato" value={formato} />
                  <span className="flex-1 text-sm text-slate-700">
                    {tipo} · {formato}
                  </span>
                  <input
                    type="number"
                    name="quantidade"
                    min={0}
                    defaultValue={parque[chave(tipo, formato)] ?? 0}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                  />
                  <BotaoEnviar
                    compacto
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Salvar
                  </BotaoEnviar>
                </form>
              )),
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
            Fatores de conversão
          </h2>
          <div className="space-y-2">
            {FORMATOS.map((formato) => (
              <form
                key={formato}
                action={salvarFator}
                className="flex items-center gap-2"
              >
                <input type="hidden" name="formato" value={formato} />
                <span className="flex-1 text-sm text-slate-700">
                  {formato}
                </span>
                <input
                  type="number"
                  name="palete"
                  min={1}
                  defaultValue={fatores[formato].palete}
                  aria-label={`Caixas por palete ${formato}`}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                />
                <input
                  type="number"
                  name="lastro"
                  min={1}
                  defaultValue={fatores[formato].lastro}
                  aria-label={`Caixas por lastro ${formato}`}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-base"
                />
                <BotaoEnviar
                  compacto
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Salvar
                </BotaoEnviar>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Primeiro campo: caixas por palete. Segundo: caixas por lastro.
          </p>
        </div>

        {/* ---- QUEM PODE LANÇAR O TRÂNSITO ----
            A liberação mora aqui, e não em Acessos por Pessoa (pedido do
            dono, 03/09/2026). O motivo é de fluxo: quem cuida do parque
            não é quem cuida do mapa de permissão do app, e obrigar a
            passar por Acessos transformaria uma tarefa da controladoria
            num chamado para o Admin -- a liberação ficaria esperando dias
            por uma conta que dura minutos. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase text-slate-500">
            🚚 Quem pode lançar o trânsito
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            O trânsito é o ativo que não está no pátio para ser contado. Ele
            entra na conciliação somando ao contado, antes de comparar com o
            parque — sem ele, todo dia com carreta na estrada acusa falta.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Quem administra o Ativo de Giro já pode lançar, sem estar nesta
            lista. Quem está aqui só ganha isso: lançar o número do dia.
          </p>

          <FormularioComPessoa
            action={liberarTransito}
            buscar={buscarParaLiberarTransito}
            campoId="colaborador_id"
            placeholder="Digite o nome ou CPF de quem vai lançar"
            rotuloBotao="Liberar"
          />

          <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
            {liberados.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                Ninguém liberado ainda — só quem administra o módulo lança.
              </p>
            ) : (
              liberados.map((l) => (
                <div
                  key={l.colaborador_id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {l.nome}
                    {l.cargo && (
                      <span className="text-xs text-slate-400"> · {l.cargo}</span>
                    )}
                  </span>
                  <BotaoExcluir
                    action={tirarLiberacaoTransito}
                    campos={{ colaborador_id: l.colaborador_id }}
                    confirmacao={`Tirar a liberação de ${l.nome} para lançar o trânsito? O que ela já lançou continua valendo.`}
                    rotuloConfirmar="Tirar liberação"
                    perigo={false}
                    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Tirar
                  </BotaoExcluir>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Aqui ficava "Importar histórico do app antigo", que subia o
            contagens-ag.json exportado do aplicativo anterior. Saiu a
            pedido do dono (03/09/2026): a migração terminou, o app antigo
            não existe mais, e um importador que ninguém usa é um botão a
            mais entre a pessoa e o que ela veio fazer. A ação
            `importarHistorico` continua em ativo-de-giro/actions.ts, sem
            tela -- se um dia aparecer um arquivo perdido, é uma tela de
            volta, não um trabalho novo. */}
      </section>
    </div>
  );
}
