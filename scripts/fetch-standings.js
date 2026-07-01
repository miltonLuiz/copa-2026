// fetch-standings.js — busca classificação dos grupos na API football-data.org
// e escreve em data/standings.json (relativo à raiz do repo).
// Também busca todos os 104 jogos em /matches e grava data/matches.json.
// Executado pelo GitHub Actions a cada 30min durante a Copa.
//
// Fonte primária: /standings. Na Copa 2026 a API vem devolvendo esse endpoint
// com um tabelão único de 48 times e group: null (sem a divisão A–L). Quando
// isso acontece, o script cai pro fallback: reutiliza a resposta de /matches já
// buscada no início (cada jogo de grupo traz o campo group, ex: "GROUP_A") e
// calcula a classificação a partir dos resultados.
//
// Mescla sticky (mesclarMatches):
//   A API às vezes devolve um jogo FINISHED com score.fullTime null e, na
//   chamada seguinte, o placar volta. Para evitar flip-flop de placares e
//   commits inúteis, cada execução mescla os jogos novos com os salvos em
//   disco usando a regra "só avança, nunca regride": status e placar já
//   gravados não são rebaixados por valores null/anteriores.
//
// Só grava se mudou:
//   matches.json e standings.json só são reescritos quando o conteúdo
//   relevante (jogos / grupos) muda em relação ao arquivo em disco. Isso
//   elimina commits de "atualizadoEm" sem diferença real de dados.

'use strict';

const fs = require('node:fs');

const ENDPOINT         = 'https://api.football-data.org/v4/competitions/WC/standings?season=2026';
const ENDPOINT_MATCHES = 'https://api.football-data.org/v4/competitions/WC/matches?season=2026';
const CAMINHO          = 'data/standings.json';
const CAMINHO_MATCHES  = 'data/matches.json';

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

// ─── Constante de ordenação de status ────────────────────────────────────────
// Rank maior = estado mais avançado. Status fora da lista = rank -1.
// CANCELLED/POSTPONED/SUSPENDED nunca ganham de um status salvo (rank -1 < 0).
const ORDEM_STATUS = {
  SCHEDULED: 0,
  TIMED:     0,
  IN_PLAY:   1,
  PAUSED:    1,
  FINISHED:  2,
  AWARDED:   2,
};

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

/**
 * Função pura: percorre os jogos da fase de grupos e acumula penalidades de
 * fair play por seleção. Considera apenas matches com stage === 'GROUP_STAGE'.
 *
 * Penalidades: YELLOW → −1, RED → −3, YELLOW_RED → −4.
 * Tolerante a bookings ausentes/vazios e a booking.team sem nome.
 * Usa traduzir() para normalizar o nome — fail-loud preservado para times
 * mapeáveis mas não mapeados.
 *
 * @param {object} dataMatches - Body JSON de /matches (sem filtro de stage).
 * @returns {{ [selecaoPT]: number }} pontosFP ≤ 0; seleções sem cartão omitidas (default 0 no consumo).
 */
function acumularFairPlay(dataMatches) {
  // A API football-data emite um único evento YELLOW_RED para a expulsão por 2º amarelo,
  // então YELLOW_RED = −4 cobre o caso "amarelo + vermelho no mesmo jogo". Se em algum
  // dado real a API emitir o 1º amarelo (YELLOW) separado do YELLOW_RED, a soma daria −5;
  // como fair play é o 4º critério de desempate (raro), o ajuste fino fica para quando houver
  // expulsões reais nos dados de grupo.
  const PENALIDADE = { YELLOW: -1, RED: -3, YELLOW_RED: -4 };
  const fp = {};

  for (const match of (dataMatches.matches || [])) {
    if (match.stage !== 'GROUP_STAGE') continue;

    for (const booking of (match.bookings || [])) {
      if (!booking.team || !booking.team.name) continue;
      const selecao = traduzir(booking.team);
      const pena = PENALIDADE[booking.card] || 0;
      fp[selecao] = (fp[selecao] || 0) + pena;
    }
  }

  return fp;
}

