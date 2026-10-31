// Lógica pura del cierre de mercado de una liga (sin Firebase, para poder probarla).
import { LOCK_MS, CLAUSE_MULT, MAX_SQUAD, MIN_SQUAD, clubCount } from './deals-lib.mjs';
export const DAY = 24 * 3600 * 1000;
export const MIN_VALUE = 0.16;
export const CPU_OFFERS = 3; // la liga hace hasta 3 ofertas por un jugador puesto a la venta
const r2 = (x) => Math.round(x * 100) / 100;

// ---- El valor sube o baja según los puntos de cada jornada terminada (solo a quien ha jugado)
// 12 o más: +10 % · 8 a 11: +6 % · 5 a 7: +3 % · 1 a 4: sin cambio · 0 o -1: -3 % · -2 o menos: -6 %
export function pointFactor(pts) {
  const p = Number(pts);
  if (!Number.isFinite(p)) return 0;
  return p >= 12 ? 0.10 : p >= 8 ? 0.06 : p >= 5 ? 0.03 : p >= 1 ? 0 : p >= -1 ? -0.03 : -0.06;
}
// pl: { api: { j: { ronda: puntos } } } · devuelve { api: factor } acumulando las jornadas from+1 ... to
export function roundMoves(pl, from, to) {
  const factors = {};
  for (const [a, e] of Object.entries(pl || {})) {
    if (Number(a) < 0 || !e || !e.j) continue;
    let f = 1;
    for (let r = from + 1; r <= to; r++) if (e.j[r] != null) f *= 1 + pointFactor(e.j[r]);
    if (Math.abs(f - 1) > 1e-9) factors[a] = f;
  }
  return factors;
}

