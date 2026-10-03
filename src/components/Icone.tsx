/**
 * O SISTEMA DE ÍCONES
 *
 * Trocamos emoji por ícone de traço nos lugares de NAVEGAÇÃO -- cartão de
 * menu, barra, aba, título de seção. Não é questão de parecer moderno; é
 * que emoji não serve como ícone de interface:
 *
 *  - Renderiza diferente em cada aparelho. São ~160 pessoas com Samsung,
 *    Motorola e Xiaomi: o 🏗️ da Samsung não é o do Google. Você desenha
 *    uma coisa e eles veem outra.
 *  - Não dá para controlar cor, peso nem estado (ativo/inativo).
 *  - Peso óptico desigual: uns densos e coloridos, outros finos. Numa
 *    grade eles nunca alinham.
 *  - E o que mais importa aqui: NÃO DÁ PARA AGRUPAR com emoji. Agrupar
 *    exige ícones que recuam para o título do grupo liderar, e emoji
 *    colorido compete por atenção o tempo todo. É literalmente por isso
 *    que a grade de 13 cartões lia como plana.
 *
 * O emoji CONTINUA onde ele é bom: conteúdo escrito por gente, calor no
 * feedback ("🎉 Nenhum cliente insatisfeito") e identidade. O que sai é o
 * emoji fazendo papel de ícone.
 */

import { createElement, type ComponentType } from "react";
import { assuntoDaChave, DESENHO_DO_EMOJI, partesComDesenho, type DesenhoProprio } from "@/lib/mapa-emojis";
import {
  Archive,
  Building2,
  CalendarX2,
  PackagePlus,
  PhoneCall,
  Calculator,
  Users,
  Warehouse,
  Award,
  BarChart3,
  BookOpen,
  Contact,
  Boxes,
  Brain,
  CalendarDays,
  ClipboardList,
  Forklift,
  Gauge,
  Layers,
  Lightbulb,
  Lock,
  Megaphone,
  Newspaper,
  QrCode,
  Recycle,
  RotateCcw,
  Route,
  ScrollText,
  SprayCan,
  Star,
  Target,
  Trophy,
  Truck,
  Wrench,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Chave do item de menu -> ícone.
 *
 * A chave é a mesma de `menu_itens.chave` e de `MENU_PADRAO`, então o
 * banco continua mandando em título, ordem e visibilidade -- só o
 * desenho passa a vir daqui. Assim a migração não precisa reescrever
 * linha nenhuma da tabela.
 */
const POR_CHAVE: Record<string, LucideIcon> = {
  // Minha rotina
  escala: CalendarDays,
  rota: Route,
  "qr-contingencia": QrCode,
  rv: Wallet,
  "meus-indicadores": BarChart3,
  conta: Lock,

  // Minha operação
  "produtividade-armazem": Warehouse,
  reepack: Boxes,
  despejo: Recycle,
  empilhadeira: Forklift,
  picking: PackagePlus,
  "cinco-s": SprayCan,
  "carretas-portaria": Truck,
  "carretas-conferencia": Gauge,
  feedback: ClipboardList,
  "ativo-giro": Archive,
  "material-apoio": Layers,
  manutencao: Wrench,
  fefo: CalendarX2,

  // Da empresa
  comunicados: Newspaper,
  padroes: ScrollText,
  sonho: Target,
  "5s": SprayCan,
  fornecedores: Contact, // desenhado pelo mapa (DESENHOS)

  // Engajamento
  quiz: Brain,
  ranking: Trophy,
  "boas-praticas": Lightbulb,
  // Guia "Como Fazer".
  guia: BookOpen,

  // Indicadores individuais
  rating: Star,
  devolucao: RotateCcw,
  refugo: Recycle,
  justificativas: Megaphone,
  metas: Award,
};

type PropsDoDesenho = { "aria-hidden"?: boolean; size?: number | string; strokeWidth?: number; className?: string };

/**
 * Um desenho com um selo menor no canto -- a forma de juntar duas ideias
 * num ícone só (fornecedor + telefone, gente + conta).
 */
function comSelo(Principal: LucideIcon, Selo: LucideIcon) {
  // Em porcentagem: o mesmo desenho serve no cartão (24px) e no meio do
  // texto (1.15em, ver Marca).
  function ComSelo({ size = 24, strokeWidth = 1.75, className }: PropsDoDesenho) {
    return (
      <span aria-hidden className={className} style={{ position: "relative", display: "inline-flex", width: size, height: size }}>
        <span style={{ position: "absolute", left: 0, top: 0, width: "80%", height: "80%", display: "inline-flex" }}>
          <Principal size="100%" strokeWidth={strokeWidth} />
        </span>
        <span style={{ position: "absolute", right: "-12%", bottom: "-12%", width: "60%", height: "60%", display: "inline-flex" }}>
          <Selo size="100%" strokeWidth={2.25} />
        </span>
      </span>
    );
  }
  return ComSelo;
}

/**
 * Fornecedor + telefone: o prédio da empresa com o fone no canto. Nenhum
 * emoji diz "contato do fornecedor" -- o 📇 é um fichário, e o 📞 sozinho
 * não diz de quem.
 */
const ContatoDoFornecedor = comSelo(Building2, PhoneCall);

/**
 * Simulador de Mão de Obra: as pessoas e a conta. O 👷 é operário de
 * obra, e o 🧮 sozinho não diz que a conta é de gente.
 */
const MaoDeObra = comSelo(Users, Calculator);

/**
 * Gás da Empilhadeira: o botijão P20, com a alça e a válvula. O ⛽ é
 * bomba de gasolina, e a empilhadeira queima GLP do botijão.
 */
function Botijao({ size = 24, strokeWidth = 1.75, className }: PropsDoDesenho) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 1.5h2v2" />
      <path d="M8 3.5h8a1 1 0 0 1 1 1V8H7V4.5a1 1 0 0 1 1-1z" />
      <path d="M10 5.75h4" />
      <rect x="4" y="8" width="16" height="13" rx="4.5" />
      <path d="M4 14.5h16" />
      <path d="M7.5 23h9" />
    </svg>
  );
}

