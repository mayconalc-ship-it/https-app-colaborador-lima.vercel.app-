import Link from "next/link";
import { LinkVoltar } from "@/components/LinkVoltar";
import { TextoComLinks } from "@/components/TextoComLinks";
import { BotaoCurtir } from "@/components/BotaoCurtir";
import { FotoAmpliavel } from "@/components/FotoAmpliavel";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioId } from "@/lib/sessao";
import {
  EDITORIAS,
  dataDeHoje,
  editoria,
  ehEditoriaValida,
  formatarData,
  formatarDataCurta,
  tempoDeLeitura,
} from "@/lib/comunicados";

const POR_PAGINA = 6;

export default async function ComunicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ editoria?: string; pagina?: string }>;
}) {
  const { editoria: filtro, pagina: paginaParam } = await searchParams;
  const filtroValido = filtro && ehEditoriaValida(filtro) ? filtro : null;
  const pagina = Math.max(1, Number(paginaParam) || 1);

  const supabase = await createClient();

  let consulta = supabase
    .from("comunicados")
    .select(
      "id, titulo, resumo, texto, categoria, autor, destaque, data, imagem_url",
      { count: "exact" },
    )
    // A matéria de capa vem sempre primeiro, para não "cair" de página
    // conforme novas publicações entram.
    .order("destaque", { ascending: false })
    .order("data", { ascending: false })
    .order("id", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);

  if (filtroValido) consulta = consulta.eq("categoria", filtroValido);

  const { data: comunicados, count } = await consulta;
  const lista = comunicados ?? [];
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Curtidas: uma consulta só para todos os posts da página.
  const ids = lista.map((c) => c.id);
  const usuarioId = await getUsuarioId();
  const { data: curtidas } = ids.length
    ? await supabase
        .from("comunicado_curtidas")
        .select("comunicado_id, colaborador_id")
        .in("comunicado_id", ids)
    : { data: [] };

  const totalPorPost = new Map<number, number>();
  const curtidosPorMim = new Set<number>();
  for (const c of curtidas ?? []) {
    totalPorPost.set(
      c.comunicado_id,
      (totalPorPost.get(c.comunicado_id) ?? 0) + 1,
    );
    if (usuarioId && c.colaborador_id === usuarioId) {
      curtidosPorMim.add(c.comunicado_id);
    }
  }

  // A capa grande só na visão geral e na primeira página.
  const capa =
    !filtroValido && pagina === 1 ? lista.find((c) => c.destaque) : undefined;
  const demais = capa ? lista.filter((c) => c.id !== capa.id) : lista;

  const enderecoPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtroValido) p.set("editoria", filtroValido);
    if (n > 1) p.set("pagina", String(n));
    const query = p.toString();
    return query ? `/comunicados?${query}` : "/comunicados";
  };


  return (
    <div>
      {/* A manchete substituiu o cabeçalho padrão, então a saída para o
          menu precisa vir aqui — sem ela o colaborador fica sem volta. */}
      <LinkVoltar href="/" className="mb-2 text-primary hover:underline">
        ← Voltar ao menu
      </LinkVoltar>

      {/* ---- Cabeçalho do jornal ---------------------------------- */}
      <header className="mb-5 border-y-4 border-double border-primary py-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
          LIMA Logística
        </p>
        <h1 className="mt-1 font-serif text-3xl font-black uppercase leading-none tracking-tight text-primary-dark sm:text-4xl">
          Jornal do Colaborador
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          {dataDeHoje()}
          {total > 0 ? ` · ${total} publicaç${total === 1 ? "ão" : "ões"}` : ""}
        </p>
      </header>

      {/* ---- Editorias -------------------------------------------- */}
      <nav
        aria-label="Editorias"
        className="rolagem-lateral -mx-4 mb-6 overflow-x-auto px-4 pb-3"
      >
        <div className="flex w-max gap-2">
          <Link
            href="/comunicados"
            className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${
              !filtroValido
                ? "bg-primary text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            Tudo
          </Link>
          {EDITORIAS.map((e) => (
            <Link
              key={e.id}
              href={`/comunicados?editoria=${e.id}`}
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium ${
                filtroValido === e.id
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {e.emoji} {e.rotulo}
            </Link>
          ))}
        </div>
      </nav>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">📰</p>
          <p className="mt-2 font-semibold text-slate-700">
            Nenhuma notícia por aqui ainda
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filtroValido
              ? "Ainda não há publicações nesta editoria."
              : "Assim que a comunicação publicar algo, aparece aqui."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ---- Matéria de capa ---- */}
          {capa && (
            <article className="overflow-hidden rounded-2xl border-2 border-primary bg-white shadow-lg">
              {/* Tarja de capa: sem ela a matéria principal se confunde com
                  as outras, ainda mais no celular. */}
              <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
                  ★ Matéria de capa
                </span>
                <span className="text-xs font-medium text-white/85">
                  {formatarData(capa.data)}
                </span>
              </div>

              {capa.imagem_url && (
                // object-contain, e não cover: os comunicados costumam ser
                // cartazes cheios de texto, e recortar esconde justamente a
                // informação. Fundo escuro para a arte se destacar.
                <div className="flex justify-center bg-slate-900">
                  <FotoAmpliavel
                    src={capa.imagem_url}
                    titulo={capa.titulo}
                    classeBotao="w-full"
                    className="mx-auto max-h-[26rem] w-full object-contain"
                  />
                </div>
              )}

              <div className="p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span
                    className={`rounded-full px-2 py-1 font-semibold ${editoria(capa.categoria).cor}`}
                  >
                    {editoria(capa.categoria).emoji}{" "}
                    {editoria(capa.categoria).rotulo}
                  </span>
                  <span>{tempoDeLeitura(capa.texto)} min de leitura</span>
                  {capa.autor && <span>· Por {capa.autor}</span>}
                </div>

                <h2 className="font-serif text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                  {capa.titulo}
                </h2>

                {capa.resumo && (
                  <p className="mt-2 border-l-4 border-gold pl-3 font-serif text-base italic leading-relaxed text-slate-600">
                    {capa.resumo}
                  </p>
                )}

                {/* A primeira letra grande é o detalhe que faz a matéria
                    principal parecer jornal de verdade. */}
                <div className="mt-4 space-y-3 font-serif text-[15px] leading-relaxed text-slate-800 [&>p:first-child]:first-letter:mr-1 [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:font-serif [&>p:first-child]:first-letter:text-5xl [&>p:first-child]:first-letter:font-bold [&>p:first-child]:first-letter:leading-[0.85] [&>p:first-child]:first-letter:text-primary">
                  {capa.texto
                    .split("\n")
                    .filter(Boolean)
                    .map((paragrafo: string, i: number) => (
                      <p key={i}>
                        <TextoComLinks
                          texto={paragrafo}
                          rotuloBotao="Acessar o formulário"
                        />
                      </p>
                    ))}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <BotaoCurtir
                    comunicadoId={capa.id}
                    curtidoInicial={curtidosPorMim.has(capa.id)}
                    totalInicial={totalPorPost.get(capa.id) ?? 0}
                  />
                </div>
              </div>
            </article>
          )}

          {/* ---- Demais matérias ---- */}
          {demais.length > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  Mais notícias
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {demais.map((c) => {
                  const ed = editoria(c.categoria);
                  return (
                    <article
                      key={c.id}
                      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      {c.imagem_url && (
                        <FotoAmpliavel
                          src={c.imagem_url}
                          titulo={c.titulo}
                          classeBotao="w-full"
                          className="h-40 w-full object-cover"
                        />
                      )}

                      <div className="flex flex-1 flex-col p-4">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ed.cor}`}
                          >
                            {ed.emoji} {ed.rotulo}
                          </span>
                          <span className="text-xs text-slate-400">
                            {formatarDataCurta(c.data)}
                          </span>
                        </div>

                        <h3 className="font-serif text-lg font-bold leading-snug text-slate-900">
                          {c.titulo}
                        </h3>

                        {c.resumo && (
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                            <TextoComLinks texto={c.resumo} />
                          </p>
                        )}

                        <p className="mt-2 text-xs text-slate-400">
                          {tempoDeLeitura(c.texto)} min de leitura
                          {c.autor ? ` · Por ${c.autor}` : ""}
                        </p>

                        <details className="group mt-3">
                          <summary className="cursor-pointer list-none text-sm font-semibold text-primary hover:underline">
                            <span className="group-open:hidden">
                              Ler notícia completa →
                            </span>
                            <span className="hidden group-open:inline">
                              Fechar ↑
                            </span>
                          </summary>
                          <div className="mt-3 space-y-3 border-l-2 border-slate-100 pl-3 font-serif text-[15px] leading-relaxed text-slate-700">
                            {c.texto
                              .split("\n")
                              .filter(Boolean)
                              .map((paragrafo: string, i: number) => (
                                <p key={i}>
                                  <TextoComLinks
                                    texto={paragrafo}
                                    rotuloBotao="Acessar o link"
                                  />
                                </p>
                              ))}
                          </div>
                        </details>

                        <div className="mt-auto border-t border-slate-100 pt-3">
                          <BotaoCurtir
                            comunicadoId={c.id}
                            curtidoInicial={curtidosPorMim.has(c.id)}
                            totalInicial={totalPorPost.get(c.id) ?? 0}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {totalPaginas > 1 && (
        <nav
          aria-label="Páginas do jornal"
          className="mt-8 border-t-2 border-slate-200 pt-4"
        >
          <div className="flex items-center justify-between gap-3">
            {pagina > 1 ? (
              <Link
                href={enderecoPagina(pagina - 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                ← Anterior
              </Link>
            ) : (
              <span />
            )}

            <span className="text-sm text-slate-500">
              Página {pagina} de {totalPaginas}
            </span>

            {pagina < totalPaginas ? (
              <Link
                href={enderecoPagina(pagina + 1)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Próxima →
              </Link>
            ) : (
              <span />
            )}
          </div>

          {/* Números das páginas: da terceira em diante, voltar ao começo
              exigia clicar em "Anterior" várias vezes. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={enderecoPagina(n)}
                aria-current={n === pagina ? "page" : undefined}
                className={`min-w-9 rounded-lg px-2.5 py-2 text-center text-sm font-semibold tabular-nums ${
                  n === pagina
                    ? "bg-primary text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {n}
              </Link>
            ))}
          </div>

          {pagina > 1 && (
            <Link
              href={enderecoPagina(1)}
              className="mt-3 block rounded-xl bg-primary-soft py-3 text-center text-sm font-semibold text-primary hover:brightness-95"
            >
              ⇤ Voltar ao início do jornal
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
