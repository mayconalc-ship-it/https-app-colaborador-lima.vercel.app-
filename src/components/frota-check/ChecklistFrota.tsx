"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, X } from "lucide-react";
import { CameraNoApp } from "@/components/CameraNoApp";
import { useToast } from "@/components/Toast";
import { QuadroAssinatura } from "@/components/frota-check/Assinatura";
import {
  fotosGuardadasDaAvaliacao,
  guardarFotoPendente,
  novoIdDeFoto,
  removerFotoPendente,
} from "@/lib/manutencao-fotos-offline";
import {
  COR_GRAVIDADE,
  EMOJI_GRUPO,
  FOTOS_POR_ITEM_FROTA,
  GRAVIDADES,
  ROTULO_GRAVIDADE,
  faltaNoItem,
  formatarPct,
  piorGravidade,
  type FotoFrota,
  type Gravidade,
  type ItemFrota,
  type RespostaFrota,
} from "@/lib/frota-check";
import type { ResultadoAcao } from "@/lib/resultado-acao";
import type { ResultadoFoto } from "@/app/frota-check/actions";

type Resp = { ok: boolean; defeitoId: string | null; gravidade: Gravidade | null; observacao: string };
type FotoTela = FotoFrota & { estado: "enviando" | "enviada" | "parada"; blob?: Blob };

const OUTRO = "outro";

/**
 * O CHECK DE UM CAMINHÃO NO CELULAR (25/11/2026).
 *
 * Pensado para quem está no pátio com o celular numa mão:
 *  - um grupo aberto por vez (Cabine, Frontal, Baú...), com o "Tudo OK
 *    neste grupo" -- na planilha de novembro, 37 dos 38 caminhões tiveram
 *    0 a 2 NOK em 49 itens: o normal é tocar OK, então isso vira um toque;
 *  - OK/NOK em botão grande; o NOK abre na hora o manual da Ambev para
 *    escolher O QUE está errado (a gravidade sai dali) e pede a foto;
 *  - o que deu NOK no último check aparece marcado ("NOK no último");
 *  - cada toque salva sozinho; a foto vai primeiro para o celular
 *    (IndexedDB) e só sai de lá quando o servidor confirma;
 *  - o rodapé diz o que falta, e Assinar só abre com tudo certo.
 */
