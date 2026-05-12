# Copa 2026 — Filtro de Jogos por Horário

Um app web simples pra acompanhar a Copa do Mundo de 2026 (EUA, México e Canadá) sem se perder nos horários.

🔗 **Acesse**: https://miltonluiz.github.io/copa-2026/

## Por que existe

A Copa de 2026 é a primeira com 48 seleções e 104 jogos. Como as partidas acontecem em três fusos diferentes nos Estados Unidos, do Brasil isso vira jogo pulverizado em até 16 horários no mesmo dia, alguns deles de madrugada. Tabela em texto não resolve.

A ideia aqui é poder responder rápido perguntas como:

- Quais jogos têm às 19h?
- O que vai passar de madrugada esse fim de semana?
- Quando o Brasil joga?
- Quais jogos do mata-mata caem em horário comercial?

## Pra quem é

Pra mim e pros amigos com quem vou compartilhar o link no WhatsApp. Não é produto, não tem login, não tem propaganda, não tem placar ao vivo.

## Como usar

1. Abrir https://miltonluiz.github.io/copa-2026/ no celular ou desktop.
2. Filtrar pelos chips de horário, fase ou atalhos rápidos.
3. Buscar por nome de seleção no campo de busca (sem acento, parcial).
4. Instalar como app na tela inicial via banner (Android) ou tutorial (iOS Safari).

## Funcionalidades

- ✅ 104 jogos da Copa 2026 com horários em Brasília
- ✅ Agrupamento por dia, ordenação cronológica
- ✅ Filtros combinados: horário, fase, seleção, atalhos rápidos
- ✅ Busca por nome de seleção (case-insensitive, sem acento)
- ✅ Atalhos: Jogos hoje, Brasil, Fins de semana, Tarde/Noite/Madrugada
- ✅ Destaque visual dos jogos do Brasil
- ✅ Badge "HOJE" no dia atual em fuso de Brasília
- ✅ Contador regressivo dinâmico até a abertura
- ✅ Funciona offline (PWA com service worker)
- ✅ Instalável na tela inicial via banner customizado

## Stack

- HTML + CSS + JavaScript vanilla
- Arquivo único (`index.html`), sem build step, sem dependências externas
- Service Worker pra suporte offline (estratégia cache-first)
- `manifest.json` pro PWA
- Hospedado no GitHub Pages com HTTPS automático

Convenções técnicas no [`CLAUDE.md`](./CLAUDE.md).

## Status

Em produção. A Copa começa em 11 de junho de 2026.

## Roadmap

**Fase 2** (após o MVP): atualização automática do dataset via GitHub Actions, pra preencher horários do mata-mata conforme a FIFA divulga e mostrar placares de jogos finalizados.
