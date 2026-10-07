import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil, type Perfil } from "@/lib/sessao";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { prepararFoto } from "@/lib/manutencao-server";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  FOTOS_POR_CHAMADO,
  MODULO_CHAMADOS,
  MODULO_CHAMADOS_ATENDER,
  PRAZOS_PADRAO,
  chaveDoTexto,
  formatarTelefone,
  nomeDoLocal,
  prazoDe,
  protocolo,
  rotuloPrioridade,
  rotuloTipo,
  type Local,
  type MotivoEmail,
  type Prazos,
  type Prioridade,
  type Tipo,
} from "@/lib/chamados";

const BUCKET = "chamados";
/** Link da foto vale 1 hora: o bastante para olhar o chamado. */
const SEGUNDOS_DO_LINK = 60 * 60;
/**
 * A foto guardada: WebP de 1280 px. Medido em fotos reais do app (câmera
 * de 4080x3072, ~2,3 MB): ~50 KB cada, contra ~80 KB no padrão de 1600 px
 * -- o problema continua à vista, e o 1 GB do plano gratuito dura mais.
 */
const TAMANHO_DA_FOTO = { lado: 1280, qualidade: 65 };

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A migration 165 pode ainda não ter rodado (o deploy da Vercel é
 * automático; a migração é manual). Sem as tabelas, a tela diz o que
 * falta em vez de quebrar.
 */
export class ChamadosNaoInstalado extends Error {}

function conferir(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message)) {
    throw new ChamadosNaoInstalado(error.message);
  }
  throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Quem está no app
// ---------------------------------------------------------------------

export type ContextoChamados = {
  ok: true;
  perfil: Perfil;
  revendaId: string;
  /** O time da manutenção: fila e atendimento. */
  podeAtender: boolean;
  /** A liderança que lê o painel da Gestão (vê qualquer chamado). */
  podeVerPainel: boolean;
  podeExcluir: boolean;
};

/**
 * A porta da tela e das ações do app. Abrir é de todo mundo da revenda
 * com o módulo ligado -- por isso não passa por `temAcessoModulo`, que
 * barraria o colaborador sem liberação individual (ver acessos.ts).
 */
export async function contextoChamados(): Promise<ContextoChamados | { ok: false; erro: string }> {
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };
  if (!(await revendaTemModulo(MODULO_CHAMADOS))) {
    return { ok: false, erro: "Os chamados para manutenção não estão ativos nesta revenda." };
  }
  const [podeAtender, podeVerPainel, podeExcluir] = await Promise.all([
    temAcessoModulo(MODULO_CHAMADOS_ATENDER),
    podeNoModulo(MODULO_CHAMADOS, "ver"),
    podeNoModulo(MODULO_CHAMADOS, "excluir"),
  ]);
  return { ok: true, perfil, revendaId, podeAtender, podeVerPainel, podeExcluir };
}

/**
 * Quem abre este chamado: quem pediu (em qualquer revenda -- o aviso
 * chega a ela mesmo com outra revenda ativa), e, na revenda dele, o time
 * da manutenção e a liderança do painel.
 */
export function podeVerChamado(ctx: ContextoChamados, c: Chamado) {
  if (c.solicitante_id && c.solicitante_id === ctx.perfil.id) return true;
  return c.revenda_id === ctx.revendaId && (ctx.podeAtender || ctx.podeVerPainel);
}

export function podeAtenderChamado(ctx: ContextoChamados, c: Chamado) {
  return c.revenda_id === ctx.revendaId && ctx.podeAtender;
}

// ---------------------------------------------------------------------
// Configuração e locais
// ---------------------------------------------------------------------

export type ConfigChamados = {
  tokenPublico: string;
  prazos: Prazos;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
  /** Quem recebe o pedido de COMPRA de peça (coluna `emails`, migration 167). */
  emailsCompras: string[];
  /** Quem AUTORIZA: o gestor (coluna `emails_gestor`, migration 169). */
  emailsGestor: string[];
};