function construirSaida(data, fairPlay) {
  if (fairPlay === undefined) fairPlay = {};
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
        fp:  fairPlay[selecao] || 0,
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
function construirSaidaDeJogos(data, fairPlay) {
  if (fairPlay === undefined) fairPlay = {};
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
        tabela[selecao] = { selecao: selecao, pos: 0, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, fp: 0 };
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
      linha.fp = fairPlay[linha.selecao] || 0;
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

// Mapeamento de stage da API → rótulo PT-BR para o mata-mata da Copa 2026 (48 times)
const STAGE_ROTULO = {
  LAST_32:       '32-avos',
  LAST_16:       'Oitavas',
  QUARTER_FINALS: 'Quartas',
  SEMI_FINALS:   'Semifinal',
  THIRD_PLACE:   'Terceiro lugar',
  FINAL:         'Final',
};

/**
 * Função pura: recebe o body JSON de /matches (sem filtro de stage — todos os jogos)
 * e retorna o objeto pronto para gravar em data/matches.json.
 *
 * Jogos de grupo: fase = "Grupo X", grupo = letra A–L.
 * Jogos de mata-mata: fase = rótulo PT via STAGE_ROTULO, grupo = null.
 * times indefinidos no mata-mata (homeTeam/awayTeam sem nome): casa/fora = null
 *   — NÃO chama traduzir() nesses casos para não derrubar o job.
 * Time definido mas não-mapeado: continua lançando (fail-loud preservado).
 */
function construirMatches(data) {
  const jogos = (data.matches || []).map(function(match) {
    const letra = extrairLetra(match.group);

    // Determina rótulo de fase
    let fase;
    if (letra !== null) {
      fase = 'Grupo ' + letra;
    } else {
      fase = STAGE_ROTULO[match.stage] || match.stage || 'Desconhecido';
    }

    // Traduz os times — só quando o time tem nome definido
    let casa = null;
    let fora = null;
    const temCasa = match.homeTeam && match.homeTeam.name;
    const temFora = match.awayTeam && match.awayTeam.name;
    if (temCasa) casa = traduzir(match.homeTeam);
    if (temFora) fora = traduzir(match.awayTeam);

    // Placar — fullTime null quando home ou away forem null
    let placar = null;
    if (match.score && match.score.fullTime) {
      const { home, away } = match.score.fullTime;
      if (home !== null && away !== null) {
        placar = { casa: home, fora: away };
      }
    }

    // Pênaltis — só presente quando o mata-mata é decidido nessa disputa.
    // A API grava score.penalties.home/away; ausente/null em qualquer um dos dois
    // lados vira null (jogo decidido no tempo normal ou ainda não finalizado).
    let penaltis = null;
    if (match.score && match.score.penalties &&
        match.score.penalties.home != null && match.score.penalties.away != null) {
      penaltis = { casa: match.score.penalties.home, fora: match.score.penalties.away };
    }

    return {
      id:      match.id,
      fase:    fase,
      grupo:   letra,
      utcDate: match.utcDate,
      casa:    casa,
      fora:    fora,
      status:  match.status,
      placar:  placar,
      penaltis: penaltis,
    };
  });

  return {
    atualizadoEm: new Date().toISOString(),
    jogos:        jogos,
  };
}

/**
 * Função pura: mescla jogos novos com jogos salvos em disco usando a regra
 * "só avança, nunca regride". Evita flip-flop de placares e status quando a
 * API devolve score.fullTime null em uma chamada e o valor real na seguinte.
 *
 * @param {Array} novosJogos   - Array normalizado de construirMatches (novos).
 * @param {Array} salvosJogos  - Array normalizado lido de data/matches.json (salvo).
 * @returns {Array} Novo array mesclado, preservando a ordem de novosJogos.
 *
 * Regras de mescla por campo (para cada jogo n com mesmo id em s):
 *   - status: usa n.status se rank(n) >= rank(s); senão mantém s.status.
 *             CANCELLED/POSTPONED/SUSPENDED têm rank -1 → nunca sobrescrevem
 *             um status já gravado (SCHEDULED/IN_PLAY/FINISHED/etc.).
 *   - placar:  se n.placar não-null → usa n.placar (dado novo tem precedência).
 *              se n.placar null e s.placar não-null → mantém s.placar (anti-flip-flop).
 *   - penaltis: mesma regra do placar — só avança, nunca regride. Jogos salvos antes
 *              desta etapa não têm o campo (undefined); tratado como null (sem pênaltis).
 *   - casa/fora/fase/grupo/utcDate: prefere n quando não-null; cai pra s quando n traz null.
 *
 * Jogos presentes só no salvo (ausentes nos novos) NÃO são reintroduzidos.
 * Função pura: sem I/O, sem efeitos colaterais.
 */
function mesclarMatches(novosJogos, salvosJogos) {
  // Indexa salvos por id para busca O(1)
  const salvosIdx = {};
  for (const s of (salvosJogos || [])) {
    salvosIdx[s.id] = s;
  }

  return (novosJogos || []).map(function(n) {
    const s = salvosIdx[n.id];

    // Jogo novo sem correspondente salvo: usa como veio
    if (!s) return n;

    // ── Status: só avança ────────────────────────────────────────────────────
    // CANCELLED/POSTPONED/SUSPENDED → rank -1; nunca ganham de um status conhecido.
    const rankN = (ORDEM_STATUS[n.status] !== undefined) ? ORDEM_STATUS[n.status] : -1;
    const rankS = (ORDEM_STATUS[s.status] !== undefined) ? ORDEM_STATUS[s.status] : -1;
    const status = rankN >= rankS ? n.status : s.status;

    // ── Placar: anti-flip-flop ───────────────────────────────────────────────
    // n tem placar → usa n (dado mais recente tem precedência)
    // n sem placar + s tem placar → mantém s (protege contra null temporário)
    const placar = (n.placar !== null) ? n.placar : s.placar;

    // ── Pênaltis: mesma regra "só avança, nunca regride" do placar ───────────
    // n.penaltis pode vir undefined em jogos salvos antes desta etapa — trata
    // como null (?? converteria undefined também, mas mantemos != null explícito
    // pra ficar simétrico com o resto do arquivo).
    const penaltis = (n.penaltis != null) ? n.penaltis : (s.penaltis != null ? s.penaltis : null);

    // ── Campos de identidade: prefere n; cai pra s se n vier null ────────────
    // Sticky conservador: evita times sumindo no mata-mata quando a API
    // retorna homeTeam/awayTeam sem nome em algumas execuções.
    const casa    = (n.casa    !== null && n.casa    !== undefined) ? n.casa    : s.casa;
    const fora    = (n.fora    !== null && n.fora    !== undefined) ? n.fora    : s.fora;
    const fase    = (n.fase    !== null && n.fase    !== undefined) ? n.fase    : s.fase;
    const grupo   = (n.grupo   !== null && n.grupo   !== undefined) ? n.grupo   : s.grupo;
    const utcDate = (n.utcDate !== null && n.utcDate !== undefined) ? n.utcDate : s.utcDate;

    return { id: n.id, fase, grupo, utcDate, casa, fora, status, placar, penaltis };
  });
}

/**
 * Lê data/matches.json de forma fail-open e retorna o array de jogos.
 * Retorna [] se o arquivo não existir, tiver JSON inválido ou não tiver
 * a propriedade jogos como array. Nunca lança.
 *
 * @returns {Array} Array de jogos normalizados (pode ser vazio).
 */
function lerJogosSalvos() {
  try {
    const conteudo = fs.readFileSync(CAMINHO_MATCHES, 'utf8');
    const parsed = JSON.parse(conteudo);
    if (parsed && Array.isArray(parsed.jogos)) return parsed.jogos;
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Lê standings.json de forma fail-open e retorna o objeto grupos salvo.
 * Retorna null se o arquivo não existir, tiver JSON inválido ou não tiver
 * a propriedade grupos. Nunca lança.
 *
 * @returns {object|null} Objeto grupos ou null.
 */
function lerGruposSalvos() {
  try {
    const conteudo = fs.readFileSync(CAMINHO, 'utf8');
    const parsed = JSON.parse(conteudo);
    if (parsed && parsed.grupos && typeof parsed.grupos === 'object') return parsed.grupos;
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Verifica se o momento atual está dentro de uma janela de jogo.
 *
 * Retorna true se:
 * - algum jogo tem agoraMs entre (utcDate - 15 min) e (utcDate + 4 h), OU
 * - algum jogo tem status IN_PLAY ou PAUSED (segurança contra dados velhos).
 *
 * A janela de 4 h após o início cobre prorrogação/pênaltis e garante algumas
 * execuções após o apito final do último jogo do dia.
 * Jogos com utcDate ausente ou inválido são ignorados sem lançar erro.
 *
 * @param {Array} jogos  - Array de jogos de data/matches.json (campo "jogos").
 * @param {number} agoraMs - Timestamp atual em milissegundos (Date.now()).
 * @returns {boolean}
 */
function dentroDaJanela(jogos, agoraMs) {
  const QUINZE_MIN = 15 * 60 * 1000;
  const QUATRO_H   = 4 * 60 * 60 * 1000;

  for (const jogo of (jogos || [])) {
    // Segurança: jogo em andamento ou pausado — executa independente de horário
    if (jogo.status === 'IN_PLAY' || jogo.status === 'PAUSED') return true;

    // Verifica janela temporal
    if (!jogo.utcDate) continue;
    const inicio = Date.parse(jogo.utcDate);
    if (!isFinite(inicio)) continue; // utcDate inválido — ignora

    if (agoraMs >= inicio - QUINZE_MIN && agoraMs <= inicio + QUATRO_H) return true;
  }

  return false;
}

// ─── Exporta funções puras para testes externos (não executa main) ────────────
if (require.main !== module) {
  module.exports = {
    acumularFairPlay,
    construirSaida,
    construirSaidaDeJogos,
    construirMatches,
    mesclarMatches,
    extrairLetra,
    validarCobertura,
    dentroDaJanela,
    lerJogosSalvos,
    TRADUCAO,
    TRADUCAO_POR_NOME,
    ORDEM_STATUS,
  };
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

/**
 * Grava obj em caminho SOMENTE se a chave relevante (chaveComparada) diferir
 * do que está em disco. Preserva o arquivo (e o atualizadoEm antigo) quando
 * não há mudança real — elimina commits/diffs de "timestamp só mudou".
 *
 * @param {string} caminho          - Caminho do arquivo JSON.
 * @param {object} novoObj          - Objeto completo a gravar (inclui atualizadoEm).
 * @param {string} chaveComparada   - Chave do objeto cujo valor será comparado ("jogos" ou "grupos").
 * @returns {boolean} true se gravou; false se não havia diferença.
 */
function gravarSeMudou(caminho, novoObj, chaveComparada) {
  try {
    const conteudoAtual = fs.readFileSync(caminho, 'utf8');
    const atual = JSON.parse(conteudoAtual);
    if (JSON.stringify(atual[chaveComparada]) === JSON.stringify(novoObj[chaveComparada])) {
      return false; // sem mudança — preserva arquivo
    }
  } catch (e) {
    // Arquivo inexistente ou JSON inválido: segue para gravação
  }
  fs.writeFileSync(caminho, JSON.stringify(novoObj, null, 2) + '\n');
  return true;
}

function escrever(saida) {
  const gravou = gravarSeMudou(CAMINHO, saida, 'grupos');
  if (gravou) {
    console.log('Classificação atualizada:', Object.keys(saida.grupos).length, 'grupos');
  } else {
    console.log('Classificação sem mudança — arquivo preservado.');
  }
}

function escreverMatches(saida) {
  const gravou = gravarSeMudou(CAMINHO_MATCHES, saida, 'jogos');
  if (gravou) {
    console.log('Jogos atualizados:', saida.jogos.length, 'jogos gravados em', CAMINHO_MATCHES);
  } else {
    console.log('Jogos sem mudança —', CAMINHO_MATCHES, 'preservado.');
  }
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error('FOOTBALL_DATA_TOKEN ausente. Defina a variável de ambiente antes de executar.');
    process.exit(1);
  }

  // ── Guarda de janela de jogos ──────────────────────────────────────────────
  // Evita chamadas desnecessárias à API fora dos horários de jogo.
  // FORCAR_EXECUCAO=1 pula a guarda (útil para workflow_dispatch e debug).
  if (process.env.FORCAR_EXECUCAO === '1') {
    console.log('FORCAR_EXECUCAO=1 — guarda de janela ignorada.');
  } else {
    // Reutiliza lerJogosSalvos() para fail-open; null sinaliza "leitura não foi possível"
    // (arquivo ausente ou array vazio), o que força execução (fail-open).
    let jogosSalvos;
    const jogosSalvosLidos = lerJogosSalvos();

    if (jogosSalvosLidos.length === 0) {
      // Arquivo ausente, JSON inválido, ou calendário vazio (primeira carga):
      // lerJogosSalvos retorna [] nos dois casos; fail-open — executa normalmente.
      const existeArquivo = fs.existsSync(CAMINHO_MATCHES);
      if (!existeArquivo) {
        console.log('Guarda de janela: ' + CAMINHO_MATCHES + ' ainda não existe. Execução prossegue normalmente.');
      } else {
        console.log('Guarda de janela: calendário vazio em ' + CAMINHO_MATCHES + ' (primeira carga ou JSON inválido). Execução prossegue normalmente.');
      }
      jogosSalvos = null; // sinaliza fail-open
    } else {
      jogosSalvos = jogosSalvosLidos;
    }

    if (jogosSalvos !== null) {
      if (!dentroDaJanela(jogosSalvos, Date.now())) {
        // Determina o próximo jogo futuro para log informativo
        const agora = Date.now();
        const proximos = jogosSalvos
          .filter(function(j) { return j.utcDate && isFinite(Date.parse(j.utcDate)) && Date.parse(j.utcDate) > agora; })
          .sort(function(a, b) { return Date.parse(a.utcDate) - Date.parse(b.utcDate); });
        const infoProximo = proximos.length > 0
          ? 'Próximo jogo: ' + proximos[0].utcDate
          : 'Nenhum jogo futuro encontrado no calendário.';
        console.log('Fora da janela de jogos (' + infoProximo + '). Nenhuma chamada à API.');
        process.exit(0);
      }
    }
  }

  // ── Busca todos os jogos em /matches (não-fatal) ───────────────────────────
  // Grava matches.json e reutiliza a resposta como fallback de standings.
  // Falha de rede ou HTTP aqui não derruba o job — preserva o arquivo existente.
  let dataMatches = null;
  try {
    let resMatches;
    try {
      resMatches = await fetch(ENDPOINT_MATCHES, { headers: { 'X-Auth-Token': token } });
    } catch (e) {
      console.warn('Falha de rede em /matches (não-fatal):', e.message);
      resMatches = null;
    }

    if (resMatches && resMatches.ok) {
      dataMatches = await resMatches.json();

      // Normaliza os novos jogos recebidos da API
      const saidaMatchesNovos = construirMatches(dataMatches);

      // Mescla com os salvos em disco (sticky: status e placar não regridem)
      const salvos = lerJogosSalvos();
      const jogosMesclados = mesclarMatches(saidaMatchesNovos.jogos, salvos);

      // Só grava se houver mudança real (evita commits inúteis de timestamp)
      const saidaFinal = {
        atualizadoEm: new Date().toISOString(),
        jogos:        jogosMesclados,
      };
      escreverMatches(saidaFinal);
    } else if (resMatches) {
      console.warn('Erro HTTP em /matches (não-fatal): status', resMatches.status, '— matches.json preservado.');
    }
  } catch (e) {
    // construirMatches pode lançar para time não-mapeado — é erro de dados real,
    // mas não deve derrubar o job inteiro; apenas logamos e preservamos o arquivo.
    console.warn('Erro ao processar /matches (não-fatal):', e.message, '— matches.json preservado.');
    dataMatches = null;
  }

  // ── Fair play: calculado a partir de dataMatches completo (inclui todos os stages) ──
  // Usado tanto no caminho /standings quanto no fallback /matches.
  // Não-fatal: um booking de time não-mapeado faria traduzir() lançar; preservamos o
  // padrão do script (degradar sem derrubar o job) caindo para fairPlay vazio nesse caso.
  let fairPlay = {};
  if (dataMatches) {
    try {
      fairPlay = acumularFairPlay(dataMatches);
    } catch (e) {
      console.warn('Erro ao acumular fair play (não-fatal):', e.message, '— fp tratado como 0.');
      fairPlay = {};
    }
  }

  // ── Índice id → {status, placar} dos jogos MESCLADOS ──────────────────────
  // Usado no fallback de standings para sobrepor placares sticky nos matches
  // crus da API antes de alimentar construirSaidaDeJogos.
  // Só existe se dataMatches foi processado com sucesso.
  let indiceMesclado = null;
  if (dataMatches) {
    // Reconstrói o índice a partir dos jogos salvos (que já passaram pela mescla)
    // lendo matches.json — o arquivo já foi gravado (ou preservado) acima.
    const jogosParaIndice = lerJogosSalvos();
    if (jogosParaIndice.length > 0) {
      indiceMesclado = {};
      for (const j of jogosParaIndice) {
        indiceMesclado[j.id] = { status: j.status, placar: j.placar };
      }
    }
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
      resultado = construirSaida(data, fairPlay);
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
  // Reutiliza dataMatches já buscado acima; filtra só jogos de GROUP_STAGE.
  if (!dataMatches || !dataMatches.matches || dataMatches.matches.length === 0) {
    console.log('/matches também indisponível. JSON preservado.');
    process.exit(0);
  }

  // Sobrepõe placares/status sticky nos matches crus antes de alimentar construirSaidaDeJogos.
  // Isso garante que a classificação do fallback não zere pontos quando a API retornar
  // score.fullTime null temporariamente num jogo já encerrado.
  // O índice é derivado da mescla sticky (única fonte de verdade da regra).
  if (indiceMesclado) {
    for (const match of dataMatches.matches) {
      const entry = indiceMesclado[match.id];
      if (!entry) continue;

      // Sobrepõe placar somente quando o cru não tiver placar mas o mesclado tiver
      const cruSemPlacar =
        !match.score ||
        !match.score.fullTime ||
        match.score.fullTime.home == null ||
        match.score.fullTime.away == null;

      if (cruSemPlacar && entry.placar !== null) {
        match.score = {
          fullTime: { home: entry.placar.casa, away: entry.placar.fora },
        };
      }

      // Sobrepõe status se o mesclado for mais avançado
      const rankCru     = (ORDEM_STATUS[match.status]   !== undefined) ? ORDEM_STATUS[match.status]   : -1;
      const rankMesclado = (ORDEM_STATUS[entry.status]  !== undefined) ? ORDEM_STATUS[entry.status]   : -1;
      if (rankMesclado > rankCru) {
        match.status = entry.status;
      }
    }
  }

  // Filtra apenas jogos de grupo para alimentar o construirSaidaDeJogos
  // (que assume group != null; mata-mata tem group: null e seria ignorado de
  // qualquer forma, mas filtramos explicitamente para evitar poluição nos logs)
  const dataJogosGrupo = {
    matches: dataMatches.matches.filter(function(m) { return m.stage === 'GROUP_STAGE'; }),
  };

  console.log('Diagnóstico de /matches:', JSON.stringify({
    total: dataMatches.matches.length,
    grupoStage: dataJogosGrupo.matches.length,
    finalizados: dataJogosGrupo.matches.filter(m => m.status === 'FINISHED' || m.status === 'AWARDED').length,
    exemploGroup: dataJogosGrupo.matches[0] && dataJogosGrupo.matches[0].group,
  }));

  let resultado;
  try {
    resultado = construirSaidaDeJogos(dataJogosGrupo, fairPlay);
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
