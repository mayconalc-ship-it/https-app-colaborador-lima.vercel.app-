"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { deuCerto, noLugar, pararComErro } from "@/lib/resultado-acao";
import {
  ChamadosNaoInstalado,
  abrirChamado,
  confirmarAtendimento,
  fotosDoFormulario,
  lerChamadoPorCodigo,
  lerLocais,
  resolverCodigo,
} from "@/lib/chamados-server";
import { problemaDaAbertura, protocolo, type Prioridade, type Tipo } from "@/lib/chamados";

/**
 * AS AÇÕES DA PÁGINA DO QR -- abertas, sem login, como o Forms.
 *
 * Tudo é conferido aqui, nunca na tela: o formulário é público. A trava é
 * o código do QR (resolvido de novo a cada envio) e três freios contra
 * abuso, nenhum deles no caminho de quem abre um chamado de verdade:
 *   - a armadilha de robô (campo invisível que só script preenche);
 *   - o teto de chamados pelo QR por revenda em 10 minutos;
 *   - a duplicata (mesmo texto na mesma área em 30 min devolve o mesmo
 *     chamado -- ver abrirChamado).
 */

/** Mais que isto em 10 minutos, numa revenda só, não é gente: é abuso. */
const TETO_EM_10_MIN = 20;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

export async function abrirPeloQr(fd: FormData) {
  return noLugar(async () => {
    try {
      // Robô preencheu o campo invisível: responde como se tivesse dado
      // certo, para ele não aprender a contornar.
      if (texto(fd, "empresa")) return deuCerto("Chamado enviado.");

      const alvo = await resolverCodigo(texto(fd, "codigo"));
      if (!alvo) pararComErro("Este QR Code não vale mais. Avise a manutenção ou abra pelo app.");

      const entrada = {
        localId: texto(fd, "local_id"),
        tipo: texto(fd, "tipo"),
        prioridade: texto(fd, "prioridade"),
        descricao: texto(fd, "descricao"),
        nome: texto(fd, "nome"),
        telefone: texto(fd, "telefone"),
      };
      const problema = problemaDaAbertura(entrada);
      if (problema) pararComErro(problema);

      const local = (await lerLocais(alvo.revendaId)).find((l) => l.id === entrada.localId);
      if (!local) pararComErro("Essa área não está mais na lista. Escolha outra.");

      const admin = createAdminClient();
      const dezMinutos = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("chamados")
        .select("id", { count: "exact", head: true })
        .eq("revenda_id", alvo.revendaId)
        .eq("origem", "qr")
        .gte("aberto_em", dezMinutos);
      if ((count ?? 0) >= TETO_EM_10_MIN) {
        pararComErro("Muitos chamados de uma vez. Espere alguns minutos e tente de novo.");
      }

      // Com o app logado no celular, o chamado fica sendo DELE: aparece em
      // "Meus chamados" e o andamento chega no sino. O nome continua o
      // digitado -- quem escaneia pode estar pedindo por um colega.
      const perfil = await getPerfil();

      const r = await abrirChamado({
        revendaId: alvo.revendaId,
        local,
        tipo: entrada.tipo as Tipo,
        prioridade: entrada.prioridade as Prioridade,
        descricao: entrada.descricao,
        nome: entrada.nome,
        telefone: entrada.telefone,
        solicitanteId: perfil?.id ?? null,
        origem: "qr",
        fotos: fotosDoFormulario(fd),
      });

      revalidatePath("/chamados");
      revalidatePath("/gestao/chamados");
      return deuCerto(
        r.repetido ? `Esse pedido já estava aberto: chamado ${protocolo(r.numero)}.` : `Chamado ${protocolo(r.numero)} aberto!`,
        `/os/acompanhar/${r.codigo}${r.repetido ? "" : "?novo=1"}`,
      );
    } catch (e) {
      if (e instanceof ChamadosNaoInstalado) pararComErro("O sistema de chamados está em manutenção. Tente mais tarde.");
      throw e;
    }
  });
}

/** "Resolveu?" pelo link de acompanhamento. Quem tem o link é quem abriu. */
export async function confirmarPeloLink(fd: FormData) {
  return noLugar(async () => {
    const c = await lerChamadoPorCodigo(texto(fd, "codigo"));
    if (!c) pararComErro("Chamado não encontrado.");
    const resolvido = texto(fd, "resposta") === "sim";
    const erro = await confirmarAtendimento(c, {
      resolvido,
      nota: Number(texto(fd, "nota")) || null,
      comentario: texto(fd, "comentario"),
      autorNome: c.solicitante_nome,
      autorId: null,
    });
    if (erro) pararComErro(erro);
    revalidatePath(`/os/acompanhar/${c.codigo}`);
    revalidatePath("/chamados");
    revalidatePath("/gestao/chamados");
    return deuCerto(resolvido ? "Obrigado! Chamado encerrado." : "Chamado reaberto. A manutenção foi avisada.");
  });
}
