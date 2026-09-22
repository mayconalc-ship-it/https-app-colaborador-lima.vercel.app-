/**
 * O QUADRO ÁREA × MÊS DO CRONOGRAMA EM SVG (pedido do dono, 21/09/2026:
 * "um botão para salvar em imagem do cronograma"). A tabela da tela é HTML
 * com classes do Tailwind, que não sobrevivem à conversão em PNG; este
 * desenho fica escondido na página e é ele que o botão "Baixar imagem"
 * exporta -- o mesmo conteúdo, com as mesmas cores.
 */
export type CelulaCronograma = { texto: string; fundo: string; cor: string } | null;

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COL_AREA = 190;
const COL = 54;
const LIN = 26;
const TOPO = 34;

export function CronogramaSvg({
  id,
  areas,
  celulas,
  mesAtual,
}: {
  id: string;
  areas: string[];
  /** celulas[i][m] = a célula da área i no mês m (0 a 11). */
  celulas: CelulaCronograma[][];
  mesAtual: number;
}) {
  const largura = COL_AREA + COL * 12 + 20;
  const altura = TOPO + areas.length * LIN + 46;
  const legenda = [
    { fundo: "#ECFDF5", cor: "#065F46", texto: "nota ≥ 90%" },
    { fundo: "#FFFBEB", cor: "#92400E", texto: "nota 70–90%" },
    { fundo: "#FEF2F2", cor: "#B91C1C", texto: "nota < 70%" },
    { fundo: "#F0F9FF", cor: "#075985", texto: "dia = agendada" },
    { fundo: "#FEE2E2", cor: "#B91C1C", texto: "atrasada" },
  ];
  return (
    <svg id={id} viewBox={`0 0 ${largura} ${altura}`} className="hidden" aria-hidden="true">
      <text x={8} y={22} fontSize="11" fontWeight="700" fill="#64748b">
        ÁREA
      </text>
      {MESES.map((m, i) => {
        const x = COL_AREA + i * COL;
        const atual = i + 1 === mesAtual;
        return (
          <g key={m}>
            {atual && <rect x={x + 2} y={8} width={COL - 4} height={20} rx="4" fill="#0B4DA2" />}
            <text x={x + COL / 2} y={22} textAnchor="middle" fontSize="11" fontWeight="700" fill={atual ? "#ffffff" : "#64748b"}>
              {m}
            </text>
          </g>
        );
      })}
      {areas.map((area, i) => {
        const y = TOPO + i * LIN;
        return (
          <g key={area}>
            <text x={8} y={y + 17} fontSize="11.5" fontWeight="600" fill="#0f172a">
              {area.length > 28 ? `${area.slice(0, 27)}…` : area}
            </text>
            {celulas[i].map((c, m) => {
              const x = COL_AREA + m * COL;
              return (
                <g key={m}>
                  <rect x={x + 2} y={y + 2} width={COL - 4} height={LIN - 4} rx="4" fill={c ? c.fundo : "#F8FAFC"} />
                  {c && (
                    <text x={x + COL / 2} y={y + 17} textAnchor="middle" fontSize="11" fontWeight="700" fill={c.cor}>
                      {c.texto}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {legenda.map((l, i) => {
        const x = 8 + i * 150;
        const y = TOPO + areas.length * LIN + 18;
        return (
          <g key={l.texto}>
            <rect x={x} y={y} width={16} height={14} rx="3" fill={l.fundo} stroke={l.cor} strokeWidth="0.6" />
            <text x={x + 22} y={y + 11} fontSize="11" fill="#475569">
              {l.texto}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