/** A coluna de cada lista de e-mails, por motivo do pedido. */
export const COLUNA_DOS_EMAILS = { compra: "emails", autorizacao: "emails_gestor" } as const;

export function destinatariosDe(config: ConfigChamados, motivo: MotivoEmail) {
  return motivo === "compra" ? config.emailsCompras : config.emailsGestor;
}

/**
 * Coluna nova que ainda não existe: o deploy chegou antes da migration
 * 167. A tela segue como antes em vez de dizer que o módulo sumiu.
 */
function colunaFaltando(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42703" || /column .* does not exist/i.test(error.message));
}

const CAMPOS_CONFIG = "token_publico, prazo_risco_horas, prazo_urgente_horas, prazo_normal_horas, atualizado_em, atualizado_por_nome";

export async function lerConfig(revendaId: string, admin: Admin = createAdminClient()): Promise<ConfigChamados> {
  const consulta = (campos: string) => admin.from("chamados_config").select(campos).eq("revenda_id", revendaId).maybeSingle();
  // Do mais novo para o mais antigo: 169 (gestor), 167 (compras), 165.
  let { data, error } = await consulta(`${CAMPOS_CONFIG}, emails, emails_gestor`);
  if (colunaFaltando(error)) ({ data, error } = await consulta(`${CAMPOS_CONFIG}, emails`));
  if (colunaFaltando(error)) ({ data, error } = await consulta(CAMPOS_CONFIG));
  conferir(error);
  if (data) {
    const d = data as unknown as {
      token_publico: string;
      prazo_risco_horas: number;
      prazo_urgente_horas: number;
      prazo_normal_horas: number;
      atualizado_em: string | null;
      atualizado_por_nome: string | null;
      emails?: string[] | null;
      emails_gestor?: string[] | null;
    };
    return {
      tokenPublico: d.token_publico,
      prazos: { risco: d.prazo_risco_horas, urgente: d.prazo_urgente_horas, normal: d.prazo_normal_horas },
      atualizadoEm: d.atualizado_em,
      atualizadoPorNome: d.atualizado_por_nome,
      emailsCompras: d.emails ?? [],
      emailsGestor: d.emails_gestor ?? [],
    };
  }
  // Revenda nova, que não estava na semente da 165: nasce aqui, com os
  // prazos de partida, para o QR existir desde o primeiro acesso.
  const { data: criada, error: e2 } = await admin
    .from("chamados_config")
    .upsert({ revenda_id: revendaId }, { onConflict: "revenda_id" })
    .select("token_publico")
    .single();
  conferir(e2);
  return { tokenPublico: criada!.token_publico, prazos: PRAZOS_PADRAO, atualizadoEm: null, atualizadoPorNome: null, emailsCompras: [], emailsGestor: [] };
}

/**
 * O endereço do app como quem está imprimindo o abriu -- é ele que vai
 * dentro do QR. Lido do pedido porque o app responde por mais de um
 * domínio, e um QR com o domínio errado não abre no celular de ninguém.
 */
export async function origemDoSite() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app-colaborador-lima.vercel.app";
  const esquema = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return { origem: `${esquema}://${host}`, local: /^(localhost|127\.|\[::1\])/.test(host) };
}

type Area5S = { id: string; nome: string; ordem: number; ativa: boolean };

/**
 * As áreas do chamado, já com as do 5S (07/10/2026, pedido do dono:
 * "utilize as mesmas áreas do módulo 5S" -- somadas às que já havia).
 *
 * A lista SEGUE o 5S: cada leitura confere se o 5S tem área que o chamado
 * ainda não conhece, e a cria aqui. Área com o mesmo nome dos dois lados
 * (Picking, Refeitório, Sala ADM) vira uma só, para o painel não dividir os
 * chamados de um lugar em dois. A que nasce do 5S acompanha o nome e o
 * liga/desliga de lá.
 *
 * Sem a migration 167 (deploy antes da migração), devolve a lista de
 * antes, sem o 5S.
 */
