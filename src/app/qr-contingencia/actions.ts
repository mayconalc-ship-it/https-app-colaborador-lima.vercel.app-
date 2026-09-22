"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import {
  buscarNaBaseDeClientes,
  rotaComClientes,
  type ClienteDaRota,
} from "@/lib/clientes-do-mapa-server";
import {
  apagarDoBucket,
  comprovantesDeHojeDaEquipe,
  guardarNoBucket,
  hojeNaOperacao,
  paraTelaDoCelular,
  podeConferirComprovantes,
} from "@/lib/qr-contingencia-server";
import { normalizarMapa } from "@/lib/rotas";
import {
  LIMITES_QR,
  MODULO_QR,
  NF_OBRIGATORIA_DESDE,
  codigoDigitado,
  ehEnvioId,
  horaDoPagamento,
  lerNotas,
  lerValor,
  validarComprovante,
  validarConferencia,
  type SituacaoConferencia,
} from "@/lib/qr-contingencia";

const ROTA = "/qr-contingencia";

/** Quem está pedindo, e onde -- ou o motivo de não poder. */
async function contexto(): Promise<
  { ok: true; perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>; revendaId: string } | { ok: false; erro: string }
> {
  const [perfil, revendaId, acesso] = await Promise.all([getPerfil(), getRevendaId(), temAcessoModulo(MODULO_QR)]);
  if (!perfil) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };
  if (!acesso) return { ok: false, erro: "Você não tem acesso ao Comprovante de Pagamento. Fale com a liderança." };
  return { ok: true, perfil, revendaId };
}

/** Cliente do mapa que já tem comprovante: código e valor somado. */
export type PagoNoMapa = { codPdv: string; valor: number };

export type ResultadoMapa =
  | { ok: true; mapa: string; data: string; clientes: ClienteDaRota[]; pagos: PagoNoMapa[] }
  | { ok: false; erro: string };

/**
 * O mapa digitado -> os clientes dele, como na pré-rota, e QUAIS já pagaram
 * pelo QR (pedido do dono, 18/09/2026: "deixe uma marcação como se aquele
 * PDV já foi feito o pagamento"). Vale o comprovante de qualquer motorista
 * deste mapa, desde o dia da rota -- dois motoristas no mesmo mapa não
 * cobram o mesmo cliente duas vezes.
 */
export async function buscarClientesDoMapa(mapaDigitado: string): Promise<ResultadoMapa> {
  const c = await contexto();
  if (!c.ok) return c;
  if (!normalizarMapa(mapaDigitado)) return { ok: false, erro: "Informe o número do mapa." };
  const rota = await rotaComClientes(c.revendaId, mapaDigitado);
  if (!rota) return { ok: false, erro: "Não encontramos este mapa. Confira o número ou procure o cliente pelo nome." };

  const { data: feitos } = await createAdminClient()
    .from("qr_comprovantes")
    .select("cod_pdv, valor")
    .eq("revenda_id", c.revendaId)
    .eq("mapa", rota.mapa)
    .gte("data", rota.data);
  const porCliente = new Map<string, number>();
  for (const f of feitos ?? []) {
    porCliente.set(String(f.cod_pdv), (porCliente.get(String(f.cod_pdv)) ?? 0) + Number(f.valor ?? 0));
  }
  return { ok: true, ...rota, pagos: [...porCliente].map(([codPdv, valor]) => ({ codPdv, valor })) };
}

/**
 * Os comprovantes de hoje da EQUIPE do mapa buscado (motorista e ajudante
 * veem os mesmos), somados aos da própria pessoa.
 */
export async function comprovantesDeHojeComOMapa(mapaDigitado: string) {
  const c = await contexto();
  if (!c.ok) return [];
  const mapa = normalizarMapa(mapaDigitado);
  const lista = await comprovantesDeHojeDaEquipe(c.revendaId, c.perfil.id, mapa ? [mapa] : []);
  return lista.map((x) => paraTelaDoCelular(x, c.perfil.id));
}

/** Busca na base inteira -- para cliente fora do mapa ou mapa sem lista. */
export async function buscarClientesNaBase(termo: string): Promise<ClienteDaRota[]> {
  const c = await contexto();
  if (!c.ok) return [];
  if (termo.trim().length < LIMITES_QR.buscaMin) return [];
  return buscarNaBaseDeClientes(c.revendaId, termo);
}

/**
 * `definitivo`: o problema é do comprovante (sem foto, valor torto) e
 * tentar de novo não resolve. Sem ele, a fila do celular tenta outra vez
 * mais tarde (sessão expirada, falha do servidor).
 */
