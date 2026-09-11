"use server";

import { tipoDoLink } from "@/lib/fontes-de-dados";

import { redirect } from "next/navigation";
import { voltarCom } from "@/lib/url-de-volta";
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

function voltar(chave: "sucesso" | "erro", texto: string, destino = "/admin/rv"): never {
  redirect(voltarCom(destino, chave, texto));
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
export async function avisarRVAtualizada(formData?: FormData) {
  // De onde saiu o clique: a tela da RV ou a gaveta em Fontes de Dados.
  // Mesmo desenho dos imports -- só o destino do resultado muda.
  const destino = String(formData?.get("voltar_para") ?? "") || "/admin/rv";
  const voltarAqui: (c: "sucesso" | "erro", t: string) => never = (c, t) => voltar(c, t, destino);

  const eu = await requireModulo("rv", "editar");
  const revendaId = await exigirRevenda("/admin/rv");

  const { ids, configurado, falhas } = await colaboradoresComRV(revendaId);

  if (!configurado) {
    voltarAqui("erro", "Conecte a planilha de RV antes de avisar o time.");
  }
  if (falhas.length > 0 && ids.length === 0) {
    voltarAqui(
      "erro",
      `Não consegui ler ${falhas.map((f) => f.rotulo).join(" e ")} (${falhas[0].motivo}). Ninguém foi avisado.`,
    );
  }
  if (ids.length === 0) {
    voltarAqui(
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
    voltarAqui(
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

  voltarAqui(
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

  /*
    DE ONDE VEIO O CLIQUE (08/09/2026, pedido do dono: "consegue mover a
    remuneração também?").

    Os links da RV passaram a ser editáveis em 🔌 Fontes de Dados, junto
    com as outras seis fontes. A action é a MESMA -- só o destino do
    redirecionamento muda, igual ao que Rating, Rotas e a base de clientes
    já faziam. Duplicar o upsert daria dois lugares gravando `rv_config`, e
    o dia em que um deles esquecesse o `updateTag` a planilha antiga ficaria
    servida por cinco minutos sem ninguém entender por quê.
  */
  const destino = ((formData.get("voltar_para") as string) || "/admin/rv").trim();

  if (area !== "DU" && area !== "AL") {
    redirect(voltarCom(destino, "erro", "Área inválida"));
  }

  // A RV lê o ARQUIVO da planilha. O link de uma pasta era aceito ao
  // salvar e só falhava quando o colaborador abria a tela (11/09/2026).
  if (csvUrl && tipoDoLink(csvUrl) === "pasta") {
    redirect(
      voltarCom(
        destino,
        "erro",
        "Esse é o link de uma PASTA. A RV lê o ARQUIVO da planilha: no Drive, clique com o botão direito na planilha → Compartilhar → Copiar link.",
      ),
    );
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/rv");

  /*
    O NOME DO CARTÃO É DA REVENDA (10/09/2026). Era sempre o da área --
    "Distribuição Urbana" / "Armazém Logístico" -- e Barreiras usa as duas
    vagas para Motorista e Ajudante: o ajudante veria "Armazém Logístico"
    em cima da própria RV. Campo vazio mantém o nome que já está gravado;
    só sem nenhum volta ao da área.
  */
  const rotuloDoForm = ((formData.get("rotulo") as string) || "").trim().slice(0, 40);
  const { data: atual } = await admin
    .from("rv_config")
    .select("rotulo")
    .eq("revenda_id", revendaId)
    .eq("area", area)
    .maybeSingle();
  const rotulo = rotuloDoForm || atual?.rotulo || AREAS.find((a) => a.id === area)?.rotulo || area;

  // Upsert porque numa revenda nova a linha da área ainda não existe: um
  // update simples não gravaria nada e a tela diria "salvo" sem ter salvo.
  const { error } = await admin.from("rv_config").upsert(
    {
      revenda_id: revendaId,
      area,
      rotulo,
      csv_url: csvUrl || null,
      coluna_cpf: colunaCpf || null,
      coluna_valor: colunaValor || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,area" },
  );

  if (error) {
    redirect(voltarCom(destino, "erro", error.message));
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
  revalidatePath("/admin/fontes-de-dados");
  redirect(
    voltarCom(destino, "sucesso", `RV "${rotulo}" salva.`),
  );
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
