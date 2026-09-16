"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { avisarMaterialDeApoio } from "@/lib/material-apoio-server";
import {
  LIMITES,
  MODULO_MATERIAL_APOIO,
  consumoDiario,
  lerNumero,
  validarQuantidade,
} from "@/lib/material-apoio";

const ROTA = "/material-de-apoio";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

/**
 * A CONCILIAÇÃO: todos os produtos contados de uma vez, num Salvar só.
 *
 * Produto em branco não entra -- dá para contar só o que acabou de chegar.
 * Mas pelo menos um. Contar exige o módulo liberado: quem só recebe o
 * alerta enxerga a tela, não lança contagem.
 */
export async function registrarContagem(formData: FormData) {
  const perfil = await requireAcessoModulo(MODULO_MATERIAL_APOIO, ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const admin = createAdminClient();
  const { data: produtos } = await admin
    .from("ma_produtos")
    .select("id, nome, linear_quantidade, linear_periodo")
    .eq("revenda_id", revendaId)
    .eq("ativo", true);

  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, LIMITES.observacaoMax) || null;
  const lote = randomUUID();
  const agora = new Date().toISOString();
  const linhas = [];

  // Os produtos vêm do BANCO, nunca do formulário: um id inventado ou de
  // outra revenda simplesmente não é lido.
  for (const p of produtos ?? []) {
    const quantidade = lerNumero(formData.get(`qtd_${p.id}`));
    const problema = validarQuantidade(quantidade);
    if (problema) voltar("erro", `${p.nome}: ${problema}`);
    if (quantidade == null) continue;
    linhas.push({
      revenda_id: revendaId,
      lote_id: lote,
      produto_id: p.id,
      quantidade,
      consumo_diario: consumoDiario(Number(p.linear_quantidade), String(p.linear_periodo)),
      contado_em: agora,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      observacao,
    });
  }

  if (linhas.length === 0) voltar("erro", "Informe a quantidade de pelo menos um produto.");

  const { error } = await admin.from("ma_contagens").insert(linhas);
  if (error) voltar("erro", `Não foi possível registrar: ${error.message}`);

  const alertas = await avisarMaterialDeApoio(revendaId);

  revalidatePath(ROTA);
  revalidatePath("/admin/material-de-apoio");
  voltar(
    "sucesso",
    `Contagem registrada (${linhas.length} produto${linhas.length === 1 ? "" : "s"}).` +
      (alertas > 0 ? ` ${alertas} alerta${alertas === 1 ? "" : "s"} de compra enviado${alertas === 1 ? "" : "s"}.` : ""),
  );
}
