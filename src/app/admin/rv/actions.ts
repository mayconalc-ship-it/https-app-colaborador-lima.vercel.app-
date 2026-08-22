"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { AREAS } from "@/lib/areas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  baixarPlanilha,
  colaboradoresComRV,
  ETIQUETA_PLANILHA,
} from "@/lib/rv-server";
import {
  acharColunaCompetencia,
  acharColunaCpf,
  acharColunaValor,
  acharLinhaCabecalho,
  buscarLinhasDoColaborador,
  normalizarCpf,
} from "@/lib/rv";

/** Quanto tempo depois de avisar alguém o mesmo aviso volta a valer. */
const JANELA_REAVISO_MIN = 60;

function voltar(chave: "sucesso" | "erro", texto: string): never {
  redirect(`/admin/rv?${chave}=${encodeURIComponent(texto)}`);
}

/**
 * Avisa que a RV foi atualizada -- só quem TEM RV.
 *
 * É um botão, e não algo automático, porque a RV é lida ao vivo da planilha
 * do Drive: o app não tem como saber que alguém editou a planilha sem ficar
 * consultando o Google de tempos em tempos -- o que gastaria recurso o dia
 * inteiro para pegar uma mudança que acontece uma vez por mês.
 *
 * Quem sabe a hora certa é você, ao fechar a competência.
 *
 * O aviso era da REVENDA INTEIRA (uma linha com destinatário nulo, que o
 * sino mostra para todo mundo). Só que RV não é de todo mundo: quem não
 * aparece na planilha abria /rv e lia "Você não possui RV cadastrada" --
 * um aviso que só servia para frustrar, todo mês. Agora a audiência é
 * exatamente quem tem CPF na planilha desta revenda: uma linha por
 * destinatário, e o push segue a mesma lista.
 *
 * Se a planilha não abrir, ninguém é avisado e o erro aparece na tela. O
 * caminho antigo -- avisar todo mundo na dúvida -- é justamente o que
 * estamos tirando; avisar errado em silêncio seria voltar para trás.
 */
export async function avisarRVAtualizada() {
  const eu = await requireModulo("rv", "editar");
  const revendaId = await exigirRevenda("/admin/rv");

  const { ids, configurado, falhas } = await colaboradoresComRV(revendaId);

  if (!configurado) {
    voltar("erro", "Conecte a planilha de RV antes de avisar o time.");
  }
  if (falhas.length > 0 && ids.length === 0) {
    voltar(
      "erro",
      `Não consegui ler ${falhas.map((f) => f.rotulo).join(" e ")} (${falhas[0].motivo}). Ninguém foi avisado.`,
    );
  }
  if (ids.length === 0) {
    voltar(
      "erro",
      "Nenhum colaborador cadastrado tem CPF nessa planilha. Ninguém foi avisado.",
    );
  }

  // Quem já recebeu este aviso há pouco não recebe de novo. Sem isto, dois
  // toques no botão (ou uma correção na planilha logo em seguida) viravam
  // dois avisos idênticos no sino da mesma pessoa.
  const admin = createAdminClient();
  const desde = new Date();
  desde.setMinutes(desde.getMinutes() - JANELA_REAVISO_MIN);

  const { data: jaAvisados } = await admin
    .from("notificacoes")
    .select("destinatario_id")
    .eq("revenda_id", revendaId)
    .eq("modulo", "rv")
    .eq("ativa", true)
    .gte("criado_em", desde.toISOString())
    .in("destinatario_id", ids);

  const repetidos = new Set(
    (jaAvisados ?? []).map((n) => n.destinatario_id as string),
  );
  const alvo = ids.filter((id) => !repetidos.has(id));

  if (alvo.length === 0) {
    voltar(
      "sucesso",
      `Todos os ${ids.length} colaboradores com RV já foram avisados na última hora.`,
    );
  }

  const titulo = "Sua RV foi atualizada!";
  const mensagem = "Já conferiu sua remuneração variável?";

  await Promise.all(
    alvo.map((colaboradorId) =>
      criarNotificacao({
        modulo: "rv",
        tipo: "atualizado",
        titulo,
        mensagem,
        url: "/rv",
        criadoPor: eu.id,
        revendaId,
        destinatarioId: colaboradorId,
      }),
    ),
  );

  await enviarPushDaRevenda(revendaId, {
    modulo: "rv",
    titulo,
    mensagem,
    url: "/rv",
    apenas: alvo,
  });

  const aviso =
    falhas.length > 0
      ? ` (${falhas.map((f) => f.rotulo).join(" e ")} não abriu — pode faltar gente)`
      : "";

  voltar(
    "sucesso",
    `${alvo.length} colaborador(es) com RV avisado(s)${aviso}.`,
  );
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
  const revendaId = await exigirRevenda("/admin/rv");

  // Upsert porque numa revenda nova a linha da área ainda não existe: um
  // update simples não gravaria nada e a tela diria "salvo" sem ter salvo.
  const { error } = await admin.from("rv_config").upsert(
    {
      revenda_id: revendaId,
      area,
      rotulo: AREAS.find((a) => a.id === area)?.rotulo ?? area,
      csv_url: csvUrl || null,
      coluna_cpf: colunaCpf || null,
      coluna_valor: colunaValor || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,area" },
  );

  if (error) {
    redirect(`/admin/rv?erro=${encodeURIComponent(error.message)}`);
  }

  // A planilha baixada fica em cache por 5 minutos (ver rv-server). Trocar
  // o link e ter de esperar esses minutos para conferir seria armadilha.
  //
  // updateTag e nao revalidateTag: o revalidateTag marca como velho e serve
  // a copia antiga enquanto busca a nova por tras -- quem acabou de salvar
  // veria o link antigo mais uma vez. O updateTag expira na hora e faz a
  // proxima visita esperar o dado novo, que e o que se quer depois de
  // mexer na configuracao.
  updateTag(ETIQUETA_PLANILHA);
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
    .eq("revenda_id", await exigirRevenda("/admin/rv"))
    .eq("area", area)
    .maybeSingle();

  if (!config?.csv_url) {
    redirect("/admin/rv?erro=Cadastre+o+link+antes+de+testar");
  }

  let resultado: string;

  try {
    const linhas = await baixarPlanilha(config.csv_url, { aoVivo: true });

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
