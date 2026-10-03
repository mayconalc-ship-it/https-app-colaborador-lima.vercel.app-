/**
 * O que uma ação "no lugar" devolve: deu certo (com a frase para o aviso)
 * ou não deu (com o motivo). Ver components/FormNoLugar.
 *
 * Fica fora dos arquivos "use server" para poder ser importado dos dois
 * lados -- a ação monta, o formulário lê.
 */
export type ResultadoAcao =
  | {
      ok: true;
      mensagem: string;
      /** Deu certo E a tela é outra -- criar a rodada leva à página dela. */
      irPara?: string;
    }
  | { ok: false; erro: string };

export const deuCerto = (mensagem: string, irPara?: string): ResultadoAcao => ({ ok: true, mensagem, irPara });
export const deuErrado = (erro: string): ResultadoAcao => ({ ok: false, erro });

/*
 * ENCERRAR A AÇÃO NO MEIO, SEM NAVEGAR (03/10/2026).
 *
 * As ações antigas paravam com `redirect(?erro=...)` / `redirect(?sucesso=...)`
 * -- e o redirect é navegação: a tela voltava ao topo. Para converter mais de
 * cem funções sem reescrever cada uma, os ajudantes delas passam a LANÇAR um
 * `Desfecho` (com o resultado dentro), e a ação inteira roda dentro de
 * `noLugar`, que o devolve ao formulário. O corpo da ação fica igual: quem
 * chamava `erro("...")` como "para tudo aqui" continua chamando.
 *
 * Qualquer outro erro (inclusive o redirect de sessão vencida ou de sem
 * permissão) passa reto -- esses continuam navegando, que é o certo.
 */
export class Desfecho extends Error {
  constructor(public readonly resultado: ResultadoAcao) {
    super(resultado.ok ? resultado.mensagem : resultado.erro);
    this.name = "Desfecho";
  }
}

/** Para a ação com o aviso verde (e, se quiser, leva a outra tela). */
export function pararComSucesso(mensagem: string, irPara?: string): never {
  throw new Desfecho(deuCerto(mensagem, irPara));
}

/** Para a ação com o aviso vermelho. Nada é navegado: a pessoa fica onde estava. */
export function pararComErro(erro: string): never {
  throw new Desfecho(deuErrado(erro));
}

export async function noLugar(corpo: () => Promise<unknown>, padrao = "Salvo."): Promise<ResultadoAcao> {
  try {
    const r = await corpo();
    if (r && typeof r === "object" && "ok" in r) return r as ResultadoAcao;
    return deuCerto(padrao);
  } catch (e) {
    if (e instanceof Desfecho) return e.resultado;
    throw e;
  }
}

/**
 * Para ajudantes que montavam o aviso no endereço ("erro=Pilar+inválido",
 * "sucesso=Pilar+criado"): lê esse pedaço e encerra do mesmo jeito.
 */
export function pararPelaUrl(consulta: string): never {
  const p = new URLSearchParams(consulta);
  const erro = p.get("erro");
  if (erro !== null) pararComErro(erro);
  pararComSucesso(p.get("sucesso") ?? "Salvo.");
}
