import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { GRUPOS_DO_ADMIN, MODULOS, ROTULO_ACAO } from "@/lib/acessos";
import { agruparPorModulo, temOPerfil, type Concessao } from "@/lib/perfis-acesso";
import { aplicarPerfil, criarPerfilDePessoa, excluirPerfil, salvarPerfil } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Perfil = { id: string; nome: string; descricao: string | null };

/**
 * PERFIS DE ACESSO
 *
 * "Liderança" nunca foi um perfil -- era um saco de concessões módulo ×
 * ação preenchido à mão, pessoa por pessoa. Não havia como dizer "este é
 * um supervisor de armazém" e ele receber o conjunto certo, e por isso a
 * separação entre colaborador, gestão e administração só podia ser feita
 * escondendo botão.
 *
 * Um perfil é uma lista de concessões com NOME. Aplicá-lo grava as mesmas
 * linhas de sempre em lideranca_permissoes: nada muda no que já funciona,
 * ganha-se um atalho e um significado.
 */
export default async function PerfisDeAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; perfil?: string; novo?: string }>;
}) {
  await requireModulo("perfis-acesso", "ver");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return <PageHeader title="🎫 Perfis de Acesso" subtitle="Você não está em nenhuma revenda." />;
  }

  const admin = createAdminClient();
  const podeEditar = await podeNoModulo("perfis-acesso", "editar");

  const [{ data: perfisBanco }, { data: permsBanco }, { data: pessoasBanco }, { data: concessoesBanco }] =
    await Promise.all([
      admin.from("perfis_acesso").select("id, nome, descricao").eq("revenda_id", revendaId).order("nome"),
      admin.from("perfil_permissoes").select("perfil_id, modulo, acao"),
      admin.from("profiles").select("id, nome, cargo, role").order("nome"),
      admin.from("lideranca_permissoes").select("colaborador_id, modulo, acao"),
    ]);

  const perfis = (perfisBanco ?? []) as Perfil[];
  const permsDoPerfil = new Map<string, Concessao[]>();
  for (const p of (permsBanco ?? []) as { perfil_id: string; modulo: string; acao: string }[]) {
    const lista = permsDoPerfil.get(p.perfil_id) ?? [];
    lista.push({ modulo: p.modulo, acao: p.acao });
    permsDoPerfil.set(p.perfil_id, lista);
  }

  const concessoesDaPessoa = new Map<string, Concessao[]>();
  for (const c of (concessoesBanco ?? []) as { colaborador_id: string; modulo: string; acao: string }[]) {
    const lista = concessoesDaPessoa.get(c.colaborador_id) ?? [];
    lista.push({ modulo: c.modulo, acao: c.acao });
    concessoesDaPessoa.set(c.colaborador_id, lista);
  }

  const pessoas = (pessoasBanco ?? []) as { id: string; nome: string; cargo: string | null; role: string }[];
  const comPermissao = pessoas.filter((p) => (concessoesDaPessoa.get(p.id)?.length ?? 0) > 0);

  const emEdicao = sp.perfil ? perfis.find((p) => p.id === sp.perfil) ?? null : null;
  const criandoNovo = sp.novo === "1";
  const permsEmEdicao = emEdicao ? permsDoPerfil.get(emEdicao.id) ?? [] : [];
  const marcadas = new Set(permsEmEdicao.map((c) => `${c.modulo}:${c.acao}`));

  // Chave como string: o módulo vem do BANCO, e um id que saiu do
  // catálogo (módulo renomeado, permissão antiga) tem que aparecer com o
  // próprio nome em vez de quebrar a tela.
  const nomeDoModulo = new Map<string, string>(MODULOS.map((m) => [m.id as string, m.rotulo]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="🎫 Perfis de Acesso"
        subtitle="Conjuntos de permissão com nome, para não montar cada pessoa à mão."
        fecharHref="/admin"
      />

      {sp.erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">✅ {sp.sucesso}</p>
      )}

      <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        Aplicar um perfil <strong>soma</strong> permissões — nunca tira. Quem já administra outra
        coisa continua administrando, e para remover a tela de{" "}
        <Link href="/admin/acessos" className="font-semibold text-primary hover:underline">
          Usuários e Acessos
        </Link>{" "}
        continua sendo o lugar. Depois de aplicado, o perfil não prende ninguém: dá para ajustar
        pessoa a pessoa como sempre.
      </div>

      {/* ---------- LISTA ---------- */}
      {perfis.length === 0 && !criandoNovo && !emEdicao ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm font-semibold text-slate-600">Nenhum perfil ainda</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Os perfis que a operação usa já existem — espalhados nas permissões de quem faz o
            trabalho. O jeito mais rápido de começar é copiar de alguém que já está configurado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {perfis.map((p) => {
            const perms = permsDoPerfil.get(p.id) ?? [];
            const quantos = comPermissao.filter((pessoa) =>
              temOPerfil(perms, concessoesDaPessoa.get(pessoa.id) ?? []),
            ).length;
            const porModulo = agruparPorModulo(perms);

            return (
              <section key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{p.nome}</p>
                      {p.descricao && <p className="mt-0.5 text-xs text-slate-500">{p.descricao}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        {perms.length} permissão(ões)
                      </span>
                      <span className="rounded-lg bg-primary-soft px-2 py-1 text-[11px] font-bold text-primary-dark">
                        {quantos} pessoa(s)
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...porModulo].map(([modulo, acoes]) => (
                      <span
                        key={modulo}
                        className="rounded-lg bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                        title={acoes.join(", ")}
                      >
                        {nomeDoModulo.get(modulo) ?? modulo}
                        <span className="ml-1 text-slate-400">{acoes.length}</span>
                      </span>
                    ))}
                  </div>

                  {podeEditar && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/admin/perfis-de-acesso?perfil=${p.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Editar permissões →
                      </Link>
                      <BotaoExcluir
                        action={excluirPerfil}
                        campos={{ id: p.id }}
                        confirmacao={`Excluir o perfil "${p.nome}"? Quem já recebeu continua com as permissões — só o atalho some.`}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Excluir
                      </BotaoExcluir>
                    </div>
                  )}
                </div>

                {podeEditar && (
                  <form action={aplicarPerfil} className="flex flex-wrap items-end gap-2 p-4">
                    <input type="hidden" name="perfil_id" value={p.id} />
                    <div className="min-w-0 flex-1">
                      <label className={rotulo} htmlFor={`pessoa-${p.id}`}>
                        Aplicar a
                      </label>
                      <select id={`pessoa-${p.id}`} name="colaborador_id" required className={campo}>
                        <option value="">Escolha a pessoa</option>
                        {pessoas.map((pessoa) => (
                          <option key={pessoa.id} value={pessoa.id}>
                            {pessoa.nome}
                            {pessoa.cargo ? ` — ${pessoa.cargo}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <BotaoEnviar
                      compacto
                      className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Aplicar
                    </BotaoEnviar>
                  </form>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ---------- CRIAR A PARTIR DE UMA PESSOA ---------- */}
      {podeEditar && !emEdicao && !criandoNovo && (
        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white" open={perfis.length === 0}>
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
            👤 Criar a partir de uma pessoa
          </summary>
          <form action={criarPerfilDePessoa} className="space-y-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">
              Copia as permissões que alguém já tem. É o jeito mais honesto de começar — os perfis
              que a operação usa já estão no banco, só não têm nome.
            </p>
            <div>
              <label className={rotulo} htmlFor="de-pessoa">Copiar de</label>
              <select id="de-pessoa" name="colaborador_id" required className={campo}>
                <option value="">Escolha a pessoa</option>
                {comPermissao.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {concessoesDaPessoa.get(p.id)?.length ?? 0} permissão(ões)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="nome-copia">Nome do perfil</label>
              <input id="nome-copia" name="nome" required placeholder="Ex.: Supervisor de Armazém" className={campo} />
            </div>
            <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark sm:w-auto">
              Criar perfil
            </BotaoEnviar>
          </form>
        </details>
      )}

      {podeEditar && !emEdicao && !criandoNovo && (
        <Link
          href="/admin/perfis-de-acesso?novo=1"
          className="block rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-primary hover:border-primary"
        >
          + Montar um perfil do zero
        </Link>
      )}

      {/* ---------- GRADE DE PERMISSÕES ---------- */}
      {podeEditar && (emEdicao || criandoNovo) && (
        <form action={salvarPerfil} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="nome">Nome do perfil</label>
              <input
                id="nome"
                name="nome"
                required
                defaultValue={emEdicao?.nome ?? ""}
                placeholder="Ex.: Supervisor de Armazém"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="descricao">Quem é este perfil</label>
              <input
                id="descricao"
                name="descricao"
                defaultValue={emEdicao?.descricao ?? ""}
                placeholder="Ex.: acompanha os indicadores do armazém, sem cadastrar"
                className={campo}
              />
            </div>
          </div>

          <div className="space-y-4">
            {GRUPOS_DO_ADMIN.map((grupo) => {
              const doGrupo = MODULOS.filter((m) => m.grupo === grupo && !m.subGrupoDe);
              if (doGrupo.length === 0) return null;
              return (
                <div key={grupo}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{grupo}</p>
                  <div className="space-y-2">
                    {doGrupo.map((m) => (
                      <div key={m.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-sm font-semibold text-slate-800">
                          {m.emoji} {m.rotulo}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                          {m.acoes.map((acao) => (
                            <label key={acao} className="flex items-center gap-1.5 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                name={`perm-${m.id}-${acao}`}
                                defaultChecked={marcadas.has(`${m.id}:${acao}`)}
                                className="h-4 w-4 rounded border-slate-300 text-primary"
                              />
                              {ROTULO_ACAO[acao] ?? acao}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <BotaoEnviar className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark">
              {emEdicao ? "Salvar alterações" : "Criar perfil"}
            </BotaoEnviar>
            <Link
              href="/admin/perfis-de-acesso"
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
