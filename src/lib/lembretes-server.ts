import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { getPessoasDaArea } from "@/lib/quiz-server";
import { hojeIso } from "@/lib/pesquisa";
import { areaDoColaborador, diasRestantes } from "@/lib/quiz";
import type { AreaId } from "@/lib/areas";
import { FIM_TURNO, hojeISO, type Turno } from "@/lib/produtividade-armazem";

/** De quanto em quanto tempo o próprio app varre a fila. */
const INTERVALO_MINUTOS = 5;

/**
 * Trava de MEMÓRIA, na frente da trava do banco.
 *
 * Sem ela, cada visita de cada pessoa gastaria uma ida ao Supabase só
 * para ouvir "ainda não". Com Barreiras entrando, são ~160 pessoas: numa
 * troca de turno, dezenas abrem o app no mesmo minuto, e seriam dezenas
 * de idas ao banco para uma resposta que este servidor já sabe.
 *
 * Guardando o horário aqui, uma instância quente atende dezenas de
 * visitas fazendo UMA pergunta ao banco a cada 5 minutos. O resto sai
 * daqui em nanossegundos, sem rede nenhuma.
 *
 * Isto NÃO é a trava de verdade -- é um filtro barato na frente dela. A
 * autoridade continua sendo o UPDATE condicional lá embaixo, porque a
 * Vercel roda várias instâncias e cada uma tem a sua cópia desta
 * variável. Duas instâncias podem passar por aqui no mesmo segundo; só
 * uma leva a linha no banco.
 */
let proximaTentativa = 0;

export type Varredura = {
  enviados: number;
  desafios: number;
  cincoS: number;
  publicadas: number;
  /** Rodadas de desafio que estrearam hoje e tiveram o time avisado. */
  aberturas: number;
  empilhadeiras: number;
  erro?: string;
};

/**
 * Varre TUDO o que está vencido: lembrete de comunicado, publicação
 * agendada, marcos do 5S e o cutucão do desafio.
 *
 * Mora aqui, e não dentro da rota, porque tem dois chamadores com
 * necessidades diferentes e a mesma regra: a rota `/api/cron/lembretes`
 * (batida de fora, protegida por segredo) e o próprio app, via
 * `varrerSeVencida` logo abaixo. Duplicar isso seria garantir que um dia
 * os dois divergissem.
 *
 * Idempotente por desenho, e é isso que deixa os dois chamadores
 * conviverem: cada item só entra na consulta enquanto o carimbo dele for
 * nulo, e o carimbo é a primeira coisa que ele recebe depois de avisar.
 * Duas varreduras quase simultâneas na pior das hipóteses avisam duas
 * vezes, nunca zero. Pelo mesmo motivo, uma varredura interrompida no
 * meio (estouro do tempo da função) não perde nada: o que sobrou continua
 * sem carimbo e sai na próxima.
 */
export async function varrerLembretes(): Promise<Varredura> {
  const admin = createAdminClient();

  // A ORDEM AQUI NÃO É ARBITRÁRIA: barato e urgente primeiro, caro por
  // último.
  //
  // Na primeira varredura real em produção (21/08/2026, depois que o
  // proxy parou de barrar o cron), o desafio levou 3s avisando quem não
  // participou de duas rodadas, e o 5S gastou mais 11s em 12 auditorias
  // -- 17 segundos no total, e não dá para saber daqui se a função foi
  // cortada no fim. Se for, quem estivesse por último nunca rodaria.
  //
  // Publicação agendada e lembrete do jornal são os dois mais urgentes
  // (uma matéria já ESTÁ no ar esperando o aviso) e os mais baratos --
  // na esmagadora maioria das varreduras, zero linhas. Ficarem atrás de
  // uma etapa que notifica cem pessoas era trocar o certo pelo caro.
  const publicadas = await publicacoesAgendadas(admin);
  // Abertura de desafio entra junto das publicações agendadas, e antes
  // dos lembretes: é o mesmo tipo de coisa (algo que ESTREIA hoje e o
  // time ainda não sabe), e é barato -- na quase totalidade das
  // varreduras, zero linhas.
  const aberturas = await aberturasDoDesafio(admin);
  const enviados = await lembretesDeComunicado(admin);
  const cincoS = await lembretesDo5S(admin);
  const desafios = await lembretesDoDesafio(admin);
  const empilhadeiras = await lembretesDeEmpilhadeira(admin);

  return { ...enviados, cincoS, desafios, publicadas, aberturas, empilhadeiras };
}

