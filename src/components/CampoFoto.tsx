"use client";

import { useEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { Camera, X } from "lucide-react";
import { CameraNoApp } from "@/components/CameraNoApp";
import { reduzir } from "@/lib/reduzir-foto";

/** Abaixo disto a foto já passa folgada no limite e não é mexida. */
const REDUZIR_ACIMA_DE = 1024 * 1024;

const precisaReduzir = (a: File) => a.type.startsWith("image/") && a.size > REDUZIR_ACIMA_DE;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * CAMPO DE FOTO QUE JÁ ENVIA REDUZIDA (01/10/2026).
 *
 * Um <input type="file"> comum, com uma diferença: ao escolher a foto, ela
 * é reduzida ali no celular e TROCADA dentro do próprio campo. O
 * formulário e a ação do servidor seguem iguais -- o FormData lê o
 * arquivo do campo, e o arquivo do campo já é o pequeno.
 *
 * Enquanto reduz (meio segundo, em geral), o campo fica "inválido": se a
 * pessoa tocar em Salvar nesse instante, o navegador segura o envio em
 * vez de mandar a foto original de 6 MB que a Vercel recusaria.
 *
 * CÂMERA DENTRO DO APP (03/10/2026). Campo com `capture` (o que abre a
 * câmera) agora abre a câmera DO APP -- a mesma do Check de Manutenção.
 * No Android com pouca memória, a câmera do aparelho fazia o sistema
 * fechar o navegador, e a pessoa voltava para uma tela recarregada, sem
 * a foto e sem o que já tinha preenchido. A foto tirada entra no MESMO
 * campo do formulário: nenhuma ação do servidor precisou mudar.
 */
export function CampoFoto(props: Props) {
  if (props.capture) return <CampoFotoComCamera {...props} />;
  return <CampoArquivo {...props} />;
}

/** O campo simples (galeria/arquivo), com a redução no celular. */
function CampoArquivo({ onChange, ...props }: Props) {
  return <input {...props} type="file" onChange={(e) => reduzirNoCampo(e, onChange)} />;
}

async function reduzirNoCampo(e: ChangeEvent<HTMLInputElement>, onChange?: Props["onChange"]) {
  onChange?.(e);

  const campo = e.currentTarget;
  const escolhidos = Array.from(campo.files ?? []);

  // Marca desta escolha: se a pessoa trocar a foto enquanto a anterior
  // reduz, só a última pode gravar no campo e liberar o envio.
  const vez = String(Date.now() + Math.random());
  campo.dataset.preparo = vez;
  campo.setCustomValidity("");

  if (typeof DataTransfer === "undefined" || !escolhidos.some(precisaReduzir)) return;

  campo.setCustomValidity("Preparando a foto, aguarde um instante...");
  try {
    const prontos = await Promise.all(
      escolhidos.map((a) => (precisaReduzir(a) ? reduzir(a, `${a.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`) : a)),
    );
    if (campo.dataset.preparo !== vez) return;
    const dt = new DataTransfer();
    prontos.forEach((a) => dt.items.add(a));
    campo.files = dt.files;
  } catch {
    // Fica a original; o servidor avisa se passar do limite.
  } finally {
    if (campo.dataset.preparo === vez) campo.setCustomValidity("");
  }
}

/**
 * O campo com a câmera do app: um quadradinho com o ícone da câmera e,
 * depois da foto, a miniatura com "trocar" e "tirar". O <input> de verdade
 * continua no formulário (escondido) -- é dele que o envio lê a foto, e é
 * ele que o `required` do navegador confere.
 */
function CampoFotoComCamera({ onChange, className, multiple, capture, ...props }: Props) {
  void className;
  void capture;
  const campo = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [previas, setPrevias] = useState<{ url: string; nome: string }[]>([]);
  const maximo = multiple ? 4 : 1;

  // A miniatura acompanha o que está NO CAMPO -- inclusive quando o
  // formulário é limpo depois de salvar (reset ou o FormNoLugar).
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    // As antigas são liberadas pela limpeza do efeito de baixo.
    const sincronizar = () => setPrevias(Array.from(el.files ?? []).map((f) => ({ url: URL.createObjectURL(f), nome: f.name })));
    const aoResetar = () => setTimeout(sincronizar, 0);
    el.addEventListener("change", sincronizar);
    el.form?.addEventListener("reset", aoResetar);
    return () => {
      el.removeEventListener("change", sincronizar);
      el.form?.removeEventListener("reset", aoResetar);
    };
  }, []);

  useEffect(() => () => previas.forEach((p) => URL.revokeObjectURL(p.url)), [previas]);

  function colocarNoCampo(arquivos: File[]) {
    const el = campo.current;
    if (!el || typeof DataTransfer === "undefined") return;
    const dt = new DataTransfer();
    arquivos.slice(0, maximo).forEach((a) => dt.items.add(a));
    el.files = dt.files;
    // O evento avisa quem escuta o campo (a miniatura e o onChange de fora).
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function tirou(foto: File) {
    const atuais = multiple ? Array.from(campo.current?.files ?? []) : [];
    colocarNoCampo([...atuais, foto]);
  }

  function remover(i: number) {
    const atuais = Array.from(campo.current?.files ?? []);
    atuais.splice(i, 1);
    colocarNoCampo(atuais);
  }

  const restantes = maximo - previas.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        {...props}
        ref={campo}
        type="file"
        multiple={multiple}
        // Escondido, mas no formulário: sr-only (e não display:none) para o
        // navegador ainda conseguir apontar o "campo obrigatório".
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => reduzirNoCampo(e, onChange)}
      />
      {previas.map((p, i) => (
        <div key={p.url} className="relative h-20 w-20">
          {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
          <img src={p.url} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
          <button
            type="button"
            onClick={() => remover(i)}
            aria-label="Tirar esta foto"
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      {restantes > 0 ? (
        <button
          type="button"
          onClick={() => setCamera(true)}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/40 text-primary-dark transition hover:bg-primary-soft active:scale-95"
          aria-label="Tirar foto"
        >
          <Camera size={24} strokeWidth={1.8} aria-hidden />
          <span className="text-[10px] font-semibold">Foto</span>
        </button>
      ) : (
        !multiple && (
          <button type="button" onClick={() => setCamera(true)} className="text-xs font-semibold text-primary hover:underline">
            Trocar a foto
          </button>
        )
      )}
      {camera && (
        <CameraNoApp
          restantes={multiple ? restantes : 1}
          aoTirar={multiple ? tirou : (f) => colocarNoCampo([f])}
          aoFechar={() => setCamera(false)}
        />
      )}
    </div>
  );
}
