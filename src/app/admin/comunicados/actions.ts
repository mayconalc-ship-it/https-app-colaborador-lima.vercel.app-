"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  datetimeLocalParaUTC,
  diaNoFuso,
  ehEditoriaValida,
  ehFuturo,
  formatarDiaEHora,
} from "@/lib/comunicados";
import { editoriasDaRevenda } from "@/lib/editorias";
import { ehAreaValida } from "@/lib/areas";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";

function caminhoDoStorage(arquivoUrl: string) {
  const prefixo = "/storage/v1/object/public/conteudo/";
  const idx = arquivoUrl.indexOf(prefixo);
  if (idx === -1) return null;
  return decodeURIComponent(arquivoUrl.slice(idx + prefixo.length));
}

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) || "").trim();
}

export async function salvarComunicado(formData: FormData) {
  const id = formData.get("id") ? Number(formData.get("id")) : null;

  // O mesmo formulário publica matéria nova e altera existente. Sem separar
  // aqui, quem tivesse só "Criar" não conseguiria publicar nada, e quem
  // tivesse só "Editar" poderia publicar -- o oposto do esperado.
  const admin_ = await requireModulo("comunicados", id ? "editar" : "criar");

  const titulo = texto(formData, "titulo");
  const resumo = texto(formData, "resumo");
  const corpo = texto(formData, "texto");
  const categoria = texto(formData, "categoria");
  const data = texto(formData, "data");
  const destaque = formData.get("destaque") === "on";
  const imagem = formData.get("imagem") as File | null;

  if (!titulo) redirect("/admin/comunicados?erro=Informe+o+título");
  if (!corpo) redirect("/admin/comunicados?erro=Escreva+o+conteúdo");

  const admin = createAdminClient();
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect("/admin/comunicados?erro=Voce+nao+esta+em+nenhuma+revenda");
  }

  // A editoria virou cadastro (migration 047), então a lista válida depende
  // da revenda -- não dá mais para conferir contra uma constante. A conferência
  // continua existindo porque o `categoria` chega de um formulário, e
  // formulário é coisa que o navegador do outro lado pode reescrever.
  const editorias = await editoriasDaRevenda(revendaId);
  if (!ehEditoriaValida(editorias, categoria)) {
    redirect("/admin/comunicados?erro=Editoria+inválida");
  }

  let imagemUrl: string | null | undefined = undefined;
  if (imagem && imagem.size > 0) {
    const extensao = (imagem.name.split(".").pop() ?? "jpg").toLowerCase();
    // A revenda entra no caminho: o bucket é público, e sem separar por
    // pasta os arquivos das duas unidades ficariam embolados no mesmo lugar.
    const caminho = `${revendaId}/comunicados/${Date.now()}.${extensao}`;
    const { error: uploadError } = await admin.storage
      .from("conteudo")
      .upload(caminho, imagem, {
        upsert: true,
        cacheControl: SEGUNDOS_DE_CACHE,
      });

    if (uploadError) {
      redirect(
        `/admin/comunicados?erro=${encodeURIComponent(uploadError.message)}`,
      );
    }
    const { data: pub } = admin.storage.from("conteudo").getPublicUrl(caminho);
    imagemUrl = pub.publicUrl;
  }

  // Agendamento da PUBLICAÇÃO -- diferente do lembrete logo abaixo. Aqui
  // é a matéria inteira que espera a hora marcada para aparecer no
  // jornal, e é isso que deixa o RH escrever o plano de comunicação do
  // mês inteiro de uma vez só.
  //
  // Vazio ou no passado = no ar agora, exatamente como sempre foi.
  const publicarLocal = texto(formData, "publicar_em");
  const publicarEm = publicarLocal ? datetimeLocalParaUTC(publicarLocal) : null;
  const agendado = ehFuturo(publicarEm);

  // O que o comunicado já era, antes desta edição. Serve a três decisões
  // abaixo (reabrir o disparo do lembrete, reabrir o aviso da publicação
  // e saber se a matéria está entrando no ar AGORA), então vale a
  // consulta única em vez de três.
  const { data: atual } = id
    ? await admin
        .from("comunicados")
        .select("lembrete_em, publicar_em")
        .eq("id", id)
        .eq("revenda_id", revendaId)
        .maybeSingle()
    : { data: null };

  // Tirar o agendamento de uma matéria que ainda não tinha entrado no ar
  // publica ela na hora -- e o sino tem que tocar, senão a notícia
  // apareceria calada no jornal.
  const estreiaAgora = Boolean(id) && ehFuturo(atual?.publicar_em) && !agendado;

  // Só uma matéria pode ser capa por vez -- em cada revenda. Sem o filtro,
  // publicar capa em Barreiras derrubaria a capa de São Félix.
  //
  // Matéria AGENDADA não derruba capa nenhuma agora: marcar a capa do dia
  // 15 numa terça deixaria o jornal duas semanas sem capa. Quem limpa as
  // outras é o cron, na hora em que ela de fato entra no ar.
  if (destaque && !agendado) {
    await admin
      .from("comunicados")
      .update({ destaque: false })
      .eq("revenda_id", revendaId)
      .neq("id", id ?? -1);
  }

  // Lembrete: dispara sozinho na hora marcada (ver /api/cron/lembretes).
  // Área e cargo vazios = a revenda inteira, igual à publicação em si;
  // preenchidos, se cruzam (esta área E este cargo).
  const lembreteLocal = texto(formData, "lembrete_em");
  const lembreteEm = lembreteLocal ? datetimeLocalParaUTC(lembreteLocal) : null;
  const lembreteAreas = formData
    .getAll("lembrete_areas")
    .map(String)
    .filter(ehAreaValida);
  const lembreteCargos = formData
    .getAll("lembrete_cargos")
    .map(String)
    .filter(Boolean);
  const lembreteMensagem = texto(formData, "lembrete_mensagem");

  // Só reabre a janela de disparo quando o INSTANTE realmente muda --
  // comparando como data, não como texto, porque o banco devolve a data
  // formatada diferente do que acabamos de montar, e comparar string
  // trataria isso como mudança a cada edição, reenviando um lembrete que
  // já tinha saído só porque alguém corrigiu um typo no título.
  let lembreteEnviadoEm: string | null | undefined;
  if (id) {
    const antes = atual?.lembrete_em ? new Date(atual.lembrete_em).getTime() : null;
    const depois = lembreteEm ? new Date(lembreteEm).getTime() : null;
    if (antes !== depois) lembreteEnviadoEm = null;
  } else if (lembreteEm) {
    lembreteEnviadoEm = null;
  }

  // O carimbo do aviso da publicação segue a mesma lógica: nulo enquanto
  // a matéria estiver na fila (é o que o cron procura), preenchido no
  // instante em que este código mesmo avisa. Remarcar para outro dia
  // reabre o aviso; corrigir um typo no título não.
  let publicacaoAvisadaEm: string | null | undefined;
  if (agendado) {
    const antes = atual?.publicar_em ? new Date(atual.publicar_em).getTime() : null;
    const depois = new Date(publicarEm!).getTime();
    if (!id || antes !== depois) publicacaoAvisadaEm = null;
  } else {
    publicacaoAvisadaEm = new Date().toISOString();
  }

  const registro = {
    titulo,
    resumo: resumo || null,
    texto: corpo,
    categoria,
    destaque,
    autor: admin_.nome,
    // A matéria agendada nasce datada do dia em que vai ao ar, não do dia
    // em que foi escrita: a página do jornal ordena por `data`, e uma
    // notícia de 15/09 escrita em 20/08 entraria no jornal já enterrada
    // no fim da lista.
    // Os dois lados passam pelo fuso do armazém. O agendado já passava;
    // o de hoje ficou para trás e usava UTC -- publicar às 21h de terça
    // datava a matéria de quarta, e ela nascia no topo do jornal com a
    // data errada.
    data: agendado
      ? diaNoFuso(publicarEm!)
      : data || diaNoFuso(new Date().toISOString()),
    publicar_em: publicarEm,
    ...(publicacaoAvisadaEm !== undefined
      ? { publicacao_avisada_em: publicacaoAvisadaEm }
      : {}),
    lembrete_em: lembreteEm,
    lembrete_areas: lembreteAreas.length > 0 ? lembreteAreas : null,
    lembrete_cargos: lembreteCargos.length > 0 ? lembreteCargos : null,
    lembrete_mensagem: lembreteMensagem || null,
    ...(lembreteEnviadoEm !== undefined
      ? { lembrete_enviado_em: lembreteEnviadoEm }
      : {}),
    ...(imagemUrl !== undefined ? { imagem_url: imagemUrl } : {}),
  };

  const { error } = id
    ? await admin
        .from("comunicados")
        .update(registro)
        .eq("id", id)
        .eq("revenda_id", revendaId)
    : await admin
        .from("comunicados")
        .insert({ ...registro, revenda_id: revendaId });

  if (error) {
    redirect(`/admin/comunicados?erro=${encodeURIComponent(error.message)}`);
  }

  // Só matéria nova avisa. Corrigir um typo no título de ontem não pode
  // tocar o celular de todo mundo de novo.
  //
  // Matéria AGENDADA não avisa aqui: o sino toca na hora em que ela
  // aparece no jornal, não na tarde em que o RH montou o plano do mês --
  // quem faz isso é /api/cron/lembretes.
  if ((!id && !agendado) || estreiaAgora) {
    await criarOuAgrupar({
      modulo: "comunicados",
      titulo: "Novidade no Jornal!",
      mensagem: titulo,
      url: "/comunicados",
      criadoPor: admin_.id,
    });

    // O sino é a fonte da verdade e alcança todo mundo; o push é o toque
    // no ombro de quem está com o app fechado. Vem depois, e de propósito
    // sem `await` bloqueante de erro: já falha calado por dentro.
    await enviarPushDaRevenda(revendaId, {
      modulo: "comunicados",
      titulo: "Novidade no Jornal!",
      mensagem: titulo,
      url: "/comunicados",
      exceto: admin_.id,
    });
  }

  revalidatePath("/comunicados");
  const sucesso = agendado
    ? `Agendado para ${formatarDiaEHora(publicarEm!)}`
    : id
      ? "Comunicado atualizado"
      : "Comunicado publicado";
  redirect(`/admin/comunicados?sucesso=${encodeURIComponent(sucesso)}`);
}

export async function excluirComunicado(formData: FormData) {
  await requireModulo("comunicados", "excluir");

  const id = Number(formData.get("id"));
  if (!id) redirect("/admin/comunicados?erro=Registro+inválido");

  const admin = createAdminClient();
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect("/admin/comunicados?erro=Voce+nao+esta+em+nenhuma+revenda");
  }

  // O filtro por revenda também é a trava: sem ele bastaria adivinhar um id
  // para apagar o comunicado da outra unidade.
  const { data: registro } = await admin
    .from("comunicados")
    .select("imagem_url")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const { error } = await admin
    .from("comunicados")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) {
    redirect(`/admin/comunicados?erro=${encodeURIComponent(error.message)}`);
  }

  if (registro?.imagem_url) {
    const caminho = caminhoDoStorage(registro.imagem_url);
    if (caminho) await admin.storage.from("conteudo").remove([caminho]);
  }

  revalidatePath("/comunicados");
  redirect("/admin/comunicados?sucesso=Comunicado+excluído");
}