/**
 * Os lembretes de comunicado vencidos -- o 🔔 que o RH marcou junto com
 * a matéria.
 */
async function lembretesDeComunicado(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ enviados: number; erro?: string }> {
  const { data: devidos, error } = await admin
    .from("comunicados")
    .select(
      "id, revenda_id, titulo, lembrete_areas, lembrete_cargos, lembrete_mensagem",
    )
    .lte("lembrete_em", new Date().toISOString())
    .is("lembrete_enviado_em", null);

  if (error) return { enviados: 0, erro: error.message };
  if (!devidos || devidos.length === 0) return { enviados: 0 };

  let enviados = 0;

  for (const c of devidos) {
    const titulo = "🔔 Lembrete do Jornal";
    const mensagem = c.lembrete_mensagem?.trim() || c.titulo;
    const url = "/comunicados";
    const areas = (c.lembrete_areas ?? []).filter(Boolean);
    const cargos = (c.lembrete_cargos ?? []).filter(Boolean);

    // Nenhum filtro: vale para a revenda inteira, igual a um comunicado
    // normal. Com filtro: só quem bate NESTA revenda -- a mesma área e o
    // mesmo cargo existem nas duas unidades. Os dois filtros se cruzam
    // (área E cargo); cada um vazio significa "qualquer um".
    let alvo: string[] | null = null;
    if (areas.length > 0 || cargos.length > 0) {
      const { data: vinculos } = await admin
        .from("colaborador_revendas")
        .select("colaborador_id")
        .eq("revenda_id", c.revenda_id);
      const idsRevenda = (vinculos ?? []).map((v) => v.colaborador_id);

      let consulta = admin
        .from("profiles")
        .select("id, area")
        .in("id", idsRevenda.length > 0 ? idsRevenda : [""]);
      if (cargos.length > 0) consulta = consulta.in("cargo", cargos);
      const { data: pessoas } = await consulta;

      // A área NÃO dá para filtrar no banco: `profiles.area` é texto
      // livre do cadastro ("DISTRIBUIÇÃO URBANA", "APOIO LOGISTICO") e o
      // lembrete guarda DU/AL. Um `in("area", ["DU"])` -- que é o que
      // estava aqui -- nunca casava com ninguém: o lembrete por área
      // achava zero pessoas, carimbava como enviado e morria calado.
      // `areaDoColaborador` é a mesma tradução que a Escala, a RV e o
      // Desafio já usam.
      alvo = (pessoas ?? [])
        .filter(
          (p) =>
            areas.length === 0 ||
            areas.includes(areaDoColaborador(p.area) ?? ""),
        )
        .map((p) => p.id);

      // Ninguém no filtro: marca como enviado mesmo assim, senão este
      // comunicado voltaria a aparecer na consulta a cada 15 min para
      // sempre.
      if (alvo.length === 0) {
        await admin
          .from("comunicados")
          .update({ lembrete_enviado_em: new Date().toISOString() })
          .eq("id", c.id);
        continue;
      }
    }

    if (alvo) {
      await Promise.all(
        alvo.map((colaboradorId) =>
          criarNotificacao({
            modulo: "comunicados",
            tipo: "lembrete",
            titulo,
            mensagem,
            url,
            revendaId: c.revenda_id,
            destinatarioId: colaboradorId,
          }),
        ),
      );
      await enviarPushDaRevenda(c.revenda_id, {
        modulo: "comunicados",
        titulo,
        mensagem,
        url,
        apenas: alvo,
      });
    } else {
      await criarNotificacao({
        modulo: "comunicados",
        tipo: "lembrete",
        titulo,
        mensagem,
        url,
        revendaId: c.revenda_id,
      });
      await enviarPushDaRevenda(c.revenda_id, {
        modulo: "comunicados",
        titulo,
        mensagem,
        url,
      });
    }

    await admin
      .from("comunicados")
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq("id", c.id);
    enviados++;
  }

  return { enviados };
}

