"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirmacao } from "@/components/Confirmacao";
import { CameraNoApp } from "@/components/CameraNoApp";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import {
  finalizarAuditoria,
  removerFotoResposta,
  salvarFotoResposta,
  salvarResposta,
} from "@/app/5s/actions";
import {
  BOTAO_RESPOSTA,
  EMOJI_SENSO,
  JAPONES_SENSO,
  MINIMO_DESCRICAO_NOK,
  ROTULO_SENSO,
  SENSOS,
  formatarTaxa,
  nokSemDescricao,
  taxaConformidade,
  type Pergunta,
  type Resposta,
  type RespostaSalva,
  type Senso,
} from "@/lib/cinco-s";

/**
 * O checklist 5S, feito para ser respondido andando pela área com o
 * celular na mão.
 *
 * Três decisões mandam no desenho:
 *
 * 1) UM SENSO POR VEZ. Vinte e cinco perguntas numa página só viram
 *    uma rolagem em que ninguém sabe onde parou. Cinco telas de quatro
 *    a seis perguntas cabem na mão e dão um fim visível a cada etapa.
 *
 * 2) SALVA A CADA TOQUE. A auditoria acontece no fundo do armazém, onde
 *    o sinal cai. Um "Enviar" no fim significaria perder as vinte e
 *    cinco respostas de uma vez. Aqui, cada resposta já está no banco
 *    antes de a pessoa dar o próximo passo.
 *
 * 3) O DEDO ANTES DO OLHO. Os três botões ocupam a largura toda e têm
 *    altura de alvo de toque de verdade -- não são rádio-buttons de
 *    formulário de desktop encolhidos para caber.
 *
 * 4) NOK NÃO PASSA MUDO. Marcar "não conforme" abre a descrição e ela
 *    é obrigatória para avançar de senso e para finalizar. É esse texto
 *    -- e não a pergunta do checklist -- que chega ao dono da área como
 *    a ação a executar. O campo grava sozinho ao sair dele: exigir um
 *    "Salvar" extra é como o texto se perdia antes.
 *
 * 5) A FOTO SOBE SOZINHA (15/10/2026). Tirou, ela já vai para o
 *    servidor; no item fica a foto com "Excluir", e só. Antes havia um
 *    "Salvar" no item, e a foto salva sumia da tela -- o auditor achava
 *    que não tinha ido e tirava outra.
 */

/** A foto tirada que ainda não está no servidor. */
type FotoLocal = {
  url: string;
  arquivo: File;
  estado: "enviando" | "falhou";
};

type Props = {
  auditoriaId: string;
  areaNome: string;
  perguntas: Pergunta[];
  respostasIniciais: RespostaSalva[];
  /** Já finalizada: a tela vira só leitura. */
  somenteLeitura: boolean;
};

