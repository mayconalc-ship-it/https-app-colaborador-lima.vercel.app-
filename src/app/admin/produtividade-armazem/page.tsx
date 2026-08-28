import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { PainelCadastro, ItemCadastro, BotaoIcone } from "@/components/admin/CadastroCard";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROTULO_SENSO,
  ROTULO_TURNO,
  SENSOS,
  TURNOS,
  formatarDataHora,
  litrosPorCaixa,
  produtoReepackDeLinha,
  produtoProntoParaReepack,
  type ProdutoReepack,
} from "@/lib/produtividade-armazem";
import { ROTULO_UNIDADE_AG, UNIDADES_AG } from "@/lib/carretas";
import {
  alternarAgAtivo,
  alternarEmpilhadeiraAtivo,
  alternarEmpilhadorAtivo,
  alternarFabricaAtivo,
  alternarItemChecklist5sAtivo,
  alternarMotivoFefoAtivo,
  alternarMotoristaAtivo,
  alternarProdutoAtivo,
  alternarTransportadoraAtivo,
  corrigirHorimetroOperacao,
  corrigirHorimetroTrocaGas,
  editarAg,
  editarEmbalagemDespejo,
  editarEmpilhadeira,
  editarEmpilhador,
  editarFabrica,
  editarItemChecklist5s,
  editarMotivoFefo,
  editarMotorista,
  editarProduto,
  editarTransportadora,
  excluirAg,
  excluirEmpilhadeira,
  excluirEmpilhador,
  excluirFabrica,
  excluirItemChecklist5s,
  excluirLembreteEmpilhadeira,
  excluirMotivoFefo,
  excluirMotorista,
  excluirProduto,
  excluirTransportadora,
  importarPlanilhaProdutos,
  importarProdutos,
  salvarAg,
  salvarConfigRecebimento,
  salvarEmpilhadeira,
  salvarEmpilhador,
  salvarFabrica,
  salvarCustoP20,
  salvarItemChecklist5s,
  salvarLembreteEmpilhadeira,
  salvarMotivoFefo,
  salvarMotorista,
  salvarProduto,
  salvarTransportadora,
} from "./actions";

export const dynamic = "force-dynamic";
// A planilha de produtos chega pesada (4-5 MB, centenas de linhas com
// estilo/fórmula cacheada) e importarPlanilhaProdutos faz várias idas ao
// banco em sequência (embalagens de repack, embalagens de despejo, upsert
// de produtos) -- sem isto, o limite padrão da Vercel (10s) cortava a
// Server Action no meio e o navegador via só "An unexpected response was
// received from the server", sem nenhuma mensagem de erro de verdade.
// Precisa ficar aqui (na página), não no arquivo de actions -- um arquivo
// "use server" só pode exportar funções async, nada mais.
export const maxDuration = 60;

