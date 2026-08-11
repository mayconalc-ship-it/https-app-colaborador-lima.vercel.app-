"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useToast } from "@/components/Toast";
import {
  COMBINACAO_PADRAO,
  COOKIE_ULTIMA,
  COOKIE_ULTIMA_DIAS,
  COOKIE_ULTIMA_PATH,
  FORMATOS,
  STATUSES,
  TIPOS,
  hojeISO,
  lerCombinacao,
  serializarCombinacao,
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

  const bruto = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE_ULTIMA}=`))
    ?.slice(COOKIE_ULTIMA.length + 1);

  // Cookie ausente ou torto: segue com o que veio do servidor.
  return lerCombinacao(bruto) ?? ultima;
}

/**
 * Guarda a combinação no mesmo cookie que o servidor lê, na hora em que a
 * pessoa troca o seletor -- e não só quando salva.
 *
 * É o que faz a escolha sobreviver a um recarregamento no meio do
 * lançamento: sem isto, quem trocasse para 300ml e recarregasse antes de
 * registrar voltava para 600ml.
 */
function lembrarNoNavegador(combinacao: Combinacao) {
  if (typeof document === "undefined") return;
  const idade = 60 * 60 * 24 * COOKIE_ULTIMA_DIAS;
  document.cookie = `${COOKIE_ULTIMA}=${serializarCombinacao(combinacao)}; path=${COOKIE_ULTIMA_PATH}; max-age=${idade}; samesite=lax`;
}

/**
 * O `useFormStatus` só enxerga submissão feita pelo `action` do form --
 * e o lançamento não usa mais `action` (veja o comentário do formulário).
 * Por isso o estado de "salvando" do lançamento chega por prop; o da
 * edição, que continua no `action`, vem do hook.
 */
function Salvar({
  editando,
  enviando = false,
}: {
  editando: boolean;
  enviando?: boolean;
}) {
  const { pending: doAction } = useFormStatus();
  const pending = doAction || enviando;
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
 * O lançamento é disparado no `onSubmit`, e NÃO pelo `action` do form.
 * Isso não é estilo: quando a submissão passa pelo `action`, o React
 * chama `form.reset()` sozinho ao fim da ação, direto no DOM. Num
 * formulário controlado como este, o reset desfaz o que acabamos de
 * fazer, e de um jeito que o React não percebe (o estado continua certo,
 * só a tela mente):
 *
 * - nos `<input>`, o React mantém o atributo `defaultValue` colado no
 *   valor atual, então o reset devolve a QUANTIDADE que a pessoa acabou
 *   de lançar -- os "5 paletes" reapareciam num campo que já devia
 *   estar zerado, prontos para entrar no banco de novo;
 * - nos `<select>`, o atributo `selected` só é escrito na montagem, então
 *   o reset volta para a combinação de quando a TELA ABRIU -- era assim
 *   que "300ml" virava "600ml" depois de registrar.
 *
 * Sem `action` não há reset automático, e o estado volta a ser a única
 * fonte da verdade da tela. Perdemos o funcionamento sem JavaScript, que
 * este caminho já não tinha: a ação passada ao `useActionState` é um
 * fecho do cliente, não uma server action que o navegador saiba postar.
 *
 * Na edição o fluxo antigo continua no `action`: ali a ação é uma server
 * action de verdade, termina em redirect e o formulário desmonta -- não
 * há estado para o reset estragar.
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
  const trocar = (qual: keyof Combinacao) => (valor: string) => {
    const novo = { ...combo, [qual]: valor };
    setCombo(novo);
    // Na edição o cookie não se mexe: corrigir uma linha antiga não muda a
    // combinação em que os PRÓXIMOS lançamentos vão nascer.
    if (!editando) lembrarNoNavegador(novo);
  };

  const [palete, setPalete] = useState(contagem ? String(contagem.palete) : "");
  const [lastro, setLastro] = useState(contagem ? String(contagem.lastro) : "");
  const [caixa, setCaixa] = useState(contagem ? String(contagem.caixa) : "");

  const campoPalete = useRef<HTMLInputElement>(null);

  // Limpar e avisar acontece AQUI, no retorno da ação, e não num efeito
  // que observa o estado: é o lugar que o React indica para reagir a algo
  // que aconteceu, e evita a cascata de renderizações do efeito.
  const [, enviar, enviando] = useActionState(
    async (anterior: EstadoContagem, dados: FormData) => {
      const r = await registrarContagem(anterior, dados);

      if (r.situacao === "ok") {
        toast.sucesso("Contagem registrada!");
        // Tipo, formato, status e data ficam -- reafirmados com o que a
        // ação ACABOU de gravar, e não com o que sobrou no estado.
        setCombo(r.combinacao);
        // Só a quantidade zera, e o foco volta para Paletes: a próxima
        // linha do pátio começa a um toque de distância.
        setPalete("");
        setLastro("");
        setCaixa("");
        campoPalete.current?.focus();
        campoPalete.current?.select();
      } else if (r.situacao === "erro") {
        toast.erro(r.mensagem);
      }

      return r;
    },
    { situacao: "parado" } as EstadoContagem,
  );

  // O FormData é montado ANTES da transição: depois dela o React já pode
  // ter mexido no formulário, e `e.currentTarget` some no evento reciclado.
  const lancar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enviando) return; // Toque duplo no pátio não vira duas contagens.
    const dados = new FormData(e.currentTarget);
    startTransition(() => enviar(dados));
  };

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
      action={editando ? editarContagem : undefined}
      onSubmit={editando ? undefined : lancar}
      // Sem isto o navegador REPÕE as quantidades quando a aba é
      // recarregada ou restaurada -- e a contagem anterior reaparecia num
      // formulário que já devia estar limpo, pronta para ser lançada duas
      // vezes.
      autoComplete="off"
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
            autoComplete="off"
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
            autoComplete="off"
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
            autoComplete="off"
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

      <Salvar editando={editando} enviando={enviando} />

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
