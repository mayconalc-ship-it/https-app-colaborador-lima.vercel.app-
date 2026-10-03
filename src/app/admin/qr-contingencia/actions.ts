"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { MODULO_QR, validarConfigQr } from "@/lib/qr-contingencia";
import { noLugar, pararComErro, pararComSucesso, type ResultadoAcao } from "@/lib/resultado-acao";

const ROTA = "/admin/qr-contingencia";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  return chave === "erro" ? pararComErro(mensagem) : pararComSucesso(mensagem);
}

/**
 * SALVA A CHAVE PIX DO PAGAMENTO -- favorecido, CNPJ e instruções, num
 * Salvar só. Sem QR (03/10/2026): a imagem e o copia e cola saíram do
 * cadastro; o que já estava gravado fica no banco, sem uso.
 */
export async function salvarConfigQr(formData: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const perfil = await requireModulo(MODULO_QR, "editar", ROTA);
    const revendaId = await exigirRevenda(ROTA);
    const admin = createAdminClient();

    const dados = {
      favorecido: String(formData.get("favorecido") ?? "").trim(),
      cnpj: String(formData.get("cnpj") ?? "").trim(),
      instrucoes: String(formData.get("instrucoes") ?? "").trim(),
    };
    const problema = validarConfigQr(dados);
    if (problema) voltar("erro", problema);

    const { error } = await admin.from("qr_contingencia_config").upsert({
      revenda_id: revendaId,
      favorecido: dados.favorecido || null,
      cnpj: dados.cnpj.replace(/\D/g, "") || null,
      instrucoes: dados.instrucoes || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por_nome: perfil.nome,
    });
    if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);

    revalidatePath(ROTA);
    revalidatePath("/qr-contingencia");
    voltar("sucesso", "Chave PIX salva. Os motoristas já veem a versão nova.");
  });
}
