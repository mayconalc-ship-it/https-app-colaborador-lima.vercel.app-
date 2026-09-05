/**
 * O GATILHO DE ANOMALIA -- quando um indicador merece um relato.
 *
 * Pedido do dono (05/09/2026): "Gatilho = Média + (desvio padrão × 2)",
 * por indicador, editável, e quando disparar abre uma pendência para a
 * liderança registrar o relato de anomalia (o 5 porquês daquele
 * indicador).
 *
 * A fórmula é a do limite de controle de Shewhart, e é a certa. Só
 * precisa de três ajustes para não virar sorteio na operação -- os três
 * estão aqui, e cada um tem um jeito conhecido de dar errado:
 *
 *   1. O LADO. `Média + 2σ` só serve para indicador em que MAIOR é pior
 *      (% de avaria, refugo, TMA). Metade dos indicadores do app é o
 *      contrário -- HL/hora, un/hora, nota do rating --, e neles o
 *      desvio ruim é `Média - 2σ`. Com um lado só, os indicadores bons
 *      nunca disparariam e os ruins disparariam sempre. O sentido vem de
 *      `SentidoDaMeta`, que o app já usa para pintar o verde e o
 *      vermelho: uma fonte só, nada novo para cadastrar.
 *
 *   2. A AMOSTRA. Com cinco pontos o desvio padrão é instável, e o
 *      gatilho vira loteria. Abaixo do mínimo o indicador não dispara --
 *      ele fica "aguardando base", que é uma resposta honesta e não um
 *      alarme chutado. Um módulo de anomalia que erra na primeira semana
 *      não ganha uma segunda.
 *
 *   3. A VARIAÇÃO ZERO. Indicador que sempre deu o mesmo número tem
 *      σ = 0, e o limite cai em cima da própria média: qualquer casa
 *      decimal de diferença viraria anomalia. Sem σ não há "fora do
 *      normal" -- há um normal ainda desconhecido.
 *
 * Só a regra aqui, sem banco e sem tela: é o que permite testá-la contra
 * números conhecidos antes de qualquer indicador real depender dela.
 */

import type { SentidoDaMeta } from "@/lib/metas";

/**
 * Quantos pontos a série precisa ter para o gatilho valer.
 *
 * Vinte é o mínimo clássico de carta de controle, e não é superstição:
 * com menos, o próprio desvio padrão tem erro grande o bastante para o
 * limite pular de lugar a cada ponto novo. Quem olha vê o gatilho
 * "mudando de ideia", e para de confiar nele.
 */
export const MINIMO_DE_PONTOS = 20;

/** O multiplicador do pedido. Editável por indicador -- ver `Gatilho`. */
export const SIGMAS_PADRAO = 2;

/**
 * Quantos pontos seguidos olhar na regra da deriva (2 de 3 além de 1σ).
 *
 * O 2σ pega o PICO. Não pega a piora lenta: uma sequência que anda três
 * semanas encostada em 1,5σ nunca cruza o limite, e é justamente o
 * desvio que já virou rotina -- o mais caro de todos, porque ninguém
 * estranha mais.
 */
export const JANELA_DERIVA = 3;
export const MINIMO_NA_JANELA = 2;
export const SIGMAS_DERIVA = 1;

export type Ponto = {
  /** O dia (ou a competência) daquele valor, em ISO curto. */
  dia: string;
  valor: number;
};

export type BaseEstatistica = {
  pontos: number;
  media: number;
  desvio: number;
  /** Falso enquanto não há amostra ou variação suficiente para julgar. */
  confiavel: boolean;
  /** Por que não dá para julgar ainda -- some quando `confiavel`. */
  motivo?: string;
};

export type Gatilho = {
  sentido: SentidoDaMeta;
  /** Quantos desvios padrão. Padrão 2, editável por indicador. */
  sigmas: number;
  /**
   * Limite escrito à mão, que MANDA na fórmula.
   *
   * Existe porque a estatística não sabe de tudo: há indicador com
   * limite de norma, de contrato ou de bom senso -- "avaria acima de 5%
   * a gente trata, e ponto". Quando está preenchido, a média e o desvio
   * continuam sendo calculados e mostrados (é o que diz se o limite
   * escolhido faz sentido), mas quem decide o disparo é ele.
   */
  limiteManual?: number | null;
};

export type Disparo = {
  /** O ponto que disparou. */
  ponto: Ponto;
  limite: number;
  /** A que distância da média, em desvios -- o "quão fora" em uma palavra. */
  sigmas: number;
  regra: "pico" | "deriva";
  /** Frase pronta para a notificação e para o painel. */
  explicacao: string;
};

export type Avaliacao = {
  base: BaseEstatistica;
  /** O limite em vigor, seja da fórmula ou escrito à mão. */
  limite: number | null;
  limiteManual: boolean;
  /** O disparo mais recente, ou nulo. */
  disparo: Disparo | null;
};

/**
 * Média e desvio padrão AMOSTRAL (divide por n-1).
 *
 * Populacional (n) subestimaria a variação: estes pontos são uma amostra
 * do processo, não o processo inteiro -- amanhã tem mais. Subestimar a
 * variação aperta o limite e produz alarme falso, que é o erro que mata
 * o módulo.
 */