export async function lerLocais(revendaId: string, soAtivos = true, admin: Admin = createAdminClient()): Promise<Local[]> {
  const consulta = (campos: string) =>
    admin.from("chamados_locais").select(campos).eq("revenda_id", revendaId).order("ordem").order("nome");

  const [{ data, error }, { data: areas }] = await Promise.all([
    consulta("id, grupo, nome, ordem, ativo, cinco_s_area_id, veio_do_5s"),
    admin.from("cinco_s_areas").select("id, nome, ordem, ativa").eq("revenda_id", revendaId),
  ]);
  if (colunaFaltando(error)) {
    const antes = await consulta("id, grupo, nome, ordem, ativo");
    conferir(antes.error);
    const lista = (antes.data ?? []) as unknown as Local[];
    return soAtivos ? lista.filter((l) => l.ativo) : lista;
  }
  conferir(error);

  let locais = (data ?? []) as unknown as Local[];
  const do5s = (areas ?? []) as Area5S[];
  if (await sincronizarCom5S(revendaId, locais, do5s, admin)) {
    const deNovo = await consulta("id, grupo, nome, ordem, ativo, cinco_s_area_id, veio_do_5s");
    conferir(deNovo.error);
    locais = (deNovo.data ?? []) as unknown as Local[];
  }

  const porId = new Map(do5s.map((a) => [a.id, a]));
  const lista = locais.map((l) => {
    const a = l.cinco_s_area_id ? porId.get(l.cinco_s_area_id) : undefined;
    return { ...l, area5s: a ? { nome: a.nome, ordem: a.ordem, ativa: a.ativa } : null };
  });
  return soAtivos ? lista.filter((l) => l.ativo) : lista;
}

/** Põe em dia as áreas que vêm do 5S. Devolve se mudou alguma coisa. */
async function sincronizarCom5S(revendaId: string, locais: Local[], areas: Area5S[], admin: Admin) {
  let mudou = false;
  const ligadas = new Set(locais.map((l) => l.cinco_s_area_id).filter(Boolean));
  let proxima = Math.max(0, ...locais.map((l) => l.ordem)) + 1;

  for (const a of [...areas].sort((x, y) => x.ordem - y.ordem)) {
    if (ligadas.has(a.id)) {
      // Nasceu do 5S: o nome e o liga/desliga são os de lá.
      const l = locais.find((x) => x.cinco_s_area_id === a.id);
      if (l?.veio_do_5s && (l.nome !== a.nome.slice(0, 80) || l.ativo !== a.ativa)) {
        await admin.from("chamados_locais").update({ nome: a.nome.slice(0, 80), ativo: a.ativa }).eq("id", l.id);
        mudou = true;
      }
      continue;
    }
    if (!a.ativa) continue;

    // O mesmo lugar já está na lista do chamado: passa a ser a mesma área.
    const chave = chaveDoTexto(a.nome);
    const igual = locais.find((l) => !l.cinco_s_area_id && chaveDoTexto(l.nome) === chave);
    if (igual) {
      await admin.from("chamados_locais").update({ cinco_s_area_id: a.id }).eq("id", igual.id).is("cinco_s_area_id", null);
      igual.cinco_s_area_id = a.id;
    } else {
      // 23505 = outra tela criou no mesmo instante; a área já existe.
      await admin.from("chamados_locais").insert({
        revenda_id: revendaId,
        grupo: "",
        nome: a.nome.slice(0, 80),
        ordem: proxima++,
        cinco_s_area_id: a.id,
        veio_do_5s: true,
      });
    }
    mudou = true;
  }
  return mudou;
}

/**
 * O TOKEN DO QR -> a revenda. Um QR só por revenda (pedido do dono): a
 * área é escolhida no formulário.
 *
 * Token trocado (Admin > Chamados) ou módulo desligado na revenda = QR
 * que não abre mais nada (o cartaz ficou para trás).
 */
