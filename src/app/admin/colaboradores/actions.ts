"use server";

import { redirect } from "next/navigation";
import ExcelJS from "exceljs";
import { podeNoModulo, requireModulo, requireOwner } from "@/lib/require-admin";
import { ehOwner } from "@/lib/acessos";
import { exigirRevenda, getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_SENHA_ALTERADA, SENHA_PADRAO } from "@/lib/senha";
import { cpfParaEmail, somenteDigitos } from "@/lib/auth-helpers";
import { areaDoColaborador } from "@/lib/quiz";
import {
  classificar,
  linhasDaMatriz,
  validarLinhas,
  type EstadoDaLeitura,
  type Existente,
  type LinhaBruta,
  type LinhaColaborador,
} from "@/lib/colaboradores-planilha";

const MODULO_AG = "ativo-giro";

function campo(formData: FormData, nome: string) {
  return ((formData.get(nome) as string) || "").trim();
}

// O retorno "never" avisa o TypeScript de que aqui a execução para, o que
// permite a ele estreitar os tipos depois das validações.
function voltar(params: Record<string, string>): never {
  const busca = new URLSearchParams(params);
  redirect(`/admin/colaboradores?${busca.toString()}`);
}

type Admin = ReturnType<typeof createAdminClient>;

type DadosDoColaborador = {
  nome: string;
  cpf: string;
  cargo: string;
  area: string;
  matricula: string | null;
  revenda?: string | null;
  empresa?: string | null;
};

/**
 * CRIA O ACESSO DE UMA PESSOA: login, perfil e vínculo à unidade.
 *
 * Um lugar só, usado pelo cadastro da tela e pela importação da planilha
 * (10/09/2026). As três gravações têm uma ordem e um desfazer, e duas
 * cópias dessa sequência divergem -- a que divergir deixa login sem
 * perfil, ou perfil sem unidade, que é a pessoa que entra e não vê nada.
 *
 * Devolve objeto em vez de redirecionar: a importação chama isto cem
 * vezes e precisa saber de cada uma, não sair da tela na primeira falha.
 */
async function criarAcessoDeColaborador(
  admin: Admin,
  d: DadosDoColaborador,
  revendaId: string,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const { data: jaExiste } = await admin.from("profiles").select("nome").eq("cpf", d.cpf).maybeSingle();
  if (jaExiste) return { ok: false, erro: `Esse CPF já está cadastrado para ${jaExiste.nome}` };

  // Cria o acesso com a senha padrão; o app obriga a trocar no 1º login.
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: cpfParaEmail(d.cpf),
    password: SENHA_PADRAO,
    email_confirm: true,
    user_metadata: { [CHAVE_SENHA_ALTERADA]: false },
  });
  if (erroAuth || !criado?.user) {
    return {
      ok: false,
      erro: erroAuth?.message.includes("already been registered")
        ? "Já existe um acesso com esse CPF"
        : (erroAuth?.message ?? "Não foi possível criar o acesso"),
    };
  }

  const { error: erroPerfil } = await admin.from("profiles").insert({
    id: criado.user.id,
    nome: d.nome,
    cpf: d.cpf,
    matricula: d.matricula,
    cargo: d.cargo,
    area: d.area,
    revenda: d.revenda ?? null,
    empresa: d.empresa ?? null,
    role: "colaborador",
  });
  if (erroPerfil) {
    // Sem perfil o acesso ficaria órfão: desfaz para não deixar lixo.
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: erroPerfil.message };
  }

  const { error: erroVinculo } = await admin
    .from("colaborador_revendas")
    .insert({ colaborador_id: criado.user.id, revenda_id: revendaId, principal: true });
  if (erroVinculo) {
    // Mesmo raciocínio de acima: sem vínculo a pessoa entra e não vê nada,
    // então é melhor não deixar o cadastro pela metade.
    await admin.from("profiles").delete().eq("id", criado.user.id);
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: erroVinculo.message };
  }

  return { ok: true, id: criado.user.id };
}

