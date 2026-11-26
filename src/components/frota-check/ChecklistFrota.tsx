"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CloudCheck, CloudOff, LoaderCircle, RefreshCw, X } from "lucide-react";
import { CameraNoApp } from "@/components/CameraNoApp";
import { useToast } from "@/components/Toast";
import { QuadroAssinatura } from "@/components/frota-check/Assinatura";
import { IconeGrupo, IconeItem } from "@/components/frota-check/IconesFrota";
import {
  fotosGuardadasDaAvaliacao,
  guardarFotoPendente,
  novoIdDeFoto,
  removerFotoPendente,
} from "@/lib/manutencao-fotos-offline";
import {
  apagarAssinaturaGuardada,
  apagarGuardado,
  gravarGuardado,
  guardarAssinatura,
  lerAssinaturaGuardada,
  lerGuardado,
  limparVelhos,
  type AssinaturaGuardada,
  type RespostaLocal,
} from "@/lib/frota-check-offline";
import {
  COR_GRAVIDADE,
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
import type { ResultadoFoto, ResultadoSinc } from "@/app/frota-check/actions";

type FotoTela = FotoFrota & { estado: "enviando" | "enviada" | "parada"; blob?: Blob };
type Sinc = "ok" | "enviando" | "offline" | "erro";

const OUTRO = "outro";
/** Com coisa na fila e sem sinal, tenta de novo neste ritmo. */
const REENVIO_MS = 10_000;

const vibrar = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // aparelho sem vibração
  }
};

/**
 * O CHECK DE UM CAMINHÃO NO CELULAR -- versão 2 (25/11/2026, pedido do dono:
 * "capriche no check... confiável, rápido e intuitivo... caso tenha queda
 * de internet ou receba uma ligação, não perca o que já foi feito").
 *
 * CONFIÁVEL -- o celular primeiro, o servidor depois (como os apps de
 * inspeção de frota, que funcionam no pátio sem sinal):
 *  - cada toque grava NA HORA no celular (frota-check-offline) e entra numa
 *    fila; a fila sobe em lote e só sai do celular quando o servidor
 *    confirma. Caiu a internet, veio uma ligação, o Android fechou o
 *    navegador: ao abrir de novo, as respostas estão lá e sobem sozinhas;
 *  - o selo no rodapé diz sempre onde está o check: "salvo", "enviando"
 *    ou "sem internet · N guardados no celular";
 *  - foto: IndexedDB até o servidor confirmar (já era assim).
 *
 * RÁPIDO -- os 6 grupos viram um mapa do caminhão no topo (cada um com o
 * seu desenho e o seu andamento); o OK leva sozinho ao próximo item; o
 * grupo terminado passa para o próximo; "Tudo OK no que falta" fecha um
 * grupo num toque (na planilha, quase todo caminhão tem 0 a 2 NOK).
 *
 * INTUITIVO -- cada item com o seu ícone, OK/NOK grandes para o polegar,
 * o NOK abre o manual da Ambev para escolher o defeito (a gravidade sai
 * dele), a foto é obrigatória e o rodapé leva ao que falta.
 */
