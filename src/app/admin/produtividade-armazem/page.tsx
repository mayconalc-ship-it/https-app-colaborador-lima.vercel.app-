import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { PainelCadastro, ItemCadastro, BotaoIcone } from "@/components/admin/CadastroCard";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROTULO_SENSO,
  ROTULO_TURNO,
  SENSOS,
  TURNOS,
  litrosPorCaixa,
  produtoReepackDeLinha,
  produtoProntoParaReepack,
  type ProdutoReepack,
} from "@/lib/produtividade-armazem";
import {
  alternarEmbalagemAtivo,
  alternarEmpilhadeiraAtivo,
  alternarFabricaAtivo,
  alternarItemChecklist5sAtivo,
  alternarProdutoAtivo,
  alternarTransportadoraAtivo,
  editarEmbalagem,
  editarEmpilhadeira,
  editarFabrica,
  editarFatorProduto,
  editarItemChecklist5s,
  editarProduto,
  editarTransportadora,
  excluirEmbalagem,
  excluirEmpilhadeira,
  excluirFabrica,
  excluirItemChecklist5s,
  excluirLembreteEmpilhadeira,
  excluirProduto,
  excluirTransportadora,
  importarProdutos,
  salvarEmbalagem,
  salvarEmpilhadeira,
  salvarFabrica,
  salvarItemChecklist5s,
  salvarLembreteEmpilhadeira,
  salvarProduto,
  salvarTransportadora,
  vincularEmbalagemProduto,
} from "./actions";

export const dynamic = "force-dynamic";

