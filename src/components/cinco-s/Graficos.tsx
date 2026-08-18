import Link from "next/link";
import {
  COR_FAIXA,
  COR_TEXTO_FAIXA,
  EMOJI_SENSO,
  JAPONES_SENSO,
  ROTULO_SENSO,
  SENSOS,
  faixaDaTaxa,
  formatarTaxa,
  rotuloCompetencia,
  type Senso,
} from "@/lib/cinco-s";

/**
 * Os gráficos do BI 5S.
 *
 * Tudo aqui é componente de servidor e desenho estático -- SVG e div
 * com largura em porcentagem. Nenhuma biblioteca de gráfico entrou no
 * projeto, e a decisão é deliberada: o app não tem nenhuma hoje (o
 * painel de Uso do App desenha as barras com div), e a mais enxuta
 * custaria uns 50 kB de JavaScript no celular do auditor para desenhar
 * cinco formas que o SVG faz de graça. O requisito era abrir rápido; a
 * forma mais rápida de um gráfico é não baixar código para desenhá-lo.
 *
 * Consequência boa de lambuja: como não há JavaScript, o gráfico chega
 * pronto no primeiro paint, sem estado de carregamento próprio.
 */

/* ------------------------------------------------------------------ */
/* Cartão de indicador                                                 */
/* ------------------------------------------------------------------ */

export function Cartao({
  valor,
  rotulo,
  tom = "neutro",
  href,
}: {
  valor: string;
  rotulo: string;
  tom?: "neutro" | "bom" | "alerta" | "ruim";
  href?: string;
}) {
  const cor = {
    neutro: "text-primary",
    bom: "text-green-600",
    alerta: "text-amber-600",
    ruim: "text-red-600",
  }[tom];

  const conteudo = (
    <>
      <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="mt-0.5 text-xs leading-tight text-slate-500">{rotulo}</p>
    </>
  );

  const classe =
    "rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm";

  // O cartão que leva a algum lugar ganha realce ao toque; o que é só
  // número não finge ser clicável.
  if (href) {
    return (
      <Link href={href} className={`${classe} block active:bg-slate-50`}>
        {conteudo}
      </Link>
    );
  }
  return <div className={classe}>{conteudo}</div>;
}

/* ------------------------------------------------------------------ */
/* Radar dos cinco sensos                                              */
/* ------------------------------------------------------------------ */

/**
 * Pentágono regular com o vértice apontando para cima.
 *
 * O ângulo começa em -90° para o primeiro senso (Utilização) ficar no
 * topo -- lido primeiro, como na lista do checklist.
 */
function ponto(indice: number, raio: number, centro: number) {
  const angulo = (Math.PI * 2 * indice) / 5 - Math.PI / 2;
  return {
    x: centro + raio * Math.cos(angulo),
    y: centro + raio * Math.sin(angulo),
  };
}

