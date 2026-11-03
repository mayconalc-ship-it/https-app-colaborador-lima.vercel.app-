"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_POR_ENVIO,
  codigoDoPdv,
  dataDeEntregaValida,
  dataCurta,
  hojeEmSaoPaulo,
  motivoLimpo,
  problemaDoItem,
} from "@/lib/prioridades";
import {
  PrioridadesNaoInstalado,
  conferir,
  nomesDosPdvs,
  procurarPdvsPorCodigo,
  resolverToken,
} from "@/lib/prioridades-server";
import type { PdvAchado } from "@/lib/prioridades";

/**
 * AS AÇÕES DO LINK DOS GVs -- abertas, sem login, como o QR do chamado.
 *
 * Tudo é conferido aqui, nunca na tela: o token (resolvido de novo a cada
 * chamada), o GV (tem de estar na lista da revenda), a data, cada código
 * e cada motivo. E dois freios contra abuso, fora do caminho de quem usa
 * de verdade: a armadilha de robô e o teto de prioridades por revenda em
 * 10 minutos.
 */

/** Mais que isto em 10 minutos, numa revenda só, não é a lista dos GVs. */
const TETO_EM_10_MIN = 400;

const EM_MANUTENCAO = "O envio de prioridades está em manutenção. A sua lista continua guardada neste aparelho: tente mais tarde.";

/** Quantos PDVs a lista debaixo do campo mostra. */
const ACHADOS_MAX = 8;

export type PdvsAchados = { ok: true; achados: PdvAchado[] } | { ok: false; erro: string };

/**
 * Os PDVs que começam com o código digitado, com nome e cidade -- para o
 * GV tocar no certo, ou ver na hora que errou um número.
 */
export async function buscarPdvs(token: string, cod: string): Promise<PdvsAchados> {
  try {
    const alvo = await resolverToken(token);
    if (!alvo) return { ok: false, erro: "Este link não vale mais. Peça o novo à logística." };
    const codigo = codigoDoPdv(cod);
    if (!codigo || codigo.length < 2) return { ok: true, achados: [] };
    return { ok: true, achados: await procurarPdvsPorCodigo(alvo.revendaId, codigo, ACHADOS_MAX) };
  } catch (e) {
    if (e instanceof PrioridadesNaoInstalado) return { ok: false, erro: EM_MANUTENCAO };
    throw e;
  }
}

export type Envio = {
  token: string;
  gv: string;
  data: string;
  itens: { cod: string; motivo: string }[];
  /** A armadilha de robô: campo invisível que só script preenche. */
  empresa?: string;
};

export type ResultadoDoEnvio =
  | {
      ok: true;
      mensagem: string;
      /** Os códigos que entraram agora. */
      gravadas: string[];
      /** Os que já estavam na lista do dia (de outro envio, talvez de outro GV). */
      jaEstavam: { cod: string; gv: string }[];
    }
  | { ok: false; erro: string };

