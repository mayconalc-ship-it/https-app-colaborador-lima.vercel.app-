import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AbasDeAcesso } from "@/components/admin/AbasDeAcesso";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { AplicarPerfil } from "@/components/admin/AplicarPerfil";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { ehOwner } from "@/lib/acessos";
import { alcanceDe } from "@/lib/gestao-de-acessos";
import { permissoesNaRevenda } from "@/lib/gestao-de-acessos-server";
import {
  GRUPOS_DO_ADMIN,
  MODULOS,
  MODULOS_OPCIONAIS,
  ROTULO_ACAO,
  moduloPorId,
  rotuloDaAcaoNoModulo,
} from "@/lib/acessos";
import { agruparPorModulo, type Concessao } from "@/lib/perfis-acesso";
import {
  aplicarPerfil,
  criarPerfilDePessoa,
  excluirPerfil,
  salvarPerfil,
  tirarDoPerfil,
} from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type TipoDePerfil = "lideranca" | "colaborador";
type Perfil = { id: string; nome: string; descricao: string | null; tipo: TipoDePerfil };

/**
 * PERFIS DE ACESSO
 *
 * DOIS TIPOS (10/09/2026, migration 111). Um perfil "Motorista", montado
 * para dizer o que o motorista vê no app, promoveu o motorista a
 * liderança -- a tela só sabia montar permissão de Modo Liderança. Agora o
 * tipo é escolhido na criação:
 *   📱 Colaborador -- os módulos que a pessoa vê no app. Nunca muda o papel.
 *   ⚙️ Liderança   -- ver/criar/editar/excluir no Modo Liderança. Promover
 *                    um colaborador pede confirmação explícita.
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
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    perfil?: string;
    /** "colaborador" ou "lideranca" -- o tipo do perfil que está nascendo. */
    novo?: string;
  }>;
}) {
  await requireModulo("perfis-acesso", "ver");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return <PageHeader title="🎫 Perfis de Acesso" subtitle="Você não está em nenhuma revenda." />;
  }

  const admin = createAdminClient();
  const podeEditar = await podeNoModulo("perfis-acesso", "editar");
  // O ALCANCE de quem não é o Admin (11/09/2026): nas grades, a caixa de
  // uma permissão que ela mesma não tem aparece travada, e o servidor
  // preserva o que estava. Nulo para o Admin.
  const eu = await getPerfil();
  const dono = ehOwner(eu?.role);
  const alcance = dono || !eu ? null : alcanceDe(await permissoesNaRevenda(eu.id, revendaId));

  const [
    { data: perfisBanco },
    { data: permsBanco },
    { data: pessoasBanco },
    { data: concessoesBanco },
    { data: vinculosBanco },
    { data: modulosDePerfilBanco },
    { data: extrasBanco },
    { data: ativosBanco },
  ] = await Promise.all([
    admin
      .from("perfis_acesso")
      .select("id, nome, descricao, tipo")
      .eq("revenda_id", revendaId)
      .order("nome"),
    admin.from("perfil_permissoes").select("perfil_id, modulo, acao"),
    admin.from("profiles").select("id, nome, cargo, role").order("nome"),
    // Da revenda aberta, e só dela: é com estas concessões que a tela
    // monta a lista de quem pode virar molde. Sem o filtro, São Félix
    // contava Barreiras.
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id, modulo, acao")
      .eq("revenda_id", revendaId),
    // QUEM TEM CADA PERFIL, registrado -- não mais deduzido de quem
    // "tem todas as permissões dele". A dedução colocava todo
    // administrador dentro de todo perfil pequeno, porque um admin
    // contém qualquer perfil por definição (ver migration 091).
    admin
      .from("perfil_pessoas")
      .select("perfil_id, colaborador_id")
      .eq("revenda_id", revendaId),
    // Os módulos do app de cada perfil de COLABORADOR, e os que cada
    // pessoa já tem liberados nesta revenda.
    admin.from("perfil_modulos_app").select("perfil_id, modulo"),
    admin
      .from("colaborador_modulos_extra")
      .select("colaborador_id, modulo")
      .eq("revenda_id", revendaId),
    // Só se oferece módulo que a revenda tem ligado: liberar um módulo
    // desligado prometeria uma tela que não aparece.
    admin.from("revenda_modulos").select("modulo").eq("revenda_id", revendaId).eq("ativo", true),
  ]);

  const perfis = ((perfisBanco ?? []) as Perfil[]).map((p) => ({
    ...p,
    tipo: (p.tipo === "colaborador" ? "colaborador" : "lideranca") as TipoDePerfil,
  }));

  const modulosDoPerfil = new Map<string, string[]>();
  for (const m of (modulosDePerfilBanco ?? []) as { perfil_id: string; modulo: string }[]) {
    modulosDoPerfil.set(m.perfil_id, [...(modulosDoPerfil.get(m.perfil_id) ?? []), m.modulo]);
  }
  const modulosDaPessoa: Record<string, string[]> = {};
  for (const e of (extrasBanco ?? []) as { colaborador_id: string; modulo: string }[]) {
    (modulosDaPessoa[e.colaborador_id] ??= []).push(e.modulo);
  }
  const ativos = new Set((ativosBanco ?? []).map((a) => a.modulo as string));
  const modulosAppDaRevenda = MODULOS_OPCIONAIS.filter((m) => ativos.has(m)) as string[];
  const rotulosDeModuloApp: Record<string, string> = {};
  for (const m of MODULOS_OPCIONAIS) {
    const mod = moduloPorId(m);
    rotulosDeModuloApp[m] = mod ? `${mod.emoji} ${mod.rotulo}` : m;
  }
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

  const doPerfil = new Map<string, string[]>();
  for (const v of (vinculosBanco ?? []) as { perfil_id: string; colaborador_id: string }[]) {
    const lista = doPerfil.get(v.perfil_id) ?? [];
    lista.push(v.colaborador_id);
    doPerfil.set(v.perfil_id, lista);
  }

  // O caminho inverso do vínculo, para responder "o que os OUTROS perfis
  // desta pessoa sustentam?" -- a mesma conta que a propagação faz antes
  // de retirar qualquer coisa (ver concessoesDosOutrosPerfis). O aviso da
  // grade tem que enxergar o mesmo escudo, senão anuncia perdas que não
  // vão acontecer.
  const perfisDaPessoa = new Map<string, string[]>();
  for (const v of (vinculosBanco ?? []) as { perfil_id: string; colaborador_id: string }[]) {
    const lista = perfisDaPessoa.get(v.colaborador_id) ?? [];
    lista.push(v.perfil_id);
    perfisDaPessoa.set(v.colaborador_id, lista);
  }
  const protegidoPor = (colaboradorId: string, perfilIgnorado: string) => {
    const escudo = new Set<string>();
    for (const outro of perfisDaPessoa.get(colaboradorId) ?? []) {
      if (outro === perfilIgnorado) continue;
      for (const c of permsDoPerfil.get(outro) ?? []) escudo.add(`${c.modulo}:${c.acao}`);
    }
    return escudo;
  };
  // O mesmo escudo para os módulos do app (ver modulosDosOutrosPerfis).
  const modulosProtegidos = (colaboradorId: string, perfilIgnorado: string) => {
    const escudo = new Set<string>();
    for (const outro of perfisDaPessoa.get(colaboradorId) ?? []) {
      if (outro === perfilIgnorado) continue;
      for (const m of modulosDoPerfil.get(outro) ?? []) escudo.add(m);
    }
    return escudo;
  };

  const papelDe: Record<string, string> = {};
  for (const p of pessoas) papelDe[p.id] = p.role;

  const emEdicao = sp.perfil ? perfis.find((p) => p.id === sp.perfil) ?? null : null;
  const tipoNovo: TipoDePerfil | null =
    sp.novo === "colaborador" ? "colaborador" : sp.novo === "lideranca" || sp.novo === "1" ? "lideranca" : null;
  const criandoNovo = tipoNovo !== null;
  const permsEmEdicao = emEdicao ? permsDoPerfil.get(emEdicao.id) ?? [] : [];
  const marcadas = new Set(permsEmEdicao.map((c) => `${c.modulo}:${c.acao}`));
  const modulosMarcados = new Set(emEdicao ? modulosDoPerfil.get(emEdicao.id) ?? [] : []);

  // Chave como string: o módulo vem do BANCO, e um id que saiu do
  // catálogo (módulo renomeado, permissão antiga) tem que aparecer com o
  // próprio nome em vez de quebrar a tela.
  const nomeDoModulo = new Map<string, string>(MODULOS.map((m) => [m.id as string, m.rotulo]));

  /**
   * O material que a caixa de aplicar precisa para fazer a conta do que
   * SAI antes de enviar (ver AplicarPerfil).
   *
   * Só entram as pessoas que já têm alguma concessão: quem não tem nada
   * não perde nada, e mandar o mapa inteiro seria carregar 67 listas
   * vazias para o navegador.
   */
  const jaTem: Record<string, string[]> = {};
  for (const p of comPermissao) {
    jaTem[p.id] = (concessoesDaPessoa.get(p.id) ?? []).map(
      (c) => `${c.modulo}:${c.acao}`,
    );
  }

  const rotulosDeConcessao: Record<string, string> = {};
  for (const m of MODULOS) {
    for (const a of m.acoes) {
      rotulosDeConcessao[`${m.id}:${a}`] = `${m.rotulo} · ${rotuloDaAcaoNoModulo(m, a)}`;
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="🎫 Perfis de Acesso"
        subtitle="O molde de um cargo, com nome: monta-se uma vez e aplica-se a quantas pessoas precisar."
        fecharHref="/admin"
      />

      {/* A MESMA BARRA DA TELA DE ACESSOS (06/09/2026). As duas rotas
          continuam duas -- as portas de entrada são diferentes, ver o
          comentário em AbasDeAcesso --, mas se comportam como uma tela:
          o mesmo lugar para cada coisa, sempre. */}
      <AbasDeAcesso atual="perfil" revendaId={revendaId} />

      {sp.erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">✅ {sp.sucesso}</p>
      )}

      {/* Por que existem duas telas de acesso -- respondido na própria
          tela, porque de fora elas pareciam o mesmo módulo (pergunta do
          dono, 02/09/2026). O contraste é objeto e sentido: pessoa x
          molde, soma x soma-e-tira. */}
      <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        <p>
          <strong>Um perfil é um molde, não uma pessoa.</strong> Ele guarda um
          conjunto de acessos com nome — &quot;Analista de Rota&quot; — para
          não remontar tudo à mão a cada contratação. Aplicá-lo grava
          exatamente as mesmas marcações que você faria em{" "}
          <Link
            href="/admin/acessos"
            className="font-semibold text-primary hover:underline"
          >
            Acessos por Pessoa
          </Link>
          : não é um segundo sistema de permissão, é um atalho para o mesmo.
        </p>
        <p className="mt-2">
          <strong>Existem dois tipos, e eles não se misturam.</strong>{" "}
          <span className="font-semibold text-emerald-800">📱 Colaborador</span> diz quais
          módulos a pessoa vê no app (Comunicados, Escala, Ranking…) — ela continua
          colaborador e <strong>nunca</strong> entra no Modo Liderança.{" "}
          <span className="font-semibold text-amber-800">⚙️ Liderança</span> diz o que a pessoa
          pode <strong>ver, criar, editar e excluir</strong> no Modo Liderança; aplicá-lo a um
          colaborador só acontece com uma confirmação em vermelho.
        </p>
        <p className="mt-2">
          Ao aplicar você escolhe entre <strong>Somar</strong>, que acrescenta o
          que falta e não tira nada, e <strong>Espelhar</strong>, que deixa a
          pessoa igual ao perfil — inclusive tirando o que sobra. O Espelhar
          mostra, nome por nome, o que vai sair antes de você confirmar. Ele
          nunca mexe nas permissões da pessoa em outra revenda.
        </p>
        <p className="mt-2">
          Excluir um perfil daqui não desfaz nada: quem já recebeu continua com
          as permissões, e ajustar pessoa a pessoa em Acessos por Pessoa continua
          possível.
        </p>
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
            const ehColaborador = p.tipo === "colaborador";
            const perms = permsDoPerfil.get(p.id) ?? [];
            const modulosApp = modulosDoPerfil.get(p.id) ?? [];
            const idsDoPerfil = new Set(doPerfil.get(p.id) ?? []);
            const quantos = idsDoPerfil.size;
            const porModulo = agruparPorModulo(perms);

            const quem = pessoas.filter((pessoa) => idsDoPerfil.has(pessoa.id));

            return (
              /* CADA PERFIL FECHADO, pedido do dono (02/09/2026).
                 Um perfil de 46 permissões abria como um muro de 20
                 etiquetas soltas, e dois perfis já enchiam a tela antes
                 de dar para comparar um com o outro. Fechado, a lista é
                 o que ela deveria ser: os nomes dos cargos, com o
                 tamanho de cada um do lado. O perfil aberto na URL
                 (?perfil=) começa aberto -- quem chegou por ele veio ver
                 ele. */
              <details
                key={p.id}
                open={sp.perfil === p.id}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      <span className="mr-1 inline-block text-slate-400 transition-transform group-open:rotate-90">
                        ▸
                      </span>
                      {p.nome}
                    </p>
                    {p.descricao && (
                      <p className="mt-0.5 pl-4 text-xs text-slate-500">{p.descricao}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* O TIPO NA CARA DO PERFIL: é a primeira coisa a saber
                        antes de aplicá-lo em alguém. */}
                    <span
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                        ehColaborador ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ehColaborador ? "📱 Colaborador" : "⚙️ Liderança"}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                      {ehColaborador
                        ? `${modulosApp.length} módulo(s) do app`
                        : `${perms.length} permissão(ões)`}
                    </span>
                    <span className="rounded-lg bg-primary-soft px-2 py-1 text-[11px] font-bold text-primary-dark">
                      {quantos} pessoa(s)
                    </span>
                  </div>
                </summary>

                <div className="border-t border-slate-100 p-4">
                  {/* As permissões pelas MESMAS gavetas da barra lateral.
                      A ordem alfabética de módulo misturava publicar
                      comunicado com cadastrar produto; por gaveta, dá
                      para ver de relance que um perfil é "tudo de
                      Comunicação e nada de Configuração". */}
                  {ehColaborador ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Vê no app
                      </p>
                      {modulosApp.length === 0 ? (
                        <p className="mt-1 text-xs text-slate-500">Nenhum módulo marcado.</p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {modulosApp.map((m) => (
                            <span
                              key={m}
                              className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900"
                            >
                              {rotulosDeModuloApp[m] ?? m}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Não dá acesso ao Modo Liderança: nada aqui cria, edita ou exclui.
                      </p>
                    </div>
                  ) : (
                  <div className="space-y-2">
                    {GRUPOS_DO_ADMIN.map((grupo) => {
                      const doGrupo = [...porModulo].filter(
                        ([modulo]) =>
                          MODULOS.find((m) => m.id === modulo)?.grupo === grupo,
                      );
                      if (doGrupo.length === 0) return null;
                      return (
                        <div key={grupo}>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {grupo}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {doGrupo.map(([modulo, acoes]) => (
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
                        </div>
                      );
                    })}
                    {/* Módulo que saiu do catálogo (renomeado, removido)
                        continua gravado no perfil e não pertence a
                        gaveta nenhuma -- some da tela se não for
                        listado aqui, e some justamente para quem
                        precisa consertá-lo. */}
                    {(() => {
                      const orfaos = [...porModulo].filter(
                        ([modulo]) => !MODULOS.some((m) => m.id === modulo),
                      );
                      if (orfaos.length === 0) return null;
                      return (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">
                            Fora do catálogo
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {orfaos.map(([modulo, acoes]) => (
                              <span
                                key={modulo}
                                className="rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
                                title={acoes.join(", ")}
                              >
                                {modulo}
                                <span className="ml-1 text-amber-500">{acoes.length}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  )}

                  {/* QUEM TEM ESTE PERFIL -- os que ele foi APLICADO A.
                      Não mais "quem tem todas as permissões dele": essa
                      dedução colocava todo administrador dentro de todo
                      perfil pequeno (um admin contém qualquer perfil por
                      definição), e a lista nascia com gente que ninguém
                      informou e que não havia como tirar, porque não
                      existia vínculo para apagar -- era uma conta refeita
                      a cada abertura da tela. Relatado pelo dono em
                      03/09/2026, ao criar o perfil "Conferente". */}
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Quem tem este perfil
                    </p>
                    {quem.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Ninguém ainda — aplique a alguém abaixo.
                      </p>
                    ) : (
                      <>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {quem.map((pessoa) => (
                            <li
                              key={pessoa.id}
                              className="flex items-center gap-1 rounded-lg bg-primary-soft py-1 pl-2 pr-1 text-[11px] font-medium text-primary-dark"
                            >
                              <span>
                                {pessoa.nome}
                                {pessoa.cargo && (
                                  <span className="ml-1 font-normal text-primary">
                                    {pessoa.cargo}
                                  </span>
                                )}
                              </span>
                              {podeEditar && (
                                <BotaoExcluir
                                  action={tirarDoPerfil}
                                  campos={{ perfil_id: p.id, colaborador_id: pessoa.id }}
                                  confirmacao={`Tirar ${pessoa.nome} da lista do perfil "${p.nome}"? Os acessos dela NÃO mudam — só o vínculo com o perfil some.`}
                                  rotuloConfirmar="Tirar do perfil"
                                  perigo={false}
                                  textoEnviando="..."
                                  title={`Tirar ${pessoa.nome} deste perfil (as permissões continuam)`}
                                  className="rounded px-1 leading-none text-primary hover:bg-white/60"
                                >
                                  ✕
                                </BotaoExcluir>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          Tirar daqui desfaz só o vínculo — as permissões da
                          pessoa continuam. Para removê-las, use Acessos por
                          Pessoa.
                        </p>
                      </>
                    )}
                  </div>

                  {podeEditar && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Link
                        href={
                          emEdicao?.id === p.id
                            ? "/admin/perfis-de-acesso"
                            : `/admin/perfis-de-acesso?perfil=${p.id}`
                        }
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {emEdicao?.id === p.id
                          ? "↑ Fechar as permissões"
                          : "Editar permissões →"}
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

                  {/* A GRADE ABRE AQUI DENTRO, na caixa do próprio perfil.
                      Ela morava no fim da página, depois da lista inteira:
                      editar o T3 abria as configurações dele lá embaixo,
                      com os outros perfis no meio do caminho (relatado
                      pelo dono em 03/09/2026). Duas coisas ligadas em
                      lugares distantes, e nada dizendo que uma era da
                      outra. */}
                  {podeEditar && emEdicao?.id === p.id && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <GradeDePermissoes
                        perfil={p}
                        tipo={p.tipo}
                        alcance={alcance}
                        marcadas={marcadas}
                        modulosMarcados={modulosMarcados}
                        modulosApp={modulosAppDaRevenda}
                        noPerfil={(doPerfil.get(p.id) ?? []).map((id) => {
                          const nome = pessoas.find((x) => x.id === id)?.nome ?? "sem nome";
                          // O que essa pessoa perderia num salvar de
                          // AGORA, sem mexer em nada: o que ela tem, o
                          // molde salvo não tem e nenhum outro perfil
                          // dela sustenta.
                          if (ehColaborador) {
                            const escudo = modulosProtegidos(id, p.id);
                            return {
                              nome,
                              perderia: (modulosDaPessoa[id] ?? [])
                                .filter((m) => !modulosMarcados.has(m) && !escudo.has(m))
                                .map((m) => rotulosDeModuloApp[m] ?? m),
                            };
                          }
                          const escudo = protegidoPor(id, p.id);
                          return {
                            nome,
                            perderia: (jaTem[id] ?? [])
                              .filter((c) => !marcadas.has(c) && !escudo.has(c))
                              .map((c) => rotulosDeConcessao[c] ?? c),
                          };
                        })}
                      />
                    </div>
                  )}
                </div>

                {podeEditar && (
                  <div className="border-t border-slate-100 bg-slate-50/60">
                    <AplicarPerfil
                      action={aplicarPerfil}
                      perfilId={p.id}
                      perfilNome={p.nome}
                      pessoas={pessoas}
                      tipo={p.tipo}
                      papelDe={papelDe}
                      doPerfil={
                        ehColaborador ? modulosApp : perms.map((c) => `${c.modulo}:${c.acao}`)
                      }
                      jaTem={ehColaborador ? modulosDaPessoa : jaTem}
                      rotulos={ehColaborador ? rotulosDeModuloApp : rotulosDeConcessao}
                      // Espelhar retira acessos: só o Admin (11/09/2026).
                      podeEspelhar={dono}
                    />
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}

      {/* ---------- CRIAR A PARTIR DE UMA PESSOA ---------- */}
      {podeEditar && !emEdicao && !criandoNovo && (
        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white" open={perfis.length === 0}>
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
            👤 Criar a partir de uma pessoa{" "}
            <span className="font-normal text-slate-400">(perfil de liderança)</span>
          </summary>
          <form action={criarPerfilDePessoa} className="space-y-3 border-t border-slate-100 p-4">
            <p className="text-xs text-slate-500">
              Copia as permissões de Modo Liderança que alguém já tem, e o perfil nasce do tipo
              ⚙️ Liderança. Para os módulos que um colaborador vê no app, monte um perfil 📱
              Colaborador do zero.
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

      {/* O TIPO SE ESCOLHE AQUI, antes de qualquer marcação -- e não
          muda depois. São duas portas porque são duas perguntas
          diferentes: "o que a pessoa vê no app?" e "o que ela gerencia?". */}
      {podeEditar && !emEdicao && !criandoNovo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/perfis-de-acesso?novo=colaborador"
            className="block rounded-2xl border border-dashed border-emerald-300 p-4 hover:border-emerald-500 hover:bg-emerald-50/50"
          >
            <span className="block text-sm font-bold text-emerald-800">+ 📱 Perfil de colaborador</span>
            <span className="mt-1 block text-xs leading-snug text-slate-500">
              Quais módulos a pessoa vê no app. Ela continua colaborador — não entra no Modo
              Liderança. Ex.: Motorista, Ajudante.
            </span>
          </Link>
          <Link
            href="/admin/perfis-de-acesso?novo=lideranca"
            className="block rounded-2xl border border-dashed border-amber-300 p-4 hover:border-amber-500 hover:bg-amber-50/50"
          >
            <span className="block text-sm font-bold text-amber-800">+ ⚙️ Perfil de liderança</span>
            <span className="mt-1 block text-xs leading-snug text-slate-500">
              O que a pessoa pode ver, criar, editar e excluir no Modo Liderança. Ex.: Supervisor,
              Analista de Rota.
            </span>
          </Link>
        </div>
      )}

      {/* ---------- GRADE DE PERMISSÕES, SÓ PARA O PERFIL NOVO ----------
          Editar um perfil EXISTENTE não desenha nada aqui embaixo: a
          grade dele abre dentro da própria caixa dele, lá em cima (ver
          GradeDePermissoes). Era este bloco que produzia o defeito que o
          dono descreveu em 03/09/2026 -- clicar em "Editar permissões" do
          T3 abria a grade no fim da página, depois da lista inteira, e
          entre o perfil e as configurações dele ficavam os outros perfis.
          A tela mostrava duas coisas ligadas em lugares distantes, e nada
          dizia que uma era da outra. */}
      {podeEditar && tipoNovo && (
        <GradeDePermissoes
          tipo={tipoNovo}
          alcance={alcance}
          marcadas={marcadas}
          modulosMarcados={modulosMarcados}
          modulosApp={modulosAppDaRevenda}
        />
      )}
    </div>
  );
}

/**
 * O formulário de permissões -- o mesmo para criar e para editar.
 *
 * Recebe `perfil` quando está editando, e aí o `id` escondido faz a ação
 * atualizar em vez de criar. Sem ele, é um perfil novo.
 */
function GradeDePermissoes({
  perfil,
  tipo,
  marcadas,
  modulosMarcados,
  modulosApp,
  noPerfil = [],
  alcance = null,
}: {
  /** O que quem edita pode marcar num perfil de liderança. Nulo = o Admin. */
  alcance?: Set<string> | null;
  perfil?: Perfil;
  tipo: TipoDePerfil;
  marcadas: Set<string>;
  /** Os módulos do app já marcados (perfil de colaborador). */
  modulosMarcados: Set<string>;
  /** Os módulos do app que esta revenda tem ligados. */
  modulosApp: string[];
  /** Quem está neste perfil e o que cada um perderia num salvar de agora. */
  noPerfil?: { nome: string; perderia: string[] }[];
}) {
  const emEdicao = perfil ?? null;
  const perdendo = noPerfil.filter((p) => p.perderia.length > 0);
  const ehColaborador = tipo === "colaborador";

  return (
        <form action={salvarPerfil} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
          {/* Na edição o servidor lê o tipo do banco e ignora este campo --
              o tipo não muda depois de criado. */}
          <input type="hidden" name="tipo" value={tipo} />
          {alcance && tipo === "lideranca" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              🔐 Só dá para marcar o que <strong>você mesmo tem</strong> nesta revenda. O que
              aparecer travado fica como está no perfil. A gestão de acessos nunca entra num perfil
              montado por aqui.
            </p>
          )}

          <p
            className={`rounded-xl px-3 py-2 text-xs leading-snug ${
              ehColaborador ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
            }`}
          >
            {ehColaborador ? (
              <>
                <strong>📱 Perfil de colaborador.</strong> Marque os módulos que a pessoa vê no
                app. Ela continua colaborador: não entra no Modo Liderança, e não cria, edita
                nem exclui nada da gestão.
              </>
            ) : (
              <>
                <strong>⚙️ Perfil de liderança.</strong> Cada linha é uma ação no Modo Liderança —
                ver, criar, editar, excluir. Marque só o que o cargo precisa: quem tem só
                &quot;ver&quot; abre a tela e não recebe botão de editar nem de excluir.
              </>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="nome">Nome do perfil</label>
              <input
                id="nome"
                name="nome"
                required
                defaultValue={emEdicao?.nome ?? ""}
                placeholder={ehColaborador ? "Ex.: Motorista" : "Ex.: Supervisor de Armazém"}
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

          {ehColaborador ? (
            modulosApp.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Esta revenda não tem nenhum módulo opcional ligado — não há o que liberar.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {modulosApp.map((id) => {
                  const m = moduloPorId(id);
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 has-[:checked]:border-emerald-400 has-[:checked]:bg-emerald-50"
                    >
                      <input
                        type="checkbox"
                        name={`app-${id}`}
                        defaultChecked={modulosMarcados.has(id)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
                      />
                      <span>
                        {m?.emoji} {m?.rotulo ?? id}
                      </span>
                    </label>
                  );
                })}
              </div>
            )
          ) : (
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
                        {/* A MESMA LÍNGUA DA TELA DE ACESSOS: cada ação diz
                            o que destrava neste módulo, e não "Criar/
                            Editar". Duas telas que gravam a mesma linha não
                            podem chamá-la por nomes diferentes. */}
                        <div className="mt-2 space-y-1.5">
                          {m.acoes.map((acao) => (
                            <label
                              key={acao}
                              className="flex items-start gap-2 text-xs leading-snug text-slate-600"
                            >
                              <input
                                type="checkbox"
                                name={`perm-${m.id}-${acao}`}
                                defaultChecked={marcadas.has(`${m.id}:${acao}`)}
                                disabled={!!alcance && !alcance.has(`${m.id}:${acao}`)}
                                title={
                                  alcance && !alcance.has(`${m.id}:${acao}`)
                                    ? "Fora do seu alcance: você não tem esta permissão nesta revenda"
                                    : undefined
                                }
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary disabled:opacity-40"
                              />
                              <span>
                                {rotuloDaAcaoNoModulo(m, acao)}
                                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                                  {ROTULO_ACAO[acao] ?? acao}
                                </span>
                              </span>
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
          )}

          {/* O ALCANCE DO SALVAR, ANTES DE SALVAR. Quem mexe no molde
              precisa saber que o clique alcança gente -- e quem. Dizer isso
              só na mensagem de sucesso é avisar depois do fato, e desde
              que salvar também RETIRA, o depois do fato é tarde. */}
          {emEdicao && noPerfil.length > 0 && (
            <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              <p>
                ⚡ Salvar deixa as{" "}
                <strong>
                  {noPerfil.length} pessoa{noPerfil.length > 1 ? "s" : ""}
                </strong>{" "}
                deste perfil <strong>iguais ao molde</strong>: o que você marcar entra, e o que
                estiver desmarcado sai. Salvar nunca muda o papel de ninguém.
              </p>
              {perdendo.length > 0 && (
                <details className="rounded-lg bg-white/70 px-2 py-1.5">
                  <summary className="cursor-pointer font-semibold">
                    ⚠️ {perdendo.length} pessoa{perdendo.length > 1 ? "s" : ""} tem acesso fora
                    deste molde — ver o que sairia
                  </summary>
                  <ul className="mt-1 space-y-1 pl-1">
                    {perdendo.map((p) => (
                      <li key={p.nome}>
                        <strong>{p.nome}</strong> perde: {p.perderia.slice(0, 6).join("; ")}
                        {p.perderia.length > 6 && ` e mais ${p.perderia.length - 6}`}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">
                    Quem acumula função deve estar em <strong>dois perfis</strong> — o que sobra
                    num está no outro, e nada some.
                  </p>
                </details>
              )}
            </div>
          )}

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
  );
}
