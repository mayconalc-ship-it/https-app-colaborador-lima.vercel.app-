/**
 * OS PDVs VIP -- só a regra de leitura, sem banco e sem rede (08/11/2026,
 * pedido do dono: "em fonte de dados, coloque para que carregue uma lista
 * de PDVs vips, e sempre que for colocado o mapa que tenha pdv dessa base,
 * apareça o aviso assim como o da prioridade").
 *
 * A planilha é a da operação (a de Barreiras: Cód, Nome PDV, Setor,
 * Segmento, Endereço, Cidade, GV). Mesmo princípio da base de clientes:
 * coluna achada pelo NOME, com sinônimos -- só o código é obrigatório.
 * Sem coluna de segmento, todo PDV da lista é "VIP".
 */
import { chaveDoCabecalho, codigoDaBase } from "@/lib/clientes-base";

export type PdvVip = {
  codPdv: string;
  /** VIP, CONTRATO, ZÉ... como veio na planilha. */
  segmento: string;
  nome: string | null;
  setor: string | null;
  gv: string | null;
  cidade: string | null;
};

const SINONIMOS: Record<keyof PdvVip, string[]> = {
  codPdv: ["codigocliente", "codcliente", "codpdv", "codigopdv", "codigodocliente", "codigo", "cod"],
  segmento: ["segmento", "segmentacao", "classificacao", "categoria", "tipo"],
  nome: ["nomepdv", "nomefantasia", "fantasia", "razaosocial", "nomecliente", "nome"],
  setor: ["setor", "setorvenda", "setordevenda"],
  gv: ["gv", "gerentevendas", "gerentedevendas", "nomegv"],
  cidade: ["cidade", "municipio"],
};

export function acharColunasVip(cabecalho: string[]): Partial<Record<keyof PdvVip, number>> {
  const chaves = cabecalho.map(chaveDoCabecalho);
  const achado: Partial<Record<keyof PdvVip, number>> = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS) as [keyof PdvVip, string[]][]) {
    for (const nome of nomes) {
      let i = chaves.indexOf(nome);
      if (i < 0 && nome.length > 3) i = chaves.findIndex((c) => c.startsWith(nome));
      if (i >= 0 && !Object.values(achado).includes(i)) {
        achado[campo] = i;
        break;
      }
    }
  }
  return achado;
}

/** "#N/A" e afins do Excel valem vazio: é fórmula que não achou, não dado. */
const texto = (v: unknown): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t && t !== "-" && !/^#(n\/?a|ref!|valor!|value!|div\/0!|nome\?|name\?)$/i.test(t) ? t : null;
};

export function lerLinhaVip(linha: unknown[], colunas: Partial<Record<keyof PdvVip, number>>): PdvVip | null {
  const em = (campo: keyof PdvVip) => {
    const i = colunas[campo];
    return i === undefined ? null : texto(linha[i]);
  };
  const codPdv = codigoDaBase(colunas.codPdv === undefined ? null : texto(linha[colunas.codPdv]));
  if (!codPdv) return null;
  return {
    codPdv,
    segmento: (em("segmento") ?? "VIP").toUpperCase(),
    nome: em("nome"),
    setor: em("setor"),
    gv: em("gv"),
    cidade: em("cidade"),
  };
}

/**
 * A lista inteira: o cabeçalho é a primeira linha que tem a coluna do
 * código (a planilha pode ter título em cima). Código repetido: fica o
 * primeiro.
 */
export function lerListaVip(linhas: unknown[][]): { vips: PdvVip[]; semCodigo: number; colunas: string[]; erro?: string } {
  const i = linhas.slice(0, 10).findIndex((l) => acharColunasVip(l.map((c) => String(c ?? ""))).codPdv !== undefined);
  if (i < 0) {
    return { vips: [], semCodigo: 0, colunas: [], erro: `não achei a coluna do código do PDV. O cabeçalho lido foi: ${(linhas[0] ?? []).slice(0, 10).join(" | ")}` };
  }
  const colunas = acharColunasVip(linhas[i].map((c) => String(c ?? "")));
  const vistos = new Map<string, PdvVip>();
  let semCodigo = 0;
  for (const l of linhas.slice(i + 1)) {
    if (!l.some((c) => texto(c))) continue;
    const v = lerLinhaVip(l, colunas);
    if (!v) semCodigo++;
    else if (!vistos.has(v.codPdv)) vistos.set(v.codPdv, v);
  }
  return { vips: [...vistos.values()], semCodigo, colunas: Object.keys(colunas) };
}
