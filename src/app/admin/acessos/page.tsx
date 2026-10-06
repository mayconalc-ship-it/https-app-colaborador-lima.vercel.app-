import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { podeNoModulo } from "@/lib/require-admin";
import { exigirTelaDeAcessos } from "@/lib/gestao-de-acessos-server";
import { MODULO_ACESSOS } from "@/lib/gestao-de-acessos";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { AbasDeAcesso, type AbaDeAcesso } from "@/components/admin/AbasDeAcesso";
import { BarraDaRevenda } from "@/components/admin/BarraDaRevenda";
import { ListaDePessoas, type PessoaDaLista } from "@/components/admin/ListaDePessoas";
import { MODULOS, MODULOS_OPCIONAIS, ROTULO_PAPEL, moduloPorId, type Papel } from "@/lib/acessos";
import { PAINEIS } from "@/lib/gestao";
import { resumoDeOrigem, type ConteudoDosPerfis, type PerfilResumido } from "@/lib/ficha-de-acesso";
import { nomeCurtoRevenda } from "@/lib/revenda-sigla";
import { liberarAcessosEmLote, liberarAnalisesEmLote } from "./actions";
import { ComMarcas } from "@/components/Icone";

export const dynamic = "force-dynamic";

/**
 * GESTÃO DE ACESSOS -- a lista de pessoas (aba padrão) e as grades em
 * massa (?aba=modulos).
 *
 * REDESENHO DE 05/10/2026, pedido do dono: "até hoje acho ele muito
 * complexo de entender... o que há de melhor hoje em sistema e mais
 * moderno em liberar acessos, coloque no meu app", e "a revenda fica
 * embaixo e às vezes acho que estou mexendo em um ambiente e é outro".
 *
 * O desenho é o dos consoles de acesso atuais (Entra, Okta, Google
 * Workspace): um DIRETÓRIO de pessoas com busca, e uma FICHA por pessoa
 * (/admin/acessos/[id]) que mostra cada acesso com a ORIGEM -- do perfil,
 * ou individual. O que saiu daqui: a sanfona por liderança (virou a
 * ficha), o "Tornar alguém liderança" (está no Papel da ficha) e a fileira
 * de revendas no meio da tela (virou a faixa colorida do topo, que é a
 * revenda do app inteiro).
 */