export async function criarColaborador(formData: FormData) {
  const eu = await requireModulo("colaboradores", "criar");

  const nome = campo(formData, "nome");
  const cpf = somenteDigitos(campo(formData, "cpf"));
  const cargo = campo(formData, "cargo");
  const area = campo(formData, "area");

  if (!nome) voltar({ erro: "Informe o nome" });
  if (cpf.length !== 11) voltar({ erro: "O CPF deve ter 11 dígitos" });
  if (!cargo) voltar({ erro: "Informe o cargo" });
  if (!area) voltar({ erro: "Informe a área" });

  // Quem cadastra, cadastra por padrão para a revenda em que está. Só o
  // dono pode escolher outra na própria tela -- o campo nem aparece para
  // os demais, mesma regra de quem pode mexer em vínculo depois de
  // criado. Não existe pessoa sem revenda: ela entraria no app e não
  // teria conteúdo nenhum para ver.
  const revendaEscolhida = ehOwner(eu.role) ? campo(formData, "revenda_id") : "";
  const revendaId = revendaEscolhida || (await getRevendaId());
  if (!revendaId) voltar({ erro: "Você não está em nenhuma revenda." });

  const admin = createAdminClient();

  const r = await criarAcessoDeColaborador(
    admin,
    {
      nome,
      cpf,
      cargo,
      area,
      matricula: campo(formData, "matricula") || null,
      revenda: campo(formData, "revenda") || null,
      empresa: campo(formData, "empresa") || null,
    },
    revendaId,
  );
  if (!r.ok) voltar({ erro: r.erro });

  // Acesso ao Ativo de Giro, direto no cadastro. Best-effort: o módulo
  // pode estar desligado nesta revenda (a concessão fica inerte até
  // alguém ligar), e uma falha aqui não é motivo para desfazer a pessoa
  // inteira -- dá para liberar depois clicando nela.
  if (campo(formData, "acesso_ag") === "1") {
    await admin.from("colaborador_modulos_extra").upsert(
      {
        colaborador_id: r.id,
        revenda_id: revendaId,
        modulo: MODULO_AG,
        liberado_por: eu.id,
      },
      { onConflict: "colaborador_id,revenda_id,modulo" },
    );
  }

  voltar({
    sucesso: `${nome} cadastrado. Senha inicial: ${SENHA_PADRAO} (será trocada no primeiro acesso).`,
    busca: cpf,
  });
}

/* ------------------------------------------------------------------ *
 * IMPORTAÇÃO POR PLANILHA (10/09/2026, implantação de Barreiras)
 * ------------------------------------------------------------------ */

/** Célula do ExcelJS em texto -- fórmula vira resultado, texto rico vira
 *  texto puro. Número vira texto SEM formatação: é o que faz um CPF que
 *  o Excel guardou como número chegar como "1234567890", e a validação
 *  devolver o zero da frente quando o dígito verificador confere. */
function celulaTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

/** Quem já tem cadastro no app, pelo CPF, com as unidades de cada um. */
async function existentesPorCpf(admin: Admin, cpfs: string[]): Promise<Map<string, Existente>> {
  const saida = new Map<string, Existente>();
  const lista = [...new Set(cpfs)];
  for (let i = 0; i < lista.length; i += 200) {
    const { data: perfis } = await admin
      .from("profiles")
      .select("id, nome, cpf, cargo, area, matricula")
      .in("cpf", lista.slice(i, i + 200));
    const ids = (perfis ?? []).map((p) => p.id as string);
    const { data: vinculos } = ids.length
      ? await admin.from("colaborador_revendas").select("colaborador_id, revenda_id").in("colaborador_id", ids)
      : { data: [] };
    for (const p of perfis ?? []) {
      saida.set(p.cpf as string, {
        id: p.id as string,
        nome: p.nome as string,
        cargo: (p.cargo as string) ?? null,
        area: (p.area as string) ?? null,
        matricula: (p.matricula as string) ?? null,
        revendas: (vinculos ?? [])
          .filter((v) => v.colaborador_id === p.id)
          .map((v) => v.revenda_id as string),
      });
    }
  }
  return saida;
}

