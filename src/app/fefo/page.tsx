import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { temAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  ROTULO_UNIDADE_FEFO_CURTO,
  diasAberta,
  ehUnidadeFefo,
  compararNomes,
  rotuloValidade,
  type DepositoFefo,
  type MotivoFefo,
  type RuaFefo,
} from "@/lib/fefo";
import { FormQuebraFefo } from "./FormQuebraFefo";
import { tratarQuebraFefo } from "./actions";

export const dynamic = "force-dynamic";

type Aba = "informar" | "controle";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Ocorrencia = {
  id: string;
  quantidade: number;
  unidade: string;
  validade: string;
  menor_validade: string | null;
  deposito: string;
  // TEXTO desde a 097: rua "01" e "A1" existem, e o nome fica gravado.
  rua: string;
  ponto: string | null;
  rua_bloqueada: boolean;
  foto_url: string | null;
  observacao: string | null;
  colaborador_id: string;
  colaborador_nome: string;
  criado_em: string;
  status: string;
  acao: string | null;
  tratado_por_nome: string | null;
  tratado_em: string | null;
  pa_produtos: { codigo: string; descricao: string } | { codigo: string; descricao: string }[] | null;
  pa_fefo_motivos: { nome: string; emoji: string | null } | { nome: string; emoji: string | null }[] | null;
};

function produtoRotulo(v: Ocorrencia["pa_produtos"]) {
  const p = Array.isArray(v) ? v[0] : v;
  return p ? `${p.codigo} — ${p.descricao}` : "—";
}

function motivoRotulo(v: Ocorrencia["pa_fefo_motivos"]) {
  const m = Array.isArray(v) ? v[0] : v;
  if (!m) return "—";
  return `${m.emoji ? `${m.emoji} ` : ""}${m.nome}`;
}

