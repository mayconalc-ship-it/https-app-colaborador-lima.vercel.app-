import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de rodar.",
  );
  process.exit(1);
}

const BASE_DIR =
  "C:\\Users\\Usuário\\OneDrive - Lima Logistica e Distribuicao Ltda\\Documentos\\DPO\\02. Arquivo Vyas\\Gestão\\1. Gestão\\4.0 Ferramentas de Gestão\\4.1 Padrões e Treinamentos\\1. Padrões\\1. Padrões";

const PILARES = [
  "01- Planejamento - OK",
  "02- Armazém - OK",
  "03- Controle - OK",
  "04 - Entrega - OK",
  "05 - Frota",
];

const CONTENT_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsb: "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function limparPilar(nomePasta) {
  return nomePasta
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s*-\s*OK$/i, "")
    .trim();
}

function ehLixo(nomeArquivo) {
  return (
    nomeArquivo.startsWith("~") ||
    nomeArquivo.toLowerCase() === "thumbs.db" ||
    nomeArquivo.toLowerCase() === "desktop.ini"
  );
}

function slug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function listarArquivosRecursivo(dir, base) {
  const resultado = [];
  const entradas = fs.readdirSync(dir, { withFileTypes: true });
  for (const entrada of entradas) {
    const caminhoCompleto = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      resultado.push(...listarArquivosRecursivo(caminhoCompleto, base));
    } else if (!ehLixo(entrada.name)) {
      resultado.push(caminhoCompleto);
    }
  }
  return resultado;
}

let total = 0;
let sucesso = 0;
const falhas = [];

for (const pastaPilar of PILARES) {
  const pilar = limparPilar(pastaPilar);
  const dirPilar = path.join(BASE_DIR, pastaPilar);

  if (!fs.existsSync(dirPilar)) {
    console.log(`AVISO: pasta não encontrada: ${dirPilar}`);
    continue;
  }

  const arquivos = listarArquivosRecursivo(dirPilar, dirPilar);

  for (const caminhoArquivo of arquivos) {
    total++;
    const relativo = path.relative(dirPilar, caminhoArquivo);
    const caminho = path.dirname(relativo) === "." ? "" : path.dirname(relativo).replace(/\\/g, " / ");
    const nomeArquivoComExt = path.basename(caminhoArquivo);
    const extensao = path.extname(nomeArquivoComExt).slice(1).toLowerCase();
    const nome = path.basename(nomeArquivoComExt, path.extname(nomeArquivoComExt));

    try {
      const bytes = fs.readFileSync(caminhoArquivo);
      const caminhoStorage = `padroes/${slug(pilar)}/${Date.now()}-${slug(nomeArquivoComExt)}`;

      const { error: uploadError } = await supabase.storage
        .from("conteudo")
        .upload(caminhoStorage, bytes, {
          contentType: CONTENT_TYPES[extensao] ?? "application/octet-stream",
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrlData } = supabase.storage
        .from("conteudo")
        .getPublicUrl(caminhoStorage);

      const { error: insertError } = await supabase.from("padroes").insert({
        pilar,
        caminho,
        nome,
        tipo: extensao,
        arquivo_url: publicUrlData.publicUrl,
      });

      if (insertError) throw new Error(insertError.message);

      sucesso++;
      console.log(`OK (${sucesso}/${total}): [${pilar}] ${caminho ? caminho + " / " : ""}${nomeArquivoComExt}`);
    } catch (e) {
      falhas.push({ pilar, arquivo: nomeArquivoComExt, motivo: e.message });
      console.log(`FALHA: [${pilar}] ${nomeArquivoComExt} - ${e.message}`);
    }
  }
}

console.log(`\nConcluído: ${sucesso} de ${total} importados.`);
if (falhas.length) {
  console.log(`\nFalhas (${falhas.length}):`);
  falhas.forEach((f) => console.log(` - [${f.pilar}] ${f.arquivo}: ${f.motivo}`));
}
