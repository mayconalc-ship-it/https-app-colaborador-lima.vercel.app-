"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Avisos flutuantes de confirmação ("Salvo!", "Não deu certo").
 *
 * Antes disso cada tela resolvia sozinha: um `useState` de mensagem e um
 * <p> verde ou vermelho perto do botão. Funcionava, mas o aviso nascia
 * fora da vista quando o formulário era longo -- a pessoa salvava, não via
 * nada e salvava de novo.
 *
 * Aqui o aviso aparece sempre no mesmo lugar, no rodapé, perto do polegar,
 * e some sozinho. O container não bloqueia toque (pointer-events-none): o
 * balão de notificação vive na mesma região e continua clicável embaixo.
 */

type Tipo = "sucesso" | "erro" | "info";

type Aviso = {
  id: number;
  tipo: Tipo;
  texto: string;
};

type API = {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  info: (texto: string) => void;
};

const ToastContext = createContext<API | null>(null);

/** Erro some mais devagar: quem errou precisa de tempo para ler o motivo. */
const DURACAO: Record<Tipo, number> = {
  sucesso: 3500,
  erro: 6000,
  info: 4500,
};

const ESTILO: Record<Tipo, string> = {
  sucesso: "border-green-200 bg-green-50 text-green-900",
  erro: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-white text-slate-800",
};

const EMOJI: Record<Tipo, string> = {
  sucesso: "✅",
  erro: "⚠️",
  info: "ℹ️",
};

/**
 * O sucesso ganha um check que se DESENHA em vez do emoji parado.
 *
 * Não é enfeite: o aviso some em 3,5s, e no celular em movimento a pessoa
 * muitas vezes só vê o canto da tela de relance. O traço em movimento é
 * percebido sem precisar ler nada -- o emoji estático não era.
 */
function CheckAnimado() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="11"
        className="circulo-pulsa origin-center fill-green-600"
      />
      <path
        d="M7 12.5l3.2 3.2L17 9"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="check-desenha"
      />
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remover = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = proximoId.current++;
      setAvisos((atuais) => {
        // Salvar duas vezes seguidas não deve empilhar o mesmo texto duas
        // vezes -- renova o de cima em vez de duplicar.
        const semRepetido = atuais.filter(
          (a) => !(a.tipo === tipo && a.texto === texto),
        );
        // Três é o teto: acima disso o rodapé some no celular.
        return [...semRepetido, { id, tipo, texto }].slice(-3);
      });
      timers.current.set(
        id,
        setTimeout(() => remover(id), DURACAO[tipo]),
      );
    },
    [remover],
  );

  // Timers pendentes ao sair da página não podem tentar atualizar estado.
  useEffect(() => {
    const pendentes = timers.current;
    return () => {
      pendentes.forEach(clearTimeout);
      pendentes.clear();
    };
  }, []);

  const api = useMemo<API>(
    () => ({
      sucesso: (texto: string) => mostrar("sucesso", texto),
      erro: (texto: string) => mostrar("erro", texto),
      info: (texto: string) => mostrar("info", texto),
    }),
    [mostrar],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 pb-[env(safe-area-inset-bottom)] sm:left-auto sm:right-4 sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            role={a.tipo === "erro" ? "alert" : "status"}
            className={`toast-entra pointer-events-auto flex items-start gap-2 rounded-2xl border p-3 shadow-lg ${ESTILO[a.tipo]}`}
          >
            {a.tipo === "sucesso" ? (
              <CheckAnimado />
            ) : (
              <span className="text-base leading-tight" aria-hidden="true">
                {EMOJI[a.tipo]}
              </span>
            )}
            <p className="min-w-0 flex-1 text-sm font-medium">{a.texto}</p>
            <button
              type="button"
              onClick={() => remover(a.id)}
              aria-label="Fechar aviso"
              className="-mr-1 -mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-lg leading-none opacity-50 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Avisa fora do provider em vez de quebrar a tela: um botão sem toast
 * ainda funciona, e o erro aparece no console de quem programou.
 */
export function useToast(): API {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    sucesso: (t) => console.warn("[toast fora do provider]", t),
    erro: (t) => console.warn("[toast fora do provider]", t),
    info: (t) => console.warn("[toast fora do provider]", t),
  };
}
