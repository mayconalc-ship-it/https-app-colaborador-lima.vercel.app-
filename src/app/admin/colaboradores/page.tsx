import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getRevendaAtiva } from "@/lib/revendas";
import { ehOwner } from "@/lib/acessos";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ColaboradorItem } from "@/components/ColaboradorItem";
import { SENHA_PADRAO } from "@/lib/senha";
import {
  redefinirSenha,
  criarColaborador,
  atualizarColaborador,
  excluirColaborador,
  promoverColaborador,
} from "./actions";

export default async function AdminColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string;
    revenda?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const usuarioAtual = await requireModulo("colaboradores", "ver");
  // O botão de promover só existe para quem tem essa permissão específica.
  const podePromover = await podeNoModulo("colaboradores", "promover");
  // Mexer em vínculo é só do dono: decide o que a pessoa vê do app inteiro.
  const souDono = ehOwner(usuarioAtual.role);
  const { busca = "", revenda: filtroRevenda = "", erro, sucesso } =
    await searchParams;

  const admin = createAdminClient();
  const revendaAtiva = await getRevendaAtiva();

  if (!revendaAtiva) {
    return (
      <div>
        <PageHeader title="Colaboradores" />
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Você não está em nenhuma revenda.
        </p>
      </div>
    );
  }

  // Quais revendas esta pessoa pode enxergar na lista. O dono vê todas --
  // é ele quem administra o app inteiro. A liderança vê só as suas: o
  // cadastro (com CPF) de outra unidade não é assunto dela.
  const { data: revendas } = souDono
    ? await admin.from("revendas").select("id, nome").eq("ativa", true).order("ordem")
    : await admin
        .from("colaborador_revendas")
        .select("revendas!inner(id, nome)")
        .eq("colaborador_id", usuarioAtual.id)
        .eq("revendas.ativa", true)
        .order("nome", { referencedTable: "revendas" })
        .then(({ data }) => ({
          data: (data ?? []).map(
            (v) => v.revendas as unknown as { id: string; nome: string },
          ),
        }));

  const listaRevendas = revendas ?? [];
  const idsRevendasVisiveis = listaRevendas.map((r) => r.id);

  // "Todas" é o padrão; o filtro só estreita, e só aceita revenda que a
  // pessoa já podia ver.
  const revendaFiltrada = listaRevendas.find((r) => r.id === filtroRevenda);

  const { data: todosVinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id, revenda_id, principal")
    .in(
      "revenda_id",
      revendaFiltrada ? [revendaFiltrada.id] : idsRevendasVisiveis,
    );

  const ids = Array.from(
    new Set((todosVinculos ?? []).map((v) => v.colaborador_id)),
  );

  let consulta = admin
    .from("profiles")
    .select("id, nome, cpf, matricula, cargo, area, role")
    .in("id", ids)
    .order("nome", { ascending: true })
    .limit(200);

  const termo = busca.trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    consulta = digitos
      ? consulta.or(`nome.ilike.%${termo}%,cpf.ilike.%${digitos}%`)
      : consulta.ilike("nome", `%${termo}%`);
  }

  const { data: colaboradores } = await consulta;

  const total = ids.length;

  // Os vínculos exibidos são todos os da pessoa, mesmo com o filtro ligado:
  // filtrar a lista é uma coisa, esconder que alguém também é de Barreiras
  // seria outra -- e daria para apagar esse vínculo sem perceber ao salvar.
  const { data: vinculos } = ids.length
    ? await admin
        .from("colaborador_revendas")
        .select("colaborador_id, revenda_id, principal")
        .in("colaborador_id", ids)
    : { data: [] };

  const vinculosPorPessoa = new Map<
    string,
    { revendaId: string; principal: boolean }[]
  >();
  for (const v of vinculos ?? []) {
    const lista = vinculosPorPessoa.get(v.colaborador_id) ?? [];
    lista.push({ revendaId: v.revenda_id, principal: v.principal });
    vinculosPorPessoa.set(v.colaborador_id, lista);
  }

  const nomePorRevenda = new Map(listaRevendas.map((r) => [r.id, r.nome]));

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        subtitle={
          revendaFiltrada
            ? `${total} em ${revendaFiltrada.nome}`
            : `${total} cadastrados no app`
        }
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

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Cadastrar novo colaborador
        </summary>
        <form
          action={criarColaborador}
          className="space-y-3 border-t border-slate-100 p-4"
        >
          <div>
            <label
              htmlFor="novo-nome"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nome completo
            </label>
            <input
              id="novo-nome"
              name="nome"
              required
              placeholder="Ex: João da Silva"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="novo-cpf"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              CPF (será o login)
            </label>
            <input
              id="novo-cpf"
              name="cpf"
              inputMode="numeric"
              required
              placeholder="Somente números"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label
                htmlFor="nova-matricula"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Matrícula
              </label>
              <input
                id="nova-matricula"
                name="matricula"
                className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-[2]">
              <label
                htmlFor="novo-cargo"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Cargo
              </label>
              <input
                id="novo-cargo"
                name="cargo"
                placeholder="Ex: Motorista"
                className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="nova-area"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Área
            </label>
            <input
              id="nova-area"
              name="area"
              placeholder="Ex: DISTRIBUIÇÃO"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <p className="rounded-lg bg-primary-soft p-3 text-xs text-primary-dark">
            O acesso é criado com a senha <strong>{SENHA_PADRAO}</strong>. No
            primeiro login o colaborador é obrigado a criar a senha dele. Ele
            entra vinculado a <strong>{revendaAtiva.nome}</strong>.
          </p>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
          >
            Cadastrar
          </button>
        </form>
      </details>

      <form
        method="get"
        className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label
              htmlFor="busca"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Buscar por nome ou CPF
            </label>
            <input
              id="busca"
              name="busca"
              defaultValue={busca}
              placeholder="Ex: Maycon ou 05738764528"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Buscar
          </button>
        </div>

        {/* Filtro opcional. "Todas" é o padrão: a lista mostra o app
            inteiro, e a revenda só serve para estreitar quando se quer. */}
        {listaRevendas.length > 1 && (
          <div>
            <label
              htmlFor="filtro-revenda"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Revenda
            </label>
            <select
              id="filtro-revenda"
              name="revenda"
              defaultValue={revendaFiltrada?.id ?? ""}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-base focus:border-primary focus:outline-none"
            >
              <option value="">Todas as revendas</option>
              {listaRevendas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>

      <p className="mb-2 text-sm text-slate-500">
        {colaboradores?.length ?? 0}{" "}
        {termo ? `resultado(s) para "${termo}"` : "na lista"} — toque para
        editar
      </p>

      {!colaboradores || colaboradores.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum colaborador encontrado.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {colaboradores.map((c) => (
            <ColaboradorItem
              key={c.id}
              colaborador={c}
              busca={busca}
              ehVoceMesmo={c.id === usuarioAtual.id}
              senhaPadrao={SENHA_PADRAO}
              onAtualizar={atualizarColaborador}
              onRedefinirSenha={redefinirSenha}
              onPromover={podePromover ? promoverColaborador : undefined}
              onExcluir={excluirColaborador}
              revendas={listaRevendas}
              vinculos={vinculosPorPessoa.get(c.id) ?? []}
              podeMexerEmVinculos={souDono}
              nomesDasRevendas={(vinculosPorPessoa.get(c.id) ?? [])
                .map((v) => nomePorRevenda.get(v.revendaId))
                .filter((n): n is string => Boolean(n))}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Não existe recuperação de senha por e-mail: o acesso é por CPF e os
        colaboradores não têm e-mail cadastrado. Quando alguém esquecer a senha,
        redefina por aqui e informe a senha provisória.
      </p>
    </div>
  );
}
