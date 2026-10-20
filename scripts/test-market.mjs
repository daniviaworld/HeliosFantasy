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
const r = planClose({ now: 5000, state: st0, members, bids, base, perDay: 5, rng });
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
const r2 = planClose({ now: 5000, state: { ...st0, listings: [] }, members, bids: { u1: { 2: 9 } }, base, rng });
ok(Object.keys(r2.memberUpdates).length === 0, 'no se puede pujar por un jugador propio');
// 4) saldo se gasta una vez entre varias pujas
const m3 = JSON.parse(JSON.stringify(members)); m3.u3.cash = 8;
const r3 = planClose({ now: 5000, state: { ...st0, listings: [10, 11] }, members: m3, bids: { u3: { 10: 8, 11: 8 } }, base, rng });
ok(r3.memberUpdates.u3.squad.length === 2 && r3.memberUpdates.u3.cash === 0, 'solo compra uno con saldo para uno (' + JSON.stringify(r3.memberUpdates.u3.squad) + ')');
// 5) anónimo
const r4 = planClose({ now: 5000, state: st0, members, bids: { u1: { 10: 3 } }, base, rng, anon: true });
ok(r4.news.filter((n) => n.to === null).every((n) => !/Paco/.test(n.x)), 'modo anónimo oculta nombres');
console.log(fail ? 'FALLOS ' + fail : 'TODO OK'); process.exit(fail ? 1 : 0);
