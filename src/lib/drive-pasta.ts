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
  const re = /aria-label=\\?"([^"\\]+?\.(?:csv|xlsx|xls))\s/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const nome = m[1];
    // O id aparece ANTES do nome, no atributo ssk do mesmo bloco.
    const antes = html.slice(Math.max(0, m.index - 800), m.index);
    const ids = [...antes.matchAll(/[:']([a-zA-Z0-9_-]{25,44})-\d+-\d+'/g)];
    const id = ids.length ? ids[ids.length - 1][1] : null;

    if (id && !arquivos.some((a) => a.id === id)) arquivos.push({ id, nome });
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

/** "PCD_08_2026.csv" -> "08/2026". Só para mostrar na tela. */
export function mesDoNome(nome: string) {
  const m = nome.match(/(\d{2})[_-](\d{4})/);
  return m ? `${m[1]}/${m[2]}` : null;
}
