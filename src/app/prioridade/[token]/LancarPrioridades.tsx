"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DIAS_A_FRENTE,
  MOTIVO_MAX,
  codigoDoPdv,
  dataCurta,
  incluirNoRascunho,
  lerRascunho,
  motivoLimpo,
  problemaDoItem,
  rotuloDoGv,
  somarDias,
  type Gv,
  type ItemDoRascunho,
} from "@/lib/prioridades";
import { conferirPdv, enviadasDoGv, enviarPrioridades, type Enviada } from "../actions";

/**
 * O FORMULÁRIO DO GV -- feito para o celular e para a pressa.
 *
 * Dois campos e um botão: código, motivo, "Incluir". Cada prioridade
 * incluída vai NA HORA para o aparelho (localStorage), antes de qualquer
 * envio: fechar a aba, perder o sinal ou a bateria acabar não perde a
 * lista. "Enviar" manda tudo de uma vez; só o que o servidor confirmou sai
 * da lista do aparelho.
 *
 * O nome do PDV aparece enquanto o código é digitado, para o GV ver na
 * hora que errou um número -- o erro mais comum, e o que mais custa: a
 * prioridade vai para o cliente errado e ninguém percebe.
 */

type Rascunho = { data: string; itens: ItemDoRascunho[] };
/** O código consultado e o que a base respondeu (`falhou` = não deu para consultar). */
type Conferido = { cod: string; nome: string | null; cidade: string | null; falhou?: boolean } | null;

const chave = (token: string, o: string) => `prioridades:${o}:${token}`;

