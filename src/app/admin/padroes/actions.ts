"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarOuAgrupar } from "@/lib/notificacoes-server";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

function voltarPara(pilar: string, extra: string) {
  redirect(`/admin/padroes?pilar=${encodeURIComponent(pilar)}&${extra}`);
}

function slug(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type EnvioPreparado = { nome: string; destino: string; token: string };

/**
 * Gera um crachá de envio (URL assinada) para cada arquivo. O navegador usa
 * esse crachá para mandar o arquivo direto ao armazenamento, sem passar pelo
 * servidor do app -- a hospedagem recusa qualquer requisição acima de 4,5 MB
 * e vários padrões passam disso (o maior tem 49 MB).
 *
 * O crachá é assinado aqui com a chave de administrador, então o envio não
 * depende de nenhuma permissão de escrita aberta no armazenamento: ninguém
 * grava nada sem passar por esta função, que exige admin ou liderança.
 */
export async function prepararEnvios(
  pilar: string,
  nomes: string[],
): Promise<{ ok: boolean; itens?: EnvioPreparado[]; erro?: string }> {
  await requireModulo("padroes", "criar");

  if (nomes.length === 0) return { ok: false, erro: "Nenhum arquivo." };

  const admin = createAdminClient();

  const { data: pilarExiste } = await admin
    .from("padroes_pilares")
    .select("nome")
    .eq("nome", pilar)
    .maybeSingle();

  if (!pilarExiste) return { ok: false, erro: "Pilar inválido." };

  const carimbo = Date.now();

  const resultados = await Promise.all(
    nomes.map(async (nome, i) => {
      const destino = `padroes/${slug(pilar)}/${carimbo}-${i}-${slug(nome)}`;
      const { data, error } = await admin.storage
        .from("conteudo")
        .createSignedUploadUrl(destino, { upsert: true });
      return { nome, destino, token: data?.token, erro: error?.message };
    }),
  );

  const falha = resultados.find((r) => !r.token);
  if (falha) {
    return { ok: false, erro: falha.erro ?? "Falha ao preparar o envio." };
  }

  return {
    ok: true,
    itens: resultados.map((r) => ({
      nome: r.nome,
      destino: r.destino,
      token: r.token as string,
    })),
  };
}

/**
 * Registra de uma vez os arquivos que o navegador já terminou de enviar.
 * Em lote para não fazer uma viagem ao servidor por arquivo.
 */
export async function registrarPadroes(dados: {
  pilar: string;
  caminho: string;
  itens: { nome: string; tipo: string; destino: string }[];
}): Promise<{ ok: boolean; erro?: string }> {
  await requireModulo("padroes", "criar");

  if (dados.itens.length === 0) return { ok: true };

  const admin = createAdminClient();
  const caminho = dados.caminho.trim();

  const linhas = dados.itens.map((item) => ({
    pilar: dados.pilar,
    caminho,
    nome: item.nome.trim(),
    tipo: item.tipo,
    arquivo_url: admin.storage.from("conteudo").getPublicUrl(item.destino).data
      .publicUrl,
  }));

  const { error } = await admin.from("padroes").insert(linhas);
  if (error) return { ok: false, erro: error.message };

  // Agrupa: enviar 12 arquivos de uma vez gera UM aviso, não doze.
  await criarOuAgrupar({
    modulo: "padroes",
    titulo: "Novo padrão disponível!",
    mensagem:
      linhas.length === 1
        ? linhas[0].nome
        : `${linhas.length} novos padrões em ${dados.pilar}`,
    url: `/padroes?pilar=${encodeURIComponent(dados.pilar)}`,
  });

  revalidatePath("/padroes");
  revalidatePath("/admin/padroes");
  return { ok: true };
}

export async function excluirPadrao(formData: FormData) {
  await requireModulo("padroes", "excluir");

  const id = Number(formData.get("id"));
  const pilar = formData.get("pilar") as string;

  if (!id) voltarPara(pilar, "erro=Registro+invalido");

  const admin = createAdminClient();

  const { data: registro } = await admin
    .from("padroes")
    .select("arquivo_url")
    .eq("id", id)
    .maybeSingle();

  if (registro) {
    const caminhoStorage = caminhoDoStorage(registro.arquivo_url);
    if (caminhoStorage) {
      await admin.storage.from("conteudo").remove([caminhoStorage]);
    }
  }

  const { error } = await admin.from("padroes").delete().eq("id", id);

  if (error) {
    voltarPara(pilar, `erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/padroes");
  voltarPara(pilar, "sucesso=Arquivo+excluido");
}

export async function atualizarPadrao(formData: FormData) {
  await requireModulo("padroes", "editar");

  const id = Number(formData.get("id"));
  const pilarOrigem = formData.get("pilar_origem") as string;
  const nome = ((formData.get("nome") as string) || "").trim();
  const pilar = formData.get("pilar") as string;
  const caminho = ((formData.get("caminho") as string) || "").trim();

  if (!id) voltarPara(pilarOrigem, "erro=Registro+invalido");
  if (!nome) voltarPara(pilarOrigem, "erro=O+nome+nao+pode+ficar+vazio");

  const admin = createAdminClient();

  const { data: pilarExiste } = await admin
    .from("padroes_pilares")
    .select("nome")
    .eq("nome", pilar)
    .maybeSingle();

  if (!pilarExiste) voltarPara(pilarOrigem, "erro=Pilar+invalido");
  const { error } = await admin
    .from("padroes")
    .update({ nome, pilar, caminho })
    .eq("id", id);

  if (error) {
    voltarPara(pilarOrigem, `erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/padroes");
  voltarPara(pilar, "sucesso=Alteracoes+salvas");
}

/* ------------------------------------------------------------------ */
/* Pilares                                                             */
/* ------------------------------------------------------------------ */

// "never" avisa o TypeScript de que a execução para aqui, permitindo a ele
// estreitar os tipos depois das validações.
function voltarParaPilares(extra: string): never {
  redirect(`/admin/padroes?aba=pilares&${extra}`);
}

export async function criarPilar(formData: FormData) {
  await requireModulo("padroes", "criar");

  const nome = ((formData.get("nome") as string) || "").trim();
  if (!nome) voltarParaPilares("erro=Informe+o+nome+do+pilar");

  const admin = createAdminClient();

  const { data: ultimo } = await admin
    .from("padroes_pilares")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin
    .from("padroes_pilares")
    .insert({ nome, ordem: (ultimo?.ordem ?? 0) + 1 });

  if (error) {
    voltarParaPilares(
      `erro=${encodeURIComponent(
        error.message.includes("duplicate")
          ? "Já existe um pilar com esse nome"
          : error.message,
      )}`,
    );
  }

  revalidatePath("/padroes");
  voltarParaPilares("sucesso=Pilar+criado");
}

export async function renomearPilar(formData: FormData) {
  await requireModulo("padroes", "editar");

  const id = Number(formData.get("id"));
  const nomeAntigo = (formData.get("nome_antigo") as string) || "";
  const nome = ((formData.get("nome") as string) || "").trim();

  if (!id || !nome) voltarParaPilares("erro=Informe+o+novo+nome");
  if (nome === nomeAntigo) voltarParaPilares("sucesso=Nada+alterado");

  const admin = createAdminClient();

  const { error } = await admin
    .from("padroes_pilares")
    .update({ nome })
    .eq("id", id);

  if (error) {
    voltarParaPilares(
      `erro=${encodeURIComponent(
        error.message.includes("duplicate")
          ? "Já existe um pilar com esse nome"
          : error.message,
      )}`,
    );
  }

  // Os arquivos guardam o nome do pilar como texto: precisam acompanhar,
  // senão sumiriam da tela por não casar com nenhum pilar.
  const { error: erroArquivos } = await admin
    .from("padroes")
    .update({ pilar: nome })
    .eq("pilar", nomeAntigo);

  if (erroArquivos) {
    voltarParaPilares(`erro=${encodeURIComponent(erroArquivos.message)}`);
  }

  revalidatePath("/padroes");
  voltarParaPilares("sucesso=Pilar+renomeado");
}

export async function alternarVisibilidadePilar(formData: FormData) {
  await requireModulo("padroes", "editar");

  const id = Number(formData.get("id"));
  const visivelAtual = formData.get("visivel") === "true";
  if (!id) voltarParaPilares("erro=Pilar+invalido");

  const admin = createAdminClient();
  const { error } = await admin
    .from("padroes_pilares")
    .update({ visivel: !visivelAtual })
    .eq("id", id);

  if (error) voltarParaPilares(`erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/padroes");
  voltarParaPilares(
    `sucesso=Pilar+${visivelAtual ? "ocultado" : "exibido"}`,
  );
}

export async function moverPilar(formData: FormData) {
  await requireModulo("padroes", "editar");

  const id = Number(formData.get("id"));
  const direcao = formData.get("direcao") as "cima" | "baixo";

  const admin = createAdminClient();
  const { data: pilares } = await admin
    .from("padroes_pilares")
    .select("id, ordem")
    .order("ordem", { ascending: true });

  if (!pilares) voltarParaPilares("erro=Nao+foi+possivel+ler+os+pilares");

  const i = pilares.findIndex((p) => p.id === id);
  const destino = direcao === "cima" ? i - 1 : i + 1;
  if (i === -1 || destino < 0 || destino >= pilares.length) {
    voltarParaPilares("sucesso=Nada+alterado");
  }

  const atual = pilares[i];
  const vizinho = pilares[destino];

  // Valor temporário evita conflito caso a ordem tenha índice único.
  await admin.from("padroes_pilares").update({ ordem: -1 }).eq("id", atual.id);
  await admin
    .from("padroes_pilares")
    .update({ ordem: atual.ordem })
    .eq("id", vizinho.id);
  await admin
    .from("padroes_pilares")
    .update({ ordem: vizinho.ordem })
    .eq("id", atual.id);

  revalidatePath("/padroes");
  voltarParaPilares("sucesso=Ordem+atualizada");
}

export async function excluirPilar(formData: FormData) {
  await requireModulo("padroes", "excluir");

  const id = Number(formData.get("id"));
  const nome = (formData.get("nome") as string) || "";
  if (!id) voltarParaPilares("erro=Pilar+invalido");

  const admin = createAdminClient();

  // Excluir um pilar com arquivos deixaria os padrões órfãos e invisíveis.
  // Melhor recusar e explicar o caminho do que apagar conteúdo por engano.
  const { count } = await admin
    .from("padroes")
    .select("*", { count: "exact", head: true })
    .eq("pilar", nome);

  if ((count ?? 0) > 0) {
    voltarParaPilares(
      `erro=${encodeURIComponent(
        `"${nome}" tem ${count} arquivo(s). Mova ou exclua os arquivos antes, ou apenas oculte o pilar.`,
      )}`,
    );
  }

  const { error } = await admin.from("padroes_pilares").delete().eq("id", id);
  if (error) voltarParaPilares(`erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/padroes");
  voltarParaPilares("sucesso=Pilar+excluido");
}
