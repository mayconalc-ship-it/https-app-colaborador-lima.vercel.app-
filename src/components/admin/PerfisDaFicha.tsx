"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

type TipoDePerfil = "lideranca" | "colaborador";

export type PerfilNaFicha = {
  id: string;
  nome: string;
  tipo: TipoDePerfil;
  /** O que o perfil dá e a pessoa não tem. */
  faltando: number;
};

/**
 * OS PERFIS DA PESSOA, NO TOPO DA FICHA (05/10/2026).
 *
 * A ordem é a da decisão: primeiro "qual é o cargo dela?", só depois "e as
 * exceções?". Aqui se entra num perfil, sai de um, completa o que falta e
 * -- só o Admin -- tira as exceções ("deixar igual ao perfil").
 *
 * Sair do perfil NÃO tira acesso: os acessos ficam e viram "individuais"
 * na lista de baixo, onde se tira um a um. É a mesma regra da tela de
 * Perfis.
 */
export function PerfisDaFicha({
  pessoaId,
  pessoaNome,
  papel,
  revenda,
  meus,
  disponiveis,
  individuais,
  podeAlterar,
  podeEspelhar,
  aplicar,
  tirar,
}: {
  pessoaId: string;
  pessoaNome: string;
  papel: string;
  revenda: { id: string; nome: string };
  meus: PerfilNaFicha[];
  /** Os perfis da revenda em que a pessoa ainda não está. */
  disponiveis: { id: string; nome: string; tipo: TipoDePerfil }[];
  /** As exceções por tipo de perfil -- é o que o "deixar igual" tiraria. */
  individuais: { app: string[]; lideranca: string[] };
  podeAlterar: boolean;
  podeEspelhar: boolean;
  aplicar: (formData: FormData) => void;
  tirar: (formData: FormData) => void;
}) {
  const primeiroNome = pessoaNome.split(" ")[0] || pessoaNome;
  const ehColaborador = papel === "colaborador";

  // "Deixar igual" só faz sentido com UM perfil -- com dois, qual seria o
  // molde? -- e tira só as exceções do tipo dele: perfil de colaborador
  // mexe nos módulos do app, perfil de liderança nas permissões.
  const unico = meus.length === 1 ? meus[0] : null;
  const sobra = unico ? (unico.tipo === "colaborador" ? individuais.app : individuais.lideranca) : [];
  const ofereceEspelhar =
    podeAlterar && podeEspelhar && unico && sobra.length > 0 && !(unico.tipo === "lideranca" && ehColaborador);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">🎫 Perfis</h2>
        <p className="text-xs text-slate-500">O pacote de acessos do cargo. Mudou o perfil, muda para ela.</p>
      </div>

      {meus.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Nenhum perfil em {revenda.nome}. Tudo o que {primeiroNome} tem foi liberado um a um.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {meus.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-sm"
            >
              <span className="font-semibold text-slate-800">
                {p.tipo === "colaborador" ? "📱" : "⚙️"} {p.nome}
              </span>
              {p.faltando > 0 && podeAlterar && (
                <FormCompletar
                  action={aplicar}
                  pessoaId={pessoaId}
                  revendaId={revenda.id}
                  perfil={p}
                  primeiroNome={primeiroNome}
                  pedeLideranca={p.tipo === "lideranca" && ehColaborador}
                />
              )}
              {p.faltando > 0 && !podeAlterar && (
                <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700">
                  faltam {p.faltando}
                </span>
              )}
              {podeAlterar && (
                <FormTirar action={tirar} pessoaId={pessoaId} pessoaNome={pessoaNome} revendaId={revenda.id} perfil={p} />
              )}
            </li>
          ))}
        </ul>
      )}

      {podeAlterar && disponiveis.length > 0 && (
        <FormEntrar
          action={aplicar}
          pessoaId={pessoaId}
          primeiroNome={primeiroNome}
          ehColaborador={ehColaborador}
          revendaId={revenda.id}
          disponiveis={disponiveis}
        />
      )}

      {ofereceEspelhar && unico && (
        <FormEspelhar
          action={aplicar}
          pessoaId={pessoaId}
          primeiroNome={primeiroNome}
          revendaId={revenda.id}
          perfil={unico}
          sobra={sobra}
        />
      )}
    </section>
  );
}

