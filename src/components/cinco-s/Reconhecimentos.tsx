"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirReconhecimento, registrarReconhecimento } from "@/app/5s/bi/actions";
import { reduzir } from "@/app/qr-contingencia/ajudantes";
import { LIMITES_RECONHECIMENTO, validarReconhecimento } from "@/lib/cinco-s-reconhecimento";
import type { DestaquesDoMes, Reconhecimento } from "@/lib/cinco-s-reconhecimento-server";

type Foto = { id: string; arquivo: File; previa: string };

const taxa = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/**
 * RECONHECIMENTO DO 5S (pedido do dono, 21/09/2026). O reconhecimento das
 * melhores áreas é feito no grupo de WhatsApp; aqui fica a EVIDÊNCIA para
 * o DPO 3.1 (V.6): o mês, as áreas, o texto e as fotos (print do grupo,
 * foto da equipe). Em cima, a sugestão do BI -- maior nota e maior
 * evolução -- para o reconhecimento sair ligado ao resultado.
 */
export function Reconhecimentos({
  competencia,
  rotuloMes,
  areas,
  destaques,
  registros,
  podeEditar,
  podeExcluir,
}: {
  competencia: string;
  rotuloMes: string;
  areas: { id: string; nome: string }[];
  destaques: DestaquesDoMes;
  registros: Reconhecimento[];
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [reduzindo, setReduzindo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const galeria = useRef<HTMLInputElement>(null);

  const fotosAtuais = useRef<Foto[]>([]);
  useEffect(() => {
    fotosAtuais.current = fotos;
  }, [fotos]);
  useEffect(() => () => fotosAtuais.current.forEach((f) => URL.revokeObjectURL(f.previa)), []);

  // A MESMA regra do servidor.
  const problema = validarReconhecimento({
    competencia,
    areas: [...marcadas],
    texto: texto.trim(),
    fotos: fotos.map((f) => ({ tamanho: f.arquivo.size, tipo: f.arquivo.type })),
  });

  function usarSugestao() {
    const ids = [...destaques.maiorNota.map((d) => d.areaId), ...(destaques.maiorEvolucao ? [destaques.maiorEvolucao.areaId] : [])];
    setMarcadas(new Set(ids));
    if (!texto) {
      const partes = [
        destaques.maiorNota.length ? `Maior nota: ${destaques.maiorNota.map((d) => d.area).join(", ")} (${taxa(destaques.maiorNota[0].conformidade)})` : "",
        destaques.maiorEvolucao
          ? `Maior evolução: ${destaques.maiorEvolucao.area} (${taxa(destaques.maiorEvolucao.de)} → ${taxa(destaques.maiorEvolucao.para)})`
          : "",
      ].filter(Boolean);
      setTexto(`Reconhecimento 5S de ${rotuloMes}. ${partes.join(" · ")}.`);
    }
    setAbrindo(true);
  }

  async function adicionar(lista: FileList | null) {
    if (!lista) return;
    setReduzindo(true);
    const novas: Foto[] = [];
    for (const a of Array.from(lista)) {
      if (fotos.length + novas.length >= LIMITES_RECONHECIMENTO.fotosMax) break;
      const r = await reduzir(a);
      novas.push({ id: `${Date.now()}-${Math.random()}`, arquivo: r, previa: URL.createObjectURL(r) });
    }
    setFotos((atual) => [...atual, ...novas]);
    setReduzindo(false);
  }

  function tirar(id: string) {
    setFotos((atual) => {
      const f = atual.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.previa);
      return atual.filter((x) => x.id !== id);
    });
  }

  function salvar() {
    if (problema) return;
    setAviso(null);
    const fd = new FormData();
    fd.set("competencia", competencia);
    fd.set("texto", texto.trim());
    marcadas.forEach((a) => fd.append("areas", a));
    fotos.forEach((f) => fd.append("fotos", f.arquivo));
    iniciar(async () => {
      const r = await registrarReconhecimento(fd);
      if (!r.ok) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      fotos.forEach((f) => URL.revokeObjectURL(f.previa));
      setFotos([]);
      setMarcadas(new Set());
      setTexto("");
      setAbrindo(false);
      setAviso({ tipo: "ok", texto: r.mensagem });
      router.refresh();
    });
  }

  function apagar(id: string) {
    if (!confirm("Apagar este reconhecimento e as fotos dele?")) return;
    iniciar(async () => {
      const r = await excluirReconhecimento(id);
      setAviso(r.ok ? { tipo: "ok", texto: r.mensagem } : { tipo: "erro", texto: r.erro });
      router.refresh();
    });
  }

  const temSugestao = destaques.maiorNota.length > 0 || destaques.maiorEvolucao;

  return (
    <div className="space-y-4">
      {/* ---- A sugestão do BI ---- */}
      {temSugestao && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-900">🏆 Destaques de {rotuloMes} pelo BI</p>
          <ul className="mt-1 space-y-0.5 text-sm text-amber-950">
            {destaques.maiorNota.length > 0 && (
              <li>
                Maior nota: <b>{destaques.maiorNota.map((d) => d.area).join(", ")}</b> ({taxa(destaques.maiorNota[0].conformidade)})
              </li>
            )}
            {destaques.maiorEvolucao && (
              <li>
                Maior evolução: <b>{destaques.maiorEvolucao.area}</b> ({taxa(destaques.maiorEvolucao.de)} →{" "}
                {taxa(destaques.maiorEvolucao.para)})
              </li>
            )}
          </ul>
          {podeEditar && (
            <button type="button" onClick={usarSugestao} className="mt-2 text-xs font-semibold text-amber-900 underline">
              Registrar o reconhecimento destas áreas
            </button>
          )}
        </div>
      )}

      {aviso && (
        <p className={`rounded-lg p-2.5 text-sm ${aviso.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {aviso.texto}
        </p>
      )}

      {/* ---- Registrar ---- */}
      {podeEditar &&
        (abrindo ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">Reconhecimento de {rotuloMes}</p>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Áreas reconhecidas *</p>
              <div className="flex flex-wrap gap-1.5">
                {areas.map((a) => {
                  const on = marcadas.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setMarcadas((atual) => {
                          const n = new Set(atual);
                          if (n.has(a.id)) n.delete(a.id);
                          else n.add(a.id);
                          return n;
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                        on ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-slate-200"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {a.nome}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                Fotos do reconhecimento * <span className="font-normal normal-case">(print do grupo, foto da equipe)</span>
              </p>
              {fotos.length > 0 && (
                <ul className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {fotos.map((f, i) => (
                    <li key={f.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- prévia local */}
                      <img src={f.previa} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg border border-slate-200 object-cover" />
                      <button
                        type="button"
                        onClick={() => tirar(f.id)}
                        aria-label={`Tirar foto ${i + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => galeria.current?.click()}
                disabled={reduzindo || fotos.length >= LIMITES_RECONHECIMENTO.fotosMax}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                {reduzindo ? "Preparando..." : "🖼️ Escolher fotos"}
              </button>
              <input
                ref={galeria}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  adicionar(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Texto (opcional)</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={LIMITES_RECONHECIMENTO.textoMax}
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            {problema && (marcadas.size > 0 || fotos.length > 0) && <p className="text-xs text-red-600">{problema}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={salvar}
                disabled={Boolean(problema) || salvando || reduzindo}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {salvando ? "Salvando..." : "Registrar reconhecimento"}
              </button>
              <button type="button" onClick={() => setAbrindo(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-600"
          >
            📸 Registrar reconhecimento de {rotuloMes} (fotos do grupo)
          </button>
        ))}

      {/* ---- Já registrados ---- */}
      {registros.length === 0 ? (
        <p className="text-center text-sm text-slate-500">Nenhum reconhecimento registrado em {rotuloMes}.</p>
      ) : (
        <ul className="space-y-3">
          {registros.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">🏆 {r.areas.join(" · ")}</p>
                  {r.texto && <p className="mt-0.5 text-sm text-slate-600">{r.texto}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Registrado por {r.criadoPorNome} em{" "}
                    {new Date(r.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                </div>
                {podeExcluir && (
                  <button type="button" onClick={() => apagar(r.id)} disabled={salvando} className="text-xs text-red-600 underline">
                    Apagar
                  </button>
                )}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {r.fotos.map((f, i) =>
                  f.url ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário */}
                      <img src={f.url} alt={`Foto ${i + 1} do reconhecimento`} className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ) : null,
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