export async function resolverCodigo(codigo: string, admin: Admin = createAdminClient()) {
  const limpo = (codigo ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(limpo)) return null;

  const { data: config, error } = await admin
    .from("chamados_config")
    .select("revenda_id")
    .eq("token_publico", limpo)
    .maybeSingle();
  conferir(error);
  if (!config) return null;
  const revendaId = config.revenda_id as string;

  const [{ data: revenda }, { data: ligado }] = await Promise.all([
    admin.from("revendas").select("id, nome, ativa").eq("id", revendaId).maybeSingle(),
    admin
      .from("revenda_modulos")
      .select("ativo")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_CHAMADOS)
      .maybeSingle(),
  ]);
  if (!revenda || revenda.ativa === false || !ligado?.ativo) return null;

  return { revendaId, revendaNome: revenda.nome as string };
}

// ---------------------------------------------------------------------
// Chamados
// ---------------------------------------------------------------------

export const CAMPOS_CHAMADO =
  "id, revenda_id, numero, codigo, local_id, local_nome, tipo, prioridade, descricao, solicitante_nome, solicitante_telefone, solicitante_id, origem, status, responsavel_id, responsavel_nome, prazo_em, aberto_em, atendimento_em, concluido_em, solucao, confirmacao, confirmado_em, avaliacao, avaliacao_comentario, reaberturas, atualizado_em";

export type Chamado = {
  id: string;
  revenda_id: string;
  numero: number;
  codigo: string;
  local_id: string | null;
  local_nome: string;
  tipo: Tipo;
  prioridade: Prioridade;
  descricao: string;
  solicitante_nome: string;
  solicitante_telefone: string;
  solicitante_id: string | null;
  origem: "app" | "qr";
  status: "aberto" | "em_atendimento" | "aguardando" | "concluido" | "cancelado";
  responsavel_id: string | null;
  responsavel_nome: string | null;
  prazo_em: string;
  aberto_em: string;
  atendimento_em: string | null;
  concluido_em: string | null;
  solucao: string | null;
  confirmacao: "resolvido" | "nao_resolvido" | null;
  confirmado_em: string | null;
  avaliacao: number | null;
  avaliacao_comentario: string | null;
  reaberturas: number;
  atualizado_em: string;
};

/** O nome da revenda DO CHAMADO (pode não ser a ativa de quem olha). */
export async function nomeDaRevenda(revendaId: string, admin: Admin = createAdminClient()) {
  const { data } = await admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle();
  return (data?.nome as string | undefined) ?? "";
}

export async function lerChamado(id: string, admin: Admin = createAdminClient()): Promise<Chamado | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await admin.from("chamados").select(CAMPOS_CHAMADO).eq("id", id).maybeSingle();
  conferir(error);
  return (data as Chamado | null) ?? null;
}

export async function lerChamadoPorCodigo(codigo: string, admin: Admin = createAdminClient()): Promise<Chamado | null> {
  const limpo = (codigo ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8,32}$/.test(limpo)) return null;
  const { data, error } = await admin.from("chamados").select(CAMPOS_CHAMADO).eq("codigo", limpo).maybeSingle();
  conferir(error);
  return (data as Chamado | null) ?? null;
}

/** A fila da manutenção: tudo que está em aberto, mais os concluídos dos últimos 7 dias. */
export async function listarFila(revendaId: string, admin: Admin = createAdminClient()) {
  const seteDias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [abertos, recentes] = await Promise.all([
    admin
      .from("chamados")
      .select(CAMPOS_CHAMADO)
      .eq("revenda_id", revendaId)
      .in("status", ["aberto", "em_atendimento", "aguardando"])
      .order("prazo_em")
      .limit(500),
    admin
      .from("chamados")
      .select(CAMPOS_CHAMADO)
      .eq("revenda_id", revendaId)
      .in("status", ["concluido", "cancelado"])
      .gte("atualizado_em", seteDias)
      .order("atualizado_em", { ascending: false })
      .limit(100),
  ]);
  conferir(abertos.error);
  conferir(recentes.error);
  return { abertos: (abertos.data ?? []) as Chamado[], recentes: (recentes.data ?? []) as Chamado[] };
}

