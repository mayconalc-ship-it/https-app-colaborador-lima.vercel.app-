import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CartaoAcao } from "@/components/cinco-s/CartaoAcao";
import {
  areasVisiveis,
  getContexto5S,
  listarAreas,
  nomesDe,
} from "@/lib/cinco-s-server";
import {
  PRIORIDADES,
  ROTULO_PRIORIDADE,
  ROTULO_SENSO,
  ROTULO_STATUS_NC,
  SENSOS,
  STATUS_NC,
  ehPrioridade,
  ehSenso,
  ehStatusNC,
  type Prioridade,
  type Senso,
  type StatusNC,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/** Quantas ações por página. Rolagem infinita numa lista de trabalho
 *  esconde o fim, e o fim é a informação que importa: "acabou". */
const POR_PAGINA = 20;

type Params = {
  status?: string;
  area?: string;
  senso?: string;
  prioridade?: string;
  responsavel?: string;
  atrasadas?: string;
  minhas?: string;
  pagina?: string;
  foco?: string;
};

/**
 * Plano de Ação 5S.
 *
 * O que a planilha nunca conseguiu: cada não conformidade com dono,
 * prazo, evidência e validação -- e uma lista que responde "o que está
 * atrasado e com quem".
 *
 * Duas coisas sustentam a performance desta tela:
 *
 *   - Os filtros vão para o BANCO, não para o JavaScript. Buscar tudo e
 *     filtrar em memória funcionaria hoje, com dezenas de ações, e
 *     derrubaria a tela com milhares.
 *
 *   - Paginação de verdade (range + count exato). O contador do topo
 *     vem do próprio count, sem uma segunda consulta.
 */
export default async function AcoesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const ctx = await getContexto5S();
  if (!ctx) redirect("/");
  if (!ctx.temAcesso) redirect("/5s");

  const p = await searchParams;
  const status = ehStatusNC(p.status) ? p.status : null;
  const senso = ehSenso(p.senso) ? p.senso : null;
  const prioridade = ehPrioridade(p.prioridade) ? p.prioridade : null;
  const areaId = p.area || null;
  const soAtrasadas = p.atrasadas === "1";
  const soMinhas = p.minhas === "1";
  const pagina = Math.max(1, Number(p.pagina) || 1);

  const admin = createAdminClient();
  const hoje = new Date().toISOString().slice(0, 10);

  // O recorte de acesso entra ANTES de qualquer filtro de tela: quem não
  // é gestor só enxerga ação da própria área ou atribuída a si. Deixar
  // isso para o filtro da interface seria confiar na tela para proteger
  // o dado.
  const permitidas = areasVisiveis(ctx);

  let consulta = admin
    .from("cinco_s_nao_conformidades")
    .select(
      // A pergunta vem junto (join, não consulta por linha): é o texto
      // que dá contexto ao problema quando alguém copia a ação para
      // levar a outro lugar. A descrição sozinha costuma ser a
      // observação solta do auditor.
      "id, descricao, acao, senso, status, prioridade, prazo, responsavel_id, area_id, auditoria_id, evidencia_url, evidencia_conclusao_url, comentario_encerramento, criado_em, concluido_em, cinco_s_areas!inner(nome), cinco_s_perguntas(codigo, texto)",
      { count: "exact" },
    )
    .eq("revenda_id", ctx.revendaId);

  if (permitidas !== null) {
    // A pessoa vê o que é da área dela OU o que foi atribuído a ela --
    // o responsável nem sempre é o dono da área.
    const lista = permitidas.length > 0 ? permitidas.join(",") : null;
    consulta = lista
      ? consulta.or(`area_id.in.(${lista}),responsavel_id.eq.${ctx.perfilId}`)
      : consulta.eq("responsavel_id", ctx.perfilId);
  }

  if (status) consulta = consulta.eq("status", status);
  if (senso) consulta = consulta.eq("senso", senso);
  if (prioridade) consulta = consulta.eq("prioridade", prioridade);
  if (areaId) consulta = consulta.eq("area_id", areaId);
  if (soMinhas) consulta = consulta.eq("responsavel_id", ctx.perfilId);
  if (soAtrasadas) {
    consulta = consulta
      .in("status", ["aberta", "em_andamento"])
      .lt("prazo", hoje);
  }

  const inicio = (pagina - 1) * POR_PAGINA;

  const [
    { data: acoes, count },
    { data: resumo },
    areas,
  ] = await Promise.all([
    consulta
      // Aberta primeiro, prazo mais curto primeiro: a ordem é a fila de
      // trabalho, não a ordem de cadastro.
      .order("status")
      .order("prazo", { nullsFirst: false })
      .range(inicio, inicio + POR_PAGINA - 1),
    // Os cartões do topo contam o universo INTEIRO do acesso da pessoa,
    // sem os filtros de tela -- senão "3 atrasadas" viraria "0 atrasadas"
    // assim que ela filtrasse por concluídas, que é o oposto de um
    // painel de controle.
    admin
      .from("cinco_s_nao_conformidades")
      .select("status, prazo")
      .eq("revenda_id", ctx.revendaId)
      .limit(5000),
    listarAreas(ctx.revendaId, { ids: permitidas }),
  ]);

  const lista = acoes ?? [];

  const nomes = await nomesDe(
    Array.from(
      new Set(
        lista
          .map((a) => a.responsavel_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ),
  );

  const totais = contar(resumo ?? [], hoje);
  const totalFiltrado = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / POR_PAGINA));

  const url = (mudanca: Partial<Params>) => {
    const q = new URLSearchParams();
    const final: Params = {
      status: status ?? "",
      area: areaId ?? "",
      senso: senso ?? "",
      prioridade: prioridade ?? "",
      atrasadas: soAtrasadas ? "1" : "",
      minhas: soMinhas ? "1" : "",
      // Trocar um filtro sempre volta para a primeira página: manter a
      // página 4 de um recorte que agora tem uma página só entregaria
      // uma tela vazia.
      pagina: "",
      ...mudanca,
    };
    for (const [k, v] of Object.entries(final)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/5s/acoes?${s}` : "/5s/acoes";
  };

  return (
    <div>
      <PageHeader
        title="Plano de Ação 5S"
        subtitle={
          ctx.gestor
            ? "Todas as ações do programa"
            : "As ações das suas áreas e as atribuídas a você"
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Numero valor={totais.total} rotulo="total" href={url({ status: "", atrasadas: "" })} />
        <Numero valor={totais.aberta} rotulo="abertas" href={url({ status: "aberta" })} tom="alerta" />
        <Numero
          valor={totais.em_andamento}
          rotulo="em andamento"
          href={url({ status: "em_andamento" })}
        />
        <Numero
          valor={totais.concluida}
          rotulo="a validar"
          href={url({ status: "concluida" })}
        />
        <Numero
          valor={totais.validada}
          rotulo="validadas"
          href={url({ status: "validada" })}
          tom="bom"
        />
        <Numero
          valor={totais.atrasadas}
          rotulo="atrasadas"
          href={url({ atrasadas: "1", status: "" })}
          tom={totais.atrasadas > 0 ? "ruim" : "bom"}
        />
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Conclusão
          </span>
          <span className="text-sm font-bold text-primary">
            {totais.total === 0
              ? "—"
              : `${Math.round(((totais.concluida + totais.validada) / totais.total) * 100)}%`}
          </span>
        </div>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-primary"
            style={{
              width: `${
                totais.total === 0
                  ? 0
                  : ((totais.concluida + totais.validada) / totais.total) * 100
              }%`,
            }}
          />
        </div>
      </div>

      {/* ---- Filtros ---- */}
      <div className="rolagem-lateral -mx-4 mb-2 overflow-x-auto px-4 pb-2">
        <div className="flex w-max gap-2">
          <Filtro href={url({ minhas: soMinhas ? "" : "1" })} ativo={soMinhas}>
            Só as minhas
          </Filtro>
          <Filtro
            href={url({ atrasadas: soAtrasadas ? "" : "1" })}
            ativo={soAtrasadas}
          >
            Atrasadas
          </Filtro>
          <span className="self-center px-1 text-xs text-slate-300">|</span>
          {STATUS_NC.map((s) => (
            <Filtro
              key={s}
              href={url({ status: status === s ? "" : s })}
              ativo={status === s}
            >
              {ROTULO_STATUS_NC[s]}
            </Filtro>
          ))}
        </div>
      </div>

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-slate-600">
          Mais filtros
          {(senso || prioridade || areaId) && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-white">
              ativos
            </span>
          )}
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-4">
          <Grupo titulo="Área">
            {areas.map((a) => (
              <Filtro
                key={a.id}
                href={url({ area: areaId === a.id ? "" : a.id })}
                ativo={areaId === a.id}
              >
                {a.nome}
              </Filtro>
            ))}
          </Grupo>
          <Grupo titulo="Senso">
            {SENSOS.map((s) => (
              <Filtro
                key={s}
                href={url({ senso: senso === s ? "" : s })}
                ativo={senso === s}
              >
                {ROTULO_SENSO[s]}
              </Filtro>
            ))}
          </Grupo>
          <Grupo titulo="Prioridade">
            {PRIORIDADES.map((pr) => (
              <Filtro
                key={pr}
                href={url({ prioridade: prioridade === pr ? "" : pr })}
                ativo={prioridade === pr}
              >
                {ROTULO_PRIORIDADE[pr]}
              </Filtro>
            ))}
          </Grupo>
        </div>
      </details>

      {/* ---- A lista ---- */}
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            {totais.total === 0
              ? "Nenhuma não conformidade registrada ainda."
              : "Nenhuma ação com esses filtros."}
          </p>
          {totais.total > 0 && (
            <Link
              href="/5s/acoes"
              className="mt-3 inline-block text-sm font-semibold text-primary underline"
            >
              Limpar filtros
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map((a) => (
            <CartaoAcao
              key={a.id}
              acao={{
                id: a.id,
                descricao: a.descricao,
                acao: a.acao,
                senso: a.senso as Senso,
                status: a.status as StatusNC,
                prioridade: a.prioridade as Prioridade,
                prazo: a.prazo,
                responsavelNome: a.responsavel_id
                  ? (nomes.get(a.responsavel_id) ?? null)
                  : null,
                areaNome: (
                  (Array.isArray(a.cinco_s_areas)
                    ? a.cinco_s_areas[0]
                    : a.cinco_s_areas) as { nome: string }
                ).nome,
                auditoriaId: a.auditoria_id,
                pergunta: (() => {
                  const q = (Array.isArray(a.cinco_s_perguntas)
                    ? a.cinco_s_perguntas[0]
                    : a.cinco_s_perguntas) as {
                    codigo: string;
                    texto: string;
                  } | null;
                  return q ? `${q.codigo} ${q.texto}` : null;
                })(),
                evidenciaUrl: a.evidencia_url,
                evidenciaConclusaoUrl: a.evidencia_conclusao_url,
                comentarioEncerramento: a.comentario_encerramento,
              }}
              souResponsavel={a.responsavel_id === ctx.perfilId}
              podeValidar={ctx.podeEditar}
              abertoInicial={p.foco === a.id}
            />
          ))}
        </ul>
      )}

      {/* ---- Paginação ---- */}
      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={url({ pagina: String(pagina - 1) })}
            aria-disabled={pagina === 1}
            className={`rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold ${
              pagina === 1
                ? "pointer-events-none text-slate-300"
                : "text-slate-600"
            }`}
          >
            ← Anterior
          </Link>
          <span className="text-xs tabular-nums text-slate-500">
            {pagina} de {totalPaginas} · {totalFiltrado} ações
          </span>
          <Link
            href={url({ pagina: String(pagina + 1) })}
            aria-disabled={pagina === totalPaginas}
            className={`rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold ${
              pagina === totalPaginas
                ? "pointer-events-none text-slate-300"
                : "text-slate-600"
            }`}
          >
            Próxima →
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function contar(linhas: { status: string; prazo: string | null }[], hoje: string) {
  const t = {
    total: linhas.length,
    aberta: 0,
    em_andamento: 0,
    concluida: 0,
    validada: 0,
    atrasadas: 0,
  };
  for (const l of linhas) {
    if (l.status in t) t[l.status as keyof typeof t]++;
    if (
      (l.status === "aberta" || l.status === "em_andamento") &&
      l.prazo &&
      l.prazo < hoje
    ) {
      t.atrasadas++;
    }
  }
  return t;
}

function Numero({
  valor,
  rotulo,
  href,
  tom = "neutro",
}: {
  valor: number;
  rotulo: string;
  href: string;
  tom?: "neutro" | "bom" | "alerta" | "ruim";
}) {
  const cor = {
    neutro: "text-slate-700",
    bom: "text-green-600",
    alerta: "text-amber-600",
    ruim: "text-red-600",
  }[tom];
  return (
    <Link
      href={href}
      className="rounded-2xl border border-slate-200 bg-white p-2.5 text-center shadow-sm active:bg-slate-50"
    >
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </Link>
  );
}

function Filtro({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
        ativo
          ? "bg-primary text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}

function Grupo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {titulo}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
