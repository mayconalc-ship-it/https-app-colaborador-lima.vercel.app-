// Dobra os recortes de colagem (15, 17...) dentro do 01, que e a
// fonte da verdade.
//
// O 01 comeca com "drop schema if exists bi cascade", entao quem recria
// o esquema do zero rodando so ele PERDERIA o que morasse apenas num
// recorte. Os recortes continuam existindo para quem ja tem o esquema no
// ar -- mesmo padrao do 09.
//
// O conteudo e copiado byte a byte de cada recorte, e nao reescrito,
// justamente para os dois nao divergirem na primeira correcao. A ORDEM da
// lista e a ordem de execucao: o 17 recria fato_atividade em cima das
// views do 15.
//
// O 16 (5S datado pela realizacao, 17/09/2026) NAO entra: ele foi
// aplicado direto nas views do 5S dentro do 01, no lugar delas.
import { readFileSync, writeFileSync } from "node:fs";

const base = "C:/Projetos/app-colaborador-lima/bi/";
const RECORTES = [
  "15-armazem-e-desafio-no-bi.sql",
  "17-chamados-no-bi.sql",
];
// A marca do primeiro recorte e o ponto de corte: tudo dali para baixo e
// refeito a cada rodada.
const marca = (arquivo) => `-- >>> INICIO DO BLOCO DOBRADO DE ${arquivo}`;

const um = readFileSync(base + "01-camada-semantica.sql", "utf8");

// Idempotente: rodar de novo substitui os blocos em vez de empilhar copias.
const corte = um.indexOf(marca(RECORTES[0]));
const semBlocos = corte >= 0 ? um.slice(0, corte) : um;

const blocos = RECORTES.map((arquivo) =>
  [
    marca(arquivo),
    "--",
    `-- Copia literal do ${arquivo}. NAO EDITE AQUI:`,
    "-- mexa no recorte e rode `node bi/dobrar-15-no-01.mjs`. Duas verdades",
    "-- sobre a mesma view e pior que uma so imperfeita.",
    "--",
    "-- Algumas views sao criadas mais de uma vez neste arquivo, e e",
    "-- intencional: a versao de baixo substitui a de cima (ver os",
    "-- comentarios de cada uma no recorte). Numa execucao unica do arquivo,",
    "-- a ultima e a que fica.",
    "",
    readFileSync(base + arquivo, "utf8").trimStart(),
    "",
  ].join("\n"),
);

writeFileSync(
  base + "01-camada-semantica.sql",
  semBlocos.trimEnd() + "\n\n" + blocos.join("\n"),
  "utf8",
);
console.log(`blocos dobrados no 01: ${RECORTES.join(", ")}`);
