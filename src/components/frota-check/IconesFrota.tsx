import {
  AppWindow,
  ArrowUpFromLine,
  Armchair,
  BatteryWarning,
  BellRing,
  Bike,
  Box,
  Cable,
  CircleStop,
  Columns2,
  CreditCard,
  DoorClosed,
  Droplets,
  FileText,
  FireExtinguisher,
  Footprints,
  Gauge,
  Grip,
  GripHorizontal,
  Hand,
  HandHelping,
  Hash,
  Highlighter,
  Joystick,
  LampWallUp,
  Lightbulb,
  Megaphone,
  Package,
  PanelTop,
  RectangleHorizontal,
  ScanEye,
  Scissors,
  ShieldCheck,
  Siren,
  Sparkles,
  Sticker,
  Sun,
  TriangleAlert,
  Truck,
  Volume2,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * OS ÍCONES DO CHECK DA FROTA (pedido do dono, 25/11/2026: "os ícones não
 * estão fazendo sentido com os títulos"). Os emojis viravam coisa
 * diferente em cada celular (a 🔙 da Traseira aparecia escrita "BACK" no
 * computador, a 🪑 da Cabine era uma cadeira de cozinha).
 *
 * Grupos: desenhos próprios, no mesmo traço dos ícones do app -- cada um
 * é a VISTA do caminhão que o grupo confere (cabine de lado, frente com
 * faróis, baú, traseira com lanternas, pneu, bateria com fiação).
 * Itens: um ícone por item, pela ordem da planilha (1 a 49).
 */

type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Cabine vista de lado: para-brisa, porta com maçaneta, degrau e roda. */
function Cabine({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 17.5V9.5L7.5 4H17v13.5" />
      <path d="M5.6 10 8.3 6H12v4Z" />
      <path d="M13 6v11.5" />
      <path d="M14.3 11.5h1.4" />
      <path d="M2.5 17.5h17" />
      <circle cx="8.5" cy="18.5" r="2" />
      <path d="M17 13.5h2.5v4" />
    </svg>
  );
}

/** Frente do caminhão: para-brisa, grade, dois faróis e para-choque. */
function Frontal({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="4" y="3" width="16" height="15" rx="2.5" />
      <path d="M6 8.5 7 5h10l1 3.5Z" />
      <circle cx="7.5" cy="13" r="1.4" />
      <circle cx="16.5" cy="13" r="1.4" />
      <path d="M10.5 12h3M10.5 14h3" />
      <path d="M3 18h18" />
      <path d="M6 18v2.5M18 18v2.5" />
      <path d="M4 7H2.5v3.5M20 7h1.5v3.5" />
    </svg>
  );
}

/** O baú: caixa de carga com as baias de cortina. */
function Bau({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
      <path d="M8.8 4v12.5M15.2 4v12.5" />
      <path d="M2.5 7h19" />
      <circle cx="6.5" cy="19" r="1.8" />
      <circle cx="17.5" cy="19" r="1.8" />
      <path d="M8.3 19h7.4" />
    </svg>
  );
}

/** Traseira: portas do baú, lanternas e para-choque com faixa. */
function Traseira({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="4" y="3" width="16" height="13" rx="1.5" />
      <path d="M12 3v13" />
      <path d="M10 9.5h.01M14 9.5h.01" strokeWidth={2.6} />
      <rect x="3" y="16" width="18" height="3" rx="1" />
      <path d="M5 17.5h2.5M16.5 17.5H19" stroke="#dc2626" strokeWidth={2.2} />
      <path d="M10.5 17.5h3" />
    </svg>
  );
}

/** Pneu com o desenho da banda (o sulco que se mede). */
function Pneu({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="1.2" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </svg>
  );
}

/** Itens extras: bateria com o cabo saindo (fiação e proteção). */
function Extras({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3" y="8" width="13" height="10" rx="1.5" />
      <path d="M6 8V6.5M13 8V6.5" />
      <path d="M6 12.5h2M7 11.5v2M11 12.5h2" />
      <path d="M16 13h2a2 2 0 0 0 2-2V8" />
      <path d="M18 8h4M19 5.5V8M21 5.5V8" />
    </svg>
  );
}

/** Volante (não existe no conjunto de ícones). */
function Volante({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M3.4 10.5 9.7 11.4M14.3 11.4l6.3-.9M12 14.4V21" />
    </svg>
  );
}

export const ICONE_GRUPO: Record<string, (p: P) => React.ReactElement> = {
  Cabine,
  Frontal,
  "Baú": Bau,
  Traseira,
  Pneus: Pneu,
  "Itens extras": Extras,
};

export function IconeGrupo({ grupo, className }: { grupo: string; className?: string }) {
  const I = ICONE_GRUPO[grupo] ?? Truck;
  return <I className={className} />;
}

/** Item pela ordem da planilha (cf_itens.ordem). */
const ICONE_ITEM: Record<number, LucideIcon | ((p: P) => React.ReactElement)> = {
  1: FileText, // documentos obrigatórios
  2: Sparkles, // 5S
  3: PanelTop, // forro de teto
  4: Joystick, // manopla do câmbio
  5: Volante,
  6: Megaphone, // buzina
  7: FireExtinguisher,
  8: Sun, // proteção contra sol
  9: BellRing, // sensor (alarme) do cinto
  10: ShieldCheck, // cinto de segurança
  11: Gauge, // painéis
  12: DoorClosed, // maçanetas e fechamento
  13: Armchair, // estrutura do banco
  14: Truck, // lado externo
  15: Footprints, // degraus / pontos de apoio
  16: Lightbulb, // farol
  17: Siren, // pisca dianteiro
  18: RectangleHorizontal, // para-choque dianteiro
  19: Droplets, // limpador e jato de água
  20: AppWindow, // vidros
  21: CreditCard, // placa
  22: Hash, // código de identificação
  23: ScanEye, // retrovisores
  24: Grip, // puxador de baia
  25: Hand, // alça pega-mão
  26: ArrowUpFromLine, // plataforma
  27: HandHelping, // kit ergonômico
  28: Columns2, // baia cortina
  29: GripHorizontal, // borracha da baia
  30: Scissors, // anti-guilhotina
  31: LampWallUp, // luzes vigia
  32: Bike, // anticiclista / estribo
  33: Sticker, // adesivo das autoridades
  34: Highlighter, // faixas refletivas
  35: Cable, // levanta-fio
  36: Package, // qualidade visual do baú
  37: Box, // qualidade estrutural do baú
  38: RectangleHorizontal, // para-choque traseiro
  39: Lightbulb, // farol traseiro
  40: Volume2, // luz e sinal sonoro de ré
  41: CircleStop, // luz de freio
  42: Siren, // pisca traseiro
  43: CreditCard, // placa traseira
  44: Hash, // código de identificação
  45: Highlighter, // faixa refletiva do para-choque
  46: TriangleAlert, // adesivos de segurança
  47: Pneu, // estado de conservação dos pneus
  48: Zap, // fiação exposta
  49: BatteryWarning, // proteção das baterias
};

export function IconeItem({ ordem, className }: { ordem: number; className?: string }) {
  const I = ICONE_ITEM[ordem] ?? FileText;
  return <I className={className} />;
}