export type ResultadoEnvio = { ok: true; mensagem: string } | { ok: false; erro: string; definitivo?: boolean };

/**
 * REGISTRA O COMPROVANTE: cliente + fotos (obrigatório) + valor e
 * observação (opcionais), num envio só.
 *
 * As mesmas travas da tela, de novo aqui (validarComprovante). O nome do
 * cliente vem da BASE, não do formulário: o formulário é do navegador, e
 * o comprovante é o que o financeiro vai conferir.
 *
 * As fotos sobem primeiro; o comprovante só nasce se todas subiram. Se a
 * gravação falhar depois, as fotos já enviadas são apagadas -- não sobra
 * foto órfã nem comprovante sem foto.
 */
export async function registrarComprovante(formData: FormData): Promise<ResultadoEnvio> {
  const c = await contexto();
  if (!c.ok) return c;
  const { perfil, revendaId } = c;

  const codPdv = codigoDigitado(String(formData.get("cod_pdv") ?? ""));
  const mapa = normalizarMapa(String(formData.get("mapa") ?? "")) || null;
  // Modo sem internet: o celular manda um id próprio e a hora em que o
  // comprovante foi feito na frente do cliente.
  const envioBruto = formData.get("envio_id");
  const envioId = ehEnvioId(envioBruto) ? envioBruto : null;
  const pagoEm = horaDoPagamento(formData.get("pago_em"));
  const valor = lerValor(formData.get("valor"));
  const observacao = String(formData.get("observacao") ?? "").trim();
  const notas = lerNotas(formData.getAll("nf"));
  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);

  const problema = validarComprovante({
    codPdv,
    valor,
    observacao,
    fotos: fotos.map((f) => ({ tamanho: f.size, tipo: f.type })),
    notas,
    // NF obrigatória -- menos para o comprovante feito antes da regra e que
    // esperava sinal na fila do celular.
    exigirNf: pagoEm.getTime() >= new Date(NF_OBRIGATORIA_DESDE).getTime(),
  });
  if (problema) return { ok: false, erro: problema, definitivo: true };

  const admin = createAdminClient();

  // O MESMO ENVIO DE NOVO -- o sinal caiu depois de o servidor gravar e
  // antes de a resposta chegar ao celular, que tentou outra vez. Responde
  // "ok" sem gravar nada: para o motorista, o comprovante está lá.
  if (envioId) {
    const { data: jaTem } = await admin.from("qr_comprovantes").select("id").eq("envio_id", envioId).maybeSingle();
    if (jaTem) return { ok: true, mensagem: "Comprovante já estava registrado." };
  }

  const { data: cliente } = await admin
    .from("pa_pdv_clientes")
    .select("nome, fantasia, cidade")
    .eq("revenda_id", revendaId)
    .eq("cod_pdv", codPdv)
    .maybeSingle();
  const nomeInformado = String(formData.get("cliente_nome") ?? "").trim().slice(0, 160) || null;
  const clienteNome = (cliente?.fantasia || cliente?.nome || nomeInformado || null)?.trim().slice(0, 160) ?? null;
  const clienteCidade = (cliente?.cidade ?? null)?.trim().slice(0, 80) || null;

  const dia = hojeNaOperacao(pagoEm);
  const pasta = `${revendaId}/${dia}/${codPdv}`;
  const caminhos: string[] = [];
  for (const f of fotos) {
    const r = await guardarNoBucket(f, pasta);
    if (!r.ok) {
      await apagarDoBucket(caminhos);
      return { ok: false, erro: r.erro };
    }
    caminhos.push(r.caminho);
  }

  const { data: gravado, error } = await admin
    .from("qr_comprovantes")
    .insert({
      revenda_id: revendaId,
      data: dia,
      mapa,
      cod_pdv: codPdv,
      cliente_nome: clienteNome,
      cliente_cidade: clienteCidade,
      valor: valor ?? null,
      observacao: observacao || null,
      notas_fiscais: notas,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      envio_id: envioId,
      pago_em: pagoEm.toISOString(),
    })
    .select("id")
    .single();
  if (error || !gravado) {
    await apagarDoBucket(caminhos);
    // Duas tentativas do mesmo envio chegando juntas: a outra gravou.
    if (error?.code === "23505" && envioId) return { ok: true, mensagem: "Comprovante já estava registrado." };
    return { ok: false, erro: `Não foi possível registrar: ${error?.message ?? "resposta vazia"}` };
  }

  const { error: erroFotos } = await admin
    .from("qr_comprovante_fotos")
    .insert(caminhos.map((caminho) => ({ comprovante_id: gravado.id, revenda_id: revendaId, caminho })));
  if (erroFotos) {
    await admin.from("qr_comprovantes").delete().eq("id", gravado.id);
    await apagarDoBucket(caminhos);
    return { ok: false, erro: `Não foi possível guardar as fotos: ${erroFotos.message}` };
  }

  revalidatePath(ROTA);
  revalidatePath("/gestao/comprovantes-qr");
  return {
    ok: true,
    mensagem: `Comprovante de ${clienteNome ?? `cliente ${codPdv}`} registrado com ${caminhos.length} foto${
      caminhos.length === 1 ? "" : "s"
    }.`,
  };
}

