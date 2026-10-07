/**
 * CHAMADOS PARA MANUTENÇÃO (05/10/2026).
 *
 * O formulário "CHAMADO DE MANUTENÇÃO" do Microsoft Forms, trazido para
 * o app: os mesmos campos (unidade, área, solicitante, telefone, tipo de
 * O.S. e a descrição), aberto pelo app ou pelo QR Code da unidade -- UM
 * só por revenda, como o Forms (pedido do dono, 05/10/2026).
 *
 * O que o Forms não tinha e o app passa a ter -- é o que o DPO cobra da
 * manutenção no Checklist Global (ver lib/manutencao.ts):
 *   - número e PRAZO por prioridade (8.2 e 9.2: "fechados no prazo");
 *   - andamento com aviso a quem abriu (9.3: feedback de chamados);
 *   - confirmação de quem abriu, que REABRE se não resolveu (8.2:
 *     "chamados fechados indevidamente"; 9.2: "% de reabertos");
 *   - a nota do atendimento (9.1: pesquisa de nível de serviço).
 *
 * Aqui só a regra pura. Banco e telas moram em chamados-server e em
 * app/chamados, app/os e app/gestao/chamados.
 */

export const MODULO_CHAMADOS = "chamados" as const;
export const MODULO_CHAMADOS_ATENDER = "chamados-atender" as const;

// ---------------------------------------------------------------------
// Tipo de O.S. -- a mesma lista do Forms
// ---------------------------------------------------------------------

export const TIPOS = [
  { id: "alvenaria", rotulo: "Alvenaria", exemplo: "parede, piso, telhado, porta" },
  { id: "eletrica", rotulo: "Elétrica", exemplo: "lâmpada, tomada, quadro, ar-condicionado" },
  { id: "hidraulica", rotulo: "Hidráulica", exemplo: "vazamento, entupimento, torneira, descarga" },
  { id: "jardinagem", rotulo: "Jardinagem", exemplo: "capina, poda, grama" },
  { id: "limpeza", rotulo: "Limpeza", exemplo: "sujeira, lixo, caixa de gordura" },
  { id: "mobiliario", rotulo: "Mobiliário", exemplo: "cadeira, mesa, armário, prateleira" },
  { id: "outros", rotulo: "Outros", exemplo: "o que não se encaixa acima" },
] as const;

export type Tipo = (typeof TIPOS)[number]["id"];

export function ehTipo(v: unknown): v is Tipo {
  return TIPOS.some((t) => t.id === v);
}

export function rotuloTipo(t: string) {
  return TIPOS.find((x) => x.id === t)?.rotulo ?? t;
}

// ---------------------------------------------------------------------
// Prioridade -- três níveis, o padrão dos portais de manutenção
// ---------------------------------------------------------------------

export const PRIORIDADES = [
  { id: "normal", rotulo: "Normal", explica: "Pode entrar na rotina da manutenção" },
  { id: "urgente", rotulo: "Urgente", explica: "Está atrapalhando o trabalho hoje" },
  { id: "risco", rotulo: "Risco à segurança", explica: "Pode machucar alguém ou parar a operação" },
] as const;

export type Prioridade = (typeof PRIORIDADES)[number]["id"];

export function ehPrioridade(v: unknown): v is Prioridade {
  return PRIORIDADES.some((p) => p.id === v);
}

export function rotuloPrioridade(p: string) {
  return PRIORIDADES.find((x) => x.id === p)?.rotulo ?? p;
}

// ---------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------

export const STATUS = [
  { id: "aberto", rotulo: "Aberto", explica: "Esperando a manutenção assumir" },
  { id: "em_atendimento", rotulo: "Em atendimento", explica: "A manutenção está cuidando" },
  { id: "aguardando", rotulo: "Aguardando", explica: "Parado por material ou terceiro" },
  { id: "concluido", rotulo: "Concluído", explica: "A manutenção deu como resolvido" },
  { id: "cancelado", rotulo: "Cancelado", explica: "Não vai ser atendido" },
] as const;

export type Status = (typeof STATUS)[number]["id"];

export function ehStatus(v: unknown): v is Status {
  return STATUS.some((s) => s.id === v);
}

export function rotuloStatus(s: string) {
  return STATUS.find((x) => x.id === s)?.rotulo ?? s;
}

/** Ainda é trabalho da manutenção (conta no backlog e no prazo correndo). */
export function emAberto(s: string) {
  return s === "aberto" || s === "em_atendimento" || s === "aguardando";
}

// ---------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------

export type Prazos = { risco: number; urgente: number; normal: number };

