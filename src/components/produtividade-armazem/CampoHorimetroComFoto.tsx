const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Foto do horímetro + o campo numérico, juntos. A leitura automática por
 * IA foi removida em 27/08/2026 (pedido do dono): demorava para processar
 * e trazia número errado (sem o ponto decimal ou com dígitos faltando).
 * O operador digita o valor à mão, com a foto como evidência ao lado.
 */
export function CampoHorimetroComFoto({
  nomeFoto,
  nomeHorimetro,
  idFoto,
  idHorimetro,
  labelFoto,
  labelHorimetro,
  min,
}: {
  nomeFoto: string;
  nomeHorimetro: string;
  idFoto: string;
  idHorimetro: string;
  labelFoto: string;
  labelHorimetro: string;
  min?: number;
}) {
  return (
    <>
      <div>
        <label className={rotulo} htmlFor={idFoto}>
          {labelFoto}
        </label>
        <input
          id={idFoto}
          name={nomeFoto}
          type="file"
          accept="image/*"
          capture="environment"
          required
          className={campo}
        />
      </div>

      <div>
        <label className={rotulo} htmlFor={idHorimetro}>
          {labelHorimetro}
        </label>
        <input
          id={idHorimetro}
          name={nomeHorimetro}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={min}
          required
          className={campo}
        />
      </div>
    </>
  );
}
