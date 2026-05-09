---
name: desenvolver-etapa
description: Orquestra uma etapa completa de desenvolvimento do projeto Copa 2026 — planner → developer → reviewer → commit → push → PR. Use quando o Milton descrever uma etapa nova ("vamos fazer o filtro por horário", "implementa o contador regressivo", etc).
---

# Desenvolver uma etapa do projeto Copa 2026

Skill de orquestração. Invocada quando o Milton pede pra trabalhar numa etapa nova do projeto.

## Fluxo

### 1. Confirmar a etapa

Antes de começar, confirme com o Milton em uma frase qual é a etapa. Se a descrição estiver vaga, peça clareza.

### 2. Planejar

Invoque o agente `planner` com a descrição da etapa.

Aguarde o plano completo. Mostre o plano pro Milton e **pergunte se ele aprova**. Se ele pedir ajustes, repita o planner com o feedback. Não vá pro próximo passo sem aprovação explícita.

### 3. Criar a branch

Depois do plano aprovado, crie a branch sugerida no plano:

```bash
git checkout main
git pull
git checkout -b <branch-do-plano>
```

### 4. Desenvolver

Invoque o agente `developer` com o plano aprovado como input.

### 5. Revisar

Invoque o agente `reviewer` com o plano e o estado dos arquivos depois do developer.

Mostre o relatório do reviewer pro Milton.

- Se **REPROVADO** ou **APROVADO COM RESSALVAS**: volte pro developer com as correções pedidas. Repita até **APROVADO**.
- Se **APROVADO**: siga.

### 6. Commitar

Faça commit(s) com mensagens no padrão do `CLAUDE.md`:

```bash
git add -A
git commit -m "<tipo>: <descrição curta>"
```

### 7. Push e PR

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> \
  --title "<título>" \
  --body "<descrição detalhada>"
```

A descrição do PR deve ter, no mínimo:

- **O que foi feito** — bullet list do que a etapa entrega
- **Decisões importantes** — escolhas de design que valem nota
- **Como testar** — passos pro Milton verificar
- **Critérios de aceitação** — colar do plano, marcando cada um como cumprido

### 8. Parar e esperar

**NÃO faça merge.** Reporte pro Milton o link do PR e espere o comando dele pra revisar/mergear.

## Princípios

- Cada etapa = uma branch = um PR. Não acumule.
- Se a etapa cresceu durante o trabalho, pause e proponha quebrar em duas.
- Sempre passe pelos 3 agents nesta ordem. Não pule o reviewer.
- Mensagens, plano, código e PR — tudo em português.