/**
 * Varre -- mas só se ninguém varreu nos últimos minutos.
 *
 * É o que substitui o pinger externo. Toda visita de alguém logado passa
 * por aqui (ver o `after()` no layout raiz), e a esmagadora maioria delas
 * não faz nada além de um UPDATE que não casa e volta.
 *
 * A trava é o próprio UPDATE condicional, não um SELECT seguido de
 * UPDATE: o Postgres serializa as escritas na mesma linha, então de dez
 * visitas no mesmo segundo exatamente UMA vê `rodou_em` antigo e leva a
 * linha; as outras nove atualizam zero linhas e vão embora. Ler antes de
 * escrever teria a janela clássica entre as duas consultas, e todas as
 * dez achariam que ganharam.
 *
 * O carimbo é gravado ANTES de varrer, de propósito. Se a varredura
 * estourar o tempo da função no meio, o carimbo já está lá e as próximas
 * visitas não repetem o trabalho na hora -- o que ficou sem carimbo
 * próprio sai na janela seguinte. O contrário (carimbar no fim) faria
 * uma varredura lenta ser reiniciada por cada visita nova.
 */
export async function varrerSeVencida(): Promise<Varredura | null> {
  const agora = Date.now();

  // O filtro barato primeiro: se ESTA instância já perguntou faz pouco,
  // nem toca a rede. É o que segura o custo quando muita gente abre o
  // app junto.
  if (agora < proximaTentativa) return null;
  proximaTentativa = agora + INTERVALO_MINUTOS * 60_000;

  const admin = createAdminClient();

  const limite = new Date(agora - INTERVALO_MINUTOS * 60_000).toISOString();

  const { data: ganhou } = await admin
    .from("cron_varreduras")
    .update({ rodou_em: new Date().toISOString() })
    .eq("chave", "lembretes")
    .lt("rodou_em", limite)
    .select("chave");

  if (!ganhou || ganhou.length === 0) return null;

  return varrerLembretes();
}

/**
 * As matérias que chegaram na hora marcada.
 *
 * A matéria em si já apareceu no jornal sozinha, sem ninguém precisar
 * fazer nada: a política de leitura solta a linha assim que
 * `publicar_em <= now()` (ver migration 044). O que falta aqui é o
 * BARULHO -- o sino e o push -- que não pode ter tocado lá atrás, na
 * tarde em que o RH montou o plano do mês.
 *
 * Idempotente pelo carimbo `publicacao_avisada_em`, igual ao lembrete: a
 * linha só entra na consulta enquanto o carimbo for nulo, e o carimbo é a
 * primeira coisa que ela recebe depois de avisar.
 */
async function publicacoesAgendadas(admin: ReturnType<typeof createAdminClient>) {
  const { data: devidas } = await admin
    .from("comunicados")
    .select("id, revenda_id, titulo, destaque")
    .not("publicar_em", "is", null)
    .lte("publicar_em", new Date().toISOString())
    .is("publicacao_avisada_em", null)
    // Ordem cronológica importa quando várias caem na mesma rodada de 15
    // minutos e mais de uma é capa: a última a entrar é que fica.
    .order("publicar_em", { ascending: true });

  let avisadas = 0;

  for (const c of devidas ?? []) {
    // A matéria agendada como capa só derruba as outras AGORA, na
    // estreia. Fazer isso no momento do agendamento deixaria o jornal
    // sem capa até o dia marcado.
    if (c.destaque) {
      await admin
        .from("comunicados")
        .update({ destaque: false })
        .eq("revenda_id", c.revenda_id)
        .neq("id", c.id);
    }

    await criarNotificacao({
      modulo: "comunicados",
      titulo: "Novidade no Jornal!",
      mensagem: c.titulo,
      url: "/comunicados",
      revendaId: c.revenda_id,
    });
    await enviarPushDaRevenda(c.revenda_id, {
      modulo: "comunicados",
      titulo: "Novidade no Jornal!",
      mensagem: c.titulo,
      url: "/comunicados",
    });

    await admin
      .from("comunicados")
      .update({ publicacao_avisada_em: new Date().toISOString() })
      .eq("id", c.id);
    avisadas++;
  }

  return avisadas;
}