function FormTirar({
  action,
  pessoaId,
  pessoaNome,
  revendaId,
  perfil,
}: {
  action: (formData: FormData) => void;
  pessoaId: string;
  pessoaNome: string;
  revendaId: string;
  perfil: PerfilNaFicha;
}) {
  const confirmar = useConfirmarEnvio();
  return (
    <form
      action={action}
      onSubmit={confirmar({
        titulo: `Tirar ${pessoaNome} do perfil "${perfil.nome}"?`,
        detalhe:
          "Os acessos NÃO mudam: continuam todos, e passam a aparecer como individuais na lista abaixo — de lá dá para tirar um a um.",
        confirmar: "Tirar do perfil",
        perigo: false,
      })}
    >
      <input type="hidden" name="revenda" value={revendaId} />
      <input type="hidden" name="colaborador_id" value={pessoaId} />
      <input type="hidden" name="perfil_id" value={perfil.id} />
      <BotaoEnviar
        compacto
        title={`Tirar do perfil ${perfil.nome} (os acessos continuam)`}
        ariaLabel={`Tirar do perfil ${perfil.nome}`}
        className="rounded-lg px-1.5 py-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
      >
        ✕
      </BotaoEnviar>
    </form>
  );
}

function FormCompletar({
  action,
  pessoaId,
  revendaId,
  perfil,
  primeiroNome,
  pedeLideranca,
}: {
  action: (formData: FormData) => void;
  pessoaId: string;
  revendaId: string;
  perfil: PerfilNaFicha;
  primeiroNome: string;
  pedeLideranca: boolean;
}) {
  const confirmar = useConfirmarEnvio();
  // Perfil de liderança num colaborador é promoção -- não se completa por
  // aqui, sem a caixa vermelha. O caminho é "Tornar liderança", acima.
  if (pedeLideranca) {
    return (
      <span className="rounded-full bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700">
        faltam {perfil.faltando}
      </span>
    );
  }
  return (
    <form
      action={action}
      onSubmit={confirmar({
        titulo: `Completar ${primeiroNome} com o perfil "${perfil.nome}"?`,
        detalhe: `Entram os ${perfil.faltando} acesso(s) do perfil que faltam. Nada é retirado.`,
        confirmar: "Completar",
        perigo: false,
      })}
    >
      <input type="hidden" name="revenda" value={revendaId} />
      <input type="hidden" name="colaborador_id" value={pessoaId} />
      <input type="hidden" name="perfil_id" value={perfil.id} />
      <BotaoEnviar
        textoEnviando="..."
        title="O perfil dá acessos que a pessoa não tem"
        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
      >
        faltam {perfil.faltando} · completar
      </BotaoEnviar>
    </form>
  );
}

