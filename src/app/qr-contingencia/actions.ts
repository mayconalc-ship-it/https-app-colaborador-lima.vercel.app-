"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import {
  buscarNaBaseDeClientes,
  rotaComClientes,
  type ClienteDaRota,
} from "@/lib/clientes-do-mapa-server";
import { apagarDoBucket, guardarNoBucket, hojeNaOperacao } from "@/lib/qr-contingencia-server";
import { normalizarMapa } from "@/lib/rotas";
import {
  LIMITES_QR,
  MODULO_QR,
  codigoDigitado,
  ehEnvioId,
  horaDoPagamento,
  lerValor,
  validarComprovante,
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
  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);

  const problema = validarComprovante({
    codPdv,
    valor,
    observacao,
    fotos: fotos.map((f) => ({ tamanho: f.size, tipo: f.type })),
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
 * Apagar um comprovante lançado por engano: quem lançou, no MESMO dia; ou
 * a liderança com "excluir". Depois disso ele já é do financeiro.
 */
export async function excluirComprovante(id: string): Promise<ResultadoEnvio> {
  const c = await contexto();
  if (!c.ok) return c;
  const admin = createAdminClient();
  const { data: comp } = await admin
    .from("qr_comprovantes")
    .select("id, colaborador_id, data")
    .eq("id", id)
    .eq("revenda_id", c.revendaId)
    .maybeSingle();
  if (!comp) return { ok: false, erro: "Comprovante não encontrado." };

  const meuDeHoje = comp.colaborador_id === c.perfil.id && comp.data === hojeNaOperacao();
  if (!meuDeHoje && !(await podeNoModulo(MODULO_QR, "excluir"))) {
    return { ok: false, erro: "Só dá para apagar o próprio comprovante, no mesmo dia." };
  }

  const { data: fotos } = await admin.from("qr_comprovante_fotos").select("caminho").eq("comprovante_id", id);
  const { error } = await admin.from("qr_comprovantes").delete().eq("id", id);
  if (error) return { ok: false, erro: `Não foi possível apagar: ${error.message}` };
  await apagarDoBucket((fotos ?? []).map((f) => String(f.caminho)));

  revalidatePath(ROTA);
  revalidatePath("/gestao/comprovantes-qr");
  return { ok: true, mensagem: "Comprovante apagado." };
}
