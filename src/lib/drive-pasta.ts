import "server-only";

export type ArquivoDaPasta = { id: string; nome: string };

/** Aceita link de pasta ou o id cru. */
export function idDaPasta(link: string) {
  const limpo = (link ?? "").trim();
  const m = limpo.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (m) return m[1];
  // Já é um id?
  if (/^[a-zA-Z0-9_-]{15,}$/.test(limpo)) return limpo;
  return null;
}

/**
 * Lista os arquivos de uma pasta PÚBLICA do Drive.
 *
 * Sem credencial e sem API: o app abre a página da pasta como um navegador
 * abriria e lê a listagem de dentro do HTML. Para cada arquivo o Drive
 * escreve um `ssk='...:ID-0-16'` logo antes de um `aria-label="NOME.csv"`,
 * e é esse par que extraímos.
 *
 * ⚠️ Fragilidade conhecida: isso depende do formato da página do Google,
 * que não é documentado e pode mudar sem aviso. Se um dia parar de achar
 * arquivos, o app avisa e o caminho por link de arquivo continua valendo.
 */
export async function listarArquivosDaPasta(
  pastaId: string,
): Promise<{ arquivos: ArquivoDaPasta[]; erro?: string }> {
  let html: string;

  try {
    const r = await fetch(`https://drive.google.com/drive/folders/${pastaId}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!r.ok) {
      return { arquivos: [], erro: `o Google respondeu ${r.status}` };
    }
    html = await r.text();
  } catch (e) {
    return { arquivos: [], erro: (e as Error).message };
  }

  const arquivos: ArquivoDaPasta[] = [];
  // Pega todo aria-label e filtra depois pela extensão -- exigir a
  // extensão dentro do próprio regex quebrava quando o Google mudava o
  // texto que vem depois do nome ("Microsoft Excel Shared", "CSV Shared").
  const re = /aria-label=\\?"([^"\\]{2,160})"/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const comExtensao = m[1].match(/([\w\-. ()]+\.(?:csv|xlsx|xls))/i);
    if (!comExtensao) continue;

    // O id vem DEPOIS do nome, no ssk do mesmo elemento:
    //   aria-label="X.xlsx ..." ... ssk='5:auSv138:<ID>-0-16'
    //
    // Até 29/08/2026 este código procurava para TRÁS. Funcionava por
    // sorte: em arquivo CSV o ícone é pequeno e o ssk do item anterior
    // caía dentro da janela. No XLSX o ícone é um SVG grande, empurrava
    // o ssk para fora, e a pasta inteira aparecia vazia.
    const depois = html.slice(m.index, m.index + 400);
    const achado = depois.match(/ssk='[^']*?:([a-zA-Z0-9_-]{25,44})-\d+-\d+'/);
    const id = achado ? achado[1] : null;

    if (id && !arquivos.some((a) => a.id === id)) {
      arquivos.push({ id, nome: comExtensao[1].trim() });
    }
  }

  if (arquivos.length === 0) {
    return {
      arquivos: [],
      erro:
        "não encontrei nenhum arquivo. Confira se a pasta está compartilhada como 'Qualquer pessoa com o link' e se há arquivos .csv nela",
    };
  }

  return { arquivos };
}

/** Baixa um arquivo do Drive e devolve o texto já com os acentos certos. */
export async function baixarTextoDoDrive(id: string) {
  const candidatos = [
    `https://drive.usercontent.google.com/download?id=${id}&export=download`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ];

  for (const url of candidatos) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;

      const bytes = new Uint8Array(await r.arrayBuffer());

      // Veio página de login em vez do arquivo?
      const espiada = new TextDecoder("utf-8").decode(bytes.slice(0, 200));
      if (espiada.trimStart().startsWith("<")) continue;

      // A planilha do roteirizador sai em latin1. Lida como UTF-8, os
      // acentos das cidades chegariam quebrados.
      const utf8 = new TextDecoder("utf-8").decode(bytes);
      return utf8.includes("\uFFFD")
        ? new TextDecoder("latin1").decode(bytes)
        : utf8;
    } catch {
      // tenta o próximo endereço
    }
  }
  return null;
}

/**
 * Lista as SUBPASTAS de uma pasta pública.
 *
 * O Rating não vive numa pasta só: a operação organiza um diretório por
 * relatório (01.20.01.47, 03.11.29, LOG.CO...). Cadastrar cinco links no
 * Admin seria cinco chances de colar o errado -- cadastra-se a pasta mãe
 * e o app acha as filhas pelo nome.
 *
 * Mesmo desenho (e mesma fragilidade) de `listarArquivosDaPasta`: o
 * Drive marca pasta com "Shared folder" no rótulo.
 */
export async function listarSubpastas(
  pastaId: string,
): Promise<{ pastas: ArquivoDaPasta[]; erro?: string }> {
  let html: string;
  try {
    const r = await fetch(`https://drive.google.com/drive/folders/${pastaId}`, {
      headers: { "user-agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!r.ok) return { pastas: [], erro: `o Google respondeu ${r.status}` };
    html = await r.text();
  } catch (e) {
    return { pastas: [], erro: (e as Error).message };
  }

  const pastas: ArquivoDaPasta[] = [];
  const re = /aria-label=\\?"([^"\\]{2,160})"/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const rotulo = m[1];
    if (!/\sShared folder$/i.test(rotulo)) continue;
    const nome = rotulo.replace(/\sShared folder$/i, "").trim();
    if (!nome) continue;

    const depois = html.slice(m.index, m.index + 400);
    const achado = depois.match(/ssk='[^']*?:([a-zA-Z0-9_-]{25,44})-\d+-\d+'/);
    const id = achado ? achado[1] : null;
    if (id && !pastas.some((p) => p.id === id)) pastas.push({ id, nome });
  }

  if (pastas.length === 0) {
    return {
      pastas: [],
      erro:
        "não encontrei nenhuma subpasta. Confira se a pasta mãe está compartilhada como 'Qualquer pessoa com o link'",
    };
  }
  return { pastas };
}

/**
 * Baixa um arquivo BINÁRIO do Drive (o .xlsx do LOG.CO). Diferente do
 * `baixarTextoDoDrive`, não decodifica nada -- xlsx é um zip, e tratar
 * como texto corrompe.
 *
 * A checagem é a assinatura "PK" do zip, não o content-type: quando o
 * Drive quer confirmar o download ele responde 200 com uma página HTML,
 * e sem esta conferência a planilha "baixada" seria esse HTML.
 */
export async function baixarBytesDoDrive(id: string): Promise<Buffer | null> {
  for (const url of [
    `https://drive.usercontent.google.com/download?id=${id}&export=download`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ]) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      if (b[0] === 0x50 && b[1] === 0x4b) return b;
    } catch {
      // tenta o próximo endereço
    }
  }
  return null;
}

/** "PCD_08_2026.csv" -> "08/2026". Só para mostrar na tela. */
export function mesDoNome(nome: string) {
  const m = nome.match(/(\d{2})[_-](\d{4})/);
  return m ? `${m[1]}/${m[2]}` : null;
}
