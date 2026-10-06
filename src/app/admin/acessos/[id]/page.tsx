import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BarraDaRevenda } from "@/components/admin/BarraDaRevenda";
import { FormDoPapel } from "@/components/admin/FormDoPapel";
import { PerfisDaFicha, type PerfilNaFicha } from "@/components/admin/PerfisDaFicha";
import {
  FichaDeAcesso,
  type BlocoDeAcesso,
  type GrupoDeAcesso,
  type ItemDeAcesso,
  type ParteDaFicha,
} from "@/components/admin/FichaDeAcesso";
import { exigirTelaDeAcessos, gerenciaAcessos } from "@/lib/gestao-de-acessos-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodificar } from "@/lib/texto-url";
import {
  AJUDA_ACAO,
  EMOJI_GRUPO_ADMIN,
  GRUPOS_DO_ADMIN,
  MODULOS,
  MODULOS_OPCIONAIS,
  ROTULO_ACAO,
  ROTULO_PAPEL,
  ehOwner,
  moduloPorId,
  rotuloDaAcaoNoModulo,
  type Acao,
  type Modulo,
  type Papel,
} from "@/lib/acessos";
import { PAINEIS } from "@/lib/gestao";
import {
  perfisQueDaoModulo,
  perfisQueDaoPermissao,
  resumoDeOrigem,
  type ConteudoDosPerfis,
  type PerfilResumido,
} from "@/lib/ficha-de-acesso";
import { nomeCurtoRevenda } from "@/lib/revenda-sigla";
import { aplicarPerfilNaFicha, definirPapel, salvarFicha, tirarDoPerfilNaFicha } from "../actions";

export const dynamic = "force-dynamic";

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * A FICHA DE ACESSO DE UMA PESSOA (05/10/2026).
 *
 * Uma página por pessoa -- colaborador ou liderança -- com tudo o que ela
 * pode, na ordem em que a decisão é tomada:
 *
 *   1. o PAPEL: usa o app, ou também entra no Modo Liderança?
 *   2. os PERFIS: qual é o cargo dela? (o pacote de acessos)
 *   3. os ACESSOS, um por um, cada um dizendo de onde vem -- do perfil, ou
 *      individual (a exceção);
 *   4. o HISTÓRICO: quem mudou o quê, e quando.
 *
 * Antes, a mesma pergunta ("o que Fulano pode?") pedia três lugares: a
 * sanfona da liderança, a grade de módulos opcionais e a tela de Perfis --
 * e colaborador nem tinha ficha. "Ver como vê" continua a um clique
 * (/previa).
 *
 * A PORTA é a da Gestão de Acessos (exigirTelaDeAcessos), e a revenda é a
 * do app, na faixa colorida do topo.
 */
