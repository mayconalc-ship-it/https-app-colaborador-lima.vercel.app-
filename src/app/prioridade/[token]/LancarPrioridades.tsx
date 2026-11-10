"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DIAS_A_FRENTE,
  MOTIVO_MAX,
  NOME_NOVO_MAX,
  codigoDoPdv,
  dataCurta,
  incluirNoRascunho,
  lerRascunho,
  motivoLimpo,
  nomeLimpo,
  SEM_GV,
  problemaDoItem,
  somarDias,
  type ItemDoRascunho,
  type PdvAchado,
} from "@/lib/prioridades";
import { buscarPdvs, enviadasDoDia, enviarPrioridades, type Enviada } from "../actions";

/**
 * O FORMULÁRIO DO GV -- feito para o celular e para a pressa.
 *
 * Dois campos e um botão: código, motivo, "Incluir". Cada prioridade
 * incluída vai NA HORA para o aparelho (localStorage), antes de qualquer
 * envio: fechar a aba, perder o sinal ou a bateria acabar não perde a
 * lista. "Enviar" manda tudo de uma vez; só o que o servidor confirmou sai
 * da lista do aparelho.
 *
 * O CÓDIGO funciona como os filtros de produto do app: ao digitar, abre a
 * lista dos PDVs que começam com aqueles números, com nome e cidade, e o
 * GV toca no certo. É também o que mostra na hora que ele errou um número
 * -- o erro mais comum, e o que mais custa: a prioridade vai para o
 * cliente errado e ninguém percebe.
 *
 * O MOTIVO é lista suspensa (pedido do dono, 03/11/2026), com "Outro"
 * para o caso que a lista não cobre. O motivo escolhido FICA depois de
 * incluir: numa leva de PDVs pelo mesmo motivo, é só trocar o código.
 */

type Rascunho = { data: string; itens: ItemDoRascunho[] };
/** O código buscado e o que a base respondeu (`falhou` = não deu para consultar). */
type Busca = { cod: string; achados: PdvAchado[]; falhou?: boolean } | null;

const OUTRO = "__outro__";
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

function SeloNovo() {
  return <span className="ml-2 rounded-md bg-sky-100 px-1.5 py-0.5 align-middle text-[11px] font-bold uppercase text-sky-800">PDV novo</span>;
}

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

