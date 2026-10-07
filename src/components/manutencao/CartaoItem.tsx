"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, LoaderCircle } from "lucide-react";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { CameraNoApp } from "@/components/CameraNoApp";
import { useToast } from "@/components/Toast";
import { SeletorResponsavel, type PessoaDaLista } from "@/components/manutencao/SeletorResponsavel";
import {
  fotosGuardadasDaAvaliacao,
  guardarFotoPendente,
  novoIdDeFoto,
  removerFotoPendente,
} from "@/lib/manutencao-fotos-offline";
import {
  FOTOS_POR_ITEM,
  prazoSugerido,
  problemaDaResposta,
  separarCriterios,
  type ItemManut,
  type Nota,
} from "@/lib/manutencao";
import type { ResultadoAcao } from "@/lib/resultado-acao";

export type RespostaDoCartao = {
  nota: Nota | null;
  na: boolean;
  observacao: string | null;
  planoAcao: string | null;
  responsavel: string | null;
  prazo: string | null;
  respondidoPorNome: string;
  fotos: { id: string; url: string | null }[];
};

export type AnteriorDoCartao = {
  rotulo: string;
  nota: Nota | null;
  na: boolean;
  fotos: { id: string; url: string | null }[];
};

/** O que o cartão conta para o checklist: a barra de andamento e o "Finalizar". */
export type SituacaoDoItem = {
  respondido: boolean;
  nota: Nota | null;
  na: boolean;
  planoOk: boolean;
  /** Fotos tiradas que o servidor ainda não confirmou: o "Finalizar" espera. */
  fotosPendentes: number;
};

const OPCOES: { valor: "3" | "1" | "0" | "na"; rotulo: string; cor: string; ativo: string }[] = [
  { valor: "3", rotulo: "3", cor: "border-emerald-200 text-emerald-700", ativo: "border-emerald-600 bg-emerald-600 text-white" },
  { valor: "1", rotulo: "1", cor: "border-amber-200 text-amber-700", ativo: "border-amber-500 bg-amber-500 text-white" },
  { valor: "0", rotulo: "0", cor: "border-red-200 text-red-700", ativo: "border-red-600 bg-red-600 text-white" },
  { valor: "na", rotulo: "N/A", cor: "border-slate-200 text-slate-500", ativo: "border-slate-600 bg-slate-600 text-white" },
];

function corDaNota(nota: Nota | null, na: boolean) {
  if (na) return "bg-slate-100 text-slate-600";
  if (nota === 3) return "bg-emerald-100 text-emerald-800";
  if (nota === 1) return "bg-amber-100 text-amber-800";
  if (nota === 0) return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-500";
}

function Miniatura({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return <span className="flex aspect-square items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">sem link</span>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title="Abrir a foto inteira">
      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do bucket privado, fora do otimizador */}
      <img src={url} alt={alt} loading="lazy" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
    </a>
  );
}

const lerNota = (escolha: string) => ({
  na: escolha === "na",
  nota: escolha === "" || escolha === "na" ? null : (Number(escolha) as Nota),
});

type Pendente = { id: string; arquivo: Blob; url: string; estado: "aguardando" | "enviando" | "enviada" };

/** Com foto parada (sem sinal, servidor recusou), tenta de novo neste ritmo. */
const REENVIO_MS = 20_000;

/**
 * UM ITEM DO CHECK DE MANUTENÇÃO -- SEM BOTÃO DE SALVAR (02/10/2026).
 *
 * Pedido do dono: o único botão do checklist é o de fechar. O cartão
 * salva sozinho:
 *  - ao tocar na nota;
 *  - a cada foto tirada (sobe na hora, uma por vez);
 *  - ao parar de digitar na observação ou no plano de ação.
 * O estado aparece no próprio cartão ("Salvando...", "✓ Salvo"); erro
 * aparece ali e no rodapé, e o próximo toque tenta de novo.
 *
 * Os envios do cartão vão em FILA: tocar 3 e depois 1 rapidinho não deixa
 * o "3" chegar por último e ganhar.
 *
 * Foto tirada antes da nota espera a nota (a resposta precisa existir
 * para a foto ter onde ficar) e sobe logo depois dela.
 *
 * FOTO NÃO SE PERDE (07/10/2026): na primeira ronda real, fotos tiradas
 * sumiram sem deixar rastro no servidor. Agora cada foto vai para o
 * IndexedDB do celular no instante em que é aceita e só sai de lá quando
 * o servidor confirma (manutencao-fotos-offline). A página morreu, o
 * Android recarregou a aba, alguém apertou "voltar": ao abrir de novo, o
 * cartão traz a foto de volta e envia. Foto parada tenta de novo sozinha
 * quando o sinal volta e a cada 20 s.
 */
