import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FormParticularidadePdv } from "@/components/admin/FormParticularidadePdv";
import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  ROTULO_SEVERIDADE,
  SEVERIDADES,
  pendenciasComPrazo,
  rotuloDoHorario,
  rotuloDoPrazo,
  rotuloDosDias,
  type Severidade,
} from "@/lib/pdv-particularidades";
import {
  categoriasDaRevenda,
  particularidadesDaRevenda,
  sugestoesPendentes,
  type CategoriaCompleta,
  type ParticularidadeCompleta,
} from "@/lib/pdv-particularidades-server";
import {
  dispensarSugestao,
  excluirParticularidade,
  reabrirParticularidade,
  resolverParticularidade,
  salvarCategorias,
  salvarParticularidade,
} from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

type Aba = "cadastro" | "categorias" | "sugestoes";

const ABAS: { id: Aba; rotulo: string; emoji: string; ajuda: string }[] = [
  {
    id: "cadastro",
    rotulo: "Clientes",
    emoji: "📍",
    ajuda: "Cadastre o que este cliente tem de diferente, e acompanhe os prazos.",
  },
  {
    id: "categorias",
    rotulo: "Categorias",
    emoji: "🏷️",
    ajuda: "O que pode ser cadastrado, e quanto cada coisa pesa na tela do motorista.",
  },
  {
    id: "sugestoes",
    rotulo: "Sugestões do Rating",
    emoji: "⭐",
    ajuda: "Clientes que já avaliaram como detratores mais de uma vez.",
  },
];

/**
 * PARTICULARIDADES DO PDV -- o cadastro.
 *
 * Pedido do dono (06/09/2026). A tela responde três perguntas diferentes,
 * e por isso são três abas: o que este cliente tem (cadastro), o que pode
 * ser cadastrado (categorias) e quem o Rating está apontando (sugestões).
 *
 * O PAINEL DE PRAZOS VEM ANTES DE TUDO, na primeira aba: é a única parte
 * que COBRA. O resto é consulta e cadastro; um PDV bloqueado que passou
 * da data é entrega perdida todo dia em que ninguém olha.
 */
export default async function ParticularidadesDoPdvPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; aba?: string; busca?: string }>;
}) {
  /*
    O CADASTRO EXIGE "EDITAR", NÃO "VER" -- separação pedida pelo dono
    (07/09/2026): "apenas as configurações precisa estar na liderança".

    Antes, o mesmo "Visualizar" abria a análise E esta tela de cadastro.
    Quem monitora rota precisa LER as particularidades o dia inteiro, e não
    tem por que poder mexer no cadastro que a operação inteira consulta.
    Agora são duas chaves: `ver` abre a análise em 📊 Gestão › Particularidades
    do PDV; `editar` abre isto aqui.
  */
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda("/admin");
  const { erro, sucesso, aba: abaParam, busca = "" } = await searchParams;

  const aba: Aba =
    abaParam === "categorias" ? "categorias" : abaParam === "sugestoes" ? "sugestoes" : "cadastro";

  const podeEditar = await podeNoModulo("pdv-particularidades", "editar");
  const podeExcluir = await podeNoModulo("pdv-particularidades", "excluir");

  const [categorias, particularidades, sugestoes] = await Promise.all([
    categoriasDaRevenda(revendaId, { incluirInativas: true }),
    particularidadesDaRevenda(revendaId),
    aba === "sugestoes" ? sugestoesPendentes(revendaId) : Promise.resolve([]),
  ]);

  const mapaCategorias = new Map(categorias.map((c) => [c.id, c]));
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const ativas = particularidades.filter((p) => p.status === "ativa");
  const pendencias = pendenciasComPrazo(ativas, mapaCategorias, hoje);
  const vencidas = pendencias.filter((p) => p.vencida);

  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? particularidades.filter(
        (p) =>
          p.codPdv.includes(termo) ||
          (p.nomePdv ?? "").toLowerCase().includes(termo) ||
          (p.cidade ?? "").toLowerCase().includes(termo),
      )
    : particularidades;

  // A categoria "Cliente detrator" é o destino das sugestões. Sem ela
  // cadastrada, a aba diz isso em vez de oferecer um botão que falharia.
  const categoriaDetrator = categorias.find(
    (c) => c.ativo && c.nome.toLowerCase().includes("detrator"),
  );

  return (
    <div>
      <PageHeader
        title="📍 Particularidades do PDV"
        subtitle="O que cada cliente tem de diferente — e o que o motorista precisa saber antes de chegar."
      />

      {erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(erro)}</p>}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{decodificar(sucesso)}</p>
      )}

      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={`/admin/pdv-particularidades?aba=${a.id}`}
              aria-current={a.id === aba ? "page" : undefined}
              className={
                a.id === aba
                  ? "rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary hover:text-primary"
              }
            >
              {a.emoji} {a.rotulo}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{ABAS.find((a) => a.id === aba)?.ajuda}</p>
      </div>

      {aba === "cadastro" && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            <Numero valor={ativas.length} rotulo="particularidades ativas" />
            <Numero valor={new Set(ativas.map((p) => p.codPdv)).size} rotulo="clientes com aviso" />
            <Numero valor={vencidas.length} rotulo="prazos vencidos" alerta={vencidas.length > 0} />
          </div>

          {/*
            O PAINEL DE PRAZOS, antes do cadastro.

            Pedido do dono: "no painel de pendência faria o acompanhamento
            de quantos dias faltam para desbloquear esse PDV". Vencidas
            primeiro, depois as que vencem antes -- é a ordem da cobrança,
            não a da data de cadastro.
          */}
          {pendencias.length > 0 && (
            <section className="mb-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                ⏳ Com prazo correndo
              </h2>
              {/* DE QUEM É ESTE PAINEL, dito na tela. O bloqueio é assunto
                  comercial -- entre a revenda e o cliente --, e quem
                  entrega não é quem negocia. Correção do dono
                  (06/09/2026). */}
              <p className="mb-2 text-xs text-slate-500">
                Acompanhamento da liderança. O <strong>PDV bloqueado</strong> não aparece para o
                motorista: ele não negocia com o cliente, e o comentário na porta viraria ruído.
              </p>
              <div className="space-y-2">
                {pendencias.map(({ particularidade: p, categoria, dias, vencida }) => (
                  <div
                    key={p.id}
                    className={`rounded-2xl border p-3 shadow-sm ${
                      vencida ? "border-red-300 bg-red-50" : "border-amber-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          {categoria.emoji} {p.nomePdv ?? `Cliente ${p.codPdv}`}
                          <span className="ml-1.5 text-xs font-normal text-slate-400">
                            #{p.codPdv}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">{p.aviso}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                          vencida ? "bg-red-600 text-white" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {rotuloDoPrazo(dias)}
                      </span>
                    </div>
                    {podeEditar && (
                      <form action={resolverParticularidade} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          name="resolucao"
                          placeholder="O que foi feito? (opcional)"
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                        />
                        <BotaoEnviar
                          textoEnviando="..."
                          className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          ✅ Resolver
                        </BotaoEnviar>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-800">➕ Nova particularidade</h2>
            {categorias.filter((c) => c.ativo).length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhuma categoria ativa. Cadastre uma na aba{" "}
                <Link href="?aba=categorias" className="font-semibold text-primary hover:underline">
                  Categorias
                </Link>
                .
              </p>
            ) : (
              <FormParticularidadePdv
                categorias={categorias
                  .filter((c) => c.ativo)
                  .map((c) => ({
                    id: c.id,
                    nome: c.nome,
                    emoji: c.emoji,
                    ajuda: c.ajuda,
                    severidade: c.severidade,
                    exigePrazo: c.exigePrazo,
                    exigeHorario: c.exigeHorario,
                    alertaNaRota: c.alertaNaRota,
                  }))}
                hoje={hoje}
              />
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Cadastradas ({filtradas.length})
              </h2>
              <form method="get" className="flex gap-2">
                <input type="hidden" name="aba" value="cadastro" />
                <input
                  name="busca"
                  defaultValue={busca}
                  placeholder="Código, nome ou cidade"
                  className="min-w-[10rem] rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Buscar
                </button>
                {termo && (
                  <Link
                    href="/admin/pdv-particularidades"
                    className="flex items-center px-2 text-sm text-slate-500 hover:text-primary"
                  >
                    Limpar
                  </Link>
                )}
              </form>
            </div>

            {filtradas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                {termo ? "Nenhuma particularidade com esse termo." : "Nada cadastrado ainda."}
              </p>
            ) : (
              <div className="space-y-2">
                {filtradas.map((p) => (
                  <LinhaParticularidade
                    key={p.id}
                    p={p}
                    categoria={mapaCategorias.get(p.categoriaId)}
                    podeEditar={podeEditar}
                    podeExcluir={podeExcluir}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {aba === "categorias" && (
        <form action={salvarCategorias} className="space-y-3">
          <div className="rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            A <strong>severidade</strong> decide a cor e o ícone na tela de quem está na rota — alerta
            que grita sempre vira alerta que ninguém ouve. <strong>Exige prazo</strong> obriga a data
            de liberação (é o que faz o painel contar os dias).
            <br />
            <strong>Vai para a rota</strong> é a chave mais importante desta tela: desmarcada, a
            categoria some do celular do motorista e fica só para quem acompanha. É assim que{" "}
            <strong>PDV bloqueado</strong> está — bloqueio é assunto comercial, e quem entrega não
            negocia com o cliente.
          </div>

          {categorias.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl border p-3 shadow-sm ${
                c.ativo ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
              }`}
            >
              <input type="hidden" name="categoria_id" value={c.id} />
              <div className="grid gap-2 sm:grid-cols-[4rem_1fr_9rem]">
                <div>
                  <label className={rotulo}>Ícone</label>
                  <input name={`emoji__${c.id}`} defaultValue={c.emoji ?? ""} maxLength={4} className={campo} />
                </div>
                <div>
                  <label className={rotulo}>Nome</label>
                  <input name={`nome__${c.id}`} defaultValue={c.nome} required className={campo} />
                </div>
                <div>
                  <label className={rotulo}>Severidade</label>
                  <select name={`severidade__${c.id}`} defaultValue={c.severidade} className={campo}>
                    {SEVERIDADES.map((s) => (
                      <option key={s} value={s}>
                        {ROTULO_SEVERIDADE[s].icone} {ROTULO_SEVERIDADE[s].titulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2">
                <label className={rotulo}>O que entra nesta categoria</label>
                <input name={`ajuda__${c.id}`} defaultValue={c.ajuda ?? ""} maxLength={240} className={campo} />
              </div>
              {/* A MENSAGEM PRONTA MORA NA CATEGORIA, e não na tela de quem
                  envia. Escrita uma vez, todo mundo manda a mesma coisa --
                  e trocar o tom é editar aqui, não pedir um deploy. */}
              <div className="mt-2">
                <label className={rotulo}>Mensagem pronta para o cliente</label>
                <textarea
                  name={`mensagem__${c.id}`}
                  defaultValue={c.mensagemModelo ?? ""}
                  rows={3}
                  maxLength={600}
                  placeholder="Vazio = a tela do monitoramento não oferece o botão de enviar."
                  className={campo}
                />
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Trocados na hora do envio:{" "}
                  <code className="rounded bg-slate-100 px-1">{"{cliente}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{codigo}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{cidade}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{janela}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{aviso}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{data}"}</code>{" "}
                  <code className="rounded bg-slate-100 px-1">{"{mapa}"}</code>. Quem lê é o dono do
                  bar — nada de jargão interno.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                <Caixa nome={`exige_prazo__${c.id}`} marcado={c.exigePrazo} texto="Exige prazo" />
                <Caixa nome={`exige_horario__${c.id}`} marcado={c.exigeHorario} texto="Exige horário" />
                <Caixa nome={`alerta_na_rota__${c.id}`} marcado={c.alertaNaRota} texto="Vai para a rota" />
                <Caixa nome={`ativo__${c.id}`} marcado={c.ativo} texto="Ativa" />
              </div>
            </div>
          ))}

          {/* A categoria nova no MESMO formulário: cadastrar não pode
              custar uma segunda tela nem um segundo Salvar. */}
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-3">
            <p className="mb-2 text-sm font-bold text-slate-700">➕ Nova categoria</p>
            <div className="grid gap-2 sm:grid-cols-[4rem_1fr_9rem]">
              <div>
                <label className={rotulo}>Ícone</label>
                <input name="nova_emoji" maxLength={4} placeholder="📌" className={campo} />
              </div>
              <div>
                <label className={rotulo}>Nome</label>
                <input name="nova_nome" placeholder="Ex.: Entrega só com agendamento" className={campo} />
              </div>
              <div>
                <label className={rotulo}>Severidade</label>
                <select name="nova_severidade" defaultValue="atencao" className={campo}>
                  {SEVERIDADES.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_SEVERIDADE[s].icone} {ROTULO_SEVERIDADE[s].titulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-2">
              <label className={rotulo}>O que entra nesta categoria</label>
              <input name="nova_ajuda" maxLength={240} className={campo} />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
              <Caixa nome="nova_exige_prazo" marcado={false} texto="Exige prazo" />
              <Caixa nome="nova_exige_horario" marcado={false} texto="Exige horário" />
              <Caixa nome="nova_alerta_na_rota" marcado texto="Vai para a rota" />
            </div>
          </div>

          {podeEditar && (
            <div className="sticky bottom-4 z-10">
              <BotaoEnviar
                textoEnviando="Salvando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
              >
                Salvar categorias
              </BotaoEnviar>
            </div>
          )}
        </form>
      )}

      {aba === "sugestoes" && (
        <section>
          <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            Clientes com <strong>2 ou mais avaliações detratoras</strong>. Uma nota ruim é um dia ruim;
            duas é padrão — e é por isso que a lista é curta o bastante para ser lida. O app{" "}
            <strong>propõe</strong>; quem confirma é você: nota detratora nem sempre é culpa do
            cliente, e carimbar quem não merece é injusto com ele e inútil para o motorista.
          </div>

          {!categoriaDetrator ? (
            <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Não há categoria ativa para “cliente detrator”. Crie uma na aba{" "}
              <Link href="?aba=categorias" className="font-semibold underline">
                Categorias
              </Link>{" "}
              para poder aceitar estas sugestões.
            </p>
          ) : sugestoes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Nenhuma sugestão pendente — todas já viraram particularidade ou foram dispensadas.
            </p>
          ) : (
            <div className="space-y-2">
              {sugestoes.map((s) => (
                <div key={s.codPdv} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {s.nomePdv ?? `Cliente ${s.codPdv}`}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">#{s.codPdv}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.cidade ?? "cidade não informada"} · {s.detratoras} detratora(s) de{" "}
                        {s.avaliacoes} · média{" "}
                        <strong className={s.media < 3 ? "text-red-700" : "text-slate-700"}>
                          {s.media}
                        </strong>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                      {s.detratoras}×
                    </span>
                  </div>

                  <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                    {s.aviso}
                  </p>

                  {podeEditar && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {/* A frase já vem escrita: aceitar é um toque, e é
                          isso que faz a lista ser tratada em vez de
                          adiada. */}
                      <form action={salvarParticularidade}>
                        <input type="hidden" name="categoria_id" value={categoriaDetrator.id} />
                        <input type="hidden" name="cod_pdv" value={s.codPdv} />
                        <input type="hidden" name="nome_pdv" value={s.nomePdv ?? ""} />
                        <input type="hidden" name="cidade" value={s.cidade ?? ""} />
                        <input type="hidden" name="aviso" value={s.aviso} />
                        <input type="hidden" name="origem" value="rating" />
                        <BotaoEnviar
                          textoEnviando="..."
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          ✅ Virar aviso de rota
                        </BotaoEnviar>
                      </form>
                      <form action={dispensarSugestao}>
                        <input type="hidden" name="categoria_id" value={categoriaDetrator.id} />
                        <input type="hidden" name="cod_pdv" value={s.codPdv} />
                        <input type="hidden" name="nome_pdv" value={s.nomePdv ?? ""} />
                        <input type="hidden" name="cidade" value={s.cidade ?? ""} />
                        <input type="hidden" name="aviso" value={s.aviso} />
                        <BotaoEnviar
                          textoEnviando="..."
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          Não é caso
                        </BotaoEnviar>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function LinhaParticularidade({
  p,
  categoria,
  podeEditar,
  podeExcluir,
}: {
  p: ParticularidadeCompleta;
  categoria: CategoriaCompleta | undefined;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const resolvida = p.status !== "ativa";
  const horario = rotuloDoHorario(p.janelas);
  const dias = rotuloDosDias(p.diasSemana);
  const severidade: Severidade = categoria?.severidade ?? "atencao";

  return (
    <div
      className={`rounded-2xl border p-3 shadow-sm ${
        resolvida ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {categoria?.emoji} {p.nomePdv ?? `Cliente ${p.codPdv}`}
            <span className="ml-1.5 text-xs font-normal text-slate-400">#{p.codPdv}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {categoria?.nome ?? "categoria apagada"}
            {p.cidade && ` · ${p.cidade}`}
            {p.bairro && ` / ${p.bairro}`}
            {p.origem === "rating" && " · sugerida pelo Rating"}
          </p>
          {/* QUEM VÊ ISTO, na própria linha. Sem a marca, um cadastro de
              bloqueio parece igual a um aviso de horário -- e a diferença
              é justamente quem lê. */}
          {categoria && !categoria.alertaNaRota && (
            <p className="mt-1 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              🔒 só a liderança vê
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            resolvida
              ? "bg-slate-200 text-slate-600"
              : severidade === "critico"
                ? "bg-red-100 text-red-800"
                : severidade === "atencao"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {resolvida ? "resolvida" : ROTULO_SEVERIDADE[severidade].titulo}
        </span>
      </div>

      <p className={`mt-1.5 text-sm ${resolvida ? "text-slate-500 line-through" : "text-slate-800"}`}>
        {p.aviso}
      </p>
      {p.detalhe && <p className="mt-1 text-xs text-slate-500">{p.detalhe}</p>}

      {(horario || dias || p.ate) && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
          {horario && <span>⏰ {horario}</span>}
          {dias && <span>📅 {dias}</span>}
          {p.ate && <span>🚫 até {p.ate.split("-").reverse().join("/")}</span>}
        </p>
      )}

      {resolvida && p.resolvidoPorNome && (
        <p className="mt-1 text-[11px] text-slate-400">
          Resolvida por {p.resolvidoPorNome}
          {p.resolucao && ` — ${p.resolucao}`}
        </p>
      )}

      {(podeEditar || podeExcluir) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {podeEditar && !resolvida && (
            <form action={resolverParticularidade}>
              <input type="hidden" name="id" value={p.id} />
              <BotaoEnviar
                textoEnviando="..."
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary"
              >
                ✅ Resolver
              </BotaoEnviar>
            </form>
          )}
          {podeEditar && resolvida && (
            <form action={reabrirParticularidade}>
              <input type="hidden" name="id" value={p.id} />
              <BotaoEnviar
                textoEnviando="..."
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-primary hover:text-primary"
              >
                ↩️ Reabrir
              </BotaoEnviar>
            </form>
          )}
          {podeExcluir && (
            <form action={excluirParticularidade}>
              <input type="hidden" name="id" value={p.id} />
              {/* Discreto de propósito: o caminho normal é resolver, que
                  guarda a história. Apagar é para o erro de digitação. */}
              <BotaoEnviar
                textoEnviando="..."
                className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-600"
              >
                apagar
              </BotaoEnviar>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Caixa({ nome, marcado, texto }: { nome: string; marcado: boolean; texto: string }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" name={nome} defaultChecked={marcado} className="h-4 w-4 rounded" />
      {texto}
    </label>
  );
}

function Numero({
  valor,
  rotulo: texto,
  alerta = false,
}: {
  valor: number;
  rotulo: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${
        alerta && valor > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums ${
          alerta && valor > 0 ? "text-red-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{texto}</p>
    </div>
  );
}