/** Até quantas pessoas por arquivo -- o de Barreiras tem 100; cinco vezes
 *  isso já é uma unidade inteira nova, e passa do que uma ação aguenta. */
const MAXIMO_POR_PLANILHA = 500;

/**
 * PASSO 1: LÊ A PLANILHA E DIZ O QUE VAI ACONTECER. Não grava nada.
 *
 * Criar cem acessos não se desfaz com um clique, então a tela mostra antes
 * quem entra, quem muda e em quê, quem foi recusado e por quê -- e as
 * áreas que o app não entende, que são o erro silencioso desta operação
 * (ver EQUIVALENCIA_DE_AREA).
 */
export async function lerPlanilhaColaboradores(
  _anterior: EstadoDaLeitura,
  formData: FormData,
): Promise<EstadoDaLeitura> {
  await requireModulo("colaboradores", "criar");
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Escolha a planilha (.xlsx)." };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await arquivo.arrayBuffer());
  } catch {
    return { ok: false, erro: "Não consegui abrir o arquivo — confira se é um .xlsx." };
  }
  const aba = wb.worksheets[0];
  if (!aba) return { ok: false, erro: "A planilha está vazia." };

  const matriz: string[][] = [];
  aba.eachRow({ includeEmpty: true }, (row, numero) => {
    matriz[numero - 1] = ((row.values as unknown[]) ?? []).slice(1).map(celulaTexto);
  });

  // O cabeçalho é a primeira linha com três ou mais células preenchidas:
  // arquivo do RH às vezes chega com título ou linha em branco em cima.
  const iCab = matriz.findIndex((l, i) => i < 10 && (l ?? []).filter((x) => x.trim()).length >= 3);
  if (iCab < 0) return { ok: false, erro: "Não achei a linha de cabeçalho (Nome, CPF, Cargo, Área)." };

  const { brutas, faltam } = linhasDaMatriz(
    matriz[iCab],
    matriz.slice(iCab + 1).map((l) => l ?? []),
    iCab + 2,
  );
  if (faltam.length > 0) {
    return {
      ok: false,
      erro: `A planilha não tem a(s) coluna(s): ${faltam.join(", ")}. Baixe a planilha padrão para ver o formato.`,
    };
  }
  if (brutas.length === 0) return { ok: false, erro: "Nenhuma linha com dados na planilha." };
  if (brutas.length > MAXIMO_POR_PLANILHA) {
    return { ok: false, erro: `Até ${MAXIMO_POR_PLANILHA} pessoas por planilha — divida o arquivo.` };
  }

  const { validas, problemas } = validarLinhas(brutas);
  const admin = createAdminClient();
  const [existentes, { data: revenda }] = await Promise.all([
    existentesPorCpf(admin, validas.map((v) => v.cpf)),
    admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle(),
  ]);
  const cl = classificar(validas, existentes, revendaId);

  const convertidas = new Map<string, { de: string; para: string; quantas: number }>();
  const semTraducao = new Map<string, number>();
  for (const v of [...cl.criar, ...cl.atualizar]) {
    if (v.area !== v.areaDaPlanilha) {
      const atual = convertidas.get(v.areaDaPlanilha) ?? { de: v.areaDaPlanilha, para: v.area, quantas: 0 };
      atual.quantas++;
      convertidas.set(v.areaDaPlanilha, atual);
    }
    if (!areaDoColaborador(v.area)) semTraducao.set(v.area, (semTraducao.get(v.area) ?? 0) + 1);
  }

  return {
    ok: true,
    nomeArquivo: arquivo.name,
    revendaNome: (revenda?.nome as string) ?? "esta unidade",
    total: brutas.length,
    ...cl,
    problemas,
    areasConvertidas: [...convertidas.values()],
    areasSemTraducao: [...semTraducao.entries()].map(([area, quantas]) => ({ area, quantas })),
    cpfsCorrigidos: validas.filter((v) => v.cpfCorrigido).length,
  };
}

