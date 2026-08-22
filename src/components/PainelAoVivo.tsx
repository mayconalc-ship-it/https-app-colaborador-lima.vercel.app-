"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { assinarPresenca, type Presente } from "@/lib/presenca";
import { descreverEvento } from "@/lib/metricas";

type Evento = {
  id: number;
  nome: string;
  tipo: "login" | "tela" | "acao";
  alvo: string;
  criado_em: string;
};

/** Quantos eventos o feed guarda na tela antes de descartar os antigos. */
const LIMITE_FEED = 25;

function horaCurta(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Painel ao vivo: quem está com o app aberto agora e o que acabou de
 * acontecer. Tudo chega por WebSocket, sem recarregar a página.
 *
 * `iniciais` vem renderizado no servidor para o feed já nascer com os
 * últimos eventos — sem isso a tela abriria vazia e só ganharia conteúdo
 * quando alguém mexesse no app.
 */
export function PainelAoVivo({
  iniciais,
  pessoas,
}: {
  iniciais: Evento[];
  /**
   * Quem é quem na revenda, id → nome e cargo.
   *
   * O canal de presença carrega só o id (ver lib/presenca), então o nome
   * tem de vir por outro caminho. Este mapa é montado no servidor, na
   * própria tela, a partir de dados que ela já carregou -- ou seja, o nome
   * só chega a quem tem permissão de abrir esta tela.
   */
  pessoas: Record<string, { nome: string; cargo: string | null }>;
}) {
  const [online, setOnline] = useState<Presente[]>([]);
  const [eventos, setEventos] = useState<Evento[]>(iniciais);
  const [conectado, setConectado] = useState(false);
  const piscar = useRef<number | null>(null);
  const [novo, setNovo] = useState(false);

  // ---- Quem está online agora (Presence) --------------------------
  // Só ESCUTA. O canal pertence a lib/presenca, que já o assinou lá no
  // rodapé do app: pendurar um ouvinte num canal já assinado é justamente
  // o que o Supabase recusa.
  useEffect(
    () =>
      assinarPresenca(({ presentes, conectado: ligado }) => {
        setOnline(presentes);
        setConectado(ligado);
      }),
    [],
  );

  // ---- Feed de atividade (mudanças na tabela) ---------------------
  useEffect(() => {
    const supabase = createClient();

    // O Realtime respeita o RLS da tabela, e a política de leitura exige
    // admin. Passar o token garante que o servidor saiba quem está pedindo.
    // Se falhar, o feed fica parado -- mas a tela não pode cair por isso.
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) supabase.realtime.setAuth(data.session.access_token);
      })
      .catch(() => {});

    const canal = supabase
      .channel("feed-eventos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "eventos_acesso" },
        (payload) => {
          const evento = payload.new as Evento;
          setEventos((atuais) =>
            [evento, ...atuais.filter((e) => e.id !== evento.id)].slice(
              0,
              LIMITE_FEED,
            ),
          );
          setNovo(true);
          if (piscar.current) window.clearTimeout(piscar.current);
          piscar.current = window.setTimeout(() => setNovo(false), 1200);
        },
      )
      .subscribe();

    return () => {
      if (piscar.current) window.clearTimeout(piscar.current);
      void supabase.removeChannel(canal);
    };
  }, []);

  return (
    <div className="mb-4 space-y-3">
      {/* ---- Online agora ---- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {conectado && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  conectado ? "bg-green-500" : "bg-slate-300"
                }`}
              />
            </span>
            <span className="text-sm font-semibold text-slate-700">
              Online agora
            </span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-primary">
            {online.length}
          </span>
        </div>

        {online.length === 0 ? (
          <p className="text-sm text-slate-400">
            {conectado
              ? "Ninguém com o app aberto neste momento."
              : "Conectando..."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...online]
              // A ordenação mudou de lugar: antes o nome vinha pelo canal e
              // dava para ordenar lá. Agora o nome só existe aqui.
              .map((p) => ({ ...p, quem: pessoas[p.id] }))
              .sort((a, b) =>
                (a.quem?.nome ?? "").localeCompare(b.quem?.nome ?? "", "pt-BR"),
              )
              .map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 ring-1 ring-green-200"
                  title={p.quem?.cargo ?? undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {/* Id sem dono na lista é gente de fora do recorte desta
                      tela. Não deveria acontecer com o canal separado por
                      revenda, mas some do jeito certo se acontecer. */}
                  {p.quem?.nome ?? "Alguém da equipe"}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ---- Feed de atividade ---- */}
      <details
        open
        className="group rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Acontecendo agora
            <span className="ml-2 font-normal text-slate-400">
              ({eventos.length})
            </span>
          </h2>
          <span className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                novo
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {novo ? "novo evento" : "ao vivo"}
            </span>
            <span className="text-slate-400 transition-transform group-open:rotate-180">
              ▾
            </span>
          </span>
        </summary>

        <div className="border-t border-slate-100">
          {eventos.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">
              Nada registrado ainda. Assim que alguém abrir uma tela, aparece
              aqui na hora.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {eventos.map((e) => {
                const { emoji, frase } = descreverEvento(e.tipo, e.alvo);
                return (
                  <li
                    key={e.id}
                    className="flex items-baseline gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="shrink-0">{emoji}</span>
                    <span className="min-w-0 flex-1">
                      <strong className="font-semibold text-slate-800">
                        {e.nome}
                      </strong>{" "}
                      <span className="text-slate-600">{frase}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {horaCurta(e.criado_em)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