/**
 * Os vencimentos do 5S: auditoria e ação.
 *
 * Mora aqui, e não numa rota nova, porque compartilha tudo o que
 * importa com os lembretes que já existiam -- o mesmo segredo, o mesmo
 * agendamento de 15 em 15 minutos e a mesma exigência de não repetir.
 * Uma segunda rota só multiplicaria a chamada externa.
 *
 * Três toques por auditoria, e só três:
 *
 *   VÉSPERA   um dia antes da data prevista -- dá tempo de a pessoa se
 *             organizar, que é o que um aviso antecipado serve para fazer.
 *   NO DIA    na data prevista.
 *   ATRASO    uma única vez, depois que a data passou.
 *
 * O atraso avisa UMA vez, não todo dia: a auditoria vencida já aparece
 * em vermelho e escrita "Atrasada" na tela do auditor, o dia inteiro,
 * sem depender de notificação nenhuma. Repetir o push diariamente não
 * acrescentaria informação e faria a pessoa desligar o aviso do 5S --
 * perdendo junto os dois que importam.
 *
 * A idempotência vem da CHAVE: cada marco tem a sua (`:vespera`, `:dia`,
 * `:atraso`), e o aviso só nasce se ainda não existir um com aquela
 * chave. Como o cron roda de 15 em 15 minutos, sem isso a véspera
 * sozinha geraria 96 notificações.
 */
async function lembretesDo5S(admin: ReturnType<typeof createAdminClient>) {
  /*
    O DIA É O DA OPERAÇÃO, não o do servidor.

    Isto era `new Date().toISOString().slice(0, 10)` -- a data em UTC. A
    Vercel roda em UTC, e a operação é UTC-3: das 21h à meia-noite daqui,
    lá já é o dia seguinte. O efeito não era sutil: às 21h de segunda a
    varredura achava que era terça, e disparava a VÉSPERA de quarta, o
    aviso DO DIA de terça e marcava como ATRASADO o que vencia na terça --
    tudo um dia adiantado, e sempre no fim do turno da noite. Pior: a
    chave de idempotência inclui a data, então o aviso do dia certo já
    não nascia mais no dia seguinte, porque a chave já existia.
  */
  const hoje = hojeISO();
  const dataAmanha = hojeISO(new Date(Date.now() + 86_400_000));

  let enviados = 0;

  // ---- Auditorias: véspera, dia e atraso ----
  const { data: auditorias } = await admin
    .from("cinco_s_auditorias")
    .select("id, revenda_id, auditor_id, planejada_para, cinco_s_areas!inner(nome)")
    .in("status", ["planejada", "em_andamento"])
    .lte("planejada_para", dataAmanha);

  for (const a of auditorias ?? []) {
    const marco =
      a.planejada_para === dataAmanha
        ? "vespera"
        : a.planejada_para === hoje
          ? "dia"
          : "atraso";

    const chave = `5s-aud:${a.id}:${marco}`;
    if (await jaAvisado(admin, chave)) continue;

    const area = (
      Array.isArray(a.cinco_s_areas) ? a.cinco_s_areas[0] : a.cinco_s_areas
    ) as { nome: string };

    const quando = a.planejada_para.split("-").reverse().join("/");

    const titulo =
      marco === "vespera"
        ? "🧹 Auditoria 5S amanhã"
        : marco === "dia"
          ? "🧹 Auditoria 5S é hoje"
          : "⚠️ Auditoria 5S atrasada";

    const mensagem =
      marco === "vespera"
        ? `${area.nome} — amanhã, ${quando}.`
        : marco === "dia"
          ? `${area.nome} — é hoje. Toque para começar.`
          : `${area.nome} era para ${quando} e ainda não foi feita.`;

    await criarNotificacao({
      modulo: "5s",
      tipo: marco === "vespera" ? "lembrete" : "pendencia",
      titulo,
      mensagem,
      url: `/5s/auditoria/${a.id}`,
      revendaId: a.revenda_id,
      destinatarioId: a.auditor_id,
      referenciaId: chave,
    });
    await enviarPushDaRevenda(a.revenda_id, {
      modulo: "5s",
      titulo,
      mensagem,
      url: `/5s/auditoria/${a.id}`,
      apenas: [a.auditor_id],
    });
    enviados++;
  }

  // ---- Ações do plano: mesma régua ----
  const { data: acoes } = await admin
    .from("cinco_s_nao_conformidades")
    .select("id, revenda_id, responsavel_id, prazo, descricao")
    .in("status", ["aberta", "em_andamento"])
    .not("responsavel_id", "is", null)
    .not("prazo", "is", null)
    .lte("prazo", dataAmanha);

  for (const n of acoes ?? []) {
    const marco =
      n.prazo === dataAmanha ? "vespera" : n.prazo === hoje ? "dia" : "atraso";

    const chave = `5s-nc:${n.id}:${marco}`;
    if (await jaAvisado(admin, chave)) continue;

    const titulo =
      marco === "atraso" ? "⚠️ Ação 5S atrasada" : "🧹 Ação 5S vencendo";
    const mensagem = `${n.descricao.slice(0, 90)} — prazo ${n
      .prazo!.split("-")
      .reverse()
      .join("/")}.`;

    await criarNotificacao({
      modulo: "5s",
      tipo: "pendencia",
      titulo,
      mensagem,
      url: "/5s/acoes",
      revendaId: n.revenda_id,
      destinatarioId: n.responsavel_id!,
      referenciaId: chave,
    });
    await enviarPushDaRevenda(n.revenda_id, {
      modulo: "5s",
      titulo,
      mensagem,
      url: "/5s/acoes",
      apenas: [n.responsavel_id!],
    });
    enviados++;
  }

  return enviados;
}

