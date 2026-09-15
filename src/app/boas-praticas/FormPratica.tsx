import Link from "next/link";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { CAMPOS_DA_PRATICA, LIMITES, type DadosDaPratica } from "@/lib/boas-praticas";
import { editarPratica, enviarPratica } from "./actions";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * A sugestão. Os limites de tamanho vêm de LIMITES -- os mesmos que a ação
 * confere e que a migration trava --, então o navegador recusa antes o que
 * o servidor recusaria depois, e ninguém perde o texto que digitou.
 */
export function FormPratica({ pratica }: { pratica?: DadosDaPratica & { id: string } }) {
  const editando = Boolean(pratica);

  return (
    <form action={editando ? editarPratica : enviarPratica} className="space-y-4">
      {pratica && <input type="hidden" name="id" value={pratica.id} />}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={rotulo} htmlFor="titulo">
            Nome da prática
          </label>
          <input
            id="titulo"
            name="titulo"
            required
            minLength={LIMITES.tituloMin}
            maxLength={LIMITES.tituloMax}
            defaultValue={pratica?.titulo}
            placeholder="Ex: Canetinha para o palmtop"
            className={campo}
          />
        </div>

        {CAMPOS_DA_PRATICA.map((c) => (
          <div key={c.nome}>
            <label className={rotulo} htmlFor={c.nome}>
              {c.rotulo}
            </label>
            <p className="mb-1 text-sm font-medium text-slate-700">{c.pergunta}</p>
            <textarea
              id={c.nome}
              name={c.nome}
              rows={3}
              required
              minLength={LIMITES.textoMin}
              maxLength={LIMITES.textoMax}
              defaultValue={pratica?.[c.nome]}
              placeholder={`Ex: ${c.exemplo}`}
              className={campo}
            />
          </div>
        ))}

        <div>
          <label className={rotulo} htmlFor="foto">
            Foto (opcional)
          </label>
          <input id="foto" name="foto" type="file" accept="image/*" capture="environment" className={campo} />
          <p className="mt-1 text-xs text-slate-400">
            {editando
              ? "Envie uma foto só se quiser trocar a atual."
              : "O problema ou a prática funcionando ajudam a liderança e os colegas a entender."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoEnviar
          textoEnviando="Enviando..."
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark"
        >
          {editando ? "Salvar alterações" : "💡 Enviar minha prática"}
        </BotaoEnviar>
        {editando && (
          <Link
            href="/boas-praticas?aba=minhas"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50 sm:w-auto"
          >
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