export function LancarPrioridades({
  token,
  motivos,
  hoje,
  entregaPadrao,
}: {
  token: string;
  motivos: string[];
  hoje: string;
  entregaPadrao: string;
}) {
  const [pronto, setPronto] = useState(false);
  const [data, setData] = useState(entregaPadrao);
  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [guardou, setGuardou] = useState(true);
  const [cod, setCod] = useState("");
  const [busca, setBusca] = useState<Busca>(null);
  const [escolhido, setEscolhido] = useState<PdvAchado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [motivoSel, setMotivoSel] = useState("");
  const [motivoLivre, setMotivoLivre] = useState("");
  const [novo, setNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviadas, setEnviadas] = useState<{ data: string; lista: Enviada[] } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [empresa, setEmpresa] = useState("");
  const codRef = useRef<HTMLInputElement>(null);
  const motivoRef = useRef<HTMLSelectElement>(null);
  const livreRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);

  // O que estava guardado no aparelho. Data de entrega que já passou volta
  // para a padrão: a lista continua, a data é que estava velha.
  useEffect(() => {
    const r = ler<Rascunho>(chave(token, "rascunho"));
    if (r) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do aparelho, depois da hidratação
      setItens(lerRascunho(r.itens));
      if (typeof r.data === "string" && r.data >= hoje) setData(r.data);
    }
    setPronto(true);
  }, [token, hoje]);

  // Tocar fora da lista de PDVs fecha a lista.
  useEffect(() => {
    function fora(e: MouseEvent | TouchEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("touchstart", fora);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("touchstart", fora);
    };
  }, []);

  const guardar = useCallback(
    (novosItens: ItemDoRascunho[], novaData: string) => {
      setGuardou(gravar(chave(token, "rascunho"), { data: novaData, itens: novosItens } satisfies Rascunho));
    },
    [token],
  );

  // O que já chegou para a data, de todos os GVs -- a prova de que o envio
  // entrou. Guarda de que dia é a lista, para trocar a data não mostrar a
  // anterior enquanto a nova chega. `recarga` sobe depois de cada envio.
  useEffect(() => {
    if (!pronto) return;
    let vale = true;
    void enviadasDoDia(token, data)
      .then((lista) => {
        if (vale) setEnviadas({ data, lista: lista ?? [] });
      })
      .catch(() => {});
    return () => {
      vale = false;
    };
  }, [pronto, data, token, recarga]);

  // Os PDVs que começam com o código (espera o dedo parar). O resultado
  // guarda o código buscado: a tela só usa a lista se ela for a do campo.
  useEffect(() => {
    const c = codigoDoPdv(cod);
    if (!c || c.length < 2) return;
    let vale = true;
    const t = setTimeout(async () => {
      try {
        const r = await buscarPdvs(token, c);
        if (vale) setBusca(r.ok ? { cod: c, achados: r.achados } : { cod: c, achados: [], falhou: true });
      } catch {
        if (vale) setBusca({ cod: c, achados: [], falhou: true });
      }
    }, 300);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [cod, token]);

  function mudarData(nova: string) {
    if (!nova) return;
    setData(nova);
    guardar(itens, nova);
  }

  function digitarCodigo(valor: string) {
    setCod(valor.replace(/\D/g, "").slice(0, 12));
    setAberto(true);
  }

  function escolherPdv(p: PdvAchado) {
    setCod(p.cod);
    setEscolhido(p);
    setAberto(false);
    motivoRef.current?.focus();
  }

  function escolherMotivo(valor: string) {
    setMotivoSel(valor);
    if (valor === OUTRO) requestAnimationFrame(() => livreRef.current?.focus());
  }

  const codValido = codigoDoPdv(cod);
  const buscaDoCampo = codValido && codValido.length >= 2 ? (busca?.cod === codValido ? busca : "procurando") : null;
  const achados = buscaDoCampo && buscaDoCampo !== "procurando" ? buscaDoCampo.achados : [];
  // O PDV do código digitado: o tocado na lista, ou o de código exato.
  const pdvDoCampo =
    escolhido && escolhido.cod === codValido ? escolhido : (achados.find((a) => a.cod === codValido) ?? null);
  const motivo = motivoSel === OUTRO ? motivoLivre : motivoSel;
  // Código que não achou ninguém na base (ou a busca falhou): aí aparece a
  // caixa "PDV novo". Achou o PDV = não é novo, mesmo que a caixa ficou marcada.
  const semPdvNaBase = !!codValido && codValido.length >= 2 && buscaDoCampo !== "procurando" && !pdvDoCampo;
  const ehNovo = novo && semPdvNaBase;

  function incluir(e?: React.FormEvent) {
    e?.preventDefault();
    const problema = !motivoSel && codValido ? "Escolha o motivo da prioridade." : problemaDoItem(cod, motivo);
    if (problema) {
      setAviso({ tipo: "erro", texto: problema });
      if (!codValido) codRef.current?.focus();
      else if (motivoSel === OUTRO) livreRef.current?.focus();
      else motivoRef.current?.focus();
      return;
    }
    const c = codValido!;
    const m = motivoLimpo(motivo);
    const foraDaBase = !ehNovo && buscaDoCampo !== "procurando" && buscaDoCampo !== null && !buscaDoCampo.falhou && !pdvDoCampo;
    const item: ItemDoRascunho = ehNovo
      ? { cod: c, motivo: m, nome: nomeLimpo(nomeNovo), novo: true }
      : { cod: c, motivo: m, nome: pdvDoCampo?.nome ?? null, gv: pdvDoCampo?.gv ?? null };
    const { lista, substituiu } = incluirNoRascunho(itens, item);
    setItens(lista);
    guardar(lista, data);
    setAviso({
      tipo: "ok",
      texto:
        (substituiu ? `PDV ${c} já estava na lista: motivo trocado.` : `PDV ${c} incluído${ehNovo ? " como PDV novo" : ""}.`) +
        (foraDaBase ? " Atenção: esse código não está na base de clientes. Se for PDV novo, tire e inclua de novo marcando PDV novo." : ""),
    });
    setCod("");
    setEscolhido(null);
    setAberto(false);
    setNovo(false);
    setNomeNovo("");
    if (motivoSel === OUTRO) setMotivoLivre("");
    codRef.current?.focus();
  }

  function tirar(c: string) {
    const lista = itens.filter((i) => i.cod !== c);
    setItens(lista);
    guardar(lista, data);
  }

  async function enviar() {
    if (itens.length === 0) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await enviarPrioridades({
        token,
        data,
        itens: itens.map(({ cod, motivo, nome, novo }) => (novo ? { cod, motivo, novo: true, nome } : { cod, motivo })),
        empresa,
      });
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
      setAviso({
        tipo: "ok",
        texto:
          r.mensagem +
          (r.jaEstavam.length ? ` Já estavam: ${r.jaEstavam.map((o) => `${o.cod} (${o.gv})`).join(", ")}.` : ""),
      });
      setRecarga((n) => n + 1);
    } catch {
      setAviso({ tipo: "erro", texto: "Sem conexão. A lista continua guardada neste aparelho: tente enviar de novo." });
    } finally {
      setEnviando(false);
    }
  }

  const enviadasDaTela = enviadas && enviadas.data === data ? enviadas.lista : null;
  // Sem nenhum PDV para mostrar, a lista não abre: o aviso fica debaixo do
  // campo, junto da caixa "PDV novo", sem nada por cima dela.
  const semAchados = buscaDoCampo !== null && buscaDoCampo !== "procurando" && !buscaDoCampo.falhou && achados.length === 0;
  const listaAberta = aberto && buscaDoCampo !== null && !semAchados && !(escolhido && escolhido.cod === codValido);

  return (
    <div className="space-y-4 pb-28">
      {/* ---- Para quando (o GV sai da base, pelo código do PDV) ---- */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
        <div ref={caixaRef} className="relative">
          <label className={rotulo} htmlFor="pr-cod">
            Código do PDV
          </label>
          <input
            id="pr-cod"
            ref={codRef}
            className={`${campo} tabular-nums ${pdvDoCampo ? "border-emerald-400 bg-emerald-50/40" : ""}`}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Digite o código"
            value={cod}
            onChange={(e) => digitarCodigo(e.target.value)}
            onFocus={() => setAberto(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAberto(false);
              if (e.key === "Enter") {
                // Enter escolhe o PDV de código exato (ou o único da lista)
                // e segue para o motivo; nunca inclui pela metade.
                e.preventDefault();
                const unico = pdvDoCampo ?? (achados.length === 1 ? achados[0] : null);
                if (unico) escolherPdv(unico);
                else motivoRef.current?.focus();
              }
            }}
          />

          {listaAberta && (
            <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {buscaDoCampo === "procurando" ? (
                <p className="p-3 text-sm text-slate-400">Buscando...</p>
              ) : buscaDoCampo.falhou ? (
                <p className="p-3 text-sm text-slate-500">Não deu para buscar agora. Pode incluir pelo código mesmo.</p>
              ) : achados.length === 0 ? (
                <p className="p-3 text-sm text-amber-800">Nenhum PDV com esse código na base de clientes. Confira o número.</p>
              ) : (
                achados.map((p) => (
                  <button
                    key={p.cod}
                    type="button"
                    onClick={() => escolherPdv(p)}
                    className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-primary-soft"
                  >
                    <span className="font-semibold tabular-nums text-slate-900">{p.cod}</span>{" "}
                    <span className="text-slate-700">— {p.nome ?? "sem nome"}</span>
                    {p.cidade || p.gv ? (
                      <span className="block text-xs text-slate-400">{[p.cidade, p.gv].filter(Boolean).join(" · ")}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          )}

          <p className="mt-1 min-h-[1.25rem] text-sm">
            {pdvDoCampo ? (
              <span className="font-semibold text-emerald-700">
                {pdvDoCampo.nome ?? "PDV sem nome na base"}
                {pdvDoCampo.cidade ? <span className="font-normal text-slate-500"> · {pdvDoCampo.cidade}</span> : null}
                <span className="block font-normal text-slate-500">GV: {pdvDoCampo.gv ?? SEM_GV}</span>
              </span>
            ) : ehNovo ? (
              <span className="font-semibold text-sky-700">PDV novo: entra mesmo sem estar na base de clientes.</span>
            ) : codValido && codValido.length >= 2 && (!aberto || semAchados) && buscaDoCampo !== "procurando" && !buscaDoCampo?.falhou ? (
              <span className="text-amber-700">Esse código não está na base de clientes. Confira o número ou, se for PDV novo, marque abaixo.</span>
            ) : null}
          </p>
        </div>

        {semPdvNaBase && (
          <div className={`rounded-xl border p-3 ${novo ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
            <label className="flex cursor-pointer items-center gap-3 text-base font-semibold text-slate-800">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-sky-600"
                checked={novo}
                onChange={(e) => setNovo(e.target.checked)}
              />
              É PDV novo (ainda não está na base)
            </label>
            {novo && (
              <input
                className={`${campo} mt-2`}
                maxLength={NOME_NOVO_MAX}
                autoComplete="off"
                enterKeyHint="next"
                placeholder="Nome do PDV (se souber)"
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
              />
            )}
          </div>
        )}

        <div>
          <label className={rotulo} htmlFor="pr-motivo">
            Motivo da prioridade
          </label>
          <select
            id="pr-motivo"
            ref={motivoRef}
            className={`${campo} ${motivoSel ? "" : "text-slate-400"}`}
            value={motivoSel}
            onChange={(e) => escolherMotivo(e.target.value)}
          >
            <option value="">Escolha o motivo</option>
            {motivos.map((m) => (
              <option key={m} value={m} className="text-slate-900">
                {m}
              </option>
            ))}
            <option value={OUTRO} className="text-slate-900">
              Outro motivo (escrever)
            </option>
          </select>
          {motivoSel === OUTRO && (
            <input
              ref={livreRef}
              className={`${campo} mt-2`}
              maxLength={MOTIVO_MAX}
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Escreva o motivo"
              value={motivoLivre}
              onChange={(e) => setMotivoLivre(e.target.value)}
            />
          )}
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
                    {i.novo ? <SeloNovo /> : null}
                  </p>
                  <p className="text-sm text-slate-600">{i.motivo}</p>
                  <p className="text-xs text-slate-400">{i.gv ?? SEM_GV}</p>
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
      {enviadasDaTela && enviadasDaTela.length > 0 && (
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
                  {e.novo ? <SeloNovo /> : null}
                  <span className="float-right text-xs font-normal text-slate-400">
                    {new Date(e.enviadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
                <p className="text-sm text-slate-600">{e.motivo}</p>
                <p className="text-xs text-slate-400">{e.gv}</p>
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
