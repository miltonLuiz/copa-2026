// fetch-standings.js — busca classificação dos grupos na API football-data.org
// e escreve em data/standings.json (relativo à raiz do repo).
// Executado pelo GitHub Actions a cada 6h durante a Copa.
//
// Fonte primária: /standings. Na Copa 2026 a API vem devolvendo esse endpoint
// com um tabelão único de 48 times e group: null (sem a divisão A–L). Quando
// isso acontece, o script cai pro fallback: busca os jogos da fase de grupos
// em /matches (cada jogo traz o campo group, ex: "GROUP_A") e calcula a
// classificação a partir dos resultados.

'use strict';

const fs = require('node:fs');

const ENDPOINT         = 'https://api.football-data.org/v4/competitions/WC/standings?season=2026';
const ENDPOINT_JOGOS   = 'https://api.football-data.org/v4/competitions/WC/matches?season=2026&stage=GROUP_STAGE';
const CAMINHO          = 'data/standings.json';

// ─── Dicionário de tradução: tla → nome PT-BR ────────────────────────────────
// Fonte: /tmp/mapa-traducao-selecoes.txt (validado contra data/standings.json)
const TRADUCAO = {
  MEX: 'México',
  RSA: 'África do Sul',
  KOR: 'Coreia do Sul',
  CZE: 'República Tcheca',
  CAN: 'Canadá',
  BIH: 'Bósnia',
  QAT: 'Catar',
  SUI: 'Suíça',
  BRA: 'Brasil',
  MAR: 'Marrocos',
  HAI: 'Haiti',
  SCO: 'Escócia',
  USA: 'EUA',
  PAR: 'Paraguai',
  AUS: 'Austrália',
  TUR: 'Turquia',
  GER: 'Alemanha',
  CUR: 'Curaçao',
  CIV: 'Costa do Marfim',
  ECU: 'Equador',
  NED: 'Holanda',
  JPN: 'Japão',
  SWE: 'Suécia',
  TUN: 'Tunísia',
  BEL: 'Bélgica',
  EGY: 'Egito',
  IRN: 'Irã',
  NZL: 'Nova Zelândia',
  ESP: 'Espanha',
  CPV: 'Cabo Verde',
  KSA: 'Arábia Saudita',
  URU: 'Uruguai',
  FRA: 'França',
  SEN: 'Senegal',
  IRQ: 'Iraque',
  NOR: 'Noruega',
  ARG: 'Argentina',
  ALG: 'Argélia',
  AUT: 'Áustria',
  JOR: 'Jordânia',
  POR: 'Portugal',
  COD: 'RD Congo',
  UZB: 'Uzbequistão',
  COL: 'Colômbia',
  ENG: 'Inglaterra',
  CRO: 'Croácia',
  PAN: 'Panamá',
  GHA: 'Gana',
};

// Fallback por name EN (invertendo o mapa tla→PT-BR via name EN do mesmo arquivo)
// Cobre casos onde a API muda o tla mas mantém o nome em inglês.
const TRADUCAO_POR_NOME = {
  'Mexico':               'México',
  'South Africa':         'África do Sul',
  'South Korea':          'Coreia do Sul',
  'Czechia':              'República Tcheca',
  'Canada':               'Canadá',
  'Bosnia-Herzegovina':   'Bósnia',
  'Qatar':                'Catar',
  'Switzerland':          'Suíça',
  'Brazil':               'Brasil',
  'Morocco':              'Marrocos',
  'Haiti':                'Haiti',
  'Scotland':             'Escócia',
  'United States':        'EUA',
  'Paraguay':             'Paraguai',
  'Australia':            'Austrália',
  'Turkey':               'Turquia',
  'Türkiye':              'Turquia',   // possível variante futura
  'Germany':              'Alemanha',
  'Curaçao':              'Curaçao',
  'Ivory Coast':          'Costa do Marfim',
  'Ecuador':              'Equador',
  'Netherlands':          'Holanda',
  'Japan':                'Japão',
  'Sweden':               'Suécia',
  'Tunisia':              'Tunísia',
  'Belgium':              'Bélgica',
  'Egypt':                'Egito',
  'Iran':                 'Irã',
  'New Zealand':          'Nova Zelândia',
  'Spain':                'Espanha',
  'Cape Verde Islands':   'Cabo Verde',
  'Cape Verde':           'Cabo Verde',
  'Saudi Arabia':         'Arábia Saudita',
  'Uruguay':              'Uruguai',
  'France':               'França',
  'Senegal':              'Senegal',
  'Iraq':                 'Iraque',
  'Norway':               'Noruega',
  'Argentina':            'Argentina',
  'Algeria':              'Argélia',
  'Austria':              'Áustria',
  'Jordan':               'Jordânia',
  'Portugal':             'Portugal',
  'Congo DR':             'RD Congo',
  'Uzbekistan':           'Uzbequistão',
  'Colombia':             'Colômbia',
  'England':              'Inglaterra',
  'Croatia':              'Croácia',
  'Panama':               'Panamá',
  'Ghana':                'Gana',
};

