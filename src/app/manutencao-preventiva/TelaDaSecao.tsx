import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { daSecao, painelDaRevenda, PreventivaNaoAtualizada } from "@/lib/manutencao-preventiva-server";
import { nomeDoEquipamento, SECOES, type SecaoPreventiva } from "@/lib/manutencao-preventiva";
import { ListaDePreventivas, type LinhaDaLista } from "./ListaDePreventivas";
import { NovaPreventiva, type OpcaoDeModelo } from "./NovaPreventiva";

export type ParametrosDaTela = { erro?: string; sucesso?: string; ver?: string; alvo?: string; alertas?: string };

/**
 * A tela da Preventiva e a do Check Ferramental (17/11/2026: o dono quis
 * o ferramental FORA da Preventiva). Mesmo motor, cada uma com os seus
 * checklists -- o `secao` do modelo decide onde ele aparece.
 */
export async function TelaDaSecao({ secao, sp }: { secao: SecaoPreventiva; sp: ParametrosDaTela }) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const s = SECOES[secao];
  const titulo = `${s.emoji} ${s.titulo}`;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  let painel;
  try {
    painel = daSecao(await painelDaRevenda(revendaId, admin), secao);
  } catch (e) {
    if (!(e instanceof PreventivaNaoAtualizada)) throw e;
    return (
      <div>
        <PageHeader title={titulo} fecharHref="/manutencao-central" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 181</strong> no Supabase.
        </p>
      </div>
    );
  }

  const idsDosModelos = [...new Set([...painel.alvos.map((a) => a.modelo.id), ...painel.semCadastro.map((m) => m.id)])];

  const [{ data: abertasBanco }, { data: historicoBanco }, podeCadastrar] = await Promise.all([
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, equipamento_id")
      .eq("revenda_id", revendaId)
      .eq("iniciada_por", perfil.id)
      .eq("status", "em_andamento"),
    idsDosModelos.length === 0
      ? Promise.resolve({ data: [] as { id: string; modelo_id: string; equipamento_id: string | null; finalizada_em: string | null; finalizada_por_nome: string | null; alertas: number | null }[] })
      : admin
          .from("manut_prev_execucoes")
          .select("id, modelo_id, equipamento_id, finalizada_em, finalizada_por_nome, alertas")
          .eq("revenda_id", revendaId)
          .eq("status", "finalizada")
          .in("modelo_id", idsDosModelos)
          .order("finalizada_em", { ascending: false })
          .limit(40),
    podeNoModulo("manutencao-preventiva", "editar"),
  ]);

  const abertaPorAlvo = new Map((abertasBanco ?? []).map((e) => [`${e.modelo_id}:${e.equipamento_id ?? "-"}`, e.id]));

  const linhas: LinhaDaLista[] = painel.alvos.map((a) => ({
    chave: a.chave,
    modeloId: a.modelo.id,
    equipamentoId: a.equipamento?.id ?? null,
    emoji: a.modelo.emoji ?? s.emoji,
    tipo: a.modelo.equipamento || a.modelo.nome,
    titulo: a.equipamento ? nomeDoEquipamento(a.equipamento) : a.modelo.nome,
    detalhe: [a.equipamento?.marca, a.equipamento?.capacidade].filter(Boolean).join(" · ") || null,
    periodicidadeDias: a.periodicidadeDias,
    ultima: a.ultima
      ? { id: a.ultima.id, quando: formatarDataHora(a.ultima.em), por: a.ultima.por, alertas: a.ultima.alertas }
      : null,
    prazo: a.prazo,
    abertaId: abertaPorAlvo.get(a.chave) ?? null,
  }));

  // As opções do "+": cada tipo, com os aparelhos e o prazo de cada um.
  const opcoes = new Map<string, OpcaoDeModelo>();
  const opcaoDe = (m: (typeof painel.semCadastro)[number]) => {
    if (!opcoes.has(m.id)) {
      opcoes.set(m.id, {
        id: m.id,
        nome: m.nome,
        emoji: m.emoji ?? s.emoji,
        equipamento: m.equipamento,
        usaEquipamentos: m.usaEquipamentos,
        aparelhos: [],
        abertaId: null,
      });
    }
    return opcoes.get(m.id)!;
  };
  for (const a of painel.alvos) {
    const o = opcaoDe(a.modelo);
    if (a.equipamento) {
      o.aparelhos.push({ id: a.equipamento.id, titulo: nomeDoEquipamento(a.equipamento), prazo: a.prazo, abertaId: abertaPorAlvo.get(a.chave) ?? null });
    } else {
      o.abertaId = abertaPorAlvo.get(a.chave) ?? null;
    }
  }
  for (const m of painel.semCadastro) opcaoDe(m);
  const modelosDoMais = [...opcoes.values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  for (const o of modelosDoMais) o.aparelhos.sort((x, y) => x.titulo.localeCompare(y.titulo, "pt-BR", { numeric: true }));

  // Nome de cada alvo, para o histórico (inclusive aparelho já desativado).
  const nomes = new Map(linhas.map((l) => [l.chave, { emoji: l.emoji, texto: l.equipamentoId ? `${l.tipo} ${l.titulo}` : l.titulo }]));
  const historico = (historicoBanco ?? []).map((e) => {
    const n = nomes.get(`${e.modelo_id}:${e.equipamento_id ?? "-"}`);
    return {
      id: e.id,
      emoji: n?.emoji ?? s.emoji,
      texto: n?.texto ?? "Aparelho fora do cadastro",
      quando: e.finalizada_em ? formatarDataHora(e.finalizada_em) : "—",
      por: e.finalizada_por_nome ?? "—",
      alertas: e.alertas ?? 0,
    };
  });

  return (
    <div>
      <PageHeader title={titulo} subtitle={s.subtitulo} fecharHref="/manutencao-central" />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <div className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <p>✅ {sp.sucesso}</p>
          {sp.alertas && (
            <p className="mt-1 text-xs text-green-900">
              Precisa de conserto?{" "}
              <Link href="/chamados" className="font-bold text-primary underline">
                Abrir chamado para manutenção
              </Link>{" "}
              ·{" "}
              <Link href={`/manutencao-preventiva/${sp.alertas}`} className="font-semibold underline">
                ver o que deu alerta
              </Link>
            </p>
          )}
        </div>
      )}

      {painel.semCadastro.length > 0 && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Sem aparelho cadastrado: <strong>{painel.semCadastro.map((m) => m.equipamento).join(", ")}</strong>.{" "}
          {podeCadastrar ? (
            <Link href="/admin/manutencao-preventiva" className="font-semibold text-primary">
              Cadastrar agora →
            </Link>
          ) : (
            "Peça à liderança para cadastrar."
          )}
        </p>
      )}

      <ListaDePreventivas linhas={linhas} filtroInicial={sp.ver ?? null} destaque={sp.alvo ?? null} secao={secao} />

      <details className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📋 Histórico ({historico.length})
        </summary>
        <div className="border-t border-slate-100">
          {historico.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nada registrado ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historico.map((e) => (
                <li key={e.id}>
                  <Link href={`/manutencao-preventiva/${e.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                    <span aria-hidden>{e.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{e.texto}</span>
                      <span className="block text-xs text-slate-500">
                        {e.quando} · {e.por}
                      </span>
                    </span>
                    {e.alertas > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                        {e.alertas} alerta{e.alertas === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        OK
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {modelosDoMais.length > 0 && <NovaPreventiva
          modelos={modelosDoMais}
          podeCadastrar={podeCadastrar}
          titulo={secao === "ferramental" ? "Novo check" : "Nova preventiva"}
        />}

      {/* Espaço para o "+" flutuante não cobrir o fim da tela. */}
      <div className="h-16" aria-hidden />

      {podeCadastrar && (
        <Link
          href="/admin/manutencao-preventiva"
          className="mt-3 block rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          ⚙️ {secao === "ferramental" ? "Frequência do check" : "Aparelhos e frequência"}
        </Link>
      )}
    </div>
  );
}
