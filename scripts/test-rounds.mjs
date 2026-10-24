import { planRound, lineupCount, planSettle, doneRounds, planBonus } from './rounds-lib.mjs';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FALLO', m); } else console.log('ok', m); };
const mk = (r, d, st = 'pre') => ({ r, d, st });
const day = (n) => new Date(Date.UTC(2026, 9, n, 18)).toISOString();
const ms = []; for (let i = 0; i < 10; i++) ms.push(mk(10, day(23 + (i % 3))));
const lu = (n) => ({ POR: [1], DEF: [2, 3, 4, 5, 6].slice(0, Math.max(0, Math.min(5, n - 1))), MED: Array.from({ length: Math.max(0, Math.min(5, n - 6)) }, (_, i) => 10 + i), DEL: Array.from({ length: Math.max(0, n - 11) }, (_, i) => 20 + i) });
const members = { a: { cash: 5, lineup: lu(11) }, b: { cash: -0.5, lineup: lu(11) }, c: { cash: 3, lineup: { POR: [1], DEF: [2, null, 4], MED: [], DEL: [] } } };
ok(lineupCount(members.a) === 11, 'cuenta 11');
ok(planRound({ now: +new Date(day(22)), matches: ms, members, done: new Map() }) === null, 'antes de empezar no hay foto');
const p = planRound({ now: +new Date(day(23)) + 60000, matches: ms, members, done: new Map() });
ok(p && p.round === 10, 'foto de la jornada 10');
ok(p.elig.a.ok === true, 'a elegible');
ok(p.elig.b.ok === false && p.elig.b.neg, 'b con saldo negativo no puntúa');
ok(p.elig.c.ok === false && p.elig.c.n === 3, 'c sin 11 alineados no puntúa');
ok(planRound({ now: +new Date(day(23)) + 60000, matches: ms, members, done: new Map([[10, true]]) }) === null, 'no se repite la foto');
ok(p.elig.a.lu && p.elig.a.lu.POR.length === 1 && p.elig.a.lu.DEF.length === 5, 'la foto guarda el once de cada mánager');
ok(planRound({ now: +new Date(day(23)) + 60000, matches: ms, members, done: new Map([[10, false]]) }) !== null, 'una foto antigua sin once se rehace');
// cierre de jornadas en el servidor
{
  const msDone = []; for (let i = 0; i < 10; i++) msDone.push({ r: 9, d: day(10), st: 'post' }); for (let i = 0; i < 10; i++) msDone.push({ r: 10, d: day(24), st: i < 6 ? 'post' : 'in' });
  ok(JSON.stringify(doneRounds(msDone, +new Date(day(25)))) === '[9]', 'solo la jornada 9 está terminada');
  const season = { pl: { 1: { j: { 9: 3 } }, 2: { j: { 9: 5 } }, 3: { j: { 9: 4 } } }, coach: { RMA: { j: { 9: 2 } } } };
  const base = { 1: { t: 'RMA' }, 2: { t: 'RMA' }, 3: { t: 'RMA' }, '-1': { t: 'RMA' } };
  const mem = {
    a: { r0: 9, rp: {}, lineup: { POR: [1], DEF: [2], MED: [], DEL: [] }, cap: 2, coach: -1 },
    b: { r0: 9, rp: {}, lineup: { POR: [1], DEF: [2], MED: [], DEL: [] }, cap: null, coach: -1 },
    c: { r0: 10, rp: {}, lineup: { POR: [1], DEF: [], MED: [], DEL: [] }, coach: null },
    d: { r0: 9, rp: { 9: 7 }, lineup: { POR: [1], DEF: [], MED: [], DEL: [] }, coach: null },
    e: { r0: 9, rp: {}, lineup: { POR: [1], DEF: [2], MED: [], DEL: [] }, coach: null },
  };
  const snaps = { 9: { e: { ok: false, neg: true }, b: { ok: true, lu: { POR: [3], DEF: [], MED: [], DEL: [] }, cp: null, co: null } } };
  const o = planSettle({ matches: msDone, now: +new Date(day(25)), members: mem, snaps, season, base, capOn: true });
  ok(o.a && o.a.rp[9] === 3 + 5 * 2 + 2 && o.a.tot === 15, 'capitán x2 y entrenador (' + (o.a && o.a.tot) + ')');
  ok(o.b && o.b.rp[9] === 4, 'usa el once de la foto, no el actual');
  ok(!o.c, 'antes de entrar no puntúa');
  ok(!o.d, 'no repite jornadas ya cerradas');
  ok(o.e && o.e.rp[9] === 0, 'sin derecho a puntuar: 0');
}
// prima por punto
{
  const msDone = []; for (let i = 0; i < 10; i++) msDone.push({ r: 9, d: day(10), st: 'post' });
  const mem = { a: { r0: 9, rp: { 9: 40 }, cash: 5, bp: {} }, b: { r0: 9, rp: { 9: 40 }, cash: 5, bp: { 9: true } }, c: { r0: 10, rp: { 9: 40 }, cash: 5 }, d: { r0: 9, rp: { 12: 10 }, cash: 1 } };
  const o = planBonus({ matches: msDone, now: +new Date(day(25)), members: mem, bonus: 0.05 });
  ok(o.a && o.a.credit === 2 && o.a.cash === 7 && o.a.bp[9] === true, 'cobra 40 puntos × 0,05 M = 2,00 M');
  ok(!o.b, 'una jornada ya pagada no se paga dos veces');
  ok(!o.c, 'antes de entrar no cobra');
  ok(!o.d, 'una jornada sin terminar no se paga');
  ok(Object.keys(planBonus({ matches: msDone, now: +new Date(day(25)), members: mem, bonus: 0 })).length === 0, 'sin prima no se paga nada');
}
console.log(fail ? 'FALLOS ' + fail : 'TODO OK'); process.exit(fail ? 1 : 0);