function FormEntrar({
  action,
  pessoaId,
  primeiroNome,
  ehColaborador,
  revendaId,
  disponiveis,
}: {
  action: (formData: FormData) => void;
  pessoaId: string;
  primeiroNome: string;
  ehColaborador: boolean;
  revendaId: string;
  disponiveis: { id: string; nome: string; tipo: TipoDePerfil }[];
}) {
  const [perfilId, setPerfilId] = useState("");
  const [confirmou, setConfirmou] = useState(false);
  const confirmar = useConfirmarEnvio();
  const perfil = disponiveis.find((p) => p.id === perfilId);
  // A promoção nunca acontece em silêncio (10/09/2026): perfil de
  // liderança num colaborador pede a caixa vermelha, e o servidor recusa
  // sem ela.
  const promove = !!perfil && perfil.tipo === "lideranca" && ehColaborador;

  return (
    <form
      action={action}
      onSubmit={
        perfil
          ? confirmar({
              titulo: promove
                ? `Tornar ${primeiroNome} liderança com "${perfil.nome}"?`
                : `Colocar ${primeiroNome} no perfil "${perfil.nome}"?`,
              detalhe:
                "Entram os acessos do perfil que ela ainda não tem. Nada é retirado." +
                (promove ? ` ${primeiroNome} passa a entrar no Modo Liderança.` : ""),
              confirmar: promove ? "Tornar liderança" : "Colocar no perfil",
              perigo: promove,
            })
          : undefined
      }
      className="mt-3 border-t border-slate-100 pt-3"
    >
      <input type="hidden" name="revenda" value={revendaId} />
      <input type="hidden" name="colaborador_id" value={pessoaId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="perfil_id"
          required
          value={perfilId}
          onChange={(e) => {
            setPerfilId(e.target.value);
            setConfirmou(false);
          }}
          aria-label="Perfil para colocar a pessoa"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-2 text-base focus:border-primary focus:outline-none sm:text-sm"
        >
          <option value="">+ Colocar em outro perfil…</option>
          {(["colaborador", "lideranca"] as const).map((tipo) => {
            const doTipo = disponiveis.filter((p) => p.tipo === tipo);
            if (doTipo.length === 0) return null;
            return (
              <optgroup key={tipo} label={tipo === "colaborador" ? "📱 Módulos do app" : "⚙️ Modo Liderança"}>
                {doTipo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <BotaoEnviar
          textoEnviando="Aplicando..."
          disabled={!perfil || (promove && !confirmou)}
          className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white ${
            promove ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-dark"
          }`}
        >
          {promove ? "Tornar liderança" : "Colocar"}
        </BotaoEnviar>
      </div>
      {promove && (
        <label className="mt-2 flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-xs leading-snug text-red-900">
          <input
            type="checkbox"
            name="tornar_lideranca"
            checked={confirmou}
            onChange={(e) => setConfirmou(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            <strong>{primeiroNome} é colaborador.</strong> Este é um perfil de Modo Liderança: aplicá-lo faz{" "}
            {primeiroNome} <strong>entrar no Modo Liderança</strong>. Confirmo que é isso mesmo.
          </span>
        </label>
      )}
    </form>
  );
}

function FormEspelhar({
  action,
  pessoaId,
  primeiroNome,
  revendaId,
  perfil,
  sobra,
}: {
  action: (formData: FormData) => void;
  pessoaId: string;
  primeiroNome: string;
  revendaId: string;
  perfil: PerfilNaFicha;
  sobra: string[];
}) {
  const confirmar = useConfirmarEnvio();
  return (
    <form
      action={action}
      onSubmit={confirmar({
        titulo: `${primeiroNome} vai PERDER ${sobra.length} acesso(s) individual(is)`,
        detalhe:
          `Ficam só os acessos do perfil "${perfil.nome}". Saem: ` +
          sobra.slice(0, 6).join("; ") +
          (sobra.length > 6 ? ` e mais ${sobra.length - 6}.` : "."),
        confirmar: `Retirar ${sobra.length}`,
        perigo: true,
      })}
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
    >
      <input type="hidden" name="revenda" value={revendaId} />
      <input type="hidden" name="colaborador_id" value={pessoaId} />
      <input type="hidden" name="perfil_id" value={perfil.id} />
      <input type="hidden" name="modo" value="espelhar" />
      <BotaoEnviar
        textoEnviando="Aplicando..."
        className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
      >
        Deixar {primeiroNome} igual ao perfil
      </BotaoEnviar>
      <span className="text-[11px] text-slate-500">
        Tira os {sobra.length} acesso(s) individual(is) de{" "}
        {perfil.tipo === "colaborador" ? "módulos do app" : "Modo Liderança"}.
      </span>
    </form>
  );
}
