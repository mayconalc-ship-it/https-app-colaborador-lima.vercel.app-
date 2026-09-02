/** Motivos oferecidos quando a nota é baixa. */
export const MOTIVOS = [
  { id: "dificil", rotulo: "Difícil de usar" },
  { id: "pouco_conteudo", rotulo: "Pouco conteúdo" },
  { id: "desatualizado", rotulo: "Informações desatualizadas" },
  { id: "falta_funcao", rotulo: "Falta alguma funcionalidade" },
  { id: "problema_tecnico", rotulo: "Problema técnico" },
  { id: "outro", rotulo: "Outro" },
] as const;

const IDS_VALIDOS = new Set(MOTIVOS.map((m) => m.id as string));

export function ehMotivoValido(id: string) {
  return IDS_VALIDOS.has(id);
}

export function rotuloMotivo(id: string) {
  return MOTIVOS.find((m) => m.id === id)?.rotulo ?? id;
}

/** Abaixo de 3 estrelas o motivo é obrigatório: nota baixa sem causa não ajuda. */
export function motivoObrigatorio(nota: number) {
  return nota <= 2;
}

/**
 * Agrupamento de análise — só para o painel. O colaborador nunca vê estes
 * nomes; para ele existe apenas a nota que ele deu.
 */
export type Grupo = "promotor" | "neutro" | "detrator";

export function grupoDaNota(nota: number): Grupo {
  if (nota === 5) return "promotor";
  if (nota >= 3) return "neutro";
  return "detrator";
}

export type ConfigPesquisa = {
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
  ciclo: string;
  titulo: string;
};

/**
 * A pesquisa está no ar? Precisa estar ligada E dentro do período.
 *
 * A comparação é feita em texto "AAAA-MM-DD" de propósito: o servidor da
 * Vercel roda em UTC e converter para Date faria a virada do dia acontecer
 * às 21h daqui.
 */
export function dentroDoPeriodo(config: ConfigPesquisa, hojeIso: string) {
  if (!config.ativa) return false;
  if (config.inicio && hojeIso < config.inicio) return false;
  if (config.fim && hojeIso > config.fim) return false;
  return true;
}

/** Data de hoje em "AAAA-MM-DD", no fuso da operação. */
export function hojeIso() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bahia",
  });
}

/**
 * Os ciclos oferecidos no "Iniciar um novo ciclo".
 *
 * Era um campo de texto livre no formato AAAA-MM, e digitar um mês à mão
 * tem dois jeitos de dar errado que não avisam: trocar o ano na virada
 * (2026-01 vira 2025-01) e inverter mês e ano. Um menu suspenso não
 * aceita nenhum dos dois.
 *
 * OS MAIS PRÓXIMOS PRIMEIRO, pedido do dono -- a ordem é a distância até
 * o mês de hoje, não o calendário. Quem abre esta tela quase sempre vai
 * começar o mês que vem ou o atual; deixar 2025 no topo porque "vem
 * antes" obriga a rolar para achar o que se usa todo dia.
 *
 * Empate (um mês à frente e um atrás, mesma distância): o FUTURO vem
 * primeiro. Iniciar ciclo é olhar para frente; voltar a um mês passado é
 * a exceção.
 *
 * A lista junta três origens, sem repetir:
 *   - uma janela em volta do mês de hoje (o caso comum);
 *   - o ciclo configurado, mesmo que esteja fora da janela -- é o que o
 *     dono pediu explicitamente: o que se configura aparece aqui;
 *   - os ciclos que já têm resposta, para reabrir um antigo continuar
 *     possível sem campo livre.
 */
export const MESES_PARA_TRAS = 6;
export const MESES_PARA_FRENTE = 6;

export type CicloSugerido = {
  ciclo: string;
  rotulo: string;
  /** É o que está rodando agora? Aparece na lista, mas não dá para
   *  "iniciar" de novo -- a ação recusaria, e oferecer um caminho que
   *  termina em erro é pior do que não oferecer. */
  atual: boolean;
};

/** "2026-08" -> 24308, para poder somar e subtrair meses sem Date. */
function emMeses(ciclo: string): number | null {
  const m = ciclo.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return Number(m[1]) * 12 + (mes - 1);
}

function deMeses(n: number): string {
  const ano = Math.floor(n / 12);
  const mes = (n % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function ciclosSugeridos(
  cicloAtual: string,
  hojeIsoStr: string,
  ciclosComResposta: string[] = [],
): CicloSugerido[] {
  const hojeMes = emMeses(hojeIsoStr.slice(0, 7));
  const base = hojeMes ?? emMeses(cicloAtual) ?? 0;

  const candidatos = new Set<string>();
  for (let d = -MESES_PARA_TRAS; d <= MESES_PARA_FRENTE; d++) {
    candidatos.add(deMeses(base + d));
  }
  // Fora da janela mas relevantes: o configurado e os que têm histórico.
  for (const c of [cicloAtual, ...ciclosComResposta]) {
    if (emMeses(c) !== null) candidatos.add(c);
  }

  return [...candidatos]
    .map((ciclo) => ({
      ciclo,
      rotulo: rotuloCiclo(ciclo),
      atual: ciclo === cicloAtual,
      _dist: Math.abs((emMeses(ciclo) ?? base) - base),
      _futuro: (emMeses(ciclo) ?? base) >= base,
    }))
    .sort((a, b) => {
      if (a._dist !== b._dist) return a._dist - b._dist;
      // Mesma distância: o futuro na frente.
      if (a._futuro !== b._futuro) return a._futuro ? -1 : 1;
      return a.ciclo.localeCompare(b.ciclo);
    })
    .map(({ ciclo, rotulo, atual }) => ({ ciclo, rotulo, atual }));
}

/** "2026-08" vira "Agosto/2026", que é como o time fala. */
export function rotuloCiclo(ciclo: string) {
  const m = ciclo.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ciclo;

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return ciclo;
  return `${meses[mes - 1]}/${m[1]}`;
}
