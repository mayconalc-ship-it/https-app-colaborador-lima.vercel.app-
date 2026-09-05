import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";

export const dynamic = "force-dynamic";

/**
 * A PLANILHA PADRÃO, JÁ PREENCHIDA COM O QUE ESTÁ NO BANCO.
 *
 * Pedido do dono (05/09/2026), e ele achou o defeito junto: "se eu edito
 * o produto e depois importo a planilha sem esse item dentro do arquivo,
 * ela sobrescreve e devolve zerado caso eu não tenha informado na
 * planilha".
 *
 * É exatamente o que a importação faz, e é o desenho dela: cada linha
 * substitui o produto inteiro. Uma coluna em branco não quer dizer "não
 * mexa neste campo" -- quer dizer "este campo é vazio". Não dá para
 * mudar essa regra sem inventar outra pior: se o branco passasse a
 * significar "mantenha", ninguém conseguiria APAGAR um valor errado pela
 * planilha, e o cadastro ficaria só acumulando.
 *
 * A saída é a que ele propôs: em vez de manter uma planilha paralela que
 * envelhece a cada correção feita na tela, BAIXAR A VERDADE. Este
 * arquivo sai com todos os produtos cadastrados e com as mesmas colunas
 * que o importador lê -- edita-se ele e importa-se de volta, e o que não
 * foi tocado volta igual porque veio de lá.
 *
 * Rota de API, e não server action, porque o resultado é um ARQUIVO:
 * server action devolve dado para a tela, não um download com nome e
 * tipo. Mesmo motivo do export do 5S.
 *
 * .XLSX e não CSV: o importador só lê .xlsx (ver importarPlanilhaProdutos).
 * Exportar em CSV daria um arquivo que ele mesmo recusa -- a ida e a
 * volta têm de ser o mesmo formato, senão não é ida e volta.
 */

/**
 * Os cabeçalhos são os do arquivo que a operação já usa
 * (Cadastro_Prod_App_Colaborador.xlsx), escritos igual. O importador
 * normaliza acento, caixa e espaço antes de comparar, então o que
 * importa é a PALAVRA -- mas sair com a mesma grafia é o que faz o
 * arquivo baixado parecer o de sempre para quem abre.
 */
const COLUNAS = [
  "PROMAX",
  "PRODUTO",
  "Cluster Produto",
  "Fator Hecto",
  "Caixas Pallet",
  "CAIXAS LASTRO",
  "Un/CX",
  "Tipo",
  "EMBALAGEM_Repack",
  "EMBALAGEM_DESPEJO",
  "META_(cx)REPACK/H",
  "META_(l)DESPEJO/H",
] as const;

export async function GET() {
  // A mesma permissão da tela, conferida de novo: esta rota é um endereço
  // como outro qualquer, e quem souber dele chegaria aqui sem passar por
  // tela nenhuma. O cadastro inteiro da revenda sai neste arquivo.
  if (!(await podeNoModulo("produtividade-armazem", "editar"))) {
    return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
  }

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return NextResponse.json({ erro: "Sem revenda" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: produtos, error }, { data: embalagens }] = await Promise.all([
    admin
      .from("pa_produtos")
      .select(
        "codigo, descricao, cluster_produto, fator_hecto, caixas_pallet, caixas_por_lastro, unidades_por_caixa, tipo, embalagem_id, meta_reepack_hora, meta_despejo_hora",
      )
      .eq("revenda_id", revendaId)
      .order("descricao"),
    admin.from("pa_embalagens").select("id, nome").eq("revenda_id", revendaId),
  ]);

  // Erro não vira planilha vazia: um arquivo com só o cabeçalho seria
  // reimportado por cima do cadastro inteiro sem apagá-lo (o upsert só
  // mexe no que vem), mas passaria a impressão de que não há nada
  // cadastrado. Melhor recusar.
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const nomeEmbalagem = new Map((embalagens ?? []).map((e) => [e.id, e.nome]));

  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Relacao_Prod_App_Colaborador");
  aba.addRow([...COLUNAS]);
  aba.getRow(1).font = { bold: true };

  for (const p of produtos ?? []) {
    aba.addRow([
      p.codigo,
      p.descricao,
      p.cluster_produto ?? "",
      p.fator_hecto ?? "",
      p.caixas_pallet ?? "",
      p.caixas_por_lastro ?? "",
      p.unidades_por_caixa ?? "",
      p.tipo ?? "",
      p.embalagem_id ? (nomeEmbalagem.get(p.embalagem_id) ?? "") : "",
      // EMBALAGEM_DESPEJO sai VAZIA, e não por esquecimento: o despejo é
      // por embalagem, não por produto (26/08/2026) -- `pa_produtos` não
      // guarda essa ligação, então não há o que exportar. A coluna fica
      // no arquivo porque a importação a usa para CRIAR embalagens de
      // despejo novas; deixá-la em branco não apaga as que já existem.
      "",
      p.meta_reepack_hora ?? "",
      p.meta_despejo_hora ?? "",
    ]);
  }

  // Largura pelo conteúdo, com teto: a descrição de produto passa de 50
  // caracteres e sem isso o arquivo abre com todas as colunas iguais,
  // obrigando a pessoa a arrastar cada uma antes de conseguir ler.
  aba.columns.forEach((coluna, i) => {
    const maior = Math.max(
      COLUNAS[i]?.length ?? 10,
      ...(produtos ?? []).map((p) => String(i === 1 ? p.descricao : "").length),
    );
    coluna.width = Math.min(Math.max(maior + 2, 12), 55);
  });
  aba.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const hoje = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Cadastro_Prod_App_Colaborador_${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