export function RadarSensos({
  dados,
}: {
  dados: { senso: Senso; conformidade: number | null; nok: number }[];
}) {
  const TAM = 240;
  const C = TAM / 2;
  const R = 82;

  const mapa = new Map(dados.map((d) => [d.senso, d]));
  const valores = SENSOS.map((s) => mapa.get(s)?.conformidade ?? 0);
  const temDado = dados.some((d) => d.conformidade !== null);

  const poligono = SENSOS.map((_, i) => {
    const p = ponto(i, (R * valores[i]) / 100, C);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");

  // Três anéis de referência: 100, 70 e 50. Não são decoração -- 70 é a
  // linha abaixo da qual o item vira plano de ação, e ver o polígono
  // cruzar esse anel é a leitura que a liderança faz em um segundo.
  const aneis = [100, 70, 50];

  if (!temDado) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Nenhuma auditoria finalizada neste recorte.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
      <svg
        viewBox={`0 0 ${TAM} ${TAM}`}
        className="h-56 w-56 shrink-0"
        role="img"
        aria-label={`Conformidade por senso: ${SENSOS.map(
          (s, i) => `${ROTULO_SENSO[s]} ${formatarTaxa(valores[i])}`,
        ).join(", ")}`}
      >
        {aneis.map((pct) => (
          <polygon
            key={pct}
            points={SENSOS.map((_, i) => {
              const p = ponto(i, (R * pct) / 100, C);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            }).join(" ")}
            fill="none"
            stroke={pct === 70 ? "#fbbf24" : "#e2e8f0"}
            strokeWidth={pct === 70 ? 1.5 : 1}
            strokeDasharray={pct === 70 ? "3 3" : undefined}
          />
        ))}

        {SENSOS.map((_, i) => {
          const p = ponto(i, R, C);
          return (
            <line
              key={i}
              x1={C}
              y1={C}
              x2={p.x}
              y2={p.y}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={poligono}
          fill="var(--primary)"
          fillOpacity={0.18}
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {SENSOS.map((s, i) => {
          const p = ponto(i, (R * valores[i]) / 100, C);
          return (
            <circle
              key={s}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="var(--primary)"
              stroke="white"
              strokeWidth={1.5}
            />
          );
        })}

        {SENSOS.map((s, i) => {
          const p = ponto(i, R + 22, C);
          return (
            <text
              key={s}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500"
              fontSize={10}
              fontWeight={600}
            >
              {JAPONES_SENSO[s]}
            </text>
          );
        })}
      </svg>

      {/* A legenda não é enfeite: o radar mostra a FORMA, e o número
          exato é o que entra na conversa com o dono da área. */}
      <ul className="w-full max-w-xs space-y-1.5">
        {SENSOS.map((s) => {
          const d = mapa.get(s);
          const faixa = faixaDaTaxa(d?.conformidade);
          return (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-center" aria-hidden="true">
                {EMOJI_SENSO[s]}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-600">
                {ROTULO_SENSO[s]}
              </span>
              {d && d.nok > 0 && (
                <span className="shrink-0 text-xs tabular-nums text-slate-400">
                  {d.nok} NOK
                </span>
              )}
              <span
                className={`w-16 shrink-0 text-right font-semibold tabular-nums ${COR_TEXTO_FAIXA[faixa]}`}
              >
                {formatarTaxa(d?.conformidade)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conformidade por área                                               */
/* ------------------------------------------------------------------ */

/**
 * Barras horizontais, ordenadas do pior para o melhor.
 *
 * A ordem é a mensagem: quem abre o BI quer saber onde está o problema,
 * e a primeira linha responde isso sem precisar ler o resto. Área sem
 * auditoria no período cai para o fim, com aviso próprio -- some do topo
 * mas não some da tela, porque "ninguém auditou" também é um problema.
 */
export function BarrasPorArea({
  dados,
  hrefDaArea,
  areaSelecionada,
}: {
  dados: {
    area_id: string;
    area: string;
    conformidade: number | null;
    auditorias: number;
    nok: number;
    nc_abertas: number;
  }[];
  hrefDaArea: (areaId: string | null) => string;
  areaSelecionada?: string | null;
}) {
  if (dados.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Nenhuma área cadastrada ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {dados.map((d) => {
        const faixa = faixaDaTaxa(d.conformidade);
        const selecionada = areaSelecionada === d.area_id;
        return (
          <li key={d.area_id}>
            <Link
              // Clicar de novo na área já escolhida limpa o filtro. Sem
              // isso a pessoa fica presa dentro de uma área e precisa
              // caçar o botão de limpar.
              href={hrefDaArea(selecionada ? null : d.area_id)}
              className={`block rounded-xl px-2 py-1.5 -mx-2 active:bg-slate-50 ${
                selecionada ? "bg-primary-soft" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                  {d.area}
                </span>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${COR_TEXTO_FAIXA[faixa]}`}
                >
                  {formatarTaxa(d.conformidade)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${COR_FAIXA[faixa]}`}
                  style={{ width: `${d.conformidade ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {d.auditorias === 0
                  ? "Sem auditoria no período"
                  : `${d.auditorias} auditoria${d.auditorias === 1 ? "" : "s"} · ${d.nok} NOK`}
                {d.nc_abertas > 0 && (
                  <span className="ml-1 font-medium text-red-600">
                    · {d.nc_abertas} ação{d.nc_abertas === 1 ? "" : "ões"} em aberto
                  </span>
                )}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Evolução mensal                                                     */
/* ------------------------------------------------------------------ */

/**
 * Linha de conformidade mês a mês.
 *
 * A escala do eixo Y não começa em zero de propósito. A base histórica
 * gira em torno de 82%, e um eixo de 0 a 100 espremeria toda a variação
 * real -- que é o que o gráfico existe para mostrar -- numa faixa de
 * dois centímetros. O piso acompanha o pior mês, com folga, e o rótulo
 * do eixo diz onde ele está para ninguém ler uma melhora maior do que
 * a que houve.
 */
export function LinhaEvolucao({
  dados,
}: {
  dados: { competencia: string; conformidade: number | null; auditorias: number }[];
}) {
  const pontos = dados.filter((d) => d.conformidade !== null);

  if (pontos.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        {pontos.length === 0
          ? "Ainda não há auditorias finalizadas."
          : "Um mês só de histórico — a evolução aparece a partir do segundo."}
      </p>
    );
  }

  const L = 320;
  const A = 130;
  const PAD = { top: 12, right: 8, bottom: 22, left: 30 };

  const valores = pontos.map((p) => p.conformidade!);
  const min = Math.max(0, Math.floor((Math.min(...valores) - 5) / 10) * 10);
  const max = Math.min(100, Math.ceil((Math.max(...valores) + 5) / 10) * 10);
  const faixa = Math.max(1, max - min);

  const x = (i: number) =>
    PAD.left +
    (i * (L - PAD.left - PAD.right)) / Math.max(1, pontos.length - 1);
  const y = (v: number) =>
    PAD.top + ((max - v) * (A - PAD.top - PAD.bottom)) / faixa;

  const caminho = pontos
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.conformidade!).toFixed(1)}`)
    .join(" ");

  const area =
    `M${x(0).toFixed(1)},${(A - PAD.bottom).toFixed(1)} ` +
    pontos
      .map((p, i) => `L${x(i).toFixed(1)},${y(p.conformidade!).toFixed(1)}`)
      .join(" ") +
    ` L${x(pontos.length - 1).toFixed(1)},${(A - PAD.bottom).toFixed(1)} Z`;

  const primeiro = valores[0];
  const ultimo = valores[valores.length - 1];
  const delta = Math.round((ultimo - primeiro) * 10) / 10;

  return (
    <div>
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="w-full"
        role="img"
        aria-label={`Evolução da conformidade: de ${formatarTaxa(primeiro)} em ${rotuloCompetencia(
          pontos[0].competencia,
        )} para ${formatarTaxa(ultimo)} em ${rotuloCompetencia(
          pontos[pontos.length - 1].competencia,
        )}`}
      >
        {[max, Math.round((max + min) / 2), min].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              y1={y(v)}
              x2={L - PAD.right}
              y2={y(v)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 5}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={8}
              className="fill-slate-400"
            >
              {v}
            </text>
          </g>
        ))}

        <path d={area} fill="var(--primary)" fillOpacity={0.1} />
        <path
          d={caminho}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pontos.map((p, i) => (
          <circle
            key={p.competencia}
            cx={x(i)}
            cy={y(p.conformidade!)}
            r={3}
            fill="white"
            stroke="var(--primary)"
            strokeWidth={2}
          />
        ))}

        {/* Só o primeiro e o último rótulo: com doze meses, escrever
            todos vira uma faixa ilegível no celular. */}
        {[0, pontos.length - 1].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={A - 6}
            textAnchor={i === 0 ? "start" : "end"}
            fontSize={8}
            className="fill-slate-400"
          >
            {pontos[i].competencia.split("-").reverse().join("/")}
          </text>
        ))}
      </svg>

      <p className="mt-1 text-center text-xs text-slate-500">
        {delta === 0 ? (
          "Estável no período"
        ) : (
          <>
            <span
              className={delta > 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1).replace(".", ",")} p.p.
            </span>{" "}
            desde {rotuloCompetencia(pontos[0].competencia)}
          </>
        )}
        {" · eixo de "}
        {min}% a {max}%
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranking de perguntas críticas                                       */
/* ------------------------------------------------------------------ */

export function RankingPerguntas({
  dados,
  hrefDaPergunta,
}: {
  dados: {
    pergunta_id: string;
    codigo: string;
    senso: Senso;
    texto: string;
    nok: number;
    taxa_nok: number | null;
  }[];
  hrefDaPergunta: (perguntaId: string) => string;
}) {
  if (dados.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        Nenhuma não conformidade neste recorte. 🎉
      </p>
    );
  }

  const pior = dados[0].taxa_nok ?? 1;

  return (
    <ol className="space-y-2.5">
      {dados.map((d, i) => (
        <li key={d.pergunta_id}>
          <Link
            href={hrefDaPergunta(d.pergunta_id)}
            className="-mx-2 block rounded-xl px-2 py-1.5 active:bg-slate-50"
          >
            <div className="flex items-baseline gap-2">
              <span className="w-4 shrink-0 text-xs font-bold tabular-nums text-slate-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{d.codigo}</span>{" "}
                {d.texto.length > 90 ? `${d.texto.slice(0, 90)}…` : d.texto}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-red-600">
                {d.taxa_nok?.toFixed(0) ?? 0}%
              </span>
            </div>
            <div className="ml-6 mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-red-500"
                  style={{ width: `${((d.taxa_nok ?? 0) / pior) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">
                {d.nok} NOK · {ROTULO_SENSO[d.senso]}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Bloco recolhível -- o mesmo padrão do painel de Uso do App          */
/* ------------------------------------------------------------------ */

export function Bloco({
  titulo,
  contagem,
  children,
  aberto = true,
  acao,
}: {
  titulo: string;
  contagem?: number;
  children: React.ReactNode;
  aberto?: boolean;
  acao?: React.ReactNode;
}) {
  return (
    <details
      open={aberto}
      className="group mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {titulo}
          {contagem !== undefined && (
            <span className="ml-2 font-normal text-slate-400">({contagem})</span>
          )}
        </h2>
        <span className="flex items-center gap-2">
          {acao}
          <span className="text-slate-400 transition-transform group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}
