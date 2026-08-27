"use client";

import { useState, useTransition } from "react";

const campoClasse =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

/**
 * Cadastro rápido em popover -- a peça compartilhada por trás de todo "+"
 * quadrado azul do app (ver BotaoMais). Cadastra sem sair da tela e já
 * escolhe o que acabou de criar.
 *
 * `valor` é o que vai para o campo do formulário e `rotulo` é o que a
 * pessoa lê: em cadastro por id (fábrica, AG) os dois diferem; em cadastro
 * por texto livre (motorista, empilhador) são o mesmo.
 *
 * Segurança: quem monta a tela só passa `criarRapido` para quem tem
 * permissão -- sem ela o "+" nem aparece. A ação do servidor confere a
 * permissão de novo, porque esconder o botão não é controle de acesso.
 */
export type ResultadoCriar =
  | { ok: true; valor: string; rotulo: string }
  | { ok: false; erro: string };

export type CriarRapido = (formData: FormData) => Promise<ResultadoCriar>;

export type CampoRapido = {
  nome: string;
  rotulo: string;
  /** "cpf" formata enquanto digita; o servidor recebe só os dígitos. */
  tipo?: "texto" | "cpf" | "select";
  opcoes?: { valor: string; rotulo: string }[];
};

/** Formata CPF enquanto digita (000.000.000-00) -- só cosmético. */
export function formatarCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function PopoverCadastroRapido({
  titulo = "Cadastrar novo",
  campos,
  valoresIniciais,
  criarRapido,
  onCriado,
  onFechar,
}: {
  titulo?: string;
  campos: CampoRapido[];
  valoresIniciais?: Record<string, string>;
  criarRapido: CriarRapido;
  onCriado: (criado: { valor: string; rotulo: string }) => void;
  onFechar: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const c of campos) {
      inicial[c.nome] = valoresIniciais?.[c.nome] ?? (c.tipo === "select" ? (c.opcoes?.[0]?.valor ?? "") : "");
    }
    return inicial;
  });
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function alterar(nome: string, valor: string) {
    setValores((atual) => ({ ...atual, [nome]: valor }));
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const fd = new FormData();
      for (const c of campos) fd.set(c.nome, valores[c.nome] ?? "");
      const resultado = await criarRapido(fd);
      if (resultado.ok) onCriado({ valor: resultado.valor, rotulo: resultado.rotulo });
      else setErro(resultado.erro);
    });
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-72 max-w-[90vw] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-xs font-bold uppercase text-slate-500">{titulo}</p>
      {campos.map((c, i) =>
        c.tipo === "select" ? (
          <select
            key={c.nome}
            value={valores[c.nome] ?? ""}
            onChange={(e) => alterar(c.nome, e.target.value)}
            aria-label={c.rotulo}
            className={campoClasse}
          >
            {(c.opcoes ?? []).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={c.nome}
            type="text"
            inputMode={c.tipo === "cpf" ? "numeric" : undefined}
            maxLength={c.tipo === "cpf" ? 14 : undefined}
            value={valores[c.nome] ?? ""}
            onChange={(e) => alterar(c.nome, c.tipo === "cpf" ? formatarCpf(e.target.value) : e.target.value)}
            placeholder={c.rotulo}
            aria-label={c.rotulo}
            className={campoClasse}
            autoFocus={i === 0}
          />
        ),
      )}
      {erro && <p className="text-xs font-medium text-red-600">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFechar}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pending}
          className="flex-1 rounded-lg bg-primary py-2 text-xs font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