/**
 * PASSO 2: GRAVA. E refaz tudo antes, contra o banco de agora.
 *
 * As linhas voltam da tela, e a tela não é confiável: a validação e a
 * classificação rodam de novo aqui. Se alguém cadastrou um dos CPFs entre
 * a prévia e o clique, ele cai em "atualizar" em vez de ser criado duas
 * vezes; se a linha foi adulterada, ela é recusada do mesmo jeito.
 *
 * Em LOTES DE CINCO: um por um, cem acessos passariam do tempo que uma
 * ação tem; todos de uma vez, bateriam no limite de criação de usuários
 * do Supabase. Uma falha não derruba as outras -- ela aparece no fim, com
 * o nome.
 */
export async function confirmarImportacaoColaboradores(formData: FormData) {
  await requireModulo("colaboradores", "criar");
  const podeEditar = await podeNoModulo("colaboradores", "editar");
  const revendaId = await exigirRevenda("/admin/colaboradores");

  let recebidas: LinhaColaborador[] = [];
  try {
    recebidas = JSON.parse(String(formData.get("linhas") ?? "[]"));
  } catch {
    voltar({ erro: "A prévia chegou incompleta. Leia a planilha de novo." });
  }
  if (!Array.isArray(recebidas) || recebidas.length === 0) voltar({ erro: "Nada a gravar." });
  if (recebidas.length > MAXIMO_POR_PLANILHA) voltar({ erro: "Planilha grande demais." });

  // A área VOLTA como veio do arquivo, para a conversão ser refeita aqui e
  // não aceita da tela.
  const brutas: LinhaBruta[] = recebidas.map((l) => ({
    linha: Number(l.linha) || 0,
    matricula: String(l.matricula ?? ""),
    nome: String(l.nome ?? ""),
    cpf: String(l.cpf ?? ""),
    cargo: String(l.cargo ?? ""),
    area: String(l.areaDaPlanilha ?? l.area ?? ""),
  }));
  const { validas } = validarLinhas(brutas);

  const admin = createAdminClient();
  const cl = classificar(validas, await existentesPorCpf(admin, validas.map((v) => v.cpf)), revendaId);

  const falhas: string[] = [];
  let criados = 0;
  for (let i = 0; i < cl.criar.length; i += 5) {
    const lote = cl.criar.slice(i, i + 5);
    const resultados = await Promise.all(
      lote.map((l) =>
        criarAcessoDeColaborador(
          admin,
          { nome: l.nome, cpf: l.cpf, cargo: l.cargo, area: l.area, matricula: l.matricula },
          revendaId,
        ),
      ),
    );
    resultados.forEach((r, j) => {
      if (r.ok) criados++;
      else falhas.push(`${lote[j].nome}: ${r.erro}`);
    });
  }

  let atualizados = 0;
  if (podeEditar) {
    for (const l of cl.atualizar) {
      const { error } = await admin
        .from("profiles")
        .update({
          nome: l.nome,
          cargo: l.cargo,
          area: l.area,
          // Matrícula em branco não apaga a que existe (ver `classificar`).
          ...(l.matricula ? { matricula: l.matricula } : {}),
        })
        .eq("id", l.id);
      if (error) falhas.push(`${l.nome}: ${error.message}`);
      else atualizados++;
    }
  }

  const partes = [`${criados} acesso(s) criado(s)`];
  if (cl.atualizar.length > 0) {
    partes.push(
      podeEditar
        ? `${atualizados} cadastro(s) atualizado(s)`
        : `${cl.atualizar.length} atualização(ões) não feita(s) — falta a permissão de editar colaboradores`,
    );
  }
  if (criados > 0) partes.push(`senha inicial ${SENHA_PADRAO}, trocada no primeiro acesso`);
  if (falhas.length > 0) {
    partes.push(`${falhas.length} falha(s): ${falhas.slice(0, 3).join("; ")}${falhas.length > 3 ? "…" : ""}`);
  }

  voltar(
    falhas.length > 0 && criados === 0 && atualizados === 0
      ? { erro: partes.join(" · ") }
      : { sucesso: partes.join(" · ") },
  );
}