/**
 * Este aviso já saiu alguma vez?
 *
 * Sem janela de tempo, de propósito: cada marco (véspera, dia, atraso)
 * tem chave própria e deve tocar UMA vez na vida. Uma checagem "hoje"
 * faria a auditoria atrasada avisar todo santo dia.
 *
 * A consulta é barata mesmo com a tabela grande: `referencia_id` é
 * único na prática e o filtro por módulo corta o resto.
 */
async function jaAvisado(
  admin: ReturnType<typeof createAdminClient>,
  chave: string,
  modulo: string = "5s",
) {
  const { data } = await admin
    .from("notificacoes")
    .select("id")
    .eq("modulo", modulo)
    .eq("referencia_id", chave)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Cutuca o EMPILHADEIRISTA no fim do turno dele, se ele estiver com
 * alguma empilhadeira aberta -- não importa qual máquina, o lembrete é
 * da pessoa, não do patrimônio.
 *
 * Só toca se ela tiver operação aberta na hora do lembrete -- se já
 * fechou tudo, não há o que lembrar. Uma janela de ~7 minutos ao redor
 * do fim do turno absorve o intervalo da própria varredura (a cada 5
 * min) sem duplicar aviso, porque a idempotência é por CHAVE-DIA
 * (`pa-emp:<lembrete>:<hoje>`): dispara uma vez por dia, não uma vez por
 * passada do cron.
 */
async function lembretesDeEmpilhadeira(admin: ReturnType<typeof createAdminClient>) {
  const agora = new Date();
  // Mesmo motivo do 5S: a chave de idempotência é por dia, e em UTC ela
  // virava às 21h. O lembrete de fim do turno da NOITE cai exatamente
  // nessa faixa -- ele gravava a chave do dia seguinte e, no dia
  // seguinte, não disparava.
  const hoje = hojeISO(agora);
  const minutosAgora = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(agora)
      .replace(":", ""),
  );

  const { data: lembretes } = await admin
    .from("pa_empilhadeira_lembretes")
    .select("id, revenda_id, operador_id, operador_nome, turno")
    .eq("ativo", true);

  let enviados = 0;

  for (const l of lembretes ?? []) {
    const [h, m] = FIM_TURNO[l.turno as Turno].split(":");
    const minutosLembrete = Number(h) * 100 + Number(m);
    // Distância em minutos, tratando a virada de hora (ex.: 08:58 vs 09:02).
    const diffBruto = Math.abs(minutosAgora - minutosLembrete);
    const diff = diffBruto > 50 ? 100 - diffBruto : diffBruto;
    if (diff > 7) continue;

    const chave = `pa-emp:${l.id}:${hoje}`;
    if (await jaAvisado(admin, chave, "produtividade-armazem")) continue;

    const { data: abertas } = await admin
      .from("pa_empilhadeira_operacoes")
      .select("empilhadeira_id, pa_empilhadeiras!inner(numero)")
      .eq("operador_id", l.operador_id)
      .eq("status", "aberta");

    // Sem operação aberta não há o que lembrar. Sem carimbo aqui de
    // propósito: a janela de 7 minutos já limita a repetição a duas ou
    // três passadas do cron, não o dia inteiro -- não vale sujar a
    // tabela de notificações com uma linha só para marcar "não avisei".
    if (!abertas || abertas.length === 0) continue;

    const numeros = abertas
      .map((a) => (Array.isArray(a.pa_empilhadeiras) ? a.pa_empilhadeiras[0] : a.pa_empilhadeiras)?.numero)
      .filter(Boolean)
      .join(", ");

    const titulo = "🏗️ Fim de turno";
    const mensagem = `Não esqueça de fechar a empilhadeira ${numeros} antes de ir embora.`;

    await criarNotificacao({
      modulo: "produtividade-armazem",
      tipo: "lembrete",
      titulo,
      mensagem,
      url: "/produtividade-armazem/empilhadeira",
      revendaId: l.revenda_id,
      destinatarioId: l.operador_id,
      referenciaId: chave,
    });
    await enviarPushDaRevenda(l.revenda_id, {
      modulo: "produtividade-armazem",
      titulo,
      mensagem,
      url: "/produtividade-armazem/empilhadeira",
      apenas: [l.operador_id],
    });
    enviados++;
  }

  return enviados;
}