export function ChecklistFrota({
  checkId,
  placa,
  itens,
  respostas,
  nokAnterior,
  rotuloAnterior,
  defeitosAnteriores,
  assinante,
  sincronizar,
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
  /** O defeito que cada item teve no último check (só do app; a planilha não tem). */
  defeitosAnteriores: Record<string, string>;
  assinante: { nome: string; cargo: string | null };
  sincronizar: (fd: FormData) => Promise<ResultadoSinc>;
  enviarFoto: (fd: FormData) => Promise<ResultadoFoto>;
  apagarFoto: (fd: FormData) => Promise<ResultadoAcao>;
  assinar: (fd: FormData) => Promise<ResultadoAcao>;
}) {
  const router = useRouter();
  const toast = useToast();
  const grupos = useMemo(() => [...new Set(itens.map((i) => i.grupo))], [itens]);
  const anteriores = useMemo(() => new Set(nokAnterior), [nokAnterior]);

  // ---------------- respostas: servidor na abertura, celular por cima
  const doServidor = useMemo<Record<string, RespostaLocal>>(
    () =>
      Object.fromEntries(
        Object.values(respostas).map((r) => [
          r.itemId,
          { ok: r.ok, defeitoId: r.defeitoId, gravidade: r.gravidade, observacao: r.observacao ?? "" },
        ]),
      ),
    [respostas],
  );
  const [resp, setResp] = useState<Record<string, RespostaLocal>>(doServidor);
  const respAgora = useRef(resp);
  const fila = useRef<Record<string, number>>({});
  const [filaIds, setFilaIds] = useState<Set<string>>(new Set());
  const naFila = filaIds.size;
  const [sinc, setSinc] = useState<Sinc>("ok");
  const [recuperados, setRecuperados] = useState(0);
  const [outro, setOutro] = useState<Set<string>>(
    () => new Set(Object.values(respostas).filter((r) => !r.ok && !r.defeitoId && r.gravidade).map((r) => r.itemId)),
  );
  const [grupo, setGrupo] = useState<string>(() => itens.find((i) => !respostas[i.id])?.grupo ?? grupos[0]);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [assinando, setAssinando] = useState(false);
  const [assPendente, setAssPendente] = useState<AssinaturaGuardada | null>(null);
  const assinandoAgora = useRef(false);
  const [camera, setCamera] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Record<string, FotoTela[]>>(() =>
    Object.fromEntries(Object.values(respostas).map((r) => [r.itemId, r.fotos.map((f) => ({ ...f, estado: "enviada" as const }))])),
  );

  const guardar = useCallback(() => {
    gravarGuardado(checkId, { resp: respAgora.current, fila: fila.current, em: Date.now() });
    setFilaIds(new Set(Object.keys(fila.current)));
  }, [checkId]);

  // ---------------- a fila: sobe em lote, sai só com a confirmação
  const enviando = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // a própria fila se chama de novo (lote seguinte) por aqui
  const enviarAgora = useRef<() => Promise<void>>(async () => {});
  const tentarAssinaturaAgora = useRef<() => Promise<void>>(async () => {});

  const enviar = useCallback(async () => {
    if (enviando.current) return;
    const ids = Object.keys(fila.current);
    if (ids.length === 0) {
      setSinc("ok");
      return;
    }
    enviando.current = true;
    setSinc("enviando");
    const versoes = { ...fila.current };
    const fd = new FormData();
    fd.set("check_id", checkId);
    fd.set("itens", JSON.stringify(ids.slice(0, 60).map((itemId) => ({ itemId, ...respAgora.current[itemId] }))));
    let r: ResultadoSinc;
    try {
      r = await sincronizar(fd);
    } catch {
      r = { ok: false, erro: "sem internet" };
    }
    enviando.current = false;
    if (!r.ok) {
      const semRede = r.erro === "sem internet" || navigator.onLine === false;
      setSinc(semRede ? "offline" : "erro");
      if (!semRede) toast.erro(r.erro);
      return;
    }
    // sai da fila só o que o servidor gravou E não mudou enquanto ia
    for (const id of r.salvos) if (fila.current[id] === versoes[id]) delete fila.current[id];
    guardar();
    if (Object.keys(fila.current).length) {
      espera.current = setTimeout(() => void enviarAgora.current(), 250);
    } else {
      setSinc("ok");
      void tentarAssinaturaAgora.current();
    }
  }, [checkId, sincronizar, guardar, toast]);

  useEffect(() => {
    enviarAgora.current = enviar;
  }, [enviar]);

  const agendar = useCallback(
    (ms: number) => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => void enviar(), ms);
    },
    [enviar],
  );

  // Abertura: o que ficou no celular (fila) vale mais que o servidor
  useEffect(() => {
    limparVelhos();
    const g = lerGuardado(checkId);
    const pend = Object.keys(g.fila).filter((id) => g.resp[id] && itens.some((i) => i.id === id));
    if (pend.length) {
      const junto = { ...respAgora.current };
      for (const id of pend) junto[id] = g.resp[id];
      respAgora.current = junto;
      fila.current = Object.fromEntries(pend.map((id) => [id, g.fila[id]]));
      setResp(junto);
      setRecuperados(pend.length);
      setOutro((s) => {
        const n = new Set(s);
        for (const id of pend) if (!junto[id].ok && !junto[id].defeitoId) n.add(id);
        return n;
      });
      const primeiro = itens.find((i) => !junto[i.id]);
      if (primeiro) setGrupo(primeiro.grupo);
    }
    guardar();
    void enviar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  // Sinal voltou, voltou da ligação (aba visível de novo), ou de tempo em tempo: manda a fila
  useEffect(() => {
    const tentar = () => {
      if (Object.keys(fila.current).length) void enviar();
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") tentar();
      // indo para o fundo (ligação, outro app): garante o celular gravado
      else guardar();
    };
    window.addEventListener("online", tentar);
    const caiu = () => setSinc((s) => (Object.keys(fila.current).length ? "offline" : s));
    window.addEventListener("offline", caiu);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("pagehide", guardar);
    const relogio = setInterval(tentar, REENVIO_MS);
    return () => {
      window.removeEventListener("online", tentar);
      window.removeEventListener("offline", caiu);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pagehide", guardar);
      clearInterval(relogio);
    };
  }, [enviar, guardar]);

  // ---------------- responder
  function gravar(mudancas: Record<string, RespostaLocal>, ms: number) {
    const novo = { ...respAgora.current, ...mudancas };
    respAgora.current = novo;
    for (const id of Object.keys(mudancas)) fila.current[id] = (fila.current[id] ?? 0) + 1;
    setResp(novo);
    guardar(); // no celular ANTES de tentar a internet
    agendar(ms);
  }

  function mudar(item: ItemFrota, patch: Partial<RespostaLocal>, ms = 400) {
    const atual = respAgora.current[item.id] ?? { ok: true, defeitoId: null, gravidade: null, observacao: "" };
    gravar({ [item.id]: { ...atual, ...patch } }, ms);
  }

  const doGrupo = useCallback((g: string) => itens.filter((i) => i.grupo === g), [itens]);

  function irPara(g: string) {
    setGrupo(g);
    setTimeout(() => document.getElementById("cf-lista")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  /** Depois de um OK: o próximo sem resposta do grupo; grupo cheio, o próximo grupo. */
  function avancar(item: ItemFrota) {
    const lista = doGrupo(item.grupo);
    const depois = lista.slice(lista.indexOf(item) + 1).find((i) => !respAgora.current[i.id]);
    const qualquer = depois ?? lista.find((i) => !respAgora.current[i.id]);
    if (qualquer) {
      setTimeout(() => document.getElementById(`item-${qualquer.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      return;
    }
    const temNok = lista.some((i) => respAgora.current[i.id] && !respAgora.current[i.id].ok);
    const prox = grupos.find((g) => doGrupo(g).some((i) => !respAgora.current[i.id]));
    if (!temNok && prox) {
      toast.sucesso(`${item.grupo} pronto ✓`);
      setTimeout(() => irPara(prox), 450);
    }
  }

  function marcarOk(item: ItemFrota) {
    vibrar();
    mudar(item, { ok: true, defeitoId: null, gravidade: null, observacao: "" });
    setAbertos((s) => {
      const n = new Set(s);
      n.delete(item.id);
      return n;
    });
    avancar(item);
  }

  function marcarNok(item: ItemFrota) {
    vibrar(25);
    mudar(item, { ok: false });
    setAbertos((s) => new Set(s).add(item.id));
  }

  function tudoOk(g: string) {
    vibrar(20);
    const faltam = doGrupo(g).filter((i) => !respAgora.current[i.id]);
    if (!faltam.length) return;
    gravar(Object.fromEntries(faltam.map((i) => [i.id, { ok: true, defeitoId: null, gravidade: null, observacao: "" }])), 50);
    const prox = grupos.find((x) => x !== g && doGrupo(x).some((i) => !respAgora.current[i.id]));
    if (prox) setTimeout(() => irPara(prox), 300);
  }

  // observação: no celular a cada letra, no servidor quando para de digitar
  function digitar(item: ItemFrota, observacao: string) {
    mudar(item, { observacao }, 1500);
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
      r = { ok: false, erro: "" };
    }
    if (r.ok) {
      const enviada = r.foto;
      setFotos((m) => ({
        ...m,
        [itemId]: (m[itemId] ?? []).map((x) => (x.chave === f.chave ? { ...enviada, estado: "enviada", url: x.url } : x)),
      }));
      void removerFotoPendente(f.chave!);
      setTimeout(() => void tentarAssinaturaAgora.current(), 300);
    } else {
      setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).map((x) => (x.chave === f.chave ? { ...x, estado: "parada" } : x)) }));
      if (r.erro) toast.erro(r.erro);
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
    const r = await apagarFoto(fd).catch(() => ({ ok: false, erro: "Sem internet: tente apagar quando o sinal voltar." }) as ResultadoAcao);
    if (!r.ok) return toast.erro(r.erro);
    setFotos((m) => ({ ...m, [itemId]: (m[itemId] ?? []).filter((x) => x.id !== f.id) }));
  }

  // fotos que ficaram no celular (a página morreu antes de subir) voltam e sobem
  useEffect(() => {
    let vivo = true;
    fotosGuardadasDaAvaliacao(checkId).then((guardadas) => {
      if (!vivo || guardadas.length === 0) return;
      const noServidor = new Set(Object.values(respostas).flatMap((r) => r.fotos.map((f) => f.chave)));
      guardadas.filter((g) => noServidor.has(g.id)).forEach((g) => void removerFotoPendente(g.id));
      for (const g of guardadas.filter((x) => !noServidor.has(x.id))) {
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

  const fotosAgora = useRef(fotos);
  useEffect(() => {
    fotosAgora.current = fotos;
  });
  useEffect(() => {
    const tentar = () => {
      for (const [itemId, lista] of Object.entries(fotosAgora.current))
        for (const f of lista) if (f.estado === "parada" && f.blob) void subir(itemId, f);
    };
    window.addEventListener("online", tentar);
    const relogio = setInterval(tentar, 20_000);
    return () => {
      window.removeEventListener("online", tentar);
      clearInterval(relogio);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registro único
  }, []);

  // ---------------- assinatura (também sem internet)
  const tentarAssinatura = useCallback(async () => {
    const a = lerAssinaturaGuardada(checkId);
    if (!a || assinandoAgora.current) return;
    // o servidor só aceita a assinatura com todas as respostas e fotos lá
    if (Object.keys(fila.current).length) {
      void enviarAgora.current();
      return;
    }
    if (Object.values(fotosAgora.current).flat().some((f) => f.estado !== "enviada")) return;
    assinandoAgora.current = true;
    const fd = new FormData();
    fd.set("check_id", checkId);
    fd.set("assinatura", a.png);
    fd.set("km", a.km);
    fd.set("observacao", a.observacao);
    fd.set("assinado_em", a.em);
    let r: ResultadoAcao | null = null;
    try {
      r = await assinar(fd);
    } catch {
      r = null;
    }
    assinandoAgora.current = false;
    if (!r) {
      setSinc("offline"); // sem internet: fica guardada e tenta de novo
      return;
    }
    const jaEstava = !r.ok && /já foi assinado/.test(r.erro);
    if (!r.ok && !jaEstava) {
      // o servidor recusou (ex.: falta uma foto): volta para a pessoa corrigir
      apagarAssinaturaGuardada(checkId);
      setAssPendente(null);
      toast.erro(`${r.erro} Corrija e assine de novo.`);
      return;
    }
    apagarAssinaturaGuardada(checkId);
    apagarGuardado(checkId);
    toast.sucesso(r.ok ? r.mensagem : "Check assinado.");
    if (r.ok && r.irPara) router.replace(r.irPara);
    router.refresh();
  }, [checkId, assinar, router, toast]);

  useEffect(() => {
    tentarAssinaturaAgora.current = tentarAssinatura;
  }, [tentarAssinatura]);

  // abriu com assinatura guardada (assinou sem sinal e fechou): manda
  useEffect(() => {
    const a = lerAssinaturaGuardada(checkId);
    if (a) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento do celular
      setAssPendente(a);
      void tentarAssinaturaAgora.current();
    }
    const tentar = () => void tentarAssinaturaAgora.current();
    window.addEventListener("online", tentar);
    const relogio = setInterval(tentar, 12_000);
    return () => {
      window.removeEventListener("online", tentar);
      clearInterval(relogio);
    };
  }, [checkId]);

  // tela acesa enquanto o check está aberto (o celular não apaga no meio do pátio)
  useEffect(() => {
    type Trava = { release: () => Promise<void> };
    let trava: Trava | null = null;
    const pedir = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Trava> } }).wakeLock;
        if (wl && document.visibilityState === "visible") trava = await wl.request("screen");
      } catch {
        // aparelho sem suporte ou bateria fraca: segue normal
      }
    };
    void pedir();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      void trava?.release().catch(() => undefined);
    };
  }, []);

  // ---------------- contas
  const enviadasDe = (id: string) => (fotos[id] ?? []).filter((f) => f.estado === "enviada").length;
  const fotosNoCelular = Object.values(fotos).flat().filter((f) => f.estado !== "enviada").length;
  const respondidos = itens.filter((i) => resp[i.id]).length;
  const noks = itens.filter((i) => resp[i.id] && !resp[i.id].ok);
  const pior = piorGravidade(noks.map((i) => resp[i.id].gravidade));
  const faltas = itens.map((i) => ({ i, f: faltaNoItem(resp[i.id], enviadasDe(i.id)) })).filter((x) => x.f);
  const pct = Math.round((respondidos / itens.length) * 100);
  const conformidade = respondidos ? (respondidos - noks.length) / respondidos : null;
  const guardadosNoCelular = naFila + fotosNoCelular;

  function irParaFalta() {
    const x = faltas[0];
    if (!x) return;
    setGrupo(x.i.grupo);
    if (resp[x.i.id] && !resp[x.i.id].ok) setAbertos((s) => new Set(s).add(x.i.id));
    setTimeout(() => document.getElementById(`item-${x.i.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    toast.info(`Falta: ${x.i.nome} (${x.f}).`);
  }

  function pedirAssinatura() {
    setAssinando(true);
  }

  const lista = doGrupo(grupo);
  const iGrupo = grupos.indexOf(grupo);
  const proxGrupo = grupos[iGrupo + 1];

  if (assPendente) {
    return (
      <div className="space-y-3">
        <div className="rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <p className="mt-3 text-lg font-black text-emerald-900">Check assinado</p>
          <p className="mt-1 text-sm text-emerald-900">
            {formatarPct(conformidade)} de conformidade{noks.length ? ` · ${noks.length} NOK` : ""} · assinado às{" "}
            {new Date(assPendente.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          {sinc === "offline" ? <CloudOff className="mt-0.5 h-5 w-5 shrink-0" /> : <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />}
          <div>
            <p className="font-bold">{sinc === "offline" ? "Sem internet: guardado no celular" : "Enviando para o servidor..."}</p>
            <p className="mt-1 text-xs">
              O check e a assinatura sobem sozinhos quando o sinal voltar. Pode sair desta tela: ao abrir de novo com sinal, ele termina de
              enviar.
            </p>
            <button
              type="button"
              onClick={() => {
                void enviar();
                void tentarAssinatura();
              }}
              className="mt-3 flex items-center gap-1.5 rounded-xl bg-sky-700 px-3 py-2 text-xs font-bold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Tentar enviar agora
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      {recuperados > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-sky-50 p-2.5 text-xs font-semibold text-sky-900">
          <RefreshCw className="h-4 w-4 shrink-0" />
          {recuperados} {recuperados === 1 ? "resposta voltou" : "respostas voltaram"} do celular e{" "}
          {naFila ? "estão subindo" : "já subiram"} para o servidor. Nada se perdeu.
        </p>
      )}

      {/* o mapa do caminhão: os 6 grupos com desenho e andamento */}
      <nav className="grid grid-cols-3 gap-2" aria-label="Grupos do check">
        {grupos.map((g) => {
          const its = doGrupo(g);
          const r = its.filter((i) => resp[i.id]).length;
          const nok = its.filter((i) => resp[i.id] && !resp[i.id].ok).length;
          const falta = its.some((i) => faltaNoItem(resp[i.id], enviadasDe(i.id)));
          const pronto = !falta;
          const atual = g === grupo;
          return (
            <button
              key={g}
              type="button"
              onClick={() => {
                vibrar(8);
                irPara(g);
              }}
              aria-current={atual}
              className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 px-1 pb-2 pt-2.5 transition active:scale-95 ${
                atual
                  ? "border-primary bg-primary-soft text-primary-dark shadow-sm"
                  : pronto
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <IconeGrupo grupo={g} className="h-8 w-8" />
              <span className="text-xs font-bold leading-none">{g}</span>
              <span className="text-[10px] font-semibold text-slate-500">
                {r}/{its.length}
              </span>
              <span className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-slate-200/70">
                <span className={`block h-full ${pronto ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${(r / its.length) * 100}%` }} />
              </span>
              {pronto && (
                <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 p-0.5 text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              {nok > 0 && (
                <span className="absolute -left-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">{nok}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* o grupo escolhido */}
      <section id="cf-lista" className="scroll-mt-20 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <IconeGrupo grupo={grupo} className="h-5 w-5 text-primary-dark" />
          <h2 className="flex-1 text-sm font-bold text-slate-900">
            {grupo} <span className="font-normal text-slate-500">· {lista.length} itens</span>
          </h2>
        </div>
        {lista.some((i) => !resp[i.id]) && (
          <button
            type="button"
            onClick={() => tudoOk(grupo)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 bg-emerald-50 py-3 text-sm font-bold text-emerald-800 active:scale-[0.98]"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            Tudo OK no que falta ({lista.filter((i) => !resp[i.id]).length})
          </button>
        )}

        {lista.map((item) => (
          <LinhaDoItem
            key={item.id}
            item={item}
            r={resp[item.id]}
            pendente={filaIds.has(item.id)}
            aberto={abertos.has(item.id) || (resp[item.id] && !resp[item.id].ok && faltaNoItem(resp[item.id], enviadasDe(item.id)) !== null)}
            outro={outro.has(item.id)}
            anterior={anteriores.has(item.id) ? rotuloAnterior : null}
            defeitoAnterior={defeitosAnteriores[item.id] ?? null}
            fotos={fotos[item.id] ?? []}
            aoOk={() => marcarOk(item)}
            aoNok={() => marcarNok(item)}
            aoAlternar={() =>
              setAbertos((s) => {
                const n = new Set(s);
                if (n.has(item.id)) n.delete(item.id);
                else n.add(item.id);
                return n;
              })
            }
            aoDefeito={(id) => {
              vibrar(8);
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
          />
        ))}

        {proxGrupo && !lista.some((i) => !resp[i.id]) && (
          <button
            type="button"
            onClick={() => irPara(proxGrupo)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white active:scale-[0.98]"
          >
            Próximo: <IconeGrupo grupo={proxGrupo} className="h-5 w-5" /> {proxGrupo} →
          </button>
        )}
      </section>

      {/* rodapé preso: onde está o check, o andamento e o botão */}
      <div className="sticky bottom-2 z-10 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <SeloSinc sinc={sinc} noCelular={guardadosNoCelular} aoTentar={() => void enviar()} />
          <div className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
            <span className="block">
              {respondidos}/{itens.length}
              {faltas.length === 0 ? ` · ${formatarPct(conformidade)}` : ""}
            </span>
            {noks.length > 0 ? (
              <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] ${pior ? COR_GRAVIDADE[pior] : "bg-red-100 text-red-800"}`}>
                {noks.length} NOK{pior ? ` · ${ROTULO_GRAVIDADE[pior]}` : ""}
              </span>
            ) : (
              respondidos > 0 && <span className="text-[10px] text-emerald-700">sem NOK</span>
            )}
          </div>
          {faltas.length > 0 ? (
            <button type="button" onClick={irParaFalta} className="shrink-0 rounded-xl bg-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700">
              Faltam {faltas.length} · ir
            </button>
          ) : (
            <button
              type="button"
              onClick={pedirAssinatura}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm ${guardadosNoCelular ? "bg-slate-400" : "bg-primary hover:bg-primary-dark"}`}
            >
              ✍️ Assinar
            </button>
          )}
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
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
            // primeiro no celular: a assinatura não se perde nem sem sinal
            const a: AssinaturaGuardada = {
              png: String(fd.get("assinatura") ?? ""),
              km: String(fd.get("km") ?? ""),
              observacao: String(fd.get("observacao") ?? ""),
              em: new Date().toISOString(),
            };
            guardarAssinatura(checkId, a);
            setAssPendente(a);
            setAssinando(false);
            await tentarAssinatura();
          }}
        />
      )}
    </div>
  );
}

function SeloSinc({ sinc, noCelular, aoTentar }: { sinc: Sinc; noCelular: number; aoTentar: () => void }) {
  if (sinc === "offline" || sinc === "erro")
    return (
      <button
        type="button"
        onClick={aoTentar}
        className="flex shrink-0 items-center gap-1 rounded-xl bg-amber-100 px-2 py-1.5 text-[10px] font-bold leading-tight text-amber-900"
      >
        <CloudOff className="h-4 w-4" />
        <span>
          sem internet
          <br />
          {noCelular} no celular
        </span>
      </button>
    );
  if (sinc === "enviando" || noCelular > 0)
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-xl bg-sky-50 px-2 py-1.5 text-[10px] font-bold leading-tight text-sky-800">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        enviando
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-2 py-1.5 text-[10px] font-bold leading-tight text-emerald-800">
      <CloudCheck className="h-4 w-4" />
      salvo
    </span>
  );
}

function LinhaDoItem({
  item,
  r,
  pendente,
  aberto,
  outro,
  anterior,
  defeitoAnterior,
  fotos,
  aoOk,
  aoNok,
  aoAlternar,
  aoDefeito,
  aoGravidade,
  aoObs,
  aoCamera,
  aoTirarFoto,
}: {
  item: ItemFrota;
  r: RespostaLocal | undefined;
  pendente: boolean;
  aberto: boolean;
  outro: boolean;
  anterior: string | null;
  defeitoAnterior: string | null;
  fotos: FotoTela[];
  aoOk: () => void;
  aoNok: () => void;
  aoAlternar: () => void;
  aoDefeito: (id: string) => void;
  aoGravidade: (g: Gravidade) => void;
  aoObs: (t: string) => void;
  aoCamera: () => void;
  aoTirarFoto: (f: FotoTela) => void;
}) {
  const nok = r && !r.ok;
  const enviadas = fotos.filter((f) => f.estado === "enviada").length;
  const defeito = nok && r.defeitoId ? item.defeitos.find((d) => d.id === r.defeitoId) : null;
  return (
    <div
      id={`item-${item.id}`}
      className={`scroll-mt-24 rounded-2xl border bg-white p-3 shadow-sm transition ${
        nok ? "border-red-300 bg-red-50/40" : r ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            nok ? "bg-red-100 text-red-700" : r ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          <IconeItem ordem={item.ordem} className="h-6 w-6" />
        </span>
        <button type="button" onClick={nok ? aoAlternar : undefined} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold leading-snug text-slate-900">{item.nome}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">{item.classificacao}</span>
            {anterior && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">NOK no último ({anterior})</span>}
            {nok && !aberto && defeito && (
              <span className={`rounded-full px-1.5 py-0.5 font-bold ${COR_GRAVIDADE[defeito.gravidade]}`}>{ROTULO_GRAVIDADE[defeito.gravidade]}</span>
            )}
            {nok && !aberto && enviadas > 0 && <span className="text-slate-500">📷 {enviadas}</span>}
            {pendente && <span className="text-slate-400">· no celular</span>}
          </span>
        </button>
        <div className="flex shrink-0 overflow-hidden rounded-xl border-2 border-slate-200">
          <button
            type="button"
            onClick={aoOk}
            className={`h-11 w-14 text-sm font-bold transition ${r?.ok ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 active:bg-emerald-50"}`}
            aria-pressed={r?.ok === true}
          >
            OK
          </button>
          <button
            type="button"
            onClick={aoNok}
            className={`h-11 w-14 border-l-2 border-slate-200 text-sm font-bold transition ${nok ? "bg-red-600 text-white" : "bg-white text-red-700 active:bg-red-50"}`}
            aria-pressed={nok === true}
          >
            NOK
          </button>
        </div>
      </div>

      {nok && aberto && (
        <div className="mt-3 space-y-2.5">
          {defeitoAnterior && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
              <b>No último check:</b> {defeitoAnterior}
            </p>
          )}
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">O que está errado?</p>
          <div className="space-y-1.5">
            {item.defeitos.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => aoDefeito(d.id)}
                className={`flex w-full items-start gap-2 rounded-xl border-2 bg-white p-2.5 text-left text-sm ${r.defeitoId === d.id ? "border-red-500" : "border-slate-200"}`}
                aria-pressed={r.defeitoId === d.id}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${r.defeitoId === d.id ? "border-red-600 bg-red-600" : "border-slate-300"}`}>
                  {r.defeitoId === d.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="min-w-0 flex-1 text-slate-800">{d.descricao}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_GRAVIDADE[d.gravidade]}`}>{ROTULO_GRAVIDADE[d.gravidade]}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => aoDefeito(OUTRO)}
              className={`flex w-full items-center gap-2 rounded-xl border-2 bg-white p-2.5 text-left text-sm ${outro ? "border-red-500" : "border-slate-200"}`}
              aria-pressed={outro}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${outro ? "border-red-600 bg-red-600" : "border-slate-300"}`}>
                {outro && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="text-slate-800">Outro defeito (descrever)</span>
            </button>
          </div>

          {outro && (
            <div className="flex flex-wrap gap-1.5">
              {GRAVIDADES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => aoGravidade(g)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${r.gravidade === g ? COR_GRAVIDADE[g] + " ring-2 ring-slate-400 ring-offset-1" : "bg-slate-100 text-slate-600"}`}
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
                  enviadas === 0 && fotos.length === 0 ? "border-red-400 bg-white text-red-700" : "border-slate-300 text-slate-600"
                }`}
              >
                <Camera className="h-5 w-5" />
                {fotos.length === 0 ? "Foto obrigatória" : "+ foto"}
              </button>
            )}
          </div>
          {r.defeitoId || (outro && r.gravidade && r.observacao.trim()) ? (
            fotos.length > 0 && (
              <button type="button" onClick={aoAlternar} className="w-full rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-700">
                Recolher
              </button>
            )
          ) : null}
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
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Assinar o check da {placa}</h2>
          <button type="button" onClick={aoFechar} className="rounded-full p-1 text-slate-500" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`mb-3 rounded-2xl p-3 text-sm ${resumo.pior === "bloqueio" ? "bg-red-700 text-white" : resumo.noks ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}
        >
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
          {assinante.cargo ? ` (${assinante.cargo.toLowerCase()})` : ""}, confirmo que vistoriei a placa <strong>{placa}</strong> em {hoje} e que as
          respostas e fotos deste check são verdadeiras.
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
