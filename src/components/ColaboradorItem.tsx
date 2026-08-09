"use client";

import { useState } from "react";
import { ROTULO_PAPEL, type Papel } from "@/lib/acessos";

type Colaborador = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string | null;
  cargo: string | null;
  area: string | null;
  role: string;
};

export function ColaboradorItem({
  colaborador,
  busca,
  ehVoceMesmo,
  senhaPadrao,
  onAtualizar,
  onRedefinirSenha,
  onPromover,
  onExcluir,
  revendas,
  vinculos,
  onSalvarVinculos,
}: {
  colaborador: Colaborador;
  busca: string;
  ehVoceMesmo: boolean;
  senhaPadrao: string;
  onAtualizar: (formData: FormData) => void;
  onRedefinirSenha: (formData: FormData) => void;
  /** Ausente quando quem está olhando não tem permissão para promover. */
  onPromover?: (formData: FormData) => void;
  onExcluir: (formData: FormData) => void;
  revendas: { id: string; nome: string }[];
  vinculos: { revendaId: string; principal: boolean }[];
  /** Ausente para quem não é o dono: vínculo é decisão só dele. */
  onSalvarVinculos?: (formData: FormData) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const c = colaborador;

  const minhasRevendas = new Set(vinculos.map((v) => v.revendaId));
  const principalAtual =
    vinculos.find((v) => v.principal)?.revendaId ?? vinculos[0]?.revendaId;

  function confirmar(mensagem: string) {
    return (e: React.FormEvent) => {
      if (!confirm(mensagem)) e.preventDefault();
    };
  }

  return (
    <div className={aberto ? "bg-slate-50" : ""}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">
            {c.nome}
            {c.role !== "colaborador" && (
              <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">
                {ROTULO_PAPEL[c.role as Papel] ?? c.role}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-slate-400">
            CPF {c.cpf}
            {c.matricula ? ` · Mat. ${c.matricula}` : ""}
            {c.cargo ? ` · ${c.cargo}` : ""}
          </p>
        </div>
        <span className="shrink-0 text-slate-400">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-slate-200 p-4">
          <form action={onAtualizar} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="busca" value={busca} />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nome
              </label>
              <input
                name="nome"
                defaultValue={c.nome}
                required
                className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Matrícula
                </label>
                <input
                  name="matricula"
                  defaultValue={c.matricula ?? ""}
                  className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex-[2]">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Cargo
                </label>
                <input
                  name="cargo"
                  defaultValue={c.cargo ?? ""}
                  className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Área
              </label>
              <input
                name="area"
                defaultValue={c.area ?? ""}
                className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
              />
            </div>

            <p className="text-xs text-slate-400">
              O CPF não pode ser alterado, porque é o login. Se estiver errado,
              remova e cadastre novamente.
            </p>

            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
            >
              Salvar dados
            </button>
          </form>

          {onSalvarVinculos && revendas.length > 1 && (
            <form
              action={onSalvarVinculos}
              className="space-y-2 border-t border-slate-200 pt-3"
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="nome" value={c.nome} />
              <input type="hidden" name="busca" value={busca} />

              <p className="text-xs font-semibold text-slate-600">
                Revendas de {c.nome.split(" ")[0]}
              </p>

              {revendas.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="revenda"
                      value={r.id}
                      defaultChecked={minhasRevendas.has(r.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary"
                    />
                    {r.nome}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input
                      type="radio"
                      name="principal"
                      value={r.id}
                      defaultChecked={r.id === principalAtual}
                      className="h-3.5 w-3.5 border-slate-300 text-primary"
                    />
                    padrão
                  </label>
                </div>
              ))}

              <button
                type="submit"
                className="w-full rounded-lg border border-primary px-3 py-2 text-xs font-medium text-primary hover:bg-primary-soft"
              >
                Salvar revendas
              </button>
              <p className="text-xs text-slate-400">
                Marcando mais de uma, a pessoa passa a escolher a revenda no
                topo do app — e as permissões de liderança dela são definidas
                separadamente em cada uma. &quot;Padrão&quot; é a revenda em
                que ela entra ao abrir o app.
              </p>
            </form>
          )}

          {onPromover && !ehVoceMesmo && c.role !== "owner" && (
            <form
              action={onPromover}
              className="border-t border-slate-200 pt-3"
              onSubmit={confirmar(
                c.role === "lideranca"
                  ? `Tirar o acesso de liderança de ${c.nome}?\n\nEle continua usando o app normalmente, mas perde todas as permissões.`
                  : `Tornar ${c.nome} liderança?\n\nEle entra SEM nenhum módulo liberado — o Admin precisa liberar depois.`,
              )}
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="nome" value={c.nome} />
              <input type="hidden" name="busca" value={busca} />
              <input
                type="hidden"
                name="papel"
                value={c.role === "lideranca" ? "colaborador" : "lideranca"}
              />
              <button
                type="submit"
                className={`w-full rounded-lg border px-3 py-2 text-xs font-medium ${
                  c.role === "lideranca"
                    ? "border-slate-300 text-slate-600 hover:bg-white"
                    : "border-primary text-primary hover:bg-primary-soft"
                }`}
              >
                {c.role === "lideranca"
                  ? "Tirar liderança"
                  : "Tornar liderança"}
              </button>
              <p className="mt-1.5 text-xs text-slate-400">
                Promover dá o crachá, não as chaves: quem você promover entra
                sem nenhum módulo. Liberar o quê é só do Admin.
              </p>
            </form>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            <form
              action={onRedefinirSenha}
              onSubmit={confirmar(
                `Redefinir a senha de ${c.nome} para ${senhaPadrao}? Ele terá que criar uma nova no próximo acesso.`,
              )}
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="nome" value={c.nome} />
              <input type="hidden" name="busca" value={busca} />
              <button
                type="submit"
                className="rounded-lg border border-primary px-3 py-2 text-xs font-medium text-primary hover:bg-primary-soft"
              >
                Redefinir senha
              </button>
            </form>

            {!ehVoceMesmo && (
              <form
                action={onExcluir}
                onSubmit={confirmar(
                  `REMOVER ${c.nome} do app?\n\nO acesso será apagado e essa ação não pode ser desfeita.`,
                )}
                className="ml-auto"
              >
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="nome" value={c.nome} />
                <input type="hidden" name="busca" value={busca} />
                <button
                  type="submit"
                  className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remover do app
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