/** Os valores de partida da migration 165 (horas corridas). */
export const PRAZOS_PADRAO: Prazos = { risco: 4, urgente: 24, normal: 72 };

const HORA = 60 * 60 * 1000;

/** O prazo do chamado: aberto + as horas da prioridade. */
export function prazoDe(abertoEm: string | Date, prioridade: Prioridade, prazos: Prazos): Date {
  return new Date(new Date(abertoEm).getTime() + prazos[prioridade] * HORA);
}

export type SituacaoDoPrazo =
  | { tipo: "no_prazo"; restaMs: number }
  /** Menos de 1/4 do prazo pela frente: o aviso amarelo. */
  | { tipo: "vence_logo"; restaMs: number }
  | { tipo: "atrasado"; passouMs: number }
  /** Concluído: cumpriu ou estourou. Cancelado não tem prazo. */
  | { tipo: "cumprido" }
  | { tipo: "estourado"; passouMs: number }
  | { tipo: "sem_prazo" };

export function situacaoDoPrazo(
  c: { status: string; aberto_em: string; prazo_em: string; concluido_em: string | null },
  agora: Date = new Date(),
): SituacaoDoPrazo {
  const prazo = new Date(c.prazo_em).getTime();
  if (c.status === "cancelado") return { tipo: "sem_prazo" };
  if (c.status === "concluido") {
    const fim = c.concluido_em ? new Date(c.concluido_em).getTime() : agora.getTime();
    return fim <= prazo ? { tipo: "cumprido" } : { tipo: "estourado", passouMs: fim - prazo };
  }
  const resta = prazo - agora.getTime();
  if (resta < 0) return { tipo: "atrasado", passouMs: -resta };
  const total = prazo - new Date(c.aberto_em).getTime();
  return resta <= total / 4 ? { tipo: "vence_logo", restaMs: resta } : { tipo: "no_prazo", restaMs: resta };
}

/** "45 min", "3 h", "2 h 30 min", "2 dias" -- curto, para caber num selo. */
export function formatarDuracao(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto && horas < 10 ? `${horas} h ${resto} min` : `${horas} h`;
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  if (dias === 1) return h ? `1 dia e ${h} h` : "1 dia";
  return dias < 7 && h ? `${dias} dias e ${h} h` : `${dias} dias`;
}

/** A frase do selo: "vence em 3 h", "atrasado há 2 dias", "no prazo". */
export function textoDoPrazo(s: SituacaoDoPrazo): string {
  switch (s.tipo) {
    case "no_prazo":
    case "vence_logo":
      return `vence em ${formatarDuracao(s.restaMs)}`;
    case "atrasado":
      return `atrasado há ${formatarDuracao(s.passouMs)}`;
    case "cumprido":
      return "resolvido no prazo";
    case "estourado":
      return `resolvido ${formatarDuracao(s.passouMs)} depois do prazo`;
    case "sem_prazo":
      return "";
  }
}

