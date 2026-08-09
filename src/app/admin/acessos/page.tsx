import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import {
  AJUDA_ACAO,
  MODULOS,
  ROTULO_ACAO,
  ROTULO_PAPEL,
  type Papel,
} from "@/lib/acessos";
import { definirPapel, salvarPermissoes } from "./actions";

export default async function GestaoDeAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    busca?: string;
    revenda?: string;
  }>;
}) {
  const eu = await requireOwner();
  const {
    erro,
    sucesso,
    busca = "",
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
        <PageHeader title="🔐 Gestão de Acessos" />
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma revenda ativa. Cadastre uma em Revendas antes de liberar
          acessos.
        </p>
      </div>
    );
  }

  const [{ data: pessoas }, { data: permissoes }, { data: vinculos }, { data: modulosAtivos }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, nome, cpf, cargo, role")
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

  return (
    <div>
      <PageHeader
        title="🔐 Gestão de Acessos"
        subtitle="Quem entra no Modo Liderança e o que cada um pode fazer"
      />

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
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-soft"
                    >
                      Tornar liderança
                    </button>
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
                    <button
                      type="submit"
                      className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Salvar permissões em {escolhida.nome}
                    </button>
                  </div>
                </form>

                <form
                  action={definirPapel}
                  className="border-t border-slate-100 p-4"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="papel" value="colaborador" />
                  <input type="hidden" name="revenda" value={escolhida.id} />
                  <button
                    type="submit"
                    className="w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remover a liderança de {p.nome?.split(" ")[0]}
                  </button>
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