/**
 * Ativo de Giro: a garrafeira com as garrafas -- o vasilhame que gira
 * entre o CD e o PDV. Desenhado aqui, no mesmo traço dos ícones da
 * biblioteca (grade 24x24, cantos redondos), porque nenhum emoji é uma
 * garrafeira: o 📦 é caixa de papelão e o 🍺 é chope.
 */
function Garrafeira({ size = 24, strokeWidth = 1.75, className }: PropsDoDesenho) {
  const garrafa = (cx: number) => `M${cx - 1} 3h2v3l1.5 2v4h-5V8l1.5-2z`;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={garrafa(6.5)} />
      <path d={garrafa(12)} />
      <path d={garrafa(17.5)} />
      <rect x="3" y="12" width="18" height="9" rx="1.5" />
      <rect x="9" y="14.5" width="6" height="2" rx="1" />
    </svg>
  );
}

/**
 * OS DESENHOS PRÓPRIOS -- um por assunto do mapa (lib/mapa-emojis) que
 * não tem emoji que sirva. Valem sempre, mesmo com o sistema de ícones
 * desligado (USAR_ICONES, abaixo).
 *
 *  - abastecimento: caixa com "+" -- repor produto na posição.
 *  - fefo: calendário com X -- a data do produto não foi respeitada.
 *  - fornecedores: prédio com telefone (ContatoDoFornecedor).
 *  - empilhadeira: não existe emoji; o 🏗️ é guindaste de obra.
 *  - ativo-giro: garrafeira com garrafas (Garrafeira).
 *  - armazem: galpão. O 🏭 é fábrica.
 *  - gas: botijão P20 (Botijao).
 *  - mao-de-obra: pessoas + calculadora (MaoDeObra).
 */
const DESENHOS: Record<DesenhoProprio, LucideIcon | ComponentType<PropsDoDesenho>> = {
  abastecimento: PackagePlus,
  fefo: CalendarX2,
  fornecedores: ContatoDoFornecedor,
  empilhadeira: Forklift,
  "ativo-giro": Garrafeira,
  armazem: Warehouse,
  gas: Botijao,
  "mao-de-obra": MaoDeObra,
};