/**
 * EDITAR VALOR E FOTOS (pedido do dono, 19/09/2026: na tela do motorista,
 * "Editar" no lugar de "Apagar"). Só o próprio comprovante, no MESMO dia --
 * depois disso ele já é do financeiro. Cliente, mapa e observação não mudam;
 * as NFs, sim (21/09/2026).
 *
 * As mesmas travas do registro (validarComprovante): valor obrigatório e
 * pelo menos uma foto no fim. As novas sobem antes; as retiradas só saem
 * do banco e do bucket depois que o resto gravou.
 */
export async function editarComprovante(formData: FormData): Promise<ResultadoEnvio> {
  const c = await contexto();
  if (!c.ok) return c;
  const id = String(formData.get("id") ?? "");
  const valor = lerValor(formData.get("valor"));
  const remover = new Set(formData.getAll("remover").map(String));
  const novas = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  // A tela manda a lista INTEIRA de NFs como deve ficar (21/09/2026).
  const notas = lerNotas(formData.getAll("nf"));

  const admin = createAdminClient();
  const { data: comp } = await admin
    .from("qr_comprovantes")
    .select("id, colaborador_id, data, mapa, cod_pdv, observacao, valor, notas_fiscais, pago_em, criado_em")
    .eq("id", id)
    .eq("revenda_id", c.revendaId)
    .maybeSingle();
  if (!comp) return { ok: false, erro: "Comprovante não encontrado.", definitivo: true };
  // O mapa é da EQUIPE (motorista e ajudante): quem está nele corrige o
  // comprovante do colega -- e a edição fica registrada com o nome de quem
  // corrigiu. Sem mapa, só quem lançou.
  const daEquipe = comp.colaborador_id === c.perfil.id || Boolean(comp.mapa);
  if (!daEquipe || comp.data !== hojeNaOperacao()) {
    return { ok: false, erro: "Só dá para editar comprovante do seu mapa, no mesmo dia.", definitivo: true };
  }

  const { data: atuais } = await admin.from("qr_comprovante_fotos").select("id, caminho").eq("comprovante_id", id);
  const saindo = (atuais ?? []).filter((f) => remover.has(String(f.id)));
  const ficam = (atuais ?? []).length - saindo.length;

  const problema = validarComprovante({
    codPdv: String(comp.cod_pdv),
    valor,
    observacao: String(comp.observacao ?? ""),
    // As que ficam já passaram pela checagem quando subiram; contam só no número.
    fotos: [
      ...Array.from({ length: ficam }, () => ({ tamanho: 1, tipo: "" })),
      ...novas.map((f) => ({ tamanho: f.size, tipo: f.type })),
    ],
    notas,
    // Comprovante feito antes da NF obrigatória: corrige sem ela.
    exigirNf:
      new Date(String(comp.pago_em ?? comp.criado_em)).getTime() >= new Date(NF_OBRIGATORIA_DESDE).getTime(),
  });
  if (problema) return { ok: false, erro: problema, definitivo: true };
  const notasAntes: string[] = Array.isArray(comp.notas_fiscais) ? comp.notas_fiscais.map(String) : [];

  const pasta = `${c.revendaId}/${comp.data}/${comp.cod_pdv}`;
  const caminhos: string[] = [];
  for (const f of novas) {
    const r = await guardarNoBucket(f, pasta);
    if (!r.ok) {
      await apagarDoBucket(caminhos);
      return { ok: false, erro: r.erro };
    }
    caminhos.push(r.caminho);
  }
  let novasIds: string[] = [];
  if (caminhos.length > 0) {
    const { data: gravadas, error } = await admin
      .from("qr_comprovante_fotos")
      .insert(caminhos.map((caminho) => ({ comprovante_id: id, revenda_id: c.revendaId, caminho })))
      .select("id");
    if (error) {
      await apagarDoBucket(caminhos);
      return { ok: false, erro: `Não foi possível guardar as fotos: ${error.message}` };
    }
    novasIds = (gravadas ?? []).map((f) => String(f.id));
  }

  // O REGISTRO DA EDIÇÃO (migration 128) vem antes de mudar qualquer coisa:
  // sem ele, a edição não acontece -- quem concilia sempre sabe o que mudou.
  const agora = new Date().toISOString();
  const { error: erroRegistro } = await admin.from("qr_comprovante_edicoes").insert({
    comprovante_id: id,
    revenda_id: c.revendaId,
    colaborador_id: c.perfil.id,
    colaborador_nome: c.perfil.nome,
    valor_antes: comp.valor == null ? null : Number(comp.valor),
    valor_depois: valor,
    fotos_tiradas: saindo.length,
    fotos_novas: caminhos.length,
    notas_antes: notasAntes,
    notas_depois: notas,
    editado_em: agora,
  });
  if (erroRegistro) {
    if (novasIds.length > 0) await admin.from("qr_comprovante_fotos").delete().in("id", novasIds);
    await apagarDoBucket(caminhos);
    return { ok: false, erro: `Não foi possível registrar a edição: ${erroRegistro.message}` };
  }

  // Editou depois de conferido: a conferência cai -- o financeiro bateu
  // outro valor, outras fotos.
  const { error: erroValor } = await admin
    .from("qr_comprovantes")
    .update({
      valor,
      notas_fiscais: notas,
      editado_em: agora,
      conferido_em: null,
      conferido_por_nome: null,
      conferencia_situacao: null,
      valor_extrato: null,
      conferencia_obs: null,
    })
    .eq("id", id);
  if (erroValor) return { ok: false, erro: `Não foi possível salvar o valor: ${erroValor.message}` };

  if (saindo.length > 0) {
    await admin.from("qr_comprovante_fotos").delete().in("id", saindo.map((f) => f.id));
    await apagarDoBucket(saindo.map((f) => String(f.caminho)));
  }

  revalidatePath(ROTA);
  revalidatePath("/gestao/comprovantes-qr");
  return { ok: true, mensagem: "Comprovante atualizado." };
}