type Aba = "embalagens" | "reepack-despejo" | "empilhadeiras" | "recebimento" | "cinco-s";
const ABAS: { id: Aba; rotulo: string; emoji: string }[] = [
  { id: "embalagens", rotulo: "Embalagens", emoji: "📦" },
  { id: "reepack-despejo", rotulo: "Reepack", emoji: "🧃" },
  { id: "empilhadeiras", rotulo: "Empilhadeiras", emoji: "🏗️" },
  { id: "recebimento", rotulo: "Recebimento", emoji: "🚛" },
  { id: "cinco-s", rotulo: "5S", emoji: "🧹" },
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
  }>;
}) {
  await requireModulo("produtividade-armazem", "editar");
  const revendaId = await exigirRevenda("/admin");
  const sp = await searchParams;
  const aba: Aba = (ABAS.find((a) => a.id === sp.aba)?.id ?? "embalagens") as Aba;
  const buscaProduto = (sp.buscaProduto ?? "").trim();
  const buscaReepack = (sp.buscaReepack ?? "").trim().toLowerCase();
  const buscaOperador = (sp.buscaOperador ?? "").trim();

  const supabase = await createClient();
  const admin = createAdminClient();

  const [
    { data: embalagens },
    { data: empilhadeiras },
    { data: lembretes },
    { data: fabricas },
    { data: transportadoras },
    { data: produtos },
    { count: totalProdutos },
    { data: produtosReepackBanco },
    { data: itensChecklist },
    { data: operadoresEncontrados },
  ] = await Promise.all([
    supabase
      .from("pa_embalagens")
      .select(
        "id, nome, tempo_padrao_reepack_segundos, tempo_padrao_despejo_segundos, meta_reepacks_hora, meta_litros_hora, unidade_reepack, litros_por_pacote, ativo",
      )
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
          .select("id, codigo, descricao, unidades_por_caixa, fator_hecto, embalagem_id, ativo")
          .eq("revenda_id", revendaId)
          .not("fator_hecto", "is", null)
          .order("descricao")
      : Promise.resolve({ data: [] as { id: string; codigo: string; descricao: string; unidades_por_caixa: number | null; fator_hecto: number | null; embalagem_id: string | null; ativo: boolean }[] }),
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
  ]);

  const totalEmbalagens = embalagens?.length ?? 0;
  const totalEmpilhadeiras = empilhadeiras?.length ?? 0;
  const totalFabricas = fabricas?.length ?? 0;
  const totalTransportadoras = transportadoras?.length ?? 0;
  const totalChecklist = itensChecklist?.length ?? 0;

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
  // fazer, e não deveria depender de rolar a lista inteira pra achar.
  const produtosReepackOrdenados = [...produtosReepackFiltrados].sort((a, b) => {
    const prontoA = produtoProntoParaReepack(a) ? 1 : 0;
    const prontoB = produtoProntoParaReepack(b) ? 1 : 0;
    return prontoA - prontoB || a.descricao.localeCompare(b.descricao, "pt-BR");
  });
  const embalagensAtivas = (embalagens ?? []).filter((e) => e.ativo);

  return (
    <div>
      <PageHeader
        title="Produtividade do Armazém — Configuração"
        subtitle="Embalagens, produtos do Reepack/Despejo, empilhadeiras, catálogos de recebimento e checklist 5S."
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
      <nav className="mb-6 grid grid-cols-5 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
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

      {aba === "embalagens" && (
        <PainelCadastro
          titulo="Embalagens"
          contagem={totalEmbalagens}
          novoRotulo="Nova"
          temItens={totalEmbalagens > 0}
          vazio="Nenhuma embalagem cadastrada ainda."
          formNovo={
            <>
              <form action={salvarEmbalagem} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <input name="nome" placeholder="Nome" required className={`${campo} col-span-2 sm:col-span-1`} />
                <input
                  name="tempo_padrao_reepack_segundos"
                  type="number"
                  step="0.1"
                  placeholder="Tempo reepack (s)"
                  className={campo}
                />
                <input
                  name="tempo_padrao_despejo_segundos"
                  type="number"
                  step="0.1"
                  placeholder="Tempo despejo (s)"
                  className={campo}
                />
                <select name="unidade_reepack" className={campo} defaultValue="cx">
                  <option value="cx">Reepack em caixa</option>
                  <option value="pc">Reepack em peça</option>
                </select>
                <input
                  name="litros_por_pacote"
                  type="number"
                  step="0.001"
                  placeholder="Litros por pacote"
                  className={campo}
                />
                <input name="meta_reepacks_hora" type="number" step="0.1" placeholder="Meta reepack/h" className={campo} />
                <input name="meta_litros_hora" type="number" step="0.1" placeholder="Meta L/h" className={campo} />
                <BotaoEnviar className="col-span-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white sm:col-span-5">
                  Adicionar
                </BotaoEnviar>
              </form>
              <p className="mt-2 text-xs text-slate-500">
                &quot;Litros por pacote&quot; é obrigatório para lançar despejo desta embalagem.
              </p>
            </>
          }
        >
          {(embalagens ?? []).map((e) => (
            <ItemCadastro
              key={e.id}
              ativo={e.ativo}
              titulo={e.nome}
              subtitulo={`Reepack em ${e.unidade_reepack === "pc" ? "peça" : "caixa"}${e.litros_por_pacote ? ` · ${e.litros_por_pacote} L/pacote` : ""}${e.meta_reepacks_hora ? ` · meta ${e.meta_reepacks_hora}/h` : ""}`}
              acoes={
                <>
                  <BotaoIcone action={alternarEmbalagemAtivo} campos={{ id: e.id, ativo: String(e.ativo) }} titulo={e.ativo ? "Desativar" : "Ativar"}>
                    {e.ativo ? "🚫" : "✅"}
                  </BotaoIcone>
                  <BotaoExcluir
                    action={excluirEmbalagem}
                    campos={{ id: e.id }}
                    confirmacao={`Excluir a embalagem "${e.nome}"?`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sm hover:bg-red-50"
                  >
                    🗑️
                  </BotaoExcluir>
                </>
              }
              formEditar={
                <form action={editarEmbalagem} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <input type="hidden" name="id" value={e.id} />
                  <input name="nome" defaultValue={e.nome} placeholder="Nome" required className={campo} />
                  <input
                    name="tempo_padrao_reepack_segundos"
                    type="number"
                    step="0.1"
                    defaultValue={e.tempo_padrao_reepack_segundos ?? ""}
                    placeholder="Tempo reepack (s)"
                    className={campo}
                  />
                  <input
                    name="tempo_padrao_despejo_segundos"
                    type="number"
                    step="0.1"
                    defaultValue={e.tempo_padrao_despejo_segundos ?? ""}
                    placeholder="Tempo despejo (s)"
                    className={campo}
                  />
                  <select name="unidade_reepack" defaultValue={e.unidade_reepack} className={campo}>
                    <option value="cx">Reepack em caixa</option>
                    <option value="pc">Reepack em peça</option>
                  </select>
                  <input
                    name="litros_por_pacote"
                    type="number"
                    step="0.001"
                    defaultValue={e.litros_por_pacote ?? ""}
                    placeholder="Litros por pacote"
                    className={campo}
                  />
                  <input
                    name="meta_reepacks_hora"
                    type="number"
                    step="0.1"
                    defaultValue={e.meta_reepacks_hora ?? ""}
                    placeholder="Meta reepack/h"
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
                  <BotaoEnviar compacto className="col-span-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white sm:col-span-5">
                    Salvar
                  </BotaoEnviar>
                </form>
              }
            />
          ))}
        </PainelCadastro>
      )}

      {aba === "reepack-despejo" && (
        <PainelCadastro
          titulo="Produtos do Reepack/Despejo"
          contagem={totalProdutosReepack}
          temItens={totalProdutosReepack > 0}
          vazio="Nenhum produto importado ainda -- peça para rodar o script de importação a partir da base de códigos do SAP."
          formNovo={
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                Estes produtos vêm de uma importação (código Promax + descrição + Fator/Fator
                Hecto direto do SAP) -- não se cadastra um a um aqui. O que falta fazer,
                produto a produto, é <strong>vincular a embalagem</strong>: sem isso ele não
                aparece na tela de lançamento, mesmo já tendo o litro calculado.
              </p>
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
              lançamento ainda. Estão no topo da lista.
            </p>
          )}
          {produtosReepackOrdenados.map((p) => {
            const pronto = produtoProntoParaReepack(p);
            const embalagemAtual = (embalagens ?? []).find((e) => e.id === p.embalagemId);
            return (
              <ItemCadastro
                key={p.id}
                ativo={p.ativo}
                titulo={`${pronto ? "" : "⚠️ "}${p.codigo} — ${p.descricao}`}
                subtitulo={
                  p.fatorHecto !== null
                    ? `${p.unidadesPorCaixa ?? "?"} un/caixa · ${litrosPorCaixa(p.fatorHecto)} L/caixa · ${
                        embalagemAtual ? embalagemAtual.nome : "sem embalagem vinculada"
                      }`
                    : "Sem Fator Hecto -- ajuste manual necessário"
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
                formEditar={
                  <div className="space-y-3">
                    <form action={vincularEmbalagemProduto} className="flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="embalagem_id" defaultValue={p.embalagemId ?? ""} className={`${campo} flex-1`}>
                        <option value="">Sem embalagem</option>
                        {embalagensAtivas.map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </select>
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">
                        Vincular
                      </BotaoEnviar>
                    </form>
                    <form action={editarFatorProduto} className="flex gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        name="unidades_por_caixa"
                        type="number"
                        step="1"
                        defaultValue={p.unidadesPorCaixa ?? ""}
                        placeholder="Un/caixa"
                        className={campo}
                      />
                      <input
                        name="fator_hecto"
                        type="number"
                        step="0.000001"
                        defaultValue={p.fatorHecto ?? ""}
                        placeholder="Fator Hecto (hL/caixa)"
                        className={campo}
                      />
                      <BotaoEnviar compacto className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">
                        Corrigir
                      </BotaoEnviar>
                    </form>
                  </div>
                }
              />
            );
          })}
        </PainelCadastro>
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