export default async function GestaoDeAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    filtro?: string;
    area?: string;
    funcao?: string;
    papel?: string;
    revendaExtra?: string;
    aba?: string;
  }>;
}) {
  const {
    erro,
    sucesso,
    filtro = "",
    area: areaFiltro = "",
    funcao: funcaoFiltro = "",
    papel: papelFiltro = "",
    revendaExtra: revendaExtraFiltro = "",
    aba,
  } = await searchParams;

  // QUEM ENTRA AQUI (11/09/2026): o Admin, e a liderança que tem o módulo
  // de acessos naquela revenda -- e só nas revendas em que tem.
  const { eu, dono, podeEditar, revendas, escolhida, revendaDoApp } = await exigirTelaDeAcessos();

  const abaAtual: AbaDeAcesso = aba === "modulos" ? "modulos" : "pessoa";
  const admin = createAdminClient();
  // A aba de Perfis tem porta própria (`perfis-acesso`): some para quem
  // não a tem, em vez de levar a um "sem permissão".
  const mostrarPerfis = dono || (await podeNoModulo("perfis-acesso", "ver"));

  const [
    { data: pessoas },
    { data: permissoes },
    { data: vinculos },
    { data: modulosAtivos },
    { data: extras },
    { data: vinculosOutras },
    { data: perfisBanco },
    { data: perfilPessoas },
    { data: gestores },
  ] = await Promise.all([
    admin.from("profiles").select("id, nome, cpf, cargo, area, role").order("nome", { ascending: true }),
    admin.from("lideranca_permissoes").select("colaborador_id, modulo, acao").eq("revenda_id", escolhida.id),
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", escolhida.id),
    admin.from("revenda_modulos").select("modulo").eq("revenda_id", escolhida.id).eq("ativo", true),
    admin.from("colaborador_modulos_extra").select("colaborador_id, modulo").eq("revenda_id", escolhida.id),
    // Vínculo com OUTRAS revendas -- o selo "também em Barreiras" e o
    // filtro da grade.
    admin.from("colaborador_revendas").select("colaborador_id, revendas!inner(id, nome)").neq("revenda_id", escolhida.id),
    admin.from("perfis_acesso").select("id, nome, tipo").eq("revenda_id", escolhida.id).order("nome"),
    admin.from("perfil_pessoas").select("perfil_id, colaborador_id").eq("revenda_id", escolhida.id),
    // Quem também gerencia acessos -- a ficha dessa pessoa só o Admin
    // altera, e a lista mostra o cadeado antes do clique.
    dono
      ? Promise.resolve({ data: [] as { colaborador_id: string }[] })
      : admin.from("lideranca_permissoes").select("colaborador_id").eq("modulo", MODULO_ACESSOS),
  ]);

  const ativos = new Set((modulosAtivos ?? []).map((x) => x.modulo as string));
  const daRevenda = new Set((vinculos ?? []).map((v) => v.colaborador_id as string));
  const todas = (pessoas ?? []) as {
    id: string;
    nome: string | null;
    cpf: string | null;
    cargo: string | null;
    area: string | null;
    role: string;
  }[];
  const baseRoster = todas.filter((p) => p.role !== "owner" && daRevenda.has(p.id));

  const porPessoa = new Map<string, Set<string>>();
  for (const p of permissoes ?? []) {
    if (!porPessoa.has(p.colaborador_id)) porPessoa.set(p.colaborador_id, new Set());
    porPessoa.get(p.colaborador_id)!.add(`${p.modulo}:${p.acao}`);
  }
  const extrasPorPessoa = new Map<string, Set<string>>();
  for (const e of extras ?? []) {
    if (!extrasPorPessoa.has(e.colaborador_id)) extrasPorPessoa.set(e.colaborador_id, new Set());
    extrasPorPessoa.get(e.colaborador_id)!.add(e.modulo);
  }

  // Outras revendas de cada pessoa -- selo informativo e filtro.
  const outrasRevendasPorPessoa = new Map<string, { id: string; nome: string }[]>();
  for (const v of vinculosOutras ?? []) {
    const r = (Array.isArray(v.revendas) ? v.revendas[0] : v.revendas) as { id: string; nome: string };
    if (!r) continue;
    outrasRevendasPorPessoa.set(v.colaborador_id, [...(outrasRevendasPorPessoa.get(v.colaborador_id) ?? []), r]);
  }

  const voltaDaTela = abaAtual === "modulos" ? "/admin/acessos?aba=modulos" : "/admin/acessos";
  const avisoDaBarra = revendaDoApp
    ? `O resto do app está em ${revendaDoApp} — aqui você gerencia ${escolhida.nome}.`
    : undefined;

  return (
    <div>
      <BarraDaRevenda atual={escolhida} revendas={revendas} volta={voltaDaTela} aviso={avisoDaBarra} />

      <PageHeader title="🔐 Gestão de Acessos" subtitle="Quem pode o quê no app e no Modo Liderança." />

      <AbasDeAcesso atual={abaAtual} mostrarPerfis={mostrarPerfis} />

      {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(erro)}</p>}
      {sucesso && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">✅ {decodificar(sucesso)}</p>}

      {/* AS REGRAS DE QUEM NÃO É O ADMIN, ditas antes de qualquer caixa
          (11/09/2026). Descobrir o limite pelo erro seria a pior forma. */}
      {!dono && (
        <details className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <summary className="cursor-pointer text-sm font-semibold">
            🔐 {eu.nome} — {podeEditar ? "gestão" : "consulta"} de acessos em {escolhida.nome}
          </summary>
          {podeEditar ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-snug">
              <li>
                Você só dá e só tira o que <strong>você mesmo tem</strong> em {escolhida.nome}. O que estiver
                fora disso aparece travado e fica como está.
              </li>
              <li>A gestão de acessos não se repassa: só o Admin libera esta tela para alguém.</li>
              <li>Não dá para mexer na sua própria ficha, nem na de quem também gerencia acessos (🔒).</li>
              <li>“Deixar igual ao perfil” retira acessos e fica com o Admin.</li>
              <li>Toda alteração fica registrada no Log de Auditoria, com o seu nome.</li>
            </ul>
          ) : (
            <p className="mt-1 text-xs leading-snug">
              Você pode consultar as fichas e as grades, mas não alterar nada. Para alterar, peça ao Admin a
              permissão de editar a Gestão de Acessos.
            </p>
          )}
        </details>
      )}

      {abaAtual === "pessoa" ? (
        <AbaPessoas
          baseRoster={baseRoster}
          porPessoa={porPessoa}
          extrasPorPessoa={extrasPorPessoa}
          outrasRevendasPorPessoa={outrasRevendasPorPessoa}
          perfisBanco={(perfisBanco ?? []) as { id: string; nome: string; tipo: string }[]}
          perfilPessoas={(perfilPessoas ?? []) as { perfil_id: string; colaborador_id: string }[]}
          ativos={ativos}
          travaDe={(id) =>
            !podeEditar
              ? "Você pode consultar, mas não alterar."
              : id === eu.id
                ? "É você: os seus acessos só o Admin altera."
                : (gestores ?? []).some((g) => g.colaborador_id === id)
                  ? "Também gerencia acessos: só o Admin altera."
                  : null
          }
        />
      ) : (
        <AbaEmMassa
          revendaId={escolhida.id}
          revendaNome={escolhida.nome}
          podeEditar={podeEditar}
          baseRoster={baseRoster}
          porPessoa={porPessoa}
          extrasPorPessoa={extrasPorPessoa}
          outrasRevendasPorPessoa={outrasRevendasPorPessoa}
          ativos={ativos}
          filtros={{ filtro, areaFiltro, funcaoFiltro, papelFiltro, revendaExtraFiltro }}
        />
      )}

      <p className="mt-6 text-xs text-slate-400">Toda alteração feita aqui fica registrada no Log de Auditoria.</p>
    </div>
  );
}

