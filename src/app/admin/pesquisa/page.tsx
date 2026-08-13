import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import {
  dentroDoPeriodo,
  grupoDaNota,
  hojeIso,
  rotuloCiclo,
  rotuloMotivo,
  type ConfigPesquisa,
} from "@/lib/pesquisa";
import {
  alternarPesquisa,
  novoCiclo,
  salvarConfigPesquisa,
} from "./actions";

type Resposta = {
  id: number;
  colaborador_id: string;
  ciclo: string;
  nota: number;
  motivos: string[];
  comentario: string | null;
  criado_em: string;
};

export default async function AdminPesquisaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; ciclo?: string }>;
}) {
  await requireModulo("pesquisa", "ver");
  const { erro, sucesso, ciclo: cicloParam } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");

  const [{ data: config }, { data: todas }, { count: totalPessoas }] =
    await Promise.all([
      admin
        .from("pesquisa_config")
        .select("ativa, inicio, fim, ciclo, titulo")
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      admin
        .from("pesquisa_respostas")
        .select("id, colaborador_id, ciclo, nota, motivos, comentario, criado_em")
        .eq("revenda_id", revendaId)
        .order("criado_em", { ascending: false }),
      // O total é o denominador do "quantos já responderam": tem que ser o
      // time desta revenda, não o do app inteiro.
      admin
        .from("colaborador_revendas")
        .select("*", { count: "exact", head: true })
        .eq("revenda_id", revendaId),
    ]);

  const cfg: ConfigPesquisa = config ?? {
    ativa: false,
    inicio: null,
    fim: null,
    ciclo: hojeIso().slice(0, 7),
    titulo: "Pesquisa de satisfação",
  };

  const respostas = (todas ?? []) as Resposta[];
  const noAr = dentroDoPeriodo(cfg, hojeIso());

  // Ciclos existentes, do mais novo para o mais velho. O atual entra na
  // lista mesmo sem resposta ainda.
  const ciclos = Array.from(
    new Set([cfg.ciclo, ...respostas.map((r) => r.ciclo)]),
  ).sort((a, b) => b.localeCompare(a));

  const cicloVisto = cicloParam && ciclos.includes(cicloParam) ? cicloParam : cfg.ciclo;
  const doCiclo = respostas.filter((r) => r.ciclo === cicloVisto);

  const total = doCiclo.length;
  const media = total
    ? doCiclo.reduce((s, r) => s + r.nota, 0) / total
    : 0;
  const participacao = totalPessoas
    ? Math.round((total / totalPessoas) * 100)
    : 0;

  const porNota = [5, 4, 3, 2, 1].map((n) => ({
    nota: n,
    total: doCiclo.filter((r) => r.nota === n).length,
  }));
  const maiorFatia = Math.max(1, ...porNota.map((p) => p.total));

  const grupos = {
    promotor: doCiclo.filter((r) => grupoDaNota(r.nota) === "promotor").length,
    neutro: doCiclo.filter((r) => grupoDaNota(r.nota) === "neutro").length,
    detrator: doCiclo.filter((r) => grupoDaNota(r.nota) === "detrator").length,
  };

  // Motivos mais citados (só aparecem em nota 1 e 2).
  const contagemMotivos = new Map<string, number>();
  for (const r of doCiclo) {
    for (const m of r.motivos ?? []) {
      contagemMotivos.set(m, (contagemMotivos.get(m) ?? 0) + 1);
    }
  }
  const motivosOrdenados = Array.from(contagemMotivos.entries()).sort(
    (a, b) => b[1] - a[1],
  );

  // Quem ainda não respondeu neste ciclo.
  const responderam = new Set(doCiclo.map((r) => r.colaborador_id));
  const { data: pessoas } = await admin
    .from("profiles")
    .select("id, nome, cargo")
    .order("nome", { ascending: true });
  const faltam = (pessoas ?? []).filter((p) => !responderam.has(p.id));

  // Média por ciclo, para acompanhar a evolução.
  const historico = ciclos
    .map((c) => {
      const doC = respostas.filter((r) => r.ciclo === c);
      return {
        ciclo: c,
        total: doC.length,
        media: doC.length
          ? doC.reduce((s, r) => s + r.nota, 0) / doC.length
          : 0,
      };
    })
    .filter((h) => h.total > 0);

  const comentarios = doCiclo.filter((r) => r.comentario || r.motivos?.length);

  return (
    <div>
      <PageHeader
        title="Pesquisa de Satisfação"
        subtitle="O que o time acha do app"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      {/* ---- Status e liga/desliga ---- */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-slate-900">
              {noAr ? "🟢 No ar" : cfg.ativa ? "🟡 Ativa, fora do período" : "🔴 Inativa"}
            </p>
            <p className="text-xs text-slate-500">
              Ciclo atual: <strong>{rotuloCiclo(cfg.ciclo)}</strong>
              {cfg.inicio || cfg.fim
                ? ` · ${cfg.inicio ?? "sem início"} até ${cfg.fim ?? "sem fim"}`
                : " · sem período definido"}
            </p>
          </div>

          <form action={alternarPesquisa}>
            <input type="hidden" name="ligar" value={String(!cfg.ativa)} />
            <BotaoEnviar
              textoEnviando="Aplicando..."
              className={`rounded-xl px-4 py-3 text-sm font-semibold text-white ${
                cfg.ativa
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-primary hover:bg-primary-dark"
              }`}
            >
              {cfg.ativa ? "Desativar pesquisa" : "Ativar pesquisa"}
            </BotaoEnviar>
          </form>
        </div>

        {cfg.ativa && !noAr && (
          <p className="mt-3 rounded-lg bg-gold-soft p-3 text-xs text-primary-dark">
            A pesquisa está ligada, mas hoje ({hojeIso()}) está fora do período
            configurado — por isso ninguém a está vendo.
          </p>
        )}
      </div>

      {/* ---- Configuração ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          ⚙️ Configurar período e ciclo
        </summary>
        <form
          action={salvarConfigPesquisa}
          className="space-y-3 border-t border-slate-100 p-4"
        >
          <div>
            <label
              htmlFor="titulo"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nome da pesquisa (uso interno)
            </label>
            <input
              id="titulo"
              name="titulo"
              defaultValue={cfg.titulo}
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="inicio"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Data inicial
              </label>
              <input
                id="inicio"
                name="inicio"
                type="date"
                defaultValue={cfg.inicio ?? ""}
                className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="fim"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Data final
              </label>
              <input
                id="fim"
                name="fim"
                type="date"
                defaultValue={cfg.fim ?? ""}
                className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="ciclo"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Ciclo (AAAA-MM)
            </label>
            <input
              id="ciclo"
              name="ciclo"
              defaultValue={cfg.ciclo}
              placeholder="2026-08"
              className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Deixar as datas em branco significa &quot;sem limite&quot;.
            </p>
          </div>

          <BotaoEnviar
            textoEnviando="Salvando..."
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
          >
            Salvar
          </BotaoEnviar>
        </form>
      </details>

      {/* ---- Novo ciclo ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          🔄 Iniciar um novo ciclo
        </summary>
        <form action={novoCiclo} className="space-y-3 border-t border-slate-100 p-4">
          <p className="text-sm text-slate-600">
            Todos voltam a poder responder. <strong>Nada é apagado</strong> — as
            respostas antigas continuam guardadas no ciclo delas.
          </p>
          <input
            name="novo_ciclo"
            required
            placeholder="2026-09"
            className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
          />
          <BotaoEnviar
            textoEnviando="Iniciando..."
            className="w-full rounded-xl border-2 border-primary py-3 font-semibold text-primary hover:bg-primary-soft"
          >
            Iniciar ciclo
          </BotaoEnviar>
        </form>
      </details>

      {/* ---- Seletor de ciclo ---- */}
      {ciclos.length > 1 && (
        <div className="rolagem-lateral -mx-4 mb-4 overflow-x-auto px-4 pb-2">
          <div className="flex w-max gap-2">
            {ciclos.map((c) => (
              <a
                key={c}
                href={`/admin/pesquisa?ciclo=${c}`}
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${
                  c === cicloVisto
                    ? "bg-primary text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {rotuloCiclo(c)}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ---- Números ---- */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-primary">
            {total ? media.toFixed(1).replace(".", ",") : "—"}
          </p>
          <p className="text-xs text-slate-500">⭐ nota média</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-primary">{participacao}%</p>
          <p className="text-xs text-slate-500">📊 participação</p>
        </div>
      </div>

      <p className="mb-4 rounded-xl bg-primary-soft p-3 text-center text-sm font-semibold text-primary-dark">
        👥 {total} de {totalPessoas ?? 0} colaboradores já responderam
      </p>

      {/* ---- Distribuição ---- */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Distribuição das notas
        </h2>
        <div className="space-y-2">
          {porNota.map((p) => (
            <div key={p.nota} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-sm text-slate-600">
                {p.nota} ★
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    p.nota >= 4
                      ? "bg-green-500"
                      : p.nota === 3
                        ? "bg-amber-400"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${(p.total / maiorFatia) * 100}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-700">
                {p.total}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
          <div>
            <p className="text-lg font-bold text-green-600">{grupos.promotor}</p>
            <p className="text-xs text-slate-500">Promotores (5★)</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-500">{grupos.neutro}</p>
            <p className="text-xs text-slate-500">Neutros (3–4★)</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{grupos.detrator}</p>
            <p className="text-xs text-slate-500">Críticos (1–2★)</p>
          </div>
        </div>
      </div>

      {/* ---- Motivos ---- */}
      {motivosOrdenados.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Motivos mais citados
          </h2>
          <div className="flex flex-wrap gap-2">
            {motivosOrdenados.map(([id, n]) => (
              <span
                key={id}
                className="rounded-full bg-red-50 px-3 py-1.5 text-sm text-red-800 ring-1 ring-red-100"
              >
                {rotuloMotivo(id)} · {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- Comentários ---- */}
      <details open className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-800">
          💬 Comentários recebidos ({comentarios.length})
        </summary>
        {comentarios.length === 0 ? (
          <p className="border-t border-slate-100 p-6 text-center text-sm text-slate-500">
            Nenhum comentário neste ciclo.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {comentarios.map((r) => (
              <li key={r.id} className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm text-gold">
                    {"★".repeat(r.nota)}
                    <span className="text-slate-300">
                      {"★".repeat(5 - r.nota)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(r.criado_em).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.motivos?.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {r.motivos.map((m) => (
                      <span
                        key={m}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {rotuloMotivo(m)}
                      </span>
                    ))}
                  </div>
                )}
                {r.comentario && (
                  <p className="border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                    {r.comentario}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 p-3 text-xs text-slate-400">
          As respostas aparecem sem o nome de quem escreveu — assim as pessoas
          se sentem à vontade para serem sinceras.
        </p>
      </details>

      {/* ---- Quem falta ---- */}
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-800">
          Ainda não responderam ({faltam.length})
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {faltam.map((p) => (
            <li
              key={p.id}
              className="flex items-baseline justify-between gap-3 p-3"
            >
              <span className="text-sm text-slate-700">{p.nome}</span>
              <span className="shrink-0 text-xs text-slate-400">{p.cargo}</span>
            </li>
          ))}
        </ul>
      </details>

      {/* ---- Evolução ---- */}
      {historico.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">
            Evolução por ciclo
          </h2>
          <ul className="divide-y divide-slate-100">
            {historico.map((h) => (
              <li
                key={h.ciclo}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="text-sm text-slate-700">
                  {rotuloCiclo(h.ciclo)}
                </span>
                <span className="text-sm text-slate-400">
                  {h.total} resposta{h.total === 1 ? "" : "s"}
                </span>
                <span className="text-lg font-bold tabular-nums text-primary">
                  {h.media.toFixed(1).replace(".", ",")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