/**
 * Salva o cadastro inteiro: os dados da pessoa e, se quem está mexendo for
 * o dono, também as revendas dela.
 *
 * As duas coisas num botão só porque, para quem edita, são a mesma tarefa
 * -- "corrigir o cadastro do fulano". Dois botões de salvar na mesma ficha
 * obrigam a pessoa a descobrir qual deles guarda o quê.
 */
export async function atualizarColaborador(formData: FormData) {
  const eu = await requireModulo("colaboradores", "editar");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome");
  const cargo = campo(formData, "cargo");
  const area = campo(formData, "area");
  const busca = campo(formData, "busca");

  if (!id) voltar({ erro: "Colaborador inválido" });
  if (!nome) voltar({ erro: "O nome não pode ficar vazio" });
  if (!cargo) voltar({ erro: "O cargo não pode ficar vazio", ...(busca ? { busca } : {}) });
  if (!area) voltar({ erro: "A área não pode ficar vazia", ...(busca ? { busca } : {}) });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      nome,
      matricula: campo(formData, "matricula") || null,
      cargo,
      area,
    })
    .eq("id", id);

  if (error) voltar({ erro: error.message, ...(busca ? { busca } : {}) });

  // Vínculo é só do dono. Uma liderança com "editar" não manda campo de
  // revenda nenhum (a tela nem mostra), e se mandasse na mão, seria
  // ignorado aqui -- é este teste, e não a tela, que segura a regra.
  const marcadas = formData.getAll("revenda").map(String).filter(Boolean);
  const tinhaBlocoDeRevendas = campo(formData, "vinculos_editaveis") === "1";

  if (ehOwner(eu.role) && tinhaBlocoDeRevendas && marcadas.length === 0) {
    voltar({
      erro: `${nome} precisa estar em pelo menos uma revenda. Para tirar o acesso, remova a pessoa do app.`,
      ...(busca ? { busca } : {}),
    });
  }

  if (ehOwner(eu.role) && marcadas.length > 0) {
    const problema = await aplicarVinculos({
      donoId: eu.id,
      donoNome: eu.nome,
      colaboradorId: id,
      colaboradorNome: nome,
      marcadas,
      principalPedida: campo(formData, "principal"),
    });

    if (problema) voltar({ erro: problema, ...(busca ? { busca } : {}) });
  }

  voltar({ sucesso: `Dados de ${nome} atualizados`, ...(busca ? { busca } : {}) });
}

export async function excluirColaborador(formData: FormData) {
  const usuarioAtual = await requireModulo("colaboradores", "excluir");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");

  if (!id) voltar({ erro: "Colaborador inválido" });
  if (id === usuarioAtual.id) {
    voltar({ erro: "Você não pode excluir a própria conta" });
  }

  const admin = createAdminClient();

  // Apaga o perfil antes do acesso: se algo falhar no meio, sobra um acesso
  // sem perfil, que o app já trata mostrando "sessão não reconhecida".
  const { error: erroPerfil } = await admin
    .from("profiles")
    .delete()
    .eq("id", id);

  if (erroPerfil) voltar({ erro: erroPerfil.message });

  const { error: erroAuth } = await admin.auth.admin.deleteUser(id);
  if (erroAuth) voltar({ erro: erroAuth.message });

  voltar({
    sucesso: `${nome} removido do app`,
    ...(busca ? { busca } : {}),
  });
}

