import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playerPoints, coachPoints, parseScoreboard, assignRounds, currentRound, makeTeamMap, makeMatcher, scoreMatch, finalizePoints } from './results-lib.mjs';
const wanted = JSON.parse(fs.readFileSync(new URL('./laliga-teams.json', import.meta.url), 'utf8'));
const teams = [{ i: 529, c: 'BAR', n: 'Barcelona' }, { i: 543, c: 'BET', n: 'Real Betis' }, { i: 541, c: 'REA', n: 'Real Madrid' }, { i: 530, c: 'ATL', n: 'Atlético de Madrid' }];
const players = [
  { a: 1, n: 'Lamine Yamal', t: 'BAR', p: 'DEL' }, { a: 2, n: 'Jules Koundé', t: 'BAR', p: 'DEF' }, { a: 3, n: 'Joan García', t: 'BAR', p: 'POR' },
  { a: 4, n: 'Álvaro Valles', t: 'BET', p: 'POR' }, { a: 5, n: 'Isco', t: 'BET', p: 'MED' }, { a: 6, n: 'Pedri', t: 'BAR', p: 'MED' },
];
// ---- fórmula
assert.equal(playerPoints({ goals: 1, minutes: 90 }, 'DEL'), 4 + 2);
assert.equal(playerPoints({ goals: 1, assists: 1, minutes: 70 }, 'DEF'), 6 + 3 + 2);
assert.equal(playerPoints({ cleanSheet: true, minutes: 90 }, 'POR'), 2 + 4);
assert.equal(playerPoints({ cleanSheet: true, minutes: 50 }, 'DEF'), 0, 'sin 60 minutos no hay portería a cero');
assert.equal(playerPoints({ cleanSheet: true, minutes: 90 }, 'MED'), 2);
assert.equal(playerPoints({ yellow: 1, red: 1, minutes: 30 }, 'DEF'), -4);
assert.equal(playerPoints({ penScored: 1, goals: 1, penMissed: 1, ownGoals: 1, minutes: 90 }, 'DEL'), 4 + 3 - 2 - 2 + 2);
assert.equal(coachPoints(2, 0), 5); assert.equal(coachPoints(1, 1), 2); assert.equal(coachPoints(0, 3), 0);
// ---- equipos
const tc = makeTeamMap(wanted, teams);
assert.equal(tc('Barcelona'), 'BAR'); assert.equal(tc('Real Betis'), 'BET'); assert.equal(tc('Atlético Madrid'), 'ATL'); assert.equal(tc('Equipo X'), null);
// ---- calendario y jornadas
const sb = (id, d, h, a, hs, as, done) => ({ id, date: d, status: { type: { completed: done, state: done ? 'post' : 'pre' } }, competitions: [{ competitors: [{ homeAway: 'home', score: String(hs), team: { id: h[0], displayName: h[1] } }, { homeAway: 'away', score: String(as), team: { id: a[0], displayName: a[1] } }] }] });
const ms = parseScoreboard({ events: [
  sb('10', '2026-10-17T16:30Z', ['543', 'Real Betis'], ['529', 'Barcelona'], 2, 5, true),
  sb('11', '2026-10-24T16:30Z', ['529', 'Barcelona'], ['541', 'Real Madrid'], 0, 0, false),
  sb('9', '2026-10-10T16:30Z', ['541', 'Real Madrid'], ['530', 'Atlético Madrid'], 1, 1, true),
] });
assert.equal(ms.length, 3); assert.equal(ms[0].st, 'post'); assert.equal(ms[1].st, 'pre'); assert.equal(ms[0].h.s, 2);
const rs = assignRounds(ms);
assert.deepEqual(rs.map((m) => m.id + ':' + m.r), ['9:1', '10:1', '11:2'], 'rondas por orden de partido de cada equipo');
assert.equal(currentRound(rs), 2);
// ---- resumen de un partido (forma de ESPN)
const ath = (id, full, short, pos) => ({ id, fullName: full, displayName: full, shortName: short, position: { abbreviation: pos } });
const pr = (id, full, short, pos, o = {}) => ({ starter: !!o.starter, subbedIn: !!o.subbedIn, subbedOut: !!o.subbedOut, athlete: ath(id, full, short, pos), stats: o.stats || [] });
const summary = {
  rosters: [
    { team: { id: '543' }, roster: [pr('283892', 'Álvaro Valles', 'Á. Valles', 'G', { starter: true }), pr('77', 'Isco', 'Isco', 'M', { starter: true, subbedOut: true })] },
    { team: { id: '529' }, roster: [
      pr('362150', 'Lamine Yamal', 'L. Yamal', 'F', { starter: true }),
      pr('231692', 'Jules Koundé', 'J. Koundé', 'D', { starter: true, stats: [{ name: 'yellowCards', value: 1 }] }),
      pr('400', 'Joan García', 'J. García', 'G', { starter: true }),
      pr('401', 'Pedri', 'Pedri', 'M', { subbedIn: true }),
    ] },
  ],
  keyEvents: [
    { type: { type: 'kickoff' }, text: 'First Half begins.' },
    { type: { type: 'goal' }, clock: { value: 600 }, text: 'Goal! Real Betis 0, Barcelona 1. Lamine Yamal (Barcelona) left footed shot. Assisted by Jules Koundé.', participants: [{ athlete: { id: '362150' } }, { athlete: { id: '231692' } }] },
    { type: { type: 'yellow-card' }, clock: { value: 1500 }, text: 'Jules Koundé (Barcelona) is shown the yellow card.', participants: [{ athlete: { id: '231692' } }] },
    { type: { type: 'substitution' }, clock: { value: 4200 }, text: 'Substitution, Real Betis. Pedro replaces Isco because of an injury.', participants: [] },
    { type: { type: 'substitution' }, clock: { value: 4500 }, text: 'Substitution, Barcelona. Pedri replaces Lamine Yamal.', participants: [{ athlete: { id: '401' } }, { athlete: { id: '362150' } }] },
  ],
};
const match = { id: '10', h: { id: '543', n: 'Real Betis', s: 2 }, a: { id: '529', n: 'Barcelona', s: 5 }, st: 'post', r: 2 };
const matcher = makeMatcher(players);
assert.equal(matcher('BET', ['á valles', 'a valles']), 4, 'Álvaro Valles por nombre completo');
assert.equal(matcher('BAR', ['l yamal']), 1, 'inicial + apellido');
assert.equal(matcher('BAR', ['pedri']), 6);
assert.equal(matcher('BAR', ['desconocido x']), null);
const res = scoreMatch({ match, summary, teamCode: tc, matcher });
const pts = finalizePoints(res, Object.fromEntries(players.map((p) => [p.a, p])));
assert.equal(pts[1], 4 + 2 - 0, 'Yamal: gol de delantero + 2 por minutos (>60) = 6 (salió al 75)');
assert.equal(pts[2], 3 + 2 - 1, 'Koundé: asistencia + minutos - amarilla');
assert.equal(pts[3], 2, 'portero del Barça: minutos, encaja 2 así que no hay portería a cero');
assert.equal(pts[6], 0, 'Pedri entró al 75: no llega a 60 minutos');
assert.ok(res.pl[4] && res.pl[4].cleanSheet === false);
const ISCO = res.pl[5]; assert.ok(ISCO && ISCO.minutes === 70, 'Isco sale al 70 (' + (ISCO && ISCO.minutes) + ')');
// portería a cero
const sum0 = { rosters: [{ team: { id: '529' }, roster: [pr('231692', 'Jules Koundé', 'J. Koundé', 'D', { starter: true }), pr('400', 'Joan García', 'J. García', 'G', { starter: true })] }, { team: { id: '543' }, roster: [] }], keyEvents: [] };
const m0 = { id: '12', h: { id: '529', n: 'Barcelona', s: 1 }, a: { id: '543', n: 'Real Betis', s: 0 }, st: 'post', r: 1 };
const r0 = scoreMatch({ match: m0, summary: sum0, teamCode: tc, matcher });
const p0 = finalizePoints(r0, Object.fromEntries(players.map((p) => [p.a, p])));
assert.equal(p0[2], 2 + 4, 'defensa con portería a cero'); assert.equal(p0[3], 2 + 4, 'portero con portería a cero');
console.log('Todas las pruebas de resultados pasan.');