type Pessoa = { id: string; nome: string | null; cpf: string | null; cargo: string | null; area: string | null; role: string };

/** A aba padrão: todo mundo da revenda, com a ficha a um toque. */
async function AbaPessoas({
  baseRoster,
  porPessoa,
  extrasPorPessoa,
  outrasRevendasPorPessoa,
  perfisBanco,
  perfilPessoas,
  ativos,
  travaDe,
}: {
  baseRoster: Pessoa[];
  porPessoa: Map<string, Set<string>>;
  extrasPorPessoa: Map<string, Set<string>>;
  outrasRevendasPorPessoa: Map<string, { id: string; nome: string }[]>;
  perfisBanco: { id: string; nome: string; tipo: string }[];
  perfilPessoas: { perfil_id: string; colaborador_id: string }[];
  ativos: Set<string>;
  travaDe: (id: string) => string | null;
}) {
  const admin = createAdminClient();
  const perfis: PerfilResumido[] = perfisBanco.map((p) => ({
    id: p.id,
    nome: p.nome,
    tipo: p.tipo === "colaborador" ? "colaborador" : "lideranca",
  }));
  const ids = perfis.map((p) => p.id);
  const [{ data: concessoes }, { data: modulosApp }] = await Promise.all([
    ids.length > 0
      ? admin.from("perfil_permissoes").select("perfil_id, modulo, acao").in("perfil_id", ids)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? admin.from("perfil_modulos_app").select("perfil_id, modulo").in("perfil_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const conteudo: ConteudoDosPerfis = { concessoes: new Map(), modulosApp: new Map() };
  for (const c of (concessoes ?? []) as { perfil_id: string; modulo: string; acao: string }[]) {
    conteudo.concessoes.set(c.perfil_id, [...(conteudo.concessoes.get(c.perfil_id) ?? []), `${c.modulo}:${c.acao}`]);
  }
  for (const m of (modulosApp ?? []) as { perfil_id: string; modulo: string }[]) {
    conteudo.modulosApp.set(m.perfil_id, [...(conteudo.modulosApp.get(m.perfil_id) ?? []), m.modulo]);
  }
  const perfisDaPessoa = new Map<string, PerfilResumido[]>();
  for (const v of perfilPessoas) {
    const perfil = perfis.find((p) => p.id === v.perfil_id);
    if (perfil) perfisDaPessoa.set(v.colaborador_id, [...(perfisDaPessoa.get(v.colaborador_id) ?? []), perfil]);
  }

  const linhas: PessoaDaLista[] = baseRoster.map((p) => {
    const ehLideranca = p.role === "lideranca";
    const app = [...(extrasPorPessoa.get(p.id) ?? [])].filter((m) => ativos.has(m));
    const perms = porPessoa.get(p.id) ?? new Set<string>();
    const meus = perfisDaPessoa.get(p.id) ?? [];
    const origem = resumoDeOrigem({
      ehLideranca,
      modulosApp: app,
      permissoes: perms,
      perfis: meus,
      conteudo,
      modulosDaRevenda: ativos,
    });
    return {
      id: p.id,
      nome: p.nome ?? "sem nome",
      cargo: p.cargo,
      area: p.area,
      papel: ehLideranca ? "lideranca" : "colaborador",
      perfis: meus.map((x) => x.nome),
      individuais: origem.individuaisApp.length + origem.individuaisPermissoes.length,
      faltando: origem.faltandoApp.length + origem.faltandoPermissoes.length,
      acessos: app.length + (ehLideranca ? perms.size : 0),
      outrasRevendas: (outrasRevendasPorPessoa.get(p.id) ?? []).map((r) => nomeCurtoRevenda(r.nome)),
      travada: travaDe(p.id),
    };
  });

  return (
    <>
      <ListaDePessoas pessoas={linhas} />
      <LinkDoGuia slug="tornar-lideranca" className="mt-4" />
    </>
  );
}

/**
 * AS GRADES EM MASSA -- módulos do app e análises da Gestão, várias
 * pessoas de uma vez. O mesmo gesto de sempre (um quadradinho por pessoa e
 * coluna, um botão no fim), para quem vai liberar a mesma coisa para
 * muita gente. Cada pessoa, em detalhe, é na ficha.
 */
function AbaEmMassa({
  revendaId,
  revendaNome,
  podeEditar,
  baseRoster,
  porPessoa,
  extrasPorPessoa,
  outrasRevendasPorPessoa,
  ativos,
  filtros: { filtro, areaFiltro, funcaoFiltro, papelFiltro, revendaExtraFiltro },
}: {
  revendaId: string;
  revendaNome: string;
  podeEditar: boolean;
  baseRoster: Pessoa[];
  porPessoa: Map<string, Set<string>>;
  extrasPorPessoa: Map<string, Set<string>>;
  outrasRevendasPorPessoa: Map<string, { id: string; nome: string }[]>;
  ativos: Set<string>;
  filtros: {
    filtro: string;
    areaFiltro: string;
    funcaoFiltro: string;
    papelFiltro: string;
    revendaExtraFiltro: string;
  };
}) {
  const termoTabela = filtro.trim().toLowerCase();
  // Módulos opcionais que a revenda nem tem ligado não aparecem como
  // coluna: liberar um módulo desligado prometeria um acesso que a tela
  // dele não vai mostrar.
  const modulosOpcionaisDaRevenda = MODULOS_OPCIONAIS.filter((m) => ativos.has(m));
  const modulos = MODULOS.filter((m) => ativos.has(m.id));
  // As análises que ESTA revenda tem -- as colunas da grade e o bloco da
  // ficha saem daqui, para as duas nunca discordarem sobre o que existe.
  const analisesDaRevenda = PAINEIS.filter((p) => modulos.some((m) => m.id === p.modulo));
  const liderancas = baseRoster.filter((p) => p.role === "lideranca");

  // As opções dos seletores de Área e Função vêm de quem já está na
  // revenda -- oferecer valor que ninguém daqui tem só confundiria.
  const areasDisponiveis = [...new Set(baseRoster.map((p) => p.area).filter((v): v is string => !!v?.trim()))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const funcoesDisponiveis = [...new Set(baseRoster.map((p) => p.cargo).filter((v): v is string => !!v?.trim()))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const revendasDisponiveisParaFiltro = [
    ...new Map([...outrasRevendasPorPessoa.values()].flat().map((r) => [r.id, r])).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const roster = baseRoster.filter(
    (p) =>
      (!termoTabela || p.nome?.toLowerCase().includes(termoTabela) || (p.cpf ?? "").includes(termoTabela)) &&
      (!areaFiltro || p.area === areaFiltro) &&
      (!funcaoFiltro || p.cargo === funcaoFiltro) &&
      (!papelFiltro || p.role === papelFiltro) &&
      (!revendaExtraFiltro || (outrasRevendasPorPessoa.get(p.id) ?? []).some((r) => r.id === revendaExtraFiltro)),
  );

  // Agrupa colunas contíguas do mesmo "módulo guarda-chuva" (as
  // funcionalidades de Produtividade do Armazém) sob um cabeçalho comum.
  const gruposDeColunas: { rotuloGrupo: string | null; modulos: string[] }[] = [];
  for (const m of modulosOpcionaisDaRevenda) {
    const pai = moduloPorId(m)?.subGrupoDe;
    const rotuloGrupo = pai ? (moduloPorId(pai)?.rotulo ?? null) : null;
    const ultimo = gruposDeColunas[gruposDeColunas.length - 1];
    if (ultimo && ultimo.rotuloGrupo === rotuloGrupo) ultimo.modulos.push(m);
    else gruposDeColunas.push({ rotuloGrupo, modulos: [m] });
  }

  return (
    <>
      <section className="mb-6">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          📱 Módulos do app em {revendaNome}
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Os cartões que ficam escondidos até serem liberados. Vale para qualquer papel. Marque quantos quiser e
          grave tudo de uma vez no botão do fim.
        </p>

        {modulosOpcionaisDaRevenda.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Esta revenda ainda não tem nenhum módulo opcional ligado.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <form method="get" className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
              {/* Sem isto, filtrar jogava de volta na aba das pessoas. */}
              <input type="hidden" name="aba" value="modulos" />
              <input
                name="filtro"
                defaultValue={filtro}
                placeholder="Buscar por nome ou CPF"
                className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 p-2.5 text-sm focus:border-primary focus:outline-none"
              />
              <select
                name="area"
                defaultValue={areaFiltro}
                className="min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todas as áreas</option>
                {areasDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                name="funcao"
                defaultValue={funcaoFiltro}
                className="min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todas as funções</option>
                {funcoesDisponiveis.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                name="papel"
                defaultValue={papelFiltro}
                className="min-w-[8rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todos os papéis</option>
                <option value="colaborador">Colaborador</option>
                <option value="lideranca">Liderança</option>
              </select>
              {revendasDisponiveisParaFiltro.length > 0 && (
                <select
                  name="revendaExtra"
                  defaultValue={revendaExtraFiltro}
                  className="min-w-[10rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Qualquer vínculo extra</option>
                  {revendasDisponiveisParaFiltro.map((r) => (
                    <option key={r.id} value={r.id}>
                      Também em {r.nome}
                    </option>
                  ))}
                </select>
              )}
              <button type="submit" className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">
                Filtrar
              </button>
              {(termoTabela || areaFiltro || funcaoFiltro || papelFiltro || revendaExtraFiltro) && (
                <Link
                  href="/admin/acessos?aba=modulos"
                  className="flex items-center rounded-xl px-3 text-sm font-medium text-slate-500 hover:text-primary"
                >
                  Limpar
                </Link>
              )}
            </form>
            <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">
              {roster.length} pessoa(s) encontrada(s).
            </p>

            <form action={liberarAcessosEmLote}>
              <input type="hidden" name="revenda" value={revendaId} />
              {/* Quem só consulta vê a grade, com tudo travado: o fieldset
                  desabilita de uma vez cada caixa e o botão. */}
              <fieldset disabled={!podeEditar} className="contents">
                <div className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th
                          rowSpan={2}
                          className="sticky left-0 z-20 min-w-[11rem] bg-slate-50 p-3 align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                        >
                          Pessoa
                        </th>
                        {gruposDeColunas.map((g, i) => (
                          <th
                            key={i}
                            colSpan={g.modulos.length}
                            className={`bg-slate-50 p-1.5 text-center text-[10px] font-semibold normal-case tracking-normal text-slate-400 ${
                              g.rotuloGrupo ? "border-b border-slate-200" : ""
                            }`}
                          >
                            {g.rotuloGrupo ?? ""}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {modulosOpcionaisDaRevenda.map((m) => (
                          <th key={m} className="w-16 bg-slate-50 p-2 text-center" title={moduloPorId(m)?.rotulo}>
                            <span className="block text-base leading-none">
                              <ComMarcas texto={moduloPorId(m)?.emoji ?? ""} />
                            </span>
                            <span className="mt-1 block truncate text-[9px] normal-case leading-tight text-slate-400">
                              {moduloPorId(m)?.rotulo}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.length === 0 ? (
                        <tr>
                          <td colSpan={modulosOpcionaisDaRevenda.length + 1} className="p-6 text-center text-sm text-slate-400">
                            Ninguém encontrado.
                          </td>
                        </tr>
                      ) : (
                        roster.map((p) => {
                          const minhasExtras = extrasPorPessoa.get(p.id) ?? new Set<string>();
                          const outras = outrasRevendasPorPessoa.get(p.id) ?? [];
                          return (
                            <tr key={p.id} className="border-t border-slate-100">
                              <td className="sticky left-0 z-10 min-w-[11rem] bg-white p-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                                <p className="font-medium text-slate-800">
                                  <Link
                                    href={`/admin/acessos/${p.id}`}
                                    className="hover:text-primary hover:underline"
                                    title={`Abrir a ficha de ${p.nome}`}
                                  >
                                    {p.nome}
                                  </Link>
                                  {outras.length > 0 && (
                                    <span
                                      className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                                      title={`Também em ${outras.map((r) => r.nome).join(", ")}`}
                                    >
                                      +{outras.length}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {ROTULO_PAPEL[p.role as Papel] ?? p.role}
                                  {p.area ? ` · ${p.area}` : ""}
                                  {p.cargo ? ` · ${p.cargo}` : ""}
                                </p>
                              </td>
                              {modulosOpcionaisDaRevenda.map((m) => (
                                <td key={m} className="w-16 p-2 text-center">
                                  <input type="hidden" name="universo" value={`${p.id}:${m}`} />
                                  <input
                                    type="checkbox"
                                    name="marcado"
                                    value={`${p.id}:${m}`}
                                    defaultChecked={minhasExtras.has(m)}
                                    aria-label={`${moduloPorId(m)?.rotulo} para ${p.nome}`}
                                    className="h-5 w-5 cursor-pointer rounded border-slate-300 text-primary"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 p-3">
                  <BotaoEnviar
                    textoEnviando="Aplicando..."
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
                  >
                    ✅ Gravar módulos em {nomeCurtoRevenda(revendaNome)}
                  </BotaoEnviar>
                </div>
              </fieldset>
            </form>
          </div>
        )}
      </section>

      {/*
        A MESMA GRADE, PARA AS ANÁLISES (pedido do dono, 05/09/2026).

        NÃO PELA TABELA DE OPCIONAIS: três das análises usam módulos que já
        estão lá e carregam outra coisa junto. Grade separada resolve sem
        nenhum desses efeitos. E ela grava nas mesmas linhas da ficha
        (`lideranca_permissoes`, ação "ver") -- marcar aqui é idêntico a
        ligar a análise na ficha da pessoa.

        SÓ LIDERANÇA, decisão do dono entre as três opções (05/09/2026).
      */}
      {analisesDaRevenda.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            📊 Análises da Gestão em {revendaNome}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Os relatórios que a pessoa passa a ver <strong>na própria home</strong>. Só aparece quem já é
            liderança — para tornar alguém liderança, abra a ficha dele na aba Pessoas.
          </p>

          {liderancas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Nenhuma liderança nesta revenda ainda.
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/30 bg-white shadow-sm">
              <form action={liberarAnalisesEmLote}>
                <input type="hidden" name="revenda" value={revendaId} />
                <fieldset disabled={!podeEditar} className="contents">
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-20 bg-primary-soft/40 text-left text-xs uppercase text-slate-500">
                        <tr>
                          <th className="sticky left-0 z-20 min-w-[11rem] bg-primary-soft/40 p-3 align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                            Liderança
                          </th>
                          {analisesDaRevenda.map((p) => (
                            <th key={p.id} className="w-20 bg-primary-soft/40 p-2 text-center align-bottom" title={p.pergunta}>
                              <span className="block text-base leading-none">
                                <ComMarcas texto={p.emoji ?? ""} />
                              </span>
                              <span className="mt-1 block text-[9px] normal-case leading-tight text-slate-500">
                                {p.rotulo}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liderancas.map((pessoa) => {
                          const minhas = porPessoa.get(pessoa.id) ?? new Set<string>();
                          return (
                            <tr key={pessoa.id} className="border-t border-slate-100">
                              <td className="sticky left-0 z-10 min-w-[11rem] bg-white p-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                                <p className="font-medium text-slate-800">
                                  <Link
                                    href={`/admin/acessos/${pessoa.id}`}
                                    className="hover:text-primary hover:underline"
                                    title={`Abrir a ficha de ${pessoa.nome}`}
                                  >
                                    {pessoa.nome}
                                  </Link>
                                </p>
                                <p className="text-xs text-slate-400">
                                  {pessoa.area ?? ""}
                                  {pessoa.cargo ? ` · ${pessoa.cargo}` : ""}
                                </p>
                              </td>
                              {analisesDaRevenda.map((painel) => {
                                const m = moduloPorId(painel.modulo)!;
                                // QUEM ADMINISTRA O MÓDULO JÁ VÊ, e a célula
                                // diz isso em vez de mentir que está
                                // desmarcada. A mudança se faz na ficha.
                                const administra = m.acoes.some((a) => a !== "ver" && minhas.has(`${m.id}:${a}`));
                                return (
                                  <td key={painel.id} className="w-20 p-2 text-center">
                                    {administra ? (
                                      <span
                                        className="text-base"
                                        title={`Já vê porque administra ${m.rotulo}. Para mudar, use a ficha da pessoa.`}
                                      >
                                        🔒
                                      </span>
                                    ) : (
                                      <>
                                        <input type="hidden" name="universo" value={`${pessoa.id}:${m.id}`} />
                                        <input
                                          type="checkbox"
                                          name="marcado"
                                          value={`${pessoa.id}:${m.id}`}
                                          defaultChecked={minhas.has(`${m.id}:ver`)}
                                          aria-label={`${painel.rotulo} para ${pessoa.nome}`}
                                          className="h-5 w-5 cursor-pointer rounded border-slate-300 text-primary"
                                        />
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-3">
                    <BotaoEnviar
                      textoEnviando="Aplicando..."
                      className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
                    >
                      ✅ Gravar análises em {nomeCurtoRevenda(revendaNome)}
                    </BotaoEnviar>
                    <p className="text-xs text-slate-400">🔒 = já vê porque administra o módulo. Muda na ficha da pessoa.</p>
                  </div>
                </fieldset>
              </form>
            </div>
          )}
        </section>
      )}
    </>
  );
}
