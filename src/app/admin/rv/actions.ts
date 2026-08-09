"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { baixarPlanilha } from "@/lib/rv-server";
import {
  acharColunaCompetencia,
  acharColunaCpf,
  acharColunaValor,
  acharLinhaCabecalho,
  buscarLinhasDoColaborador,
  normalizarCpf,
} from "@/lib/rv";

/**
 * Avisa o time de que a RV foi atualizada.
 *
 * É um botão, e não algo automático, porque a RV é lida ao vivo da planilha
 * do Drive: o app não tem como saber que alguém editou a planilha sem ficar
 * consultando o Google de tempos em tempos -- o que gastaria recurso o dia
 * inteiro para pegar uma mudança que acontece uma vez por mês.
 *
 * Quem sabe a hora certa é você, ao fechar a competência.
 */
export async function avisarRVAtualizada() {
  const eu = await requireModulo("rv", "editar");

  await criarOuAgrupar({
    modulo: "rv",
    tipo: "atualizado",
    titulo: "Sua RV foi atualizada!",
    mensagem: "Já conferiu sua remuneração variável?",
    url: "/rv",
    criadoPor: eu.id,
  });

  redirect("/admin/rv?sucesso=Time+avisado+sobre+a+RV");
}

export async function salvarConfigRV(formData: FormData) {
  await requireModulo("rv", "editar");

  const area = formData.get("area") as string;
  const csvUrl = ((formData.get("csv_url") as string) || "").trim();
  const colunaCpf = ((formData.get("coluna_cpf") as string) || "").trim();
  const colunaValor = ((formData.get("coluna_valor") as string) || "").trim();

  if (area !== "DU" && area !== "AL") {
    redirect("/admin/rv?erro=Área+inválida");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("rv_config")
    .update({
      csv_url: csvUrl || null,
      coluna_cpf: colunaCpf || null,
      coluna_valor: colunaValor || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("area", area);

  if (error) {
    redirect(`/admin/rv?erro=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/rv");
  redirect("/admin/rv?sucesso=Link+salvo");
}

export async function testarConexaoRV(formData: FormData) {
  await requireModulo("rv", "ver");

  const area = formData.get("area") as string;
  const cpfTeste = normalizarCpf((formData.get("cpf_teste") as string) || "");
  const admin = createAdminClient();

  const { data: config } = await admin
    .from("rv_config")
    .select("rotulo, csv_url, coluna_cpf, coluna_valor")
    .eq("area", area)
    .maybeSingle();

  if (!config?.csv_url) {
    redirect("/admin/rv?erro=Cadastre+o+link+antes+de+testar");
  }

  let resultado: string;

  try {
    const linhas = await baixarPlanilha(config.csv_url);

    if (linhas.length < 2) {
      resultado = `⚠️ ${config.rotulo}: consegui abrir, mas a planilha parece vazia.`;
    } else {
      const iCabecalho = acharLinhaCabecalho(linhas);
      const cabecalho = linhas[iCabecalho];
      const corpo = linhas.slice(iCabecalho + 1);

      const idxCpf = acharColunaCpf(cabecalho, corpo, config.coluna_cpf);
      const idxValor = acharColunaValor(cabecalho, config.coluna_valor);
      const idxMes = acharColunaCompetencia(cabecalho);

      if (idxCpf === -1) {
        resultado = `⚠️ ${config.rotulo}: li ${corpo.length} linha(s), mas não achei a coluna de CPF. Colunas encontradas: ${cabecalho.filter(Boolean).join(", ")}`;
      } else {
        const partes = [
          `✅ ${config.rotulo}: ${corpo.length} linha(s) lidas`,
          `CPF na coluna "${cabecalho[idxCpf]}"`,
          idxValor !== -1
            ? `valor na coluna "${cabecalho[idxValor]}"`
            : "coluna de valor não identificada",
          idxMes !== -1
            ? `mês na coluna "${cabecalho[idxMes]}"`
            : "sem coluna de mês (vai mostrar tudo junto)",
        ];

        if (cpfTeste) {
          const { linhas: achadas } = buscarLinhasDoColaborador(
            linhas,
            cpfTeste,
            config.coluna_cpf,
            config.coluna_valor,
          );
          partes.push(
            achadas.length > 0
              ? `CPF ${cpfTeste}: ${achadas.length} linha(s) — total ${achadas[0].valor ?? "(sem valor)"}`
              : `CPF ${cpfTeste}: NÃO encontrado nesta planilha`,
          );
        }

        resultado = partes.join(" · ");
      }
    }
  } catch (e) {
    resultado = `❌ ${config.rotulo}: ${(e as Error).message}`;
  }

  redirect(`/admin/rv?teste=${encodeURIComponent(resultado)}`);
}
