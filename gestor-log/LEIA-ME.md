# Gestor LOG online

`gestor-log.html` é o Gestor LOG servido em `/gestor-log` (rota `src/app/gestor-log/route.ts`).

- **Não editar à mão.** É gerado pelo `gerar.js` do Gestor LOG (pasta `Planner de Rotas\fonte` na Área de Trabalho), com `montarHtml(base, { online: '<este arquivo>' })`. Sai sem a base embutida e com a marca `<!--__NUVEM__-->`, que a rota troca pela configuração da sessão.
- Os dados vêm da base compartilhada: tabela `gestor_log_dados` + bucket privado `gestor-log` (migration 182), por `/api/gestor-log`. O lado do navegador é o `app-nuvem.js` do Gestor LOG.
- Para publicar uma versão nova do Gestor LOG: gerar este arquivo de novo, commitar e dar push.
