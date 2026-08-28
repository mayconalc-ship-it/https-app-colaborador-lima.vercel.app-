/**
 * Ciclo de P20 e rateio entre operadores.
 *
 * A regra central (spec do dono, 28/08/2026):
 *
 *   Empilhadeira -> ciclo entre trocas -> horímetro -> sessões de uso
 *   -> horas por operador -> rateio proporcional -> indicadores
 *
 * NÃO existe vínculo fixo entre operador e empilhadeira: a mesma máquina
 * roda com 2, 3 ou mais pessoas dentro do mesmo botijão. O equipamento é
 * que define o ciclo; o operador entra pelas horas que usou.
 *
 * Tudo aqui sai de dados que já existiam no módulo -- `pa_empilhadeira_
 * operacoes` (a "sessão de utilização") e `pa_empilhadeira_trocas_gas`
 * (o marco de fim de ciclo). Nada é recalculado no banco: o cálculo mora
 * na leitura, como o resto do painel do armazém.
 */

/** Uma sessão de utilização já encerrada (com horímetro final). */
export type SessaoUso = {
  id: string;
  empilhadeiraId: string;
  operadorId: string;
  operadorNome: string;
  horimetroInicial: number;
  horimetroFinal: number | null;
  inicio: string;
  fim: string | null;
};

/** Uma troca de botijão -- o marco que fecha um ciclo e abre o próximo. */
export type TrocaGas = {
  id: string;
  empilhadeiraId: string;
  operadorNome: string;
  horimetro: number;
  realizadaEm: string;
};

export type FatiaOperador = {
  operadorId: string;
  operadorNome: string;
  horas: number;
  /** Fração do ciclo, de 0 a 1. */
  fracao: number;
  /** Quantos P20 equivalentes couberam a esta pessoa neste ciclo. */
  p20Equivalente: number;
};

export type StatusCiclo =
  /** Horímetros válidos e sessões cobrindo o ciclo inteiro. */
  | "completo"
  /** Sobrou tempo sem sessão registrada -- ver horasNaoIdentificadas. */
  | "parcial"
  /** Nenhuma sessão no intervalo: consumo real, mas sem a quem atribuir. */
  | "sem_sessoes"
  /** Horímetro andou para trás ou ficou igual entre as trocas. */
  | "horimetro_invalido"
  /** Salto grande demais para ser real -- quase sempre digitação sem o
   *  ponto decimal (5485,0 virando 54850). */
  | "salto_suspeito";

export type CicloP20 = {
  empilhadeiraId: string;
  empilhadeiraNumero: string;
  /** 1, 2, 3... na ordem em que os ciclos daquela máquina aconteceram. */
  numero: number;
  horimetroInicial: number;
  horimetroFinal: number;
  /** Horas do ciclo, pelo horímetro -- a fonte principal, como pede a spec. */
  horas: number;
  abertoEm: string;
  fechadoEm: string;
  trocadoPor: string;
  porOperador: FatiaOperador[];
  horasAtribuidas: number;
  /** Horas do ciclo que nenhuma sessão cobriu. Não são distribuídas a
   *  ninguém de propósito (item 7 da spec). */
  horasNaoIdentificadas: number;
  /** Fração do P20 que ficou sem dono, pelo mesmo motivo. */
  p20NaoIdentificado: number;
  status: StatusCiclo;
};

const CASAS = 100; // arredonda em 2 casas sem acumular erro de float

/**
 * Acima disto, o ciclo não entra em média nenhuma.
 *
 * Uma empilhadeira roda umas 8h por dia; um botijão dura em torno de 8 a
 * 20 horas. 200 horas seriam semanas de motor ligado sem trocar o gás --
 * na prática é sempre horímetro digitado sem o ponto (5485,0 virando
 * 54850). Aconteceu de verdade na empilhadeira 012, e um único registro
 * assim puxava a média para 16.458 h/P20.
 *
 * Deixar de fora é melhor que "corrigir" chutando: o número errado fica
 * visível na tela para alguém arrumar, em vez de sumir dentro da média.
 */
const HORAS_MAXIMAS_POR_CICLO = 200;

function arredondar(v: number, casas = 2) {
  const f = casas === 2 ? CASAS : 10 ** casas;
  return Math.round(v * f) / f;
}

/**
 * Sobreposição entre a faixa de horímetro da sessão e a do ciclo.
 *
 * É por AQUI que a conta fecha. Uma sessão pode atravessar a troca de
 * gás -- o operador começa antes e termina depois -- e dizer que ela
 * "pertence" a um ciclo jogaria horas inteiras para o lado errado.
 * Medindo a sobreposição, cada ciclo recebe exatamente a parte que
 * aconteceu dentro dele, e a soma continua batendo com o horímetro.
 */
