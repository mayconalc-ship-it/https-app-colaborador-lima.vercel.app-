"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepararEnvios, registrarPadroes } from "@/app/admin/padroes/actions";

/** Quantos arquivos sobem ao mesmo tempo. */
const SIMULTANEOS = 3;

/** Acima disso o armazenamento recusa o arquivo. */
const LIMITE_BYTES = 50 * 1024 * 1024;

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** As mensagens do armazenamento vêm em inglês técnico. */
function emPortugues(mensagem: string) {
  const m = mensagem.toLowerCase();
  if (m.includes("row-level security") || m.includes("unauthorized")) {
    return "sem permissão para gravar no armazenamento";
  }
  if (m.includes("exceeded the maximum") || m.includes("too large")) {
    return "arquivo grande demais (limite de 50 MB)";
  }
  if (m.includes("already exists")) return "já existe um arquivo com esse nome";
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "a conexão caiu no meio do envio";
  }
  return mensagem;
}

export function EnviarPadrao({
  pilares,
  pilarAtual,
  pastas,
}: {
  pilares: string[];
  pilarAtual: string;
  pastas: string[];
}) {
  const router = useRouter();
  const [pilar, setPilar] = useState(pilarAtual);
  const [caminho, setCaminho] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (arquivos.length === 0) {
      setErro("Escolha pelo menos um arquivo.");
      return;
    }

    const grandes = arquivos.filter((a) => a.size > LIMITE_BYTES);
    if (grandes.length) {
      setErro(
        `Estes arquivos passam de 50 MB e o armazenamento não aceita:\n${grandes
          .map((a) => `${a.name} (${tamanhoLegivel(a.size)})`)
          .join("\n")}`,
      );
      return;
    }

    setEnviando(true);
    setProgresso({ feitos: 0, total: arquivos.length });

    // Um único pedido ao servidor gera o "crachá" de envio de todos os
    // arquivos; depois eles sobem direto do navegador para o armazenamento.
    const preparo = await prepararEnvios(
      pilar,
      arquivos.map((a) => a.name),
    );

    if (!preparo.ok || !preparo.itens) {
      setEnviando(false);
      setErro(preparo.erro ?? "Não foi possível iniciar o envio.");
      return;
    }

    const supabase = createClient();
    const falhas: string[] = [];
    const enviados: { nome: string; tipo: string; destino: string }[] = [];
    let feitos = 0;

    async function subir(indice: number) {
      const arquivo = arquivos[indice];
      const { destino, token } = preparo.itens![indice];

      const { error } = await supabase.storage
        .from("conteudo")
        .uploadToSignedUrl(destino, token, arquivo);

      if (error) {
        falhas.push(`${arquivo.name}: ${emPortugues(error.message)}`);
      } else {
        enviados.push({
          nome: arquivo.name.replace(/\.[^.]+$/, ""),
          tipo: (arquivo.name.split(".").pop() ?? "").toLowerCase(),
          destino,
        });
      }

      feitos++;
      setProgresso({ feitos, total: arquivos.length });
    }

    // Alguns de cada vez: em série, uma pasta inteira demora demais.
    let proximo = 0;
    await Promise.all(
      Array.from({ length: Math.min(SIMULTANEOS, arquivos.length) }, async () => {
        while (proximo < arquivos.length) await subir(proximo++);
      }),
    );

    if (enviados.length) {
      const r = await registrarPadroes({ pilar, caminho, itens: enviados });
      if (!r.ok) falhas.push(`Ao salvar na lista: ${r.erro}`);
    }

    setEnviando(false);

    if (falhas.length) {
      setErro(
        `${falhas.length} de ${arquivos.length} não foram enviados:\n${falhas.join("\n")}`,
      );
    } else {
      setSucesso(
        `${arquivos.length} arquivo(s) enviado(s) para ${pilar}${caminho ? ` / ${caminho}` : ""}.`,
      );
      setArquivos([]);
      const campo = document.getElementById(
        "arquivo-padrao",
      ) as HTMLInputElement | null;
      if (campo) campo.value = "";
    }

    router.refresh();
  }

  const totalBytes = arquivos.reduce((s, a) => s + a.size, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div>
        <label
          htmlFor="pilar-envio"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Pilar
        </label>
        <select
          id="pilar-envio"
          value={pilar}
          onChange={(e) => setPilar(e.target.value)}
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        >
          {pilares.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="caminho-envio"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Pasta/Tópico (opcional)
        </label>
        <input
          id="caminho-envio"
          value={caminho}
          onChange={(e) => setCaminho(e.target.value)}
          list="pastas-envio"
          placeholder="Ex: Roteirização"
          className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
        />
        <datalist id="pastas-envio">
          {pastas.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      <div>
        <label
          htmlFor="arquivo-padrao"
          className="mb-1 block text-sm font-medium text-slate-700"
        >
          Arquivos
        </label>
        <input
          id="arquivo-padrao"
          type="file"
          multiple
          onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
          className="w-full rounded-xl border border-slate-200 p-2 text-sm"
        />
        <p className="mt-1 text-xs text-slate-400">
          Pode selecionar vários de uma vez. Word, Excel, PDF, PowerPoint,
          imagem ou vídeo.
        </p>
        {arquivos.length > 0 && (
          <p className="mt-2 rounded-lg bg-primary-soft p-2 text-xs text-primary-dark">
            {arquivos.length} arquivo(s) · {tamanhoLegivel(totalBytes)}
          </p>
        )}
      </div>

      {enviando && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${(progresso.feitos / Math.max(1, progresso.total)) * 100}%`,
              }}
            />
          </div>
          <p className="mt-2 text-center text-sm text-slate-600">
            Enviando {progresso.feitos} de {progresso.total}... não feche a
            tela.
          </p>
        </div>
      )}

      {erro && (
        <p className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      )}
      {sucesso && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          ✅ {sucesso}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || arquivos.length === 0}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
      >
        {enviando ? "Enviando..." : "Enviar"}
      </button>
    </form>
  );
}
