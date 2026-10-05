import { Armchair, BrickWall, Droplets, Ellipsis, SprayCan, Sprout, Zap, type LucideIcon } from "lucide-react";
import {
  rotuloPrioridade,
  rotuloStatus,
  textoDoPrazo,
  type SituacaoDoPrazo,
  type Tipo,
} from "@/lib/chamados";

/**
 * As peças pequenas do chamado -- status, prioridade, prazo e o desenho do
 * tipo. Sem "use client": servem à tela do servidor e ao formulário.
 *
 * Cor só onde ela informa: o vermelho é o risco e o atraso, o âmbar é o
 * urgente e o "vence logo". O resto fica neutro, para o vermelho continuar
 * querendo dizer alguma coisa numa fila de quarenta chamados.
 */

export const ICONE_DO_TIPO: Record<Tipo, LucideIcon> = {
  alvenaria: BrickWall,
  eletrica: Zap,
  hidraulica: Droplets,
  jardinagem: Sprout,
  limpeza: SprayCan,
  mobiliario: Armchair,
  outros: Ellipsis,
};

export function IconeTipo({ tipo, size = 18, className }: { tipo: string; size?: number; className?: string }) {
  const Icone = ICONE_DO_TIPO[tipo as Tipo] ?? Ellipsis;
  return <Icone size={size} strokeWidth={1.9} className={className} aria-hidden />;
}

const COR_STATUS: Record<string, string> = {
  aberto: "bg-sky-100 text-sky-800",
  em_atendimento: "bg-primary-soft text-primary-dark",
  aguardando: "bg-amber-100 text-amber-800",
  concluido: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-slate-100 text-slate-500",
};

export function SeloStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_STATUS[status] ?? COR_STATUS.cancelado}`}>
      {rotuloStatus(status)}
    </span>
  );
}

export function SeloPrioridade({ prioridade }: { prioridade: string }) {
  if (prioridade === "normal") return null;
  const cor = prioridade === "risco" ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>
      {prioridade === "risco" ? "⚠️ " : ""}
      {rotuloPrioridade(prioridade)}
    </span>
  );
}

export function SeloPrazo({ situacao }: { situacao: SituacaoDoPrazo }) {
  if (situacao.tipo === "sem_prazo") return null;
  const cor =
    situacao.tipo === "atrasado" || situacao.tipo === "estourado"
      ? "text-red-700"
      : situacao.tipo === "vence_logo"
        ? "text-amber-700"
        : "text-emerald-700";
  const icone = situacao.tipo === "atrasado" ? "⏰" : situacao.tipo === "cumprido" ? "✓" : "⏱️";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cor}`}>
      <span aria-hidden>{icone}</span>
      {textoDoPrazo(situacao)}
    </span>
  );
}