/** "05/10 14:32", no fuso da operação. */
export function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "05/10/2026 14:32" -- com o ano, para o que sai do app (PDF e e-mail). */
export function dataHoraCompleta(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Bahia",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------
// Protocolo e telefone
// ---------------------------------------------------------------------

/** "#0042" -- o número que a pessoa fala ao telefone. */
export function protocolo(numero: number) {
  return `#${String(numero).padStart(4, "0")}`;
}

export function soDigitos(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

/** "(77) 99999-1234" a partir do que a pessoa digitou. */
export function formatarTelefone(v: string) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v.trim();
}

/** O link do WhatsApp do solicitante (só celular com DDD). */
export function linkWhatsapp(telefone: string, texto?: string) {
  const d = soDigitos(telefone).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length !== 11) return null;
  return `https://wa.me/55${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

// ---------------------------------------------------------------------
// Validação da abertura
// ---------------------------------------------------------------------

export type EntradaAbertura = {
  localId: string;
  tipo: string;
  prioridade: string;
  descricao: string;
  nome: string;
  telefone: string;
};

/** O mesmo limite do campo de foto com câmera (CampoFoto, `multiple`). */
export const FOTOS_POR_CHAMADO = 4;

/**
 * A foto sai do celular com 1280 px e JPEG 70 (05/10/2026): ~105 KB em vez
 * de ~195 KB, medido em fotos reais do app. Quatro fotos cabem com folga
 * no limite de envio da Vercel (4,5 MB), mesmo em aparelho que não reduz.
 */
export const FOTO_DO_CHAMADO = { ladoMaior: 1280, qualidade: 0.7 };

/**
 * O que falta para abrir. O formulário também confere no navegador, mas
 * a página do QR é pública: a palavra final é esta.
 */
export function problemaDaAbertura(e: EntradaAbertura): string | null {
  if (!e.localId) return "Escolha a área do problema.";
  if (!ehTipo(e.tipo)) return "Escolha o tipo de serviço.";
  if (!ehPrioridade(e.prioridade)) return "Escolha a prioridade.";
  const descricao = e.descricao.trim();
  if (descricao.length < 5) return "Descreva o problema: o que é e onde exatamente.";
  if (descricao.length > 2000) return "A descrição passou de 2.000 caracteres. Resuma um pouco.";
  const nome = e.nome.trim().replace(/\s+/g, " ");
  if (nome.length < 2) return "Escreva o seu nome.";
  if (nome.length > 120) return "Nome longo demais.";
  const d = soDigitos(e.telefone);
  if (d.length < 10 || d.length > 13) return "Informe um telefone com DDD, para a manutenção falar com você.";
  return null;
}

// ---------------------------------------------------------------------
// E-mail (07/10/2026, pedido do dono)
// ---------------------------------------------------------------------

/** Um e-mail plausível. O teste de verdade é o Outlook de quem envia. */
export function problemaDoEmail(email: string): string | null {
  const e = email.trim();
  if (e.length < 5 || e.length > 160 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(e)) return "E-mail inválido.";
  return null;
}

export type ChamadoParaEmail = {
  numero: number;
  local_nome: string;
  tipo: string;
  prioridade: string;
  status: string;
  descricao: string;
  solicitante_nome: string;
  solicitante_telefone: string;
  aberto_em: string;
  prazo_em: string;
  responsavel_nome: string | null;
  solucao: string | null;
};

export function assuntoDoEmail(c: ChamadoParaEmail, unidade: string) {
  const peso = c.prioridade === "normal" ? "" : ` [${rotuloPrioridade(c.prioridade)}]`;
  return `Chamado para Manutenção ${protocolo(c.numero)}${peso} — ${rotuloTipo(c.tipo)} em ${c.local_nome} — ${unidade}`;
}

/** O corpo do e-mail: o chamado inteiro em texto puro, que é o que o Outlook recebe pelo link. */
export function textoDoEmail(c: ChamadoParaEmail, unidade: string, link: string) {
  const linhas = [
    `CHAMADO PARA MANUTENÇÃO ${protocolo(c.numero)}`,
    "",
    `Unidade: ${unidade}`,
    `Área: ${c.local_nome}`,
    `Tipo de serviço: ${rotuloTipo(c.tipo)}`,
    `Prioridade: ${rotuloPrioridade(c.prioridade)}`,
    `Situação: ${rotuloStatus(c.status)}`,
    `Aberto em: ${dataHoraCompleta(c.aberto_em)}`,
    `Prazo: ${dataHoraCompleta(c.prazo_em)}`,
    `Pedido por: ${c.solicitante_nome} · ${c.solicitante_telefone}`,
  ];
  if (c.responsavel_nome) linhas.push(`Quem está cuidando: ${c.responsavel_nome}`);
  linhas.push("", "Descrição:", c.descricao);
  if (c.status === "concluido" && c.solucao) linhas.push("", "O que foi feito:", c.solucao);
  linhas.push("", `Ver no App do Colaborador: ${link}`);
  return linhas.join("\n");
}

/** Texto comparável: duplicata é o mesmo pedido, com outra caixa ou espaço. */
export function chaveDoTexto(t: string) {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------
// Locais
// ---------------------------------------------------------------------

export type Local = {
  id: string;
  grupo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  /** A área do 5S que esta área é (migration 167). Nulo = só do chamado. */
  cinco_s_area_id?: string | null;
  /** Nasceu do 5S: nome e liga/desliga são os do cadastro do 5S. */
  veio_do_5s?: boolean;
  /** Como a área está no 5S hoje -- é o que a aba "Áreas do 5S" mostra. */
  area5s?: { nome: string; ordem: number; ativa: boolean } | null;
};

/**
 * As abas do formulário: os SETORES (07/10/2026, pedido do dono: "não
 * quero botão de área do 5S; organizar em Armazém, Externo, ADM"). As
 * áreas que vieram do 5S entram no setor delas como qualquer outra -- o
 * setor de cada uma é escolhido em Admin › Chamados. Área nova do 5S
 * ainda sem setor cai em "Demais áreas" até alguém escolher.
 */
export function gruposDoFormulario(locais: Local[]): { titulo: string; itens: { id: string; nome: string }[] }[] {
  return agruparLocais(locais).map((g) => ({
    titulo: g.titulo,
    itens: g.itens.map((l) => ({ id: l.id, nome: l.nome })),
  }));
}

/** "Armazém · Picking" -- o nome que fica gravado no chamado. */
export function nomeDoLocal(l: { grupo: string; nome: string }) {
  return l.grupo ? `${l.grupo} · ${l.nome}` : l.nome;
}

/**
 * Os locais em grupos, na ordem do cadastro. Os sem grupo ficam juntos em
 * "Demais áreas", na posição do primeiro deles.
 */
export function agruparLocais<T extends { grupo: string; ordem: number }>(locais: T[]) {
  const grupos: { titulo: string; itens: T[] }[] = [];
  for (const l of [...locais].sort((a, b) => a.ordem - b.ordem)) {
    const titulo = l.grupo || "Demais áreas";
    const g = grupos.find((x) => x.titulo === titulo);
    if (g) g.itens.push(l);
    else grupos.push({ titulo, itens: [l] });
  }
  return grupos;
}

// ---------------------------------------------------------------------
// Indicadores (o painel da Gestão)
// ---------------------------------------------------------------------

export type ChamadoParaIndicador = {
  status: string;
  tipo: string;
  local_nome: string;
  prioridade: string;
  aberto_em: string;
  prazo_em: string;
  atendimento_em: string | null;
  concluido_em: string | null;
  confirmacao: string | null;
  avaliacao: number | null;
  reaberturas: number;
};

export type Indicadores = {
  total: number;
  emAberto: number;
  atrasados: number;
  concluidos: number;
  cancelados: number;
  /** Dos concluídos, quantos dentro do prazo (0..1). null = nenhum concluído. */
  noPrazo: number | null;
  /** Tempo médio de solução (abertura -> conclusão), em ms. O MTTR. */
  tempoMedioSolucaoMs: number | null;
  /** Tempo médio até alguém assumir, em ms. */
  tempoMedioRespostaMs: number | null;
  /** Dos concluídos, quantos já foram reabertos alguma vez (0..1). */
  reabertos: number | null;
  /** Média das notas (1 a 5). */
  notaMedia: number | null;
  avaliacoes: number;
  porTipo: { chave: string; total: number }[];
  porLocal: { chave: string; total: number }[];
};

function media(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function contar(chamados: ChamadoParaIndicador[], chave: (c: ChamadoParaIndicador) => string) {
  const m = new Map<string, number>();
  for (const c of chamados) m.set(chave(c), (m.get(chave(c)) ?? 0) + 1);
  return [...m.entries()].map(([k, total]) => ({ chave: k, total })).sort((a, b) => b.total - a.total || a.chave.localeCompare(b.chave, "pt-BR"));
}

/**
 * Os números do período. Cancelado sai de tudo que mede o atendimento
 * (prazo, tempo, reabertura) -- ele não foi atendido -- mas entra no total
 * e é contado à parte: um "cancelado" alto também diz alguma coisa.
 */
export function calcularIndicadores(chamados: ChamadoParaIndicador[], agora: Date = new Date()): Indicadores {
  const validos = chamados.filter((c) => c.status !== "cancelado");
  const concluidos = validos.filter((c) => c.status === "concluido" && c.concluido_em);
  const abertos = validos.filter((c) => emAberto(c.status));
  const atrasados = abertos.filter((c) => new Date(c.prazo_em).getTime() < agora.getTime());
  const noPrazo = concluidos.filter((c) => new Date(c.concluido_em!).getTime() <= new Date(c.prazo_em).getTime());
  const notas = chamados.map((c) => c.avaliacao).filter((n): n is number => typeof n === "number" && n >= 1 && n <= 5);
  const respondidos = validos.filter((c) => c.atendimento_em);

  return {
    total: chamados.length,
    emAberto: abertos.length,
    atrasados: atrasados.length,
    concluidos: concluidos.length,
    cancelados: chamados.length - validos.length,
    noPrazo: concluidos.length ? noPrazo.length / concluidos.length : null,
    tempoMedioSolucaoMs: media(concluidos.map((c) => new Date(c.concluido_em!).getTime() - new Date(c.aberto_em).getTime())),
    tempoMedioRespostaMs: media(respondidos.map((c) => new Date(c.atendimento_em!).getTime() - new Date(c.aberto_em).getTime())),
    reabertos: concluidos.length ? concluidos.filter((c) => c.reaberturas > 0).length / concluidos.length : null,
    notaMedia: media(notas),
    avaliacoes: notas.length,
    porTipo: contar(chamados, (c) => rotuloTipo(c.tipo)),
    porLocal: contar(chamados, (c) => c.local_nome),
  };
}

/** "87%" */
export function pct(v: number | null) {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}
