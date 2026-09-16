import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lerTudo } from "@/lib/ler-tudo";
import { ehOwner } from "@/lib/acessos";
import {
  DIAS_SEM_ENTRAR,
  DIAS_SEM_USO,
  diasAtras,
  liberacoesSemUso,
  ultimoAcesso,
  type Liberacao,
  type UsoDeTela,
} from "@/lib/limpeza-de-acessos";

/**
 * Quanto do histórico de telas se lê. Não muda quem entra na lista (o
 * corte é de 30/60 dias); serve para a coluna "último uso" dizer "há 95
 * dias" em vez de "nunca" para quem usou e parou.
 */
const DIAS_DE_HISTORICO = 180;

export type PessoaDaLimpeza = {
  id: string;
  nome: string;
  cpf: string;
  cargo: string | null;
  area: string | null;
  role: string;
};

/**
 * O RELATÓRIO DA LIMPEZA de uma revenda -- a tela e a ação de retirar leem
 * daqui. A ação confere de novo, na hora de gravar, que a liberação
 * continua sem uso: entre abrir a tela e clicar, a pessoa pode ter usado.
 */
export async function lerLimpezaDeAcessos(revendaId: string, agora: Date = new Date()) {
  const admin = createAdminClient();

  const { data: vinculos } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const ids = [...new Set((vinculos ?? []).map((v) => String(v.colaborador_id)))];
  if (ids.length === 0) return { semUso: [], liderancasAusentes: [], semEntrar: [], pessoas: new Map() };

  const [perfis, extras, permissoes, usos] = await Promise.all([
    lerTudo<PessoaDaLimpeza & { created_at: string }>((de, ate) =>
      admin.from("profiles").select("id, nome, cpf, cargo, area, role, created_at").in("id", ids).order("id").range(de, ate),
    ),
    lerTudo<{ colaborador_id: string; modulo: string; liberado_em: string }>((de, ate) =>
      admin
        .from("colaborador_modulos_extra")
        .select("colaborador_id, modulo, liberado_em")
        .eq("revenda_id", revendaId)
        .order("colaborador_id")
        .order("modulo")
        .range(de, ate),
    ),
    lerTudo<{ colaborador_id: string }>((de, ate) =>
      admin
        .from("lideranca_permissoes")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .order("colaborador_id")
        .range(de, ate),
    ),
    lerTudo<{ colaborador_id: string; tela: string; ultimo_em: string }>((de, ate) =>
      admin
        .rpc("uso_por_tela", { p_colaboradores: ids, p_desde: diasAtras(DIAS_DE_HISTORICO, agora) })
        .order("colaborador_id")
        .order("tela")
        .range(de, ate),
    ),
  ]);

  // O Admin fica fora de tudo: ninguém mexe nos acessos dele por aqui.
  const pessoas = new Map(perfis.filter((p) => !ehOwner(p.role)).map((p) => [p.id, p]));

  const usosPorPessoa = new Map<string, UsoDeTela[]>();
  for (const u of usos) {
    const lista = usosPorPessoa.get(u.colaborador_id) ?? [];
    lista.push({ colaboradorId: u.colaborador_id, tela: u.tela, ultimoEm: u.ultimo_em });
    usosPorPessoa.set(u.colaborador_id, lista);
  }

  const liberacoes: Liberacao[] = extras
    .filter((e) => pessoas.has(e.colaborador_id))
    .map((e) => ({ colaboradorId: e.colaborador_id, modulo: e.modulo, liberadoEm: e.liberado_em }));

  const semUso = liberacoesSemUso(liberacoes, usosPorPessoa, diasAtras(DIAS_SEM_USO, agora));

  const permissoesPorPessoa = new Map<string, number>();
  for (const p of permissoes) permissoesPorPessoa.set(p.colaborador_id, (permissoesPorPessoa.get(p.colaborador_id) ?? 0) + 1);

  const corteLideranca = diasAtras(DIAS_SEM_USO, agora);
  const corteEntrar = diasAtras(DIAS_SEM_ENTRAR, agora);

  const liderancasAusentes: (PessoaDaLimpeza & { ultimoAcesso: string | null; permissoes: number })[] = [];
  const semEntrar: (PessoaDaLimpeza & { ultimoAcesso: string | null; criadoEm: string })[] = [];

  for (const p of pessoas.values()) {
    const ultimo = ultimoAcesso(usosPorPessoa.get(p.id) ?? []);
    if (p.role === "lideranca") {
      // A liderança pesa mais: ela carrega permissão de ver e alterar
      // dados do time. 30 dias sem entrar já merecem uma olhada.
      if (ultimo === null || ultimo < corteLideranca) {
        liderancasAusentes.push({ ...p, ultimoAcesso: ultimo, permissoes: permissoesPorPessoa.get(p.id) ?? 0 });
      }
      continue;
    }
    // Conta criada há menos de 60 dias que nunca entrou é implantação em
    // andamento (Barreiras entrou em 10/09/2026), não gente que saiu.
    if ((ultimo === null ? p.created_at : ultimo) < corteEntrar) {
      semEntrar.push({ ...p, ultimoAcesso: ultimo, criadoEm: p.created_at });
    }
  }

  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");
  liderancasAusentes.sort(porNome);
  // Quem nunca entrou primeiro, depois o acesso mais antigo.
  semEntrar.sort((a, b) => (a.ultimoAcesso ?? "").localeCompare(b.ultimoAcesso ?? "") || porNome(a, b));
  semUso.sort(
    (a, b) =>
      porNome(pessoas.get(a.colaboradorId)!, pessoas.get(b.colaboradorId)!) || a.modulo.localeCompare(b.modulo),
  );

  return { semUso, liderancasAusentes, semEntrar, pessoas };
}