/**
 * Promove um colaborador a liderança, ou desfaz.
 *
 * Exige a permissão "promover" no módulo Colaboradores -- separada de
 * "editar" de propósito: dá para confiar o cadastro a alguém sem confiar a
 * ela o poder de criar novas lideranças.
 *
 * O que esta função NÃO faz, e é o que a mantém segura: ela não concede
 * permissão nenhuma. Quem for promovido aqui entra sem nenhum módulo
 * liberado -- só o Admin, em Acessos por Pessoa, decide o que cada liderança
 * enxerga. Promover dá o crachá; não dá as chaves.
 */
export async function promoverColaborador(formData: FormData) {
  const eu = await requireModulo("colaboradores", "promover");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const papel = campo(formData, "papel");
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });
  if (papel !== "lideranca" && papel !== "colaborador") {
    voltar({ erro: "Nível de acesso inválido", ...extra });
  }
  if (id === eu.id) {
    voltar({ erro: "Você não pode alterar o seu próprio acesso", ...extra });
  }

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("profiles")
    .select("nome, role")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar({ erro: "Colaborador não encontrado", ...extra });

  // O Admin é intocável por esta porta. Só o banco define quem ele é.
  if (alvo.role === "owner") {
    voltar({ erro: "O Admin do app não pode ser alterado aqui", ...extra });
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: papel })
    .eq("id", id);

  if (error) voltar({ erro: error.message, ...extra });

  // Rebaixou: as permissões vão junto. Deixar sobra seria uma porta aberta
  // esperando a pessoa ser promovida de novo.
  if (papel === "colaborador") {
    await admin.from("lideranca_permissoes").delete().eq("colaborador_id", id);
  }

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao:
      papel === "lideranca"
        ? "Promoveu a liderança"
        : "Removeu a liderança",
    alvo_id: id,
    alvo_nome: alvo.nome,
    detalhes: "Pela tela de Colaboradores",
  });

  voltar({
    sucesso:
      papel === "lideranca"
        ? `${nome} agora é liderança. O Admin precisa liberar os módulos em Acessos por Pessoa.`
        : `${nome} voltou a ser colaborador e perdeu as permissões.`,
    ...extra,
  });
}

/**
 * Define a quais revendas a pessoa pertence.
 *
 * É por aqui que passa a liderança que responde por mais de uma unidade:
 * marcar as duas revendas faz aparecer para ela o seletor no topo do app, e
 * a partir daí cada revenda tem o seu próprio conjunto de permissões, que o
 * Admin define em Acessos por Pessoa.
 *
 * Devolve a mensagem de erro, ou null se deu certo -- em vez de redirecionar
 * sozinha: quem chama está no meio de salvar o cadastro inteiro e precisa
 * decidir o que fazer com a falha.
 *
 * Só o dono chega aqui; a checagem fica em quem chama, que é onde o papel
 * já foi lido.
 */
