import { faixaDaTaxa, formatarTaxa } from "@/lib/cinco-s";
import type { LigacaoCruzada } from "@/lib/cinco-s-server";
import { ExportarMapa } from "./ExportarMapa";

const COR = { boa: "#059669", atencao: "#d97706", critica: "#dc2626", vazia: "#94a3b8" } as const;
const PROPRIA = "#dc2626";

function corta(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * O MAPA DA AUDITORIA CRUZADA (pedido do dono, 21/09/2026: "quem é o
 * auditor e quem é o auditado, ligando um ao outro").
 *
 * À esquerda quem auditou; à direita a área e o dono dela (o auditado);
 * uma linha por auditoria, na cor da conformidade. Embaixo do auditor, se
 * ele também é dono de área no mês, "auditado em: ..." -- é o que mostra o
 * cruzamento. Auditar a própria área sai em vermelho tracejado.
 *
 * SVG montado no servidor, sem biblioteca. No celular o desenho ficaria
 * miúdo: lá vira a mesma informação em lista.
 */
export function MapaCruzado({
  ligacoes,
  tituloImagem = "Auditoria cruzada 5S",
  arquivoImagem = "auditoria-cruzada-5s.png",
}: {
  ligacoes: LigacaoCruzada[];
  /** Vai no alto da imagem exportada. */
  tituloImagem?: string;
  arquivoImagem?: string;
}) {
  if (ligacoes.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">Nenhuma auditoria neste recorte.</p>;
  }

  // ---- Os números do cruzamento ----
  const auditores = [...new Set(ligacoes.map((l) => l.auditorId))];
  const donos = new Set(ligacoes.map((l) => l.donoId).filter(Boolean) as string[]);
  const propria = ligacoes.filter((l) => l.donoId && l.donoId === l.auditorId);
  const tambemAuditados = auditores.filter((a) => donos.has(a));
  const umSo = auditores.length === 1 && ligacoes.length > 1;
  // Onde cada auditor é auditado (a área de que ele é dono no mês).
  const areasDoDono = new Map<string, string[]>();
  for (const l of ligacoes) {
    if (l.donoId) areasDoDono.set(l.donoId, [...(areasDoDono.get(l.donoId) ?? []), l.area]);
  }

  // ---- Posições: áreas em ordem alfabética à direita; auditores pela
  // média da posição das áreas que auditaram (menos linhas cruzando). ----
  const direita = [...ligacoes].sort((a, b) => a.area.localeCompare(b.area, "pt-BR"));
  const LINHA = 44;
  const TOPO = 26;
  const yDireita = new Map(direita.map((l, i) => [l.auditoriaId, TOPO + i * LINHA]));
  const esquerda = auditores
    .map((id) => {
      const minhas = direita.filter((l) => l.auditorId === id);
      const media = minhas.reduce((s, l) => s + (yDireita.get(l.auditoriaId) ?? 0), 0) / minhas.length;
      return { id, nome: minhas[0].auditor, media };
    })
    .sort((a, b) => a.media - b.media);
  const linhas = Math.max(direita.length, esquerda.length);
  const altura = TOPO + (linhas - 1) * LINHA + 30;
  const passoEsq = esquerda.length > 1 ? ((linhas - 1) * LINHA) / (esquerda.length - 1) : 0;
  const yEsquerda = new Map(
    esquerda.map((a, i) => [a.id, esquerda.length === 1 ? TOPO + ((linhas - 1) * LINHA) / 2 : TOPO + i * passoEsq]),
  );

  const L = 262; // ponto do auditor
  const R = 452; // ponto da área

  return (
    <div>
      {/* ---- Leitura rápida ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        <span className="order-last ml-auto">
          <ExportarMapa alvoId="mapa-cruzado-svg" titulo={tituloImagem} arquivo={arquivoImagem} />
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
          {auditores.length} auditor{auditores.length === 1 ? "" : "es"} · {direita.length} área{direita.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-primary-dark">
          🔁 {tambemAuditados.length} auditor{tambemAuditados.length === 1 ? "" : "es"} também auditado
          {tambemAuditados.length === 1 ? "" : "s"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 ${propria.length ? "bg-red-100 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {propria.length ? `⚠️ ${propria.length} auditou a própria área` : "✓ ninguém auditou a própria área"}
        </span>
      </div>
      {umSo && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ Uma pessoa só lançou as {ligacoes.length} auditorias deste mês — não houve auditoria cruzada de fato.
        </p>
      )}

      {/* ---- O mapa (tela média para cima) ---- */}
      <div className="hidden overflow-x-auto sm:block">
        <svg
          id="mapa-cruzado-svg"
          viewBox={`0 0 720 ${altura}`}
          className="w-full min-w-[640px]"
          role="img"
          aria-label="Mapa da auditoria cruzada: auditores ligados às áreas e donos que auditaram"
        >
          <text x={L - 12} y={12} textAnchor="end" fontSize="10" fontWeight="700" fill="#64748b" letterSpacing="1">
            AUDITOR
          </text>
          <text x={R + 12} y={12} fontSize="10" fontWeight="700" fill="#64748b" letterSpacing="1">
            ÁREA · DONO (AUDITADO)
          </text>

          {direita.map((l) => {
            const y1 = yEsquerda.get(l.auditorId) ?? 0;
            const y2 = yDireita.get(l.auditoriaId) ?? 0;
            const ehPropria = Boolean(l.donoId && l.donoId === l.auditorId);
            const feita = l.status === "finalizada";
            const cor = ehPropria ? PROPRIA : feita ? COR[faixaDaTaxa(l.conformidade)] : COR.vazia;
            const meio = (L + R) / 2;
            return (
              <path
                key={l.auditoriaId}
                d={`M ${L} ${y1} C ${meio} ${y1}, ${meio} ${y2}, ${R} ${y2}`}
                fill="none"
                stroke={cor}
                strokeWidth={ehPropria ? 3 : 2}
                strokeDasharray={ehPropria || !feita ? "6 4" : undefined}
                opacity={0.85}
              >
                <title>
                  {`${l.auditor} auditou ${l.area}${l.dono ? ` (dono: ${l.dono})` : ""} — ${
                    feita ? formatarTaxa(l.conformidade) : "pendente"
                  }${ehPropria ? " · PRÓPRIA ÁREA" : ""}`}
                </title>
              </path>
            );
          })}

          {esquerda.map((a) => {
            const y = yEsquerda.get(a.id) ?? 0;
            const auditadoEm = areasDoDono.get(a.id);
            return (
              <g key={a.id}>
                <circle cx={L} cy={y} r={5} fill="#0b4ea2" />
                <text x={L - 12} y={y + 1} textAnchor="end" fontSize="13" fontWeight="600" fill="#0f172a">
                  {corta(a.nome, 30)}
                </text>
                <text x={L - 12} y={y + 15} textAnchor="end" fontSize="10.5" fill={auditadoEm ? "#0b4ea2" : "#94a3b8"}>
                  {auditadoEm ? `🔁 auditado em: ${corta(auditadoEm.join(", "), 30)}` : "não é dono de área"}
                </text>
              </g>
            );
          })}

          {direita.map((l) => {
            const y = yDireita.get(l.auditoriaId) ?? 0;
            const feita = l.status === "finalizada";
            const cor = feita ? COR[faixaDaTaxa(l.conformidade)] : COR.vazia;
            return (
              <g key={l.auditoriaId}>
                <circle cx={R} cy={y} r={5} fill={cor} />
                <text x={R + 12} y={y + 1} fontSize="13" fontWeight="600" fill="#0f172a">
                  {corta(l.area, 26)}
                  <tspan fontWeight="700" fill={cor}>
                    {`  ${feita ? formatarTaxa(l.conformidade) : "pendente"}`}
                  </tspan>
                </text>
                <text x={R + 12} y={y + 15} fontSize="10.5" fill="#64748b">
                  {l.dono ? `dono: ${corta(l.dono, 32)}` : "sem dono definido"}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="mt-1 text-xs text-slate-400">
          Cor da linha = conformidade (verde ≥ 90%, laranja 70–90%, vermelho &lt; 70%); tracejado cinza = pendente.
          Passe o mouse numa linha para ver o detalhe.
        </p>
      </div>

      {/* ---- No celular: a mesma informação em lista ---- */}
      <ul className="divide-y divide-slate-100 sm:hidden">
        {esquerda.map((a) => {
          const auditadoEm = areasDoDono.get(a.id);
          return (
            <li key={a.id} className="py-2.5">
              <p className="text-sm font-semibold text-slate-900">{a.nome}</p>
              {auditadoEm && <p className="text-[11px] text-primary-dark">🔁 auditado em: {auditadoEm.join(", ")}</p>}
              <ul className="mt-1 space-y-1">
                {direita
                  .filter((l) => l.auditorId === a.id)
                  .map((l) => {
                    const feita = l.status === "finalizada";
                    const ehPropria = Boolean(l.donoId && l.donoId === l.auditorId);
                    return (
                      <li key={l.auditoriaId} className="flex items-start gap-2 text-xs">
                        <span className="pt-0.5 text-slate-400">→</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800">{l.area}</span>
                          <span className="block text-[11px] text-slate-500">
                            {l.dono ? `dono: ${l.dono}` : "sem dono definido"}
                            {ehPropria && <span className="font-semibold text-red-700"> · própria área</span>}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums" style={{ color: feita ? COR[faixaDaTaxa(l.conformidade)] : COR.vazia }}>
                          {feita ? formatarTaxa(l.conformidade) : "pendente"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
