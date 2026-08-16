import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getRevendaAtiva } from "@/lib/revendas";
import { ehOwner } from "@/lib/acessos";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ColaboradorItem } from "@/components/ColaboradorItem";
import { CampoComNovaOpcao } from "@/components/CampoComNovaOpcao";
import { SENHA_PADRAO } from "@/lib/senha";
import {
  redefinirSenha,
  criarColaborador,
  atualizarColaborador,
  excluirColaborador,
  promoverColaborador,
  concederAcessoAtivoGiro,
  revogarAcessoAtivoGiro,
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

  // Áreas e cargos já cadastrados no app inteiro, para alimentar os menus
  // suspensos do formulário -- é o mesmo catálogo pra todas as revendas, já
  // que são só classificações de função, não dado sensível de ninguém.
  const { data: areaCargoRows } = await admin
    .from("profiles")
    .select("area, cargo");

  const areasExistentes = Array.from(
    new Set(
      (areaCargoRows ?? [])
        .map((r) => r.area)
        .filter((v): v is string => !!v && v.trim() !== ""),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const cargosExistentes = Array.from(
    new Set(
      (areaCargoRows ?? [])
        .map((r) => r.cargo)
        .filter((v): v is string => !!v && v.trim() !== ""),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

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

  // Quem já tem o Ativo de Giro liberado NA REVENDA ATIVA -- é a única que
  // faz sentido alternar por aqui sem trocar de revenda no seletor 🏢.
  // Só o dono mexe nisso (mesma regra de vínculo), e só quando a lista
  // não está vazia -- economiza a consulta na maioria das visitas.
  let idsComAG = new Set<string>();
  if (souDono && ids.length > 0) {
    const { data: liberadosAG } = await admin
      .from("colaborador_modulos_extra")
      .select("colaborador_id")
      .eq("revenda_id", revendaAtiva.id)
      .eq("modulo", "ativo-giro")
      .in("colaborador_id", ids);
    idsComAG = new Set((liberadosAG ?? []).map((v) => v.colaborador_id));
  }

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
              <CampoComNovaOpcao
                id="novo-cargo"
                name="cargo"
                opcoes={cargosExistentes}
                obrigatorio
                textoNovo="+ Cadastrar novo cargo"
                placeholderNovo="Ex: Motorista"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-base focus:border-primary focus:outline-none"
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
            <CampoComNovaOpcao
              id="nova-area"
              name="area"
              opcoes={areasExistentes}
              obrigatorio
              textoNovo="+ Cadastrar nova área"
              placeholderNovo="Ex: DISTRIBUIÇÃO"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          {/* Só o dono escolhe: é ele quem administra o app inteiro, e
              cadastrar para a revenda errada por descuido é o tipo de erro
              que só aparece dias depois, quando a pessoa "não vê nada". */}
          {souDono && listaRevendas.length > 1 && (
            <div>
              <label
                htmlFor="nova-revenda"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Revenda
              </label>
              <select
                id="nova-revenda"
                name="revenda_id"
                defaultValue={revendaAtiva.id}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-base focus:border-primary focus:outline-none"
              >
                {listaRevendas.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              name="acesso_ag"
              value="1"
              className="h-4 w-4 rounded border-slate-300 text-primary"
            />
            📦 Liberar o Ativo de Giro para este colaborador
          </label>

          <p className="rounded-lg bg-primary-soft p-3 text-xs text-primary-dark">
            O acesso é criado com a senha <strong>{SENHA_PADRAO}</strong>. No
            primeiro login o colaborador é obrigado a criar a senha dele.
            {souDono && listaRevendas.length > 1
              ? " Ele entra vinculado à revenda escolhida acima."
              : (
                <>
                  {" "}Ele entra vinculado a <strong>{revendaAtiva.nome}</strong>.
                </>
              )}
          </p>

          <BotaoEnviar
            textoEnviando="Cadastrando..."
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
          >
            Cadastrar
          </BotaoEnviar>
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

      <details open>
        <summary className="mb-2 cursor-pointer text-sm font-semibold text-primary">
          Lista de colaboradores — toque para recolher ou mostrar
        </summary>

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
                areasExistentes={areasExistentes}
                cargosExistentes={cargosExistentes}
                vinculos={vinculosPorPessoa.get(c.id) ?? []}
                podeMexerEmVinculos={souDono}
                nomesDasRevendas={(vinculosPorPessoa.get(c.id) ?? [])
                  .map((v) => nomePorRevenda.get(v.revendaId))
                  .filter((n): n is string => Boolean(n))}
                temAcessoAG={idsComAG.has(c.id)}
                podeAlternarAG={
                  souDono &&
                  c.role === "colaborador" &&
                  (vinculosPorPessoa.get(c.id) ?? []).some(
                    (v) => v.revendaId === revendaAtiva.id,
                  )
                }
                revendaAtivaNome={revendaAtiva.nome}
                onConcederAG={concederAcessoAtivoGiro}
                onRevogarAG={revogarAcessoAtivoGiro}
              />
            ))}
          </div>
        )}
      </details>

      <p className="mt-3 text-xs text-slate-400">
        Não existe recuperação de senha por e-mail: o acesso é por CPF e os
        colaboradores não têm e-mail cadastrado. Quando alguém esquecer a senha,
        redefina por aqui e informe a senha provisória.
      </p>
    </div>
  );
}
