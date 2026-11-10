import { NextResponse } from "next/server";
import { hojeEmSaoPaulo, ordenarPrioridades, somarDias } from "@/lib/prioridades";
import { PrioridadesNaoInstalado, prioridadesEntre, resolverChaveGestorLog, type Prioridade } from "@/lib/prioridades-server";

export const dynamic = "force-dynamic";

/**
 * O QUE OS GVs LANÇARAM, PARA O GESTOR LOG (04/11/2026).
 *
 * O Gestor LOG abre como arquivo no navegador (origem "null"), por isso a
 * resposta libera qualquer origem: a trava é a chave do endereço, que só
 * aparece em Configuração › Prioridades dos GVs. Só leitura, sem cookie.
 * Por padrão, da semana passada até duas semanas à frente -- o ANS do
 * Gestor LOG guarda cada dia depois de buscado.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  try {
    const alvo = await resolverChaveGestorLog(chave);
    if (!alvo) return NextResponse.json({ erro: "Endereço inválido ou trocado. Copie o novo em Configuração › Prioridades dos GVs." }, { status: 404, headers: CORS });
    const url = new URL(req.url), hoje = hojeEmSaoPaulo();
    const de = DATA.test(url.searchParams.get("de") ?? "") ? url.searchParams.get("de")! : somarDias(hoje, -7);
    const ate = DATA.test(url.searchParams.get("ate") ?? "") ? url.searchParams.get("ate")! : somarDias(hoje, 14);
    // Cada dia na ordem da liderança (Gestão › Prioridades dos GVs); `ordem` = posição no dia.
    const porDia = new Map<string, Prioridade[]>();
    for (const p of await prioridadesEntre(alvo.revendaId, de, ate)) porDia.set(p.data_entrega, [...(porDia.get(p.data_entrega) ?? []), p]);
    const lista = [...porDia.keys()].sort().flatMap((d) => ordenarPrioridades(porDia.get(d)!).map((p, i) => ({ ...p, posicao: i + 1 })));
    return NextResponse.json(
      {
        revenda: alvo.revendaNome,
        de,
        ate,
        geradoEm: new Date().toISOString(),
        itens: lista.map((p) => ({
          data: p.data_entrega,
          cod: p.cod_pdv,
          nome: p.nome_pdv,
          motivo: p.motivo,
          gv: p.gv_nome,
          gvCodigo: p.gv_codigo,
          enviadoEm: p.enviado_em,
          novo: p.pdv_novo === true,
          ordem: p.posicao,
        })),
      },
      { headers: CORS },
    );
  } catch (e) {
    const msg = e instanceof PrioridadesNaoInstalado ? "Falta rodar a migration 173 no Supabase." : "Erro ao ler as prioridades.";
    return NextResponse.json({ erro: msg }, { status: 500, headers: CORS });
  }
}
