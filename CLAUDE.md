# CLAUDE.md — Guia técnico do projeto

Este arquivo é a fonte de verdade técnica do projeto, voltado pro próprio Claude e pra qualquer dev que pegue o código.

## Visão geral

App estático (PWA) que exibe os 104 jogos da Copa 2026 com filtros por horário, fase e seleção. Sem framework, sem build step, sem backend.

A especificação completa fica em `.claude/doc/projetocopa2026.md` (não versionada — só local).

## Stack

- HTML + CSS + JS vanilla, em arquivo único (`index.html`)
- Service Worker pra suporte offline
- `manifest.json` pro PWA
- Hospedagem: GitHub Pages (HTTPS automático)

## Estrutura

```
copa-2026/
├── index.html           # app completo (Fase 1)
├── manifest.json        # PWA manifest
├── sw.js                # service worker
├── icons/               # ícones do PWA
├── data/                # matches.json / standings.json (dados finais da Copa)
├── .claude/             # configuração local de agents/skills (versionada)
│   ├── agents/          # subagents (planner, developer, reviewer)
│   ├── skills/          # orquestrador (desenvolver-etapa)
│   └── doc/             # especificação local — IGNORADA pelo git
├── README.md
├── CLAUDE.md
└── .gitignore
```

## Gitflow

Fluxo simples baseado em branches por etapa, com PR pra `main`. Sem dev/release/hotfix complicado.

- **`main`** — sempre verde. Reflete a versão deployada.
- **Branches de etapa** — uma por unidade lógica de trabalho. Nomenclatura:
  - `feat/<slug>` — feature nova (ex: `feat/contador-regressivo`)
  - `fix/<slug>` — correção de bug (ex: `fix/horario-tbd-ordenacao`)
  - `chore/<slug>` — manutenção, infra, build (ex: `chore/atualizar-icones`)
  - `docs/<slug>` — só documentação (ex: `docs/atualizar-readme`)
- **PRs** — toda branch volta pra `main` via PR. Descrição obrigatória explicando: o que foi feito, decisões importantes, como testar.
- **Sem auto-merge.** Milton aprova e faz o merge manualmente.
- **Setup inicial** foi a única exceção: commit direto na `main` pra subir o esqueleto.

### Convenções de commit

Mensagens curtas em português, no presente do indicativo:

- `feat: filtro por fase com multi-seleção`
- `fix: ordenação correta de jogos TBD`
- `docs: atualizar README com link de produção`
- `style: ajustar contraste do destaque do Brasil`
- `chore: bumpar CACHE_NAME pra v3`

## Fluxo de desenvolvimento com agents

Cada etapa de desenvolvimento passa por 3 agents, orquestrados pela skill `desenvolver-etapa` (em `.claude/skills/desenvolver-etapa/SKILL.md`):

1. **`planner`** — recebe a descrição da etapa, lê a spec em `.claude/doc/`, e produz um plano detalhado: arquivos a tocar, decisões de design, critérios de aceitação. Não escreve código.
2. **`developer`** — implementa seguindo o plano. Não desvia sem motivo.
3. **`reviewer`** — confere se o que foi feito bate com o plano e os critérios de aceitação. Não escreve código.

Depois disso: commit → push da branch → abre PR → **espera comando do Milton** pra revisar/mergear. Não mergeia sozinho.

Pra disparar o fluxo, basta o Milton descrever a etapa que a skill `desenvolver-etapa` orquestra os 3 agents na ordem.

## Convenções de código (Fase 1)

- HTML semântico. `<button>` reais pros filtros (não `<div>` com `onClick`).
- CSS com variáveis (`--bg`, `--accent`, etc.) pra paleta. Seguir `.claude/doc/projetocopa2026.md` § 4.2.
- JS sem dependências externas. ES modules não são necessários — script único é mais simples.
- Acessibilidade: contraste WCAG AA, foco visível, `aria-pressed` em chips ativos.
- Mobile-first. Testar em 360px, 768px, 1280px.
- Fuso de Brasília (UTC−3) explícito ao calcular "hoje" — não confiar no fuso do dispositivo.

## PWA — atualizar cache ao mudar conteúdo

Sempre que o `index.html` mudar, **bumpar `CACHE_NAME`** em `sw.js` (`copa2026-v1` → `copa2026-v2` etc). Senão usuários continuam vendo a versão antiga em cache.

## Deploy

GitHub Pages, branch `main`, root. Configurado em Settings → Pages depois do primeiro push.

URL de produção esperada: `https://miltonluiz.github.io/copa-2026/`.

## Atualizar a especificação local

A spec mora em `.claude/doc/projetocopa2026.md` e é **só local** (gitignorada). Quando uma decisão importante mudar (paleta, escopo, fluxo de trabalho), atualizar esse arquivo pra continuar sendo a fonte de verdade do projeto.
