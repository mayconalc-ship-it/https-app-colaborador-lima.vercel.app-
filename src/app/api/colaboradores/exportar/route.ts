import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { COLUNAS_PLANILHA } from "@/lib/colaboradores-planilha";

export const dynamic = "force-dynamic";

/**
 * A PLANILHA PADRÃO DE COLABORADORES, JÁ PREENCHIDA COM A UNIDADE.
 *
 * Pedido do dono (10/09/2026): "a tela de importação com a planilha padrão
 * para exportar da mesma forma que fizemos com o código de produto" (ver
 * api/produtividade-armazem/produtos/exportar). A mesma ideia: em vez de
 * uma planilha paralela que envelhece a cada correção feita na tela,
 * BAIXAR A VERDADE -- edita-se este arquivo e importa-se de volta.
 *
 * SÓ A UNIDADE ATIVA, e isso é o que protege a volta: o arquivo de
 * Barreiras só traz gente de Barreiras, e a importação não mexe em quem é
 * de outra unidade (ver `classificar`, lib/colaboradores-planilha.ts).
 *
 * O CPF SAI COMO TEXTO, formatado. Como número, o Excel apaga o zero da
 * frente na primeira vez que alguém salva -- e o arquivo volta com CPF de
 * 10 dígitos. A importação até recupera esse zero, mas só quando o dígito
 * verificador confere; melhor não perder.
 *
 * Fica fora o DONO do app: ele está vinculado às unidades para
 * administrar, e uma linha dele no arquivo convidaria a trocar o próprio
 * cargo por engano.
 */
export async function GET() {
  // O arquivo tem o CPF da unidade inteira: a mesma permissão de quem
  // cadastra, conferida de novo -- esta rota é um endereço como outro
  // qualquer, e quem souber dele chegaria aqui sem passar por tela nenhuma.
  if (!(await podeNoModulo("colaboradores", "criar"))) {
    return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
  }
  const revendaId = await getRevendaId();
  if (!revendaId) return NextResponse.json({ erro: "Sem revenda" }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: vinculos, error }, { data: revenda }] = await Promise.all([
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
    admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const ids = (vinculos ?? []).map((v) => v.colaborador_id as string);
  const pessoas: { nome: string; cpf: string; matricula: string | null; cargo: string | null; area: string | null; role: string }[] = [];
  // Em lotes: o `in` vai na URL, e com a unidade inteira ela estoura antes
  // de qualquer outro limite.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: erroPerfis } = await admin
      .from("profiles")
      .select("nome, cpf, matricula, cargo, area, role")
      .in("id", ids.slice(i, i + 200));
    if (erroPerfis) return NextResponse.json({ erro: erroPerfis.message }, { status: 500 });
    pessoas.push(...((data ?? []) as typeof pessoas));
  }

  const lista = pessoas
    .filter((p) => p.role !== "owner")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const formatarCpf = (c: string) =>
    c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;

  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Colaboradores");
  aba.addRow([...COLUNAS_PLANILHA]);
  aba.getRow(1).font = { bold: true };
  for (const p of lista) {
    aba.addRow([p.matricula ?? "", p.nome, formatarCpf(p.cpf), p.cargo ?? "", p.area ?? ""]);
  }
  // Matrícula e CPF como TEXTO na coluna inteira -- inclusive nas linhas
  // que alguém acrescentar depois, que é onde o zero se perde.
  aba.getColumn(1).numFmt = "@";
  aba.getColumn(3).numFmt = "@";
  // Largura coluna a coluna, e não reatribuindo `aba.columns`: aquele
  // setter reescreve as definições das colunas e pode regravar o cabeçalho
  // por cima do que já foi escrito.
  [12, 42, 17, 32, 24].forEach((largura, i) => {
    aba.getColumn(i + 1).width = largura;
  });
  aba.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();

  // O dia do armazém, não o do servidor (a Vercel roda em UTC) -- mesmo
  // cuidado do export de produtos.
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const unidade = (revenda?.nome ?? "unidade")
    .replace(/^Revenda\s+Lima\s+/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_");

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Colaboradores_${unidade}_${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
