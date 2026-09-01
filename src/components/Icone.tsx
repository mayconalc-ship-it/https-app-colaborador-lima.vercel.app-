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

import {
  Archive,
  Award,
  BarChart3,
  Boxes,
  Brain,
  CalendarDays,
  ClipboardList,
  Factory,
  Forklift,
  Gauge,
  Lock,
  Megaphone,
  Newspaper,
  PackageCheck,
  Recycle,
  RotateCcw,
  Route,
  ScrollText,
  SprayCan,
  Star,
  Target,
  Trophy,
  Truck,
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
  rv: Wallet,
  "meus-indicadores": BarChart3,
  conta: Lock,

  // Minha operação
  "produtividade-armazem": Factory,
  reepack: Boxes,
  despejo: Recycle,
  empilhadeira: Forklift,
  picking: PackageCheck,
  "cinco-s": SprayCan,
  "carretas-portaria": Truck,
  "carretas-conferencia": Gauge,
  feedback: ClipboardList,
  "ativo-giro": Archive,
  fefo: Target,

  // Da empresa
  comunicados: Newspaper,
  padroes: ScrollText,
  sonho: Target,
  "5s": SprayCan,

  // Engajamento
  quiz: Brain,
  ranking: Trophy,

  // Indicadores individuais
  rating: Star,
  devolucao: RotateCcw,
  refugo: Recycle,
  justificativas: Megaphone,
  metas: Award,
};

export function iconeDe(chave: string): LucideIcon | null {
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
    return (
      <span aria-hidden className={className} style={{ fontSize: tamanho * 0.9, lineHeight: 1 }}>
        {emoji ?? "•"}
      </span>
    );
  }

  // `currentColor` de propósito: o ícone herda a cor de quem o contém, e
  // é isso que deixa o estado (ativo, alerta, desabilitado) ser resolvido
  // no pai, sem uma variante de ícone por estado.
  return <Desenho aria-hidden size={tamanho} strokeWidth={1.75} className={className} />;
}