export default async function FefoPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  // Os dois papéis abrem a MESMA tela; o que muda é o que cada um faz
  // nela. Mesma checagem que a ação do servidor usa (temAcessoModulo, que
  // enxerga a liberação individual do módulo).
  const [podeInformar, podeControlar] = await Promise.all([
    temAcessoModulo("fefo"),
    temAcessoModulo("fefo-controle"),
  ]);
  if (!podeInformar && !podeControlar) {
    redirect(`/?erro=${encodeURIComponent("Você não tem acesso a este módulo. Fale com o Admin.")}`);
  }

  const sp = await searchParams;
  const aba: Aba = sp.aba === "controle" && podeControlar ? "controle" : podeInformar ? "informar" : "controle";

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const colunas =
    "id, quantidade, unidade, validade, menor_validade, deposito, rua, ponto, rua_bloqueada, foto_url, observacao, colaborador_id, colaborador_nome, criado_em, status, acao, tratado_por_nome, tratado_em, pa_produtos(codigo, descricao), pa_fefo_motivos(nome, emoji)";

  const [
    { data: produtosBanco },
    { data: minhasBanco },
    { data: todasBanco },
    { data: motivosBanco },
    { data: depositosBanco },
    { data: ruasBanco },
  ] = await Promise.all([
    podeInformar
      ? supabase
          .from("pa_produtos")
          .select("cluster_produto, tipo")
          .eq("revenda_id", revendaId)
          .eq("ativo", true)
      : Promise.resolve({ data: [] as { cluster_produto: string | null; tipo: string | null }[] }),
    supabase
      .from("pa_fefo_ocorrencias")
      .select(colunas)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id)
      .order("criado_em", { ascending: false })
      .limit(20),
    podeControlar
      ? supabase
          .from("pa_fefo_ocorrencias")
          .select(colunas)
          .eq("revenda_id", revendaId)
          .order("criado_em", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as Ocorrencia[] }),
    supabase
      .from("pa_fefo_motivos")
      .select("id, nome, ajuda, emoji")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    // Onde a quebra está: os dois catálogos da migration 097. Só quem
    // pode informar precisa deles -- quem só acompanha lê o nome já
    // gravado na ocorrência.
    podeInformar
      ? supabase
          .from("pa_fefo_depositos")
          .select("id, nome")
          .eq("revenda_id", revendaId)
          .eq("ativo", true)
          .order("ordem")
          .order("nome")
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    podeInformar
      ? supabase
          .from("pa_fefo_ruas")
          .select("id, deposito_id, nome")
          .eq("revenda_id", revendaId)
          .eq("ativo", true)
          .order("ordem")
          .order("nome")
      : Promise.resolve({ data: [] as { id: string; deposito_id: string; nome: string }[] }),
  ]);

  const clusters = [
    ...new Set((produtosBanco ?? []).map((p) => p.cluster_produto).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tipos = [
    ...new Set((produtosBanco ?? []).map((p) => p.tipo).filter((t): t is string => Boolean(t))),
  ].sort();

  const motivos = (motivosBanco ?? []) as MotivoFefo[];
  // Pelo NOME, como no Admin: o campo "ordem" saiu da tela porque um
  // número invisível decidindo a lista é o tipo de coisa que ninguém
  // relaciona com o que está vendo (ver compararNomes).
  const depositos: DepositoFefo[] = [...(depositosBanco ?? [])].sort(compararNomes);
  const ruas: RuaFefo[] = (ruasBanco ?? []).map((r) => ({
    id: r.id,
    depositoId: r.deposito_id,
    nome: r.nome,
  }));
  const minhas = (minhasBanco ?? []) as unknown as Ocorrencia[];
  const todas = (todasBanco ?? []) as unknown as Ocorrencia[];
  const abertas = todas.filter((o) => o.status === "aberta");
  const tratadas = todas.filter((o) => o.status === "tratada");

  const abas: { id: Aba; rotulo: string; visivel: boolean }[] = [
    { id: "informar", rotulo: "Informar", visivel: podeInformar },
    { id: "controle", rotulo: `Controle${abertas.length > 0 ? ` (${abertas.length})` : ""}`, visivel: podeControlar },
  ];

  return (
    <div>
      <PageHeader
        title="🚨 Quebra de FEFO"
        subtitle="Achou produto fora da ordem de validade? Avise aqui — o controle recebe na hora."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>}

      {abas.filter((a) => a.visivel).length > 1 && (
        <nav className="mb-4 flex flex-wrap gap-2">
          {abas
            .filter((a) => a.visivel)
            .map((a) => (
              <a
                key={a.id}
                href={`?aba=${a.id}`}
                aria-current={a.id === aba ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  a.id === aba
                    ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {a.rotulo}
              </a>
            ))}
        </nav>
      )}

      {aba === "informar" && podeInformar && (
        <section className="space-y-6">
          <FormQuebraFefo
            clusters={clusters}
            tipos={tipos}
            motivos={motivos}
            depositos={depositos}
            ruas={ruas}
          />

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">O que eu informei</h2>
            {minhas.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Você ainda não informou nenhuma quebra de FEFO.
              </p>
            ) : (
              <ul className="space-y-2">
                {minhas.map((o) => (
                  <CartaoOcorrencia key={o.id} o={o} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {aba === "controle" && podeControlar && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Aguardando tratativa ({abertas.length})
            </h2>
            {abertas.length === 0 ? (
              <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                ✅ Nenhuma quebra de FEFO em aberto.
              </p>
            ) : (
              <ul className="space-y-2">
                {abertas.map((o) => (
                  <CartaoOcorrencia key={o.id} o={o} mostrarQuemInformou podeTratar />
                ))}
              </ul>
            )}
          </div>

          {tratadas.length > 0 && (
            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
                Já tratadas ({tratadas.length})
              </summary>
              <ul className="space-y-2 border-t border-slate-100 p-4">
                {tratadas.map((o) => (
                  <CartaoOcorrencia key={o.id} o={o} mostrarQuemInformou />
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function CartaoOcorrencia({
  o,
  mostrarQuemInformou = false,
  podeTratar = false,
}: {
  o: Ocorrencia;
  mostrarQuemInformou?: boolean;
  podeTratar?: boolean;
}) {
  const prazo = rotuloValidade(o.validade);
  const aberta = o.status === "aberta";
  const dias = diasAberta(o.criado_em);

  return (
    <li
      className={`rounded-2xl border p-4 shadow-sm ${
        aberta ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{motivoRotulo(o.pa_fefo_motivos)}</p>
          <p className="mt-0.5 break-words text-sm text-slate-700">{produtoRotulo(o.pa_produtos)}</p>
          <p className="text-xs text-slate-600">
            {o.quantidade} {ehUnidadeFefo(o.unidade) ? ROTULO_UNIDADE_FEFO_CURTO[o.unidade] : o.unidade} ·
            Depósito {o.deposito}, rua {o.rua}
            {o.ponto ? ` · ${o.ponto}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {aberta ? (
            <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
              {dias === 0 ? "Hoje" : `Há ${dias} dia${dias === 1 ? "" : "s"}`}
            </span>
          ) : (
            <span className="rounded-lg bg-green-50 px-2 py-1 text-xs font-bold text-green-700">✅ Tratada</span>
          )}
          {o.rua_bloqueada && (
            <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              🔒 Rua bloqueada
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className={prazo.critico ? "font-semibold text-red-700" : "text-slate-500"}>
          {prazo.critico ? "⚠️ " : ""}Validade {o.validade} — {prazo.texto}
        </span>
        {o.menor_validade ? (
          <span className="text-slate-500">Menor no estoque: {o.menor_validade}</span>
        ) : (
          <span className="text-slate-400">Menor no estoque: não informada</span>
        )}
      </div>

      {o.observacao && <p className="mt-2 text-xs text-slate-600">{o.observacao}</p>}

      {o.foto_url && (
        <div className="mt-2">
          <FotoEvidencia src={o.foto_url} alt="Foto da quebra de FEFO" classeCaixa="h-24 w-32" />
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        {mostrarQuemInformou ? `${o.colaborador_nome} · ` : ""}
        {formatarDataHora(o.criado_em)}
      </p>

      {o.status === "tratada" && o.acao && (
        <div className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-bold uppercase text-green-800">Ação tomada</p>
          <p className="mt-1 text-sm text-green-900">{o.acao}</p>
          <p className="mt-1 text-[11px] text-green-700">
            {o.tratado_por_nome} · {o.tratado_em ? formatarDataHora(o.tratado_em) : ""}
          </p>
        </div>
      )}

      {podeTratar && aberta && (
        <form action={tratarQuebraFefo} className="mt-3 space-y-2 rounded-xl bg-white p-3">
          <input type="hidden" name="id" value={o.id} />

          {/* Quem informou nem sempre sabe a menor data do estoque. O
              campo só aparece quando ela ficou em branco -- completar é
              uma coisa, reescrever o que o colega informou é outra. */}
          {!o.menor_validade && (
            <div>
              <label
                className="mb-1 block text-xs font-semibold uppercase text-slate-500"
                htmlFor={`menor-${o.id}`}
              >
                Menor validade no estoque <span className="normal-case text-slate-400">(se souber)</span>
              </label>
              <input id={`menor-${o.id}`} name="menor_validade" type="date" className={campo} />
            </div>
          )}

          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor={`acao-${o.id}`}>
            Qual ação foi tomada?
          </label>
          <textarea
            id={`acao-${o.id}`}
            name="acao"
            rows={2}
            required
            maxLength={500}
            placeholder="Ex: palete bloqueado no físico e no sistema, produto priorizado para saída."
            className={campo}
          />
          <BotaoEnviar
            compacto
            className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            Registrar ação e encerrar
          </BotaoEnviar>
        </form>
      )}
    </li>
  );
}