/**
 * A CONCILIAÇÃO DO FINANCEIRO (19/09/2026, migrations 128 e 129): marca um
 * ou vários comprovantes como CONFERIDOS (batem com o extrato), um como
 * DIVERGENTE (com o valor que caiu no banco e o motivo), ou desfaz
 * (`situacao` null). Só quem tem "editar" no módulo; a mesma regra da tela
 * (validarConferencia). Não existe "apagar" na conciliação (pedido do
 * dono): o comprovante errado o motorista corrige no mesmo dia.
 */
export async function registrarConferencia(entrada: {
  ids: string[];
  situacao: SituacaoConferencia | null;
  valorExtrato?: string;
  motivo?: string;
}): Promise<ResultadoEnvio> {
  const c = await contexto();
  if (!c.ok) return c;
  if (!(await podeConferirComprovantes())) {
    return { ok: false, erro: "Você não tem permissão para conferir comprovantes." };
  }
  const situacao =
    entrada.situacao === "conferido" || entrada.situacao === "divergente" || entrada.situacao === "desconsiderado"
      ? entrada.situacao
      : null;
  const lista = [...new Set((entrada.ids ?? []).map(String))].filter(Boolean);
  const valorExtrato = situacao === "divergente" ? lerValor(entrada.valorExtrato ?? "") : null;
  const motivo = String(entrada.motivo ?? "").trim();
  const problema = validarConferencia({ qtd: lista.length, situacao, valorExtrato, motivo });
  if (problema) return { ok: false, erro: problema };

  const agora = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("qr_comprovantes")
    .update(
      situacao
        ? {
            conferencia_situacao: situacao,
            conferido_em: agora,
            conferido_por_nome: c.perfil.nome,
            valor_extrato: situacao === "divergente" ? valorExtrato : null,
            conferencia_obs: situacao === "conferido" ? null : motivo,
          }
        : {
            conferencia_situacao: null,
            conferido_em: null,
            conferido_por_nome: null,
            valor_extrato: null,
            conferencia_obs: null,
          },
    )
    .eq("revenda_id", c.revendaId)
    .in("id", lista);
  if (error) return { ok: false, erro: `Não foi possível salvar a conciliação: ${error.message}` };

  revalidatePath("/gestao/comprovantes-qr");
  const n = lista.length;
  return {
    ok: true,
    mensagem:
      situacao === "conferido"
        ? `${n} comprovante${n === 1 ? "" : "s"} conferido${n === 1 ? "" : "s"}.`
        : situacao === "divergente"
          ? "Divergência registrada."
          : situacao === "desconsiderado"
            ? "Comprovante desconsiderado: saiu da conta do mapa."
            : "Conciliação desfeita.",
  };
}
