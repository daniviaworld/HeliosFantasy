import { planClose, initialState, DAY } from './market-lib.mjs';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FALLO:', m); } else console.log('ok:', m); };
const base = {}; for (let a = 1; a <= 60; a++) base[a] = { n: 'J' + a, v: 2, t: 'RMA', p: 'DEL' };
let seq = 0; const rng = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
const members = {
  u1: { name: 'Paco', cash: 50, squad: [1, 2, 3], lineup: { POR: [], DEF: [], MED: [], DEL: [1, null] }, role: { 1: 'MED' }, selling: { 2: 5 }, rev: 0 },
  u2: { name: 'Marta', cash: 10, squad: [4, 5], lineup: { POR: [], DEF: [], MED: [], DEL: [] }, role: {}, selling: {}, rev: 3 },
  u3: { name: 'Luis', cash: 100, squad: [6], lineup: { POR: [], DEF: [], MED: [], DEL: [] }, role: {}, selling: {}, rev: 0 },
};
const st0 = { end: 1000, round: 1, values: {}, listings: [10, 11, 12] };
// 1) estado inicial: solo libres
const ini = initialState(0, base, members, 8, rng);
ok(ini.listings.length === 8 && ini.listings.every((a) => ![1, 2, 3, 4, 5, 6].includes(a)), 'mercado inicial sin jugadores ya fichados ni a la venta');
// 2) cierre
const bids = {
  u1: { 10: 3 },                // CPU: u1 puja 3 (valor 2)
  u2: { 10: 2.5, 2: 6, 11: 99 }, // u2: pierde 10, gana 2 (a Paco por 6, tiene 10), 11 sin saldo
  u3: { 10: 2.2, 2: 5.5, 3: 9 }, // 3 no está a la venta
};
const r = planClose({ minSquad: 0, now: 5000, state: st0, members, bids, base, perDay: 5, rng });
const U = r.memberUpdates;
ok(U.u1 && U.u1.squad.includes(10) && !U.u1.squad.includes(2), 'u1 ficha a 10 y vende a 2');
ok(U.u1.cash === 50 - 3 + 6, 'cash de u1 = 53 (' + U.u1.cash + ')');
ok(U.u2.squad.includes(2) && U.u2.cash === 4, 'u2 compra a 2 por 6, cash 4');
ok(U.u1.lineup.DEL[0] === 1 && U.u1.role[1] === 'MED', 'alineación de u1 intacta');
ok(!U.u3, 'u3 no cambia (perdió todo)');
ok(!(U.u2.squad.includes(11)), '11 no se compra sin saldo');
ok(r.news.some((n) => n.to === 'u2' && /anuló por falta de saldo/.test(n.x)), 'aviso de puja anulada por saldo');
ok(r.news.some((n) => n.to === 'u3' && /Perdiste la puja por J10/.test(n.x)), 'aviso de puja perdida');
ok(U.u2.rev === 4 && U.u1.rev === 1, 'rev incrementa');
// precio: 10 sube = (3-2)*.1+(2.5-2)*.1+(2.2-2)*.1 = .17 → 2.17 ; 11 baja? tenía puja de 99 de u2 → sube
ok(Math.abs(r.state.values[10] - 2.17) < 0.011, 'precio de 10 sube 0,17 (' + r.state.values[10] + ')');
ok(r.state.values[12] === 1.94, 'sin pujas baja 3 % (' + r.state.values[12] + ')');
ok(r.state.end === 1000 + DAY || r.state.end === 5000 + DAY, 'nuevo cierre a +24 h');
ok(r.state.round === 2 && r.state.listings.length === 5, 'ronda 2 con 5 jugadores');
ok(r.state.listings.every((a) => !U.u1.squad.includes(a) && !U.u2.squad.includes(a) && ![1, 3, 4, 5, 6].includes(a)), 'nuevos jugadores son libres');
// 3) no puede pujar por sí mismo
const r2 = planClose({ minSquad: 0, now: 5000, state: { ...st0, listings: [] }, members, bids: { u1: { 2: 9 } }, base, rng });
ok(Object.keys(r2.memberUpdates).length === 0, 'no se puede pujar por un jugador propio');
// 4) saldo se gasta una vez entre varias pujas
const m3 = JSON.parse(JSON.stringify(members)); m3.u3.cash = 8;
const r3 = planClose({ minSquad: 0, now: 5000, state: { ...st0, listings: [10, 11] }, members: m3, bids: { u3: { 10: 8, 11: 8 } }, base, rng });
ok(r3.memberUpdates.u3.squad.length === 2 && r3.memberUpdates.u3.cash === 0, 'solo compra uno con saldo para uno (' + JSON.stringify(r3.memberUpdates.u3.squad) + ')');
// 5) anónimo
const r4 = planClose({ minSquad: 0, now: 5000, state: st0, members, bids: { u1: { 10: 3 } }, base, rng, anon: true });
ok(r4.news.filter((n) => n.to === null).every((n) => !/Paco/.test(n.x)), 'modo anónimo oculta nombres');
// 6) entrenadores
{
  const b2 = { ...base, '-1': { n: 'Entr 1', v: 1, t: 'RMA', p: 'ENT' }, '-2': { n: 'Entr 2', v: 1, t: 'FCB', p: 'ENT' }, '-3': { n: 'Entr 3', v: 1, t: 'ATM', p: 'ENT' } };
  const ini2 = initialState(0, b2, members, 8, rng);
  ok(ini2.listings.filter((a) => a < 0).length === 2, 'el mercado inicial incluye 2 entrenadores');
  const mm = JSON.parse(JSON.stringify(members));
  mm.u1.squad.push(-1); mm.u1.coach = -1; mm.u1.selling[-1] = 1;
  const rc = planClose({ minSquad: 0, now: 5000, state: { ...st0, listings: [-2] }, members: mm, bids: { u2: { '-1': 2, '-2': 1.5 } }, base: b2, perDay: 6, rng });
  ok(rc.memberUpdates.u2.squad.includes(-1) && rc.memberUpdates.u2.squad.includes(-2), 'u2 ficha dos entrenadores');
  ok(rc.memberUpdates.u2.coach === -1 || rc.memberUpdates.u2.coach === -2, 'se asigna entrenador si no tenía');
  ok(rc.memberUpdates.u1.coach === null && !rc.memberUpdates.u1.squad.includes(-1), 'el vendedor se queda sin entrenador');
}
// 7) endeudamiento: % del valor de la plantilla
{
  const mm = { u1: { name: 'A', cash: 1, squad: [1, 2, 3, 4, 5], lineup: {}, role: {}, selling: {}, rev: 0 }, u2: { name: 'B', cash: 100, squad: [6], lineup: {}, role: {}, selling: {}, rev: 0 } };
  // valor de la plantilla de u1 = 5 × 2 = 10 → con 20 % puede gastar hasta 1 + 2 = 3
  const s0 = { end: 0, round: 1, values: {}, listings: [10, 11] };
  let rr = planClose({ minSquad: 0, now: 5000, state: s0, members: mm, bids: { u1: { 10: 3 } }, base, perDay: 4, rng, debtPct: 20 });
  ok(rr.memberUpdates.u1 && rr.memberUpdates.u1.squad.includes(10) && Math.abs(rr.memberUpdates.u1.cash - (-2)) < 1e-9, 'con 20 % puede quedarse en números rojos (' + (rr.memberUpdates.u1 && rr.memberUpdates.u1.cash) + ')');
  rr = planClose({ minSquad: 0, now: 5000, state: s0, members: mm, bids: { u1: { 10: 3.5 } }, base, perDay: 4, rng, debtPct: 20 });
  ok(!rr.memberUpdates.u1, 'no puede pasarse del endeudamiento permitido');
  rr = planClose({ minSquad: 0, now: 5000, state: s0, members: mm, bids: { u1: { 10: 3 } }, base, perDay: 4, rng, debtPct: 0 });
  ok(!rr.memberUpdates.u1, 'con 0 % no se puede endeudar');
  // el endeudamiento se gasta una sola vez entre varias pujas: 1 + 2 = 3 → solo una de dos pujas de 2,5
  rr = planClose({ minSquad: 0, now: 5000, state: s0, members: mm, bids: { u1: { 10: 2.5, 11: 2.5 } }, base, perDay: 4, rng, debtPct: 20 });
  ok(rr.memberUpdates.u1 && rr.memberUpdates.u1.squad.filter((a) => a === 10 || a === 11).length === 1, 'solo gana una de dos pujas que juntas superan el límite');
}
// 8) la liga hace hasta 3 ofertas por los jugadores puestos a la venta sin comprador
{
  const mk = () => ({ u1: { name: 'A', cash: 5, squad: [1, 2, 3], lineup: {}, role: {}, selling: { 2: 2 }, rev: 0 }, u2: { name: 'B', cash: 50, squad: [6], lineup: {}, role: {}, selling: {}, rev: 0 } });
  const s0 = { end: 0, round: 1, values: {}, listings: [], cpu: {} };
  let r1 = planClose({ minSquad: 0, now: 5000, state: s0, members: mk(), bids: {}, base, perDay: 2, rng });
  ok(r1.cpuNew.length === 1 && r1.cpuNew[0].seller === 'u1' && r1.cpuNew[0].a === 2 && r1.cpuNew[0].n === 1, 'primera oferta de la liga');
  const v2 = base[2].v;
  ok(r1.cpuNew[0].amount >= v2 * 0.9 - 0.011 && r1.cpuNew[0].amount <= v2 * 1.1 + 0.011, 'la oferta ronda el valor del jugador (' + r1.cpuNew[0].amount + ' vs ' + v2 + ')');
  ok(r1.state.cpu['u1|2'] === 1, 'se recuerda cuántas ofertas lleva');
  ok(r1.news.some((n) => n.to === 'u1' && /La liga te ofrece/.test(n.x)), 'el mánager recibe el aviso');
  const r3 = planClose({ minSquad: 0, now: 5000, state: { ...s0, cpu: { 'u1|2': 3 } }, members: mk(), bids: {}, base, perDay: 2, rng });
  ok(r3.cpuNew.length === 0 && r3.memberUpdates.u1 && !('2' in r3.memberUpdates.u1.selling) && !r3.state.cpu['u1|2'], 'tras 3 ofertas el jugador vuelve a la plantilla');
  ok(r3.memberUpdates.u1.squad.includes(2), 'sigue en la plantilla');
  const rs = planClose({ minSquad: 0, now: 5000, state: s0, members: mk(), bids: { u2: { 2: 3 } }, base, perDay: 2, rng });
  ok(rs.cpuNew.length === 0 && rs.sold.some((x) => x.a === 2), 'si un mánager lo compra no hay oferta de la liga');
}
// 9) mínimo de 11 para vender y máximo de 26 para comprar
{
  const big = (n, from) => Array.from({ length: n }, (_, i) => from + i);
  const mk = (sq1) => ({ u1: { name: 'A', cash: 5, squad: sq1, lineup: {}, role: {}, selling: { [sq1[0]]: 1 }, rev: 0 }, u2: { name: 'B', cash: 50, squad: big(26, 100), lineup: {}, role: {}, selling: {}, rev: 0 }, u3: { name: 'C', cash: 50, squad: big(12, 200), lineup: {}, role: {}, selling: {}, rev: 0 } });
  const b2 = {}; for (let a = 1; a <= 300; a++) b2[a] = { n: 'J' + a, v: 2, t: 'RMA', p: 'DEL' };
  const s0 = { end: 0, round: 1, values: {}, listings: [], cpu: {} };
  // u1 con 11 jugadores no puede vender
  let r1 = planClose({ now: 5000, state: s0, members: mk(big(11, 1)), bids: { u3: { 1: 3 } }, base: b2, perDay: 2, rng });
  ok(!r1.sold.some((x) => x.a === 1) && r1.memberUpdates.u1 && !('1' in r1.memberUpdates.u1.selling), 'con 11 jugadores no se puede vender y sale del mercado');
  // con 12 sí
  let r2_ = planClose({ now: 5000, state: s0, members: mk(big(12, 1)), bids: { u3: { 1: 3 } }, base: b2, perDay: 2, rng });
  ok(r2_.sold.some((x) => x.a === 1 && x.uid === 'u3'), 'con 12 jugadores sí se puede vender');
  // u2 tiene 26: no puede ganar una puja aunque pague más
  let r3 = planClose({ now: 5000, state: s0, members: mk(big(12, 1)), bids: { u2: { 1: 9 }, u3: { 1: 3 } }, base: b2, perDay: 2, rng });
  ok(r3.sold.some((x) => x.a === 1 && x.uid === 'u3'), 'plantilla completa (26): gana el siguiente');
  ok(r3.news.some((n) => n.to === 'u2' && /plantilla está completa/.test(n.x)), 'aviso de plantilla completa');
}
// límite por club en el cierre
{
  const bs = {}; for (let a = 1; a <= 30; a++) bs[a] = { n: 'J' + a, v: 2, t: a <= 5 ? 'RMA' : 'FCB', p: 'DEL' };
  const mm = { u1: { name: 'A', cash: 50, squad: [1, 2], lineup: {}, role: {}, selling: {}, rev: 0 }, u2: { name: 'B', cash: 50, squad: [10], lineup: {}, role: {}, selling: {}, rev: 0 } };
  const stx = { end: 1000, round: 1, values: {}, listings: [3, 20] };
  const rr = planClose({ minSquad: 0, now: 5000, state: stx, members: mm, bids: { u1: { 3: 3, 20: 3 } }, base: bs, perDay: 3, clubMax: 2, rng });
  ok(!rr.memberUpdates.u1.squad.includes(3) && rr.memberUpdates.u1.squad.includes(20), 'con límite 2 por club no ficha al 3.º del RMA pero sí a otro club');
  ok(rr.news.some((n) => /límite de 2/.test(n.x)), 'aviso del límite');
  const r3 = planClose({ minSquad: 0, now: 5000, state: stx, members: mm, bids: { u1: { 3: 3 } }, base: bs, perDay: 3, lockMs: 86400000, clauseMult: 2, rng });
  ok(r3.memberUpdates.u1.pm[3].c === 6 && r3.memberUpdates.u1.pm[3].l === 5000 + 86400000, 'cláusula ×2 y protección de 1 día');
  ok(r3.news.some((n) => n.to === null && n.tr && n.tr.t === 'u1' && n.tr.f === null && n.tr.p === 3), 'registro de traspaso del mercado');
}
console.log(fail ? 'FALLOS ' + fail : 'TODO OK'); process.exit(fail ? 1 : 0);