export async function enviarPrioridades(envio: Envio): Promise<ResultadoDoEnvio> {
  try {
    const itens = Array.isArray(envio?.itens) ? envio.itens : [];
    if (envio?.empresa) return { ok: true, mensagem: "Prioridades enviadas.", gravadas: itens.map((i) => String(i.cod)), jaEstavam: [] };

    const alvo = await resolverToken(envio?.token ?? "");
    if (!alvo) return { ok: false, erro: "Este link não vale mais. Peça o novo à logística. A sua lista continua guardada neste aparelho." };

    const gv = alvo.gvs.find((g) => g.nome === envio.gv);
    if (!gv) return { ok: false, erro: "Escolha o seu nome na lista de GVs." };

    const hoje = hojeEmSaoPaulo();
    if (!dataDeEntregaValida(envio.data, hoje)) return { ok: false, erro: "Escolha a data de entrega (de hoje até duas semanas à frente)." };

    if (itens.length === 0) return { ok: false, erro: "Inclua pelo menos uma prioridade antes de enviar." };
    if (itens.length > MAX_POR_ENVIO) return { ok: false, erro: `Envie no máximo ${MAX_POR_ENVIO} de uma vez.` };

    const limpos = new Map<string, string>();
    for (const i of itens) {
      const problema = problemaDoItem(i.cod, i.motivo);
      if (problema) return { ok: false, erro: `PDV ${String(i.cod)}: ${problema}` };
      limpos.set(codigoDoPdv(i.cod)!, motivoLimpo(i.motivo));
    }

    const admin = createAdminClient();
    const dezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: eConta } = await admin
      .from("prioridades")
      .select("id", { count: "exact", head: true })
      .eq("revenda_id", alvo.revendaId)
      .gte("enviado_em", dezMinutos);
    conferir(eConta);
    if ((count ?? 0) + limpos.size > TETO_EM_10_MIN) {
      return { ok: false, erro: "Muitas prioridades de uma vez. Espere alguns minutos e envie de novo: a lista continua guardada." };
    }

    const codigos = [...limpos.keys()];
    const { data: existentes, error: eExist } = await admin
      .from("prioridades")
      .select("cod_pdv, gv_nome")
      .eq("revenda_id", alvo.revendaId)
      .eq("data_entrega", envio.data)
      .in("cod_pdv", codigos);
    conferir(eExist);
    const jaEstavam = (existentes ?? []).map((e) => ({ cod: e.cod_pdv as string, gv: e.gv_nome as string }));
    const ja = new Set(jaEstavam.map((e) => e.cod));

    const novos = codigos.filter((c) => !ja.has(c));
    const nomes = await nomesDosPdvs(alvo.revendaId, novos, admin);
    const lote = crypto.randomUUID();
    const gravadas: string[] = [];
    if (novos.length) {
      // ignoreDuplicates: se outro GV mandou o mesmo PDV entre a conferência
      // acima e este insert, a linha dele fica e a deste envio não duplica.
      const { data: inseridas, error } = await admin
        .from("prioridades")
        .upsert(
          novos.map((cod) => ({
            revenda_id: alvo.revendaId,
            data_entrega: envio.data,
            cod_pdv: cod,
            nome_pdv: nomes.get(cod)?.nome ?? null,
            motivo: limpos.get(cod)!,
            gv_codigo: gv.codigo,
            gv_nome: gv.nome,
            lote,
          })),
          { onConflict: "revenda_id,data_entrega,cod_pdv", ignoreDuplicates: true },
        )
        .select("cod_pdv");
      conferir(error);
      for (const l of inseridas ?? []) gravadas.push(l.cod_pdv as string);
    }

    revalidatePath("/gestao/prioridades");
    const dia = dataCurta(envio.data);
    const partes = [
      gravadas.length ? `${gravadas.length} ${gravadas.length === 1 ? "prioridade enviada" : "prioridades enviadas"} para ${dia}.` : "",
      jaEstavam.length ? `${jaEstavam.length} já ${jaEstavam.length === 1 ? "estava" : "estavam"} na lista desse dia.` : "",
    ].filter(Boolean);
    return { ok: true, mensagem: partes.join(" ") || "Nada novo para enviar.", gravadas, jaEstavam };
  } catch (e) {
    if (e instanceof PrioridadesNaoInstalado) return { ok: false, erro: EM_MANUTENCAO };
    throw e;
  }
}

export type Enviada = { cod: string; nome: string | null; motivo: string; enviadoEm: string };

/** O que este GV já enviou para o dia -- a prova de que chegou. */
export async function enviadasDoGv(token: string, gvNome: string, data: string): Promise<Enviada[] | null> {
  try {
    const alvo = await resolverToken(token);
    if (!alvo || !alvo.gvs.some((g) => g.nome === gvNome)) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
    const { data: linhas, error } = await createAdminClient()
      .from("prioridades")
      .select("cod_pdv, nome_pdv, motivo, enviado_em")
      .eq("revenda_id", alvo.revendaId)
      .eq("data_entrega", data)
      .eq("gv_nome", gvNome)
      .order("enviado_em", { ascending: false })
      .limit(500);
    conferir(error);
    return (linhas ?? []).map((l) => ({
      cod: l.cod_pdv as string,
      nome: (l.nome_pdv as string | null) ?? null,
      motivo: l.motivo as string,
      enviadoEm: l.enviado_em as string,
    }));
  } catch (e) {
    if (e instanceof PrioridadesNaoInstalado) return null;
    throw e;
  }
}