const GRUPOS_ORDEM = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// ─── Funções puras (exportáveis para testes) ──────────────────────────────────

/**
 * Extrai a letra do grupo a partir de formatos variados da API.
 * Exemplos: "Group A", "GROUP_A", "group a", "GROUP_L" → "A", "L"
 *
 * Retorna null (sem lançar) quando group é null/undefined ou não casa a regex.
 * Isso é esperado no período pré-torneio, antes da API publicar as divisões A–L.
 */
function extrairLetra(group) {
  if (group == null) return null;
  const m = String(group).match(/group[_ ]?([a-l])/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

/**
 * Verifica a cobertura dos grupos montados.
 * Retorna um objeto { completo: boolean, montados: number, ausentes: string[], extras: string[] }
 * sem lançar — o chamador decide o que fazer com o resultado.
 *
 * "completo" = true somente quando temos exatamente 12 grupos A–L, cada um com 4 seleções.
 */
function validarCobertura(grupos) {
  const letrasEsperadas = GRUPOS_ORDEM;
  const letrasPresentes = Object.keys(grupos);
  const ausentes = [];
  const extras   = [];

  for (const letra of letrasEsperadas) {
    if (!grupos[letra] || grupos[letra].length !== 4) {
      ausentes.push(letra);
    }
  }

  for (const letra of letrasPresentes) {
    if (!letrasEsperadas.includes(letra)) {
      extras.push(letra);
    }
  }

  const montados = letrasPresentes.filter(l => letrasEsperadas.includes(l) && grupos[l].length === 4).length;
  const completo = ausentes.length === 0 && extras.length === 0;

  return { completo, montados, ausentes, extras };
}

/**
 * Reordena as chaves do objeto seguindo GRUPOS_ORDEM (A..L).
 */
function ordenarPorGrupo(grupos) {
  const ordenado = {};
  for (const letra of GRUPOS_ORDEM) {
    if (grupos[letra]) ordenado[letra] = grupos[letra];
  }
  return ordenado;
}

/**
 * Função pura: recebe o body JSON da API e tenta construir o objeto pronto para salvar.
 *
 * Retorna { saida, cobertura } onde:
 *   - saida: objeto com atualizadoEm + grupos (se cobertura.completo = true), ou null.
 *   - cobertura: resultado de validarCobertura (sempre presente).
 *
 * Lança erro (fail-loud) apenas se um time dentro de um grupo válido (letra != null)
 * não estiver mapeado — isso é erro de dados que precisa de correção no mapa.
 *
 * Blocos sem grupo (group: null) são silenciosamente pulados; são esperados pré-torneio.
 * Grupos extras além de A–L são reportados em cobertura.extras (anomalia, não fatal).
 */
/**
 * Traduz um team da API pro nome PT-BR. Fail-loud: seleção sem mapeamento
 * é erro de dados real que precisa de correção no mapa.
 */
function traduzir(team) {
  const selecao = TRADUCAO[team.tla] || TRADUCAO_POR_NOME[team.name];
  if (!selecao) {
    throw new Error('Seleção não mapeada: tla=' + team.tla + ' / name=' + team.name);
  }
  return selecao;
}

function construirSaida(data) {
  const grupos = {};
  let blocosSemGrupo = 0;

  for (const bloco of data.standings.filter(s => s.type === 'TOTAL')) {
    const letra = extrairLetra(bloco.group);

    // Bloco sem grupo reconhecido: estado pré-torneio esperado — pula sem errar
    if (letra === null) {
      blocosSemGrupo++;
      continue;
    }

    grupos[letra] = (bloco.table || []).map(function(linha) {
      const selecao = traduzir(linha.team);
      return {
        selecao: selecao,
        pos: linha.position,
        p:   linha.points,
        j:   linha.playedGames,
        v:   linha.won,
        e:   linha.draw,
        d:   linha.lost,
        gp:  linha.goalsFor,
        gc:  linha.goalsAgainst,
        sg:  linha.goalDifference,
      };
    }).sort(function(a, b) { return a.pos - b.pos; });
  }

  if (blocosSemGrupo > 0) {
    console.log('Blocos sem grupo (pré-torneio):', blocosSemGrupo);
  }

  const cobertura = validarCobertura(grupos);

  // Só monta saida quando a cobertura está completa
  const saida = cobertura.completo
    ? { atualizadoEm: new Date().toISOString(), grupos: ordenarPorGrupo(grupos) }
    : null;

  return { saida, cobertura };
}

/**
 * Função pura: recebe o body JSON de /matches (fase de grupos) e calcula a
 * classificação a partir dos resultados. Mesmo contrato de construirSaida:
 * retorna { saida, cobertura }.
 *
 * Todos os 72 jogos da fase de grupos já vêm com os times definidos, então os
 * 12 grupos ficam completos mesmo com 0 jogos disputados.
 *
 * Só jogos FINISHED (e AWARDED) contam pontos. Desempate: pontos > saldo >
 * gols pró > nome — aproximação dos critérios FIFA (não cobre confronto
 * direto entre empatados); quando /standings voltar a publicar os grupos,
 * as posições oficiais da API têm precedência no main().
 */
function construirSaidaDeJogos(data) {
  const grupos = {};   // letra → { selecao → linha }
  let jogosSemGrupo = 0;

  for (const jogo of (data.matches || [])) {
    const letra = extrairLetra(jogo.group);
    if (letra === null) {
      jogosSemGrupo++;
      continue;
    }

    if (!grupos[letra]) grupos[letra] = {};
    const tabela = grupos[letra];

    const casa = traduzir(jogo.homeTeam);
    const fora = traduzir(jogo.awayTeam);
    for (const selecao of [casa, fora]) {
      if (!tabela[selecao]) {
        tabela[selecao] = { selecao: selecao, pos: 0, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 };
      }
    }

    const terminou = jogo.status === 'FINISHED' || jogo.status === 'AWARDED';
    const placar = jogo.score && jogo.score.fullTime;
    if (!terminou || !placar || placar.home == null || placar.away == null) continue;

    const lcasa = tabela[casa];
    const lfora = tabela[fora];

    lcasa.j++; lfora.j++;
    lcasa.gp += placar.home; lcasa.gc += placar.away;
    lfora.gp += placar.away; lfora.gc += placar.home;

    if (placar.home > placar.away) {
      lcasa.v++; lcasa.p += 3; lfora.d++;
    } else if (placar.home < placar.away) {
      lfora.v++; lfora.p += 3; lcasa.d++;
    } else {
      lcasa.e++; lfora.e++; lcasa.p++; lfora.p++;
    }
  }

  if (jogosSemGrupo > 0) {
    console.log('Jogos sem grupo reconhecido (ignorados):', jogosSemGrupo);
  }

  const gruposOrdenados = {};
  for (const letra of Object.keys(grupos)) {
    gruposOrdenados[letra] = Object.values(grupos[letra]).map(function(linha) {
      linha.sg = linha.gp - linha.gc;
      return linha;
    }).sort(function(a, b) {
      return (b.p - a.p) || (b.sg - a.sg) || (b.gp - a.gp) || a.selecao.localeCompare(b.selecao, 'pt');
    }).map(function(linha, i) {
      linha.pos = i + 1;
      return linha;
    });
  }

  const cobertura = validarCobertura(gruposOrdenados);

  const saida = cobertura.completo
    ? { atualizadoEm: new Date().toISOString(), grupos: ordenarPorGrupo(gruposOrdenados) }
    : null;

  return { saida, cobertura };
}

// ─── Exporta funções puras para testes externos (não executa main) ────────────
if (require.main !== module) {
  module.exports = { construirSaida, construirSaidaDeJogos, extrairLetra, validarCobertura, TRADUCAO, TRADUCAO_POR_NOME };
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────

/**
 * GET autenticado com tratamento padrão de erro. Retorna o body JSON,
 * null em 404 (recurso ainda não publicado) ou encerra o processo em
 * erro HTTP/rede — nunca loga o token.
 */
async function buscar(url, token, rotulo) {
  let res;
  try {
    res = await fetch(url, { headers: { 'X-Auth-Token': token } });
  } catch (e) {
    console.error('Falha no fetch (' + rotulo + '):', e.message);
    process.exit(1);
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    console.error('Erro da API (' + rotulo + '): status HTTP ' + res.status);
    process.exit(1);
  }

  try {
    return await res.json();
  } catch (e) {
    console.error('Falha no parse (' + rotulo + '):', e.message);
    process.exit(1);
  }
}

function escrever(saida) {
  fs.writeFileSync(CAMINHO, JSON.stringify(saida, null, 2) + '\n');
  console.log('Classificação atualizada:', Object.keys(saida.grupos).length, 'grupos');
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error('FOOTBALL_DATA_TOKEN ausente. Defina a variável de ambiente antes de executar.');
    process.exit(1);
  }

  // ── Fonte primária: /standings (traz as posições oficiais da API) ──────────
  const data = await buscar(ENDPOINT, token, 'standings');

  if (data && data.standings && data.standings.length > 0) {
    // Log de diagnóstico da estrutura — confirma formato real no log do Actions
    console.log('Diagnóstico de /standings:', JSON.stringify({
      season: data.season && { startDate: data.season.startDate, currentMatchday: data.season.currentMatchday },
      blocos: data.standings.map(b => ({ stage: b.stage, type: b.type, group: b.group, times: (b.table || []).length })),
    }));

    let resultado;
    try {
      resultado = construirSaida(data);
    } catch (e) {
      // Erro lançado somente para time não-mapeado dentro de grupo válido
      console.error('Erro ao construir saída de /standings:', e.message);
      process.exit(1);
    }

    if (resultado.cobertura.completo) {
      escrever(resultado.saida);
      process.exit(0);
    }

    console.log(
      '/standings sem a divisão por grupos (montados ' + resultado.cobertura.montados +
      ' de 12). Caindo pro fallback via /matches.'
    );
  } else {
    console.log('/standings indisponível ou vazio. Caindo pro fallback via /matches.');
  }

  // ── Fallback: calcula a classificação a partir dos jogos da fase de grupos ─
  const dataJogos = await buscar(ENDPOINT_JOGOS, token, 'matches');

  if (!dataJogos || !dataJogos.matches || dataJogos.matches.length === 0) {
    console.log('/matches também indisponível. JSON preservado.');
    process.exit(0);
  }

  console.log('Diagnóstico de /matches:', JSON.stringify({
    total: dataJogos.matches.length,
    finalizados: dataJogos.matches.filter(m => m.status === 'FINISHED' || m.status === 'AWARDED').length,
    exemploGroup: dataJogos.matches[0] && dataJogos.matches[0].group,
  }));

  let resultado;
  try {
    resultado = construirSaidaDeJogos(dataJogos);
  } catch (e) {
    console.error('Erro ao construir saída de /matches:', e.message);
    process.exit(1);
  }

  const { saida, cobertura } = resultado;

  if (cobertura.completo) {
    escrever(saida);
    process.exit(0);
  }

  // Cobertura incompleta nas duas fontes → preserva sem falhar
  console.log(
    'Classificação por grupo indisponível nas duas fontes' +
    (cobertura.extras.length > 0 ? ' (grupos inesperados: ' + cobertura.extras.join(', ') + ')' : '') +
    ' (montados ' + cobertura.montados + ' de 12 grupos via /matches). JSON preservado.'
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}
