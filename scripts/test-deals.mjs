import { planDeals, planLoans, planAll, loansDue, clauseOf, protectedUntil, LOCK_MS, OFFER_TTL, CLAUSE_MULT } from './deals-lib.mjs';
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
// reglas ajustables: protección, multiplicador, caducidad y límite por club
{
  const M2 = mk(); const dd = D({ type: 'offer', status: 'accepted', buyer: 'b', seller: 's', a: 1, amount: 5 });
  let q = planDeals({ now, members: M2, deals: [dd], base, rules: { lockDays: 3, clauseMult: 2 } });
  ok(q.dealUpdates[dd.id].status === 'done', 'oferta con reglas propias hecha');
  ok(protectedUntil(q.memberUpdates.b.pm, 1) === now + 3 * 24 * 3600 * 1000, 'protección de 3 días');
  ok(q.memberUpdates.b.pm[1].c === 10, 'cláusula nueva = 5 × 2');
  ok(q.news.some((n) => n.to === null && n.tr && n.tr.f === 's' && n.tr.t === 'b' && n.tr.p === 5), 'la noticia pública guarda quién, a quién y cuánto');
  const old = D({ type: 'offer', buyer: 'b', seller: 's', a: 2, amount: 5, ts: now - 3 * 24 * 3600 * 1000 });
  ok(planDeals({ now, members: mk(), deals: [old], base, rules: { offerDays: 2 } }).dealUpdates[old.id].status === 'expired', 'caduca a los 2 días');
  ok(!planDeals({ now, members: mk(), deals: [old], base, rules: { offerDays: 5 } }).dealUpdates[old.id], 'con 5 días aún no caduca');
  q = planDeals({ now, members: mk(), deals: [dd], base, rules: { clubMax: 11 } });
  ok(q.dealUpdates[dd.id].status === 'failed' && /límite de 11/.test(q.dealUpdates[dd.id].note), 'límite por club: comprador ya tiene 12 del RMA (máx. 11)');
  const m3 = mk(); m3.b.squad = sq(20, 10);
  q = planDeals({ now, members: m3, deals: [dd], base, rules: { clubMax: 11 } });
  ok(q.dealUpdates[dd.id].status === 'done', 'por debajo del límite sí');
}
// intercambio con dinero
{
  const mkS = () => { const M = mk(); M.s.squad = sq(1, 14); M.b.squad = sq(20, 12); return M; };
  const sw = (o) => D({ type: 'swap', status: 'accepted', buyer: 'b', seller: 's', a: 5, give: 22, amount: 2, ...o });
  let d = sw({}), q = planDeals({ now, members: mkS(), deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'done', 'intercambio hecho');
  const U = q.memberUpdates;
  ok(U.b.squad.includes(5) && !U.b.squad.includes(22) && U.s.squad.includes(22) && !U.s.squad.includes(5), 'los jugadores cambian de dueño');
  ok(U.b.squad.length === 12 && U.s.squad.length === 14, 'mismos tamaños de plantilla');
  ok(U.b.cash === 48 && U.s.cash === 12, 'el comprador paga 2 M al otro (' + U.b.cash + '/' + U.s.cash + ')');
  ok(protectedUntil(U.b.pm, 5) > now && protectedUntil(U.s.pm, 22) > now, 'ambos quedan protegidos');
  ok(q.news.some((n) => n.to === null && n.tr && n.tr.k === 'swap' && n.tr.g === 22 && n.tr.p === 2 && n.tr.t === 'b' && n.tr.f === 's'), 'registro del intercambio para poder deshacerlo');
  d = sw({ give: 99 }); q = planDeals({ now, members: mkS(), deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'failed', 'falla si el jugador ofrecido ya no es tuyo');
  d = sw({ amount: 500 }); q = planDeals({ now, members: mkS(), deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'failed' && /saldo/.test(q.dealUpdates[d.id].note), 'falla sin saldo');
  d = sw({ amount: 0 }); q = planDeals({ now, members: mkS(), deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'done' && q.memberUpdates.b.cash === 50, 'intercambio sin dinero');
  const mt = mkS(); mt.s.squad = sq(1, 11); d = sw({}); q = planDeals({ now, members: mt, deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'done', 'con 11 jugadores se puede intercambiar (el tamaño no cambia)');
  d = D({ type: 'swap', buyer: 'b', seller: 's', a: 5, give: 22, amount: 0, ts: now - 3 * 24 * 3600 * 1000 });
  ok(planDeals({ now, members: mkS(), deals: [d], base, rules: {} }).dealUpdates[d.id].status === 'expired', 'el intercambio pendiente caduca');
  d = sw({}); q = planDeals({ now, members: mkS(), deals: [d], base, rules: { clubMax: 11 } });
  ok(q.dealUpdates[d.id].status === 'done', 'intercambio mismo club no cambia los conteos');
}
// cesiones
{
  const DAYS = 24 * 3600 * 1000;
  const mkL = () => { const M = mk(); M.s.squad = sq(1, 14); M.s.pm = { 5: { c: 9 } }; M.s.lineup = { DEL: [5, null] }; return M; };
  const ln = (o) => D({ type: 'loan', status: 'accepted', buyer: 'b', seller: 's', a: 5, days: 14, amount: 1.5, ...o });
  let d = ln({}), q = planDeals({ now, members: mkL(), deals: [d], base, rules: {} });
  ok(q.dealUpdates[d.id].status === 'done', 'cesión aceptada y hecha');
  const U = q.memberUpdates;
  ok(U.b.squad.includes(5) && !U.s.squad.includes(5), 'el jugador pasa a la plantilla del que lo recibe');
  ok(U.b.cash === 48.5 && U.s.cash === 11.5, 'paga la cesión (1,5 M)');
  ok(U.b.ln[5].f === 's' && U.b.ln[5].u === now + 14 * DAYS && U.s.lo[5].t === 'b' && U.s.lo[5].pm.c === 9, 'se anota la cesión en las dos fichas (y la cláusula original)');
  ok(protectedUntil(U.b.pm, 5) === now + 14 * DAYS, 'protegido mientras dura la cesión');
  ok(U.s.lineup.DEL[0] === null, 'se quita de la alineación del dueño');
  ok(q.news.some((n) => n.to === null && /cede a/.test(n.x)), 'noticia pública');
  // no se puede ceder si el dueño se queda con menos de 11
  const m11 = mkL(); m11.s.squad = sq(1, 11);
  d = ln({}); ok(planDeals({ now, members: m11, deals: [d], base, rules: {} }).dealUpdates[d.id].status === 'failed', 'el dueño no puede quedarse con menos de 11');
  d = ln({ amount: 999 }); ok(/saldo/.test(planDeals({ now, members: mkL(), deals: [d], base, rules: {} }).dealUpdates[d.id].note), 'sin saldo no hay cesión');
  d = ln({ days: 3 }); q = planDeals({ now, members: mkL(), deals: [d], base, rules: {} });
  ok(q.memberUpdates.b.ln[5].u === now + 7 * DAYS, 'duración no válida → 7 días');
  d = D({ type: 'loan', buyer: 'b', seller: 's', a: 5, days: 7, amount: 0, ts: now - 3 * DAYS });
  ok(planDeals({ now, members: mkL(), deals: [d], base, rules: {} }).dealUpdates[d.id].status === 'expired', 'la petición caduca como una oferta');
  // devolución
  const after = JSON.parse(JSON.stringify({ s: { ...mkL().s, ...U.s }, b: { ...mkL().b, ...U.b } }));
  ok(!loansDue(after, now + 13 * DAYS) && loansDue(after, now + 14 * DAYS), 'avisa cuando vence');
  const r1 = planLoans({ now: now + 13 * DAYS, members: after, base });
  ok(Object.keys(r1.memberUpdates).length === 0, 'antes de tiempo no se devuelve');
  const r2_ = planLoans({ now: now + 15 * DAYS, members: after, base });
  ok(r2_.memberUpdates.s.squad.includes(5) && !r2_.memberUpdates.b.squad.includes(5), 'vuelve a su dueño');
  ok(r2_.memberUpdates.s.pm[5].c === 9 && !r2_.memberUpdates.s.lo[5] && !r2_.memberUpdates.b.ln[5], 'se restaura la cláusula y se limpian las fichas');
  ok(r2_.news.filter((n) => n.to === 's' || n.to === 'b').length === 2, 'avisos a los dos');
  // el que recibió lo alineó: al volver se quita de su alineación
  const af2 = JSON.parse(JSON.stringify(after)); af2.b.lineup = { DEL: [5, null] };
  ok(planLoans({ now: now + 15 * DAYS, members: af2, base }).memberUpdates.b.lineup.DEL[0] === null, 'se quita de la alineación del que lo tenía');
  // si el que lo tenía ya no está en la liga, vuelve igualmente
  const af3 = JSON.parse(JSON.stringify(after)); delete af3.b;
  ok(planLoans({ now: now + 15 * DAYS, members: af3, base }).memberUpdates.s.squad.includes(5), 'vuelve aunque el otro se haya ido');
  // un jugador cedido no se puede volver a traspasar
  const after4 = JSON.parse(JSON.stringify(after)); after4.m = { name: 'M', cash: 99, squad: sq(60, 12), lineup: {}, role: {}, selling: {}, pm: {}, rev: 0 };
  const d4 = D({ type: 'offer', status: 'accepted', buyer: 'm', seller: 'b', a: 5, amount: 9 });
  ok(planDeals({ now, members: after4, deals: [d4], base, rules: {} }).dealUpdates[d4.id].status === 'failed', 'no se puede comprar a un jugador cedido');
  // planAll junta ambas cosas
  const all = planAll({ now: now + 15 * DAYS, members: after, deals: [], base });
  ok(all.memberUpdates.s && all.memberUpdates.b, 'planAll devuelve las cesiones vencidas');
}
console.log(fail ? 'FALLOS ' + fail : 'TODO OK'); process.exit(fail ? 1 : 0);