function ler<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function gravar(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export function LancarPrioridades({
  token,
  revendaNome,
  gvs,
  hoje,
  entregaPadrao,
}: {
  token: string;
  revendaNome: string;
  gvs: Gv[];
  hoje: string;
  entregaPadrao: string;
}) {
  const [pronto, setPronto] = useState(false);
  const [gv, setGv] = useState("");
  const [data, setData] = useState(entregaPadrao);
  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [guardou, setGuardou] = useState(true);
  const [cod, setCod] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivosUsados, setMotivosUsados] = useState<string[]>([]);
  const [conferido, setConferido] = useState<Conferido>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadas, setEnviadas] = useState<{ gv: string; data: string; lista: Enviada[] } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [empresa, setEmpresa] = useState("");
  const codRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLInputElement>(null);

  // O que estava guardado no aparelho. Data de entrega que já passou volta
  // para a padrão: a lista continua, a data é que estava velha.
  useEffect(() => {
    const salvoGv = ler<string>(chave(token, "gv"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do aparelho, depois da hidratação
    if (salvoGv && gvs.some((g) => g.nome === salvoGv)) setGv(salvoGv);
    const r = ler<Rascunho>(chave(token, "rascunho"));
    if (r) {
      setItens(lerRascunho(r.itens));
      if (typeof r.data === "string" && r.data >= hoje) setData(r.data);
    }
    const m = ler<string[]>(chave(token, "motivos"));
    if (Array.isArray(m)) setMotivosUsados(m.filter((x) => typeof x === "string").slice(0, 12));
    setPronto(true);
  }, [token, gvs, hoje]);

  const guardar = useCallback(
    (novosItens: ItemDoRascunho[], novaData: string) => {
      setGuardou(gravar(chave(token, "rascunho"), { data: novaData, itens: novosItens } satisfies Rascunho));
    },
    [token],
  );

  // O que este GV já mandou para a data -- a prova de que chegou. Guarda
  // de quem e de que dia é a lista, para trocar o GV ou a data não mostrar
  // a lista anterior enquanto a nova chega.
  // `recarga` sobe depois de cada envio, para a lista ser lida de novo.
  useEffect(() => {
    if (!pronto || !gv) return;
    let vale = true;
    void enviadasDoGv(token, gv, data).then((lista) => {
      if (vale) setEnviadas({ gv, data, lista: lista ?? [] });
    });
    return () => {
      vale = false;
    };
  }, [pronto, gv, data, token, recarga]);

  // O nome do PDV enquanto digita (espera o dedo parar). O resultado guarda
  // o código consultado: a tela só mostra o nome se ele for o do campo.
  useEffect(() => {
    const c = codigoDoPdv(cod);
    if (!c || c.length < 2) return;
    let vale = true;
    const t = setTimeout(async () => {
      const r = await conferirPdv(token, c);
      if (!vale) return;
      setConferido(r.ok ? { cod: c, nome: r.nome, cidade: r.cidade } : { cod: c, nome: null, cidade: null, falhou: true });
    }, 350);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [cod, token]);

  function escolherGv(nome: string) {
    setGv(nome);
    gravar(chave(token, "gv"), nome);
  }

  function mudarData(nova: string) {
    if (!nova) return;
    setData(nova);
    guardar(itens, nova);
  }

  function incluir(e?: React.FormEvent) {
    e?.preventDefault();
    const problema = problemaDoItem(cod, motivo);
    if (problema) {
      setAviso({ tipo: "erro", texto: problema });
      (codigoDoPdv(cod) ? motivoRef : codRef).current?.focus();
      return;
    }
    const c = codigoDoPdv(cod)!;
    const m = motivoLimpo(motivo);
    const nome = conferido?.cod === c ? conferido.nome : null;
    const naBase = conferido?.cod === c && !conferido.falhou && !conferido.nome;
    const { lista, substituiu } = incluirNoRascunho(itens, { cod: c, motivo: m, nome });
    setItens(lista);
    guardar(lista, data);
    const usados = [m, ...motivosUsados.filter((x) => x.toLowerCase() !== m.toLowerCase())].slice(0, 12);
    setMotivosUsados(usados);
    gravar(chave(token, "motivos"), usados);
    setAviso({
      tipo: "ok",
      texto:
        (substituiu ? `PDV ${c} já estava na lista: motivo trocado.` : `PDV ${c} incluído.`) +
        (naBase ? " Atenção: esse código não está na base de clientes." : ""),
    });
    setCod("");
    setMotivo("");
    codRef.current?.focus();
  }

  function tirar(c: string) {
    const lista = itens.filter((i) => i.cod !== c);
    setItens(lista);
    guardar(lista, data);
  }

  async function enviar() {
    if (!gv) {
      setAviso({ tipo: "erro", texto: "Escolha o seu nome na lista de GVs." });
      return;
    }
    if (itens.length === 0) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await enviarPrioridades({ token, gv, data, itens: itens.map(({ cod, motivo }) => ({ cod, motivo })), empresa });
      if (!r.ok) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      // Sai da lista do aparelho só o que o servidor confirmou (gravado
      // agora ou já na lista do dia). O resto continua guardado.
      const resolvidos = new Set([...r.gravadas, ...r.jaEstavam.map((j) => j.cod)]);
      const sobra = itens.filter((i) => !resolvidos.has(i.cod));
      setItens(sobra);
      guardar(sobra, data);
      const outros = r.jaEstavam.filter((j) => j.gv !== gv);
      setAviso({
        tipo: "ok",
        texto:
          r.mensagem +
          (outros.length ? ` Já lançados por outro GV: ${outros.map((o) => `${o.cod} (${o.gv})`).join(", ")}.` : ""),
      });
      setRecarga((n) => n + 1);
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão. A lista continua guardada neste aparelho: tente enviar de novo." });
    } finally {
      setEnviando(false);
    }
  }

  if (gvs.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        A lista de GVs da {revendaNome} ainda não foi cadastrada. Avise a logística.
      </p>
    );
  }

  const codValido = codigoDoPdv(cod);
  const consultaDoCampo = codValido && codValido.length >= 2 ? (conferido?.cod === codValido ? conferido : "procurando") : null;
  const enviadasDaTela = enviadas && enviadas.gv === gv && enviadas.data === data ? enviadas.lista : null;

  return (
    <div className="space-y-4 pb-28">
      {/* ---- Quem e para quando ---- */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={rotulo} htmlFor="pr-gv">
            Quem está lançando
          </label>
          <select id="pr-gv" className={campo} value={gv} onChange={(e) => escolherGv(e.target.value)}>
            <option value="">Escolha o seu nome</option>
            {gvs.map((g) => (
              <option key={g.nome} value={g.nome}>
                {rotuloDoGv(g)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo} htmlFor="pr-data">
            Entrega em <span className="font-normal normal-case text-slate-400">({dataCurta(data)})</span>
          </label>
          <input
            id="pr-data"
            type="date"
            className={campo}
            value={data}
            min={hoje}
            max={somarDias(hoje, DIAS_A_FRENTE)}
            onChange={(e) => mudarData(e.target.value)}
          />
        </div>
      </section>

      {/* ---- Incluir ---- */}
      <form onSubmit={incluir} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={rotulo} htmlFor="pr-cod">
            Código do PDV
          </label>
          <input
            id="pr-cod"
            ref={codRef}
            className={campo}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Ex.: 4510"
            value={cod}
            onChange={(e) => setCod(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                motivoRef.current?.focus();
              }
            }}
          />
          <p className="mt-1 min-h-[1.25rem] text-sm">
            {consultaDoCampo === "procurando" ? (
              <span className="text-slate-400">Procurando…</span>
            ) : consultaDoCampo?.nome ? (
              <span className="font-semibold text-emerald-700">
                {consultaDoCampo.nome}
                {consultaDoCampo.cidade ? <span className="font-normal text-slate-500"> · {consultaDoCampo.cidade}</span> : null}
              </span>
            ) : consultaDoCampo && !consultaDoCampo.falhou ? (
              <span className="text-amber-700">Não achei esse código na base de clientes. Confira o número.</span>
            ) : null}
          </p>
        </div>
        <div>
          <label className={rotulo} htmlFor="pr-motivo">
            Motivo da prioridade
          </label>
          <input
            id="pr-motivo"
            ref={motivoRef}
            className={campo}
            list="pr-motivos"
            maxLength={MOTIVO_MAX}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Por que esse PDV precisa sair primeiro"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <datalist id="pr-motivos">
            {motivosUsados.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        {/* Armadilha de robô: invisível para gente, preenchida por script. */}
        <input
          type="text"
          name="empresa"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
        />
        <button type="submit" className="w-full rounded-xl border-2 border-primary bg-white px-4 py-3 text-base font-bold text-primary-dark hover:bg-primary-soft">
          Incluir na lista
        </button>
      </form>

      {aviso && (
        <p
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            aviso.tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {/* ---- A enviar ---- */}
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
            A enviar <span className="text-slate-400">({itens.length})</span>
          </h2>
          {pronto && itens.length > 0 && (
            <span className={`text-xs ${guardou ? "text-slate-400" : "font-semibold text-red-700"}`}>
              {guardou ? "Guardado neste aparelho" : "Este navegador não deixou guardar: envie antes de fechar"}
            </span>
          )}
        </div>
        {itens.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma prioridade na lista. Inclua acima e envie tudo de uma vez.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {itens.map((i) => (
              <li key={i.cod} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {i.cod}
                    {i.nome ? <span className="font-normal text-slate-600"> · {i.nome}</span> : null}
                  </p>
                  <p className="text-sm text-slate-600">{i.motivo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => tirar(i.cod)}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Já enviadas ---- */}
      {gv && enviadasDaTela && enviadasDaTela.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-slate-600">
            Já enviadas para {dataCurta(data)} <span className="text-slate-400">({enviadasDaTela.length})</span>
          </h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-emerald-200 bg-emerald-50/50">
            {enviadasDaTela.map((e) => (
              <li key={e.cod} className="px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-900">
                  {e.cod}
                  {e.nome ? <span className="font-normal text-slate-600"> · {e.nome}</span> : null}
                  <span className="float-right text-xs font-normal text-slate-400">
                    {new Date(e.enviadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
                <p className="text-sm text-slate-600">{e.motivo}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Enviar (preso no rodapé, à mão do polegar) ---- */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || itens.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-md hover:bg-primary-dark disabled:bg-slate-300 disabled:shadow-none"
          >
            {enviando
              ? "Enviando…"
              : itens.length === 0
                ? "Nada para enviar"
                : `Enviar ${itens.length} ${itens.length === 1 ? "prioridade" : "prioridades"} para ${dataCurta(data)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