/**
 * A CHAVE GERAL DO SISTEMA DE ÍCONES.
 *
 * `false` = o app desenha os emoji do banco, como sempre fez.
 * `true`  = passa a desenhar os ícones de traço mapeados acima.
 *
 * Está desligado por decisão do dono (31/08/2026): a home agrupada foi
 * aprovada, os ícones ficam para depois. O mapeamento inteiro continua
 * aqui de propósito -- ligar é trocar esta linha, e não refazer o
 * trabalho. Nenhuma tela precisa mudar nos dois estados, porque quem
 * decide é o componente Icone.
 */
export const USAR_ICONES = false;

/**
 * O desenho de uma chave (módulo, menu, painel) -- ou do emoji, quando o
 * emoji é o de um assunto com desenho (assim o guia, que só tem emoji,
 * também desenha).
 */
export function iconeDe(chave: string, emoji?: string): LucideIcon | ComponentType<PropsDoDesenho> | null {
  const desenho = assuntoDaChave(chave)?.desenho ?? (emoji ? DESENHO_DO_EMOJI[emoji] : undefined);
  if (desenho) return DESENHOS[desenho];
  if (!USAR_ICONES) return null;
  return POR_CHAVE[chave] ?? null;
}

/** O desenho de um assunto, do tamanho do texto em volta (1em). */
export function Marca({ desenho, className }: { desenho: DesenhoProprio; className?: string }) {
  // Num span do tamanho de um emoji, alinhado como um emoji: o desenho
  // senta na linha do texto e não empurra a altura dela.
  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-flex", width: "1.15em", height: "1.15em", verticalAlign: "-0.2em", marginRight: "0.05em" }}
    >
      {createElement(DESENHOS[desenho], { "aria-hidden": true, size: "100%", strokeWidth: 2 })}
    </span>
  );
}

/**
 * Mostra um texto trocando os emojis de assunto com desenho pelo desenho
 * (ver lib/mapa-emojis). É o que deixa o título da tela, a aba e o botão
 * iguais ao cartão: "🏗️ Empilhadeira 3" sai com a empilhadeira desenhada.
 */
export function ComMarcas({ texto }: { texto: string }) {
  const partes = partesComDesenho(texto);
  if (partes.length === 1 && "texto" in partes[0]) return <>{texto}</>;
  return (
    <>
      {partes.map((p, i) => ("texto" in p ? <span key={i}>{p.texto}</span> : <Marca key={i} desenho={p.desenho} />))}
    </>
  );
}

/**
 * Desenha o ícone da chave. Sem ícone mapeado, cai no emoji -- é o que
 * mantém a migração segura: uma chave nova criada no banco aparece com o
 * emoji dela até alguém mapeá-la aqui, em vez de sumir da tela.
 */
export function Icone({
  chave,
  emoji,
  tamanho = 24,
  className,
}: {
  chave: string;
  /** Reserva, quando a chave ainda não tem ícone. */
  emoji?: string;
  tamanho?: number;
  className?: string;
}) {
  const Desenho = iconeDe(chave, emoji);

  if (!Desenho) {
    // O emoji do banco. `tamanho` vira o corpo da fonte para o cartão
    // grande e o pequeno continuarem com o mesmo peso visual.
    return (
      <span aria-hidden className={className} style={{ fontSize: tamanho * 1.15, lineHeight: 1 }}>
        {emoji ?? "•"}
      </span>
    );
  }

  // `currentColor` de propósito: o ícone herda a cor de quem o contém, e
  // é isso que deixa o estado (ativo, alerta, desabilitado) ser resolvido
  // no pai, sem uma variante de ícone por estado.
  //
  // createElement e não <Desenho />: o ícone sai de uma tabela FIXA
  // (POR_CHAVE), não é componente criado agora -- mas o lint não tem como
  // saber, e o JSX com nome vindo de variável parece criação.
  return createElement(Desenho, { "aria-hidden": true, size: tamanho, strokeWidth: 1.75, className });
}