type Aba = "reepack-despejo" | "empilhadeiras" | "recebimento" | "cinco-s" | "fefo";
const ABAS: { id: Aba; rotulo: string; emoji: string }[] = [
  { id: "reepack-despejo", rotulo: "Produtos", emoji: "📦" },
  { id: "empilhadeiras", rotulo: "Empilhadeiras", emoji: "🏗️" },
  { id: "recebimento", rotulo: "Recebimento", emoji: "🚛" },
  { id: "cinco-s", rotulo: "5S", emoji: "🧹" },
  { id: "fefo", rotulo: "FEFO", emoji: "🚨" },
];

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function AdminProdutividadeArmazemPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    erro?: string;
    sucesso?: string;
    buscaProduto?: string;
    buscaReepack?: string;
    buscaOperador?: string;
    buscaHorimetro?: string;
  }>;
}) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda("/admin");
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "reepack-despejo") as Aba;
  const buscaProduto = (sp.buscaProduto ?? "").trim();
  const buscaReepack = (sp.buscaReepack ?? "").trim().toLowerCase();
  const buscaOperador = (sp.buscaOperador ?? "").trim();
  const buscaHorimetro = (sp.buscaHorimetro ?? "").trim();

  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: embalagens },
    { data: embalagensDespejo },
    { data: empilhadeiras },
    { data: lembretes },
    { data: fabricas },
    { data: transportadoras },
    { data: produtos },
    { count: totalProdutos },
    { data: produtosReepackBanco },
    { data: itensChecklist },
    { data: operadoresEncontrados },
    { data: motoristas },
    { data: empilhadores },
    { data: agCatalogo },
    { data: recebimentoConfig },
    { data: operacoesEncontradas },
    { data: motivosFefo },
    podeExcluir,
    { data: empilhadeiraConfig },
    { data: trocasGas },
  ] = await Promise.all([
    supabase
      .from("pa_embalagens")
      .select("id, nome")
      .eq("revenda_id", revendaId)
      .order("nome"),
    supabase
      .from("pa_embalagens_despejo")
      .select("id, nome, litros_por_unidade, meta_litros_hora")
      .eq("revenda_id", revendaId)
      .order("nome"),
    supabase.from("pa_empilhadeiras").select("id, numero, ativo").eq("revenda_id", revendaId).order("numero"),
    supabase
      .from("pa_empilhadeira_lembretes")
      .select("id, operador_nome, turno, ativo")
      .eq("revenda_id", revendaId)
      .order("operador_nome"),
    supabase.from("pa_fabricas").select("id, nome, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_transportadoras").select("id, nome, ativo").eq("revenda_id", revendaId).order("nome"),
    aba === "recebimento" && buscaProduto.length >= 2
      ? supabase
          .from("pa_produtos")
          .select("id, codigo, descricao, ativo")
          .eq("revenda_id", revendaId)
          .or(`codigo.ilike.%${buscaProduto}%,descricao.ilike.%${buscaProduto}%`)
          .order("codigo")
          .limit(100)
      : Promise.resolve({ data: [] as { id: string; codigo: string; descricao: string; ativo: boolean }[] }),
    supabase.from("pa_produtos").select("id", { count: "exact", head: true }).eq("revenda_id", revendaId),
    aba === "reepack-despejo"
      ? supabase
          .from("pa_produtos")
          .select(
            "id, codigo, descricao, cluster_produto, unidades_por_caixa, caixas_pallet, fator_hecto, tipo, embalagem_id, meta_reepack_hora, meta_despejo_hora, ativo",
          )
          .eq("revenda_id", revendaId)
          .not("fator_hecto", "is", null)
          .order("descricao")
      : Promise.resolve({
          data: [] as {
            id: string;
            codigo: string;
            descricao: string;
            cluster_produto: string | null;
            unidades_por_caixa: number | null;
            caixas_pallet: number | null;
            fator_hecto: number | null;
            tipo: string | null;
            embalagem_id: string | null;
            meta_reepack_hora: number | null;
            meta_despejo_hora: number | null;
            ativo: boolean;
          }[],
        }),
    supabase
      .from("pa_checklist_5s_itens")
      .select("id, senso, descricao, ativo")
      .eq("revenda_id", revendaId)
      .order("ordem"),
    aba === "empilhadeiras" && buscaOperador.length >= 2
      ? (() => {
          let q = admin.from("profiles").select("id, nome, cargo").limit(10);
          const digitos = buscaOperador.replace(/\D/g, "");
          q = digitos
            ? q.or(`nome.ilike.%${buscaOperador}%,cpf.ilike.%${digitos}%`)
            : q.ilike("nome", `%${buscaOperador}%`);
          return q;
        })()
      : Promise.resolve({ data: [] as { id: string; nome: string; cargo: string | null }[] }),
    supabase.from("pa_motoristas").select("id, nome, cpf, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_empilhadores").select("id, nome, cpf, ativo").eq("revenda_id", revendaId).order("nome"),
    supabase.from("pa_ag_catalogo").select("id, codigo, descricao, unidade, ativo").eq("revenda_id", revendaId).order("codigo"),
    supabase.from("pa_recebimento_config").select("tma_alvo_minutos, dias_minimos_validade_alerta").eq("revenda_id", revendaId).maybeSingle(),
    aba === "empilhadeiras" && buscaHorimetro.length >= 2
      ? supabase
          .from("pa_empilhadeira_operacoes")
          .select(
            "id, operador_nome, horimetro_inicial, horimetro_final, inicio, fim, status, pa_empilhadeiras(numero)",
          )
          .eq("revenda_id", revendaId)
          .ilike("operador_nome", `%${buscaHorimetro}%`)
          .order("inicio", { ascending: false })
          .limit(20)
      : Promise.resolve({
          data: [] as {
            id: string;
            operador_nome: string;
            horimetro_inicial: number;
            horimetro_final: number | null;
            inicio: string;
            fim: string | null;
            status: string;
            pa_empilhadeiras: { numero: string } | { numero: string }[] | null;
          }[],
        }),
    supabase
      .from("pa_fefo_motivos")
      .select("id, nome, ajuda, emoji, ordem, ativo")
      .eq("revenda_id", revendaId)
      .order("ordem")
      .order("nome"),
    // Apagar motivo é a única ação atrás de "excluir" -- pedido do dono:
    // desativar qualquer um com "editar" pode; apagar, não.
    podeNoModulo("produtividade-armazem", "excluir"),
    supabase.from("pa_empilhadeira_config").select("custo_p20").eq("revenda_id", revendaId).maybeSingle(),
    // Trocas de gás recentes, para corrigir horímetro digitado errado.
    aba === "empilhadeiras"
      ? supabase
          .from("pa_empilhadeira_trocas_gas")
          .select("id, horimetro, realizada_em, operador_nome, pa_empilhadeiras(numero)")
          .eq("revenda_id", revendaId)
          .order("realizada_em", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const totalMotivosFefo = motivosFefo?.length ?? 0;

  const totalEmbalagensDespejo = embalagensDespejo?.length ?? 0;
  const totalEmpilhadeiras = empilhadeiras?.length ?? 0;
  const totalFabricas = fabricas?.length ?? 0;
  const totalTransportadoras = transportadoras?.length ?? 0;
  const totalChecklist = itensChecklist?.length ?? 0;
  const totalMotoristas = motoristas?.length ?? 0;
  const totalEmpilhadores = empilhadores?.length ?? 0;
  const totalAg = agCatalogo?.length ?? 0;

  const embalagemNomePorId = new Map((embalagens ?? []).map((e) => [e.id, e.nome]));

  const produtosReepack: (ProdutoReepack & { ativo: boolean })[] = (produtosReepackBanco ?? []).map((p) => ({
    ...produtoReepackDeLinha(p),
    ativo: p.ativo,
  }));
  const totalProdutosReepack = produtosReepack.length;
  const pendentesReepack = produtosReepack.filter((p) => !produtoProntoParaReepack(p)).length;
  const produtosReepackFiltrados = buscaReepack
    ? produtosReepack.filter(
        (p) => p.codigo.toLowerCase().includes(buscaReepack) || p.descricao.toLowerCase().includes(buscaReepack),
      )
    : produtosReepack;
  // Quem ainda não tem embalagem vinculada sobe pro topo -- é o que falta
  // corrigir na planilha, e não deveria depender de rolar a lista inteira
  // pra achar.
  const produtosReepackOrdenados = [...produtosReepackFiltrados].sort((a, b) => {
    const prontoA = produtoProntoParaReepack(a) ? 1 : 0;
    const prontoB = produtoProntoParaReepack(b) ? 1 : 0;
    return prontoA - prontoB || a.descricao.localeCompare(b.descricao, "pt-BR");
  });

  return (
    <div>
      <PageHeader
        title="Produtividade do Armazém — Configuração"
        subtitle="Produtos do Reepack/Despejo (por planilha), empilhadeiras, catálogos de recebimento e checklist 5S."
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <a
        href="/produtividade-armazem"
        className="mb-4 inline-flex text-sm font-medium text-primary hover:underline"
      >
        ← Ir para o app
      </a>

      {/* Segmented control: mesma ideia da barra do Admin -- ícone sempre
          visível, rótulo junto para não depender só da cor pra dizer qual
          aba está ativa. */}
      <nav className="mb-6 grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {ABAS.map((a) => (
          <a
            key={a.id}
            href={`?aba=${a.id}`}
            aria-current={a.id === aba ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center text-xs font-semibold transition-colors ${
              a.id === aba ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span className="text-base leading-none">{a.emoji}</span>
            {a.rotulo}
          </a>
        ))}
      </nav>

      {aba === "reepack-despejo" && (
        <div className="space-y-6">
          <PainelCadastro
            titulo="Embalagens — Despejo"
            contagem={totalEmbalagensDespejo}
            temItens={totalEmbalagensDespejo > 0}
            vazio="Nenhuma embalagem ainda -- importe a planilha de produtos, ela cria as embalagens sozinha."
            formNovo={
              <p className="text-xs text-slate-500">
                Despejo é lançado por embalagem, não por produto -- e tem catálogo PRÓPRIO,
                diferente do Repack (mesma peça pode ter nome diferente nos dois:
                &ldquo;Lata 350ml C/12&rdquo; no Repack, &ldquo;Lata 350ml&rdquo; no Despejo). O
                litro por unidade já vem calculado da planilha de produtos (Fator Hecto ÷
                Un/Cx); ajuste aqui só se precisar corrigir, e a meta de L/h de cada uma.
              </p>
            }
          >
            {(embalagensDespejo ?? []).map((e) => (
              <ItemCadastro
                key={e.id}
                titulo={e.nome}
                subtitulo={
                  e.litros_por_unidade !== null
                    ? `${e.litros_por_unidade} L/unidade${e.meta_litros_hora ? ` · meta ${e.meta_litros_hora} L/h` : ""}`
                    : "⚠️ sem litro por unidade -- não aparece no lançamento de despejo"
                }
                formEditar={
                  <form action={editarEmbalagemDespejo} className="flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input
                      name="litros_por_unidade"
                      type="number"
                      step="0.001"
                      defaultValue={e.litros_por_unidade ?? ""}
                      placeholder="Litros por unidade"
                      className={campo}
                    />
                    <input
                      name="meta_litros_hora"
                      type="number"
                      step="0.1"
                      defaultValue={e.meta_litros_hora ?? ""}
                      placeholder="Meta L/h"
                      className={campo}
                    />
                    <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Salvar
                    </BotaoEnviar>
                  </form>
                }
              />
            ))}
          </PainelCadastro>

          <PainelCadastro
          titulo="Produtos do Reepack"
          contagem={totalProdutosReepack}
          temItens={totalProdutosReepack > 0}
          vazio="Nenhum produto importado ainda -- importe a planilha de cadastro."
          formNovo={
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Cluster, Fator Hecto, caixas/pallet, unidades/caixa, tipo, embalagem e meta de
                reepack (cx/h) de todo produto vêm desta planilha -- sem cadastro um a um, sem
                vincular embalagem na mão. Produto novo ou meta nova? Atualiza a planilha e
                importa de novo: quem já existe (mesmo código Promax) é atualizado, nunca
                duplicado. Despejo agora é por embalagem, veja o cartão acima.
              </p>
              <form action={importarPlanilhaProdutos} className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  name="arquivo"
                  accept=".xlsx"
                  required
                  className="block flex-1 text-sm text-slate-600"
                />
                <BotaoEnviar
                  textoEnviando="Importando..."
                  className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
                >
                  Importar planilha
                </BotaoEnviar>
              </form>
              <form method="get" className="flex gap-2">
                <input type="hidden" name="aba" value="reepack-despejo" />
                <input
                  name="buscaReepack"
                  defaultValue={buscaReepack}
                  placeholder="Buscar por código ou descrição"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>
            </div>
          }
        >
          {pendentesReepack > 0 && (
            <p className="bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              ⚠️ {pendentesReepack} produto(s) sem embalagem vinculada -- não aparecem no
              lançamento ainda. Corrija a coluna EMBALAGEM_REPACK na planilha e reimporte. Estão
              no topo da lista.
            </p>
          )}
          {produtosReepackOrdenados.map((p) => {
            const pronto = produtoProntoParaReepack(p);
            const embalagemNome = p.embalagemId ? embalagemNomePorId.get(p.embalagemId) : null;
            return (
              <ItemCadastro
                key={p.id}
                ativo={p.ativo}
                titulo={`${pronto ? "" : "⚠️ "}${p.codigo} — ${p.descricao}`}
                subtitulo={
                  p.fatorHecto !== null
                    ? [
                        p.clusterProduto,
                        p.tipo,
                        `${p.unidadesPorCaixa ?? "?"} un/caixa`,
                        `${litrosPorCaixa(p.fatorHecto)} L/caixa`,
                        p.caixasPallet !== null ? `${p.caixasPallet} cx/pallet` : null,
                        embalagemNome ?? "sem embalagem vinculada",
                        `meta reepack ${p.metaReepackHora ?? "—"} cx/h`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Sem Fator Hecto -- corrija na planilha e reimporte"
                }
                acoes={
                  <BotaoIcone
                    action={alternarProdutoAtivo}
                    campos={{ id: p.id, ativo: String(p.ativo), aba: "reepack-despejo" }}
                    titulo={p.ativo ? "Desativar" : "Ativar"}
                  >
                    {p.ativo ? "🚫" : "✅"}
                  </BotaoIcone>
                }
              />
            );
          })}
          </PainelCadastro>
        </div>
      )}

      {aba === "empilhadeiras" && (
        <div className="space-y-6">
          <PainelCadastro
            titulo="Empilhadeiras"
            contagem={totalEmpilhadeiras}
            novoRotulo="Nova"
            temItens={totalEmpilhadeiras > 0}
            vazio="Nenhuma empilhadeira cadastrada ainda."
            formNovo={
              <form action={salvarEmpilhadeira} className="flex gap-2">
                <input name="numero" placeholder="Número/identificação" required className={`${campo} flex-1`} />
                <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            }
          >
            {(empilhadeiras ?? []).map((m) => (
              <ItemCadastro
                key={m.id}
                ativo={m.ativo}
                titulo={`🏗️ ${m.numero}`}
                acoes={
                  <>
                    <BotaoIcone action={alternarEmpilhadeiraAtivo} campos={{ id: m.id, ativo: String(m.ativo) }} titulo={m.ativo ? "Desativar" : "Ativar"}>
                      {m.ativo ? "🚫" : "✅"}
                    </BotaoIcone>
                    <BotaoExcluir
                      action={excluirEmpilhadeira}
                      campos={{ id: m.id }}
                      confirmacao={`Excluir a empilhadeira "${m.numero}"?`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                    >
                      🗑️
                    </BotaoExcluir>
                  </>
                }
                formEditar={
                  <form action={editarEmpilhadeira} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <input name="numero" defaultValue={m.numero} required className={`${campo} flex-1`} />
                    <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Salvar
                    </BotaoEnviar>
                  </form>
                }
              />
            ))}
          </PainelCadastro>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-900">⛽ Valor do botijão P20</h2>
              <p className="mt-1 text-xs text-slate-500">
                Vira custo por hora no dashboard de consumo de gás. Deixe em branco para não mostrar
                valores — as horas e o consumo aparecem do mesmo jeito.
              </p>
            </div>
            <form action={salvarCustoP20} className="flex flex-wrap items-end gap-2 p-4">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="custo_p20">
                  Valor do P20 (R$)
                </label>
                <input
                  id="custo_p20"
                  name="custo_p20"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="Ex: 120,00"
                  defaultValue={empilhadeiraConfig?.custo_p20 ?? ""}
                  className={campo}
                />
              </div>
              <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                Salvar
              </BotaoEnviar>
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-900">🔔 Lembrete de fechamento</h2>
              <p className="mt-1 text-xs text-slate-500">
                Por pessoa, não por máquina: o aviso chega pro empilhadeirista no fim do
                turno dele, se ele estiver com alguma empilhadeira aberta.
              </p>

              <form method="get" className="mt-3 flex gap-2">
                <input type="hidden" name="aba" value="empilhadeiras" />
                <input
                  name="buscaOperador"
                  defaultValue={buscaOperador}
                  placeholder="Buscar empilhadeirista por nome ou CPF"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>

              {buscaOperador.length >= 2 && (
                <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-2">
                  {(operadoresEncontrados ?? []).length === 0 ? (
                    <p className="p-2 text-xs text-slate-400">Ninguém encontrado.</p>
                  ) : (
                    (operadoresEncontrados ?? []).map((p) => (
                      <form
                        key={p.id}
                        action={salvarLembreteEmpilhadeira}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 shadow-sm"
                      >
                        <input type="hidden" name="operador_id" value={p.id} />
                        <input type="hidden" name="operador_nome" value={p.nome} />
                        <span className="flex-1 text-sm text-slate-700">
                          {p.nome}
                          {p.cargo && <span className="text-xs text-slate-400"> · {p.cargo}</span>}
                        </span>
                        <select name="turno" required className={campo}>
                          {TURNOS.map((t) => (
                            <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                          ))}
                        </select>
                        <BotaoEnviar compacto className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
                          Salvar
                        </BotaoEnviar>
                      </form>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {(lembretes ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhum lembrete cadastrado.</p>
              ) : (
                (lembretes ?? []).map((l) => (
                  <ItemCadastro
                    key={l.id}
                    titulo={l.operador_nome}
                    subtitulo={ROTULO_TURNO[l.turno as keyof typeof ROTULO_TURNO] ?? l.turno}
                    acoes={
                      <BotaoExcluir
                        action={excluirLembreteEmpilhadeira}
                        campos={{ id: l.id }}
                        confirmacao={`Excluir o lembrete de ${l.operador_nome}?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-900">⛽ Corrigir horímetro de troca de gás</h2>
              <p className="mt-1 text-xs text-slate-500">
                Um horímetro digitado sem o ponto (5485,0 virando 54850) distorce o ciclo inteiro no
                dashboard de consumo. Últimas 20 trocas.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {(trocasGas ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhuma troca registrada.</p>
              ) : (
                (trocasGas ?? []).map((t) => {
                  const maq = Array.isArray(t.pa_empilhadeiras) ? t.pa_empilhadeiras[0] : t.pa_empilhadeiras;
                  return (
                    <form key={t.id as string} action={corrigirHorimetroTrocaGas} className="space-y-2 p-3">
                      <input type="hidden" name="id" value={t.id as string} />
                      <p className="text-xs text-slate-500">
                        🏗️ {maq?.numero ?? "—"} — {t.operador_nome as string} —{" "}
                        {formatarDataHora(t.realizada_em as string)}
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                            Horímetro da troca
                          </label>
                          <input
                            name="horimetro"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            required
                            defaultValue={String(t.horimetro)}
                            className={`${campo} w-36`}
                          />
                        </div>
                        <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                          Salvar
                        </BotaoEnviar>
                      </div>
                    </form>
                  );
                })
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-900">🛠️ Corrigir horímetro de operação</h2>
              <p className="mt-1 text-xs text-slate-500">
                Para quando o operador digitou o horímetro errado (ex: sem o ponto decimal).
                Só corrige o número -- não reabre nem fecha a operação.
              </p>

              <form method="get" className="mt-3 flex gap-2">
                <input type="hidden" name="aba" value="empilhadeiras" />
                <input
                  name="buscaHorimetro"
                  defaultValue={buscaHorimetro}
                  placeholder="Buscar operação pelo nome do operador"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>
            </div>

            <div className="divide-y divide-slate-100">
              {buscaHorimetro.length > 0 && buscaHorimetro.length < 2 ? (
                <p className="p-6 text-center text-sm text-slate-400">Digite ao menos 2 letras.</p>
              ) : buscaHorimetro.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Busque pelo nome do operador para ver as operações dele.</p>
              ) : (operacoesEncontradas ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhuma operação encontrada.</p>
              ) : (
                (operacoesEncontradas ?? []).map((o) => {
                  const maquina = Array.isArray(o.pa_empilhadeiras) ? o.pa_empilhadeiras[0] : o.pa_empilhadeiras;
                  const encerrada = o.status === "encerrada";
                  return (
                    <form
                      key={o.id}
                      action={corrigirHorimetroOperacao}
                      className="space-y-2 p-3"
                    >
                      <input type="hidden" name="id" value={o.id} />
                      <p className="text-xs text-slate-500">
                        🏗️ {maquina?.numero ?? "—"} — {o.operador_nome} — {formatarDataHora(o.inicio)}
                        {o.fim && ` até ${formatarDataHora(o.fim)}`}
                        {!encerrada && " · em aberto"}
                      </p>
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Horímetro inicial</label>
                          <input
                            name="horimetro_inicial"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min={0}
                            required
                            defaultValue={o.horimetro_inicial}
                            className={`${campo} w-32`}
                          />
                        </div>
                        {encerrada && (
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Horímetro final</label>
                            <input
                              name="horimetro_final"
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              min={0}
                              defaultValue={o.horimetro_final ?? ""}
                              className={`${campo} w-32`}
                            />
                          </div>
                        )}
                        <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                          Salvar
                        </BotaoEnviar>
                      </div>
                    </form>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {aba === "recebimento" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <PainelCadastro
              titulo="Fábricas"
              contagem={totalFabricas}
              temItens={totalFabricas > 0}
              vazio="Nenhuma fábrica cadastrada."
              formNovo={
                <form action={salvarFabrica} className="flex gap-2">
                  <input name="nome" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(fabricas ?? []).map((f) => (
                <ItemCadastro
                  key={f.id}
                  ativo={f.ativo}
                  titulo={f.nome}
                  acoes={
                    <>
                      <BotaoIcone action={alternarFabricaAtivo} campos={{ id: f.id, ativo: String(f.ativo) }} titulo={f.ativo ? "Desativar" : "Ativar"}>
                        {f.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirFabrica}
                        campos={{ id: f.id }}
                        confirmacao={`Excluir "${f.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarFabrica} className="flex gap-2">
                      <input type="hidden" name="id" value={f.id} />
                      <input name="nome" defaultValue={f.nome} required className={`${campo} flex-1`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Transportadoras"
              contagem={totalTransportadoras}
              temItens={totalTransportadoras > 0}
              vazio="Nenhuma transportadora cadastrada."
              formNovo={
                <form action={salvarTransportadora} className="flex gap-2">
                  <input name="nome" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(transportadoras ?? []).map((t) => (
                <ItemCadastro
                  key={t.id}
                  ativo={t.ativo}
                  titulo={t.nome}
                  acoes={
                    <>
                      <BotaoIcone action={alternarTransportadoraAtivo} campos={{ id: t.id, ativo: String(t.ativo) }} titulo={t.ativo ? "Desativar" : "Ativar"}>
                        {t.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirTransportadora}
                        campos={{ id: t.id }}
                        confirmacao={`Excluir "${t.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarTransportadora} className="flex gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input name="nome" defaultValue={t.nome} required className={`${campo} flex-1`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Motoristas"
              contagem={totalMotoristas}
              temItens={totalMotoristas > 0}
              vazio="Nenhum motorista cadastrado."
              formNovo={
                <form action={salvarMotorista} className="flex flex-wrap gap-2">
                  <input name="nome" placeholder="Nome completo" required className={`${campo} flex-1`} />
                  <input name="cpf" placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(motoristas ?? []).map((m) => (
                <ItemCadastro
                  key={m.id}
                  ativo={m.ativo}
                  titulo={m.nome}
                  subtitulo={m.cpf ?? "sem CPF cadastrado"}
                  acoes={
                    <>
                      <BotaoIcone action={alternarMotoristaAtivo} campos={{ id: m.id, ativo: String(m.ativo) }} titulo={m.ativo ? "Desativar" : "Ativar"}>
                        {m.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirMotorista}
                        campos={{ id: m.id }}
                        confirmacao={`Excluir "${m.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarMotorista} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <input name="nome" defaultValue={m.nome} placeholder="Nome completo" required className={`${campo} flex-1`} />
                      <input name="cpf" defaultValue={m.cpf ?? ""} placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <PainelCadastro
              titulo="Empilhadores"
              contagem={totalEmpilhadores}
              temItens={totalEmpilhadores > 0}
              vazio="Nenhum empilhador cadastrado."
              formNovo={
                <form action={salvarEmpilhador} className="flex flex-wrap gap-2">
                  <input name="nome" placeholder="Nome completo" required className={`${campo} flex-1`} />
                  <input name="cpf" placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(empilhadores ?? []).map((e) => (
                <ItemCadastro
                  key={e.id}
                  ativo={e.ativo}
                  titulo={e.nome}
                  subtitulo={e.cpf ?? "sem CPF cadastrado"}
                  acoes={
                    <>
                      <BotaoIcone action={alternarEmpilhadorAtivo} campos={{ id: e.id, ativo: String(e.ativo) }} titulo={e.ativo ? "Desativar" : "Ativar"}>
                        {e.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirEmpilhador}
                        campos={{ id: e.id }}
                        confirmacao={`Excluir "${e.nome}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarEmpilhador} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="nome" defaultValue={e.nome} placeholder="Nome completo" required className={`${campo} flex-1`} />
                      <input name="cpf" defaultValue={e.cpf ?? ""} placeholder="CPF" inputMode="numeric" maxLength={14} required className={`${campo} w-40`} />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PainelCadastro
              titulo="AG (Ativo de Giro que retorna na carreta)"
              contagem={totalAg}
              temItens={totalAg > 0}
              vazio="Nenhum AG cadastrado."
              formNovo={
                <form action={salvarAg} className="flex flex-wrap gap-2">
                  <input name="codigo" placeholder="Código" required className={campo} />
                  <input name="descricao" placeholder="Descrição" required className={`${campo} flex-1`} />
                  <select name="unidade" className={campo} defaultValue="palete">
                    {UNIDADES_AG.map((u) => (
                      <option key={u} value={u}>{ROTULO_UNIDADE_AG[u]}</option>
                    ))}
                  </select>
                  <BotaoEnviar className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
              }
            >
              {(agCatalogo ?? []).map((a) => (
                <ItemCadastro
                  key={a.id}
                  ativo={a.ativo}
                  titulo={`${a.codigo} — ${a.descricao}`}
                  subtitulo={ROTULO_UNIDADE_AG[a.unidade as "palete" | "unidade"] ?? a.unidade}
                  acoes={
                    <>
                      <BotaoIcone action={alternarAgAtivo} campos={{ id: a.id, ativo: String(a.ativo) }} titulo={a.ativo ? "Desativar" : "Ativar"}>
                        {a.ativo ? "🚫" : "✅"}
                      </BotaoIcone>
                      <BotaoExcluir
                        action={excluirAg}
                        campos={{ id: a.id }}
                        confirmacao={`Excluir o AG "${a.codigo} — ${a.descricao}"?`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                      >
                        🗑️
                      </BotaoExcluir>
                    </>
                  }
                  formEditar={
                    <form action={editarAg} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <input name="codigo" defaultValue={a.codigo} className={`${campo} w-28`} />
                      <input name="descricao" defaultValue={a.descricao} className={`${campo} flex-1`} />
                      <select name="unidade" className={campo} defaultValue={a.unidade}>
                        {UNIDADES_AG.map((u) => (
                          <option key={u} value={u}>{ROTULO_UNIDADE_AG[u]}</option>
                        ))}
                      </select>
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Salvar
                      </BotaoEnviar>
                    </form>
                  }
                />
              ))}
            </PainelCadastro>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold text-slate-900">⚙️ Configuração do Monitor</h2>
                <p className="mt-1 text-xs text-slate-500">
                  TMA alvo alimenta o sinalizador do Monitor de Recebimento (vermelho quando estourar).
                  Dias mínimos de validade alimenta o alerta que o conferente vê ao lançar um item perto de vencer.
                </p>
              </div>
              <form action={salvarConfigRecebimento} className="space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="tma_alvo_minutos">
                    TMA alvo (minutos)
                  </label>
                  <input
                    id="tma_alvo_minutos"
                    name="tma_alvo_minutos"
                    type="number"
                    min={1}
                    step="1"
                    required
                    defaultValue={recebimentoConfig?.tma_alvo_minutos ?? 120}
                    className={campo}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="dias_minimos_validade_alerta">
                    Dias mínimos de validade (alerta)
                  </label>
                  <input
                    id="dias_minimos_validade_alerta"
                    name="dias_minimos_validade_alerta"
                    type="number"
                    min={0}
                    step="1"
                    required
                    defaultValue={recebimentoConfig?.dias_minimos_validade_alerta ?? 30}
                    className={campo}
                  />
                </div>
                <BotaoEnviar className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Salvar configuração
                </BotaoEnviar>
              </form>
            </div>
          </div>

          <PainelCadastro
            titulo="Produtos"
            contagem={totalProdutos ?? 0}
            temItens
            formNovo={
              <div className="space-y-3">
                <form action={salvarProduto} className="flex flex-wrap gap-2">
                  <input name="codigo" placeholder="Código" required className={campo} />
                  <input name="descricao" placeholder="Descrição" required className={`${campo} flex-1`} />
                  <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                    Adicionar
                  </BotaoEnviar>
                </form>
                <details>
                  <summary className="cursor-pointer text-xs font-semibold text-primary">
                    Importar vários de uma vez
                  </summary>
                  <form action={importarProdutos} className="mt-2 space-y-2">
                    <textarea
                      name="lista"
                      rows={5}
                      placeholder={"código;descrição\ncódigo;descrição"}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <BotaoEnviar compacto className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                      Importar lista
                    </BotaoEnviar>
                  </form>
                </details>
              </div>
            }
          >
            <div className="p-4">
              <form method="get" className="flex gap-2">
                <input type="hidden" name="aba" value="recebimento" />
                <input
                  name="buscaProduto"
                  defaultValue={buscaProduto}
                  placeholder="Buscar por código ou descrição (a lista completa não cabe aqui)"
                  className={`${campo} flex-1`}
                />
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Buscar
                </button>
              </form>
            </div>
            <div className="border-t border-slate-100">
              {buscaProduto.length > 0 && buscaProduto.length < 2 ? (
                <p className="p-6 text-center text-sm text-slate-400">Digite ao menos 2 letras.</p>
              ) : buscaProduto.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  {totalProdutos ?? 0} produtos na base -- busque para ver, editar ou excluir.
                </p>
              ) : (produtos ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">Nenhum produto encontrado.</p>
              ) : (
                <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                  {(produtos ?? []).map((p) => (
                    <ItemCadastro
                      key={p.id}
                      ativo={p.ativo}
                      titulo={`${p.codigo} — ${p.descricao}`}
                      acoes={
                        <>
                          <BotaoIcone action={alternarProdutoAtivo} campos={{ id: p.id, ativo: String(p.ativo) }} titulo={p.ativo ? "Desativar" : "Ativar"}>
                            {p.ativo ? "🚫" : "✅"}
                          </BotaoIcone>
                          <BotaoExcluir
                            action={excluirProduto}
                            campos={{ id: p.id }}
                            confirmacao={`Excluir o produto "${p.codigo}"?`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        </>
                      }
                      formEditar={
                        <form action={editarProduto} className="flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <input name="codigo" defaultValue={p.codigo} className={`${campo} w-28`} />
                          <input name="descricao" defaultValue={p.descricao} className={`${campo} flex-1`} />
                          <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                            Salvar
                          </BotaoEnviar>
                        </form>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </PainelCadastro>
        </div>
      )}

      {aba === "fefo" && (
        <PainelCadastro
          titulo="Motivos de quebra de FEFO"
          contagem={totalMotivosFefo}
          novoRotulo="Novo motivo"
          temItens={totalMotivosFefo > 0}
          vazio="Nenhum motivo cadastrado."
          formNovo={
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                É o que o colaborador escolhe ao informar uma quebra. A explicação aparece embaixo
                da opção -- sem ela, duas pessoas classificam a mesma quebra de jeitos diferentes e
                agrupar por motivo deixa de dizer alguma coisa. A ordem define a posição na lista.
              </p>
              <form action={salvarMotivoFefo} className="flex flex-wrap gap-2">
                <input name="emoji" placeholder="🚨" maxLength={4} className={`${campo} w-16`} />
                <input name="nome" placeholder="Nome do motivo" required className={`${campo} flex-1`} />
                <input name="ordem" type="number" placeholder="Ordem" className={`${campo} w-20`} />
                <input name="ajuda" placeholder="Quando usar este motivo" className={`${campo} w-full`} />
                <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            </div>
          }
        >
          {(motivosFefo ?? []).map((m) => (
            <ItemCadastro
              key={m.id}
              ativo={m.ativo}
              titulo={`${m.emoji ? `${m.emoji} ` : ""}${m.nome}`}
              subtitulo={m.ajuda ?? "sem explicação cadastrada"}
              acoes={
                <>
                  <BotaoIcone
                    action={alternarMotivoFefoAtivo}
                    campos={{ id: m.id, ativo: String(m.ativo), aba: "fefo" }}
                    titulo={m.ativo ? "Desativar" : "Ativar"}
                  >
                    {m.ativo ? "🚫" : "✅"}
                  </BotaoIcone>
                  {podeExcluir && (
                    <BotaoExcluir
                      action={excluirMotivoFefo}
                      campos={{ id: m.id }}
                      confirmacao={`Excluir o motivo "${m.nome}"? Se já foi usado numa ocorrência, prefira Desativar.`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                    >
                      🗑️
                    </BotaoExcluir>
                  )}
                </>
              }
              formEditar={
                <form action={editarMotivoFefo} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <input name="emoji" defaultValue={m.emoji ?? ""} maxLength={4} className={`${campo} w-16`} />
                  <input name="nome" defaultValue={m.nome} required className={`${campo} flex-1`} />
                  <input name="ordem" type="number" defaultValue={m.ordem} className={`${campo} w-20`} />
                  <input name="ajuda" defaultValue={m.ajuda ?? ""} placeholder="Quando usar" className={`${campo} w-full`} />
                  <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                    Salvar
                  </BotaoEnviar>
                </form>
              }
            />
          ))}
        </PainelCadastro>
      )}

      {aba === "cinco-s" && (
        <div className="space-y-6">
          <PainelCadastro
            titulo="Checklist 5S"
            contagem={totalChecklist}
            novoRotulo="Novo item"
            temItens
            formNovo={
              <form action={salvarItemChecklist5s} className="flex flex-wrap gap-2">
                <select name="senso" required className={campo}>
                  {SENSOS.map((s) => (
                    <option key={s} value={s}>{ROTULO_SENSO[s]}</option>
                  ))}
                </select>
                <input name="descricao" placeholder="Descrição do item" required className={`${campo} flex-1`} />
                <BotaoEnviar className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
                  Adicionar
                </BotaoEnviar>
              </form>
            }
          >
            {null}
          </PainelCadastro>

          {SENSOS.map((senso) => {
            const doSenso = (itensChecklist ?? []).filter((i) => i.senso === senso);
            if (doSenso.length === 0) return null;
            return (
              <div key={senso} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h3 className="border-b border-slate-100 p-4 text-sm font-bold text-slate-900">
                  {ROTULO_SENSO[senso]}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                    {doSenso.length}
                  </span>
                </h3>
                <div className="divide-y divide-slate-100">
                  {doSenso.map((i) => (
                    <ItemCadastro
                      key={i.id}
                      ativo={i.ativo}
                      titulo={i.descricao}
                      acoes={
                        <>
                          <BotaoIcone action={alternarItemChecklist5sAtivo} campos={{ id: i.id, ativo: String(i.ativo) }} titulo={i.ativo ? "Desativar" : "Ativar"}>
                            {i.ativo ? "🚫" : "✅"}
                          </BotaoIcone>
                          <BotaoExcluir
                            action={excluirItemChecklist5s}
                            campos={{ id: i.id }}
                            confirmacao="Excluir este item do checklist?"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                          >
                            🗑️
                          </BotaoExcluir>
                        </>
                      }
                      formEditar={
                        <form action={editarItemChecklist5s} className="flex gap-2">
                          <input type="hidden" name="id" value={i.id} />
                          <input name="descricao" defaultValue={i.descricao} className={`${campo} flex-1`} />
                          <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                            Salvar
                          </BotaoEnviar>
                        </form>
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
