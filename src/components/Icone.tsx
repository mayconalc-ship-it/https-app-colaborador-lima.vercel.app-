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
import {
  Archive,
  Building2,
  CalendarX2,
  PackagePlus,
  PhoneCall,
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
  fornecedores: Contact, // desenhado por ICONES_PROPRIOS

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

type PropsDoDesenho = { "aria-hidden"?: boolean; size?: number; strokeWidth?: number; className?: string };

/**
 * Fornecedor + telefone: o prédio da empresa com o fone no canto. Nenhum
 * emoji diz "contato do fornecedor" -- o 📇 é um fichário, e o 📞 sozinho
 * não diz de quem.
 */
function ContatoDoFornecedor({ size = 24, strokeWidth = 1.75, className }: PropsDoDesenho) {
  const predio = Math.round(size * 0.8);
  const fone = Math.round(size * 0.6);
  return (
    <span aria-hidden className={className} style={{ position: "relative", display: "inline-flex", width: size, height: size }}>
      <span style={{ position: "absolute", left: 0, top: 0, display: "inline-flex" }}>
        <Building2 size={predio} strokeWidth={strokeWidth} />
      </span>
      <span style={{ position: "absolute", right: -size * 0.12, bottom: -size * 0.12, display: "inline-flex" }}>
        <PhoneCall size={fone} strokeWidth={2.25} />
      </span>
    </span>
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
 * ÍCONES PRÓPRIOS (03/10/2026, pedido do dono): onde NENHUM emoji diz o
 * que a tela faz, o cartão usa um desenho -- mesmo com o sistema de
 * ícones desligado (USAR_ICONES, abaixo). Nas outras chaves o emoji do
 * banco continua.
 *
 *  - Abastecimento do Picking: abastecer é repor caixa na posição. O 🛒
 *    era supermercado, e o 🏬 que o substituiu aparece como um banco no
 *    WhatsApp. Caixa com "+".
 *  - Quebra de FEFO: o produto que vence primeiro não saiu primeiro -- a
 *    DATA não foi respeitada. Calendário com X.
 *  - Fornecedores: prédio com o telefone (ver ContatoDoFornecedor).
 *  - Empilhadeira e descarga: não existe emoji de empilhadeira; o 🏗️ é
 *    um guindaste de obra.
 *  - Ativo de Giro: garrafeira com garrafas (ver Garrafeira).
 *  - Produtividade do Armazém: galpão. O 🏭 é fábrica.
 */
const ICONES_PROPRIOS: Record<string, LucideIcon | ComponentType<PropsDoDesenho>> = {
  "pa-picking": PackagePlus,
  picking: PackagePlus,
  fefo: CalendarX2,
  "fefo-controle": CalendarX2,
  fornecedores: ContatoDoFornecedor,
  "pa-empilhadeira": Forklift,
  empilhadeira: Forklift,
  "carretas-descarga": Forklift,
  "ativo-giro": Garrafeira,
  // Armazém: não existe emoji de armazém; o 🏭 é fábrica (03/10/2026).
  "produtividade-armazem": Warehouse,
  armazem: Warehouse,
  // As mesmas telas nos cartões do Como Fazer (chave "guia:<slug>").
  "guia:abastecer-picking": PackagePlus,
  "guia:informar-quebra-fefo": CalendarX2,
  "guia:tratar-quebra-fefo": CalendarX2,
  "guia:consultar-fornecedores": ContatoDoFornecedor,
  "guia:operar-empilhadeira": Forklift,
  "guia:buscar-pedido-picking": Forklift,
  "guia:contar-ativo-giro": Garrafeira,
  "guia:recontar-ativo-giro": Garrafeira,
  "guia:conciliar-ativo-giro": Garrafeira,
  "guia:pedir-recontagem-ativo-giro": Garrafeira,
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

export function iconeDe(chave: string): LucideIcon | ComponentType<PropsDoDesenho> | null {
  if (ICONES_PROPRIOS[chave]) return ICONES_PROPRIOS[chave];
  if (!USAR_ICONES) return null;
  return POR_CHAVE[chave] ?? null;
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
  const Desenho = iconeDe(chave);

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