function sobreposicao(
  sessaoInicio: number,
  sessaoFim: number,
  cicloInicio: number,
  cicloFim: number,
): number {
  return Math.max(0, Math.min(sessaoFim, cicloFim) - Math.max(sessaoInicio, cicloInicio));
}

/**
 * Monta os ciclos de uma revenda inteira.
 *
 * A PRIMEIRA troca de cada empilhadeira nunca vira ciclo: sem um ponto
 * anterior não há intervalo para medir (item 18 da spec). Ela fica sendo
 * só o marco de partida.
 */
export function montarCiclos(
  trocas: TrocaGas[],
  sessoes: SessaoUso[],
  numeroDaEmpilhadeira: Map<string, string>,
): CicloP20[] {
  const porMaquina = new Map<string, TrocaGas[]>();
  for (const t of trocas) {
    const lista = porMaquina.get(t.empilhadeiraId) ?? [];
    lista.push(t);
    porMaquina.set(t.empilhadeiraId, lista);
  }

  // Só sessões ENCERRADAS entram: sem horímetro final não há faixa para
  // sobrepor, e chutar o valor inventaria consumo (item 8 da spec).
  const encerradas = sessoes.filter(
    (s): s is SessaoUso & { horimetroFinal: number } => s.horimetroFinal !== null,
  );

  const ciclos: CicloP20[] = [];

  for (const [empilhadeiraId, lista] of porMaquina) {
    // Ordena pelo horímetro; empate desempata pela data, porque duas
    // trocas com o mesmo horímetro são o caso do botijão trocado logo
    // em seguida, sem a máquina ter rodado.
    const ordenadas = [...lista].sort(
      (a, b) => a.horimetro - b.horimetro || a.realizadaEm.localeCompare(b.realizadaEm),
    );

    const daMaquina = encerradas.filter((s) => s.empilhadeiraId === empilhadeiraId);

    for (let i = 1; i < ordenadas.length; i++) {
      const anterior = ordenadas[i - 1];
      const atual = ordenadas[i];
      const horas = arredondar(atual.horimetro - anterior.horimetro, 1);

      const base = {
        empilhadeiraId,
        empilhadeiraNumero: numeroDaEmpilhadeira.get(empilhadeiraId) ?? "—",
        numero: i,
        horimetroInicial: anterior.horimetro,
        horimetroFinal: atual.horimetro,
        horas,
        abertoEm: anterior.realizadaEm,
        fechadoEm: atual.realizadaEm,
        trocadoPor: atual.operadorNome,
      };

      // Horímetro parado, andando para trás, ou com salto impossível:
      // nos dois casos o ciclo fica de fora das médias, mas aparece na
      // lista para alguém corrigir o lançamento.
      if (horas <= 0 || horas > HORAS_MAXIMAS_POR_CICLO) {
        ciclos.push({
          ...base,
          porOperador: [],
          horasAtribuidas: 0,
          horasNaoIdentificadas: 0,
          p20NaoIdentificado: 1,
          status: horas <= 0 ? "horimetro_invalido" : "salto_suspeito",
        });
        continue;
      }

      // Soma as horas de cada operador dentro da faixa deste ciclo.
      const horasPorOperador = new Map<string, { nome: string; horas: number }>();
      for (const s of daMaquina) {
        const dentro = sobreposicao(
          s.horimetroInicial,
          s.horimetroFinal,
          base.horimetroInicial,
          base.horimetroFinal,
        );
        if (dentro <= 0) continue;
        const atualOp = horasPorOperador.get(s.operadorId) ?? { nome: s.operadorNome, horas: 0 };
        atualOp.horas += dentro;
        horasPorOperador.set(s.operadorId, atualOp);
      }

      // O rateio usa as horas do CICLO como denominador, não a soma das
      // sessões. Assim a parte sem sessão registrada fica visivelmente
      // "de ninguém" em vez de ser empurrada para quem estava por perto
      // (item 7), e operador + não identificado continua somando 1 P20
      // (item 4). As duas exigências só convivem desta forma.
      const porOperador: FatiaOperador[] = [...horasPorOperador.entries()]
        .map(([operadorId, v]) => ({
          operadorId,
          operadorNome: v.nome,
          horas: arredondar(v.horas, 1),
          fracao: arredondar(v.horas / horas, 4),
          p20Equivalente: arredondar(v.horas / horas, 3),
        }))
        .sort((a, b) => b.horas - a.horas);

      const horasAtribuidas = arredondar(
        porOperador.reduce((s, o) => s + o.horas, 0),
        1,
      );
      const horasNaoIdentificadas = arredondar(Math.max(0, horas - horasAtribuidas), 1);

      // O não identificado é o RESTO do que sobrou depois de arredondar
      // as fatias, não a sua própria divisão arredondada. Calculado à
      // parte, os arredondamentos somavam 1,001 P20 -- pouco, mas o item
      // 4 exige que a soma feche exatamente no consumo real, e um total
      // que não fecha é a primeira coisa que faz alguém duvidar do
      // número inteiro.
      const p20DosOperadores = porOperador.reduce((s, o) => s + o.p20Equivalente, 0);

      ciclos.push({
        ...base,
        porOperador,
        horasAtribuidas,
        horasNaoIdentificadas,
        p20NaoIdentificado: arredondar(Math.max(0, 1 - p20DosOperadores), 3),
        status:
          porOperador.length === 0
            ? "sem_sessoes"
            : horasNaoIdentificadas > 0.05
              ? "parcial"
              : "completo",
      });
    }
  }

  return ciclos.sort((a, b) => b.fechadoEm.localeCompare(a.fechadoEm));
}