export function Checklist({
  auditoriaId,
  areaNome,
  perguntas,
  respostasIniciais,
  somenteLeitura,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [salvando, iniciarSalvamento] = useTransition();

  const [respostas, setRespostas] = useState(() => {
    const m = new Map<string, RespostaSalva>();
    for (const r of respostasIniciais) m.set(r.pergunta_id, r);
    return m;
  });

  /**
   * O que já está no banco, por pergunta.
   *
   * A descrição do NOK grava ao sair do campo, e o auditor entra e sai
   * dele várias vezes enquanto olha para a área. Sem esta referência,
   * cada saída sem edição dispararia um upsert -- e a auditoria roda no
   * sinal fraco do fundo do armazém, onde toda ida à rede custa.
   */
  const salvas = useRef(
    new Map(respostasIniciais.map((r) => [r.pergunta_id, r.observacao ?? ""])),
  );

  const porSenso = useMemo(() => {
    const m = new Map<Senso, Pergunta[]>();
    for (const s of SENSOS) m.set(s, []);
    for (const p of perguntas) m.get(p.senso)?.push(p);
    // Senso sem pergunta ativa não vira etapa vazia.
    return SENSOS.filter((s) => (m.get(s)?.length ?? 0) > 0).map((s) => ({
      senso: s,
      perguntas: m.get(s)!,
    }));
  }, [perguntas]);

  const [etapa, setEtapa] = useState(() => {
    // Abre na primeira etapa que ainda tem pendência -- pergunta em
    // branco ou NOK sem descrição. Quem voltou depois de uma
    // interrupção continua de onde parou, sem precisar procurar.
    const salvas = new Map(respostasIniciais.map((r) => [r.pergunta_id, r]));
    const grupos = SENSOS.filter((s) =>
      perguntas.some((p) => p.senso === s),
    ).map((s) => perguntas.filter((p) => p.senso === s));
    const i = grupos.findIndex((g) =>
      g.some((p) => {
        const r = salvas.get(p.id);
        return !r || nokSemDescricao(r);
      }),
    );
    return i === -1 ? grupos.length : i;
  });

  /**
   * Marca em vermelho os itens sem resposta.
   *
   * Só liga quando a pessoa TENTA avançar. Ligado desde o início, o
   * senso inteiro nasceria vermelho -- e um aviso que aparece antes de
   * existir erro deixa de ser lido.
   */
  const [destacarPendentes, setDestacarPendentes] = useState(false);

  const total = perguntas.length;
  const respondidas = respostas.size;
  const progresso = total > 0 ? Math.round((respondidas / total) * 100) : 0;
  const noResumo = etapa >= porSenso.length;

  const contagem = useMemo(() => {
    let ok = 0;
    let nok = 0;
    let na = 0;
    for (const r of respostas.values()) {
      if (r.valor === "sim") ok++;
      else if (r.valor === "nao") nok++;
      else na++;
    }
    return { ok, nok, na };
  }, [respostas]);

  function responder(pergunta: Pergunta, valor: Resposta) {
    if (somenteLeitura) return;

    const anterior = respostas.get(pergunta.id);

    // Otimista: o botão pinta na hora. A auditoria é uma sequência
    // rápida de toques, e esperar a rede a cada um faria a tela parecer
    // travada mesmo funcionando.
    setRespostas((m) => {
      const novo = new Map(m);
      novo.set(pergunta.id, {
        pergunta_id: pergunta.id,
        valor,
        observacao: anterior?.observacao ?? null,
        foto_url: anterior?.foto_url ?? null,
      });
      return novo;
    });

    const dados = new FormData();
    dados.set("auditoria_id", auditoriaId);
    dados.set("pergunta_id", pergunta.id);
    dados.set("valor", valor);
    if (anterior?.observacao) dados.set("observacao", anterior.observacao);

    iniciarSalvamento(async () => {
      const r = await salvarResposta(dados);
      if (!r.ok) {
        // Desfaz o otimismo: mostrar respondido o que o banco recusou
        // faria a pessoa finalizar achando que gravou.
        setRespostas((m) => {
          const novo = new Map(m);
          if (anterior) novo.set(pergunta.id, anterior);
          else novo.delete(pergunta.id);
          return novo;
        });
        toast.erro(r.erro);
      }
    });
  }

  /**
   * As fotos tiradas que ainda não estão no servidor, por pergunta.
   *
   * Moram aqui, e não no item, para continuarem subindo quando o auditor
   * passa para o próximo senso -- e para a revisão final saber que ainda
   * há foto a caminho. O ref é a lista "de agora" (quem roda fora do
   * desenho, como o reenvio quando o sinal volta); o estado só desenha.
   */
  const [fotosLocais, setFotosLocais] = useState(() => new Map<string, FotoLocal>());
  const fotosAgora = useRef(fotosLocais);

  function mudarFotoLocal(perguntaId: string, foto: FotoLocal | null) {
    const novo = new Map(fotosAgora.current);
    const velha = novo.get(perguntaId);
    // A prévia que sai da tela devolve a memória (celular com pouca RAM).
    if (velha && velha.url !== foto?.url) URL.revokeObjectURL(velha.url);
    if (foto) novo.set(perguntaId, foto);
    else novo.delete(perguntaId);
    fotosAgora.current = novo;
    setFotosLocais(novo);
  }

  useEffect(
    () => () => fotosAgora.current.forEach((f) => URL.revokeObjectURL(f.url)),
    [],
  );

  /** Tirou a foto: ela sobe na hora, sem botão de salvar. */
  async function enviarFoto(pergunta: Pergunta, arquivo: File) {
    if (somenteLeitura) return;
    const atual = respostas.get(pergunta.id);
    if (!atual) {
      toast.erro("Responda o item antes da foto.");
      return;
    }

    const anterior = fotosAgora.current.get(pergunta.id);
    const local: FotoLocal = {
      // No reenvio a prévia é a mesma; só a foto nova ganha endereço novo.
      url: anterior?.arquivo === arquivo ? anterior.url : URL.createObjectURL(arquivo),
      arquivo,
      estado: "enviando",
    };
    mudarFotoLocal(pergunta.id, local);

    const dados = new FormData();
    dados.set("auditoria_id", auditoriaId);
    dados.set("pergunta_id", pergunta.id);
    dados.set("valor", atual.valor);
    dados.set("foto", arquivo);

    let r: Awaited<ReturnType<typeof salvarFotoResposta>>;
    try {
      r = await salvarFotoResposta(dados);
    } catch {
      r = {
        ok: false,
        erro: "Sem sinal: a foto não subiu. Ela fica no item e sobe quando o sinal voltar.",
      };
    }

    if (r.ok) {
      const url = r.url;
      setRespostas((m) => {
        const a = m.get(pergunta.id);
        if (!a) return m;
        const novo = new Map(m);
        novo.set(pergunta.id, { ...a, foto_url: url });
        return novo;
      });
      mudarFotoLocal(pergunta.id, null);
    } else {
      mudarFotoLocal(pergunta.id, { ...local, estado: "falhou" });
      toast.erro(r.erro);
    }
  }

  // Foto que não subiu tenta de novo quando o sinal volta -- quem está
  // andando pela área não precisa lembrar de apertar nada.
  const enviarFotoAgora = useRef(enviarFoto);
  useEffect(() => {
    enviarFotoAgora.current = enviarFoto;
  });
  const temFotoParada = [...fotosLocais.values()].some((f) => f.estado === "falhou");
  useEffect(() => {
    if (!temFotoParada) return;
    function tentar() {
      for (const [id, f] of fotosAgora.current) {
        const p = perguntas.find((x) => x.id === id);
        if (p && f.estado === "falhou") void enviarFotoAgora.current(p, f.arquivo);
      }
    }
    window.addEventListener("online", tentar);
    return () => window.removeEventListener("online", tentar);
  }, [temFotoParada, perguntas]);

  /** O "Excluir" da foto: a que não subiu sai na hora; a do servidor, com pergunta. */
  async function excluirFoto(pergunta: Pergunta) {
    if (somenteLeitura) return;

    const local = fotosAgora.current.get(pergunta.id);
    if (local) {
      // Subindo não dá para desistir no meio: a resposta do servidor
      // chegaria depois e traria a foto de volta.
      if (local.estado === "falhou") mudarFotoLocal(pergunta.id, null);
      return;
    }

    const url = respostas.get(pergunta.id)?.foto_url;
    if (!url) return;

    const sim = await confirmar({
      titulo: "Excluir esta foto?",
      detalhe: "Ela sai do item. Se precisar, tire outra.",
      confirmar: "Excluir",
    });
    if (!sim) return;

    const trocarFoto = (de: string | null, para: string | null) =>
      setRespostas((m) => {
        const a = m.get(pergunta.id);
        if (!a || a.foto_url !== de) return m;
        const novo = new Map(m);
        novo.set(pergunta.id, { ...a, foto_url: para });
        return novo;
      });

    // Otimista: a foto some na hora; volta se o servidor recusar.
    trocarFoto(url, null);

    const dados = new FormData();
    dados.set("auditoria_id", auditoriaId);
    dados.set("pergunta_id", pergunta.id);

    let r: Awaited<ReturnType<typeof removerFotoResposta>>;
    try {
      r = await removerFotoResposta(dados);
    } catch {
      r = { ok: false, erro: "Sem sinal: a foto não foi excluída. Tente de novo." };
    }
    if (!r.ok) {
      trocarFoto(null, url);
      toast.erro(r.erro);
    }
  }

  /** Digitação: fica só na tela, para o campo não travar a cada tecla. */
  function alterarObservacao(pergunta: Pergunta, texto: string) {
    setRespostas((m) => {
      const atual = m.get(pergunta.id);
      if (!atual) return m;
      const novo = new Map(m);
      novo.set(pergunta.id, { ...atual, observacao: texto || null });
      return novo;
    });
  }

  /**
   * Sair do campo grava.
   *
   * Antes, a descrição só ia ao banco se o auditor tocasse em "Salvar"
   * -- e o texto escrito e abandonado sumia junto com a tela, deixando
   * a não conformidade nascer com a pergunta do checklist no lugar do
   * problema. É a origem do plano de ação que ninguém entendia.
   */
  function salvarObservacao(pergunta: Pergunta) {
    if (somenteLeitura) return;
    const atual = respostas.get(pergunta.id);
    if (!atual) return;

    const texto = (atual.observacao ?? "").trim();
    if (texto === (salvas.current.get(pergunta.id) ?? "").trim()) return;

    const dados = new FormData();
    dados.set("auditoria_id", auditoriaId);
    dados.set("pergunta_id", pergunta.id);
    dados.set("valor", atual.valor);
    dados.set("observacao", texto);

    salvas.current.set(pergunta.id, texto);

    iniciarSalvamento(async () => {
      const r = await salvarResposta(dados);
      if (!r.ok) {
        salvas.current.delete(pergunta.id);
        toast.erro(r.erro);
      }
    });
  }

  /**
   * Troca de senso e volta para o começo da lista.
   *
   * Sem isto a rolagem fica onde estava -- no rodapé, onde o dedo
   * acabou de tocar o botão -- e o senso novo abre pelo fim. A pessoa
   * vê as últimas perguntas primeiro e precisa subir na mão toda vez,
   * cinco vezes por auditoria.
   *
   * Rolagem instantânea, e não suave: é troca de etapa, não navegação
   * dentro da mesma tela. Meio segundo de animação a cada senso, com o
   * celular na mão andando pela área, atrasa sem informar nada.
   */
  function irParaEtapa(proxima: number) {
    setDestacarPendentes(false);
    setEtapa(proxima);
    window.scrollTo({ top: 0 });
  }

  /** As perguntas do senso aberto que ainda estão sem resposta. */
  const pendentesDoSenso = noResumo
    ? []
    : porSenso[etapa].perguntas.filter((p) => !respostas.has(p.id));

  /** Os NOK do senso aberto que ainda não dizem o que precisa ser feito. */
  const semDescricaoDoSenso = noResumo
    ? []
    : porSenso[etapa].perguntas.filter((p) => {
        const r = respostas.get(p.id);
        return r ? nokSemDescricao(r) : false;
      });

  const travas = [...pendentesDoSenso, ...semDescricaoDoSenso];

  /**
   * Avançar exige o senso completo -- respondido E, nos NOK, descrito.
   *
   * O bloqueio é aqui E no servidor: `finalizarAuditoria` recusa a
   * auditoria incompleta de novo, porque esta tela é só a tela -- e a
   * ação de servidor pode ser chamada sem passar por ela.
   *
   * Em vez de um botão desligado, que não explica nada, o botão avisa
   * quantos faltam, pinta os pendentes e leva a pessoa até o primeiro
   * deles. Botão morto no celular passa por tela travada.
   */
  function avancar() {
    if (travas.length > 0) {
      setDestacarPendentes(true);
      // Responder vem antes de descrever: mandar o auditor escrever num
      // senso que ainda tem item em branco o faria voltar duas vezes.
      if (pendentesDoSenso.length > 0) {
        toast.erro(
          pendentesDoSenso.length === 1
            ? "Falta responder 1 item deste senso."
            : `Faltam responder ${pendentesDoSenso.length} itens deste senso.`,
        );
      } else {
        toast.erro(
          semDescricaoDoSenso.length === 1
            ? "Escreva o que precisa ser feito no item NOK. É o que o dono da área vai ler."
            : `Escreva o que precisa ser feito nos ${semDescricaoDoSenso.length} itens NOK. É o que o dono da área vai ler.`,
        );
      }
      document
        .getElementById(`item-${travas[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    irParaEtapa(etapa + 1);
  }

  function finalizar() {
    iniciarSalvamento(async () => {
      const r = await finalizarAuditoria(auditoriaId);
      if (r.ok) {
        toast.sucesso(r.mensagem ?? "Auditoria finalizada.");
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <div className="pb-28">
      {/* ---- Barra de progresso, sempre visível ---- */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
            {areaNome}
          </p>
          <p className="shrink-0 text-xs tabular-nums text-slate-500">
            {respondidas} de {total}
          </p>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progresso}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {noResumo
            ? "Revisão final"
            : `Senso ${etapa + 1} de ${porSenso.length} · ${
                total - respondidas
              } ${total - respondidas === 1 ? "pergunta" : "perguntas"} para responder`}
        </p>
      </div>

      {noResumo ? (
        <Resumo
          contagem={contagem}
          total={total}
          respondidas={respondidas}
          somenteLeitura={somenteLeitura}
          salvando={salvando}
          fotosEnviando={
            [...fotosLocais.values()].filter((f) => f.estado === "enviando").length
          }
          fotosParadas={
            [...fotosLocais.values()].filter((f) => f.estado === "falhou").length
          }
          onVoltar={() => irParaEtapa(porSenso.length - 1)}
          onFinalizar={finalizar}
          onIrPara={(s) => {
            const i = porSenso.findIndex((g) => g.senso === s);
            if (i >= 0) irParaEtapa(i);
          }}
          porSenso={porSenso.map((g) => ({
            senso: g.senso,
            faltam: g.perguntas.filter((p) => !respostas.has(p.id)).length,
            nok: g.perguntas.filter((p) => respostas.get(p.id)?.valor === "nao")
              .length,
            semDescricao: g.perguntas.filter((p) => {
              const r = respostas.get(p.id);
              return r ? nokSemDescricao(r) : false;
            }).length,
            fotosParadas: g.perguntas.filter(
              (p) => fotosLocais.get(p.id)?.estado === "falhou",
            ).length,
          }))}
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">
              {EMOJI_SENSO[porSenso[etapa].senso]}
            </span>
            <div>
              <h2 className="text-lg font-bold leading-tight text-slate-900">
                {ROTULO_SENSO[porSenso[etapa].senso]}
              </h2>
              <p className="text-xs text-slate-400">
                {JAPONES_SENSO[porSenso[etapa].senso]} ·{" "}
                {porSenso[etapa].perguntas.length} itens
              </p>
            </div>
          </div>

          <ul className="space-y-3">
            {porSenso[etapa].perguntas.map((p) => (
              <ItemPergunta
                key={p.id}
                pergunta={p}
                resposta={respostas.get(p.id)}
                somenteLeitura={somenteLeitura}
                pendente={destacarPendentes && !respostas.has(p.id)}
                faltaDescricao={semDescricaoDoSenso.includes(p)}
                cobrarDescricao={
                  destacarPendentes && semDescricaoDoSenso.includes(p)
                }
                onResponder={(v) => responder(p, v)}
                fotoLocal={fotosLocais.get(p.id)}
                onFoto={(f) => void enviarFoto(p, f)}
                onExcluirFoto={() => void excluirFoto(p)}
                onObservacao={(t) => alterarObservacao(p, t)}
                onSalvarObservacao={() => salvarObservacao(p)}
              />
            ))}
          </ul>
        </>
      )}

      {/* ---- Navegação fixa no rodapé, na altura do polegar ---- */}
      {!noResumo && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-2xl gap-2">
            <button
              type="button"
              onClick={() => irParaEtapa(Math.max(0, etapa - 1))}
              disabled={etapa === 0}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
            >
              ←
            </button>
            <button
              type="button"
              onClick={avancar}
              aria-disabled={travas.length > 0}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white ${
                travas.length > 0
                  ? "bg-slate-300"
                  : "bg-primary active:bg-primary-dark"
              }`}
            >
              {pendentesDoSenso.length > 0
                ? `Faltam ${pendentesDoSenso.length} ${
                    pendentesDoSenso.length === 1 ? "item" : "itens"
                  } neste senso`
                : semDescricaoDoSenso.length > 0
                  ? `Descreva ${semDescricaoDoSenso.length} ${
                      semDescricaoDoSenso.length === 1 ? "item NOK" : "itens NOK"
                    }`
                  : etapa === porSenso.length - 1
                    ? "Revisar e finalizar"
                    : `Próximo: ${ROTULO_SENSO[porSenso[etapa + 1].senso]}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ItemPergunta({
  pergunta,
  resposta,
  somenteLeitura,
  pendente,
  faltaDescricao,
  cobrarDescricao,
  onResponder,
  fotoLocal,
  onFoto,
  onExcluirFoto,
  onObservacao,
  onSalvarObservacao,
}: {
  pergunta: Pergunta;
  resposta?: RespostaSalva;
  somenteLeitura: boolean;
  /** Ficou sem resposta e a pessoa tentou avançar. */
  pendente: boolean;
  /** É NOK e a descrição obrigatória ainda não está de pé. */
  faltaDescricao: boolean;
  /** ... e a pessoa já tentou avançar assim. */
  cobrarDescricao: boolean;
  onResponder: (v: Resposta) => void;
  /** A foto tirada que ainda não chegou ao servidor. */
  fotoLocal?: FotoLocal;
  /** Foto tirada (ou o "tentar de novo"): sobe na hora. */
  onFoto: (foto: File) => void;
  onExcluirFoto: () => void;
  onObservacao: (texto: string) => void;
  onSalvarObservacao: () => void;
}) {
  // O detalhe abre sozinho quando o item é NOK: descrever o problema
  // não é opcional escondido atrás de um clique, é o próximo passo --
  // é dessa descrição que nasce a ação no colo do dono da área.
  const [aberto, setAberto] = useState(false);
  const [camera, setCamera] = useState(false);
  const ehNok = resposta?.valor === "nao";
  const mostrarDetalhe = aberto || ehNok;

  return (
    <li
      id={`item-${pergunta.id}`}
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        pendente || cobrarDescricao
          ? "border-red-300 ring-2 ring-red-100"
          : "border-slate-200"
      }`}
    >
      <p className="text-sm leading-snug text-slate-700">
        <span className="font-bold text-slate-900">{pergunta.codigo}</span>{" "}
        {pergunta.texto}
      </p>
      {pendente && (
        <p className="mt-1 text-xs font-semibold text-red-600">
          Falta responder este item.
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["sim", "nao", "na"] as Resposta[]).map((v) => {
          const ativo = resposta?.valor === v;
          const cores: Record<Resposta, string> = {
            sim: ativo
              ? "bg-green-600 text-white ring-green-600"
              : "text-green-700 ring-green-200 hover:bg-green-50",
            nao: ativo
              ? "bg-red-600 text-white ring-red-600"
              : "text-red-700 ring-red-200 hover:bg-red-50",
            na: ativo
              ? "bg-slate-600 text-white ring-slate-600"
              : "text-slate-500 ring-slate-200 hover:bg-slate-50",
          };
          return (
            <button
              key={v}
              type="button"
              disabled={somenteLeitura}
              onClick={() => onResponder(v)}
              aria-pressed={ativo}
              className={`rounded-xl py-3 text-sm font-bold ring-1 transition-colors disabled:opacity-60 ${cores[v]}`}
            >
              {BOTAO_RESPOSTA[v]}
            </button>
          );
        })}
      </div>

      {!somenteLeitura && !mostrarDetalhe && resposta && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="mt-2 text-xs font-medium text-primary underline"
        >
          + observação ou foto
        </button>
      )}

      {mostrarDetalhe && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {ehNok && (
            <label
              htmlFor={`obs-${pergunta.id}`}
              className="block text-xs font-semibold text-slate-700"
            >
              O que precisa ser feito?{" "}
              <span className="font-normal text-red-600">obrigatório</span>
            </label>
          )}
          <textarea
            id={`obs-${pergunta.id}`}
            name="observacao"
            rows={ehNok ? 3 : 2}
            value={resposta?.observacao ?? ""}
            onChange={(e) => onObservacao(e.target.value)}
            // Grava ao sair do campo. O auditor escreve e já toca no
            // próximo item -- não existe momento em que ele voltaria
            // para apertar um botão de salvar.
            onBlur={onSalvarObservacao}
            disabled={somenteLeitura}
            required={ehNok}
            minLength={ehNok ? MINIMO_DESCRICAO_NOK : undefined}
            aria-invalid={cobrarDescricao || undefined}
            placeholder={
              ehNok
                ? "Ex.: retirar as caixas do corredor e devolver ao estoque. O dono da área lê exatamente este texto no plano de ação."
                : "Observação (opcional)"
            }
            className={`w-full rounded-xl border p-3 text-base focus:outline-none disabled:bg-slate-50 ${
              cobrarDescricao
                ? "border-red-400 focus:border-red-500"
                : "border-slate-200 focus:border-primary"
            }`}
          />

          {faltaDescricao && !somenteLeitura && (
            <p
              className={`text-xs ${
                cobrarDescricao ? "font-semibold text-red-600" : "text-slate-500"
              }`}
            >
              Escreva o que o dono da área precisa fazer — sem isso ele
              recebe só a pergunta do checklist e não sabe do que se trata.
            </p>
          )}

          {/* ---- A foto: sobe sozinha; no item fica só o "Excluir" ---- */}
          {fotoLocal ? (
            <div className="relative h-24 w-full overflow-hidden rounded-xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
              <img
                src={fotoLocal.url}
                alt="Foto tirada agora"
                className="h-full w-full object-cover"
              />
              <span
                className={`absolute bottom-1 left-1 flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-white ${
                  fotoLocal.estado === "falhou" ? "bg-red-600/90" : "bg-black/60"
                }`}
              >
                {fotoLocal.estado === "enviando" ? (
                  <>
                    <LoaderCircle size={12} className="animate-spin" aria-hidden />
                    enviando
                  </>
                ) : (
                  "não subiu"
                )}
              </span>
              {fotoLocal.estado === "falhou" && (
                <div className="absolute right-1 top-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => onFoto(fotoLocal.arquivo)}
                    className="flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-semibold text-slate-800 shadow"
                  >
                    <RotateCcw size={13} aria-hidden /> Tentar de novo
                  </button>
                  <button
                    type="button"
                    onClick={onExcluirFoto}
                    aria-label="Descartar esta foto"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          ) : resposta?.foto_url ? (
            <div className="relative">
              <FotoEvidencia
                src={resposta.foto_url}
                alt="Evidência registrada"
                classeCaixa="h-24 w-full"
              />
              {/* Guardada no servidor: o selo fica, para ninguém tirar de novo. */}
              <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded-lg bg-emerald-600/90 px-2 py-0.5 text-[11px] font-semibold text-white">
                <Check size={12} strokeWidth={3} aria-hidden /> enviada
              </span>
              {!somenteLeitura && (
                <button
                  type="button"
                  onClick={onExcluirFoto}
                  className="absolute right-1 top-1 flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs font-semibold text-red-600 shadow"
                >
                  <Trash2 size={13} aria-hidden /> Excluir
                </button>
              )}
            </div>
          ) : (
            !somenteLeitura && (
              <button
                type="button"
                onClick={() => setCamera(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/40 py-3 text-sm font-semibold text-primary-dark active:scale-[0.98]"
              >
                <Camera size={18} strokeWidth={1.8} aria-hidden /> Tirar foto
              </button>
            )
          )}

          {camera && (
            // A câmera do app, e não a do aparelho: no Android com pouca
            // memória a do aparelho fazia o sistema fechar o navegador.
            <CameraNoApp
              restantes={1}
              aoTirar={onFoto}
              aoFechar={() => setCamera(false)}
            />
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

function Resumo({
  contagem,
  total,
  respondidas,
  somenteLeitura,
  salvando,
  porSenso,
  fotosEnviando,
  fotosParadas,
  onVoltar,
  onFinalizar,
  onIrPara,
}: {
  contagem: { ok: number; nok: number; na: number };
  total: number;
  respondidas: number;
  somenteLeitura: boolean;
  salvando: boolean;
  porSenso: {
    senso: Senso;
    faltam: number;
    nok: number;
    semDescricao: number;
    fotosParadas: number;
  }[];
  /** Fotos tiradas ainda subindo. */
  fotosEnviando: number;
  /** Fotos que não subiram (sem sinal). */
  fotosParadas: number;
  onVoltar: () => void;
  onFinalizar: () => void;
  onIrPara: (s: Senso) => void;
}) {
  const faltam = total - respondidas;
  const taxa = taxaConformidade(contagem.ok, contagem.nok);

  // A revisão final é a última chance de barrar o NOK mudo -- daqui em
  // diante ele viraria uma linha do plano de ação sem dizer o que fazer.
  const semDescricao = porSenso.reduce((s, g) => s + g.semDescricao, 0);
  // Foto a caminho também segura: finalizar antes faria a ação nascer
  // sem a evidência que o auditor tirou.
  const fotosPendentes = fotosEnviando + fotosParadas;
  const travado = faltam > 0 || semDescricao > 0 || fotosPendentes > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Conformidade parcial
        </p>
        <p className="text-4xl font-bold text-primary">{formatarTaxa(taxa)}</p>
        <p className="mt-1 text-sm text-slate-500">
          {contagem.ok} conformes · {contagem.nok} não conformes ·{" "}
          {contagem.na} não se aplicam
        </p>
      </div>

      <ul className="space-y-2">
        {porSenso.map((s) => (
          <li key={s.senso}>
            <button
              type="button"
              onClick={() => onIrPara(s.senso)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">{EMOJI_SENSO[s.senso]}</span>
                <span className="truncate text-sm font-medium text-slate-700">
                  {ROTULO_SENSO[s.senso]}
                </span>
              </span>
              <span className="shrink-0 text-xs">
                {s.faltam > 0 ? (
                  <span className="font-semibold text-amber-600">
                    faltam {s.faltam}
                  </span>
                ) : s.semDescricao > 0 ? (
                  <span className="font-semibold text-red-600">
                    {s.semDescricao} sem descrição
                  </span>
                ) : s.fotosParadas > 0 ? (
                  <span className="font-semibold text-red-600">
                    {s.fotosParadas === 1 ? "foto não subiu" : `${s.fotosParadas} fotos não subiram`}
                  </span>
                ) : s.nok > 0 ? (
                  <span className="font-semibold text-red-600">
                    {s.nok} NOK
                  </span>
                ) : (
                  <span className="font-semibold text-green-600">tudo OK</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {semDescricao > 0 && !somenteLeitura && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-900">
          <strong>
            {semDescricao} {semDescricao === 1 ? "item NOK" : "itens NOK"}
          </strong>{" "}
          ainda não {semDescricao === 1 ? "diz" : "dizem"} o que precisa ser
          feito. Toque no senso acima e escreva — é esse texto que o dono da
          área recebe.
        </p>
      )}

      {fotosParadas > 0 && !somenteLeitura && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-900">
          <strong>
            {fotosParadas === 1 ? "1 foto não subiu" : `${fotosParadas} fotos não subiram`}
          </strong>{" "}
          por falta de sinal. Elas tentam de novo sozinhas quando o sinal
          volta — ou toque no senso acima e em &quot;Tentar de novo&quot;.
        </p>
      )}

      {contagem.nok > 0 && !somenteLeitura && (
        <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
          Ao finalizar, os <strong>{contagem.nok}</strong> itens não conformes
          viram ações no Plano de Ação 5S, com a sua descrição, já atribuídas ao
          dono da área com prazo de 30 dias. Você ajusta responsável e prazo
          depois.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600"
        >
          ←
        </button>
        {!somenteLeitura && (
          <button
            type="button"
            onClick={onFinalizar}
            disabled={travado || salvando}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white active:bg-primary-dark disabled:bg-slate-300"
          >
            {salvando ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="rodinha" aria-hidden="true" />
                Finalizando...
              </span>
            ) : faltam > 0 ? (
              `Faltam ${faltam} ${faltam === 1 ? "pergunta" : "perguntas"}`
            ) : semDescricao > 0 ? (
              `Descreva ${semDescricao} ${semDescricao === 1 ? "item NOK" : "itens NOK"}`
            ) : fotosParadas > 0 ? (
              fotosParadas === 1 ? "1 foto não subiu" : `${fotosParadas} fotos não subiram`
            ) : fotosEnviando > 0 ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="rodinha" aria-hidden="true" />
                {fotosEnviando === 1 ? "Enviando a foto..." : `Enviando ${fotosEnviando} fotos...`}
              </span>
            ) : (
              "Finalizar auditoria"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
