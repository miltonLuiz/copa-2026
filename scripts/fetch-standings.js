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
      const selecao = TRADUCAO[linha.team.tla] || TRADUCAO_POR_NOME[linha.team.name];
      if (!selecao) {
        // Fail-loud: time dentro de grupo válido sem mapeamento é erro de dados real
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

  // Log de diagnóstico da estrutura — confirma formato real no log do Actions
  // (sem expor dados sensíveis: o token já é mascarado pelo GitHub)
  console.log('Diagnóstico da resposta:', JSON.stringify({
    season: data.season && { startDate: data.season.startDate, currentMatchday: data.season.currentMatchday },
    blocos: (data.standings || []).map(b => ({ stage: b.stage, type: b.type, group: b.group, times: (b.table || []).length })),
  }));

  let resultado;
  try {
    resultado = construirSaida(data);
  } catch (e) {
    // Erro lançado somente para time não-mapeado dentro de grupo válido
    console.error('Erro ao construir saída:', e.message);
    process.exit(1);
  }

  const { saida, cobertura } = resultado;

  // Cobertura completa → escreve o JSON
  if (cobertura.completo) {
    fs.writeFileSync(CAMINHO, JSON.stringify(saida, null, 2) + '\n');
    console.log('Classificação atualizada:', Object.keys(saida.grupos).length, 'grupos');
    process.exit(0);
  }

  // Cobertura incompleta → estado pré-torneio esperado; preserva sem falhar
  // (grupos extras além de A–L seriam anomalia, mas também preservamos por segurança)
  console.log(
    'Classificação por grupo ainda não publicada pela API' +
    (cobertura.extras.length > 0 ? ' (grupos inesperados: ' + cobertura.extras.join(', ') + ')' : '') +
    ' (montados ' + cobertura.montados + ' de 12 grupos). JSON preservado.'
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}