/** Os chamados que a pessoa abriu nesta revenda, do mais novo para o mais antigo. */
export async function listarMeus(revendaId: string, colaboradorId: string, admin: Admin = createAdminClient()) {
  const { data, error } = await admin
    .from("chamados")
    .select(CAMPOS_CHAMADO)
    .eq("revenda_id", revendaId)
    .eq("solicitante_id", colaboradorId)
    .order("aberto_em", { ascending: false })
    .limit(100);
  conferir(error);
  return (data ?? []) as Chamado[];
}

export type Evento = {
  id: number;
  tipo: "aberto" | "status" | "comentario" | "prioridade" | "confirmado" | "reaberto" | "avaliado";
  status_para: string | null;
  texto: string | null;
  autor_nome: string;
  autor_id: string | null;
  criado_em: string;
};

export type FotoChamado = { id: string; etapa: "abertura" | "conclusao"; caminho: string; url: string | null };

/** A linha do tempo e as fotos (em link assinado), de uma vez. */
export async function lerHistorico(chamadoId: string, admin: Admin = createAdminClient()) {
  const [eventos, fotos] = await Promise.all([
    admin
      .from("chamados_eventos")
      .select("id, tipo, status_para, texto, autor_nome, autor_id, criado_em")
      .eq("chamado_id", chamadoId)
      .order("criado_em"),
    admin.from("chamados_fotos").select("id, etapa, caminho, criado_em").eq("chamado_id", chamadoId).order("criado_em"),
  ]);
  conferir(eventos.error);
  conferir(fotos.error);
  const linhas = (fotos.data ?? []) as { id: string; etapa: FotoChamado["etapa"]; caminho: string }[];
  const links = await linksAssinados(
    linhas.map((f) => f.caminho),
    admin,
  );
  return {
    eventos: (eventos.data ?? []) as Evento[],
    fotos: linhas.map((f) => ({ ...f, url: links.get(f.caminho) ?? null })) as FotoChamado[],
  };
}

export async function registrarEvento(
  chamado: { id: string; revenda_id: string },
  ev: { tipo: Evento["tipo"]; statusPara?: string | null; texto?: string | null; autorNome: string; autorId?: string | null },
  admin: Admin = createAdminClient(),
) {
  await admin.from("chamados_eventos").insert({
    chamado_id: chamado.id,
    revenda_id: chamado.revenda_id,
    tipo: ev.tipo,
    status_para: ev.statusPara ?? null,
    texto: ev.texto?.trim() ? ev.texto.trim().slice(0, 2000) : null,
    autor_nome: ev.autorNome,
    autor_id: ev.autorId ?? null,
  });
}

// ---------------------------------------------------------------------
// Fotos (bucket privado)
// ---------------------------------------------------------------------

/** As fotos do formulário: só imagem, no máximo FOTOS_POR_CHAMADO. */
export function fotosDoFormulario(formData: FormData, campo = "fotos"): File[] {
  return formData
    .getAll(campo)
    .filter((f): f is File => f instanceof File && f.size > 0 && (f.type === "" || f.type.startsWith("image/")))
    .slice(0, FOTOS_POR_CHAMADO);
}

/** Sobe as fotos de um chamado. Uma que falhe não derruba as outras. */
export async function guardarFotos(
  chamado: { id: string; revenda_id: string },
  arquivos: File[],
  etapa: FotoChamado["etapa"],
  autorNome: string,
  admin: Admin = createAdminClient(),
) {
  let falhas = 0;
  for (const arquivo of arquivos) {
    try {
      // 15 MB depois da redução no celular é foto que não passou por ela;
      // o servidor ainda reduz, mas um arquivo desses não é foto de chamado.
      if (arquivo.size > 15 * 1024 * 1024) {
        falhas++;
        continue;
      }
      const foto = await prepararFoto(arquivo, TAMANHO_DA_FOTO);
      // O sharp não leu e o navegador não disse que é imagem: não é foto.
      // A página do QR é aberta -- o bucket não guarda arquivo qualquer.
      if (foto.largura === null && !arquivo.type.startsWith("image/")) {
        falhas++;
        continue;
      }
      const caminho = `${chamado.revenda_id}/${chamado.id}/${etapa}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${foto.extensao}`;
      const { error } = await admin.storage.from(BUCKET).upload(caminho, foto.dados, { contentType: foto.contentType });
      if (error) {
        falhas++;
        continue;
      }
      await admin.from("chamados_fotos").insert({
        chamado_id: chamado.id,
        revenda_id: chamado.revenda_id,
        etapa,
        caminho,
        bytes: foto.dados.length,
        enviada_por_nome: autorNome,
      });
    } catch {
      falhas++;
    }
  }
  return falhas;
}

