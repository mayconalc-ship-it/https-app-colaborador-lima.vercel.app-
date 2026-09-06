import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { AbasDeAcesso, type AbaDeAcesso } from "@/components/admin/AbasDeAcesso";
import {
  AJUDA_ACAO,
  EMOJI_GRUPO_ADMIN,
  GRUPOS_DO_ADMIN,
  MODULOS,
  MODULOS_OPCIONAIS,
  ROTULO_ACAO,
  ROTULO_PAPEL,
  moduloPorId,
  rotuloDaAcaoNoModulo,
  type Acao,
  type Modulo,
  type Papel,
} from "@/lib/acessos";
import { PAINEIS, paineisDoModulo } from "@/lib/gestao";
import { simularAplicacao, type Concessao } from "@/lib/perfis-acesso";
import {
  aplicarPerfilNaFicha,
  definirPapel,
  liberarAcessosEmLote,
  liberarAnalisesEmLote,
  salvarPermissoes,
} from "./actions";

/**
 * As marcações de UM módulo, dentro do formulário de uma pessoa.
 *
 * Existe fora do laço porque o mesmo bloco é desenhado em dois lugares: na
 * gaveta do módulo e, quando a tela dele É uma análise, no bloco das
 * Análises da Gestão. Duas cópias divergiriam na primeira mudança.
 *
 * `tituloAlternativo` deixa a análise se chamar pelo nome que a liderança
 * conhece ("📝 Feedbacks das Rotas") em vez do nome do módulo, quando ela
 * aparece no bloco das análises.
 */
