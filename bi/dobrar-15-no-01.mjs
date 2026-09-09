// Dobra o bloco do armazem (15) dentro do 01, que e a fonte da verdade.
//
// O 01 comeca com "drop schema if exists bi cascade", entao quem recria
// o esquema do zero rodando so ele PERDERIA a camada do armazem se ela
// morasse apenas no 15. O 15 continua existindo como recorte de colagem
// para quem ja tem o esquema no ar -- mesmo padrao do 09.
//
// O conteudo e copiado byte a byte do 15, e nao reescrito, justamente
// para os dois nao divergirem na primeira correcao.
import { readFileSync, writeFileSync } from "node:fs";

const base = "C:/Projetos/app-colaborador-lima/bi/";
const MARCA = "-- >>> INICIO DO BLOCO DOBRADO DE 15-armazem-e-desafio-no-bi.sql";

const um = readFileSync(base + "01-camada-semantica.sql", "utf8");
const quinze = readFileSync(base + "15-armazem-e-desafio-no-bi.sql", "utf8");

// Idempotente: rodar de novo substitui o bloco em vez de empilhar copias.
const semBloco = um.includes(MARCA) ? um.slice(0, um.indexOf(MARCA)) : um;

const bloco = [
  MARCA,
  "--",
  "-- Copia literal do 15-armazem-e-desafio-no-bi.sql. NAO EDITE AQUI:",
  "-- mexa no 15 e rode `node bi/dobrar-15-no-01.mjs`. Duas verdades",
  "-- sobre a mesma view e pior que uma so imperfeita.",
  "--",
  "-- bi.fato_quiz_resposta e criada duas vezes neste arquivo, e e",
  "-- intencional: a versao de cima e a original e esta a substitui com",
  "-- as colunas `origem` e `chute`. Numa execucao unica do arquivo, a",
  "-- ultima e a que fica.",
  "",
  quinze.trimStart(),
  "",
].join("\n");

writeFileSync(base + "01-camada-semantica.sql", semBloco.trimEnd() + "\n\n" + bloco, "utf8");
console.log("bloco dobrado no 01");
