"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatarMinutos, minutosDesde, type StatusAtendimento } from "@/lib/carretas";

export type CardAtendimento = {
  id: string;
  numeroDt: string;
  motoristaNome: string;
  placaCarreta: string;
  fabricaNome: string;
  transportadoraNome: string;
  chegadaEm: string;
  status: StatusAtendimento;
};

const COLUNAS: { status: StatusAtendimento; titulo: string; cor: string }[] = [
  { status: "aguardando_conferente", titulo: "Aguardando conferente", cor: "border-amber-300 bg-amber-50" },
  { status: "em_descarga", titulo: "Descarregando", cor: "border-blue-300 bg-blue-50" },
  { status: "em_carga", titulo: "Carregando", cor: "border-purple-300 bg-purple-50" },
];

/**
 * Monitor ao vivo dos atendimentos em andamento. `iniciais` vem renderizado
 * no servidor (a tela não pode abrir vazia); dali em diante tudo chega por
 * WebSocket, mesmo desenho de PainelAoVivo.tsx.
 */
export function MonitorCarretas({ iniciais, revendaId }: { iniciais: CardAtendimento[]; revendaId: string }) {
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
                  ? { ...a, status: linha.status, numeroDt: linha.numero_dt, motoristaNome: linha.motorista_nome, placaCarreta: linha.placa_carreta }
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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              desta.map((a) => (
                <a
                  key={a.id}
                  href={`/carretas-conferencia/${a.id}`}
                  className={`block rounded-2xl border p-3 shadow-sm hover:shadow ${coluna.cor}`}
                >
                  <p className="text-sm font-bold text-slate-900">Carreta {a.placaCarreta}</p>
                  <p className="text-xs text-slate-600">{a.fabricaNome} → {a.transportadoraNome}</p>
                  <p className="text-xs text-slate-500">DT {a.numeroDt} — {a.motoristaNome}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    Há {formatarMinutos(minutosDesde(a.chegadaEm, agora))}
                  </p>
                </a>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
