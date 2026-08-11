import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // O padrao acima so pega o .next da raiz. Uma worktree de trabalho
    // dentro do repo traz o proprio build junto, e sem isto o `npm run
    // lint` gastava minutos apontando erro em codigo gerado.
    "**/.next/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
