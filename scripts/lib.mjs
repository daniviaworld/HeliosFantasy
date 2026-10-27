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

const TMPOS = { goalkeeper: 'POR', defender: 'DEF', midfield: 'MED', attack: 'DEL' };
export function buildValueIndex(rows) {
  const full = new Map(), sur = new Map();
  let maxSeason = 0;
  const add = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const r of rows) {
    const v = Number(r.market_value_in_eur);
    const nm = norm(r.name) || norm(`${r.first_name || ''} ${r.last_name || ''}`);
    const e = { name: r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim(), val: Number.isFinite(v) ? v : 0, first: norm(r.first_name), club: norm(r.current_club_name), season: Number(r.last_season) || 0, pos: TMPOS[String(r.position || '').toLowerCase()] || null };
    if (e.season > maxSeason) maxSeason = e.season;
    add(full, nm, e);
    const ln = norm(r.last_name) || nm.split(' ').slice(-1)[0];
    add(sur, ln, e);
    for (const tk of ln.split(' ')) if (tk.length > 1 && tk !== ln) add(sur, tk, e); // «López Marín» también se encuentra por «López»
  }
  return { full, sur, maxSeason };
}

// Devuelve {val (millones), clubHits, cands, dubious} o null si no hay coincidencia.
// El club manda: cuenta cuántas palabras del club coinciden (así «Real Madrid» no se confunde con «Real Betis»).
export function matchValueInfo(idx, apiName, teamName, pos) {
  if (!idx) return null;
  const n = norm(apiName), toks = n.split(' ');
  let initial = null, sur = n;
  if (toks.length > 1 && toks[0].length === 1) { initial = toks[0]; sur = toks.slice(1).join(' '); }
  const tn = norm(teamName).split(' ').filter((w) => w.length > 2);
  const hits = (e) => tn.filter((w) => e.club.split(' ').includes(w) || e.club.includes(w)).length;
  const score = (e) => hits(e) * 1000 + (e.season >= idx.maxSeason - 1 ? 100 : 0) + Math.min(e.val / 1e6, 99);
  // si conocemos la posición, descartamos homónimos de otra posición (siempre que quede alguno)
  const byPos = (l) => { if (!pos || !l) return l; const f = l.filter((e) => !e.pos || e.pos === pos); return f.length ? f : l; };
  const pick = (l) => (l && l.length ? l.slice().sort((a, b) => score(b) - score(a))[0] : null);
  let hit = null, cands = [];
  if (!initial) { cands = byPos(idx.full.get(n) || []); hit = pick(cands); }
  if (!hit) {
    const lastTok = sur.split(' ').slice(-1)[0];
    for (const key of [sur, lastTok]) {
      let l = idx.sur.get(key);
      if (!l) continue;
      if (initial) l = l.filter((e) => e.first.startsWith(initial));
      else if (toks.length > 1) { const f0 = toks[0]; l = l.filter((e) => !e.first || e.first.startsWith(f0) || f0.startsWith(e.first.split(' ')[0])); } // nombre completo: debe coincidir el nombre de pila
      l = byPos(l);
      if (l.length) { cands = l; hit = pick(l); break; }
    }
  }
  if (!hit || !(hit.val > 0)) return null;
  const clubHits = hits(hit);
  const rivals = cands.filter((e) => e !== hit && hits(e) === clubHits && e.val > 0 && Math.abs(e.val - hit.val) > 0.3 * hit.val);
  // dudoso: no coincide el club, o hay otro candidato con la misma coincidencia de club y un valor muy distinto
  // dudoso de verdad: el club no coincide Y hay varios homónimos, o hay otro candidato del mismo club con valor muy distinto.
  // Si solo hay un candidato con otro club, casi siempre es un traspaso que el archivo aún no recoge: se da por bueno.
  const dubious = (clubHits === 0 && cands.length > 1) || rivals.length > 0;
  const top = cands.slice().sort((a, b) => score(b) - score(a)).slice(0, 6).map((e) => ({ name: e.name, club: e.club, val: e.val / 1e6, season: e.season, pos: e.pos }));
  return { val: hit.val / 1e6, clubHits, club: hit.club, cands: cands.length, dubious, stale: clubHits === 0 && cands.length === 1, top };
}
export function matchValue(idx, apiName, teamName) {
  const r = matchValueInfo(idx, apiName, teamName);
  return r ? r.val : null;
}

// picked: resultado de pickTeams().found ; squads: { [teamId]: [{id,name,age,number,position,photo}] }
export function buildCatalog(picked, codes, squads, idx) {
  const teams = [], players = [], seen = new Set();
  const stats = { players: 0, priced: 0, defaulted: 0, skipped: 0, perTeam: {}, dubious: [] };
  for (const { want, team } of picked) {
    const code = codes[team.id];
    teams.push({ i: team.id, c: code, n: want.label });
    const list = squads[team.id] || [];
    stats.perTeam[want.label] = 0;
    for (const p of list) {
      const pos = POSMAP[p.position];
      if (!pos || p.id == null || seen.has(p.id)) { stats.skipped++; continue; }
      seen.add(p.id);
      const mi = matchValueInfo(idx, p.name, team.name, pos);
      let v = mi ? mi.val : null;
      if (v == null) { v = DEFAULT_VALUE[pos]; stats.defaulted++; } else { stats.priced++; if (mi.dubious) stats.dubious.push({ name: p.name, team: team.name, value: mi.val, matchedClub: mi.club, candidates: mi.cands }); }
      v = Math.max(MIN_VALUE, Math.round(v * 100) / 100);
      players.push({ a: p.id, n: p.name, t: code, p: pos, v, num: p.number == null ? null : p.number });
      stats.players++; stats.perTeam[want.label]++;
    }
  }
  return { teams, players, stats };
}

// Entrenadores: la API devuelve los de un equipo con su carrera; el actual es el que no tiene fecha de fin en ese equipo.
export const COACH_VALUE = 1;
export function pickCoach(list, teamId) {
  if (!Array.isArray(list) || !list.length) return null;
  const cur = list.find((c) => (c.career || []).some((k) => k.team && k.team.id === teamId && k.end == null));
  if (cur) return cur;
  return list.length === 1 ? list[0] : null;
}
// Los entrenadores entran en el catálogo como jugadores con posición ENT y id negativo (-id de la API),
// así nunca chocan con los ids de jugadores y el mercado los trata igual.
export function coachEntry(c, code) {
  if (!c || c.id == null || !c.name) return null;
  return { a: -Math.abs(c.id), n: c.name, t: code, p: 'ENT', v: COACH_VALUE, num: null };
}
