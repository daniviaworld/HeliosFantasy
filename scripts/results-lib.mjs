// Lógica pura de resultados y puntos (sin red ni Firebase) a partir de los datos de ESPN.
import { norm } from './lib.mjs';

// ---- Fórmula Helios (la misma que se ve en Ajustes de la app)
export const FORMULA = {
  goal: { POR: 6, DEF: 6, MED: 5, DEL: 4, ENT: 0 },
  assist: 3, minutes60: 2, cleanSheet: 4, penScored: 3, penMissed: -2, yellow: -1, red: -3, ownGoal: -2,
};
export const COACH = { win: 5, draw: 2, loss: 0 };

export function playerPoints(s, pos) {
  const g = FORMULA.goal[pos] || 0;
  let p = 0;
  p += (s.goals || 0) * g;
  p += (s.assists || 0) * FORMULA.assist;
  if ((s.minutes || 0) > 60) p += FORMULA.minutes60;
  if (s.cleanSheet && (pos === 'POR' || pos === 'DEF') && (s.minutes || 0) > 60) p += FORMULA.cleanSheet;
  p += (s.penScored || 0) * FORMULA.penScored + (s.penMissed || 0) * FORMULA.penMissed;
  p += (s.yellow || 0) * FORMULA.yellow + (s.red || 0) * FORMULA.red;
  p += (s.ownGoals || 0) * FORMULA.ownGoal;
  return p;
}
export function coachPoints(own, other) { return own > other ? COACH.win : own === other ? COACH.draw : COACH.loss; }

// ---- equipos de ESPN -> siglas del catálogo
export function makeTeamMap(wanted, catalogTeams) {
  const byLabel = {};
  for (const t of catalogTeams) byLabel[norm(t.n)] = t.c;
  const m = {};
  for (const w of wanted) {
    const code = byLabel[norm(w.label)];
    if (!code) continue;
    for (const n of w.names.concat([w.label])) m[norm(n)] = code;
  }
  return (name) => m[norm(name)] || null;
}

// ---- calendario
export function parseScoreboard(json) {
  const out = [];
  for (const e of (json && json.events) || []) {
    const c = e.competitions && e.competitions[0];
    if (!c || !c.competitors) continue;
    const home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away');
    if (!home || !away) continue;
    const t = (e.status && e.status.type) || (c.status && c.status.type) || {};
    out.push({
      id: String(e.id), d: e.date,
      h: { id: String(home.team.id), n: home.team.displayName, s: +home.score || 0 },
      a: { id: String(away.team.id), n: away.team.displayName, s: +away.score || 0 },
      st: t.completed ? 'post' : (t.state === 'in' ? 'in' : 'pre'),
    });
  }
  return out;
}

// Jornada = número de partido de cada equipo (aguanta aplazamientos de forma aproximada).
// Jornadas por ventana de fechas: un partido entra en la jornada abierta si cae a <=4 días de su inicio
// y ninguno de sus equipos juega ya en ella; si no, abre una jornada nueva.
export function assignRounds(matches) {
  const sorted = matches.slice().sort((x, y) => x.d.localeCompare(y.d) || x.id.localeCompare(y.id));
  const rounds = [];
  const DAY = 86400000;
  for (const m of sorted) {
    const t = +new Date(m.d);
    let r = null;
    for (let i = rounds.length - 1; i >= 0 && i >= rounds.length - 2; i--) {
      const R = rounds[i];
      if (t - R.start <= 4 * DAY && !R.teams.has(m.h.id) && !R.teams.has(m.a.id)) { r = R; break; }
    }
    if (!r) { r = { start: t, teams: new Set(), n: rounds.length + 1 }; rounds.push(r); }
    r.teams.add(m.h.id); r.teams.add(m.a.id); m.r = r.n;
  }
  return sorted;
}
export function currentRound(matches) {
  const open = matches.filter((m) => m.st !== 'post');
  if (open.length) return Math.min(...open.map((m) => m.r));
  return matches.length ? Math.max(...matches.map((m) => m.r)) : 1;
}

// ---- resumen de un partido
const clockMin = (ev) => {
  const c = ev && ev.clock;
  if (!c) return null;
  if (typeof c.value === 'number') return Math.floor(c.value / 60);
  const m = /(\d+)/.exec(c.displayValue || '');
  return m ? +m[1] : null;
};
const POSMAP = { G: 'POR', GK: 'POR', D: 'DEF', CD: 'DEF', LB: 'DEF', RB: 'DEF', M: 'MED', F: 'DEL', CF: 'DEL', ST: 'DEL' };
const statVal = (p, name) => { const s = (p.stats || []).find((x) => x.name === name); return s ? +s.value || 0 : 0; };

