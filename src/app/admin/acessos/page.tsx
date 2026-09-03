import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  AJUDA_ACAO,
  MODULOS,
  MODULOS_OPCIONAIS,
  ROTULO_ACAO,
  ROTULO_PAPEL,
  moduloPorId,
  type Papel,
} from "@/lib/acessos";
import { definirPapel, liberarAcessosEmLote, salvarPermissoes } from "./actions";

export default async function GestaoDeAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    busca?: string;
    filtro?: string;
    area?: string;
    funcao?: string;
    papel?: string;
    revendaExtra?: string;
    revenda?: string;
  }>;
}) {
  const eu = await requireOwner();
  const {
    erro,
    sucesso,
    busca = "",
    filtro = "",
    area: areaFiltro = "",
    funcao: funcaoFiltro = "",
    papel: papelFiltro = "",
    revendaExtra: revendaExtraFiltro = "",
    revenda: revendaParam,
  } = await searchParams;

  const admin = createAdminClient();

  const { data: revendas } = await admin
    .from("revendas")
    .select("id, nome")
    .eq("ativa", true)
    .order("ordem");

  // Permissão é sempre "nesta revenda". A tela inteira trabalha sobre uma
  // unidade de cada vez -- é assim que o Admin pensa ("estou configurando
  // Barreiras"), e evita uma matriz de módulos vezes revendas na mesma
  // página, que ninguém consegue ler no celular.
  const escolhida =
    (revendas ?? []).find((r) => r.id === revendaParam) ?? (revendas ?? [])[0];

  if (!escolhida) {
    return (
      <div>
        <PageHeader title="🔐 Acessos por Pessoa" />
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma revenda ativa. Cadastre uma em Revendas antes de liberar
          acessos.
        </p>
      </div>
    );
  }

  const [
    { data: pessoas },
    { data: permissoes },
    { data: vinculos },
    { data: modulosAtivos },
    { data: extras },
    { data: vinculosOutras },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, nome, cpf, cargo, area, role")
      .order("nome", { ascending: true }),
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id, modulo, acao")
      .eq("revenda_id", escolhida.id),
    admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", escolhida.id),
    admin
      .from("revenda_modulos")
      .select("modulo")
      .eq("revenda_id", escolhida.id)
      .eq("ativo", true),
    admin
      .from("colaborador_modulos_extra")
      .select("colaborador_id, modulo")
      .eq("revenda_id", escolhida.id),
    // Vínculo com OUTRAS revendas -- só pra mostrar o selo "também em
    // Barreiras" e servir de filtro. Tabela pequena (uma linha por pessoa
    // por revenda), então não vale a pena restringir por id aqui.
    admin
      .from("colaborador_revendas")
      .select("colaborador_id, revendas!inner(id, nome)")
      .neq("revenda_id", escolhida.id),
  ]);

  const porPessoa = new Map<string, Set<string>>();
  for (const p of permissoes ?? []) {
    if (!porPessoa.has(p.colaborador_id)) {
      porPessoa.set(p.colaborador_id, new Set());
    }
    porPessoa.get(p.colaborador_id)!.add(`${p.modulo}:${p.acao}`);
  }

  const daRevenda = new Set((vinculos ?? []).map((v) => v.colaborador_id));

  // Só os módulos que a revenda usa. Oferecer os outros seria prometer um
  // acesso que a tela do painel não vai mostrar.
  const modulos = MODULOS.filter((m) =>
    new Set((modulosAtivos ?? []).map((x) => x.modulo)).has(m.id),
  );

  const termo = busca.trim().toLowerCase();
  const todas = pessoas ?? [];

  // Só quem é desta revenda aparece. Uma liderança de São Félix não tem o
  // que fazer na lista de Barreiras.
  const liderancas = todas.filter(
    (p) => p.role === "lideranca" && daRevenda.has(p.id),
  );
  const candidatos = todas.filter(
    (p) =>
      p.role === "colaborador" &&
      daRevenda.has(p.id) &&
      termo.length >= 2 &&
      (p.nome?.toLowerCase().includes(termo) || (p.cpf ?? "").includes(termo)),
  );

  // Tabela de acesso por módulo: todo mundo desta revenda, dono de fora --
  // ele já pode tudo, marcar um checkbox para ele não muda nada e só
  // confundiria. Módulos opcionais que a revenda nem tem ligado não
  // aparecem como coluna: liberar um módulo desligado prometeria um
  // acesso que a tela dele não vai mostrar.
  const modulosOpcionaisDaRevenda = MODULOS_OPCIONAIS.filter((m) =>
    new Set((modulosAtivos ?? []).map((x) => x.modulo)).has(m),
  );

  // Outras revendas de cada pessoa -- selo informativo e filtro "também
  // vinculado a".
  const outrasRevendasPorPessoa = new Map<string, { id: string; nome: string }[]>();
  for (const v of vinculosOutras ?? []) {
    const r = (Array.isArray(v.revendas) ? v.revendas[0] : v.revendas) as {
      id: string;
      nome: string;
    };
    if (!r) continue;
    const lista = outrasRevendasPorPessoa.get(v.colaborador_id) ?? [];
    lista.push(r);
    outrasRevendasPorPessoa.set(v.colaborador_id, lista);
  }
  const revendasDisponiveisParaFiltro = [
    ...new Map(
      [...outrasRevendasPorPessoa.values()].flat().map((r) => [r.id, r]),
    ).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const termoTabela = filtro.trim().toLowerCase();
  const baseRoster = todas.filter((p) => p.role !== "owner" && daRevenda.has(p.id));

  // As opções dos seletores de Área e Função vêm de quem já está na
  // revenda -- oferecer valor que ninguém daqui tem só confundiria com
  // filtro que sempre devolve vazio.
  const areasDisponiveis = [
    ...new Set(baseRoster.map((p) => p.area).filter((v): v is string => !!v?.trim())),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const funcoesDisponiveis = [
    ...new Set(baseRoster.map((p) => p.cargo).filter((v): v is string => !!v?.trim())),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const roster = baseRoster.filter(
    (p) =>
      (!termoTabela ||
        p.nome?.toLowerCase().includes(termoTabela) ||
        (p.cpf ?? "").includes(termoTabela)) &&
      (!areaFiltro || p.area === areaFiltro) &&
      (!funcaoFiltro || p.cargo === funcaoFiltro) &&
      (!papelFiltro || p.role === papelFiltro) &&
      (!revendaExtraFiltro ||
        (outrasRevendasPorPessoa.get(p.id) ?? []).some((r) => r.id === revendaExtraFiltro)),
  );
  const extrasPorPessoa = new Map<string, Set<string>>();
  for (const e of extras ?? []) {
    if (!extrasPorPessoa.has(e.colaborador_id)) extrasPorPessoa.set(e.colaborador_id, new Set());
    extrasPorPessoa.get(e.colaborador_id)!.add(e.modulo);
  }

  // Agrupa colunas contíguas que pertencem ao mesmo "módulo guarda-chuva"
  // (ex.: as seis funcionalidades de Produtividade do Armazém + as duas de
  // Carretas) sob um cabeçalho comum -- é o que organiza a tabela em vez de
  // espalhar oito colunas soltas junto com Comunicados, Ranking etc.
  const gruposDeColunas: { rotuloGrupo: string | null; modulos: string[] }[] = [];
  for (const m of modulosOpcionaisDaRevenda) {
    const rotuloGrupo = moduloPorId(m)?.subGrupoDe ? (moduloPorId(moduloPorId(m)!.subGrupoDe!)?.rotulo ?? null) : null;
    const ultimo = gruposDeColunas[gruposDeColunas.length - 1];
    if (ultimo && ultimo.rotuloGrupo === rotuloGrupo) {
      ultimo.modulos.push(m);
    } else {
      gruposDeColunas.push({ rotuloGrupo, modulos: [m] });
    }
  }

  return (
    <div>
      {/* O nome diz PESSOA de propósito.
          Esta tela e a de Perfis de Acesso pareciam módulos duplicados
          (pergunta do dono, 02/09/2026), e o nome antigo -- "Gestão de
          Acessos" no título, "Usuários e Acessos" na barra lateral, dois
          nomes para a mesma tela -- não ajudava a separar. A diferença é
          o objeto: aqui se mexe numa PESSOA; lá se monta um MOLDE e se
          aplica a alguém. As duas gravam nas mesmas linhas. */}
      <PageHeader
        title="🔐 Acessos por Pessoa"
        subtitle="Quem entra no Modo Liderança e o que cada um pode fazer. É aqui, e só aqui, que se TIRA acesso."
      />

      <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
        Uma pessoa por vez, marcando cada permissão. Para dar de uma vez o
        pacote inteiro de um cargo — e repetir isso na próxima contratação —
        use{" "}
        <Link
          href="/admin/perfis-de-acesso"
          className="font-semibold text-primary hover:underline"
        >
          Perfis de Acesso
        </Link>
        : lá o conjunto ganha nome e se aplica em um clique. O que ele grava são
        as mesmas marcações desta tela.
      </div>

      {/* A revenda que está sendo configurada. Fica no topo porque muda o
          sentido de tudo o que vem abaixo. */}
      {(revendas ?? []).length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(revendas ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/admin/acessos?revenda=${r.id}`}
              className={
                r.id === escolhida.id
                  ? "rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary"
              }
            >
              {r.nome}
            </Link>
          ))}
        </div>
      )}

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

      <div className="mb-4 rounded-2xl border border-gold bg-gold-soft p-4">
        <p className="text-sm font-semibold text-primary-dark">
          👑 Admin: {eu.nome}
        </p>
        <p className="mt-1 text-xs text-primary-dark">
          Só existe um Admin, e ele é definido no banco de dados — não há botão
          que promova alguém a Admin. Você também não consegue alterar o próprio
          acesso por esta tela, para não haver risco de se trancar do lado de
          fora.
        </p>
      </div>

      {/* ---- Tabela de acesso por módulo opcional ---- */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Acesso a módulos opcionais em {escolhida.nome}
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Módulos que ficam escondidos até serem liberados pessoa por pessoa.
          Vale para qualquer papel — colaborador ou liderança. Marque quantos
          quadradinhos quiser e só clique em &quot;Liberar acesso&quot; no
          fim para gravar tudo de uma vez.
        </p>

        {modulosOpcionaisDaRevenda.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Esta revenda ainda não tem nenhum módulo opcional ligado.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <form
              method="get"
              className="flex flex-wrap gap-2 border-b border-slate-100 p-3"
            >
              <input type="hidden" name="revenda" value={escolhida.id} />
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
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                name="funcao"
                defaultValue={funcaoFiltro}
                className="min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todas as funções</option>
                {funcoesDisponiveis.map((f) => (
                  <option key={f} value={f}>{f}</option>
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
                    <option key={r.id} value={r.id}>Também em {r.nome}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Filtrar
              </button>
              {(termoTabela || areaFiltro || funcaoFiltro || papelFiltro || revendaExtraFiltro) && (
                <Link
                  href={`/admin/acessos?revenda=${escolhida.id}`}
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
              <input type="hidden" name="revenda" value={escolhida.id} />
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  {/* sticky no <thead> inteiro (não célula a célula): as
                      duas linhas de cabeçalho -- grupo e módulo -- rolam
                      juntas como um bloco só, sem precisar calcular a
                      altura da primeira pra encaixar a segunda embaixo. */}
                  <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      {/* Congelada: com muitos módulos a tabela fica bem mais
                          larga que a tela, e sem isso ninguém sabe mais de quem
                          é a linha depois de rolar pra marcar um módulo à
                          direita. rowSpan de 2 porque agora o cabeçalho tem uma
                          segunda linha, de agrupamento. */}
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
                          <span className="block text-base leading-none">{moduloPorId(m)?.emoji}</span>
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
                        <td
                          colSpan={modulosOpcionaisDaRevenda.length + 1}
                          className="p-6 text-center text-sm text-slate-400"
                        >
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
                                {p.nome}
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
                  ✅ Liberar acesso
                </BotaoEnviar>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* ---- Promover alguém ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Tornar alguém liderança
        </summary>
        <div className="border-t border-slate-100 p-4">
          <form method="get" className="mb-3 flex gap-2">
            <input type="hidden" name="revenda" value={escolhida.id} />
            <input
              name="busca"
              defaultValue={busca}
              placeholder="Buscar por nome ou CPF"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Buscar
            </button>
          </form>

          {termo.length < 2 ? (
            <p className="text-sm text-slate-400">
              Digite ao menos 2 letras do nome para encontrar a pessoa.
            </p>
          ) : candidatos.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nenhum colaborador encontrado com esse termo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {candidatos.slice(0, 10).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {p.nome}
                    </p>
                    <p className="truncate text-xs text-slate-400">{p.cargo}</p>
                  </div>
                  <form action={definirPapel}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="papel" value="lideranca" />
                    <input type="hidden" name="revenda" value={escolhida.id} />
                    <BotaoEnviar
                      textoEnviando="Aplicando..."
                      className="shrink-0 rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-soft"
                    >
                      Tornar liderança
                    </BotaoEnviar>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {/* ---- Lideranças e suas permissões ---- */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Lideranças em {escolhida.nome} ({liderancas.length})
      </h2>

      {liderancas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma liderança vinculada a esta revenda ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {liderancas.map((p) => {
            const minhas = porPessoa.get(p.id) ?? new Set<string>();
            return (
              <details
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="cursor-pointer p-4">
                  <span className="font-semibold text-slate-800">{p.nome}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {minhas.size === 0
                      ? "sem nenhuma permissão"
                      : `${
                          new Set(
                            Array.from(minhas).map((c) => c.split(":")[0]),
                          ).size
                        } módulo(s) liberado(s)`}
                  </span>
                </summary>

                <form
                  action={salvarPermissoes}
                  className="border-t border-slate-100 p-4"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="revenda" value={escolhida.id} />

                  <div className="space-y-4">
                    {modulos.map((m) => (
                      <div key={m.id}>
                        <p className="mb-1.5 text-sm font-semibold text-slate-800">
                          {m.emoji} {m.rotulo}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          {m.acoes.map((acao) => (
                            <label
                              key={acao}
                              className="flex items-center gap-1.5 text-sm text-slate-600"
                            >
                              <input
                                type="checkbox"
                                name="permissao"
                                value={`${m.id}:${acao}`}
                                defaultChecked={minhas.has(`${m.id}:${acao}`)}
                                className="h-4 w-4 rounded border-slate-300 text-primary"
                              />
                              {ROTULO_ACAO[acao]}
                            </label>
                          ))}
                        </div>
                        {/* Só as ações que não se explicam sozinhas ganham
                            nota — poluir todas cansaria a leitura. */}
                        {m.acoes.map((acao) =>
                          AJUDA_ACAO[acao] ? (
                            <p
                              key={`ajuda-${acao}`}
                              className="mt-1.5 rounded-lg bg-gold-soft p-2 text-xs text-primary-dark"
                            >
                              <strong>{ROTULO_ACAO[acao]}:</strong>{" "}
                              {AJUDA_ACAO[acao]}
                            </p>
                          ) : null,
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    Marcar Criar, Editar ou Excluir liga o Visualizar
                    automaticamente — não faria sentido poder mexer numa tela
                    sem poder abri-la.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <BotaoEnviar
                      textoEnviando="Salvando..."
                      className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Salvar permissões em {escolhida.nome}
                    </BotaoEnviar>
                  </div>
                </form>

                <form
                  action={definirPapel}
                  className="border-t border-slate-100 p-4"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="papel" value="colaborador" />
                  <input type="hidden" name="revenda" value={escolhida.id} />
                  <BotaoEnviar
                    textoEnviando="Removendo..."
                    className="w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remover a liderança de {p.nome?.split(" ")[0]}
                  </BotaoEnviar>
                  <p className="mt-2 text-xs text-slate-400">
                    A pessoa continua usando o app normalmente. Só perde o
                    acesso ao Modo Liderança e todas as permissões.
                  </p>
                </form>
              </details>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Papel de cada um:{" "}
        {(["owner", "lideranca", "colaborador"] as Papel[])
          .map((r) => ROTULO_PAPEL[r])
          .join(" · ")}
        . Toda alteração feita aqui fica registrada no Log de Auditoria.
      </p>
    </div>
  );
}
