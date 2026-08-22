/**
 * A marca do App do Colaborador.
 *
 * Um "C" desenhado como o ciclo da rota: sai, entrega e volta -- e o
 * ultimo trecho vira dourado e termina em ponta, porque o ciclo sempre
 * avanca. Nao fecha de proposito.
 *
 * Ela identifica o APP, nao a empresa. A logo da revenda e conteudo: sobe
 * pelo Admin (Revendas) e aparece no cabecalho no lugar desta. Aqui a
 * marca e o que sobra quando nao ha logo -- e e tambem o que aparece nas
 * telas anteriores ao login, quando ainda nao se sabe de qual revenda a
 * pessoa e.
 *
 * SVG embutido, e nao <img>: some uma requisicao do carregamento de toda
 * tela, fica nitido em qualquer tamanho e nao pisca antes de aparecer.
 * Os mesmos numeros estao em scripts/gerar-icones.mjs, que produz os PNGs
 * do icone instalado -- mexeu aqui, rode o script.
 */
export function MarcaApp({
  tamanho = 40,
  variante = "clara",
  className,
}: {
  tamanho?: number;
  /** "clara": so a marca, para fundo escuro. "ladrilho": com o quadrado azul. */
  variante?: "clara" | "ladrilho";
  className?: string;
}) {
  const comFundo = variante === "ladrilho";

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="App do Colaborador"
    >
      {comFundo && <rect width="100" height="100" rx="22" fill="#0b4da2" />}
      {/* O ouro vem primeiro e o branco por cima: a emenda entre os dois
          fica coberta pela tampa redonda do traco branco. */}
      <path
        d="M 39.06 80.07 A 32 32 0 0 0 66 77.71"
        fill="none"
        stroke="#ffc72c"
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path
        d="M 68.35 23.79 A 32 32 0 1 0 39.06 80.07"
        fill="none"
        stroke={comFundo ? "#fff" : "currentColor"}
        strokeWidth="15"
        strokeLinecap="round"
      />
      <path d="M 79.86 69.71 L 72.50 88.97 L 59.50 66.45 Z" fill="#ffc72c" />
    </svg>
  );
}
