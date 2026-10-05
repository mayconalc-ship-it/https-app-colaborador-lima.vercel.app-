import { MessageCircle, Phone } from "lucide-react";
import { IconeTipo, SeloPrazo, SeloPrioridade, SeloStatus } from "@/components/chamados/Selos";
import { dataHora, linkWhatsapp, protocolo, rotuloPrioridade, rotuloTipo, situacaoDoPrazo } from "@/lib/chamados";
import type { Chamado, Evento, FotoChamado } from "@/lib/chamados-server";

/**
 * O CHAMADO POR INTEIRO -- a mesma leitura no app e no link de quem abriu
 * sem login. O que muda entre os dois vem de fora: os botões (`children`)
 * e o telefone de quem abriu, que só o time da manutenção vê.
 */
export function DetalheDoChamado({
  chamado: c,
  eventos,
  fotos,
  mostrarTelefone = false,
  children,
}: {
  chamado: Chamado;
  eventos: Evento[];
  fotos: FotoChamado[];
  mostrarTelefone?: boolean;
  children?: React.ReactNode;
}) {
  const situacao = situacaoDoPrazo(c);
  const daAbertura = fotos.filter((f) => f.etapa === "abertura");
  const daConclusao = fotos.filter((f) => f.etapa === "conclusao");
  const whatsapp = mostrarTelefone
    ? linkWhatsapp(c.solicitante_telefone, `Olá, ${c.solicitante_nome.split(" ")[0]}! Sobre o chamado ${protocolo(c.numero)} (${c.local_nome}):`)
    : null;

  return (
    <div className="space-y-4">
      {/* ---- Cabeçalho ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-dark">
            <IconeTipo tipo={c.tipo} size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm font-bold text-slate-500">{protocolo(c.numero)}</span>
              <SeloStatus status={c.status} />
              <SeloPrioridade prioridade={c.prioridade} />
            </div>
            <h2 className="mt-1 text-lg font-bold leading-snug text-slate-900">
              {rotuloTipo(c.tipo)} · {c.local_nome}
            </h2>
            <div className="mt-1">
              <SeloPrazo situacao={situacao} />
            </div>
          </div>
        </div>

        <Etapas chamado={c} />

        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{c.descricao}</p>

        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-400">Pedido por</dt>
            <dd className="text-slate-800">
              {c.solicitante_nome}
              <span className="text-xs text-slate-400"> · {dataHora(c.aberto_em)}{c.origem === "qr" ? " · pelo QR" : ""}</span>
            </dd>
          </div>
          {c.responsavel_nome && (
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-400">Quem está cuidando</dt>
              <dd className="text-slate-800">{c.responsavel_nome}</dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] font-semibold uppercase text-slate-400">Prazo ({rotuloPrioridade(c.prioridade).toLowerCase()})</dt>
            <dd className="text-slate-800">{dataHora(c.prazo_em)}</dd>
          </div>
          {c.reaberturas > 0 && (
            <div>
              <dt className="text-[11px] font-semibold uppercase text-slate-400">Reaberto</dt>
              <dd className="font-semibold text-red-700">{c.reaberturas === 1 ? "1 vez" : `${c.reaberturas} vezes`}</dd>
            </div>
          )}
        </dl>

        {mostrarTelefone && (
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`tel:${c.solicitante_telefone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Phone size={15} aria-hidden /> {c.solicitante_telefone}
            </a>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <MessageCircle size={15} aria-hidden /> WhatsApp
              </a>
            )}
          </div>
        )}

        {daAbertura.length > 0 && <Fotos titulo="Fotos do problema" fotos={daAbertura} />}
      </section>

      {/* ---- A solução ---- */}
      {c.status === "concluido" && c.solucao && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            ✅ O que foi feito{c.concluido_em ? ` · ${dataHora(c.concluido_em)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-950">{c.solucao}</p>
          {daConclusao.length > 0 && <Fotos titulo="Fotos do serviço pronto" fotos={daConclusao} />}
          {c.avaliacao && (
            <p className="mt-3 text-sm text-emerald-900">
              <span className="text-amber-500" aria-label={`${c.avaliacao} de 5`}>
                {"★".repeat(c.avaliacao)}
                <span className="text-emerald-200">{"★".repeat(5 - c.avaliacao)}</span>
              </span>{" "}
              {c.avaliacao_comentario && <span className="italic">“{c.avaliacao_comentario}”</span>}
            </p>
          )}
        </section>
      )}

      {children}

      {/* ---- Linha do tempo ---- */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">🕓 Andamento</h3>
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="relative">
              <span className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-4 ring-background ${corDoEvento(e)}`} aria-hidden />
              <p className="text-sm text-slate-800">{frasesDoEvento(e)}</p>
              {e.texto && e.tipo !== "avaliado" && (
                <p className="mt-0.5 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-100">
                  {e.texto}
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-slate-400">{dataHora(e.criado_em)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Aberto → Em atendimento → Concluído → Confirmado, com o passo atual aceso. */
function Etapas({ chamado: c }: { chamado: Chamado }) {
  if (c.status === "cancelado") {
    return <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">Este chamado foi cancelado.</p>;
  }
  const passos = [
    { rotulo: "Aberto", feito: true },
    {
      rotulo: c.status === "aguardando" ? "Aguardando" : "Em atendimento",
      feito: c.status !== "aberto",
      alerta: c.status === "aguardando",
    },
    { rotulo: "Concluído", feito: c.status === "concluido" },
    { rotulo: "Confirmado", feito: c.confirmacao === "resolvido" },
  ];
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Etapas do chamado">
      {passos.map((p, i) => (
        <li key={p.rotulo} className="min-w-0">
          <div
            className={`h-1.5 rounded-full ${p.feito ? (p.alerta ? "bg-amber-400" : "bg-primary") : "bg-slate-200"}`}
            aria-hidden
          />
          <p
            className={`mt-1 truncate text-[10px] font-semibold sm:text-[11px] ${
              p.feito ? (p.alerta ? "text-amber-700" : "text-primary-dark") : "text-slate-400"
            }`}
          >
            {i + 1}. {p.rotulo}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Fotos({ titulo, fotos }: { titulo: string; fotos: FotoChamado[] }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f, i) =>
          f.url ? (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title="Abrir a foto inteira">
              {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do bucket privado, fora do otimizador */}
              <img
                src={f.url}
                alt={`${titulo} ${i + 1}`}
                loading="lazy"
                className="aspect-square w-full rounded-xl border border-slate-200 object-cover"
              />
            </a>
          ) : null,
        )}
      </div>
    </div>
  );
}

function corDoEvento(e: Evento) {
  if (e.tipo === "reaberto") return "bg-red-500";
  if (e.tipo === "confirmado" || e.tipo === "avaliado") return "bg-emerald-500";
  if (e.tipo === "comentario") return "bg-slate-400";
  if (e.tipo === "status" && e.status_para === "concluido") return "bg-emerald-500";
  if (e.tipo === "status" && e.status_para === "aguardando") return "bg-amber-400";
  if (e.tipo === "status" && e.status_para === "cancelado") return "bg-slate-400";
  return "bg-primary";
}

function frasesDoEvento(e: Evento): React.ReactNode {
  const quem = <strong className="font-semibold">{e.autor_nome}</strong>;
  switch (e.tipo) {
    case "aberto":
      return <>Chamado aberto por {quem}</>;
    case "comentario":
      return <>{quem} comentou</>;
    case "prioridade":
      return <>{quem} mudou a prioridade</>;
    case "confirmado":
      return <>{quem} confirmou que foi resolvido 🎉</>;
    case "reaberto":
      return <>{quem} disse que não resolveu, e o chamado voltou para a fila</>;
    case "avaliado": {
      const nota = Number((e.texto ?? "").match(/\d/)?.[0] ?? 0);
      return (
        <>
          {quem} avaliou o atendimento:{" "}
          <span className="text-amber-500" aria-label={`${nota} de 5`}>
            {"★".repeat(nota)}
            <span className="text-slate-300">{"★".repeat(Math.max(0, 5 - nota))}</span>
          </span>
        </>
      );
    }
    case "status":
      if (e.status_para === "em_atendimento") return <>{quem} assumiu o chamado</>;
      if (e.status_para === "aguardando") return <>{quem} pausou: aguardando</>;
      if (e.status_para === "concluido") return <>{quem} concluiu o serviço</>;
      if (e.status_para === "cancelado") return <>{quem} cancelou o chamado</>;
      return <>{quem} mudou o status</>;
  }
}