async function aplicarVinculos(dados: {
  donoId: string;
  donoNome: string;
  colaboradorId: string;
  colaboradorNome: string;
  marcadas: string[];
  principalPedida: string;
}): Promise<string | null> {
  const {
    donoId: eu,
    donoNome,
    colaboradorId: id,
    colaboradorNome: nome,
    marcadas,
    principalPedida,
  } = dados;

  // A principal precisa estar entre as marcadas -- senão a pessoa entraria
  // por padrão numa revenda que ela acabou de perder.
  const principal = marcadas.includes(principalPedida)
    ? principalPedida
    : marcadas[0];

  const admin = createAdminClient();

  // Lista no formato que o PostgREST espera em "not in". As aspas evitam
  // que o id seja lido como parte da sintaxe do filtro.
  const fora = `(${marcadas.map((r) => `"${r}"`).join(",")})`;

  // Tira só o que saiu. Apagar tudo e regravar zeraria a data de quando o
  // vínculo começou, que é o que explica o histórico da pessoa depois.
  const { error: erroRemocao } = await admin
    .from("colaborador_revendas")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  if (erroRemocao) return erroRemocao.message;

  // A principal antiga sai da frente antes de a nova entrar: o banco só
  // aceita uma principal por pessoa.
  await admin
    .from("colaborador_revendas")
    .update({ principal: false })
    .eq("colaborador_id", id);

  const { error } = await admin.from("colaborador_revendas").upsert(
    marcadas.map((revenda_id) => ({
      colaborador_id: id,
      revenda_id,
      principal: revenda_id === principal,
      criado_por: eu,
    })),
    { onConflict: "colaborador_id,revenda_id" },
  );

  if (error) return error.message;

  // Permissão de liderança em revenda que a pessoa não é mais de nada
  // adianta -- e voltaria a valer sozinha se o vínculo fosse refeito.
  await admin
    .from("lideranca_permissoes")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  const { data: nomes } = await admin
    .from("revendas")
    .select("nome")
    .in("id", marcadas);

  const resumo = (nomes ?? []).map((r) => r.nome).join(", ");

  await admin.from("auditoria").insert({
    ator_id: eu,
    ator_nome: donoNome,
    acao: "Alterou revendas do colaborador",
    alvo_id: id,
    alvo_nome: nome,
    detalhes: resumo,
  });

  return null;
}

export async function redefinirSenha(formData: FormData) {
  await requireModulo("colaboradores", "editar");

  const id = formData.get("id") as string;
  const nome = (formData.get("nome") as string) || "Colaborador";
  const busca = (formData.get("busca") as string) || "";

  if (!id) redirect("/admin/colaboradores?erro=Colaborador+invalido");

  const admin = createAdminClient();

  // Volta para a senha padrao e desmarca a troca, obrigando o colaborador
  // a definir uma senha nova no proximo acesso.
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: SENHA_PADRAO,
    user_metadata: { [CHAVE_SENHA_ALTERADA]: false },
  });

  const params = new URLSearchParams();
  if (busca) params.set("busca", busca);

  if (error) {
    params.set("erro", error.message);
  } else {
    params.set(
      "sucesso",
      `Senha de ${nome} redefinida para ${SENHA_PADRAO}. No próximo acesso será pedida uma nova senha.`,
    );
  }

  redirect(`/admin/colaboradores?${params.toString()}`);
}

/**
 * Libera o Ativo de Giro para o colaborador, na revenda em que o dono
 * está agora -- a mesma pessoa pode usar o módulo numa unidade e não na
 * outra. Migrado de Admin > Ativo de Giro > Acessos: o cadastro é o
 * lugar natural para decidir o que cada colaborador enxerga, não uma
 * tela à parte por módulo.
 *
 * Exclusivo do dono, como toda alteração de acesso.
 */
export async function concederAcessoAtivoGiro(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/colaboradores");

  const { error } = await admin.from("colaborador_modulos_extra").upsert(
    {
      colaborador_id: id,
      revenda_id: revendaId,
      modulo: MODULO_AG,
      liberado_por: eu.id,
    },
    { onConflict: "colaborador_id,revenda_id,modulo" },
  );

  if (error) voltar({ erro: `Não foi possível liberar: ${error.message}`, ...extra });
  voltar({ sucesso: `Ativo de Giro liberado para ${nome}`, ...extra });
}

/** Revoga o acesso concedido acima. */
export async function revogarAcessoAtivoGiro(formData: FormData) {
  await requireOwner();

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/colaboradores");

  const { error } = await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .eq("revenda_id", revendaId)
    .eq("modulo", MODULO_AG);

  if (error) voltar({ erro: `Não foi possível revogar: ${error.message}`, ...extra });
  voltar({ sucesso: `Acesso ao Ativo de Giro revogado de ${nome}`, ...extra });
}
