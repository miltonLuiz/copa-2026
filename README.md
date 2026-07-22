# Copa 2026 — Tabela de Jogos

Um app web simples pra acompanhar a Copa do Mundo de 2026 (EUA, México e Canadá) sem se perder nos horários — agora com placares ao vivo e classificação dos grupos.

🔗 **Acesse**: https://miltonluiz.github.io/copa-2026/

## Por que existe

A Copa de 2026 é a primeira com 48 seleções e 104 jogos. Como as partidas acontecem em três fusos diferentes nos Estados Unidos, do Brasil isso vira jogo pulverizado em até 16 horários no mesmo dia, alguns deles de madrugada. Tabela em texto não resolve.

A ideia aqui é poder responder rápido perguntas como:

- Quais jogos têm às 19h?
- O que vai passar de madrugada esse fim de semana?
- Quando o Brasil joga?
- Quais jogos do mata-mata caem em horário comercial?
- Como está a classificação do grupo?

## Pra quem é

Pra mim e pros amigos com quem compartilho o link no WhatsApp. Não é produto, não tem login, não tem propaganda.

## Como usar

1. Abrir https://miltonluiz.github.io/copa-2026/ no celular ou desktop.
2. Na aba **Jogos**, filtrar pelos chips de horário, fase ou atalhos rápidos.
3. Buscar por nome de seleção no campo de busca (sem acento, parcial).
4. Os dias já encerrados ficam recolhidos num collapse no topo — é só clicar em "Dias encerrados" pra ver os jogos anteriores.
5. Na aba **Grupos**, acompanhar a classificação atualizada de cada grupo.
6. Instalar como app na tela inicial via banner (Android) ou tutorial (iOS Safari).

## Funcionalidades

- ✅ 104 jogos da Copa 2026 com horários em Brasília
- ✅ Agrupamento por dia, ordenação cronológica
- ✅ Filtros combinados: horário, fase, seleção, atalhos rápidos
- ✅ Busca por nome de seleção (case-insensitive, sem acento)
- ✅ Atalhos: Jogos hoje, Brasil, Fins de semana, Tarde/Noite/Madrugada
- ✅ Destaque visual dos jogos do Brasil
- ✅ Badge "HOJE" no dia em andamento (primeiro dia ainda não encerrado)
- ✅ Collapse que recolhe os dias já encerrados, mostrando por padrão o dia atual e os próximos
- ✅ Placares ao vivo e status dos jogos (ao vivo / encerrado)
- ✅ Aba de Grupos com a classificação atualizada (pontos, saldo, gols)
- ✅ Funciona offline (PWA com service worker)
- ✅ Instalável na tela inicial via banner customizado

## Stack

- HTML + CSS + JavaScript vanilla
- Arquivo único (`index.html`), sem build step, sem dependências externas
- Service Worker pra suporte offline (estratégia cache-first)
- `manifest.json` pro PWA
- Dados em `data/matches.json` e `data/standings.json` (resultados finais da Copa)
- Hospedado no GitHub Pages com HTTPS automático

Convenções técnicas no [`CLAUDE.md`](./CLAUDE.md).

## Status

Copa encerrada (11 de junho — 19 de julho de 2026). O dataset reflete os resultados finais; a atualização automática foi desligada ao fim do torneio.

## Roadmap

**Fase 2 — concluída e encerrada**: durante o torneio, o dataset era atualizado automaticamente via GitHub Actions (placares ao vivo, classificação dos grupos e mata-mata). Com a Copa encerrada, a automação foi removida e os dados ficaram congelados no estado final.
