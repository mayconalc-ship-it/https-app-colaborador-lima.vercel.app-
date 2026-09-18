import type { ModuloId } from "./acessos";

/**
 * LIMPEZA DE ACESSOS -- as regras puras (16/09/2026).
 *
 * Pedido do dono: um relatório de quem tem módulo liberado e não usa há
 * 30 dias, e de quem não entra mais no app. Em 16/09/2026 eram 2.172
 * liberações individuais nas duas revendas; ninguém confere isso à mão.
 *
 * Sem banco aqui, para as regras caberem num teste.
 */

/** Liberado há mais que isso e sem abrir a tela nesse tempo: "sem uso". */
export const DIAS_SEM_USO = 30;

/** Sem abrir o app há mais que isso: candidato a conferir com o RH. */
export const DIAS_SEM_ENTRAR = 60;

/**
 * As telas de cada módulo opcional, pelo começo do endereço.
 *
 * FICAM DE FORA os módulos de LEITURA para o time todo -- Jornal, Ranking,
 * Padrões, Sonho e Desafio. Não abrir o Jornal num mês não é motivo para
 * tirar o Jornal de ninguém, e listá-los enterraria no meio de centenas de
 * linhas o que interessa: a empilhadeira liberada para quem saiu do
 * armazém.
 *
 * Dois módulos não têm tela própria e respondem pela tela onde moram: a
 * Descarga é um passo da Conferência de Carretas, e o Controle de FEFO é
 * uma aba do FEFO. Quem abriu a tela usou o módulo, ou pelo menos passou
 * por ele.
 */
export const TELAS_DO_MODULO: Partial<Record<ModuloId, string[]>> = {
  "ativo-giro": ["/ativo-de-giro"],
  "material-apoio": ["/material-de-apoio"],
  "qr-contingencia": ["/qr-contingencia"],
  rotas: ["/minha-rota"],
  escala: ["/escala"],
  rv: ["/rv"],
  feedbacks: ["/feedback-rota"],
  "5s": ["/5s"],
  "pa-reepack": ["/produtividade-armazem/reepack"],
  "pa-despejo": ["/produtividade-armazem/despejo"],
  "pa-empilhadeira": ["/produtividade-armazem/empilhadeira"],
  "pa-recebimento": ["/produtividade-armazem/recebimento"],
  "pa-cinco-s": ["/produtividade-armazem/cinco-s"],
  // O cartão leva a /abastecimento; /picking é a tela antiga, que ainda abre.
  "pa-picking": ["/produtividade-armazem/abastecimento", "/produtividade-armazem/picking"],
  "pa-bate-palete": ["/produtividade-armazem/bate-palete"],
  "carretas-portaria": ["/carretas-portaria"],
  "carretas-conferencia": ["/carretas-conferencia"],
  "carretas-descarga": ["/carretas-conferencia"],
  fefo: ["/fefo"],
  "fefo-controle": ["/fefo"],
  rating: ["/rating"],
  refugo: ["/refugo"],
  "refugo-indicadores": ["/indicadores-refugo"],
  devolucao: ["/devolucao"],
  "meus-indicadores": ["/meus-indicadores"],
};

export const MODULOS_CONFERIDOS = Object.keys(TELAS_DO_MODULO) as ModuloId[];

/** Uma linha do `uso_por_tela` (migration 124). */
export type UsoDeTela = { colaboradorId: string; tela: string; ultimoEm: string };

export type Liberacao = { colaboradorId: string; modulo: string; liberadoEm: string };

export type LiberacaoSemUso = Liberacao & {
  /** Última vez que abriu a tela do módulo, dentro da janela lida; nulo = não abriu. */
  ultimoUsoEm: string | null;
};

/** A tela aberta pertence a este endereço? "/fefo" casa "/fefo" e "/fefo/x", não "/fefox". */
export function telaCasa(tela: string, prefixo: string) {
  return tela === prefixo || tela.startsWith(`${prefixo}/`);
}

/** Último uso da pessoa em qualquer tela do módulo -- nulo se não abriu nenhuma. */
export function ultimoUsoDoModulo(usos: UsoDeTela[], modulo: string): string | null {
  const telas = TELAS_DO_MODULO[modulo as ModuloId];
  if (!telas) return null;
  let ultimo: string | null = null;
  for (const u of usos) {
    if (!telas.some((t) => telaCasa(u.tela, t))) continue;
    if (ultimo === null || u.ultimoEm > ultimo) ultimo = u.ultimoEm;
  }
  return ultimo;
}

/**
 * As liberações sem uso: módulo conferido, liberado ANTES do corte (quem
 * ganhou o acesso na semana passada não teve 30 dias para usar) e sem
 * nenhuma abertura da tela desde o corte.
 */
export function liberacoesSemUso(
  liberacoes: Liberacao[],
  usosPorPessoa: Map<string, UsoDeTela[]>,
  corte: string,
): LiberacaoSemUso[] {
  const saida: LiberacaoSemUso[] = [];
  for (const l of liberacoes) {
    if (!TELAS_DO_MODULO[l.modulo as ModuloId]) continue;
    if (l.liberadoEm >= corte) continue;
    const ultimo = ultimoUsoDoModulo(usosPorPessoa.get(l.colaboradorId) ?? [], l.modulo);
    if (ultimo !== null && ultimo >= corte) continue;
    saida.push({ ...l, ultimoUsoEm: ultimo });
  }
  return saida;
}

/** Último acesso ao app: a tela mais recente, qualquer que seja. */
export function ultimoAcesso(usos: UsoDeTela[]): string | null {
  let ultimo: string | null = null;
  for (const u of usos) if (ultimo === null || u.ultimoEm > ultimo) ultimo = u.ultimoEm;
  return ultimo;
}

/** O instante de N dias atrás, em ISO. */
export function diasAtras(dias: number, agora: Date = new Date()) {
  return new Date(agora.getTime() - dias * 86_400_000).toISOString();
}

/** "há 45 dias", "hoje", "nunca". */
export function haQuantoTempo(iso: string | null, agora: Date = new Date()) {
  if (!iso) return "nunca";
  const dias = Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