function BlocoDoModulo({
  m,
  minhas,
  tituloAlternativo,
  ajuda,
}: {
  m: Modulo;
  minhas: Set<string>;
  tituloAlternativo?: string;
  ajuda?: string;
}) {
  const analises = paineisDoModulo(m.id);

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-slate-800">
        {tituloAlternativo ?? `${m.emoji} ${m.rotulo}`}
      </p>
      {ajuda && <p className="mb-1.5 text-xs leading-snug text-slate-500">{ajuda}</p>}

      {/*
        A ANÁLISE QUE ESTE MÓDULO ABRE, dita por extenso.

        A permissão sempre foi esta -- o "Visualizar" do módulo. O que
        faltava era a tela DIZER: numa lista de trinta, quem marcava "Uso
        do App" não sabia que estava abrindo um painel, e quem queria abrir
        um painel não sabia qual módulo marcar.

        Some quando o bloco já está DENTRO das Análises: ali o título já é
        o nome da análise, e o aviso repetiria a mesma frase.
      */}
      {!tituloAlternativo &&
        analises.map((a) => (
          <p
            key={a.id}
            className="mb-1.5 rounded-lg bg-primary-soft/60 px-2 py-1 text-[11px] leading-snug text-primary-dark"
          >
            📊 <strong>Visualizar</strong> abre a análise <strong>{a.rotulo}</strong> na Gestão e na
            home — {a.pergunta.toLowerCase()}
          </p>
        ))}

      {/*
        UMA AÇÃO POR LINHA, dizendo o que ela destrava.

        Eram quatro palavras genéricas lado a lado -- Visualizar, Criar,
        Editar, Excluir -- que significam coisas diferentes em cada módulo:
        "criar" em Refugo é IMPORTAR O RELATÓRIO, "editar" é CADASTRAR O
        VALOR DOS MATERIAIS. Quem concede escolhia no escuro, e no escuro
        se libera demais por precaução. Em linha, cada frase cabe inteira.
      */}
      <div className="space-y-1.5">
        {m.acoes.map((acao) => (
          <label
            key={acao}
            className="flex items-start gap-2 text-sm leading-snug text-slate-600"
          >
            <input
              type="checkbox"
              name="permissao"
              value={`${m.id}:${acao}`}
              defaultChecked={minhas.has(`${m.id}:${acao}`)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
            />
            <span>
              {rotuloDaAcaoNoModulo(m, acao)}
              {/* O nome antigo continua visível, pequeno: é o que aparece
                  no Log de Auditoria e nos Perfis, e some-lo faria as três
                  telas falarem línguas diferentes. */}
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                {ROTULO_ACAO[acao]}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* Só as ações que não se explicam sozinhas ganham nota — poluir
          todas cansaria a leitura. */}
      {m.acoes.map((acao) =>
        AJUDA_ACAO[acao] ? (
          <p
            key={`ajuda-${acao}`}
            className="mt-1.5 rounded-lg bg-gold-soft p-2 text-xs text-primary-dark"
          >
            <strong>{ROTULO_ACAO[acao]}:</strong> {AJUDA_ACAO[acao]}
          </p>
        ) : null,
      )}
    </div>
  );
}

/**
 * O MOLDE DESTA PESSOA -- e o quanto ela saiu dele.
 *
 * Ponto 2 do diagnóstico (06/09/2026). A tela pergunta "quem tem o módulo
 * X?"; quem administra pensa "o que o conferente precisa?". Perfis de
 * Acesso responde a segunda pergunta e estava subusado -- quatro perfis,
 * nove pessoas, e as duas lideranças mais carregadas montadas à mão com
 * 49 concessões cada. Parte da causa era o caminho: aplicar um perfil
 * exigia sair daqui.
 *
 * E FALTAVA A OUTRA METADE: não havia como saber quem estava FORA do
 * molde. Um perfil que ninguém confere vira decoração -- e a insegurança
 * de "será que liberei demais?" mora exatamente aí.
 *
 * O que sai daqui é leitura, mais dois botões:
 *   - SOMAR, para vestir o molde sem tirar nada de ninguém;
 *   - VOLTAR AO MOLDE (espelhar), que TIRA -- e por isso lista antes,
 *     nome por nome, o que vai sair. Confirmação sobre uma lista, não
 *     sobre uma palavra.
 */
function PerfilDaPessoa({
  pessoaId,
  pessoaNome,
  revendaId,
  meus,
  perfis,
  concessoesDoPerfil,
  minhas,
}: {
  pessoaId: string;
  pessoaNome: string;
  revendaId: string;
  meus: { id: string; nome: string }[];
  perfis: { id: string; nome: string }[];
  concessoesDoPerfil: Map<string, Concessao[]>;
  minhas: Set<string>;
}) {
  const jaTem: Concessao[] = [...minhas].map((c) => {
    const corte = c.lastIndexOf(":");
    return { modulo: c.slice(0, corte), acao: c.slice(corte + 1) };
  });

  const rotuloDaConcessao = (c: Concessao) => {
    const m = moduloPorId(c.modulo);
    return m
      ? `${m.rotulo} · ${rotuloDaAcaoNoModulo(m, c.acao as Acao)}`
      : `${c.modulo}:${c.acao}`;
  };

  // SEM PERFIL: a tela oferece um, em vez de só constatar a falta.
  if (meus.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">🎫 Sem perfil</p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          As permissões abaixo foram montadas uma a uma. Um perfil dá nome ao conjunto e repete o
          mesmo na próxima contratação.
        </p>
        {perfis.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Nenhum perfil criado nesta revenda ainda —{" "}
            <Link href="/admin/perfis-de-acesso" className="font-semibold text-primary hover:underline">
              criar o primeiro
            </Link>
            . Dá para criá-lo a partir das permissões de alguém que já esteja certo.
          </p>
        ) : (
          <form action={aplicarPerfilNaFicha} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="revenda" value={revendaId} />
            <input type="hidden" name="colaborador_id" value={pessoaId} />
            {/* SOMAR por padrão. O espelhar tira, e não se oferece uma
                remoção a quem ainda não escolheu o molde. */}
            <select
              name="perfil_id"
              defaultValue=""
              required
              className="min-w-[10rem] rounded-lg border border-slate-300 bg-white p-2 text-sm"
            >
              <option value="" disabled>
                Escolha um perfil…
              </option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <BotaoEnviar
              textoEnviando="Aplicando..."
              className="rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-soft"
            >
              Somar este perfil
            </BotaoEnviar>
            <span className="text-[11px] text-slate-400">Acrescenta; não tira nada.</span>
          </form>
        )}
      </div>
    );
  }

  // COM MAIS DE UM PERFIL: não há molde único para comparar, e inventar um
  // seria pior do que não comparar.
  if (meus.length > 1) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">
          🎫 {meus.map((p) => p.nome).join(" + ")}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          Com mais de um perfil não existe um molde único para comparar — quem acumula funções é
          conferido a mão mesmo. Para separar, tire um dos perfis em{" "}
          <Link href="/admin/perfis-de-acesso" className="font-semibold text-primary hover:underline">
            Perfis de Acesso
          </Link>
          .
        </p>
      </div>
    );
  }

  const perfil = meus[0];
  const { entram, foraDoPerfil } = simularAplicacao(
    concessoesDoPerfil.get(perfil.id) ?? [],
    jaTem,
  );
  const igual = entram.length === 0 && foraDoPerfil.length === 0;

  return (
    <div
      className={`mb-4 rounded-xl border p-3 ${
        igual ? "border-green-200 bg-green-50/60" : "border-amber-300 bg-amber-50"
      }`}
    >
      <p className="text-sm font-semibold text-slate-800">
        🎫 {perfil.nome}
        <span
          className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            igual ? "bg-green-600 text-white" : "bg-amber-600 text-white"
          }`}
        >
          {igual ? "igual ao molde" : `${entram.length + foraDoPerfil.length} fora do molde`}
        </span>
      </p>

      {igual ? (
        <p className="mt-0.5 text-xs text-slate-500">
          As permissões desta pessoa são exatamente as do perfil.
        </p>
      ) : (
        <>
          <div className="mt-2 space-y-2 text-xs leading-snug">
            {foraDoPerfil.length > 0 && (
              <div>
                <p className="font-semibold text-amber-900">
                  Tem a mais que o perfil ({foraDoPerfil.length}):
                </p>
                <ul className="mt-0.5 space-y-0.5 text-slate-700">
                  {foraDoPerfil.map((c) => (
                    <li key={`${c.modulo}:${c.acao}`}>+ {rotuloDaConcessao(c)}</li>
                  ))}
                </ul>
              </div>
            )}
            {entram.length > 0 && (
              <div>
                <p className="font-semibold text-amber-900">
                  Está no perfil e falta aqui ({entram.length}):
                </p>
                <ul className="mt-0.5 space-y-0.5 text-slate-700">
                  {entram.map((c) => (
                    <li key={`${c.modulo}:${c.acao}`}>− {rotuloDaConcessao(c)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {/* VOLTAR AO MOLDE é o espelhar: acrescenta o que falta e
                RETIRA o que sobra. A lista acima é a confirmação -- quem
                aperta já leu, nome por nome, o que sai. */}
            <form action={aplicarPerfilNaFicha}>
              <input type="hidden" name="revenda" value={revendaId} />
              <input type="hidden" name="colaborador_id" value={pessoaId} />
              <input type="hidden" name="perfil_id" value={perfil.id} />
              <input type="hidden" name="modo" value="espelhar" />
              <BotaoEnviar
                textoEnviando="Aplicando..."
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Deixar {pessoaNome.split(" ")[0]} igual ao perfil
              </BotaoEnviar>
            </form>
            {entram.length > 0 && (
              <form action={aplicarPerfilNaFicha}>
                <input type="hidden" name="revenda" value={revendaId} />
                <input type="hidden" name="colaborador_id" value={pessoaId} />
                <input type="hidden" name="perfil_id" value={perfil.id} />
                <BotaoEnviar
                  textoEnviando="Aplicando..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-primary hover:text-primary"
                >
                  Só somar o que falta
                </BotaoEnviar>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default async function GestaoDeAcessosPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    busca?: string;
    filtro?: string;
    area?: string;
    funcao?: string;
    papel?: string;
    revendaExtra?: string;
    revenda?: string;
    aba?: string;
  }>;
}) {
  const eu = await requireOwner();
  const {
    erro,
    sucesso,
    busca = "",
    filtro = "",
    area: areaFiltro = "",
    funcao: funcaoFiltro = "",
    papel: papelFiltro = "",
    revendaExtra: revendaExtraFiltro = "",
    revenda: revendaParam,
    aba,
  } = await searchParams;

  // A ficha da pessoa é o padrão: é a pergunta mais frequente e a única
  // que responde por alguém em particular. As grades são de manutenção em
  // lote, e quem vai fazer isso sabe que vai.
  const abaAtual: AbaDeAcesso = aba === "modulos" ? "modulos" : "pessoa";

  const admin = createAdminClient();

  const { data: revendas } = await admin
    .from("revendas")
    .select("id, nome")
    .eq("ativa", true)
    .order("ordem");

  // Permissão é sempre "nesta revenda". A tela inteira trabalha sobre uma
  // unidade de cada vez -- é assim que o Admin pensa ("estou configurando
  // Barreiras"), e evita uma matriz de módulos vezes revendas na mesma
  // página, que ninguém consegue ler no celular.
  const escolhida =
    (revendas ?? []).find((r) => r.id === revendaParam) ?? (revendas ?? [])[0];

  if (!escolhida) {
    return (
      <div>
        <PageHeader title="🔐 Acessos por Pessoa" />
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma revenda ativa. Cadastre uma em Revendas antes de liberar
          acessos.
        </p>
      </div>
    );
  }

  const [
    { data: pessoas },
    { data: permissoes },
    { data: vinculos },
    { data: modulosAtivos },
    { data: extras },
    { data: vinculosOutras },
    { data: perfisBanco },
    { data: perfilPermissoes },
    { data: perfilPessoas },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, nome, cpf, cargo, area, role")
      .order("nome", { ascending: true }),
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id, modulo, acao")
      .eq("revenda_id", escolhida.id),
    admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", escolhida.id),
    admin
      .from("revenda_modulos")
      .select("modulo")
      .eq("revenda_id", escolhida.id)
      .eq("ativo", true),
    admin
      .from("colaborador_modulos_extra")
      .select("colaborador_id, modulo")
      .eq("revenda_id", escolhida.id),
    // Vínculo com OUTRAS revendas -- só pra mostrar o selo "também em
    // Barreiras" e servir de filtro. Tabela pequena (uma linha por pessoa
    // por revenda), então não vale a pena restringir por id aqui.
    admin
      .from("colaborador_revendas")
      .select("colaborador_id, revendas!inner(id, nome)")
      .neq("revenda_id", escolhida.id),
    // O MOLDE e quem o veste -- é o que faltava para esta tela poder
    // dizer "está fora do molde". Ver o bloco PerfilDaPessoa abaixo.
    admin.from("perfis_acesso").select("id, nome").eq("revenda_id", escolhida.id).order("nome"),
    admin.from("perfil_permissoes").select("perfil_id, modulo, acao"),
    admin
      .from("perfil_pessoas")
      .select("perfil_id, colaborador_id")
      .eq("revenda_id", escolhida.id),
  ]);

  const porPessoa = new Map<string, Set<string>>();
  for (const p of permissoes ?? []) {
    if (!porPessoa.has(p.colaborador_id)) {
      porPessoa.set(p.colaborador_id, new Set());
    }
    porPessoa.get(p.colaborador_id)!.add(`${p.modulo}:${p.acao}`);
  }

  const daRevenda = new Set((vinculos ?? []).map((v) => v.colaborador_id));

  // Só os módulos que a revenda usa. Oferecer os outros seria prometer um
  // acesso que a tela do painel não vai mostrar.
  const modulos = MODULOS.filter((m) =>
    new Set((modulosAtivos ?? []).map((x) => x.modulo)).has(m.id),
  );

  const termo = busca.trim().toLowerCase();
  const todas = pessoas ?? [];

  // Só quem é desta revenda aparece. Uma liderança de São Félix não tem o
  // que fazer na lista de Barreiras.
  const liderancas = todas.filter(
    (p) => p.role === "lideranca" && daRevenda.has(p.id),
  );
  const candidatos = todas.filter(
    (p) =>
      p.role === "colaborador" &&
      daRevenda.has(p.id) &&
      termo.length >= 2 &&
      (p.nome?.toLowerCase().includes(termo) || (p.cpf ?? "").includes(termo)),
  );

  // Tabela de acesso por módulo: todo mundo desta revenda, dono de fora --
  // ele já pode tudo, marcar um checkbox para ele não muda nada e só
  // confundiria. Módulos opcionais que a revenda nem tem ligado não
  // aparecem como coluna: liberar um módulo desligado prometeria um
  // acesso que a tela dele não vai mostrar.
  const modulosOpcionaisDaRevenda = MODULOS_OPCIONAIS.filter((m) =>
    new Set((modulosAtivos ?? []).map((x) => x.modulo)).has(m),
  );

  // Outras revendas de cada pessoa -- selo informativo e filtro "também
  // vinculado a".
  const outrasRevendasPorPessoa = new Map<string, { id: string; nome: string }[]>();
  for (const v of vinculosOutras ?? []) {
    const r = (Array.isArray(v.revendas) ? v.revendas[0] : v.revendas) as {
      id: string;
      nome: string;
    };
    if (!r) continue;
    const lista = outrasRevendasPorPessoa.get(v.colaborador_id) ?? [];
    lista.push(r);
    outrasRevendasPorPessoa.set(v.colaborador_id, lista);
  }
  const revendasDisponiveisParaFiltro = [
    ...new Map(
      [...outrasRevendasPorPessoa.values()].flat().map((r) => [r.id, r]),
    ).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // As análises que ESTA revenda tem -- as colunas da grade e a lista do
  // bloco na ficha de cada pessoa saem daqui, para as duas nunca
  // discordarem sobre o que existe.
  const analisesDaRevenda = PAINEIS.filter((p) => modulos.some((m) => m.id === p.modulo));

  // O molde de cada pessoa: qual perfil ela veste e o que ele contém.
  const perfis = (perfisBanco ?? []) as { id: string; nome: string }[];
  const concessoesDoPerfil = new Map<string, Concessao[]>();
  for (const p of perfilPermissoes ?? []) {
    const lista = concessoesDoPerfil.get(p.perfil_id) ?? [];
    lista.push({ modulo: p.modulo, acao: p.acao });
    concessoesDoPerfil.set(p.perfil_id, lista);
  }
  // Uma LISTA, e não um perfil só: `perfil_pessoas` permite mais de um
  // (o supervisor que também é analista). A comparação com o molde só faz
  // sentido quando há exatamente um -- com dois, qual deles seria o
  // molde? A tela diz isso em vez de escolher sozinha.
  const perfisDaPessoa = new Map<string, { id: string; nome: string }[]>();
  for (const v of perfilPessoas ?? []) {
    const perfil = perfis.find((p) => p.id === v.perfil_id);
    if (!perfil) continue;
    perfisDaPessoa.set(v.colaborador_id, [...(perfisDaPessoa.get(v.colaborador_id) ?? []), perfil]);
  }

  const termoTabela = filtro.trim().toLowerCase();
  const baseRoster = todas.filter((p) => p.role !== "owner" && daRevenda.has(p.id));

  // As opções dos seletores de Área e Função vêm de quem já está na
  // revenda -- oferecer valor que ninguém daqui tem só confundiria com
  // filtro que sempre devolve vazio.
  const areasDisponiveis = [
    ...new Set(baseRoster.map((p) => p.area).filter((v): v is string => !!v?.trim())),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const funcoesDisponiveis = [
    ...new Set(baseRoster.map((p) => p.cargo).filter((v): v is string => !!v?.trim())),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const roster = baseRoster.filter(
    (p) =>
      (!termoTabela ||
        p.nome?.toLowerCase().includes(termoTabela) ||
        (p.cpf ?? "").includes(termoTabela)) &&
      (!areaFiltro || p.area === areaFiltro) &&
      (!funcaoFiltro || p.cargo === funcaoFiltro) &&
      (!papelFiltro || p.role === papelFiltro) &&
      (!revendaExtraFiltro ||
        (outrasRevendasPorPessoa.get(p.id) ?? []).some((r) => r.id === revendaExtraFiltro)),
  );
  const extrasPorPessoa = new Map<string, Set<string>>();
  for (const e of extras ?? []) {
    if (!extrasPorPessoa.has(e.colaborador_id)) extrasPorPessoa.set(e.colaborador_id, new Set());
    extrasPorPessoa.get(e.colaborador_id)!.add(e.modulo);
  }

  // Agrupa colunas contíguas que pertencem ao mesmo "módulo guarda-chuva"
  // (ex.: as seis funcionalidades de Produtividade do Armazém + as duas de
  // Carretas) sob um cabeçalho comum -- é o que organiza a tabela em vez de
  // espalhar oito colunas soltas junto com Comunicados, Ranking etc.
  const gruposDeColunas: { rotuloGrupo: string | null; modulos: string[] }[] = [];
  for (const m of modulosOpcionaisDaRevenda) {
    const rotuloGrupo = moduloPorId(m)?.subGrupoDe ? (moduloPorId(moduloPorId(m)!.subGrupoDe!)?.rotulo ?? null) : null;
    const ultimo = gruposDeColunas[gruposDeColunas.length - 1];
    if (ultimo && ultimo.rotuloGrupo === rotuloGrupo) {
      ultimo.modulos.push(m);
    } else {
      gruposDeColunas.push({ rotuloGrupo, modulos: [m] });
    }
  }

  return (
    <div>
      {/* O nome diz PESSOA de propósito.
          Esta tela e a de Perfis de Acesso pareciam módulos duplicados
          (pergunta do dono, 02/09/2026), e o nome antigo -- "Gestão de
          Acessos" no título, "Usuários e Acessos" na barra lateral, dois
          nomes para a mesma tela -- não ajudava a separar. A diferença é
          o objeto: aqui se mexe numa PESSOA; lá se monta um MOLDE e se
          aplica a alguém. As duas gravam nas mesmas linhas. */}
      <PageHeader
        title="🔐 Acessos por Pessoa"
        subtitle="Quem entra no Modo Liderança e o que cada um pode fazer. É aqui, e só aqui, que se TIRA acesso."
      />

      {/* As três liberações viraram ABAS (06/09/2026). Eram três cartões
          explicando onde cada coisa ficava -- e o dono continuou sem achar
          o que procurava. Explicação some quando a estrutura resolve. */}
      <AbasDeAcesso atual={abaAtual} revendaId={escolhida.id} />

      {/* A revenda que está sendo configurada. Fica no topo porque muda o
          sentido de tudo o que vem abaixo. */}
      {(revendas ?? []).length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(revendas ?? []).map((r) => (
            <Link
              key={r.id}
              // A aba vai junto: trocar de unidade não é trocar de assunto.
              href={`/admin/acessos?aba=${abaAtual === "modulos" ? "modulos" : "pessoa"}&revenda=${r.id}`}
              className={
                r.id === escolhida.id
                  ? "rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary"
              }
            >
              {r.nome}
            </Link>
          ))}
        </div>
      )}

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

      <div className="mb-4 rounded-2xl border border-primary/25 bg-primary-soft p-4">
        <p className="text-sm font-semibold text-primary-dark">
          👑 Admin: {eu.nome}
        </p>
        <p className="mt-1 text-xs text-primary-dark">
          Só existe um Admin, e ele é definido no banco de dados — não há botão
          que promova alguém a Admin. Você também não consegue alterar o próprio
          acesso por esta tela, para não haver risco de se trancar do lado de
          fora.
        </p>
      </div>

      {/* ---- Tabela de acesso por módulo opcional ---- */}
      {abaAtual === "modulos" && (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Acesso a módulos opcionais em {escolhida.nome}
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Módulos que ficam escondidos até serem liberados pessoa por pessoa.
          Vale para qualquer papel — colaborador ou liderança. Marque quantos
          quadradinhos quiser e só clique em &quot;Liberar acesso&quot; no
          fim para gravar tudo de uma vez.
        </p>

        {modulosOpcionaisDaRevenda.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            Esta revenda ainda não tem nenhum módulo opcional ligado.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <form
              method="get"
              className="flex flex-wrap gap-2 border-b border-slate-100 p-3"
            >
              <input type="hidden" name="revenda" value={escolhida.id} />
              {/* Sem isto, filtrar jogava de volta na aba das fichas. */}
              <input type="hidden" name="aba" value="modulos" />
              <input
                name="filtro"
                defaultValue={filtro}
                placeholder="Buscar por nome ou CPF"
                className="min-w-[10rem] flex-1 rounded-xl border border-slate-200 p-2.5 text-sm focus:border-primary focus:outline-none"
              />
              <select
                name="area"
                defaultValue={areaFiltro}
                className="min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todas as áreas</option>
                {areasDisponiveis.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select
                name="funcao"
                defaultValue={funcaoFiltro}
                className="min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todas as funções</option>
                {funcoesDisponiveis.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                name="papel"
                defaultValue={papelFiltro}
                className="min-w-[8rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">Todos os papéis</option>
                <option value="colaborador">Colaborador</option>
                <option value="lideranca">Liderança</option>
              </select>
              {revendasDisponiveisParaFiltro.length > 0 && (
                <select
                  name="revendaExtra"
                  defaultValue={revendaExtraFiltro}
                  className="min-w-[10rem] rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Qualquer vínculo extra</option>
                  {revendasDisponiveisParaFiltro.map((r) => (
                    <option key={r.id} value={r.id}>Também em {r.nome}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Filtrar
              </button>
              {(termoTabela || areaFiltro || funcaoFiltro || papelFiltro || revendaExtraFiltro) && (
                <Link
                  href={`/admin/acessos?aba=modulos&revenda=${escolhida.id}`}
                  className="flex items-center rounded-xl px-3 text-sm font-medium text-slate-500 hover:text-primary"
                >
                  Limpar
                </Link>
              )}
            </form>
            <p className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">
              {roster.length} pessoa(s) encontrada(s).
            </p>

            <form action={liberarAcessosEmLote}>
              <input type="hidden" name="revenda" value={escolhida.id} />
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  {/* sticky no <thead> inteiro (não célula a célula): as
                      duas linhas de cabeçalho -- grupo e módulo -- rolam
                      juntas como um bloco só, sem precisar calcular a
                      altura da primeira pra encaixar a segunda embaixo. */}
                  <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      {/* Congelada: com muitos módulos a tabela fica bem mais
                          larga que a tela, e sem isso ninguém sabe mais de quem
                          é a linha depois de rolar pra marcar um módulo à
                          direita. rowSpan de 2 porque agora o cabeçalho tem uma
                          segunda linha, de agrupamento. */}
                      <th
                        rowSpan={2}
                        className="sticky left-0 z-20 min-w-[11rem] bg-slate-50 p-3 align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]"
                      >
                        Pessoa
                      </th>
                      {gruposDeColunas.map((g, i) => (
                        <th
                          key={i}
                          colSpan={g.modulos.length}
                          className={`bg-slate-50 p-1.5 text-center text-[10px] font-semibold normal-case tracking-normal text-slate-400 ${
                            g.rotuloGrupo ? "border-b border-slate-200" : ""
                          }`}
                        >
                          {g.rotuloGrupo ?? ""}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {modulosOpcionaisDaRevenda.map((m) => (
                        <th key={m} className="w-16 bg-slate-50 p-2 text-center" title={moduloPorId(m)?.rotulo}>
                          <span className="block text-base leading-none">{moduloPorId(m)?.emoji}</span>
                          <span className="mt-1 block truncate text-[9px] normal-case leading-tight text-slate-400">
                            {moduloPorId(m)?.rotulo}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.length === 0 ? (
                      <tr>
                        <td
                          colSpan={modulosOpcionaisDaRevenda.length + 1}
                          className="p-6 text-center text-sm text-slate-400"
                        >
                          Ninguém encontrado.
                        </td>
                      </tr>
                    ) : (
                      roster.map((p) => {
                        const minhasExtras = extrasPorPessoa.get(p.id) ?? new Set<string>();
                        const outras = outrasRevendasPorPessoa.get(p.id) ?? [];
                        return (
                          <tr key={p.id} className="border-t border-slate-100">
                            <td className="sticky left-0 z-10 min-w-[11rem] bg-white p-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                              {/* O NOME LEVA À PRÉVIA. É aqui que estão os
                                  colaboradores -- eles não aparecem na
                                  lista de lideranças, e são a maioria de
                                  quem se libera. */}
                              <p className="font-medium text-slate-800">
                                <Link
                                  href={`/admin/acessos/${p.id}?revenda=${escolhida.id}`}
                                  className="hover:text-primary hover:underline"
                                  title={`Ver como ${p.nome} vê o app`}
                                >
                                  {p.nome}
                                </Link>
                                {outras.length > 0 && (
                                  <span
                                    className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500"
                                    title={`Também em ${outras.map((r) => r.nome).join(", ")}`}
                                  >
                                    +{outras.length}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-400">
                                {ROTULO_PAPEL[p.role as Papel] ?? p.role}
                                {p.area ? ` · ${p.area}` : ""}
                                {p.cargo ? ` · ${p.cargo}` : ""}
                              </p>
                            </td>
                            {modulosOpcionaisDaRevenda.map((m) => (
                              <td key={m} className="w-16 p-2 text-center">
                                <input type="hidden" name="universo" value={`${p.id}:${m}`} />
                                <input
                                  type="checkbox"
                                  name="marcado"
                                  value={`${p.id}:${m}`}
                                  defaultChecked={minhasExtras.has(m)}
                                  aria-label={`${moduloPorId(m)?.rotulo} para ${p.nome}`}
                                  className="h-5 w-5 cursor-pointer rounded border-slate-300 text-primary"
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 p-3">
                <BotaoEnviar
                  textoEnviando="Aplicando..."
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
                >
                  ✅ Liberar acesso
                </BotaoEnviar>
              </div>
            </form>
          </div>
        )}
      </section>
      )}

      {/* ---- Grade das análises da Gestão ---- */}
      {/*
        A MESMA GRADE, PARA AS ANÁLISES.

        Pedido do dono (05/09/2026): "não daria para migrar a análise de
        gestão para liberar o acesso ao módulos opcionais?". Dá -- e é o
        gesto que ele já conhece: uma coluna por análise, uma linha por
        pessoa, um botão no fim.

        MAS NÃO PELA TABELA DE OPCIONAIS. Três das análises usam módulos
        que já estão lá e carregam outra coisa junto: marcar "Empilhadeira"
        para dar o painel de gás daria também a permissão de TRANSPORTAR no
        Abastecimento; "5S" e "Feedbacks" ligariam os cartões deles no app;
        e "Produtividade do Armazém", que não é opcional, sumiria da tela
        inicial de todo mundo que não tivesse a linha. Grade separada
        resolve sem nenhum desses efeitos.

        E ELA GRAVA NAS MESMAS LINHAS DA FICHA (`lideranca_permissoes`,
        ação "ver"). Não é um segundo mecanismo: marcar aqui é idêntico a
        marcar "Visualizar" lá embaixo, e as duas telas mostram o mesmo
        estado. Uma permissão com duas origens seria uma que ninguém
        consegue auditar.

        SÓ LIDERANÇA, decisão do dono entre as três opções (05/09/2026).
        Análise continua sendo tela de gestão -- foi assim que 12
        colaboradores chegaram a ver o ranking de produtividade dos
        colegas, e não é um caminho para reabrir.
      */}
      {abaAtual === "modulos" && analisesDaRevenda.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            📊 Análises da Gestão em {escolhida.nome}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Os relatórios que a pessoa passa a ver <strong>na própria home</strong>, sem entrar no
            Modo Liderança. Só aparece quem já é liderança — para incluir alguém, use “Tornar alguém
            liderança” logo abaixo.
          </p>

          {liderancas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Nenhuma liderança nesta revenda ainda.
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/30 bg-white shadow-sm">
              <form action={liberarAnalisesEmLote}>
                <input type="hidden" name="revenda" value={escolhida.id} />
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-primary-soft/40 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="sticky left-0 z-20 min-w-[11rem] bg-primary-soft/40 p-3 align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                          Liderança
                        </th>
                        {analisesDaRevenda.map((p) => (
                          <th
                            key={p.id}
                            className="w-20 bg-primary-soft/40 p-2 text-center align-bottom"
                            title={p.pergunta}
                          >
                            <span className="block text-base leading-none">{p.emoji}</span>
                            <span className="mt-1 block text-[9px] normal-case leading-tight text-slate-500">
                              {p.rotulo}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liderancas.map((pessoa) => {
                        const minhas = porPessoa.get(pessoa.id) ?? new Set<string>();
                        return (
                          <tr key={pessoa.id} className="border-t border-slate-100">
                            <td className="sticky left-0 z-10 min-w-[11rem] bg-white p-3 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                              <p className="font-medium text-slate-800">
                                <Link
                                  href={`/admin/acessos/${pessoa.id}?revenda=${escolhida.id}`}
                                  className="hover:text-primary hover:underline"
                                  title={`Ver como ${pessoa.nome} vê o app`}
                                >
                                  {pessoa.nome}
                                </Link>
                              </p>
                              <p className="text-xs text-slate-400">
                                {pessoa.area ?? ""}
                                {pessoa.cargo ? ` · ${pessoa.cargo}` : ""}
                              </p>
                            </td>
                            {analisesDaRevenda.map((painel) => {
                              const m = moduloPorId(painel.modulo)!;
                              // QUEM ADMINISTRA O MÓDULO JÁ VÊ, e a célula
                              // diz isso em vez de mentir que está
                              // desmarcada. Desmarcar aqui deixaria a
                              // pessoa podendo editar uma tela que não
                              // abre -- então a célula é travada, e a
                              // mudança se faz na ficha, lá embaixo.
                              const administra = m.acoes.some(
                                (a) => a !== "ver" && minhas.has(`${m.id}:${a}`),
                              );
                              return (
                                <td key={painel.id} className="w-20 p-2 text-center">
                                  {administra ? (
                                    <span
                                      className="text-base"
                                      title={`Já vê porque administra ${m.rotulo}. Para mudar, use a ficha da pessoa.`}
                                    >
                                      🔒
                                    </span>
                                  ) : (
                                    <>
                                      <input
                                        type="hidden"
                                        name="universo"
                                        value={`${pessoa.id}:${m.id}`}
                                      />
                                      <input
                                        type="checkbox"
                                        name="marcado"
                                        value={`${pessoa.id}:${m.id}`}
                                        defaultChecked={minhas.has(`${m.id}:ver`)}
                                        aria-label={`${painel.rotulo} para ${pessoa.nome}`}
                                        className="h-5 w-5 cursor-pointer rounded border-slate-300 text-primary"
                                      />
                                    </>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-3">
                  <BotaoEnviar
                    textoEnviando="Aplicando..."
                    className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
                  >
                    ✅ Liberar análises
                  </BotaoEnviar>
                  <p className="text-xs text-slate-400">
                    🔒 = já vê porque administra o módulo. Muda na ficha da pessoa.
                  </p>
                </div>
              </form>
            </div>
          )}
        </section>
      )}

      {/* ---- Promover alguém ---- */}
      {abaAtual === "pessoa" && (
      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Tornar alguém liderança
        </summary>
        <div className="border-t border-slate-100 p-4">
          <form method="get" className="mb-3 flex gap-2">
            <input type="hidden" name="revenda" value={escolhida.id} />
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

          {termo.length < 2 ? (
            <p className="text-sm text-slate-400">
              Digite ao menos 2 letras do nome para encontrar a pessoa.
            </p>
          ) : candidatos.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nenhum colaborador encontrado com esse termo.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {candidatos.slice(0, 10).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {p.nome}
                    </p>
                    <p className="truncate text-xs text-slate-400">{p.cargo}</p>
                  </div>
                  <form action={definirPapel}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="papel" value="lideranca" />
                    <input type="hidden" name="revenda" value={escolhida.id} />
                    <BotaoEnviar
                      textoEnviando="Aplicando..."
                      className="shrink-0 rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary-soft"
                    >
                      Tornar liderança
                    </BotaoEnviar>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
      )}

      {/* ---- Lideranças e suas permissões ---- */}
      {abaAtual === "pessoa" && (
      <>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Lideranças em {escolhida.nome} ({liderancas.length})
      </h2>
      {/* A LINHA QUE DIZ QUE É AQUI.
          O dono não achou onde liberar módulo (05/09/2026), e com razão:
          a tabela de cima trata de módulo OPCIONAL (o cartão que a pessoa
          vê no app) e as permissões de liderança ficam escondidas dentro
          de uma sanfona por pessoa, sob um título que só diz um nome. Duas
          coisas parecidas, uma delas invisível. */}
      <p className="mb-2 text-xs text-slate-500">
        Toque no nome para abrir e marcar o que cada um pode fazer — inclusive as{" "}
        <strong>📊 Análises da Gestão</strong>.
      </p>

      {liderancas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma liderança vinculada a esta revenda ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {liderancas.map((p) => {
            const minhas = porPessoa.get(p.id) ?? new Set<string>();
            const meusPerfis = perfisDaPessoa.get(p.id) ?? [];
            // O resumo diz o molde e o desvio, para a resposta caber na
            // linha fechada -- é o que permite varrer a lista sem abrir
            // ninguém, que era impossível antes.
            const molde =
              meusPerfis.length === 1
                ? simularAplicacao(concessoesDoPerfil.get(meusPerfis[0].id) ?? [], [...minhas].map((c) => {
                    const corte = c.lastIndexOf(":");
                    return { modulo: c.slice(0, corte), acao: c.slice(corte + 1) };
                  }))
                : null;
            const foraDoMolde = molde ? molde.entram.length + molde.foraDoPerfil.length : 0;
            return (
              <details
                key={p.id}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 p-4">
                  <span className="font-semibold text-slate-800">{p.nome}</span>
                  <span className="text-xs text-slate-400">
                    {minhas.size === 0
                      ? "sem nenhuma permissão"
                      : `${
                          new Set(
                            Array.from(minhas).map((c) => c.split(":")[0]),
                          ).size
                        } módulo(s) liberado(s)`}
                  </span>
                  {meusPerfis.length > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      🎫 {meusPerfis.map((x) => x.nome).join(" + ")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                      sem perfil
                    </span>
                  )}
                  {foraDoMolde > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      {foraDoMolde} fora do molde
                    </span>
                  )}
                  {/* O convite explícito. Sem ele, a linha parecia um item
                      de lista, não um botão -- e as permissões ficavam
                      invisíveis atrás de um clique que ninguém dava. */}
                  <span className="ml-auto shrink-0 text-xs font-semibold text-primary">
                    {minhas.size === 0 ? "Liberar acessos →" : "Ver e alterar →"}
                  </span>
                </summary>

                {/* O MOLDE VEM ANTES DAS CAIXAS, e fora do formulário --
                    HTML não aceita formulário dentro de formulário, e este
                    bloco tem os próprios botões. A ordem é a da decisão:
                    primeiro "qual é o cargo dela?", só depois "e as
                    exceções?". */}
                <div className="border-t border-slate-100 px-4 pt-4">
                  <PerfilDaPessoa
                    pessoaId={p.id}
                    pessoaNome={p.nome ?? ""}
                    revendaId={escolhida.id}
                    meus={meusPerfis}
                    perfis={perfis}
                    concessoesDoPerfil={concessoesDoPerfil}
                    minhas={minhas}
                  />
                </div>

                <form action={salvarPermissoes} className="px-4 pb-4">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="revenda" value={escolhida.id} />

                  {/*
                    AGRUPADO POR GAVETA, e não uma lista corrida.

                    Eram trinta módulos em fila única, na ordem em que
                    foram escritos no código -- "Jornal", "Ranking",
                    "Padrões", "Rating"... Quem liberava tinha de descer a
                    lista inteira procurando pelo nome, e não havia como
                    ver o que já estava marcado sem ler tudo. As gavetas
                    são as MESMAS da barra do Modo Liderança (Comunicação,
                    Engajamento, Gestão de Dados, Operação, Pessoas,
                    Configuração): quem administra já anda por elas.

                    O contador ao lado de cada gaveta é o que responde
                    "esta pessoa tem o quê?" sem abrir nada.
                  */}
                  <div className="space-y-3">
                    {/*
                      AS ANÁLISES DA GESTÃO VÊM PRIMEIRO, E JUNTAS.

                      Pedido do dono (05/09/2026): "deixe em gestão de
                      acesso o módulo de gestão meio que agrupado com as
                      visões dos relatórios para quem for liberar".

                      Antes, as sete análises estavam espalhadas por três
                      gavetas diferentes -- "Uso do App" em Gestão de
                      Dados, o BI do 5S dentro do Programa 5S em
                      Configuração, o painel de gás dentro da Empilhadeira
                      em Operação. Quem queria "liberar os relatórios para
                      o supervisor" tinha de saber de cor em que módulo
                      cada um morava.

                      DUAS NATUREZAS, e é isso que separa as duas listas
                      abaixo:

                      - a análise que É o módulo inteiro (Feedbacks,
                        Justificativas, Uso do App) traz a marcação aqui,
                        e sai da gaveta de origem -- ter o mesmo checkbox
                        em dois lugares faria desmarcar num deles parecer
                        que tirou o acesso, quando o outro ainda concede;

                      - a análise que é UMA DAS TELAS de um módulo maior
                        (Anomalias, Armazém, Gás, 5S) aparece só como
                        aviso, dizendo onde está a marcação. O módulo
                        continua inteiro na gaveta dele, porque lá também
                        se cadastra.
                    */}
                    {(() => {
                      if (analisesDaRevenda.length === 0) return null;

                      const proprias = analisesDaRevenda.filter(
                        (p) => moduloPorId(p.modulo)?.emGestao,
                      );
                      const dentroDeOutro = analisesDaRevenda.filter(
                        (p) => !moduloPorId(p.modulo)?.emGestao,
                      );
                      const liberadas = analisesDaRevenda.filter((p) =>
                        minhas.has(`${p.modulo}:ver`),
                      ).length;

                      return (
                        // ABERTA POR PADRÃO, como todas as gavetas abaixo.
                        // Fechá-la quando não havia nada liberado escondia
                        // justamente o caso em que a pessoa está sendo
                        // configurada pela primeira vez -- o formulário
                        // abria parecendo vazio (relato do dono,
                        // 05/09/2026). Agrupar é para organizar, não para
                        // esconder: quem quiser fechar, fecha.
                        <details
                          open
                          className="rounded-xl border border-primary/30 bg-primary-soft/20"
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-2 p-3">
                            <span className="text-sm font-bold text-primary-dark">
                              📊 Análises da Gestão
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                liberadas > 0
                                  ? "bg-primary text-white"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {liberadas} de {analisesDaRevenda.length}
                            </span>
                          </summary>

                          <div className="space-y-4 border-t border-primary/20 p-3">
                            <p className="text-xs leading-relaxed text-slate-600">
                              Os relatórios que a pessoa passa a ver <strong>na home</strong>, sem
                              precisar entrar no Modo Liderança.
                            </p>

                            {proprias.map((p) => {
                              const m = moduloPorId(p.modulo)!;
                              return (
                                <BlocoDoModulo
                                  key={p.modulo}
                                  m={m}
                                  minhas={minhas}
                                  tituloAlternativo={`${p.emoji} ${p.rotulo}`}
                                  ajuda={p.pergunta}
                                />
                              );
                            })}

                            {dentroDeOutro.length > 0 && (
                              <div className="rounded-lg bg-white/70 p-2.5">
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Vêm junto com o módulo
                                </p>
                                <ul className="space-y-1">
                                  {dentroDeOutro.map((p) => {
                                    const m = moduloPorId(p.modulo)!;
                                    const tem = minhas.has(`${p.modulo}:ver`);
                                    return (
                                      <li
                                        key={p.id}
                                        className="flex items-start gap-2 text-xs leading-snug text-slate-600"
                                      >
                                        <span className={tem ? "text-green-600" : "text-slate-300"}>
                                          {tem ? "✅" : "⬜"}
                                        </span>
                                        <span>
                                          <strong>
                                            {p.emoji} {p.rotulo}
                                          </strong>{" "}
                                          — marque <strong>Visualizar</strong> em {m.emoji}{" "}
                                          {m.rotulo}, na gaveta{" "}
                                          <strong>
                                            {EMOJI_GRUPO_ADMIN[m.grupo]} {m.grupo}
                                          </strong>
                                          .
                                        </span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })()}

                    {GRUPOS_DO_ADMIN.map((grupo) => {
                      // Módulo cuja tela É uma análise já foi marcado no
                      // bloco acima. Repeti-lo aqui daria dois checkboxes
                      // para a mesma permissão.
                      const doGrupo = modulos.filter((m) => m.grupo === grupo && !m.emGestao);
                      if (doGrupo.length === 0) return null;
                      const liberados = doGrupo.filter((m) =>
                        m.acoes.some((a) => minhas.has(`${m.id}:${a}`)),
                      ).length;
                      return (
                        <details
                          key={grupo}
                          // Todas abertas. Ver o comentário no bloco das
                          // Análises: gaveta fechada escondeu as marcações
                          // de quem não tinha nada liberado ainda.
                          open
                          className="rounded-xl border border-slate-200"
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-2 p-3">
                            <span className="text-sm font-bold text-slate-800">
                              {EMOJI_GRUPO_ADMIN[grupo]} {grupo}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                liberados > 0
                                  ? "bg-primary-soft text-primary-dark"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {liberados} de {doGrupo.length}
                            </span>
                          </summary>

                          <div className="space-y-4 border-t border-slate-100 p-3">
                            {doGrupo.map((m) => (
                              <BlocoDoModulo key={m.id} m={m} minhas={minhas} />
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    Marcar Criar, Editar ou Excluir liga o Visualizar
                    automaticamente — não faria sentido poder mexer numa tela
                    sem poder abri-la.
                  </p>

                  <div className="mt-4 flex flex-wrap items-stretch gap-2">
                    <BotaoEnviar
                      textoEnviando="Salvando..."
                      className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Salvar permissões em {escolhida.nome}
                    </BotaoEnviar>
                    {/* A CONFERÊNCIA DEPOIS DE SALVAR, ao lado do botão que
                        salva. É a pergunta que se faz em seguida -- "ficou
                        como eu queria?" -- e até hoje só tinha uma resposta:
                        entrar na conta de alguém. */}
                    <Link
                      href={`/admin/acessos/${p.id}?revenda=${escolhida.id}`}
                      className="flex items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-primary hover:text-primary"
                    >
                      👁️ Ver como {p.nome?.split(" ")[0]} vê
                    </Link>
                  </div>
                </form>

                <form
                  action={definirPapel}
                  className="border-t border-slate-100 p-4"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="papel" value="colaborador" />
                  <input type="hidden" name="revenda" value={escolhida.id} />
                  <BotaoEnviar
                    textoEnviando="Removendo..."
                    className="w-full rounded-xl border border-red-300 py-3 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remover a liderança de {p.nome?.split(" ")[0]}
                  </BotaoEnviar>
                  <p className="mt-2 text-xs text-slate-400">
                    A pessoa continua usando o app normalmente. Só perde o
                    acesso ao Modo Liderança e todas as permissões.
                  </p>
                </form>
              </details>
            );
          })}
        </div>
      )}
      </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Papel de cada um:{" "}
        {(["owner", "lideranca", "colaborador"] as Papel[])
          .map((r) => ROTULO_PAPEL[r])
          .join(" · ")}
        . Toda alteração feita aqui fica registrada no Log de Auditoria.
      </p>
    </div>
  );
}
