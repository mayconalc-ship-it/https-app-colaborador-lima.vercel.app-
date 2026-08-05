import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
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
  searchParams: Promise<{ busca?: string; erro?: string; sucesso?: string }>;
}) {
  const usuarioAtual = await requireModulo("colaboradores", "ver");
  // O botão de promover só existe para quem tem essa permissão específica.
  const podePromover = await podeNoModulo("colaboradores", "promover");
  const { busca = "", erro, sucesso } = await searchParams;

  const admin = createAdminClient();

  let consulta = admin
    .from("profiles")
    .select("id, nome, cpf, matricula, cargo, area, role")
    .order("nome", { ascending: true })
    .limit(50);

  const termo = busca.trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    consulta = digitos
      ? consulta.or(`nome.ilike.%${termo}%,cpf.ilike.%${digitos}%`)
      : consulta.ilike("nome", `%${termo}%`);
  }

  const [{ data: colaboradores }, { count: total }] = await Promise.all([
    consulta,
    admin.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        subtitle={`${total ?? 0} cadastrados no app`}
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
            primeiro login o colaborador é obrigado a criar a senha dele.
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
        className="mb-4 flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
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
      </form>

      <p className="mb-2 text-sm text-slate-500">
        {colaboradores?.length ?? 0}{" "}
        {termo ? `resultado(s) para "${termo}"` : "primeiros na lista"} — toque
        para editar
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