/**
 * Avisa o time no dia em que o desafio ABRE.
 *
 * Antes o aviso saía no ato da publicação, o que dava certo só por
 * coincidência -- quando a rodada começava no mesmo dia. Em 27/08/2026 o
 * desafio de SETEMBRO foi publicado e todo mundo recebeu "Novo desafio
 * disponível" na hora, para uma tela que só abriria no dia 1º
 * (getRodadaAtual filtra por período). Aviso que leva a lugar nenhum
 * ensina o time a ignorar o sino.
 *
 * Mesmo desenho da publicação agendada do Jornal: carimbo em
 * `aviso_inicio_em`, gravado MESMO quando não há ninguém para avisar --
 * senão a rodada voltaria à fila a cada varredura, para sempre.
 */
async function aberturasDoDesafio(admin: ReturnType<typeof createAdminClient>) {
  const hoje = hojeIso();

  const { data: rodadas } = await admin
    .from("quiz_rodadas")
    .select("id, revenda_id, nome, area, total_perguntas")
    .eq("status", "publicada")
    .is("aviso_inicio_em", null)
    .lte("inicio", hoje)
    .gte("fim", hoje);

  let avisadas = 0;

  for (const r of rodadas ?? []) {
    // Carimba ANTES de avisar: se o envio falhar no meio, a rodada não
    // volta na próxima varredura e ninguém recebe o aviso duas vezes.
    await admin
      .from("quiz_rodadas")
      .update({ aviso_inicio_em: new Date().toISOString() })
      .eq("id", r.id);

    const pessoas = await getPessoasDaArea(r.revenda_id, r.area as AreaId);
    if (pessoas.length === 0) continue;

    const mensagem = `${r.nome} — ${r.total_perguntas} perguntas para responder neste mês.`;
    await Promise.all(
      pessoas.map((colaboradorId) =>
        criarNotificacao({
          modulo: "quiz",
          tipo: "novo",
          titulo: "🏆 Novo desafio disponível",
          mensagem,
          url: "/desafio",
          revendaId: r.revenda_id,
          destinatarioId: colaboradorId,
        }),
      ),
    );
    await enviarPushDaRevenda(r.revenda_id, {
      modulo: "quiz",
      titulo: "🏆 Novo desafio disponível",
      mensagem,
      url: "/desafio",
      apenas: pessoas,
    });
    avisadas++;
  }

  return avisadas;
}