export async function apagarFotosDoChamado(chamadoId: string, admin: Admin = createAdminClient()) {
  const { data } = await admin.from("chamados_fotos").select("caminho").eq("chamado_id", chamadoId);
  const caminhos = (data ?? []).map((f) => f.caminho as string);
  if (caminhos.length === 0) return;
  try {
    await admin.storage.from(BUCKET).remove(caminhos);
  } catch {
    // Arquivo que sobrou no bucket não quebra nada.
  }
}

async function linksAssinados(caminhos: string[], admin: Admin) {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(caminhos, SEGUNDOS_DO_LINK);
  for (const l of data ?? []) if (l.path && l.signedUrl) mapa.set(l.path, l.signedUrl);
  return mapa;
}

// ---------------------------------------------------------------------
// Abrir
// ---------------------------------------------------------------------

export type NovoChamado = {
  revendaId: string;
  local: { id: string; grupo: string; nome: string };
  tipo: Tipo;
  prioridade: Prioridade;
  descricao: string;
  nome: string;
  telefone: string;
  solicitanteId: string | null;
  origem: "app" | "qr";
  fotos: File[];
};

/**
 * Abre o chamado -- a MESMA função para o app e para o QR.
 *
 * Duplicata: o mesmo pedido (mesma área, mesmo texto) nos últimos 30
 * minutos devolve o chamado que já existe. É o toque duplo no "Abrir",
 * ou a mesma pessoa escaneando de novo porque não viu o protocolo --
 * dois números para o mesmo vazamento só confundem quem atende.
 */
export async function abrirChamado(n: NovoChamado, admin: Admin = createAdminClient()) {
  const descricao = n.descricao.trim().replace(/\n{3,}/g, "\n\n");
  const nome = n.nome.trim().replace(/\s+/g, " ");
  const localNome = nomeDoLocal(n.local);

  const meiaHora = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentes, error: eRecentes } = await admin
    .from("chamados")
    .select("id, codigo, numero, descricao")
    .eq("revenda_id", n.revendaId)
    .eq("local_id", n.local.id)
    .gte("aberto_em", meiaHora)
    .limit(20);
  conferir(eRecentes);
  const repetido = (recentes ?? []).find((r) => chaveDoTexto(r.descricao) === chaveDoTexto(descricao));
  if (repetido) {
    return { id: repetido.id as string, codigo: repetido.codigo as string, numero: repetido.numero as number, repetido: true, falhasDeFoto: 0 };
  }

  const config = await lerConfig(n.revendaId, admin);
  const agora = new Date();
  const { data: criado, error } = await admin
    .from("chamados")
    .insert({
      revenda_id: n.revendaId,
      local_id: n.local.id,
      local_nome: localNome,
      tipo: n.tipo,
      prioridade: n.prioridade,
      descricao,
      solicitante_nome: nome,
      solicitante_telefone: formatarTelefone(n.telefone),
      solicitante_id: n.solicitanteId,
      origem: n.origem,
      prazo_em: prazoDe(agora, n.prioridade, config.prazos).toISOString(),
      aberto_em: agora.toISOString(),
    })
    .select("id, codigo, numero, revenda_id")
    .single();
  conferir(error);
  const chamado = criado as { id: string; codigo: string; numero: number; revenda_id: string };

  await registrarEvento(chamado, { tipo: "aberto", autorNome: nome, autorId: n.solicitanteId }, admin);
  const falhasDeFoto = n.fotos.length ? await guardarFotos(chamado, n.fotos, "abertura", nome, admin) : 0;

  await avisarEquipe(n.revendaId, {
    titulo: `🔧 Chamado ${protocolo(chamado.numero)}${n.prioridade === "normal" ? "" : ` · ${rotuloPrioridade(n.prioridade)}`}`,
    mensagem: `${rotuloTipo(n.tipo)} em ${localNome}: ${descricao.slice(0, 120)}${descricao.length > 120 ? "…" : ""}`,
    url: `/chamados/${chamado.id}`,
    referenciaId: chamado.id,
    criadoPor: nome,
    importante: n.prioridade !== "normal",
    exceto: n.solicitanteId,
  });

  return { ...chamado, repetido: false, falhasDeFoto };
}

