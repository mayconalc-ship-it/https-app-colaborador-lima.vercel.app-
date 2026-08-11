"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@/components/Toast";
import {
  COMBINACAO_PADRAO,
  FORMATOS,
  STATUSES,
  TIPOS,
  hojeISO,
  totalEmCaixas,
  type Combinacao,
  type Contagem,
  type Fatores,
  type Formato,
  type Status,
  type Tipo,
} from "@/lib/ativo-giro";
import {
  editarContagem,
  registrarContagem,
  type EstadoContagem,
} from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * A combinação com que o formulário deve nascer.
 *
 * No servidor vem do cookie, via prop. No navegador lemos o MESMO cookie
 * de novo, e a razão é sutil: ao salvar, a página é re-renderizada e este
 * formulário remonta. Se ele reinicializasse pela prop, voltaria à
 * combinação de quando a tela abriu -- perdendo justamente a que a pessoa
 * acabou de usar. O cookie já foi atualizado pela ação, então lê-lo aqui
 * devolve o valor certo.
 *
 * Na primeira renderização os dois lados leem o mesmo cookie e chegam ao
 * mesmo valor, então não há divergência de hidratação.
 */
function combinacaoInicial(ultima: Combinacao): Combinacao {
  if (typeof document === "undefined") return ultima;

  const bruto = document.cookie.match(/(?:^|;\s*)ag_ultima=([^;]*)/)?.[1];
  if (!bruto) return ultima;

  try {
    const v = JSON.parse(decodeURIComponent(bruto));
    if (
      TIPOS.includes(v?.tipo) &&
      FORMATOS.includes(v?.formato) &&
      STATUSES.includes(v?.status)
    ) {
      return { tipo: v.tipo, formato: v.formato, status: v.status };
    }
  } catch {
    // Cookie torto: segue com o que veio do servidor.
  }

  return ultima;
}

function Salvar({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && <span className="rodinha" aria-hidden="true" />}
      {pending
        ? "Salvando..."
        : editando
          ? "Salvar alterações"
          : "Registrar contagem"}
    </button>
  );
}

/**
 * Serve para lançar e para corrigir.
 *
 * No lançamento a ação RESPONDE (useActionState) em vez de redirecionar:
 * o formulário não desmonta, a página não recarrega, e por isso tipo,
 * formato, status e data continuam onde estavam. Só as quantidades são
 * limpas, e o foco volta para Paletes -- a próxima linha começa a um
 * toque de distância.
 *
 * Na edição o fluxo antigo continua: ali o redirect é desejável, porque
 * fechar o formulário e voltar para a lista é o fim natural da correção.
 */
export function FormContagem({
  fatores,
  contagem,
  ultima = COMBINACAO_PADRAO,
  aoCancelar,
}: {
  fatores: Fatores;
  contagem?: Contagem;
  /** Combinação do último lançamento, vinda do servidor (cookie). */
  ultima?: Combinacao;
  aoCancelar?: () => void;
}) {
  const editando = Boolean(contagem);
  const toast = useToast();

  // Inicializador preguiçoso: roda só na montagem, e na remontagem depois
  // de salvar pega o cookie já atualizado pela ação.
  const [combo, setCombo] = useState<Combinacao>(() =>
    contagem
      ? {
          tipo: contagem.tipo as Tipo,
          formato: contagem.formato as Formato,
          status: contagem.status as Status,
        }
      : combinacaoInicial(ultima),
  );
  const { tipo, formato, status } = combo;
  const trocar = (campo: keyof Combinacao) => (valor: string) =>
    setCombo((c) => ({ ...c, [campo]: valor }));

  const [palete, setPalete] = useState(contagem ? String(contagem.palete) : "");
  const [lastro, setLastro] = useState(contagem ? String(contagem.lastro) : "");
  const [caixa, setCaixa] = useState(contagem ? String(contagem.caixa) : "");

  const campoPalete = useRef<HTMLInputElement>(null);

  // Limpar e avisar acontece AQUI, no retorno da ação, e não num efeito
  // que observa o estado: é o lugar que o React indica para reagir a algo
  // que aconteceu, e evita a cascata de renderizações do efeito.
  const [, enviar] = useActionState(
    async (anterior: EstadoContagem, dados: FormData) => {
      const r = await registrarContagem(anterior, dados);

      if (r.situacao === "ok") {
        toast.sucesso("Contagem registrada!");
        // Tipo, formato, status e data ficam. Só a quantidade zera, e o
        // foco volta para Paletes: a próxima linha do pátio começa a um
        // toque de distância.
        setPalete("");
        setLastro("");
        setCaixa("");
        campoPalete.current?.focus();
      } else if (r.situacao === "erro") {
        toast.erro(r.mensagem);
      }

      return r;
    },
    { situacao: "parado" } as EstadoContagem,
  );

  const fator = fatores[formato];
  const total = totalEmCaixas(
    {
      palete: Number(palete || 0),
      lastro: Number(lastro || 0),
      caixa: Number(caixa || 0),
    },
    fator,
  );

  return (
    <form
      action={editando ? editarContagem : enviar}
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
    >
      {contagem && <input type="hidden" name="id" value={contagem.id} />}

      <div>
        <label className={rotulo} htmlFor="data">
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          defaultValue={contagem?.data ?? hojeISO()}
          className={campo}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo} htmlFor="tipo">
            Tipo
          </label>
          <select
            id="tipo"
            name="tipo"
            className={campo}
            value={tipo}
            onChange={(e) => trocar("tipo")(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="formato">
            Formato
          </label>
          <select
            id="formato"
            name="formato"
            className={campo}
            value={formato}
            onChange={(e) => trocar("formato")(e.target.value)}
          >
            {FORMATOS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={rotulo} htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          className={campo}
          value={status}
          onChange={(e) => trocar("status")(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={rotulo} htmlFor="palete">
            Paletes
          </label>
          <input
            id="palete"
            name="palete"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            ref={campoPalete}
            value={palete}
            onChange={(e) => setPalete(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="lastro">
            Lastros
          </label>
          <input
            id="lastro"
            name="lastro"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            value={lastro}
            onChange={(e) => setLastro(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={rotulo} htmlFor="caixa">
            Caixas
          </label>
          <input
            id="caixa"
            name="caixa"
            type="number"
            min={0}
            inputMode="numeric"
            className={campo}
            value={caixa}
            onChange={(e) => setCaixa(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        Fator {formato}: 1 palete = {fator.palete} cx · 1 lastro ={" "}
        {fator.lastro} cx
        <span className="mt-1 block text-lg font-bold text-slate-900">
          Total: {total} caixas
        </span>
      </p>

      <Salvar editando={editando} />

      {aoCancelar && (
        <button
          type="button"
          onClick={aoCancelar}
          className="w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}