export function ChecklistFrota({
  checkId,
  placa,
  itens,
  respostas,
  nokAnterior,
  rotuloAnterior,
  assinante,
  salvarItem,
  grupoOk,
  enviarFoto,
  apagarFoto,
  assinar,
}: {
  checkId: string;
  placa: string;
  itens: ItemFrota[];
  respostas: Record<string, RespostaFrota>;
  /** Itens que deram NOK no último check feito desta placa. */
  nokAnterior: string[];
  rotuloAnterior: string | null;
  assinante: { nome: string; cargo: string | null };
  salvarItem: (fd: FormData) => Promise<ResultadoAcao>;
  grupoOk: (fd: FormData) => Promise<ResultadoAcao>;
  enviarFoto: (fd: FormData) => Promise<ResultadoFoto>;
  apagarFoto: (fd: FormData) => Promise<ResultadoAcao>;
  assinar: (fd: FormData) => Promise<ResultadoAcao>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [resp, setResp] = useState<Record<string, Resp>>(() =>
    Object.fromEntries(
      Object.values(respostas).map((r) => [
        r.itemId,
        { ok: r.ok, defeitoId: r.defeitoId, gravidade: r.gravidade, observacao: r.observacao ?? "" },
      ]),
    ),
  );
  const [outro, setOutro] = useState<Set<string>>(
    () => new Set(Object.values(respostas).filter((r) => !r.ok && !r.defeitoId && r.gravidade).map((r) => r.itemId)),
  );
  const [fotos, setFotos] = useState<Record<string, FotoTela[]>>(() =>
    Object.fromEntries(Object.values(respostas).map((r) => [r.itemId, r.fotos.map((f) => ({ ...f, estado: "enviada" as const }))])),
  );
  const [salvando, setSalvando] = useState<Record<string, "salvando" | "erro" | undefined>>({});
  const [camera, setCamera] = useState<string | null>(null);
  const grupos = useMemo(() => [...new Set(itens.map((i) => i.grupo))], [itens]);
  const [aberto, setAberto] = useState<string | null>(() => {
    const primeiro = itens.find((i) => !respostas[i.id]);
    return primeiro?.grupo ?? grupos[0] ?? null;
  });
  const [assinando, setAssinando] = useState(false);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const anteriores = useMemo(() => new Set(nokAnterior), [nokAnterior]);

  // ---------------- salvar (em fila: o último toque é o que vale)
  function enfileirar<T>(tarefa: () => Promise<T>) {
    const vez = fila.current.then(tarefa, tarefa);
    fila.current = vez.catch(() => undefined);
    return vez;
  }

  function salvar(itemId: string, r: Resp) {
    setSalvando((s) => ({ ...s, [itemId]: "salvando" }));
    void enfileirar(async () => {
      const fd = new FormData();
      fd.set("check_id", checkId);
      fd.set("item_id", itemId);
      fd.set("ok", r.ok ? "1" : "0");
      fd.set("defeito_id", r.defeitoId ?? "");
      fd.set("gravidade", r.gravidade ?? "");
      fd.set("observacao", r.observacao);
      let res: ResultadoAcao;
      try {
        res = await salvarItem(fd);
      } catch {
        res = { ok: false, erro: "Sem sinal: não salvou. Toque de novo quando o sinal voltar." };
      }
      setSalvando((s) => ({ ...s, [itemId]: res.ok ? undefined : "erro" }));
      if (!res.ok) toast.erro(res.erro);
    });
  }

  function mudar(item: ItemFrota, patch: Partial<Resp>, salvarJa = true) {
    const atual = resp[item.id] ?? { ok: true, defeitoId: null, gravidade: null, observacao: "" };
    const novo = { ...atual, ...patch };
    setResp((r) => ({ ...r, [item.id]: novo }));
    if (salvarJa) salvar(item.id, novo);
    return novo;
  }

  // observação: salva quando para de digitar
  const esperas = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function digitar(item: ItemFrota, observacao: string) {
    const novo = mudar(item, { observacao }, false);
    clearTimeout(esperas.current[item.id]);
    esperas.current[item.id] = setTimeout(() => salvar(item.id, novo), 1200);
  }

  async function tudoOk(grupo: string) {
    const faltam = itens.filter((i) => i.grupo === grupo && !resp[i.id]);
    if (faltam.length === 0) return;
    setResp((r) => ({ ...r, ...Object.fromEntries(faltam.map((i) => [i.id, { ok: true, defeitoId: null, gravidade: null, observacao: "" }])) }));
    const fd = new FormData();
    fd.set("check_id", checkId);
    fd.set("grupo", grupo);
    const res = await enfileirar(() => grupoOk(fd).catch(() => ({ ok: false, erro: "Sem sinal: não salvou." }) as ResultadoAcao));
    if (!res.ok) {
      toast.erro(res.erro);
      setResp((r) => {
        const c = { ...r };
        for (const i of faltam) delete c[i.id];
        return c;
      });
      return;
    }
    // abre o próximo grupo com item sem resposta
    const prox = grupos.find((g) => g !== grupo && itens.some((i) => i.grupo === g && !resp[i.id]));
    setAberto(prox ?? null);
    if (prox) setTimeout(() => document.getElementById(`grupo-${prox}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  // ---------------- fotos (celular primeiro, servidor depois)
  async function subir(itemId: string, f: FotoTela) {
    setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).map((x) => (x.chave === f.chave ? { ...x, estado: "enviando" } : x)) }));
    const fd = new FormData();
    fd.set("check_id", checkId);
    fd.set("item_id", itemId);
    fd.set("foto_id", f.chave ?? "");
    fd.set("foto", new File([f.blob!], `${f.chave}.jpg`, { type: f.blob!.type || "image/jpeg" }));
    let r: ResultadoFoto;
    try {
      r = await enviarFoto(fd);
    } catch {
      r = { ok: false, erro: "Sem sinal: a foto ficou guardada no celular e sobe sozinha." };
    }
    if (r.ok) {
      const enviada = r.foto;
      setFotos((m) => ({
        ...m,
        [itemId]: (m[itemId] ?? []).map((x) => (x.chave === f.chave ? { ...enviada, estado: "enviada", url: x.url } : x)),
      }));
      void removerFotoPendente(f.chave!);
    } else {
      setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).map((x) => (x.chave === f.chave ? { ...x, estado: "parada" } : x)) }));
      toast.erro(r.erro);
    }
  }

  function novaFoto(itemId: string, arquivo: File) {
    const chave = novoIdDeFoto();
    const f: FotoTela = { id: chave, chave, url: URL.createObjectURL(arquivo), mini: "", estado: "enviando", blob: arquivo };
    void guardarFotoPendente({ id: chave, avaliacaoId: checkId, itemId, foto: arquivo, criadaEm: new Date().toISOString() });
    setFotos((m) => ({ ...m, [itemId]: [...(m[itemId] ?? []), f] }));
    void subir(itemId, f);
  }

  async function tirarFoto(itemId: string, f: FotoTela) {
    if (f.estado !== "enviada") {
      setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).filter((x) => x.chave !== f.chave) }));
      void removerFotoPendente(f.chave ?? f.id);
      return;
    }
    const fd = new FormData();
    fd.set("foto_id", f.id);
    const r = await apagarFoto(fd).catch(() => ({ ok: false, erro: "Sem sinal." }) as ResultadoAcao);
    if (!r.ok) return toast.erro(r.erro);
    setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).filter((x) => x.id !== f.id) }));
  }

  // fotos que ficaram no celular (a página morreu antes de subir) voltam e sobem
  useEffect(() => {
    let vivo = true;
    fotosGuardadasDaAvaliacao(checkId).then((guardadas) => {
      if (!vivo || guardadas.length === 0) return;
      const noServidor = new Set(Object.values(respostas).flatMap((r) => r.fotos.map((f) => f.chave)));
      const voltam = guardadas.filter((g) => !noServidor.has(g.id));
      guardadas.filter((g) => noServidor.has(g.id)).forEach((g) => void removerFotoPendente(g.id));
      for (const g of voltam) {
        const f: FotoTela = { id: g.id, chave: g.id, url: URL.createObjectURL(g.foto), mini: "", estado: "parada", blob: g.foto };
        setFotos((m) => ({ ...m, [g.itemId]: [...(m[g.itemId] ?? []).filter((x) => x.chave !== g.id), f] }));
        void subir(g.itemId, f);
      }
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  // foto parada tenta de novo quando o sinal volta
  const fotosAgora = useRef(fotos);
  useEffect(() => {
    fotosAgora.current = fotos;
  });
  useEffect(() => {
    const tentar = () => {
      for (const [itemId, lista] of Object.entries(fotosAgora.current)) for (const f of lista) if (f.estado === "parada" && f.blob) void subir(itemId, f);
    };
    window.addEventListener("online", tentar);
    const relogio = setInterval(tentar, 25_000);
    return () => {
      window.removeEventListener("online", tentar);
      clearInterval(relogio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registro único
  }, []);

  // ---------------- contas
  const enviadasDe = (id: string) => (fotos[id] ?? []).filter((f) => f.estado === "enviada").length;
  const respondidos = itens.filter((i) => resp[i.id]).length;
  const noks = itens.filter((i) => resp[i.id] && !resp[i.id].ok);
  const pior = piorGravidade(noks.map((i) => resp[i.id].gravidade));
  const faltas = itens
    .map((i) => ({ i, f: faltaNoItem(resp[i.id], enviadasDe(i.id)) }))
    .filter((x) => x.f);
  const pct = Math.round((respondidos / itens.length) * 100);
  const conformidade = respondidos ? (respondidos - noks.length) / respondidos : null;

  function irParaFalta() {
    const x = faltas[0];
    if (!x) return;
    setAberto(x.i.grupo);
    setTimeout(() => document.getElementById(`item-${x.i.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    toast.info(`Falta: ${x.i.nome} (${x.f}).`);
  }

  return (
    <div className="space-y-3 pb-4">
      {grupos.map((g) => {
        const doGrupo = itens.filter((i) => i.grupo === g);
        const resp_ = doGrupo.filter((i) => resp[i.id]).length;
        const nokG = doGrupo.filter((i) => resp[i.id] && !resp[i.id].ok).length;
        const faltaG = doGrupo.some((i) => faltaNoItem(resp[i.id], enviadasDe(i.id)));
        const estaAberto = aberto === g;
        return (
          <section key={g} id={`grupo-${g}`} className="scroll-mt-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setAberto(estaAberto ? null : g)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
              aria-expanded={estaAberto}
            >
              <span className="text-2xl" aria-hidden>
                {EMOJI_GRUPO[g] ?? "•"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{g}</span>
                <span className="block text-xs text-slate-500">
                  {resp_} de {doGrupo.length}
                  {nokG > 0 && <span className="font-semibold text-red-700"> · {nokG} NOK</span>}
                </span>
              </span>
              {!faltaG ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">✓ pronto</span>
              ) : (
                <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(resp_ / doGrupo.length) * 100}%` }} />
                </span>
              )}
              <span className={`text-slate-400 transition ${estaAberto ? "rotate-90" : ""}`} aria-hidden>
                ›
              </span>
            </button>

            {estaAberto && (
              <div className="space-y-2 border-t border-slate-100 p-3">
                {resp_ < doGrupo.length && (
                  <button
                    type="button"
                    onClick={() => void tudoOk(g)}
                    className="w-full rounded-xl border-2 border-emerald-500 bg-emerald-50 py-2.5 text-sm font-bold text-emerald-800 active:bg-emerald-100"
                  >
                    ✓ Tudo OK no que falta em {g} ({doGrupo.length - resp_})
                  </button>
                )}
                {doGrupo.map((item) => (
                  <LinhaDoItem
                    key={item.id}
                    item={item}
                    r={resp[item.id]}
                    outro={outro.has(item.id)}
                    anterior={anteriores.has(item.id) ? rotuloAnterior : null}
                    fotos={fotos[item.id] ?? []}
                    estado={salvando[item.id]}
                    aoOk={() => mudar(item, { ok: true, defeitoId: null, gravidade: null })}
                    aoNok={() => mudar(item, { ok: false })}
                    aoDefeito={(id) => {
                      if (id === OUTRO) {
                        setOutro((s) => new Set(s).add(item.id));
                        mudar(item, { ok: false, defeitoId: null, gravidade: null });
                      } else {
                        setOutro((s) => {
                          const n = new Set(s);
                          n.delete(item.id);
                          return n;
                        });
                        const d = item.defeitos.find((x) => x.id === id)!;
                        mudar(item, { ok: false, defeitoId: d.id, gravidade: d.gravidade });
                      }
                    }}
                    aoGravidade={(gv) => mudar(item, { gravidade: gv })}
                    aoObs={(t) => digitar(item, t)}
                    aoCamera={() => setCamera(item.id)}
                    aoTirarFoto={(f) => void tirarFoto(item.id, f)}
                    aoReenviar={() => salvar(item.id, resp[item.id])}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* rodapé preso: o que falta e o botão de assinar */}
      <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600">
          <span>
            {respondidos} de {itens.length} · conformidade {formatarPct(conformidade)}
          </span>
          {noks.length > 0 ? (
            <span className={`rounded-full px-2 py-0.5 ${pior ? COR_GRAVIDADE[pior] : "bg-red-100 text-red-800"}`}>
              {noks.length} NOK{pior ? ` · ${ROTULO_GRAVIDADE[pior]}` : ""}
            </span>
          ) : (
            respondidos > 0 && <span className="text-emerald-700">Sem NOK</span>
          )}
        </div>
        <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {faltas.length > 0 ? (
          <button
            type="button"
            onClick={irParaFalta}
            className="w-full rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Faltam {faltas.length} {faltas.length === 1 ? "item" : "itens"} — ir para o próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAssinando(true)}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-primary-dark"
          >
            ✍️ Assinar e concluir
          </button>
        )}
      </div>

      {camera && (
        <CameraNoApp
          restantes={FOTOS_POR_ITEM_FROTA - (fotos[camera]?.length ?? 0)}
          aoTirar={(f) => novaFoto(camera, f)}
          aoFechar={() => setCamera(null)}
          ladoMaior={1600}
          qualidade={0.8}
        />
      )}

      {assinando && (
        <JanelaAssinatura
          checkId={checkId}
          placa={placa}
          assinante={assinante}
          resumo={{ conformidade, noks: noks.length, pior }}
          aoFechar={() => setAssinando(false)}
          assinar={async (fd) => {
            const r = await assinar(fd).catch(() => ({ ok: false, erro: "Sem sinal: não assinou ainda. Tente de novo." }) as ResultadoAcao);
            if (!r.ok) {
              toast.erro(r.erro);
              return;
            }
            toast.sucesso(r.mensagem);
            setAssinando(false);
            if (r.irPara) router.replace(r.irPara);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LinhaDoItem({
  item,
  r,
  outro,
  anterior,
  fotos,
  estado,
  aoOk,
  aoNok,
  aoDefeito,
  aoGravidade,
  aoObs,
  aoCamera,
  aoTirarFoto,
  aoReenviar,
}: {
  item: ItemFrota;
  r: Resp | undefined;
  outro: boolean;
  anterior: string | null;
  fotos: FotoTela[];
  estado: "salvando" | "erro" | undefined;
  aoOk: () => void;
  aoNok: () => void;
  aoDefeito: (id: string) => void;
  aoGravidade: (g: Gravidade) => void;
  aoObs: (t: string) => void;
  aoCamera: () => void;
  aoTirarFoto: (f: FotoTela) => void;
  aoReenviar: () => void;
}) {
  const nok = r && !r.ok;
  const enviadas = fotos.filter((f) => f.estado === "enviada").length;
  return (
    <div
      id={`item-${item.id}`}
      className={`scroll-mt-24 rounded-xl border p-3 ${
        estado === "erro" ? "border-red-400" : nok ? "border-red-200 bg-red-50/50" : r ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-slate-900">{item.nome}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">{item.classificacao}</span>
            {anterior && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">NOK no último ({anterior})</span>}
            {estado === "salvando" && <LoaderCircle className="h-3 w-3 animate-spin text-slate-400" aria-label="Salvando" />}
            {estado === "erro" && (
              <button type="button" onClick={aoReenviar} className="font-bold text-red-700 underline">
                não salvou · tentar de novo
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={aoOk}
            className={`h-11 w-14 rounded-xl border-2 text-sm font-bold ${
              r?.ok ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-white text-emerald-700"
            }`}
            aria-pressed={r?.ok === true}
          >
            OK
          </button>
          <button
            type="button"
            onClick={aoNok}
            className={`h-11 w-14 rounded-xl border-2 text-sm font-bold ${
              nok ? "border-red-600 bg-red-600 text-white" : "border-red-200 bg-white text-red-700"
            }`}
            aria-pressed={nok === true}
          >
            NOK
          </button>
        </div>
      </div>

      {nok && (
        <div className="mt-3 space-y-2.5">
          <p className="text-xs font-bold uppercase text-slate-500">O que está errado?</p>
          <div className="space-y-1.5">
            {item.defeitos.map((d) => (
              <label
                key={d.id}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border-2 p-2.5 text-sm ${
                  r.defeitoId === d.id ? "border-red-500 bg-white" : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={`def-${item.id}`}
                  checked={r.defeitoId === d.id}
                  onChange={() => aoDefeito(d.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
                />
                <span className="min-w-0 flex-1 text-slate-800">{d.descricao}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_GRAVIDADE[d.gravidade]}`}>
                  {ROTULO_GRAVIDADE[d.gravidade]}
                </span>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-2.5 text-sm ${
                outro ? "border-red-500 bg-white" : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`def-${item.id}`}
                checked={outro}
                onChange={() => aoDefeito(OUTRO)}
                className="h-4 w-4 accent-red-600"
              />
              <span className="text-slate-800">Outro defeito (descrever)</span>
            </label>
          </div>

          {outro && (
            <div className="flex flex-wrap gap-1.5">
              {GRAVIDADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => aoGravidade(g)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${r.gravidade === g ? COR_GRAVIDADE[g] + " ring-2 ring-offset-1 ring-slate-400" : "bg-slate-100 text-slate-600"}`}
                >
                  {ROTULO_GRAVIDADE[g]}
                </button>
              ))}
            </div>
          )}

          <textarea
            rows={2}
            maxLength={500}
            defaultValue={r.observacao}
            onChange={(e) => aoObs(e.target.value)}
            placeholder={outro ? "Descreva o defeito (obrigatório)" : "Observação (opcional): lado, posição, medida..."}
            className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-base focus:border-primary focus:outline-none"
          />

          <div className="flex flex-wrap items-center gap-2">
            {fotos.map((f) => (
              <div key={f.chave ?? f.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou miniatura da rota do app */}
                <img src={f.mini || f.url} alt="Foto do NOK" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                <span
                  className={`absolute bottom-0.5 left-0.5 rounded px-1 text-[9px] font-bold text-white ${
                    f.estado === "enviada" ? "bg-emerald-600" : f.estado === "enviando" ? "bg-slate-500" : "bg-amber-600"
                  }`}
                >
                  {f.estado === "enviada" ? "enviada" : f.estado === "enviando" ? "subindo" : "no celular"}
                </span>
                <button
                  type="button"
                  onClick={() => aoTirarFoto(f)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-0.5 text-white"
                  aria-label="Tirar esta foto"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {fotos.length < FOTOS_POR_ITEM_FROTA && (
              <button
                type="button"
                onClick={aoCamera}
                className={`flex h-16 items-center gap-1.5 rounded-lg border-2 border-dashed px-3 text-xs font-bold ${
                  enviadas === 0 ? "border-red-400 text-red-700" : "border-slate-300 text-slate-600"
                }`}
              >
                <Camera className="h-4 w-4" />
                {enviadas === 0 ? "Foto obrigatória" : "+ foto"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function JanelaAssinatura({
  checkId,
  placa,
  assinante,
  resumo,
  aoFechar,
  assinar,
}: {
  checkId: string;
  placa: string;
  assinante: { nome: string; cargo: string | null };
  resumo: { conformidade: number | null; noks: number; pior: Gravidade | null };
  aoFechar: () => void;
  assinar: (fd: FormData) => Promise<void>;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const hoje = new Date().toLocaleDateString("pt-BR");

  async function confirmar() {
    if (!png) return;
    setEnviando(true);
    const fd = new FormData();
    fd.set("check_id", checkId);
    fd.set("assinatura", png);
    fd.set("km", km);
    fd.set("observacao", obs);
    await assinar(fd);
    setEnviando(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Assinar o check da {placa}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full p-1 text-slate-500" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`mb-3 rounded-2xl p-3 text-sm ${resumo.pior === "bloqueio" ? "bg-red-700 text-white" : resumo.noks ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          <p className="text-2xl font-black">{formatarPct(resumo.conformidade)}</p>
          <p className="text-xs font-semibold">
            {resumo.noks ? `${resumo.noks} NOK${resumo.pior ? ` · pior: ${ROTULO_GRAVIDADE[resumo.pior]}` : ""}` : "Nenhum item NOK"}
          </p>
          {resumo.pior === "bloqueio" && <p className="mt-1 text-xs">Tem item de bloqueio imediato: o caminhão não deve sair até corrigir.</p>}
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="cf-km">
          Km do painel (opcional)
        </label>
        <input
          id="cf-km"
          inputMode="numeric"
          value={km}
          onChange={(e) => setKm(e.target.value.replace(/\D/g, "").slice(0, 7))}
          className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
          placeholder="Ex.: 154320"
        />
        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="cf-obs">
          Observação geral (opcional)
        </label>
        <textarea
          id="cf-obs"
          rows={2}
          maxLength={1000}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          className="mb-3 w-full rounded-xl border border-slate-300 p-2.5 text-base"
        />

        <QuadroAssinatura aoMudar={setPng} />
        <p className="mt-2 text-xs text-slate-600">
          Eu, <strong>{assinante.nome}</strong>
          {assinante.cargo ? ` (${assinante.cargo.toLowerCase()})` : ""}, confirmo que vistoriei a placa <strong>{placa}</strong> em {hoje} e que
          as respostas e fotos deste check são verdadeiras.
        </p>

        <button
          type="button"
          disabled={!png || enviando}
          onClick={() => void confirmar()}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {enviando ? "Assinando..." : "✅ Assinar e concluir"}
        </button>
      </div>
    </div>
  );
}
