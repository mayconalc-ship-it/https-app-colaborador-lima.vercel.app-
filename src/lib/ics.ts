/**
 * Um evento de calendário no formato .ics (RFC 5545).
 *
 * É o único jeito de "empurrar" um compromisso para o celular do
 * colaborador sem pedir conta, permissão nem app nenhum: o navegador
 * baixa o arquivo, o Android e o iPhone reconhecem o tipo e abrem o
 * calendário nativo já com o convite preenchido. Um link de Google
 * Agenda funcionaria para quem usa Google -- e só.
 *
 * Escrito à mão, sem biblioteca: são três regras (escapar, dobrar linha,
 * CRLF) e nenhuma delas muda. Uma dependência aqui custaria mais em
 * bundle e atualização do que o arquivo inteiro.
 */

/** Vírgula, ponto-e-vírgula e barra são separadores do formato -- escapam. */
function escapar(texto: string) {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Dobra a linha em 75 OCTETOS, não 75 caracteres.
 *
 * A diferença importa em português: "ç" e "ã" ocupam dois octetos em
 * UTF-8, e contar caracteres estouraria o limite num título acentuado --
 * exatamente onde o calendário de alguns celulares corta o texto.
 */
function dobrar(linha: string) {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;

  const pedacos: string[] = [];
  let inicio = 0;
  while (inicio < bytes.length) {
    // A continuação leva um espaço na frente, então cabe um octeto a menos.
    const limite = pedacos.length === 0 ? 75 : 74;
    let fim = Math.min(inicio + limite, bytes.length);
    // Nunca cortar no meio de um caractere: 10xxxxxx é continuação.
    while (fim > inicio && fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) {
      fim--;
    }
    pedacos.push(bytes.subarray(inicio, fim).toString("utf8"));
    inicio = fim;
  }
  return pedacos.join("\r\n ");
}

/** Instante no formato do padrão, sempre em UTC: "20260915T110000Z". */
function carimbo(data: Date) {
  return data.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function montarIcs(evento: {
  /** Estável e único: reabrir o mesmo link ATUALIZA o compromisso em vez
   *  de criar um segundo igual na agenda da pessoa. */
  uid: string;
  titulo: string;
  descricao?: string;
  url?: string;
  inicio: Date;
  /** Quanto dura, em minutos. */
  duracaoMinutos?: number;
  /** Alarme quantos minutos antes. Zero/omitido = sem alarme. */
  alarmeMinutosAntes?: number;
}) {
  const fim = new Date(
    evento.inicio.getTime() + (evento.duracaoMinutos ?? 30) * 60_000,
  );

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LIMA Logistica//App do Colaborador//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${evento.uid}`,
    `DTSTAMP:${carimbo(new Date())}`,
    `DTSTART:${carimbo(evento.inicio)}`,
    `DTEND:${carimbo(fim)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
  ];

  if (evento.descricao) linhas.push(`DESCRIPTION:${escapar(evento.descricao)}`);
  if (evento.url) linhas.push(`URL:${escapar(evento.url)}`);

  if (evento.alarmeMinutosAntes) {
    linhas.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${evento.alarmeMinutosAntes}M`,
      `DESCRIPTION:${escapar(evento.titulo)}`,
      "END:VALARM",
    );
  }

  linhas.push("END:VEVENT", "END:VCALENDAR");

  // CRLF é exigência do formato, não estilo: iPhone recusa arquivo com
  // quebra de linha só de LF.
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
