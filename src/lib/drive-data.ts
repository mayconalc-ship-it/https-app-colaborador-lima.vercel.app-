/**
 * A DATA DE MODIFICAÇÃO QUE A PASTA DO DRIVE MOSTRA -- só texto, sem rede.
 *
 * Pedido do dono (10/11/2026): a base de clientes ligada à PASTA, e não ao
 * arquivo, "pois toda nova atualização ela puxa o arquivo correto". Para
 * isso o app precisa saber qual arquivo da pasta é o mais novo, e a visão
 * embutida do Drive só escreve a data como gente lê:
 *
 *   "5:31 PM"       modificado hoje (só a hora)
 *   "Nov 8"         neste ano
 *   "Nov 8, 2025"   em outro ano
 *   "11/8/25"       formato curto, que o Google às vezes usa
 *
 * Devolve "aaaa-mm-dd" ou "aaaa-mm-dd hh:mm" (para dois de hoje), que
 * ordenam como texto. Nulo = não entendeu; esse arquivo vai para o fim.
 */

const MESES: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6,
  jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
};

const dois = (n: number) => String(n).padStart(2, "0");

export function dataDaPastaDoDrive(texto: string, hoje: string): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim().toLowerCase().replace(/\./g, "");
  if (!t) return null;

  // Hoje: "5:31 pm", "17:31".
  const h = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (h) {
    let hora = Number(h[1]);
    if (h[3] === "pm" && hora < 12) hora += 12;
    if (h[3] === "am" && hora === 12) hora = 0;
    return `${hoje} ${dois(hora)}:${h[2]}`;
  }

  const [anoHoje] = hoje.split("-").map(Number);

  // "nov 8", "nov 8, 2025", "8 de nov", "8 de nov de 2025".
  const m1 = t.match(/^([a-zç]{3})[a-zç]* (\d{1,2})(?:, (\d{4}))?$/);
  const m2 = t.match(/^(\d{1,2}) de ([a-zç]{3})[a-zç]*(?: de (\d{4}))?$/);
  const mes = m1 ? MESES[m1[1]] : m2 ? MESES[m2[2]] : undefined;
  if (mes && (m1 || m2)) {
    const dia = Number(m1 ? m1[2] : m2![1]);
    const anoDado = m1 ? m1[3] : m2![3];
    let ano = anoDado ? Number(anoDado) : anoHoje;
    const iso = `${ano}-${dois(mes)}-${dois(dia)}`;
    // Sem ano e "no futuro" = é do ano passado (dez visto em janeiro).
    if (!anoDado && iso > hoje) ano -= 1;
    return `${ano}-${dois(mes)}-${dois(dia)}`;
  }

  // "11/8/25" ou "11/8/2025" -- o Google em inglês é mês/dia.
  const c = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (c) {
    const ano = c[3].length === 2 ? 2000 + Number(c[3]) : Number(c[3]);
    return `${ano}-${dois(Number(c[1]))}-${dois(Number(c[2]))}`;
  }
  return null;
}

/**
 * Os arquivos da pasta, o mais novo primeiro. Mesma data (dois de "Nov 8"):
 * o nome maior primeiro -- exportação costuma levar data e hora no nome.
 * Sem data nenhuma, fica a ordem que o Drive deu.
 */
export function maisNovoPrimeiro<T extends { nome: string; modificado?: string | null }>(arquivos: T[]): T[] {
  return arquivos
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const dx = x.a.modificado ?? "", dy = y.a.modificado ?? "";
      if (dx !== dy) return dx < dy ? 1 : -1;
      if (dx && x.a.nome !== y.a.nome) return x.a.nome < y.a.nome ? 1 : -1;
      return x.i - y.i;
    })
    .map(({ a }) => a);
}
