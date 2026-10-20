// Lógica pura del cargador de jugadores (sin red ni Firebase, para poder probarla).
export const norm = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const POSMAP = { Goalkeeper: 'POR', Defender: 'DEF', Midfielder: 'MED', Attacker: 'DEL' };
// Precio inicial (millones) cuando no hay valor de mercado conocido.
export const DEFAULT_VALUE = { POR: 0.8, DEF: 1.0, MED: 1.2, DEL: 1.5 };
export const MIN_VALUE = 0.16;

// Busca en la lista de equipos de España los clubes que queremos.
export function pickTeams(apiTeams, wanted) {
  const clubs = apiTeams.map((x) => x.team).filter((t) => t && !t.national);
  const found = [], missing = [];
  for (const w of wanted) {
    const names = w.names.map(norm);
    const hits = clubs.filter((t) => names.includes(norm(t.name)));
    if (!hits.length) { missing.push(w.label); continue; }
    hits.sort((a, b) => (a.founded || 9999) - (b.founded || 9999) || a.id - b.id);
    found.push({ want: w, team: hits[0], extra: hits.length - 1 });
  }
  return { found, missing };
}

// Siglas de 3 letras únicas para cada equipo.
export function makeCodes(teams) {
  const used = new Set(), out = {};
  for (const t of teams) {
    let c = /^[A-Za-z]{3}$/.test(t.code || '') ? t.code.toUpperCase()
      : norm(t.name).replace(/ /g, '').slice(0, 3).toUpperCase();
    if (used.has(c)) {
      const base = norm(t.name).replace(/ /g, '').toUpperCase();
      let alt = null;
      for (let i = 0; i + 3 <= base.length && !alt; i++) { const cand = base.slice(i, i + 3); if (!used.has(cand)) alt = cand; }
      c = alt || (c.slice(0, 2) + (used.size % 10));
    }
    used.add(c); out[t.id] = c;
  }
  return out;
}

export function buildValueIndex(rows) {
  const full = new Map(), sur = new Map();
  let maxSeason = 0;
  const add = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of rows) {
    const v = Number(r.market_value_in_eur);
    const nm = norm(r.name) || norm(`${r.first_name || ''} ${r.last_name || ''}`);
    const e = { val: Number.isFinite(v) ? v : 0, first: norm(r.first_name), club: norm(r.current_club_name), season: Number(r.last_season) || 0 };
    if (e.season > maxSeason) maxSeason = e.season;
    add(full, nm, e);
    const ln = norm(r.last_name) || nm.split(' ').slice(-1)[0];
    add(sur, ln, e);
    const lt = ln.split(' ').slice(-1)[0];
    if (lt !== ln) add(sur, lt, e);
  }
  return { full, sur, maxSeason };
}

// Devuelve el valor en millones o null si no hay coincidencia.
export function matchValue(idx, apiName, teamName) {
  if (!idx) return null;
  const n = norm(apiName), toks = n.split(' ');
  let initial = null, sur = n;
  if (toks.length > 1 && toks[0].length === 1) { initial = toks[0]; sur = toks.slice(1).join(' '); }
  const tn = norm(teamName).split(' ').filter((w) => w.length > 2);
  const score = (e) => (tn.some((w) => e.club.includes(w)) ? 1000 : 0) + (e.season >= idx.maxSeason - 1 ? 100 : 0) + Math.min(e.val / 1e6, 99);
  const pick = (l) => (l && l.length ? l.slice().sort((a, b) => score(b) - score(a))[0] : null);
  let hit = null;
  if (!initial) hit = pick(idx.full.get(n));
  if (!hit) {
    const lastTok = sur.split(' ').slice(-1)[0];
    for (const key of [sur, lastTok]) {
      let l = idx.sur.get(key);
      if (!l) continue;
      if (initial) l = l.filter((e) => e.first.startsWith(initial));
      if (l.length) { hit = pick(l); break; }
    }
  }
  return hit && hit.val > 0 ? hit.val / 1e6 : null;
}

// picked: resultado de pickTeams().found ; squads: { [teamId]: [{id,name,age,number,position,photo}] }
export function buildCatalog(picked, codes, squads, idx) {
  const teams = [], players = [], seen = new Set();
  const stats = { players: 0, priced: 0, defaulted: 0, skipped: 0, perTeam: {} };
  for (const { want, team } of picked) {
    const code = codes[team.id];
    teams.push({ i: team.id, c: code, n: want.label });
    const list = squads[team.id] || [];
    stats.perTeam[want.label] = 0;
    for (const p of list) {
      const pos = POSMAP[p.position];
      if (!pos || p.id == null || seen.has(p.id)) { stats.skipped++; continue; }
      seen.add(p.id);
      let v = matchValue(idx, p.name, team.name);
      if (v == null) { v = DEFAULT_VALUE[pos]; stats.defaulted++; } else stats.priced++;
      v = Math.max(MIN_VALUE, Math.round(v * 100) / 100);
      players.push({ a: p.id, n: p.name, t: code, p: pos, v, num: p.number == null ? null : p.number });
      stats.players++; stats.perTeam[want.label]++;
    }
  }
  return { teams, players, stats };
}
