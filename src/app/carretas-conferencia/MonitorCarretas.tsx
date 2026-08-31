"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  corSinalizador,
  formatarMinutos,
  minutosDesde,
  tmaEmAndamentoMinutos,
  type CorSinalizador,
  type StatusAtendimento,
} from "@/lib/carretas";
import { formatarHora } from "@/lib/produtividade-armazem";

export type CardAtendimento = {
  id: string;
  numeroDt: string;
  motoristaNome: string;
  placaCarreta: string;
  fabricaNome: string;
  transportadoraNome: string;
  chegadaEm: string;
  cargaAgendada: boolean;
  agendamentoEm: string | null;
  status: StatusAtendimento;
};

const COR_SINALIZADOR: Record<CorSinalizador, string> = {
  verde: "bg-green-500",
  amarelo: "bg-amber-500",
  vermelho: "bg-red-500",
};

const TITULO_SINALIZADOR: Record<CorSinalizador, string> = {
  verde: "Dentro do combinado (carga agendada)",
  amarelo: "Sem agendamento",
  vermelho: "TMA estourado",
};

const COLUNAS: { status: StatusAtendimento; titulo: string; cor: string }[] = [
  { status: "aguardando_conferente", titulo: "Aguardando conferente", cor: "border-amber-300 bg-amber-50" },
  { status: "em_andamento", titulo: "Em andamento", cor: "border-blue-300 bg-blue-50" },
  { status: "aguardando_retorno", titulo: "Aguardando retorno", cor: "border-cyan-300 bg-cyan-50" },
  { status: "em_carga", titulo: "Carregando", cor: "border-purple-300 bg-purple-50" },
];

/**
 * Monitor ao vivo dos atendimentos em andamento. `iniciais` vem renderizado
 * no servidor (a tela não pode abrir vazia); dali em diante tudo chega por
 * WebSocket, mesmo desenho de PainelAoVivo.tsx.
 */
export function MonitorCarretas({
  iniciais,
  revendaId,
  tmaAlvoMinutos,
}: {
  iniciais: CardAtendimento[];
  revendaId: string;
  tmaAlvoMinutos: number;
}) {
  const [atendimentos, setAtendimentos] = useState<CardAtendimento[]>(iniciais);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const relogio = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(relogio);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
      })
      .catch(() => {});

    const canal = supabase
      .channel(`carretas-monitor-${revendaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atendimentos_carretas", filter: `revenda_id=eq.${revendaId}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setAtendimentos((atuais) => atuais.filter((a) => a.id !== id));
            return;
          }

          const linha = payload.new as {
            id: string;
            numero_dt: string;
            motorista_nome: string;
            placa_carreta: string;
            chegada_em: string;
            carga_agendada: boolean;
            agendamento_em: string | null;
            status: StatusAtendimento;
          };

          if (linha.status === "finalizado") {
            setAtendimentos((atuais) => atuais.filter((a) => a.id !== linha.id));
            return;
          }

          // Fábrica/transportadora não vêm no payload do Realtime (não
          // fazem parte da linha alterada de verdade, e o Realtime não faz
          // join) -- para uma atualização de STATUS o cartão já existe com
          // esses nomes; só a chegada nova (INSERT) não tem, e recarrega a
          // lista da rota inteira resolve sem precisar buscar à parte.
          setAtendimentos((atuais) => {
            const existe = atuais.some((a) => a.id === linha.id);
            if (existe) {
              return atuais.map((a) =>
                a.id === linha.id
                  ? {
                      ...a,
                      status: linha.status,
                      numeroDt: linha.numero_dt,
                      motoristaNome: linha.motorista_nome,
                      placaCarreta: linha.placa_carreta,
                      cargaAgendada: linha.carga_agendada,
                      agendamentoEm: linha.agendamento_em,
                    }
                  : a,
              );
            }
            return atuais;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [revendaId]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {COLUNAS.map((coluna) => {
        const desta = atendimentos.filter((a) => a.status === coluna.status);
        return (
          <div key={coluna.status} className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-slate-500">
              {coluna.titulo} <span className="font-normal text-slate-400">({desta.length})</span>
            </h2>
            {desta.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                Nada por aqui
              </p>
            ) : (
              desta.map((a) => {
                const cor = corSinalizador(a, tmaAlvoMinutos, agora);
                // O TMA correndo, que NÃO é o mesmo do relógio de pátio:
                // numa carreta agendada ele começa no horário agendado.
                const tmaAgora = tmaEmAndamentoMinutos(a, agora);
                const restam = tmaAlvoMinutos - tmaAgora;
                const estourou = restam < 0;
                return (
                  <a
                    key={a.id}
                    href={`/carretas-conferencia/${a.id}`}
                    className={`block rounded-2xl border p-3 shadow-sm hover:shadow ${coluna.cor}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">Carreta {a.placaCarreta}</p>
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full ${COR_SINALIZADOR[cor]}`}
                        title={TITULO_SINALIZADOR[cor]}
                      />
                    </div>
                    <p className="text-xs text-slate-600">{a.fabricaNome} → {a.transportadoraNome}</p>
                    <p className="text-xs text-slate-500">DT {a.numeroDt} — {a.motoristaNome}</p>
                    {a.cargaAgendada && (
                      <p className="mt-1 text-xs font-semibold text-primary">
                        ⏰ Agendada {a.agendamentoEm ? `para ${formatarHora(a.agendamentoEm)}` : ""}
                      </p>
                    )}
                    {/* Dois relógios, e eles medem coisas diferentes: o
                        de cima é o pátio (sempre da chegada), o de baixo
                        é o TMA (do horário agendado, quando havia). Numa
                        carreta agendada os dois divergem, e é exatamente
                        aí que mostrar só um confunde. */}
                    <div className="mt-2 space-y-1 border-t border-slate-200/70 pt-2">
                      <p className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                        <span>No pátio</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                          {formatarMinutos(minutosDesde(a.chegadaEm, agora))}
                        </span>
                      </p>
                      <p className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                        <span>TMA</span>
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            estourou ? "text-red-700" : "text-slate-900"
                          }`}
                        >
                          {formatarMinutos(tmaAgora)}
                        </span>
                      </p>
                      <p
                        className={`rounded-lg px-2 py-1 text-center text-[11px] font-bold ${
                          estourou
                            ? "bg-red-100 text-red-800"
                            : restam <= 30
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {estourou
                          ? `estourou há ${formatarMinutos(-restam)}`
                          : `faltam ${formatarMinutos(restam)} para estourar`}
                      </p>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
