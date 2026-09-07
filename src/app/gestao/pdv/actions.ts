"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { createAdminClient } from "@/lib/supabase/admin";

const ROTA = "/gestao/pdv";

/**
 * "JÁ AVISEI ESTE CLIENTE" -- o registro da preventiva.
 *
 * Pedido do dono (07/09/2026), entre as sugestões que ele aceitou: marcar
 * já avisei por cliente e data.
 *
 * SERVE PARA DUAS COISAS, e a segunda é a que importa. A primeira é não
 * ligar duas vezes -- numa manhã com quinze rotas, duas pessoas
 * acompanhando, o mesmo cliente recebe a mesma ligação. A segunda é que a
 * preventiva passa a deixar rastro: hoje "a gente avisou" é memória de
 * quem estava lá, e memória não responde na reunião quando a entrega
 * voltou mesmo assim.
 *
 * A MARCA É POR PARTICULARIDADE E POR DATA DE ENTREGA. Um cliente com
 * horário apertado E bloqueio tem dois assuntos, tratados por gente
 * diferente; marcar os dois de uma vez esconderia o segundo. E a data é a
 * da ENTREGA, não a de hoje: avisar na véspera é o objetivo do módulo.
 *
 * Basta "ver": quem monitora rota é justamente quem tem só leitura, e
 * exigir "editar" para registrar uma ligação obrigaria a dar o cadastro
 * inteiro a quem só precisa contar o que fez.
 */
export async function marcarAvisado(formData: FormData) {
  await requireModulo("pdv-particularidades", "ver", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const perfil = await getPerfil();
  const admin = createAdminClient();

  const id = String(formData.get("particularidade_id") ?? "");
  const data = String(formData.get("data") ?? "");
  const codPdv = String(formData.get("cod_pdv") ?? "");
  const voltar = `${ROTA}?data=${encodeURIComponent(data)}`;
  if (!id || !data) redirect(`${voltar}&erro=${encodeURIComponent("Aviso inválido.")}`);

  const { error } = await admin.from("pa_pdv_avisos_enviados").upsert(
    {
      revenda_id: revendaId,
      particularidade_id: id,
      data,
      cod_pdv: codPdv,
      avisado_por: perfil?.id ?? null,
      avisado_por_nome: perfil?.nome ?? null,
      avisado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id,particularidade_id,data" },
  );
  if (error) redirect(`${voltar}&erro=${encodeURIComponent(`Não consegui marcar: ${error.message}`)}`);

  revalidatePath(ROTA);
  redirect(voltar);
}

/**
 * DESMARCAR -- porque marcar por engano é o erro mais fácil desta tela.
 *
 * O botão fica ao lado da marca, e não escondido: um registro que não se
 * desfaz vira um registro em que ninguém confia, e aí a pessoa para de
 * marcar para não errar.
 */
export async function desmarcarAvisado(formData: FormData) {
  await requireModulo("pdv-particularidades", "ver", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("particularidade_id") ?? "");
  const data = String(formData.get("data") ?? "");
  const voltar = `${ROTA}?data=${encodeURIComponent(data)}`;

  await admin
    .from("pa_pdv_avisos_enviados")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("particularidade_id", id)
    .eq("data", data);

  revalidatePath(ROTA);
  redirect(voltar);
}
