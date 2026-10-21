// Lógica pura del cierre de mercado de una liga (sin Firebase, para poder probarla).
import { LOCK_MS, CLAUSE_MULT } from './deals-lib.mjs';
export const DAY = 24 * 3600 * 1000;
export const MIN_VALUE = 0.16;
const r2 = (x) => Math.round(x * 100) / 100;

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
export function planClose({ now, state, members, bids, base, perDay = 8, anon = false, debtPct = 0, rng = Math.random }) {
  const values = { ...(state.values || {}) };
  const val = (a) => (values[a] != null ? values[a] : base[a] ? base[a].v : 1);
  const M = JSON.parse(JSON.stringify(members));
  const changed = new Set();
  const news = [];
  const nameOf = (uid) => (M[uid] ? M[uid].name : 'Un mánager');
  const who = (uid) => (anon ? 'Un mánager' : nameOf(uid));
  const pname = (a) => (base[a] ? base[a].n : 'Jugador ' + a);
  const fmt = (x) => x.toFixed(2).replace('.', ',') + ' M';

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
    const win = cands.find((c) => avail(c.uid) + 1e-9 >= c.amt);
    for (const c of cands) {
      if (c === win) continue;
      if (avail(c.uid) + 1e-9 < c.amt) news.push({ k: 'mercado', to: c.uid, a: a, x: `Tu puja por ${pname(a)} se anuló por falta de saldo.` });
      else if (win) news.push({ k: 'mercado', to: c.uid, a: a, x: `Perdiste la puja por ${pname(a)}: ${who(win.uid)} pagó ${fmt(win.amt)}.` });
    }
    if (!win) continue;
    const buyer = M[win.uid];
    buyer.cash = r2(buyer.cash - win.amt);
    buyer.squad = [...(buyer.squad || []), a];
    if (a < 0 && buyer.coach == null) buyer.coach = a;
    buyer.pm = { ...(buyer.pm || {}), [a]: { l: now + LOCK_MS, c: r2(Math.max(win.amt, v) * CLAUSE_MULT) } };
    buyer.saved = false;
    changed.add(win.uid);
    if (!cpu) {
      const s = M[L.seller];
      s.cash = r2(s.cash + win.amt);
      s.squad = s.squad.filter((x) => String(x) !== String(a));
      for (const pos of Object.keys(s.lineup || {})) s.lineup[pos] = s.lineup[pos].map((x) => (String(x) === String(a) ? null : x));
      if (s.role) delete s.role[a];
      if (s.coach != null && String(s.coach) === String(a)) s.coach = (s.squad.find((x) => x < 0) ?? null);
      if (s.selling) delete s.selling[a];
      if (s.pm) delete s.pm[a];
      if (s.cap != null && String(s.cap) === String(a)) s.cap = null;
      s.saved = false;
      changed.add(L.seller);
      news.push({ k: 'fichaje', to: L.seller, a: a, x: `Vendes a ${pname(a)} a ${who(win.uid)} por ${fmt(win.amt)}.` });
    }
    news.push({ k: 'fichaje', to: win.uid, a: a, x: `Fichas a ${pname(a)}${cpu ? '' : ' de ' + who(L.seller)} por ${fmt(win.amt)}.` });
    news.push({ k: 'fichaje', to: null, a: a, x: `${who(win.uid)} ficha a ${pname(a)}${cpu ? '' : ' de ' + who(L.seller)} por ${fmt(win.amt)}.` });
    sold.push({ a, uid: win.uid, amt: win.amt });
  }

  const memberUpdates = {};
  for (const uid of changed) {
    const m = M[uid];
    m.pl = m.squad.length;
    m.val = r2(m.squad.reduce((s, a) => s + val(a), 0));
    m.rev = (m.rev || 0) + 1;
    memberUpdates[uid] = { cash: m.cash, squad: m.squad, lineup: m.lineup, role: m.role || {}, selling: m.selling || {}, pm: m.pm || {}, cap: m.cap == null ? null : m.cap, saved: m.saved, pl: m.pl, val: m.val, rev: m.rev, coach: m.coach == null ? null : m.coach };
  }
  let end = (state.end || now) + DAY;
  if (end <= now + 3600 * 1000) end = now + DAY;
  const next = { end, round: (state.round || 0) + 1, values, listings: newCpuListings(base, M, perDay, rng) };
  return { state: next, memberUpdates, news, sold };
}
