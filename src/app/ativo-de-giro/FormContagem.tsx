"use client";

import { useEffect, useRef, useState } from "react";
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
  type LinhaContagem,
  type Status,
  type Tipo,
} from "@/lib/ativo-giro";
import { editarContagem } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * A combinação com que o formulário deve nascer.
 *
 * No servidor vem do cookie, via prop. No navegador lemos o MESMO cookie
 * de novo -- e pela mesma função, `lerCombinacao`, para os dois lados não
 * voltarem a discordar sobre como desembrulhar o valor.
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
 * O `useFormStatus` só enxerga submissão feita pelo `action` do form. Isso
 * agora vale só para a edição: o lançamento não espera resposta nenhuma,
 * então nunca fica "salvando".
 */
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
 * O formulário serve para lançar e para corrigir, e os dois modos são
 * excludentes -- daí a união: ou vem `contagem` + `aoCancelar` (corrigir),
 * ou vem `ultima` + `aoLancar` (lançar).
 */
/** O que um pedido de recontagem força no formulário -- só os campos que ele fixou. */
type Foco = { valores: Partial<Combinacao>; sinal: number };

type Props = { fatores: Fatores } & (
  | {
      /** Corrigindo uma linha que já existe no banco. */
      contagem: Contagem;
      aoCancelar: () => void;
      ultima?: never;
      aoLancar?: never;
      foco?: never;
    }
  | {
      contagem?: never;
      aoCancelar?: never;
      /** Combinação do último lançamento, vinda do servidor (cookie). */
      ultima: Combinacao;
      /** Entrega a linha a quem cuida da lista. Não devolve promessa: o
       *  formulário não espera pelo servidor. */
      aoLancar: (dados: FormData, linha: LinhaContagem) => void;
      /** Um pedido de recontagem que acabou de ser aceito -- reabre o
       *  formulário nos campos que o pedido fixou. */
      foco?: Foco | null;
    }
);

/**
 * Lançar e corrigir, no mesmo formulário.
 *
 * **O lançamento não espera pelo servidor.** Ao submeter, a linha é
 * entregue a quem cuida da lista, o formulário limpa e o foco volta para
 * Paletes -- tudo no mesmo quadro. Quem lança quinze linhas seguidas não
 * paga quinze esperas de rede; o envio corre atrás, e a lista mostra o
 * que ainda está a caminho. Só a conferência do que o servidor pode
 * recusar por conta do formulário fica aqui, ANTES de limpar: se a
 * quantidade estiver zerada ou quebrada, nada é enviado e nada se perde.
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
 * Na edição o fluxo antigo continua no `action`: ali a ação é uma server
 * action de verdade, termina em redirect e o formulário desmonta -- não
 * há estado para o reset estragar, e o redirect é o fim natural de uma
 * correção.
 */
export function FormContagem(props: Props) {
  const { fatores, contagem, aoCancelar, aoLancar, foco } = props;
  const editando = Boolean(contagem);
  const toast = useToast();

  // Inicializador preguiçoso: roda só na montagem.
  const [combo, setCombo] = useState<Combinacao>(() =>
    contagem
      ? {
          tipo: contagem.tipo as Tipo,
          formato: contagem.formato as Formato,
          status: contagem.status as Status,
        }
      : combinacaoInicial(props.ultima ?? COMBINACAO_PADRAO),
  );
  const { tipo, formato, status } = combo;
  const trocar = (qual: keyof Combinacao) => (valor: string) => {
    const novo = { ...combo, [qual]: valor };
    setCombo(novo);
    // Na edição o cookie não se mexe: corrigir uma linha antiga não muda a
    // combinação em que os PRÓXIMOS lançamentos vão nascer.
    if (!editando) lembrarNoNavegador(novo);
  };

  const [data, setData] = useState(contagem?.data ?? hojeISO());
  const [palete, setPalete] = useState(contagem ? String(contagem.palete) : "");
  const [lastro, setLastro] = useState(contagem ? String(contagem.lastro) : "");
  const [caixa, setCaixa] = useState(contagem ? String(contagem.caixa) : "");

  const campoPalete = useRef<HTMLInputElement>(null);

  // Um pedido de recontagem aceito força só os campos que ele fixou --
  // tipo/status ficam como estavam quando o pedido pediu "qualquer". O
  // `sinal` (e não `foco` inteiro) é a dependência porque o objeto nasce
  // de novo a cada render de quem chama; sem isto o efeito repetiria a
  // cada toque em Paletes.
  useEffect(() => {
    if (!foco) return;
    setCombo((atual) => {
      const novo = { ...atual, ...foco.valores };
      if (!editando) lembrarNoNavegador(novo);
      return novo;
    });
    campoPalete.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.sinal]);

  const quantidades = {
    palete: Number(palete || 0),
    lastro: Number(lastro || 0),
    caixa: Number(caixa || 0),
  };

  const lancar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!aoLancar) return;

    const { palete: p, lastro: l, caixa: c } = quantidades;
    const inteiras = [p, l, c].every((n) => Number.isInteger(n) && n >= 0);
    if (!inteiras) {
      toast.erro("Quantidade inválida: use números inteiros, sem vírgula.");
      campoPalete.current?.focus();
      return;
    }
    if (p + l + c === 0) {
      toast.erro("Informe ao menos um palete, lastro ou caixa.");
      campoPalete.current?.focus();
      return;
    }

    // O FormData sai do formulário ANTES de limpar -- daqui a três linhas
    // os campos estarão vazios.
    aoLancar(new FormData(e.currentTarget), {
      data,
      tipo,
      formato,
      status,
      palete: p,
      lastro: l,
      caixa: c,
    });

    // Tipo, formato, status e data ficam. Só a quantidade zera, e o foco
    // volta para Paletes: a próxima linha do pátio começa a um toque de
    // distância.
    setPalete("");
    setLastro("");
    setCaixa("");
    campoPalete.current?.focus();
  };

  const fator = fatores[formato];
  const total = totalEmCaixas(quantidades, fator);

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
          value={data}
          onChange={(e) => setData(e.target.value)}
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