// ---------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------

/**
 * Quem atende nesta revenda: quem recebeu "chamados-atender" pessoa a
 * pessoa e a liderança com a mesma concessão. Mesmo critério de
 * `podeFazer`: a concessão de liderança só vale para quem ainda é liderança.
 */
export async function quemAtende(revendaId: string, admin: Admin = createAdminClient()): Promise<string[]> {
  const [{ data: extras }, { data: permissoes }] = await Promise.all([
    admin
      .from("colaborador_modulos_extra")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_CHAMADOS_ATENDER),
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("modulo", MODULO_CHAMADOS_ATENDER)
      .eq("acao", "ver"),
  ]);
  const lideres = [...new Set((permissoes ?? []).map((p) => p.colaborador_id as string))];
  let lideresValidos: string[] = [];
  if (lideres.length > 0) {
    const { data } = await admin.from("profiles").select("id").in("id", lideres).eq("role", "lideranca");
    lideresValidos = (data ?? []).map((p) => p.id as string);
  }
  return [...new Set([...(extras ?? []).map((e) => e.colaborador_id as string), ...lideresValidos])];
}

type Recado = {
  titulo: string;
  mensagem: string;
  url: string;
  referenciaId: string;
  criadoPor: string;
  importante?: boolean;
  exceto?: string | null;
};

/** Sino + push para o time da manutenção. Nunca derruba quem chamou. */
export async function avisarEquipe(revendaId: string, r: Recado) {
  try {
    const equipe = (await quemAtende(revendaId)).filter((id) => id !== r.exceto);
    if (equipe.length === 0) return;
    await Promise.all(
      equipe.map((id) =>
        criarNotificacao({
          modulo: "chamados",
          tipo: r.importante ? "importante" : "pendencia",
          titulo: r.titulo,
          mensagem: r.mensagem,
          url: r.url,
          referenciaId: r.referenciaId,
          criadoPor: r.criadoPor,
          destinatarioId: id,
          revendaId,
        }),
      ),
    );
    await enviarPushDaRevenda(revendaId, {
      modulo: "chamados",
      titulo: r.titulo,
      mensagem: r.mensagem,
      url: r.url,
      apenas: equipe,
      qualquerRevenda: true,
    });
  } catch {
    // Aviso é acessório; o chamado já está gravado.
  }
}

/**
 * Recado de quem abriu: vai para quem está cuidando; sem ninguém
 * cuidando ainda, para o time inteiro.
 */
export async function avisarQuemCuida(c: Chamado, r: Omit<Recado, "url" | "referenciaId">) {
  if (!c.responsavel_id) {
    await avisarEquipe(c.revenda_id, { ...r, url: `/chamados/${c.id}`, referenciaId: c.id });
    return;
  }
  if (c.responsavel_id === r.exceto) return;
  try {
    const url = `/chamados/${c.id}`;
    await criarNotificacao({
      modulo: "chamados",
      tipo: "pendencia",
      titulo: r.titulo,
      mensagem: r.mensagem,
      url,
      referenciaId: c.id,
      criadoPor: r.criadoPor,
      destinatarioId: c.responsavel_id,
      revendaId: c.revenda_id,
    });
    await enviarPushDaRevenda(c.revenda_id, {
      modulo: "chamados",
      titulo: r.titulo,
      mensagem: r.mensagem,
      url,
      apenas: [c.responsavel_id],
      qualquerRevenda: true,
    });
  } catch {
    // idem
  }
}

