// Foto de elegibilidad al empezar una jornada: quien tenga saldo negativo o menos de 11 jugadores
// alineados en ese momento no puntúa esa jornada.
import { coreMatches, currentRound } from './results-lib.mjs';

export const MIN_LINEUP = 11;
export const lineupCount = (m) => ['POR', 'DEF', 'MED', 'DEL'].reduce((n, p) => n + ((m.lineup && m.lineup[p]) || []).filter((x) => x != null).length, 0);

// Devuelve { round, elig } si hay que hacer la foto de la jornada en curso (ya empezó y aún no existe), o null.
// done: Map jornada → true si la foto ya incluye el once (si es una foto antigua sin once, se rehace una vez).
export function planRound({ now, matches, members, done }) {
  if (!matches || !matches.length) return null;
  const round = currentRound(matches, now);
  const core = coreMatches(matches, now).filter((m) => m.r === round);
  if (!core.length) return null;
  const start = Math.min(...core.map((m) => +new Date(m.d)));
  if (now < start || (done.get ? done.get(round) === true : done.has(round))) return null;
  const elig = {};
  for (const [uid, m] of Object.entries(members)) {
    const n = lineupCount(m), neg = (+m.cash || 0) < -1e-9;
    const lu = {};
    for (const p of ['POR', 'DEF', 'MED', 'DEL']) lu[p] = ((m.lineup && m.lineup[p]) || []).map((x) => (x == null ? null : x));
    elig[uid] = { ok: !neg && n >= MIN_LINEUP, n, neg, lu, cp: m.cap == null ? null : m.cap, co: m.coach == null ? null : m.coach };
  }
  return { round, start, elig };
}

// ---- Cierre de jornadas en el servidor: así la clasificación no depende de que cada mánager abra la app.
// Jornadas terminadas = todas sus partidos "de la jornada" jugados (>= 6 partidos), igual que en la app.
export function doneRounds(matches, now = Date.now()) {
  const by = {};
  for (const m of coreMatches(matches, now)) { const b = (by[m.r] = by[m.r] || { n: 0, d: 0 }); b.n++; if (m.st === 'post') b.d++; }
  return Object.keys(by).map(Number).filter((r) => by[r].n >= 6 && by[r].d === by[r].n).sort((a, b) => a - b);
}

// members: {uid:{rp,r0,lineup,cap,coach,tot}}, snaps: {round:{uid:{ok,lu,cp,co}}}, season: {pl:{a:{j}},coach:{team:{j}}}, base: {a:{t}}
// Devuelve {uid:{rp:{r:pts}, tot, j}} solo con las jornadas que faltaban.
export function planSettle({ matches, now = Date.now(), members, snaps = {}, season, base, capOn = false }) {
  const done = doneRounds(matches, now), out = {};
  const pj = (a, r) => ((season.pl && season.pl[a] && season.pl[a].j) || {})[r] || 0;
  const cj = (a, r) => { const t = base[a] && base[a].t; return ((season.coach && season.coach[t] && season.coach[t].j) || {})[r] || 0; };
  for (const [uid, m] of Object.entries(members)) {
    if (m.r0 == null) continue;
    const rp = { ...(m.rp || {}) }; let add = false;
    for (const r of done) {
      if (r < m.r0 || rp[r] != null) continue;
      const e = (snaps[r] || {})[uid];
      let pts = 0;
      if (!(e && e.ok === false)) {
        const L = e && e.lu ? { lu: e.lu, cp: e.cp, co: e.co } : { lu: m.lineup || {}, cp: m.cap == null ? null : m.cap, co: m.coach == null ? null : m.coach };
        for (const p of ['POR', 'DEF', 'MED', 'DEL']) for (const a of L.lu[p] || []) if (a != null) pts += pj(a, r) * (capOn && L.cp != null && String(a) === String(L.cp) ? 2 : 1);
        if (L.co != null) pts += cj(L.co, r);
      }
      rp[r] = pts; add = true;
    }
    if (!add) continue;
    const ks = Object.keys(rp).map(Number).sort((x, y) => x - y);
    out[uid] = { rp, tot: ks.reduce((s, k) => s + rp[k], 0), j: rp[ks[ks.length - 1]], added: ks.filter((k) => (m.rp || {})[k] == null) };
  }
  return out;
}

