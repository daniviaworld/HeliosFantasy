import { planDeals, clauseOf, protectedUntil, LOCK_MS, OFFER_TTL, CLAUSE_MULT } from './deals-lib.mjs';
import { planClose } from './market-lib.mjs';
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FALLO:', m); } else console.log('ok:', m); };
const base = {}; for (let a = 1; a <= 40; a++) base[a] = { n: 'J' + a, v: 4, t: 'RMA', p: 'DEL' };
base[-1] = { n: 'Entr', v: 1, t: 'RMA', p: 'ENT' };
const sq = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const mk = () => ({
  s: { name: 'Seller', cash: 10, squad: sq(1, 14), lineup: { DEL: [1, 2] }, role: { 1: 'MED' }, selling: { 3: 5 }, pm: {}, cap: 1, coach: null, rev: 0 },
  b: { name: 'Buyer', cash: 50, squad: sq(20, 12), lineup: { DEL: [] }, role: {}, selling: {}, pm: {}, rev: 2 },
});
const now = 10 * LOCK_MS;
const D = (o) => ({ id: 'd' + Math.random(), ts: now - 1000, status: 'pending', ...o });
// cláusula por defecto
ok(clauseOf({}, 1, 4) === 6, 'cláusula por defecto = valor × 1,5 (' + clauseOf({}, 1, 4) + ')');
ok(clauseOf({ 1: { c: 9 } }, 1, 4) === 9, 'cláusula guardada manda');
// clausulazo correcto
let M = mk(), d1 = D({ type: 'clause', buyer: 'b', seller: 's', a: 1, amount: 6 });
let r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'done', 'clausulazo hecho');
ok(r.memberUpdates.b.squad.includes(1) && r.memberUpdates.b.cash === 44, 'comprador paga 6 (' + r.memberUpdates.b.cash + ')');
ok(!r.memberUpdates.s.squad.includes(1) && r.memberUpdates.s.cash === 16, 'vendedor cobra 6');
ok(r.memberUpdates.s.lineup.DEL[0] === null && r.memberUpdates.s.cap === null && !('1' in r.memberUpdates.s.role), 'se limpian alineación, capitán y rol del vendedor');
ok(protectedUntil(r.memberUpdates.b.pm, 1) === now + LOCK_MS, 'el fichado queda protegido 14 días');
ok(r.memberUpdates.b.rev === 3 && r.memberUpdates.s.rev === 1, 'rev sube');
ok(r.news.some((n) => n.to === 's') && r.news.some((n) => n.to === 'b') && r.news.some((n) => n.to === null), 'noticias para los tres');
// reglas desactivadas
r = planDeals({ now, members: mk(), deals: [d1], base, rules: { clause: false } });
ok(r.dealUpdates[d1.id].status === 'failed' && /desactivados/.test(r.dealUpdates[d1.id].note), 'clausulazos desactivados');
// protegido por 14 días
M = mk(); M.s.pm[1] = { l: now + 1000 };
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed' && /protegido/.test(r.dealUpdates[d1.id].note), 'jugador protegido no se clausula');
// blindado
M = mk(); M.s.pm[1] = { s: now + 1000 };
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed', 'jugador blindado no se clausula');
// protección caducada
M = mk(); M.s.pm[1] = { l: now - 1 };
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'done', 'protección caducada: se puede clausular');
// cláusula subida tras la solicitud
M = mk(); M.s.pm[1] = { c: 12 };
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed' && /subió/.test(r.dealUpdates[d1.id].note), 'cláusula subida: se anula');
M = mk(); M.s.pm[1] = { c: 12 }; const d1b = D({ type: 'clause', buyer: 'b', seller: 's', a: 1, amount: 12 });
r = planDeals({ now, members: M, deals: [d1b], base, rules: { clause: true } });
ok(r.memberUpdates.b.cash === 38, 'paga la cláusula guardada (12)');
// saldo
M = mk(); M.b.cash = 5;
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed' && /saldo/.test(r.dealUpdates[d1.id].note), 'sin saldo');
// saldo compartido entre dos tratos
M = mk(); M.b.cash = 8; const dA = D({ type: 'clause', buyer: 'b', seller: 's', a: 1, amount: 6, ts: now - 2000 }), dB = D({ type: 'clause', buyer: 'b', seller: 's', a: 2, amount: 6, ts: now - 1000 });
r = planDeals({ now, members: M, deals: [dB, dA], base, rules: { clause: true } });
ok(r.dealUpdates[dA.id].status === 'done' && r.dealUpdates[dB.id].status === 'failed', 'se ejecutan por orden y el saldo no alcanza para los dos');
// plantilla llena / vendedor mínimo
M = mk(); M.b.squad = sq(20, 26);
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed' && /completa/.test(r.dealUpdates[d1.id].note), 'plantilla completa');
M = mk(); M.s.squad = sq(1, 11);
r = planDeals({ now, members: M, deals: [d1], base, rules: { clause: true } });
ok(r.dealUpdates[d1.id].status === 'failed' && /menos de 11/.test(r.dealUpdates[d1.id].note), 'el vendedor no baja de 11');
// oferta: pendiente no hace nada, aceptada se ejecuta
const o1 = D({ type: 'offer', buyer: 'b', seller: 's', a: 2, amount: 7 });
r = planDeals({ now, members: mk(), deals: [o1], base, rules: { clause: false } });
ok(Object.keys(r.memberUpdates).length === 0 && !r.dealUpdates[o1.id], 'oferta pendiente: nada');
r = planDeals({ now, members: mk(), deals: [{ ...o1, status: 'accepted' }], base, rules: { clause: false } });
ok(r.dealUpdates[o1.id].status === 'done' && r.memberUpdates.b.cash === 43, 'oferta aceptada se ejecuta aunque no haya clausulazos');
ok(r.memberUpdates.b.pm[2].c === 10.5 && protectedUntil(r.memberUpdates.b.pm, 2) === now + LOCK_MS, 'protegido 14 días y cláusula nueva = 10,5');
// oferta caducada
const o2 = D({ type: 'offer', buyer: 'b', seller: 's', a: 2, amount: 7, ts: now - OFFER_TTL - 5 });
r = planDeals({ now, members: mk(), deals: [o2], base });
ok(r.dealUpdates[o2.id].status === 'expired', 'oferta caduca a las 48 h');
// jugador en venta: la oferta aceptada lo saca del mercado
r = planDeals({ now, members: mk(), deals: [{ ...D({ type: 'offer', buyer: 'b', seller: 's', a: 3, amount: 6 }), status: 'accepted' }], base });
ok(!('3' in r.memberUpdates.s.selling), 'sale del mercado al venderse');
// entrenador
r = planDeals({ now, members: mk(), deals: [{ ...D({ type: 'offer', buyer: 'b', seller: 's', a: -1, amount: 2 }), status: 'accepted' }].map((x) => x), base });
ok(r.dealUpdates[Object.keys(r.dealUpdates)[0]].status === 'failed', 'no puede vender lo que no tiene');
// dos tratos por el mismo jugador: solo uno
M = mk(); const e1 = D({ type: 'clause', buyer: 'b', seller: 's', a: 1, amount: 6, ts: 1 }); M.c = { name: 'C', cash: 99, squad: sq(30, 10), lineup: {}, role: {}, selling: {}, pm: {}, rev: 0 };
const e2 = D({ type: 'clause', buyer: 'c', seller: 's', a: 1, amount: 6, ts: 2 });
r = planDeals({ now, members: M, deals: [e2, e1], base, rules: { clause: true } });
ok(r.dealUpdates[e1.id].status === 'done' && r.dealUpdates[e2.id].status === 'failed', 'el segundo clausulazo sobre el mismo jugador falla');
// mercado: el que ficha queda protegido
const bids = { b: { 1: 99 } };
const mm = { s: { name: 'S', cash: 1, squad: sq(1, 3), lineup: {}, role: {}, selling: { 1: 5 }, pm: { 1: { c: 3 } }, cap: 1 }, b: { name: 'B', cash: 100, squad: [], lineup: {}, role: {}, selling: {}, pm: {} } };
const pc = planClose({ minSquad: 0, now, state: { end: 0, round: 1, values: {}, listings: [] }, members: mm, bids, base, perDay: 3 });
ok(protectedUntil(pc.memberUpdates.b.pm, 1) === now + LOCK_MS, 'fichaje de mercado: protegido 14 días');
ok(pc.memberUpdates.b.pm[1].c === 99 * CLAUSE_MULT || pc.memberUpdates.b.pm[1].c === Math.round(99 * CLAUSE_MULT * 100) / 100, 'cláusula tras comprar = precio pagado × 1,5');
ok(!pc.memberUpdates.s.pm[1] && pc.memberUpdates.s.cap === null, 'el vendedor pierde su meta y capitán');
console.log(fail ? 'FALLOS ' + fail : 'TODO OK'); process.exit(fail ? 1 : 0);