/**
 * O retorno para quem abriu (o 9.3 do DPO). Só chega a quem abriu com o
 * app -- quem abriu sem login acompanha pelo link do protocolo.
 */
export async function avisarSolicitante(c: Chamado, titulo: string, mensagem: string, autorId?: string | null) {
  if (!c.solicitante_id || c.solicitante_id === autorId) return;
  try {
    const url = `/chamados/${c.id}`;
    await criarNotificacao({
      modulo: "chamados-retorno",
      tipo: c.status === "concluido" ? "pendencia" : "atualizado",
      titulo,
      mensagem,
      url,
      referenciaId: c.id,
      destinatarioId: c.solicitante_id,
      revendaId: c.revenda_id,
    });
    await enviarPushDaRevenda(c.revenda_id, {
      modulo: "chamados-retorno",
      titulo,
      mensagem,
      url,
      apenas: [c.solicitante_id],
      qualquerRevenda: true,
    });
  } catch {
    // idem
  }
}

// ---------------------------------------------------------------------
// A confirmação de quem abriu (app e link)
// ---------------------------------------------------------------------

/**
 * "Resolveu?" -- Sim fecha de vez (com a nota); Não REABRE o chamado,
 * volta para a fila e conta como reaberto. O prazo não é refeito: se o
 * problema não foi resolvido, o atraso é real.
 */
export async function confirmarAtendimento(
  c: Chamado,
  r: { resolvido: boolean; nota: number | null; comentario: string; autorNome: string; autorId: string | null },
  admin: Admin = createAdminClient(),
): Promise<string | null> {
  if (c.status !== "concluido" || c.confirmacao) return "Este chamado não está esperando a sua confirmação.";
  const agora = new Date().toISOString();
  const comentario = r.comentario.trim().slice(0, 500);

  if (r.resolvido) {
    const nota = r.nota && r.nota >= 1 && r.nota <= 5 ? Math.round(r.nota) : null;
    const { error } = await admin
      .from("chamados")
      .update({
        confirmacao: "resolvido",
        confirmado_em: agora,
        avaliacao: nota,
        avaliacao_comentario: comentario || null,
        atualizado_em: agora,
      })
      .eq("id", c.id)
      .eq("status", "concluido")
      .is("confirmacao", null);
    if (error) return `Não foi possível registrar: ${error.message}`;
    await registrarEvento(c, { tipo: "confirmado", texto: comentario || null, autorNome: r.autorNome, autorId: r.autorId }, admin);
    if (nota) await registrarEvento(c, { tipo: "avaliado", texto: `${nota} de 5`, autorNome: r.autorNome, autorId: r.autorId }, admin);
    return null;
  }

  if (comentario.length < 3) return "Conte o que continua errado, para a manutenção saber o que olhar.";
  const { error } = await admin
    .from("chamados")
    .update({
      status: "aberto",
      concluido_em: null,
      confirmacao: null,
      confirmado_em: null,
      reaberturas: c.reaberturas + 1,
      atualizado_em: agora,
    })
    .eq("id", c.id)
    .eq("status", "concluido")
    .is("confirmacao", null);
  if (error) return `Não foi possível reabrir: ${error.message}`;
  await registrarEvento(c, { tipo: "reaberto", statusPara: "aberto", texto: comentario, autorNome: r.autorNome, autorId: r.autorId }, admin);
  await avisarEquipe(c.revenda_id, {
    titulo: `↩️ Chamado ${protocolo(c.numero)} reaberto`,
    mensagem: `${r.autorNome}: ${comentario.slice(0, 140)}`,
    url: `/chamados/${c.id}`,
    referenciaId: c.id,
    criadoPor: r.autorNome,
    importante: true,
    exceto: r.autorId,
  });
  return null;
}