export function CartaoItem({
  item,
  avaliacaoId,
  resposta,
  anterior,
  aberta,
  hojeIso,
  pessoas,
  salvar,
  removerFoto,
  aoMudar,
  aoEnviando,
}: {
  item: ItemManut;
  avaliacaoId: string;
  resposta: RespostaDoCartao | null;
  anterior: AnteriorDoCartao | null;
  aberta: boolean;
  hojeIso: string;
  /** A lista suspensa do responsável pelo plano de ação. */
  pessoas: PessoaDaLista[];
  salvar: (fd: FormData) => Promise<ResultadoAcao>;
  removerFoto: (fd: FormData) => Promise<ResultadoAcao>;
  aoMudar?: (itemId: string, s: SituacaoDoItem) => void;
  /** +1 quando um envio começa, -1 quando termina: o "Finalizar" espera zerar. */
  aoEnviando?: (delta: number) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const inicial = resposta ? (resposta.na ? "na" : resposta.nota !== null ? String(resposta.nota) : "") : "";
  const [escolha, setEscolha] = useState(inicial);
  const [observacao, setObservacao] = useState(resposta?.observacao ?? "");
  const [plano, setPlano] = useState(resposta?.planoAcao ?? "");
  const [responsavel, setResponsavel] = useState(resposta?.responsavel ?? "");
  const [prazo, setPrazo] = useState(resposta?.prazo ?? prazoSugerido(hojeIso, item.critico));
  const [verObs, setVerObs] = useState(false);
  const [camera, setCamera] = useState(false);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [status, setStatus] = useState<"ocioso" | "salvando" | "salvo" | "erro">(resposta ? "salvo" : "ocioso");
  const [erro, setErro] = useState("");

  // Os valores mais novos, para quem roda depois (fila, temporizador).
  // (Atualizados nos próprios handlers, junto com o estado.)
  const atual = useRef({ escolha, observacao, plano, responsavel, prazo });
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const emAndamento = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sujo = useRef(false);
  // Fotos já na fila (ou já enviadas): o mesmo toque, o reenvio de 20 s e
  // a nota nova não podem mandar a mesma foto duas vezes.
  const naFila = useRef(new Set<string>());
  const enviadas = useRef(new Set<string>());
  // A gravação no celular de cada foto: só se apaga de lá depois dela.
  const noCelular = useRef(new Map<string, Promise<boolean>>());
  const avisouErro = useRef(false);

  const criterios = separarCriterios(item.criterios);
  const { nota, na } = lerNota(escolha);
  const abaixo = escolha === "1" || escolha === "0";
  const planoOk = !problemaDaResposta({ nota, na, planoAcao: plano, responsavel, prazo }) || escolha === "";
  const fotos = resposta?.fotos ?? [];
  // A prévia local fica até o servidor devolver a foto (sem piscar vazio).
  const cabemMais = FOTOS_POR_ITEM - fotos.length - pendentes.length;
  const fotosPendentes = pendentes.filter((p) => p.estado !== "enviada").length;

  // Conta para o checklist a cada mudança (a barra de andamento é ao vivo).
  useEffect(() => {
    aoMudar?.(item.id, { respondido: escolha !== "", nota, na, planoOk, fotosPendentes });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só os valores
  }, [escolha, planoOk, fotosPendentes]);

  // Foto que já subiu e já voltou do servidor: sai da lista local.
  const [contagemVista, setContagemVista] = useState(fotos.length);
  if (fotos.length !== contagemVista) {
    setContagemVista(fotos.length);
    setPendentes((ps) => (ps.some((p) => p.estado === "enviada") ? ps.filter((p) => p.estado !== "enviada") : ps));
  }
  // Prévia que saiu da lista devolve a memória (celular com pouca RAM).
  // O ref também é a lista "de agora" para quem roda fora do desenho
  // (o reenvio pelo relógio e pelo sinal que voltou).
  const pendentesAgora = useRef<Pendente[]>([]);
  useEffect(() => {
    const ficam = new Set(pendentes.map((p) => p.id));
    pendentesAgora.current.filter((p) => !ficam.has(p.id)).forEach((p) => URL.revokeObjectURL(p.url));
    pendentesAgora.current = pendentes;
  }, [pendentes]);

  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  // Fotos que ficaram guardadas no celular (a página morreu antes de
  // enviar): voltam para o cartão e sobem, se o item já tem nota.
  useEffect(() => {
    if (!aberta) return;
    let vivo = true;
    fotosGuardadasDaAvaliacao(avaliacaoId).then((todas) => {
      if (!vivo) return;
      const doItem = todas.filter((f) => f.itemId === item.id && !pendentesAgora.current.some((p) => p.id === f.id));
      if (doItem.length === 0) return;
      const voltaram: Pendente[] = doItem.map((f) => ({
        id: f.id,
        arquivo: f.foto,
        url: URL.createObjectURL(f.foto),
        estado: "aguardando",
      }));
      voltaram.forEach((p) => noCelular.current.set(p.id, Promise.resolve(true)));
      setPendentes((ps) => [...ps, ...voltaram]);
      if (atual.current.escolha) voltaram.forEach((p) => enfileirar(p));
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, []);

  function enfileirar(foto?: Pendente) {
    if (foto) {
      if (naFila.current.has(foto.id) || enviadas.current.has(foto.id)) return;
      naFila.current.add(foto.id);
    }
    emAndamento.current++;
    aoEnviando?.(1);
    setStatus("salvando");
    const vez = fila.current.then(async () => {
      const v = atual.current;
      if (!v.escolha) {
        // sem nota não há resposta onde guardar: a foto espera a nota
        if (foto) naFila.current.delete(foto.id);
        return;
      }
      const fd = new FormData();
      fd.set("avaliacao_id", avaliacaoId);
      fd.set("item_id", item.id);
      fd.set("nota", v.escolha);
      fd.set("observacao", v.observacao);
      fd.set("plano_acao", v.plano);
      fd.set("responsavel", v.responsavel);
      fd.set("prazo", v.prazo);
      if (foto) {
        fd.append("fotos", new File([foto.arquivo], `${foto.id}.jpg`, { type: foto.arquivo.type || "image/jpeg" }));
        fd.append("foto_ids", foto.id);
        setPendentes((ps) => ps.map((p) => (p.id === foto.id ? { ...p, estado: "enviando" } : p)));
      }
      let r: ResultadoAcao | undefined;
      try {
        r = await salvar(fd);
      } catch {
        r = { ok: false, erro: "Sem sinal: não salvou ainda. As fotos ficam guardadas no celular e sobem quando o sinal voltar." };
      }
      if (foto) naFila.current.delete(foto.id);
      if (r && !r.ok) {
        setErro(r.erro);
        setStatus("erro");
        // Um aviso só: o reenvio de 20 s não pode encher a tela de avisos.
        if (!avisouErro.current) toast.erro(r.erro);
        avisouErro.current = true;
        if (foto) setPendentes((ps) => ps.map((p) => (p.id === foto.id ? { ...p, estado: "aguardando" } : p)));
        return;
      }
      setErro("");
      avisouErro.current = false;
      if (foto) {
        enviadas.current.add(foto.id);
        setPendentes((ps) => ps.map((p) => (p.id === foto.id ? { ...p, estado: "enviada" } : p)));
        // Só agora sai do celular -- e depois de ter terminado de entrar.
        void (noCelular.current.get(foto.id) ?? Promise.resolve(true)).then(() => removerFotoPendente(foto.id));
      }
    });
    fila.current = vez.finally(() => {
      emAndamento.current--;
      aoEnviando?.(-1);
      if (emAndamento.current === 0) {
        setStatus((s) => (s === "erro" ? s : atual.current.escolha ? "salvo" : "ocioso"));
        // Traz as fotos com link e a barra do painel; a rolagem não mexe.
        router.refresh();
      }
    });
  }

  /** Texto: salva quando a pessoa para de digitar (ou sai do campo). */
  function digitou() {
    sujo.current = true;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(descarregar, 1500);
  }
  function descarregar() {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    if (!sujo.current || !atual.current.escolha) return;
    sujo.current = false;
    enfileirar();
  }

  function mudar(campo: "observacao" | "plano" | "responsavel" | "prazo", valor: string, set: (v: string) => void) {
    set(valor);
    atual.current = { ...atual.current, [campo]: valor };
    digitou();
  }

  function escolher(valor: string) {
    if (valor === atual.current.escolha) return;
    setEscolha(valor);
    atual.current = { ...atual.current, escolha: valor };
    sujo.current = false;
    enfileirar();
    // As fotos tiradas antes da nota sobem agora.
    pendentes.filter((p) => p.estado === "aguardando").forEach((p) => enfileirar(p));
  }

  function novaFoto(arquivo: File) {
    const p: Pendente = { id: novoIdDeFoto(), arquivo, url: URL.createObjectURL(arquivo), estado: "aguardando" };
    // Primeiro no celular, depois na tela e na fila: se a página morrer
    // daqui a um segundo, a foto já está guardada.
    noCelular.current.set(
      p.id,
      guardarFotoPendente({ id: p.id, avaliacaoId, itemId: item.id, foto: arquivo, criadaEm: new Date().toISOString() }),
    );
    setPendentes((ps) => [...ps, p]);
    if (atual.current.escolha) enfileirar(p);
  }

  function descartar(p: Pendente) {
    setPendentes((ps) => ps.filter((x) => x.id !== p.id));
    void (noCelular.current.get(p.id) ?? Promise.resolve(true)).then(() => removerFotoPendente(p.id));
  }

  /** Tenta de novo o que ficou parado: a resposta (se deu erro) e as fotos. */
  function reenviar() {
    if (!atual.current.escolha) return;
    if (status === "erro") enfileirar();
    pendentesAgora.current.filter((p) => p.estado === "aguardando").forEach((p) => enfileirar(p));
  }
  const reenviarAgora = useRef(reenviar);
  useEffect(() => {
    reenviarAgora.current = reenviar;
  });

  // Foto parada ou resposta com erro: tenta quando o sinal volta e a cada
  // 20 s -- quem está na ronda não precisa lembrar de apertar nada.
  const parado = status === "erro" || (escolha !== "" && pendentes.some((p) => p.estado === "aguardando"));
  useEffect(() => {
    if (!parado) return;
    const tentar = () => {
      if (navigator.onLine !== false) reenviarAgora.current();
    };
    window.addEventListener("online", tentar);
    const relogio = setInterval(tentar, REENVIO_MS);
    return () => {
      window.removeEventListener("online", tentar);
      clearInterval(relogio);
    };
  }, [parado]);

  function escolherResponsavel(nome: string) {
    mudar("responsavel", nome, setResponsavel);
    descarregar();
  }

  const respondido = escolha !== "";
  const campo = "w-full rounded-xl border p-2.5 text-base focus:outline-none";

  return (
    <div
      id={`item-${item.numero}`}
      className={`scroll-mt-40 rounded-2xl border bg-white p-4 shadow-sm ${
        status === "erro" ? "border-red-300" : respondido ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      {/* ---- Cabeçalho ---- */}
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-xs font-bold text-primary-dark">{item.numero}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-slate-900">{item.pergunta}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {item.critico && <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">⚠️ Item crítico</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">Peso {item.peso}</span>
            {aberta && <StatusDoSalvar status={status} />}
            {!aberta && resposta && (
              <span className={`rounded-full px-2 py-0.5 font-bold ${corDaNota(resposta.nota, resposta.na)}`}>
                {resposta.na ? "N/A" : `Nota ${resposta.nota}`} · {resposta.respondidoPorNome.split(" ")[0]}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <details className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-primary-dark">🔎 Como verificar</summary>
          <p className="mt-2 leading-relaxed">{item.verificacao}</p>
        </details>
        <Link
          href={`/manutencao/item/${item.numero}`}
          className="shrink-0 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-primary-dark hover:bg-slate-100"
          title="Todas as avaliações deste item, com as fotos"
        >
          📈 Evolução
        </Link>
      </div>

      {/* ---- Trimestre anterior, para comparar ---- */}
      {anterior && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3">
          <p className="text-xs font-semibold text-slate-600">
            {anterior.rotulo}:{" "}
            <span className={`rounded-full px-2 py-0.5 ${corDaNota(anterior.nota, anterior.na)}`}>
              {anterior.na ? "N/A" : anterior.nota === null ? "sem nota" : `nota ${anterior.nota}`}
            </span>
          </p>
          {anterior.fotos.length > 0 ? (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {anterior.fotos.map((f, i) => (
                <Miniatura key={f.id} url={f.url} alt={`${anterior.rotulo}, foto ${i + 1} do item ${item.numero}`} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">Sem foto no trimestre anterior.</p>
          )}
        </div>
      )}

      {aberta ? (
        <div className="mt-3 space-y-3">
          {/* ---- A nota ---- */}
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Nota</legend>
            <div className="grid grid-cols-4 gap-2">
              {OPCOES.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => escolher(o.valor)}
                  aria-pressed={escolha === o.valor}
                  className={`flex h-12 items-center justify-center rounded-xl border-2 text-lg font-bold transition-colors ${
                    escolha === o.valor ? o.ativo : `${o.cor} bg-white`
                  }`}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
            {escolha && escolha !== "na" && criterios[Number(escolha) as Nota] && (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                <strong>{escolha}:</strong> {criterios[Number(escolha) as Nota]}
              </p>
            )}
            {escolha === "na" && <p className="mt-2 text-xs text-slate-500">Não se aplica à unidade: o item sai da conta da seção.</p>}
          </fieldset>

          {/* ---- Fotos: quadradinhos, o último é o de tirar ---- */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fotos <span className="font-normal normal-case text-slate-400">({fotos.length + pendentes.length} de {FOTOS_POR_ITEM})</span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {fotos.map((f, i) => (
                <div key={f.id} className="relative">
                  <Miniatura url={f.url} alt={`Foto ${i + 1} do item ${item.numero}`} />
                  <div className="absolute right-1 top-1">
                    <BotaoNoLugar
                      acao={removerFoto}
                      campos={{ foto_id: f.id }}
                      confirmacao="Tirar esta foto do item?"
                      rotuloConfirmar="Tirar a foto"
                      textoEnviando="…"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                      title="Tirar esta foto"
                    >
                      ✕
                    </BotaoNoLugar>
                  </div>
                </div>
              ))}
              {pendentes.map((p) => (
                <div key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                  <img src={p.url} alt="Foto nova" className="aspect-square w-full rounded-xl border border-slate-200 object-cover" />
                  <span className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-lg bg-black/60 py-0.5 text-[10px] font-semibold text-white">
                    {p.estado === "aguardando" ? (respondido ? (status === "erro" ? "sem sinal" : "na fila") : "dê a nota") : p.estado === "enviando" ? (
                      <>
                        <LoaderCircle size={11} className="animate-spin" aria-hidden /> enviando
                      </>
                    ) : (
                      <>
                        <Check size={11} aria-hidden /> enviada
                      </>
                    )}
                  </span>
                  {p.estado === "aguardando" && (
                    <button
                      type="button"
                      onClick={() => descartar(p)}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                      aria-label="Descartar esta foto"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {cabemMais > 0 && (
                <button
                  type="button"
                  onClick={() => setCamera(true)}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/40 text-primary-dark transition hover:bg-primary-soft active:scale-95"
                  aria-label={`Tirar foto do item ${item.numero}`}
                >
                  <Camera size={26} strokeWidth={1.8} aria-hidden />
                  <span className="text-[10px] font-semibold">Foto</span>
                </button>
              )}
            </div>
            {fotosPendentes > 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                📱 {fotosPendentes === 1 ? "1 foto guardada" : `${fotosPendentes} fotos guardadas`} neste celular
                {respondido ? ": sobe sozinha, mesmo se o sinal cair." : ": dê a nota para enviar."}
              </p>
            )}
          </div>

          {/* ---- Plano de ação: só abaixo de 3 ---- */}
          {abaixo && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">
                🗒️ Plano de ação {item.critico && "· item crítico: reparo em curto prazo ou CAPEX emergencial"}
              </p>
              <textarea
                rows={2}
                maxLength={1000}
                value={plano}
                onChange={(e) => mudar("plano", e.target.value, setPlano)}
                onBlur={descarregar}
                placeholder="O que vai ser feito"
                aria-label="O que vai ser feito"
                className={`${campo} border-amber-200 bg-white focus:border-amber-500`}
              />
              <div className="flex flex-wrap gap-2">
                <SeletorResponsavel
                  valor={responsavel}
                  pessoas={pessoas}
                  aoEscolher={escolherResponsavel}
                  className="min-w-[12rem] flex-1"
                />
                <input
                  type="date"
                  value={prazo}
                  onChange={(e) => mudar("prazo", e.target.value, setPrazo)}
                  onBlur={descarregar}
                  aria-label="Prazo"
                  className={`${campo} w-40 border-amber-200 bg-white focus:border-amber-500`}
                />
              </div>
              {!planoOk && (
                <p className="text-[11px] font-semibold text-amber-800">
                  Preencha o que vai ser feito, o responsável e o prazo: sem isso o checklist não fecha.
                </p>
              )}
            </div>
          )}

          {/* ---- Observação: escondida até a pessoa pedir ---- */}
          {verObs && (
            <div>
              <textarea
                rows={2}
                maxLength={1000}
                value={observacao}
                onChange={(e) => mudar("observacao", e.target.value, setObservacao)}
                onBlur={descarregar}
                placeholder="Observação (opcional)"
                aria-label="Observação"
                className={`${campo} border-slate-200 focus:border-primary`}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setVerObs((v) => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-primary"
            aria-expanded={verObs}
          >
            {verObs ? "▲ Esconder observação" : observacao ? "📝 Ver observação" : "＋ Observação"}
          </button>

          {status === "erro" && erro && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              ⚠️ {erro}{" "}
              <button type="button" onClick={reenviar} className="font-bold underline">
                Tentar de novo
              </button>
            </p>
          )}
        </div>
      ) : (
        // Avaliação fechada: só leitura -- o que foi registrado.
        resposta && (
          <div className="mt-3 space-y-2 text-xs text-slate-700">
            {fotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {fotos.map((f, i) => (
                  <Miniatura key={f.id} url={f.url} alt={`Foto ${i + 1} do item ${item.numero}`} />
                ))}
              </div>
            )}
            {resposta.observacao && (
              <p>
                <strong>Observação:</strong> {resposta.observacao}
              </p>
            )}
            {resposta.planoAcao && (
              <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">
                <strong>Plano de ação:</strong> {resposta.planoAcao}
                {resposta.responsavel ? ` · ${resposta.responsavel}` : ""}
                {resposta.prazo ? ` · até ${resposta.prazo.split("-").reverse().join("/")}` : ""}
              </p>
            )}
          </div>
        )
      )}

      {camera && <CameraNoApp restantes={cabemMais} aoTirar={novaFoto} aoFechar={() => setCamera(false)} />}
    </div>
  );
}

function StatusDoSalvar({ status }: { status: "ocioso" | "salvando" | "salvo" | "erro" }) {
  if (status === "salvando") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
        <LoaderCircle size={11} className="animate-spin" aria-hidden /> Salvando...
      </span>
    );
  }
  if (status === "salvo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
        <Check size={11} aria-hidden /> Salvo
      </span>
    );
  }
  if (status === "erro") return <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">Não salvou</span>;
  return null;
}