export function shuffle(a, rng = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Jugadores libres: no están en ninguna plantilla ni a la venta.
export function freePlayers(base, members, exclude = []) {
  const taken = new Set(exclude.map(String));
  for (const m of Object.values(members)) {
    (m.squad || []).forEach((a) => taken.add(String(a)));
    Object.keys(m.selling || {}).forEach((a) => taken.add(String(a)));
  }
  return Object.keys(base).filter((a) => !taken.has(a));
}

// Siempre salen algunos entrenadores en el mercado (hasta COACHES), el resto jugadores.
export const COACHES = 2;
export function newCpuListings(base, members, perDay, rng = Math.random, exclude = []) {
  const free = freePlayers(base, members, exclude).map(Number);
  const coaches = shuffle(free.filter((a) => a < 0), rng).slice(0, Math.min(COACHES, Math.floor(perDay / 2)));
  const rest = shuffle(free.filter((a) => a >= 0), rng).slice(0, perDay - coaches.length);
  return shuffle(coaches.concat(rest), rng);
}

export function initialState(now, base, members, perDay, rng = Math.random) {
  return { end: now + DAY, round: 1, values: {}, listings: newCpuListings(base, members, perDay, rng) };
}

// members: {uid:{name,cash,squad,lineup,role,selling,rev,...}}   bids: {uid:{a:amount}}
// base: {a:{v,t,p,n}}   state: {end,round,values,listings}
export function planClose({ now, state, members, bids, base, perDay = 8, anon = false, debtPct = 0, minSquad = MIN_SQUAD, lockMs = LOCK_MS, clauseMult = CLAUSE_MULT, clubMax = 0, rng = Math.random, pointMoves = null }) {
  const values = { ...(state.values || {}) };
  const val = (a) => (values[a] != null ? values[a] : base[a] ? base[a].v : 1);
  if (pointMoves && pointMoves.factors) for (const [a, f] of Object.entries(pointMoves.factors)) values[a] = Math.max(MIN_VALUE, r2(val(a) * f));
  const M = JSON.parse(JSON.stringify(members));
  const changed = new Set();
  const news = [];
  const nameOf = (uid) => (M[uid] ? M[uid].name : 'Un mánager');
  const who = (uid) => (anon ? 'Un mánager' : nameOf(uid));
  const pname = (a) => (base[a] ? base[a].n : 'Jugador ' + a);
  const fmt = (x) => String(Math.round(x * 1e6)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';

  const ownerOf = (a) => Object.keys(M).find((u) => (M[u].squad || []).map(String).includes(String(a)));
  const listings = [];
  for (const a of state.listings || []) if (!ownerOf(a)) listings.push({ a: Number(a), seller: null });
  for (const [uid, m] of Object.entries(M))
    for (const [a, ask] of Object.entries(m.selling || {}))
      if ((m.squad || []).map(String).includes(String(a))) listings.push({ a: Number(a), seller: uid, ask });

  // Endeudamiento permitido: % del valor de la plantilla (lo decide el admin de la liga).
  const teamValue = (uid) => (M[uid].squad || []).reduce((s, a) => s + val(a), 0);
  const avail = (uid) => M[uid].cash + (debtPct > 0 ? (debtPct / 100) * teamValue(uid) : 0);
  const sold = [];
  for (const L of shuffle(listings, rng)) {
    const a = L.a, cpu = L.seller == null, v = val(a), min = cpu ? v : L.ask;
    // un mánager no puede vender si se quedaría con menos de 11 jugadores: el jugador sale del mercado
    if (!cpu && (M[L.seller].squad || []).length <= minSquad) {
      if (M[L.seller].selling) delete M[L.seller].selling[a];
      changed.add(L.seller); L.void = true;
      news.push({ k: 'mercado', to: L.seller, a, x: `${pname(a)} sale del mercado: no puedes quedarte con menos de ${minSquad} jugadores.` });
      continue;
    }
    const cands = [];
    for (const [uid, b] of Object.entries(bids || {})) {
      const amt = b ? b[a] : undefined;
      if (amt == null || uid === L.seller || !M[uid] || amt < min - 1e-9) continue;
      cands.push({ uid, amt, t: rng() });
    }
    cands.sort((x, y) => y.amt - x.amt || x.t - y.t);
    if (cpu) {
      if (!cands.length) values[a] = Math.max(MIN_VALUE, r2(v * 0.97));
      else {
        let rise = cands.reduce((s, c) => s + Math.max(0, c.amt - v) * 0.1, 0);
        rise = Math.min(rise, Math.max(0.25, v * 0.15));
        values[a] = r2(v + rise);
      }
    }
    if (!cands.length) continue;
    const full = (uid) => (M[uid].squad || []).length >= MAX_SQUAD;
    const clubFull = (uid) => !!(clubMax && base[a] && base[a].t && a >= 0 && clubCount(M[uid].squad, base, base[a].t) >= clubMax);
    const win = cands.find((c) => avail(c.uid) + 1e-9 >= c.amt && !full(c.uid) && !clubFull(c.uid));
    for (const c of cands) {
      if (c === win) continue;
      if (avail(c.uid) + 1e-9 < c.amt) news.push({ k: 'mercado', to: c.uid, a: a, x: `Tu puja por ${pname(a)} se anuló por falta de saldo.` });
      else if (clubFull(c.uid)) news.push({ k: 'mercado', to: c.uid, a: a, x: `Tu puja por ${pname(a)} se anuló: límite de ${clubMax} jugadores por club.` });
      else if (full(c.uid)) news.push({ k: 'mercado', to: c.uid, a: a, x: `Tu puja por ${pname(a)} se anuló: tu plantilla está completa (${MAX_SQUAD}).` });
      else if (win) news.push({ k: 'mercado', to: c.uid, a: a, x: `Perdiste la puja por ${pname(a)}: ${who(win.uid)} pagó ${fmt(win.amt)}.` });
    }
    if (!win) continue;
    const buyer = M[win.uid];
    buyer.cash = r2(buyer.cash - win.amt);
    buyer.squad = [...(buyer.squad || []), a];
    if (a < 0 && buyer.coach == null) { buyer.coach = a; buyer.saved = false; }
    buyer.pm = { ...(buyer.pm || {}), [a]: { l: now + lockMs, c: r2(Math.max(win.amt, v) * clauseMult) } };
    changed.add(win.uid);
    if (!cpu) {
      const s = M[L.seller];
      const wasIn = (s.coach != null && String(s.coach) === String(a)) || (s.cap != null && String(s.cap) === String(a)) || Object.values(s.lineup || {}).some((arr) => (arr || []).some((x) => x != null && String(x) === String(a)));
      s.cash = r2(s.cash + win.amt);
      s.squad = s.squad.filter((x) => String(x) !== String(a));
      for (const pos of Object.keys(s.lineup || {})) s.lineup[pos] = s.lineup[pos].map((x) => (String(x) === String(a) ? null : x));
      if (s.role) delete s.role[a];
      if (s.coach != null && String(s.coach) === String(a)) s.coach = (s.squad.find((x) => x < 0) ?? null);
      if (s.selling) delete s.selling[a];
      if (s.pm) delete s.pm[a];
      if (s.cap != null && String(s.cap) === String(a)) s.cap = null;
      if (wasIn) s.saved = false;
      changed.add(L.seller);
      news.push({ k: 'fichaje', to: L.seller, a: a, x: `Vendes a ${pname(a)} a ${who(win.uid)} por ${fmt(win.amt)}.` });
    }
    news.push({ k: 'fichaje', to: win.uid, a: a, x: `Fichas a ${pname(a)}${cpu ? '' : ' de ' + who(L.seller)} por ${fmt(win.amt)}.` });
    news.push({ k: 'fichaje', to: null, a: a, tr: { f: cpu ? null : L.seller, t: win.uid, p: win.amt, k: 'mercado' }, x: `${who(win.uid)} ficha a ${pname(a)}${cpu ? '' : ' de ' + who(L.seller)} por ${fmt(win.amt)}.` });
    sold.push({ a, uid: win.uid, amt: win.amt });
  }

  // Ofertas de la liga por los jugadores que los mánagers han puesto a la venta y nadie ha comprado:
  // en cada cierre ofrece una cantidad (hasta 3 veces); después el jugador vuelve a la plantilla.
  const soldKeys = new Set(sold.map((x) => String(x.a)));
  const prevCpu = state.cpu || {}, nextCpu = {}, cpuNew = [];
  for (const L of listings) {
    if (L.seller == null || L.void || soldKeys.has(String(L.a))) continue;
    const s0 = M[L.seller], key = `${L.seller}|${L.a}`, n = prevCpu[key] || 0, a = L.a;
    if (!s0 || !(s0.selling && s0.selling[a] != null)) continue;
    if (n >= CPU_OFFERS) {
      delete s0.selling[a]; changed.add(L.seller);
      news.push({ k: 'mercado', to: L.seller, a, x: `${pname(a)} no ha encontrado comprador tras ${CPU_OFFERS} ofertas de la liga: vuelve a tu plantilla.` });
      continue;
    }
    const amount = Math.max(MIN_VALUE, r2(val(a) * (0.9 + 0.2 * rng())));
    nextCpu[key] = n + 1;
    cpuNew.push({ seller: L.seller, a, amount, n: n + 1 });
    news.push({ k: 'mercado', to: L.seller, a, x: `La liga te ofrece ${fmt(amount)} por ${pname(a)} (oferta ${n + 1} de ${CPU_OFFERS}). Acéptala en Mercado → Mis ops. → Venta.` });
  }

  const memberUpdates = {};
  for (const uid of changed) {
    const m = M[uid];
    m.pl = m.squad.length;
    m.val = r2(m.squad.reduce((s, a) => s + val(a), 0));
    m.rev = (m.rev || 0) + 1;
    memberUpdates[uid] = { cash: m.cash, squad: m.squad, lineup: m.lineup, role: m.role || {}, selling: m.selling || {}, pm: m.pm || {}, cap: m.cap == null ? null : m.cap, saved: !!m.saved, pl: m.pl, val: m.val, rev: m.rev, coach: m.coach == null ? null : m.coach };
  }
  let end = (state.end || now) + DAY;
  if (end <= now + 3600 * 1000) end = now + DAY;
  const next = { end, round: (state.round || 0) + 1, values, ...(pointMoves ? { vr: pointMoves.upTo } : state.vr != null ? { vr: state.vr } : {}), listings: newCpuListings(base, M, perDay, rng), cpu: nextCpu };
  return { state: next, memberUpdates, news, sold, cpuNew };
}
