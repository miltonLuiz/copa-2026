// fetch-standings.js — busca classificação dos grupos na API football-data.org
// e escreve em data/standings.json (relativo à raiz do repo).
// Executado pelo GitHub Actions a cada 6h durante a Copa.

'use strict';

const fs = require('node:fs');

const ENDPOINT = 'https://api.football-data.org/v4/competitions/WC/standings?season=2026';
const CAMINHO  = 'data/standings.json';

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
 */
function extrairLetra(groupStr) {
  const m = String(groupStr).match(/group[_ ]?([a-l])/i);
  if (!m) throw new Error('Formato de grupo não reconhecido: ' + groupStr);
  return m[1].toUpperCase();
}

/**
 * Valida que temos exatamente 12 grupos (A–L) com 4 seleções cada.
 * Lança erro se a cobertura for incompleta — assim o arquivo não é escrito parcialmente.
 */
function validarCobertura(grupos) {
  const letrasEsperadas = GRUPOS_ORDEM;
  const letrasPresentes = Object.keys(grupos);

  for (const letra of letrasEsperadas) {
    if (!grupos[letra]) {
      throw new Error('Grupo ' + letra + ' ausente na resposta da API.');
    }
    if (grupos[letra].length !== 4) {
      throw new Error('Grupo ' + letra + ' tem ' + grupos[letra].length + ' seleções (esperado: 4).');
    }
  }

  // Sem grupos extras inesperados
  for (const letra of letrasPresentes) {
    if (!letrasEsperadas.includes(letra)) {
      throw new Error('Grupo inesperado na resposta: ' + letra);
    }
  }
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
 * Função pura: recebe o body JSON da API e devolve o objeto pronto para salvar.
 * Lança erro (fail-loud) se qualquer seleção não for mapeada ou a cobertura for incompleta.
 */
function construirSaida(data) {
  const grupos = {};

  for (const bloco of data.standings.filter(s => s.type === 'TOTAL')) {
    const letra = extrairLetra(bloco.group);

    grupos[letra] = bloco.table.map(function(linha) {
      const selecao = TRADUCAO[linha.team.tla] || TRADUCAO_POR_NOME[linha.team.name];
      if (!selecao) {
        throw new Error(
          'Seleção não mapeada: tla=' + linha.team.tla + ' / name=' + linha.team.name
        );
      }
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

  // Falha se a cobertura for incompleta — não escreve JSON parcial
  validarCobertura(grupos);

  return {
    atualizadoEm: new Date().toISOString(),
    grupos: ordenarPorGrupo(grupos),
  };
}

// ─── Exporta funções puras para testes externos (não executa main) ────────────
if (require.main !== module) {
  module.exports = { construirSaida, extrairLetra, validarCobertura, TRADUCAO, TRADUCAO_POR_NOME };
}

// ─── Ponto de entrada ─────────────────────────────────────────────────────────
async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error('FOOTBALL_DATA_TOKEN ausente. Defina a variável de ambiente antes de executar.');
    process.exit(1);
  }

  let data;
  try {
    const res = await fetch(ENDPOINT, {
      headers: { 'X-Auth-Token': token },
    });

    // 404 = competição ainda não tem standings (pré-Copa); preserva o JSON atual
    if (res.status === 404) {
      console.log('Standings ainda não disponível (404). JSON preservado.');
      process.exit(0);
    }

    // Qualquer outro erro HTTP — nunca loga o token
    if (!res.ok) {
      console.error('Erro da API: status HTTP ' + res.status);
      process.exit(1);
    }

    data = await res.json();
  } catch (e) {
    console.error('Falha no fetch/parse:', e.message);
    process.exit(1);
  }

  // Array vazio = competição existe mas ainda sem standings; preserva o JSON atual
  if (!data.standings || data.standings.length === 0) {
    console.log('Sem standings disponíveis. JSON preservado.');
    process.exit(0);
  }

  let saida;
  try {
    saida = construirSaida(data);
  } catch (e) {
    console.error('Erro ao construir saída:', e.message);
    process.exit(1);
  }

  fs.writeFileSync(CAMINHO, JSON.stringify(saida, null, 2) + '\n');
  console.log('Classificação atualizada:', Object.keys(saida.grupos).length, 'grupos');
}

if (require.main === module) {
  main();
}