// Devuelve, por equipo (id ESPN), la lista de jugadores con sus estadísticas del partido.
export function parseSummary(sum, match) {
  const ev = sum.keyEvents || [];
  const teams = {};
  const conceded = { [match.h.id]: match.a.s, [match.a.id]: match.h.s };
  const per = {}; // espnAthleteId -> stats
  const get = (id) => (per[id] = per[id] || { goals: 0, assists: 0, penScored: 0, penMissed: 0, yellow: 0, red: 0, ownGoals: 0, inMin: null, outMin: null });
  const pid = (x) => x && x.athlete && String(x.athlete.id);
  for (const e of ev) {
    const type = String((e.type && (e.type.type || e.type.text)) || '').toLowerCase().replace(/\s+/g, '-');
    const parts = e.participants || [];
    const first = pid(parts[0]);
    const min = clockMin(e);
    if (type.includes('own')) { if (first) get(first).ownGoals++; continue; }
    if (type.includes('penalty') && /miss|saved|off-target|wide|hit/.test(type + ' ' + (e.text || '').toLowerCase()) && !type.includes('scored')) { if (first) get(first).penMissed++; continue; }
    if (type.includes('penalty') && type.includes('scored')) { if (first) { get(first).goals++; get(first).penScored++; } continue; }
    if (type === 'goal' || type.startsWith('goal')) {
      if (first) get(first).goals++;
      const a = pid(parts[1]);
      if (a) get(a).assists++;
      continue;
    }
    if (type.includes('yellow') && type.includes('red')) { if (first) { get(first).yellow++; get(first).red++; } continue; }
    if (type.includes('yellow')) { if (first) get(first).yellow++; continue; }
    if (type.includes('red')) { if (first) get(first).red++; continue; }
    if (type.includes('substitution')) {
      // texto: "Substitution, Team. X replaces Y." -> entra X, sale Y
      const m = /(?:\.|,)\s*([^.]+?) replaces ([^.]+?)(?:\.| because|$)/i.exec(e.text || '');
      e._sub = { min, inName: m && norm(m[1]), outName: m && norm(m[2]), parts: parts.map(pid) };
    }
  }
  for (const side of sum.rosters || []) {
    const tid = String(side.team && side.team.id);
    const list = [];
    for (const p of side.roster || []) {
      const a = p.athlete || {};
      const id = String(a.id);
      const st = get(id);
      const names = [a.fullName, a.displayName, a.shortName].map(norm);
      // minutos
      let inMin = p.starter ? 0 : null, outMin = null;
      for (const e of ev) {
        if (!e._sub) continue;
        const nm = names;
        if (e._sub.inName && nm.some((n) => n && (n === e._sub.inName || e._sub.inName.endsWith(n) || n.endsWith(e._sub.inName)))) inMin = e._sub.min;
        if (e._sub.outName && nm.some((n) => n && (n === e._sub.outName || e._sub.outName.endsWith(n) || n.endsWith(e._sub.outName)))) outMin = e._sub.min;
      }
      let minutes = 0;
      if (p.starter) minutes = p.subbedOut ? (outMin != null ? outMin : 55) : 90;
      else if (p.subbedIn || statVal(p, 'subIns') > 0) minutes = 90 - (inMin != null ? inMin : 70);
      const pos = POSMAP[(a.position && a.position.abbreviation) || ''] || null;
      // los goles/asistencias/tarjetas de la plantilla (stats) respaldan a keyEvents si faltan
      const goals = Math.max(st.goals, statVal(p, 'totalGoals') - st.ownGoals * 0);
      const assists = Math.max(st.assists, statVal(p, 'goalAssists'));
      const yellow = Math.max(st.yellow, statVal(p, 'yellowCards'));
      const red = Math.max(st.red, statVal(p, 'redCards'));
      list.push({
        espnId: id, names, pos, minutes: Math.max(0, minutes), played: minutes > 0,
        goals, assists, penScored: st.penScored, penMissed: st.penMissed, yellow, red, ownGoals: Math.max(st.ownGoals, statVal(p, 'ownGoals')),
        cleanSheet: (conceded[tid] === 0),
      });
    }
    teams[tid] = list;
  }
  return teams;
}

// ---- emparejar jugadores de ESPN con los del catálogo (por club y nombre)
export function makeMatcher(players) {
  const byTeam = {};
  for (const p of players) { if (p.p === 'ENT') continue; (byTeam[p.t] = byTeam[p.t] || []).push({ ...p, nn: norm(p.n), toks: norm(p.n).split(' ') }); }
  return function match(code, names) {
    const list = byTeam[code] || [];
    const ns = names.filter(Boolean);
    for (const n of ns) { const h = list.filter((p) => p.nn === n); if (h.length === 1) return h[0].a; }
    for (const n of ns) {
      const nt = n.split(' ');
      const h = list.filter((p) => {
        const a = nt.length <= p.toks.length ? nt : p.toks, b = nt.length <= p.toks.length ? p.toks : nt;
        return a.length >= 1 && a.every((t) => b.includes(t)) && (a.length >= 2 || (a[0].length > 3));
      });
      if (h.length === 1) return h[0].a;
    }
    // apellido + inicial: "A. Valles" vs "Alvaro Valles"
    for (const n of ns) {
      const nt = n.split(' ');
      if (nt.length < 2) continue;
      const last = nt[nt.length - 1], ini = nt[0][0];
      const h = list.filter((p) => p.toks[p.toks.length - 1] === last && p.toks[0][0] === ini);
      if (h.length === 1) return h[0].a;
    }
    return null;
  };
}

// Puntos de un partido: devuelve { pl: {apiId: {p, ...}}, coach: {code: pts}, unmatched: [...] }
export function scoreMatch({ match, summary, teamCode, matcher }) {
  const teams = parseSummary(summary, match);
  const pl = {}, unmatched = [];
  for (const [tid, list] of Object.entries(teams)) {
    const side = match.h.id === tid ? match.h : match.a;
    const code = teamCode(side.n);
    if (!code) { unmatched.push(`equipo ${side.n}`); continue; }
    for (const p of list) {
      if (!p.played && !p.goals && !p.assists && !p.yellow && !p.red && !p.ownGoals) continue;
      const api = matcher(code, p.names);
      if (api == null) { unmatched.push(`${code}:${p.names[0]}`); continue; }
      const pos = p.pos || 'MED';
      const posReal = null;
      pl[api] = { pts: null, pos, ...p };
    }
  }
  return { pl, unmatched, teams };
}

// Aplica la posición real del catálogo para puntuar.
export function finalizePoints(res, catalogByApi) {
  const out = {};
  for (const [api, s] of Object.entries(res.pl)) {
    const pos = (catalogByApi[api] && catalogByApi[api].p) || s.pos;
    out[api] = playerPoints(s, pos);
  }
  return out;
}