/**
 * Cutuca quem ainda não participou do Desafio do Mês.
 *
 * Dois toques por rodada, e só dois: um quando ela passa da metade
 * ("você ainda não participou") e outro na reta final ("últimos dias").
 * Mais que isso vira barulho, e barulho todo mês faz a pessoa desligar
 * a notificação -- perdendo também os avisos que ela queria.
 *
 * Idempotente pelos carimbos em `lembrete_meio_em` / `lembrete_fim_em`:
 * a rodada só entra na conta enquanto o carimbo dela for nulo, e o
 * carimbo é gravado mesmo quando não há ninguém para avisar -- senão a
 * mesma rodada voltaria à fila a cada 15 minutos para sempre.
 */
async function lembretesDoDesafio(admin: ReturnType<typeof createAdminClient>) {
  const hoje = hojeIso();

  const { data: rodadas } = await admin
    .from("quiz_rodadas")
    .select(
      "id, revenda_id, nome, area, inicio, fim, lembrete_meio_em, lembrete_fim_em",
    )
    .eq("status", "publicada")
    .lte("inicio", hoje)
    .gte("fim", hoje);

  let enviados = 0;

  for (const r of rodadas ?? []) {
    const faltam = diasRestantes(r.fim, hoje);
    const duracao = Math.max(1, diasRestantes(r.fim, r.inicio));

    // A reta final tem precedência: na última semana o aviso certo é
    // "está acabando", não "você ainda não entrou" -- mesmo que o
    // lembrete do meio nunca tenha saído (rodada curta, por exemplo).
    let etapa: "fim" | "meio" | null = null;
    if (faltam <= 2) {
      if (!r.lembrete_fim_em) etapa = "fim";
    } else if (!r.lembrete_meio_em && faltam <= Math.floor(duracao / 2)) {
      etapa = "meio";
    }
    if (!etapa) continue;

    const carimbo =
      etapa === "fim"
        ? { lembrete_fim_em: new Date().toISOString() }
        : { lembrete_meio_em: new Date().toISOString() };

    const [pessoas, { data: concluiram }] = await Promise.all([
      getPessoasDaArea(r.revenda_id, r.area as AreaId),
      admin
        .from("quiz_participacoes")
        .select("colaborador_id")
        .eq("rodada_id", r.id)
        .eq("status", "concluida"),
    ]);

    const jaFizeram = new Set((concluiram ?? []).map((p) => p.colaborador_id));
    const alvo = pessoas.filter((id) => !jaFizeram.has(id));

    await admin.from("quiz_rodadas").update(carimbo).eq("id", r.id);
    if (alvo.length === 0) continue;

    const titulo =
      etapa === "fim" ? "⏰ Últimos dias do desafio" : "🔥 Você ainda não participou";
    const mensagem =
      etapa === "fim"
        ? `${r.nome} fecha ${faltam <= 0 ? "hoje" : `em ${faltam} dia${faltam === 1 ? "" : "s"}`}. Ainda dá tempo.`
        : `${r.nome} está aberto e você ainda não entrou. São poucos minutos.`;

    await Promise.all(
      alvo.map((colaboradorId) =>
        criarNotificacao({
          modulo: "quiz",
          tipo: "lembrete",
          titulo,
          mensagem,
          url: "/desafio",
          revendaId: r.revenda_id,
          destinatarioId: colaboradorId,
        }),
      ),
    );

    await enviarPushDaRevenda(r.revenda_id, {
      modulo: "quiz",
      titulo,
      mensagem,
      url: "/desafio",
      apenas: alvo,
    });

    enviados += alvo.length;
  }

  return enviados;
}
