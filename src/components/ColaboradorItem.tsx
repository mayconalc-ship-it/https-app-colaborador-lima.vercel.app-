"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { CampoComNovaOpcao } from "@/components/CampoComNovaOpcao";
import { useConfirmarEnvio } from "@/components/Confirmacao";
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
  areasExistentes,
  cargosExistentes,
  vinculos,
  podeMexerEmVinculos,
  nomesDasRevendas,
  temAcessoAG,
  podeAlternarAG,
  revendaAtivaNome,
  onConcederAG,
  onRevogarAG,
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
  areasExistentes: string[];
  cargosExistentes: string[];
  vinculos: { revendaId: string; principal: boolean }[];
  /** Só o dono mexe em vínculo: ele decide o que a pessoa vê do app inteiro. */
  podeMexerEmVinculos: boolean;
  /** Nomes das revendas da pessoa, para identificar quem é quem na lista. */
  nomesDasRevendas: string[];
  /** Já tem o Ativo de Giro liberado na revenda ativa (a do Admin agora)? */
  temAcessoAG: boolean;
  /** Só o dono, e só para quem pertence à revenda ativa -- alternar por
   *  aqui não tem como escolher outra revenda; troque no seletor 🏢. */
  podeAlternarAG: boolean;
  revendaAtivaNome: string;
  onConcederAG?: (formData: FormData) => void;
  onRevogarAG?: (formData: FormData) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const c = colaborador;

  const minhasRevendas = new Set(vinculos.map((v) => v.revendaId));
  const principalAtual =
    vinculos.find((v) => v.principal)?.revendaId ?? vinculos[0]?.revendaId;

  // Mesma assinatura de antes, para os pontos de uso não mudarem: recebe a
  // pergunta e devolve o onSubmit. Só o popup do navegador virou modal.
  const aoEnviar = useConfirmarEnvio();
  function confirmar(mensagem: string) {
    return aoEnviar({ titulo: mensagem });
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
          {/* Com a lista mostrando o app inteiro, saber de qual revenda a
              pessoa é deixa de ser detalhe e vira parte da identificação. */}
          {nomesDasRevendas.length > 0 && (
            <p className="truncate text-xs text-primary">
              🏢 {nomesDasRevendas.join(" · ")}
            </p>
          )}
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
                <CampoComNovaOpcao
                  name="cargo"
                  opcoes={cargosExistentes}
                  valorAtual={c.cargo}
                  obrigatorio
                  textoNovo="+ Cadastrar novo cargo"
                  placeholderNovo="Ex: Motorista"
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-base focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Área
              </label>
              <CampoComNovaOpcao
                name="area"
                opcoes={areasExistentes}
                valorAtual={c.area}
                obrigatorio
                textoNovo="+ Cadastrar nova área"
                placeholderNovo="Ex: DISTRIBUIÇÃO"
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-base focus:border-primary focus:outline-none"
              />
            </div>

            {/* As revendas moram DENTRO do formulário de dados: são parte do
                cadastro da pessoa, e dois botões de salvar lado a lado só
                fazem quem edita parar para descobrir qual dos dois usar. */}
            {podeMexerEmVinculos && revendas.length > 1 && (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                {/* Avisa a ação de que este formulário TEM o bloco de
                    revendas. Sem isso, desmarcar todas seria indistinguível
                    de um formulário que nunca as mostrou -- e o erro
                    "precisa de ao menos uma" nunca apareceria. */}
                <input type="hidden" name="vinculos_editaveis" value="1" />

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

                <p className="text-xs text-slate-400">
                  Marcando mais de uma, a pessoa passa a escolher a revenda no
                  topo do app — e as permissões de liderança dela são definidas
                  separadamente em cada uma. &quot;Padrão&quot; é a revenda em
                  que ela entra ao abrir o app.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400">
              O CPF não pode ser alterado, porque é o login. Se estiver errado,
              remova e cadastre novamente.
            </p>

            <BotaoEnviar
              textoEnviando="Salvando..."
              className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
            >
              Salvar dados
            </BotaoEnviar>
          </form>

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
              <BotaoEnviar
                textoEnviando="Aplicando..."
                className={`w-full rounded-lg border px-3 py-2 text-xs font-medium ${
                  c.role === "lideranca"
                    ? "border-slate-300 text-slate-600 hover:bg-white"
                    : "border-primary text-primary hover:bg-primary-soft"
                }`}
              >
                {c.role === "lideranca"
                  ? "Tirar liderança"
                  : "Tornar liderança"}
              </BotaoEnviar>
              <p className="mt-1.5 text-xs text-slate-400">
                Promover dá o crachá, não as chaves: quem você promover entra
                sem nenhum módulo. Liberar o quê é só do Admin.
              </p>
            </form>
          )}

          {podeAlternarAG && (onConcederAG || onRevogarAG) && (
            <form
              action={temAcessoAG ? onRevogarAG : onConcederAG}
              className="border-t border-slate-200 pt-3"
            >
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="nome" value={c.nome} />
              <input type="hidden" name="busca" value={busca} />
              <BotaoEnviar
                textoEnviando="Aplicando..."
                className={`w-full rounded-lg border px-3 py-2 text-xs font-medium ${
                  temAcessoAG
                    ? "border-slate-300 text-slate-600 hover:bg-white"
                    : "border-primary text-primary hover:bg-primary-soft"
                }`}
              >
                📦{" "}
                {temAcessoAG
                  ? "Tirar acesso ao Ativo de Giro"
                  : "Liberar Ativo de Giro"}
              </BotaoEnviar>
              <p className="mt-1.5 text-xs text-slate-400">
                Vale para {revendaAtivaNome}. Para outra revenda, troque no
                seletor 🏢 no topo e volte aqui.
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
              <BotaoEnviar
                textoEnviando="Redefinindo..."
                className="rounded-lg border border-primary px-3 py-2 text-xs font-medium text-primary hover:bg-primary-soft"
              >
                Redefinir senha
              </BotaoEnviar>
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
                <BotaoEnviar
                  textoEnviando="Removendo..."
                  className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remover do app
                </BotaoEnviar>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