export default async function FichaDeAcessoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const { id } = await params;
  const { erro, sucesso } = await searchParams;
  const { eu, dono, podeEditar, alcance, revendas, escolhida, revendaDoApp } = await exigirTelaDeAcessos();
  const admin = createAdminClient();

  const [
    { data: pessoa },
    { data: vinculo },
    { data: outras },
    { data: ativosBanco },
    { data: extrasBanco },
    { data: permsBanco },
    { data: perfisBanco },
    { data: meusVinculos },
    { data: historico },
    gerencia,
  ] = await Promise.all([
    admin.from("profiles").select("id, nome, cargo, area, role").eq("id", id).maybeSingle(),
    admin
      .from("colaborador_revendas")
      .select("revenda_id")
      .eq("colaborador_id", id)
      .eq("revenda_id", escolhida.id)
      .maybeSingle(),
    admin
      .from("colaborador_revendas")
      .select("revendas!inner(id, nome)")
      .eq("colaborador_id", id)
      .neq("revenda_id", escolhida.id),
    admin.from("revenda_modulos").select("modulo").eq("revenda_id", escolhida.id).eq("ativo", true),
    admin.from("colaborador_modulos_extra").select("modulo").eq("colaborador_id", id).eq("revenda_id", escolhida.id),
    admin.from("lideranca_permissoes").select("modulo, acao").eq("colaborador_id", id).eq("revenda_id", escolhida.id),
    admin.from("perfis_acesso").select("id, nome, tipo").eq("revenda_id", escolhida.id).order("nome"),
    admin.from("perfil_pessoas").select("perfil_id").eq("colaborador_id", id).eq("revenda_id", escolhida.id),
    // O que aconteceu com ESTA pessoa, nesta revenda (ou sem revenda, como
    // o papel, que vale em todas).
    admin
      .from("auditoria")
      .select("id, ator_nome, acao, detalhes, criado_em")
      .eq("alvo_id", id)
      .or(`revenda_id.eq.${escolhida.id},revenda_id.is.null`)
      .order("criado_em", { ascending: false })
      .limit(8),
    dono ? Promise.resolve(false) : gerenciaAcessos(id),
  ]);

  if (!pessoa) notFound();
  // Para quem não é o Admin, ver a ficha de alguém de fora da revenda seria
  // informação sobre essa pessoa (mesma regra da prévia).
  if (!vinculo && !dono) notFound();

  const nome = (pessoa.nome as string) ?? "";
  const primeiroNome = nome.split(" ")[0] || nome;
  const papel = pessoa.role as string;
  const ehLideranca = papel === "lideranca";
  const voltaDaFicha = `/admin/acessos/${id}`;

  const perfisDaRevenda: PerfilResumido[] = ((perfisBanco ?? []) as { id: string; nome: string; tipo: string }[]).map(
    (p) => ({ id: p.id, nome: p.nome, tipo: p.tipo === "colaborador" ? "colaborador" : "lideranca" }),
  );
  const idsDaRevenda = perfisDaRevenda.map((p) => p.id);
  const [{ data: concessoesBanco }, { data: modulosAppBanco }] = await Promise.all([
    idsDaRevenda.length > 0
      ? admin.from("perfil_permissoes").select("perfil_id, modulo, acao").in("perfil_id", idsDaRevenda)
      : Promise.resolve({ data: [] }),
    idsDaRevenda.length > 0
      ? admin.from("perfil_modulos_app").select("perfil_id, modulo").in("perfil_id", idsDaRevenda)
      : Promise.resolve({ data: [] }),
  ]);
  const conteudo: ConteudoDosPerfis = { concessoes: new Map(), modulosApp: new Map() };
  for (const c of (concessoesBanco ?? []) as { perfil_id: string; modulo: string; acao: string }[]) {
    conteudo.concessoes.set(c.perfil_id, [...(conteudo.concessoes.get(c.perfil_id) ?? []), `${c.modulo}:${c.acao}`]);
  }
  for (const m of (modulosAppBanco ?? []) as { perfil_id: string; modulo: string }[]) {
    conteudo.modulosApp.set(m.perfil_id, [...(conteudo.modulosApp.get(m.perfil_id) ?? []), m.modulo]);
  }

  const idsMeus = new Set(((meusVinculos ?? []) as { perfil_id: string }[]).map((v) => v.perfil_id));
  const meusPerfis = perfisDaRevenda.filter((p) => idsMeus.has(p.id));
  const ativos = new Set(((ativosBanco ?? []) as { modulo: string }[]).map((a) => a.modulo));
  const appTem = new Set(((extrasBanco ?? []) as { modulo: string }[]).map((e) => e.modulo));
  const permsTem = new Set(((permsBanco ?? []) as { modulo: string; acao: string }[]).map((p) => `${p.modulo}:${p.acao}`));

  const origem = resumoDeOrigem({
    ehLideranca,
    modulosApp: appTem,
    permissoes: permsTem,
    perfis: meusPerfis,
    conteudo,
    modulosDaRevenda: ativos,
  });

  // O MOTIVO DE NÃO PODER ALTERAR, dito antes da primeira caixa. O
  // servidor recusa os mesmos casos -- a tela só evita a pessoa descobrir
  // o limite pelo erro.
  const travada = !vinculo
    ? `${primeiroNome} não está vinculado a ${escolhida.nome}. Vincule em Colaboradores para liberar acessos aqui.`
    : !podeEditar
      ? "Você pode consultar esta ficha, mas não alterar."
      : id === eu.id
        ? "É a sua própria ficha: os seus acessos só o Admin altera."
        : gerencia
          ? `${primeiroNome} também gerencia acessos: só o Admin altera a ficha dessa pessoa.`
          : null;

  // ---------- AS PARTES DA FICHA ----------
  const rotuloApp = (m: string) => {
    const mod = moduloPorId(m);
    return mod ? `${mod.emoji} ${mod.rotulo}` : m;
  };

  // 📱 No app: um interruptor por módulo opcional que a revenda tem ligado,
  // agrupados pelo módulo guarda-chuva (Produtividade do Armazém etc.).
  const gruposApp: GrupoDeAcesso[] = [];
  for (const m of MODULOS_OPCIONAIS.filter((x) => ativos.has(x))) {
    const mod = moduloPorId(m);
    const pai = mod?.subGrupoDe ? moduloPorId(mod.subGrupoDe) : null;
    const grupoId = pai?.id ?? "geral";
    let grupo = gruposApp.find((g) => g.id === grupoId);
    if (!grupo) {
      grupo = { id: grupoId, titulo: pai ? `${pai.emoji} ${pai.rotulo}` : "", blocos: [] };
      gruposApp.push(grupo);
    }
    const doPerfil = perfisQueDaoModulo(m, meusPerfis, conteudo);
    grupo.blocos.push({
      id: `app-${m}`,
      titulo: rotuloApp(m),
      itens: [
        {
          chave: `app:${m}`,
          campo: "app",
          valor: m,
          modulo: m,
          acao: null,
          rotulo: rotuloApp(m),
          resumo: `${mod?.rotulo ?? m} (no app)`,
          tem: appTem.has(m),
          doPerfil,
          foraDoAlcance: false,
        },
      ],
    });
  }
  // Os soltos primeiro, depois os guarda-chuvas: é a ordem da home.
  gruposApp.sort((a, b) => (a.id === "geral" ? -1 : b.id === "geral" ? 1 : 0));

  const itemDePermissao = (m: Modulo, acao: Acao, rotulo?: string): ItemDeAcesso => {
    const chave = `${m.id}:${acao}`;
    return {
      chave,
      campo: "permissao",
      valor: chave,
      modulo: m.id,
      acao,
      rotulo: rotulo ?? rotuloDaAcaoNoModulo(m, acao),
      etiqueta: rotulo ? undefined : ROTULO_ACAO[acao],
      nota: AJUDA_ACAO[acao],
      resumo: `${m.rotulo} · ${rotuloDaAcaoNoModulo(m, acao)}`,
      tem: permsTem.has(chave),
      doPerfil: perfisQueDaoPermissao(chave, meusPerfis, conteudo),
      foraDoAlcance: !!alcance && !alcance.has(chave),
    };
  };

  // ⚙️ No Modo Liderança. As ANÁLISES vêm primeiro e juntas (pedido do
  // dono, 05/09/2026): "Visualizar" de um módulo com análise mora lá, e só
  // lá -- um controle por permissão.
  const modulosAtivos = MODULOS.filter((m) => ativos.has(m.id));
  const paineis = PAINEIS.filter((p) => ativos.has(p.modulo)).filter(
    (p, i, todos) => todos.findIndex((x) => x.modulo === p.modulo) === i,
  );
  const comAnalise = new Set(paineis.map((p) => p.modulo as string));
  const blocosAnalise: BlocoDeAcesso[] = paineis.map((p) => {
    const m = moduloPorId(p.modulo)!;
    // A análise que É o módulo inteiro (Feedbacks, Justificativas...) traz
    // as outras ações junto; a que é uma tela de um módulo maior traz só o
    // ver, e o resto fica na gaveta dele.
    const itens = m.emGestao
      ? m.acoes.map((a) => itemDePermissao(m, a, a === "ver" ? `Ver ${p.rotulo}` : undefined))
      : [itemDePermissao(m, "ver", `${p.emoji} ${p.rotulo}`)];
    return {
      id: `analise-${p.id}`,
      titulo: `${p.emoji} ${p.rotulo}`,
      nota: m.emGestao ? p.pergunta : `${p.pergunta} (dentro de ${m.rotulo})`,
      itens,
    };
  });
  const gruposLideranca: GrupoDeAcesso[] = [];
  if (blocosAnalise.length > 0) {
    gruposLideranca.push({ id: "analises", titulo: "📊 Análises da Gestão — na home dela", blocos: blocosAnalise });
  }
  for (const grupo of GRUPOS_DO_ADMIN) {
    const blocos: BlocoDeAcesso[] = modulosAtivos
      .filter(
        (m) =>
          m.grupo === grupo &&
          !m.emGestao &&
          // Módulo cuja única ação é "ver" e que abre análise já está
          // inteiro no bloco das Análises.
          !(comAnalise.has(m.id) && m.acoes.every((a) => a === "ver")),
      )
      .map((m) => ({
        id: `mod-${m.id}`,
        titulo: `${m.emoji} ${m.rotulo}`,
        nota: comAnalise.has(m.id) ? "A análise deste módulo se libera em 📊 Análises da Gestão, acima." : undefined,
        itens: m.acoes.filter((a) => !(a === "ver" && comAnalise.has(m.id))).map((a) => itemDePermissao(m, a)),
      }))
      .filter((b) => b.itens.length > 0);
    if (blocos.length > 0) {
      gruposLideranca.push({ id: grupo, titulo: `${EMOJI_GRUPO_ADMIN[grupo]} ${grupo}`, blocos });
    }
  }

  const partes: ParteDaFicha[] = [
    {
      id: "app",
      titulo: "📱 No app",
      ajuda: "Os cartões que aparecem na tela inicial. Vale para qualquer papel.",
      grupos: gruposApp,
    },
  ];
  if (ehLideranca) {
    partes.push({
      id: "lideranca",
      titulo: "⚙️ No Modo Liderança",
      ajuda: "O que abre, cria, edita e exclui na gestão. Quem cria, edita ou exclui também abre a tela.",
      grupos: gruposLideranca,
    });
  }

  // A assinatura do que está gravado: muda depois de salvar, e o
  // formulário renasce do banco em vez de guardar o estado da tela.
  const assinatura = [...appTem, ...permsTem].sort().join("|") + `#${escolhida.id}`;

  const meusNaFicha: PerfilNaFicha[] = meusPerfis.map((p) => ({
    ...p,
    faltando:
      p.tipo === "colaborador"
        ? (conteudo.modulosApp.get(p.id) ?? []).filter((m) => ativos.has(m) && !appTem.has(m)).length
        : (conteudo.concessoes.get(p.id) ?? []).filter((c) => !permsTem.has(c)).length,
  }));
  const rotuloDaPermissao = (c: string) => {
    const corte = c.lastIndexOf(":");
    const m = moduloPorId(c.slice(0, corte));
    return m ? `${m.rotulo} · ${rotuloDaAcaoNoModulo(m, c.slice(corte + 1) as Acao)}` : c;
  };

  const outrasRevendas = ((outras ?? []) as { revendas: { nome: string } | { nome: string }[] }[])
    .map((v) => (Array.isArray(v.revendas) ? v.revendas[0] : v.revendas)?.nome)
    .filter((n): n is string => !!n)
    .map(nomeCurtoRevenda);
  const individuais = origem.individuaisApp.length + origem.individuaisPermissoes.length;
  const totalAcessos = appTem.size + (ehLideranca ? permsTem.size : 0);

  return (
    <div className="space-y-4">
      <BarraDaRevenda
        atual={escolhida}
        revendas={revendas}
        volta={voltaDaFicha}
        aviso={revendaDoApp ? `O resto do app está em ${revendaDoApp} — aqui você gerencia ${escolhida.nome}.` : undefined}
      />

      <div>
        {/* Link fixo para a lista, e não o ✕ que volta no histórico:
            depois de salvar, "voltar" cairia na mesma ficha antes do
            salvar. */}
        <Link href="/admin/acessos" className="text-xs font-semibold text-primary hover:underline">
          ← Todas as pessoas
        </Link>
        <PageHeader
          title={`👤 ${nome}`}
          subtitle={[pessoa.cargo, pessoa.area].filter(Boolean).join(" · ") || undefined}
        />
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{decodificar(erro)}</p>}
      {sucesso && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-700">✅ {decodificar(sucesso)}</p>}

      {/* O RESUMO, numa linha: o papel, quanto ela tem e quanto é exceção. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-bold ${
            ehOwner(papel)
              ? "bg-primary text-white"
              : ehLideranca
                ? "bg-amber-100 text-amber-900"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {ROTULO_PAPEL[papel as Papel] ?? papel}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
          {totalAcessos} acesso(s) em {nomeCurtoRevenda(escolhida.nome)}
        </span>
        {individuais > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">
            {individuais} individual(is), fora de perfil
          </span>
        )}
        {outrasRevendas.length > 0 && (
          <span
            className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-500"
            title="Cada revenda tem os próprios acessos. Troque na faixa do topo para ver os de lá."
          >
            também em {outrasRevendas.join(", ")}
          </span>
        )}
        <Link
          href={`/admin/acessos/${id}/previa`}
          className="ml-auto rounded-full border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:border-primary hover:text-primary"
        >
          👁️ Ver como {primeiroNome} vê
        </Link>
      </div>

      {ehOwner(papel) ? (
        <p className="rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary-dark">
          👑 É o Admin do app: pode tudo por definição, e não há o que liberar. Só existe um Admin, e ele é
          definido no banco de dados.
        </p>
      ) : (
        <>
          {/* 1. O PAPEL */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">Papel</h2>
                <p className="text-sm text-slate-600">
                  {ehLideranca ? (
                    <>
                      <strong>Liderança</strong> — usa o app e entra no Modo Liderança.
                    </>
                  ) : (
                    <>
                      <strong>Colaborador</strong> — usa o app; o Modo Liderança não existe para{" "}
                      {primeiroNome}.
                    </>
                  )}
                </p>
              </div>
              {!travada &&
                (ehLideranca ? (
                  <details className="w-full sm:w-auto">
                    <summary className="cursor-pointer list-none text-right text-xs font-semibold text-red-600 hover:underline">
                      Tirar a liderança…
                    </summary>
                    <FormDoPapel
                      action={definirPapel}
                      id={id}
                      nome={nome}
                      papel="colaborador"
                      revendaId={escolhida.id}
                      daFicha
                      className="mt-2 sm:w-72"
                    />
                  </details>
                ) : (
                  <details className="w-full sm:w-auto">
                    <summary className="cursor-pointer list-none text-right text-xs font-semibold text-primary hover:underline">
                      Tornar liderança…
                    </summary>
                    <FormDoPapel
                      action={definirPapel}
                      id={id}
                      nome={nome}
                      papel="lideranca"
                      revendaId={escolhida.id}
                      daFicha
                      className="mt-2 sm:w-72"
                    />
                  </details>
                ))}
            </div>
          </section>

          {/* 2. OS PERFIS */}
          <PerfisDaFicha
            pessoaId={id}
            pessoaNome={nome}
            papel={papel}
            revenda={{ id: escolhida.id, nome: escolhida.nome }}
            meus={meusNaFicha}
            disponiveis={perfisDaRevenda.filter((p) => !idsMeus.has(p.id))}
            individuais={{
              app: origem.individuaisApp.map((m) => `${moduloPorId(m)?.rotulo ?? m} (no app)`),
              lideranca: origem.individuaisPermissoes.map(rotuloDaPermissao),
            }}
            podeAlterar={!travada}
            podeEspelhar={dono}
            aplicar={aplicarPerfilNaFicha}
            tirar={tirarDoPerfilNaFicha}
          />

          {/* 3. OS ACESSOS */}
          <FichaDeAcesso
            key={assinatura}
            action={salvarFicha}
            pessoaId={id}
            pessoaNome={nome}
            revenda={escolhida}
            partes={partes}
            travada={travada}
            mandaLideranca={ehLideranca}
          />

          {!ehLideranca && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              ⚙️ <strong>Modo Liderança:</strong> {primeiroNome} é colaborador, então não há telas de gestão
              para liberar. Para isso, use <strong>Tornar liderança</strong>, no Papel acima.
              {permsTem.size > 0 &&
                ` Há ${permsTem.size} permissão(ões) de liderança guardadas que só passam a valer se ${primeiroNome} virar liderança.`}
            </p>
          )}
        </>
      )}

      {/* 4. O HISTÓRICO -- a auditoria desta pessoa, aqui mesmo. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">🕑 Histórico</h2>
          {dono && (
            <Link href="/admin/auditoria" className="text-xs font-semibold text-primary hover:underline">
              Log de Auditoria completo →
            </Link>
          )}
        </div>
        {(historico ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma alteração registrada para {primeiroNome}.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {(
              (historico ?? []) as { id: string; ator_nome: string; acao: string; detalhes: string | null; criado_em: string }[]
            ).map((h) => (
              <li key={h.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-xs text-slate-400">
                  {dataHora(h.criado_em)} · {h.ator_nome}
                </p>
                <p className="text-sm font-medium text-slate-800">{h.acao}</p>
                {h.detalhes && <p className="text-xs leading-snug text-slate-500">{h.detalhes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