export const ROTULO_STATUS_CICLO: Record<StatusCiclo, string> = {
  completo: "Completo",
  parcial: "Utilização não identificada",
  sem_sessoes: "Consumo não atribuível",
  horimetro_invalido: "Horímetro inconsistente",
  salto_suspeito: "Horímetro provavelmente digitado errado",
};

/** Ciclo cujo indicador de horas/P20 pode ser usado: o horímetro precisa
 *  ser válido. Falta de sessão não invalida o consumo da MÁQUINA (item
 *  19) -- só impede a análise individual. */
export function cicloContaParaMaquina(c: CicloP20) {
  return c.status !== "horimetro_invalido" && c.status !== "salto_suspeito";
}

/** Ciclo que pode entrar na análise por OPERADOR: precisa ter sessão. */
export function cicloContaParaOperador(c: CicloP20) {
  return c.status === "completo" || c.status === "parcial";
}

export type ResumoOperador = {
  operadorId: string;
  operadorNome: string;
  horas: number;
  p20Equivalente: number;
  /** Horas por P20 -- o indicador de acompanhamento do item 5. */
  horasPorP20: number | null;
  sessoes: number;
  empilhadeiras: number;
  /** Fatia do consumo total do período. */
  pctDoConsumo: number;
};

export function resumirPorOperador(ciclos: CicloP20[]): ResumoOperador[] {
  const elegiveis = ciclos.filter(cicloContaParaOperador);
  const acc = new Map<
    string,
    { nome: string; horas: number; p20: number; maquinas: Set<string>; fatias: number }
  >();

  for (const c of elegiveis) {
    for (const o of c.porOperador) {
      const a = acc.get(o.operadorId) ?? {
        nome: o.operadorNome,
        horas: 0,
        p20: 0,
        maquinas: new Set<string>(),
        fatias: 0,
      };
      a.horas += o.horas;
      a.p20 += o.p20Equivalente;
      a.maquinas.add(c.empilhadeiraId);
      a.fatias += 1;
      acc.set(o.operadorId, a);
    }
  }

  const p20Total = [...acc.values()].reduce((s, a) => s + a.p20, 0);

  return [...acc.entries()]
    .map(([operadorId, a]) => ({
      operadorId,
      operadorNome: a.nome,
      horas: arredondar(a.horas, 1),
      p20Equivalente: arredondar(a.p20, 3),
      horasPorP20: a.p20 > 0 ? arredondar(a.horas / a.p20, 1) : null,
      sessoes: a.fatias,
      empilhadeiras: a.maquinas.size,
      pctDoConsumo: p20Total > 0 ? arredondar((a.p20 / p20Total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.horas - a.horas);
}

export type ResumoMaquina = {
  empilhadeiraId: string;
  numero: string;
  ciclos: number;
  horas: number;
  p20: number;
  horasPorP20: number | null;
  operadores: number;
  horasNaoIdentificadas: number;
};

export function resumirPorMaquina(ciclos: CicloP20[]): ResumoMaquina[] {
  const acc = new Map<
    string,
    { numero: string; ciclos: number; horas: number; p20: number; ops: Set<string>; naoId: number }
  >();

  for (const c of ciclos) {
    if (!cicloContaParaMaquina(c)) continue;
    const a = acc.get(c.empilhadeiraId) ?? {
      numero: c.empilhadeiraNumero,
      ciclos: 0,
      horas: 0,
      p20: 0,
      ops: new Set<string>(),
      naoId: 0,
    };
    a.ciclos += 1;
    a.horas += c.horas;
    a.p20 += 1; // um ciclo = um botijão
    a.naoId += c.horasNaoIdentificadas;
    for (const o of c.porOperador) a.ops.add(o.operadorId);
    acc.set(c.empilhadeiraId, a);
  }

  return [...acc.entries()]
    .map(([empilhadeiraId, a]) => ({
      empilhadeiraId,
      numero: a.numero,
      ciclos: a.ciclos,
      horas: arredondar(a.horas, 1),
      p20: a.p20,
      horasPorP20: a.p20 > 0 ? arredondar(a.horas / a.p20, 1) : null,
      operadores: a.ops.size,
      horasNaoIdentificadas: arredondar(a.naoId, 1),
    }))
    .sort((a, b) => (b.horasPorP20 ?? 0) - (a.horasPorP20 ?? 0));
}

/**
 * Acima disto, o horímetro informado não pode ser real e o lançamento é
 * recusado. Mil horas são ~40 dias de motor ligado sem parar entre duas
 * leituras -- na prática é sempre o ponto decimal esquecido.
 *
 * Generoso de propósito: bloquear cedo demais faria o app recusar
 * lançamento legítimo de máquina que ficou semanas parada, e aí a pessoa
 * desiste de apontar. O aviso visual (bem mais baixo) é que educa; o
 * bloqueio só existe para o absurdo.
 */
export const SALTO_IMPOSSIVEL_HORAS = 1000;

/** A partir daqui a tela avisa, mas deixa passar -- pode ser real. */
export const SALTO_SUSPEITO_HORAS = 24;

export type AvaliacaoHorimetro =
  | { nivel: "ok"; diferenca: number }
  | { nivel: "atencao"; diferenca: number; mensagem: string }
  | { nivel: "impossivel"; diferenca: number; mensagem: string };

/**
 * Compara o horímetro digitado com a última leitura conhecida da
 * máquina. Serve para a tela avisar enquanto a pessoa digita E para a
 * ação no servidor recusar o impossível -- a mesma régua nos dois
 * lugares, para a tela nunca prometer algo que o servidor recusa.
 */
export function avaliarHorimetro(
  informado: number,
  ultimoConhecido: number | null,
): AvaliacaoHorimetro {
  if (ultimoConhecido === null) return { nivel: "ok", diferenca: 0 };
  const diferenca = arredondar(informado - ultimoConhecido, 1);

  if (diferenca < 0) {
    return {
      nivel: "atencao",
      diferenca,
      mensagem: `Menor que a última leitura (${formatarNumeroBr(ultimoConhecido)} h). O horímetro não anda para trás -- confira antes de enviar.`,
    };
  }
  if (diferenca > SALTO_IMPOSSIVEL_HORAS) {
    return {
      nivel: "impossivel",
      diferenca,
      mensagem: `Isso daria ${formatarNumeroBr(diferenca)} horas desde a última leitura (${formatarNumeroBr(ultimoConhecido)} h). Confira o ponto decimal -- 5485,0 digitado como 54850 dá exatamente esse tipo de salto.`,
    };
  }
  if (diferenca > SALTO_SUSPEITO_HORAS) {
    return {
      nivel: "atencao",
      diferenca,
      mensagem: `São ${formatarNumeroBr(diferenca)} horas desde a última leitura (${formatarNumeroBr(ultimoConhecido)} h). Confira se está certo.`,
    };
  }
  return { nivel: "ok", diferenca };
}

export const ORDENS_RANKING = ["eficiencia", "pior", "consumo", "horas"] as const;
export type OrdemRanking = (typeof ORDENS_RANKING)[number];

export const ROTULO_ORDEM_RANKING: Record<OrdemRanking, string> = {
  eficiencia: "Maior eficiência (h/P20)",
  pior: "Menor eficiência (h/P20)",
  consumo: "Maior consumo (P20)",
  horas: "Mais horas",
};

export function ehOrdemRanking(v: unknown): v is OrdemRanking {
  return typeof v === "string" && (ORDENS_RANKING as readonly string[]).includes(v);
}

export function ordenarOperadores(lista: ResumoOperador[], ordem: OrdemRanking): ResumoOperador[] {
  const copia = [...lista];
  switch (ordem) {
    case "eficiencia":
      // Sem h/P20 (nenhum ciclo elegível) vai para o fim nas duas
      // ordenações -- não é "o melhor" nem "o pior", é sem dado.
      return copia.sort((a, b) => (b.horasPorP20 ?? -1) - (a.horasPorP20 ?? -1));
    case "pior":
      return copia.sort(
        (a, b) => (a.horasPorP20 ?? Number.MAX_SAFE_INTEGER) - (b.horasPorP20 ?? Number.MAX_SAFE_INTEGER),
      );
    case "consumo":
      return copia.sort((a, b) => b.p20Equivalente - a.p20Equivalente);
    case "horas":
      return copia.sort((a, b) => b.horas - a.horas);
  }
}

export const GRANULARIDADES = ["dia", "semana", "mes"] as const;
export type Granularidade = (typeof GRANULARIDADES)[number];

export const ROTULO_GRANULARIDADE: Record<Granularidade, string> = {
  dia: "Por dia",
  semana: "Por semana",
  mes: "Por mês",
};

export function ehGranularidade(v: unknown): v is Granularidade {
  return typeof v === "string" && (GRANULARIDADES as readonly string[]).includes(v);
}

export type PontoEvolucao = {
  chave: string;
  rotulo: string;
  ciclos: number;
  horas: number;
  p20: number;
  horasPorP20: number;
};

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Evolução da média de horas/P20 ao longo do tempo.
 *
 * O ciclo entra no período em que FECHOU -- é quando o botijão acabou e o
 * consumo virou fato. Usar a abertura jogaria o consumo para trás e
 * mexeria em números de semanas já fechadas toda vez que um ciclo longo
 * terminasse.
 *
 * A data sai no fuso da operação: com a data crua, tudo que acontece
 * depois das 21h cairia no dia seguinte (a Vercel roda em UTC).
 */
export function evolucaoDosCiclos(ciclos: CicloP20[], granularidade: Granularidade): PontoEvolucao[] {
  const acc = new Map<string, { rotulo: string; ciclos: number; horas: number }>();

  for (const c of ciclos) {
    if (!cicloContaParaMaquina(c)) continue;
    const dia = DIA_SP.format(new Date(c.fechadoEm)); // AAAA-MM-DD
    const [ano, mes, d] = dia.split("-");

    let chave = dia;
    let rotulo = `${d}/${mes}`;
    if (granularidade === "mes") {
      chave = `${ano}-${mes}`;
      rotulo = `${mes}/${ano}`;
    } else if (granularidade === "semana") {
      // Segunda-feira da semana daquele dia.
      const data = new Date(`${dia}T12:00:00Z`);
      const diaDaSemana = (data.getUTCDay() + 6) % 7; // 0 = segunda
      data.setUTCDate(data.getUTCDate() - diaDaSemana);
      chave = data.toISOString().slice(0, 10);
      const [, m2, d2] = chave.split("-");
      rotulo = `Semana de ${d2}/${m2}`;
    }

    const a = acc.get(chave) ?? { rotulo, ciclos: 0, horas: 0 };
    a.ciclos += 1;
    a.horas += c.horas;
    acc.set(chave, a);
  }

  return [...acc.entries()]
    .map(([chave, a]) => ({
      chave,
      rotulo: a.rotulo,
      ciclos: a.ciclos,
      horas: arredondar(a.horas, 1),
      p20: a.ciclos,
      horasPorP20: arredondar(a.horas / a.ciclos, 1),
    }))
    .sort((x, y) => x.chave.localeCompare(y.chave));
}

/** Consumo de uma máquina quebrado por operador -- alimenta o item 11. */
export function operadoresDaMaquina(ciclos: CicloP20[], empilhadeiraId: string) {
  const acc = new Map<string, { nome: string; horas: number; p20: number }>();
  for (const c of ciclos) {
    if (c.empilhadeiraId !== empilhadeiraId || !cicloContaParaOperador(c)) continue;
    for (const o of c.porOperador) {
      const a = acc.get(o.operadorId) ?? { nome: o.operadorNome, horas: 0, p20: 0 };
      a.horas += o.horas;
      a.p20 += o.p20Equivalente;
      acc.set(o.operadorId, a);
    }
  }
  return [...acc.entries()]
    .map(([operadorId, a]) => ({
      operadorId,
      operadorNome: a.nome,
      horas: arredondar(a.horas, 1),
      p20Equivalente: arredondar(a.p20, 3),
    }))
    .sort((a, b) => b.horas - a.horas);
}

/** "8,0 h/P20" -- com vírgula, que é como o time lê. */
export function formatarNumeroBr(v: number, casas = 1) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