export function calcularBase(valores: number[]): BaseEstatistica {
  const limpos = valores.filter((v) => Number.isFinite(v));
  const n = limpos.length;

  if (n < MINIMO_DE_PONTOS) {
    return {
      pontos: n,
      media: n > 0 ? somar(limpos) / n : 0,
      desvio: 0,
      confiavel: false,
      motivo: `Aguardando base: ${n} de ${MINIMO_DE_PONTOS} medições. Abaixo disso o desvio padrão ainda oscila demais para virar limite.`,
    };
  }

  const media = somar(limpos) / n;
  const soma = limpos.reduce((t, v) => t + (v - media) ** 2, 0);
  const desvio = Math.sqrt(soma / (n - 1));

  if (desvio === 0) {
    return {
      pontos: n,
      media,
      desvio: 0,
      confiavel: false,
      motivo:
        "Todas as medições deram o mesmo valor. Sem variação não existe 'fora do normal' -- existe um normal ainda desconhecido.",
    };
  }

  return { pontos: n, media: arredondar(media), desvio: arredondar(desvio), confiavel: true };
}

/**
 * O limite, do lado que interessa.
 *
 * `menor_melhor` (avaria, TMA, refugo): o ruim é para CIMA, limite é
 * `média + kσ`. `maior_melhor` (HL/hora, nota): o ruim é para BAIXO,
 * limite é `média − kσ`.
 */
export function limiteDoGatilho(base: BaseEstatistica, gatilho: Gatilho): number | null {
  if (gatilho.limiteManual !== null && gatilho.limiteManual !== undefined) {
    return gatilho.limiteManual;
  }
  if (!base.confiavel) return null;
  const distancia = base.desvio * gatilho.sigmas;
  return arredondar(
    gatilho.sentido === "menor_melhor" ? base.media + distancia : base.media - distancia,
  );
}

/** O ponto está do lado ruim do limite? Empate NÃO dispara -- o limite é
 *  o último valor ainda aceitável, como acontece nas metas do app. */
export function foraDoLimite(valor: number, limite: number, sentido: SentidoDaMeta): boolean {
  return sentido === "menor_melhor" ? valor > limite : valor < limite;
}

/**
 * Avalia a série inteira e devolve o disparo MAIS RECENTE.
 *
 * Os pontos vêm em ordem cronológica; o último é o de hoje. Só o mais
 * recente interessa: o painel de pendências trata o desvio de agora, e
 * uma lista com os doze disparos do trimestre seria histórico, não
 * tarefa.
 */
export function avaliarSerie(pontos: Ponto[], gatilho: Gatilho): Avaliacao {
  const base = calcularBase(pontos.map((p) => p.valor));
  const limite = limiteDoGatilho(base, gatilho);
  const limiteManual = gatilho.limiteManual !== null && gatilho.limiteManual !== undefined;

  if (limite === null || pontos.length === 0) {
    return { base, limite, limiteManual, disparo: null };
  }

  const ultimo = pontos[pontos.length - 1];

  // REGRA 1 -- O PICO. Um ponto além do limite.
  if (foraDoLimite(ultimo.valor, limite, gatilho.sentido)) {
    return {
      base,
      limite,
      limiteManual,
      disparo: {
        ponto: ultimo,
        limite,
        sigmas: distanciaEmSigmas(ultimo.valor, base),
        regra: "pico",
        explicacao: limiteManual
          ? `${formatar(ultimo.valor)} passou do limite definido (${formatar(limite)}).`
          : `${formatar(ultimo.valor)} passou do limite de ${formatar(limite)} ` +
            `(média ${formatar(base.media)} ${gatilho.sentido === "menor_melhor" ? "+" : "−"} ${gatilho.sigmas}× o desvio de ${formatar(base.desvio)}).`,
      },
    };
  }

  /*
    REGRA 2 -- A DERIVA. 2 de 3 pontos além de 1σ, do lado ruim.

    Não roda com limite manual: ali não existe "1σ" -- o dono escolheu um
    número absoluto, e inventar uma faixa intermediária em cima dele
    seria disparar por uma regra que ninguém configurou.

    E o ÚLTIMO ponto tem de estar entre os afastados. Sem isso, uma
    janela que já normalizou continuaria disparando por causa de dois
    pontos velhos -- a pendência nasceria pedindo relato de um problema
    que acabou.
  */
  if (!limiteManual && base.confiavel && pontos.length >= JANELA_DERIVA) {
    const janela = pontos.slice(-JANELA_DERIVA);
    const limiteDeriva = arredondar(
      gatilho.sentido === "menor_melhor"
        ? base.media + base.desvio * SIGMAS_DERIVA
        : base.media - base.desvio * SIGMAS_DERIVA,
    );
    const afastados = janela.filter((p) => foraDoLimite(p.valor, limiteDeriva, gatilho.sentido));
    const ultimoAfastado = foraDoLimite(ultimo.valor, limiteDeriva, gatilho.sentido);

    if (afastados.length >= MINIMO_NA_JANELA && ultimoAfastado) {
      return {
        base,
        limite,
        limiteManual,
        disparo: {
          ponto: ultimo,
          limite: limiteDeriva,
          sigmas: distanciaEmSigmas(ultimo.valor, base),
          regra: "deriva",
          explicacao:
            `${afastados.length} das últimas ${JANELA_DERIVA} medições passaram de ${formatar(limiteDeriva)} ` +
            `(média ${formatar(base.media)} ${gatilho.sentido === "menor_melhor" ? "+" : "−"} 1× o desvio). ` +
            `Não é pico: é o indicador andando para o lado errado.`,
        },
      };
    }
  }

  return { base, limite, limiteManual, disparo: null };
}

/** A que distância da média, em desvios. Zero quando não há desvio. */
export function distanciaEmSigmas(valor: number, base: BaseEstatistica): number {
  if (!base.desvio) return 0;
  return arredondar(Math.abs(valor - base.media) / base.desvio);
}

function somar(v: number[]): number {
  return v.reduce((t, x) => t + x, 0);
}

/** Duas casas: é a precisão dos indicadores do app (%, HL/h, min). */
function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatar(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