// Prima por puntos: al cerrar cada jornada se ingresa «puntos × prima» (la prima la fija el admin).
// members: {uid:{rp,r0,cash,bp,rev}}  → {uid:{cash, bp, credit, rounds}}  (cada jornada se paga una sola vez)
export function planBonus({ matches, now = Date.now(), members, bonus }) {
  const out = {};
  if (!(bonus > 0)) return out;
  const done = new Set(doneRounds(matches, now));
  for (const [uid, m] of Object.entries(members)) {
    if (m.r0 == null) continue;
    const bp = { ...(m.bp || {}) }, rounds = []; let credit = 0;
    for (const [r, pts] of Object.entries(m.rp || {})) {
      if (!done.has(+r) || +r < m.r0 || bp[r]) continue;
      credit += Math.max(0, +pts || 0) * bonus; bp[r] = true; rounds.push(+r);
    }
    if (!rounds.length) continue;
    credit = Math.round(credit * 100) / 100;
    out[uid] = { cash: Math.round(((+m.cash || 0) + credit) * 100) / 100, bp, credit, rounds: rounds.sort((a, b) => a - b) };
  }
  return out;
}

// ---- 11 ideal: el mejor once de cada jornada entre TODOS los jugadores (1 portero + la mejor formación posible).
export const FORMS = { '4-4-2': [4, 4, 2], '4-3-3': [4, 3, 3], '3-5-2': [3, 5, 2], '3-4-3': [3, 4, 3], '4-5-1': [4, 5, 1], '5-3-2': [5, 3, 2], '5-4-1': [5, 4, 1] };
// season.pl:{a:{j:{r:pts}}}, base:{a:{p}} → {f, ids:[a...], pts} o null si no hay once completo
export function idealXI(season, base, round) {
  const by = { POR: [], DEF: [], MED: [], DEL: [] };
  for (const [a, x] of Object.entries(season.pl || {})) {
    const pos = base[a] && base[a].p, v = x && x.j && x.j[round];
    if (by[pos] && v != null) by[pos].push({ a: +a, v });
  }
  for (const k in by) by[k].sort((x, y) => y.v - x.v || x.a - y.a);
  let best = null;
  for (const [f, [d, m, l]] of Object.entries(FORMS)) {
    if (by.POR.length < 1 || by.DEF.length < d || by.MED.length < m || by.DEL.length < l) continue;
    const pick = [...by.POR.slice(0, 1), ...by.DEF.slice(0, d), ...by.MED.slice(0, m), ...by.DEL.slice(0, l)];
    const pts = pick.reduce((s, x) => s + x.v, 0);
    if (!best || pts > best.pts) best = { f, ids: pick.map((x) => x.a), pts };
  }
  return best;
}
// Calcula los onces ideales de las jornadas terminadas que faltan. have: {r:{...}} ya guardados.
export function planIdeal({ matches, now = Date.now(), season, base, have = {} }) {
  const out = {};
  for (const r of doneRounds(matches, now)) { if (have[r]) continue; const x = idealXI(season, base, r); if (x) out[r] = x; }
  return out;
}
// Paga por cada jugador de la plantilla que está en el once ideal. members:{uid:{squad,r0,cash,ip}}, ideal:{r:{ids}}, per: M por jugador
// Cada jornada se trata una sola vez (ip[r] = nº de jugadores cobrados; 0 si el admin no tenía prima activada).
export function payIdeal({ members, ideal, per }) {
  const out = {};
  for (const [uid, m] of Object.entries(members)) {
    if (m.r0 == null) continue;
    const ip = { ...(m.ip || {}) }, rounds = []; let credit = 0, n = 0;
    const sq = new Set((m.squad || []).map(String));
    for (const r of Object.keys(ideal).map(Number).sort((a, b) => a - b)) {
      if (r < m.r0 || ip[r] != null) continue;
      const c = ideal[r].ids.filter((a) => sq.has(String(a))).length;
      ip[r] = per > 0 ? c : 0;
      if (per > 0 && c) { credit += c * per; n += c; rounds.push({ r, c }); }
      else if (per <= 0 || !c) rounds.push({ r, c: 0, none: true });
    }
    if (!rounds.length) continue;
    credit = Math.round(credit * 100) / 100;
    out[uid] = { ip, credit, n, rounds: rounds.filter((x) => !x.none), cash: Math.round(((+m.cash || 0) + credit) * 100) / 100 };
  }
  return out;
}
