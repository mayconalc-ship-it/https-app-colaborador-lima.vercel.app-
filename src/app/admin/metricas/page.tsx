import Link from "next/link";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { PainelAoVivo } from "@/components/PainelAoVivo";
import { formatarDuracao, nomeDaTela } from "@/lib/metricas";
import { ROTULO_PAPEL, type Papel } from "@/lib/acessos";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "ativos", label: "Usaram no período" },
  { id: "nunca", label: "Nunca entraram" },
];

const ORDENS = [
  { id: "tempo", label: "Mais tempo" },
  { id: "acessos", label: "Mais acessos" },
  { id: "recente", label: "Acesso recente" },
  { id: "nome", label: "Nome" },
];

type Params = {
  dias?: string;
  busca?: string;
  filtro?: string;
  ordem?: string;
};

export default async function AdminMetricasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireModulo("metricas", "ver");

  const p = await searchParams;
  const dias = PERIODOS.some((x) => String(x.dias) === p.dias)
    ? Number(p.dias)
    : 30;
  const busca = (p.busca ?? "").trim();
  const filtro = FILTROS.some((f) => f.id === p.filtro) ? p.filtro! : "todos";
  const ordem = ORDENS.some((o) => o.id === p.ordem) ? p.ordem! : "tempo";

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const desdeIso = desde.toISOString();

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");

  // O uso é medido pelas PESSOAS da revenda, não por uma coluna na tabela
  // de eventos: o registro é gravado pelo navegador, que não sabe (nem
  // deveria decidir) de qual revenda a sessão é. Partir de quem pertence à
  // revenda dá o mesmo número sem depender do cliente.
  const { data: daRevenda } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);

  const idsDaRevenda = (daRevenda ?? []).map((v) => v.colaborador_id);

  const [
    { data: sessoes },
    { data: telas },
    { data: pessoas },
    { data: historico },
    { data: ultimosEventos },
  ] = await Promise.all([
    admin
      .from("uso_sessoes")
      .select("colaborador_id, segundos, iniciada_em")
      .in("colaborador_id", idsDaRevenda)
      .gte("iniciada_em", desdeIso),
    admin
      .from("eventos_acesso")
      .select("colaborador_id, tipo, alvo")
      .in("colaborador_id", idsDaRevenda)
      .gte("criado_em", desdeIso),
    admin
      .from("profiles")
      .select("id, nome, cpf, cargo, role")
      .in("id", idsDaRevenda),
    // Sem recorte de período: "nunca entrou" e "último acesso" são perguntas
    // sobre a vida toda do app, não sobre a última semana.
    admin
      .from("uso_sessoes")
      .select("colaborador_id, iniciada_em")
      .in("colaborador_id", idsDaRevenda)
      .order("iniciada_em", { ascending: false })
      .limit(20000),
    // Semente do feed ao vivo: sem isso ele abriria vazio e só ganharia
    // conteúdo quando alguém mexesse no app.
    admin
      .from("eventos_acesso")
      .select("id, nome, tipo, alvo, criado_em")
      .in("colaborador_id", idsDaRevenda)
      .order("criado_em", { ascending: false })
      .limit(25),
  ]);

  const listaSessoes = sessoes ?? [];
  const listaTelas = telas ?? [];
  const listaPessoas = pessoas ?? [];

  /* ---- Números do topo ---------------------------------------- */

  const ativos = new Set(listaSessoes.map((s) => s.colaborador_id));

  // A lista vem ordenada do mais novo para o mais velho, então o primeiro
  // registro de cada pessoa já é o acesso mais recente dela.
  const ultimoAcesso = new Map<string, string>();
  for (const h of historico ?? []) {
    if (!ultimoAcesso.has(h.colaborador_id)) {
      ultimoAcesso.set(h.colaborador_id, h.iniciada_em);
    }
  }

  const segundosTotais = listaSessoes.reduce((soma, s) => soma + s.segundos, 0);
  const mediaPorSessao = listaSessoes.length
    ? segundosTotais / listaSessoes.length
    : 0;

  const adesao = listaPessoas.length
    ? Math.round((ultimoAcesso.size / listaPessoas.length) * 100)
    : 0;

  /* ---- Telas mais abertas -------------------------------------- */

  const porTela = new Map<string, { emoji: string; total: number }>();
  for (const t of listaTelas) {
    if (t.tipo === "login") continue; // entrar no app não é "função usada"
    const { nome, emoji } =
      t.tipo === "acao"
        ? { nome: t.alvo, emoji: "👆" }
        : nomeDaTela(t.alvo);
    porTela.set(nome, { emoji, total: (porTela.get(nome)?.total ?? 0) + 1 });
  }
  const ranking = Array.from(porTela.entries())
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.total - a.total);

  /* ---- Uso por colaborador ------------------------------------- */

  const porPessoa = new Map<
    string,
    { acessos: number; segundos: number; telas: number; favorita?: string }
  >();

  for (const s of listaSessoes) {
    const atual = porPessoa.get(s.colaborador_id) ?? {
      acessos: 0,
      segundos: 0,
      telas: 0,
    };
    atual.acessos++;
    atual.segundos += s.segundos;
    porPessoa.set(s.colaborador_id, atual);
  }

  const telasPorPessoa = new Map<string, Map<string, number>>();
  for (const t of listaTelas) {
    if (t.tipo === "login") continue;

    const atual = porPessoa.get(t.colaborador_id) ?? {
      acessos: 0,
      segundos: 0,
      telas: 0,
    };
    atual.telas++;
    porPessoa.set(t.colaborador_id, atual);

    const contagem = telasPorPessoa.get(t.colaborador_id) ?? new Map();
    const nome = t.tipo === "acao" ? t.alvo : nomeDaTela(t.alvo).nome;
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    telasPorPessoa.set(t.colaborador_id, contagem);
  }

  for (const [id, contagem] of telasPorPessoa) {
    const favorita = Array.from(contagem.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const atual = porPessoa.get(id);
    if (atual) atual.favorita = favorita;
  }

  const termo = busca
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  let linhas = listaPessoas.map((pessoa) => {
    const uso = porPessoa.get(pessoa.id);
    return {
      ...pessoa,
      acessos: uso?.acessos ?? 0,
      segundos: uso?.segundos ?? 0,
      telas: uso?.telas ?? 0,
      favorita: uso?.favorita,
      ultimo: ultimoAcesso.get(pessoa.id) ?? null,
    };
  });

  if (termo) {
    linhas = linhas.filter(
      (l) =>
        (l.nome ?? "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .includes(termo) || (l.cpf ?? "").includes(busca.replace(/\D/g, "")),
    );
  }

  if (filtro === "ativos") linhas = linhas.filter((l) => l.acessos > 0);
  if (filtro === "nunca") linhas = linhas.filter((l) => !l.ultimo);

  linhas.sort((a, b) => {
    // "?? ''" porque um cadastro sem nome derrubaria a ordenação inteira.
    if (ordem === "nome") {
      return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
    }
    if (ordem === "acessos") return b.acessos - a.acessos;
    if (ordem === "recente") {
      return (b.ultimo ?? "").localeCompare(a.ultimo ?? "");
    }
    return b.segundos - a.segundos;
  });

  const nuncaEntraram = listaPessoas.filter((x) => !ultimoAcesso.has(x.id));

  /** Mantém o resto dos filtros ao trocar um deles. */
  const endereco = (mudanca: Partial<Params>) => {
    const q = new URLSearchParams();
    const final = { dias: String(dias), busca, filtro, ordem, ...mudanca };
    if (final.dias !== "30") q.set("dias", final.dias!);
    if (final.busca) q.set("busca", final.busca);
    if (final.filtro !== "todos") q.set("filtro", final.filtro!);
    if (final.ordem !== "tempo") q.set("ordem", final.ordem!);
    const s = q.toString();
    return s ? `/admin/metricas?${s}` : "/admin/metricas";
  };

  return (
    <div>
      <PageHeader
        title="Uso do App"
        subtitle="Quem está usando, por quanto tempo e o quê"
      />

      <PainelAoVivo iniciais={ultimosEventos ?? []} />

      <div className="mb-4 flex gap-2">
        {PERIODOS.map((x) => (
          <Link
            key={x.dias}
            href={endereco({ dias: String(x.dias) })}
            className={`flex-1 rounded-xl border py-2 text-center text-sm font-semibold ${
              x.dias === dias
                ? "border-primary bg-primary-soft text-primary"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">
            Adesão desde o lançamento
          </span>
          <span className="text-2xl font-bold text-primary">{adesao}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${adesao}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {ultimoAcesso.size} de {listaPessoas.length} colaboradores já entraram
          pelo menos uma vez · {nuncaEntraram.length} ainda não
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Cartao valor={String(ativos.size)} rotulo={`ativos em ${dias} dias`} />
        <Cartao valor={String(listaSessoes.length)} rotulo="acessos ao app" />
        <Cartao
          valor={formatarDuracao(mediaPorSessao)}
          rotulo="tempo médio por acesso"
        />
        <Cartao
          valor={formatarDuracao(segundosTotais)}
          rotulo="tempo total no app"
        />
      </div>

      {/* ---- Uso por colaborador ---- */}
      {/* Fica aberto quando há busca ou filtro: recolher justamente o que a
          pessoa acabou de pedir seria o oposto do esperado. */}
      <details
        open={busca !== "" || filtro !== "todos" || ordem !== "tempo"}
        className="group mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <h2 className="text-sm font-semibold text-slate-800">
            Uso por colaborador
            <span className="ml-2 font-normal text-slate-400">
              ({linhas.length})
            </span>
          </h2>
          <span className="text-slate-400 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="border-b border-t border-slate-100 p-4">

          <form method="get" className="mb-3 flex gap-2">
            {dias !== 30 && (
              <input type="hidden" name="dias" value={String(dias)} />
            )}
            {filtro !== "todos" && (
              <input type="hidden" name="filtro" value={filtro} />
            )}
            {ordem !== "tempo" && (
              <input type="hidden" name="ordem" value={ordem} />
            )}
            <input
              name="busca"
              defaultValue={busca}
              placeholder="Buscar por nome ou CPF"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Buscar
            </button>
          </form>

          <div className="rolagem-lateral -mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex w-max gap-2">
              {FILTROS.map((f) => (
                <Link
                  key={f.id}
                  href={endereco({ filtro: f.id })}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    filtro === f.id
                      ? "bg-primary text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
              <span className="shrink-0 self-center px-1 text-xs text-slate-300">
                |
              </span>
              {ORDENS.map((o) => (
                <Link
                  key={o.id}
                  href={endereco({ ordem: o.id })}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                    ordem === o.id
                      ? "bg-slate-700 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {linhas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Ninguém encontrado com esses filtros.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <li key={l.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {l.nome}
                      {l.role !== "colaborador" && (
                        <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-primary-dark">
                          {ROTULO_PAPEL[l.role as Papel] ?? l.role}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {l.cargo}
                      {l.favorita ? ` · usa mais: ${l.favorita}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-primary">
                      {l.segundos > 0 ? formatarDuracao(l.segundos) : "—"}
                    </p>
                    <p className="text-xs tabular-nums text-slate-400">
                      {l.acessos} acesso{l.acessos === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {l.ultimo
                    ? `Último acesso em ${new Date(l.ultimo).toLocaleDateString(
                        "pt-BR",
                        { day: "2-digit", month: "2-digit", year: "2-digit" },
                      )}`
                    : "Nunca entrou no app"}
                  {l.telas > 0 ? ` · ${l.telas} telas abertas no período` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </details>

      {ranking.length > 0 && (
        <details
          open
          className="group mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Telas mais abertas
              <span className="ml-2 font-normal text-slate-400">
                ({ranking.length})
              </span>
            </h2>
            <span className="text-slate-400 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="space-y-2 border-t border-slate-100 p-4">
            {ranking.map((r) => (
              <div key={r.nome} className="flex items-center gap-2">
                <span className="w-44 shrink-0 truncate text-sm text-slate-600">
                  {r.emoji} {r.nome}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(r.total / ranking[0].total) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">
                  {r.total}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="mt-4 text-xs text-slate-400">
        O app registra apenas qual tela foi aberta e por quanto tempo — nunca o
        conteúdo visto. O relógio só corre com o app aberto na frente: se a
        pessoa troca de aplicativo ou bloqueia o celular, a contagem para.
      </p>
    </div>
  );
}

function Cartao({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-primary">{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}
