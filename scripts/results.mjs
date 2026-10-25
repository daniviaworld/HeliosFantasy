// Actualiza calendario, resultados y puntos de LaLiga en Firestore a partir de ESPN (sin clave).
//   catalog/fixtures  -> calendario y jornada actual
//   points/season     -> puntos por jugador y jornada, y del entrenador
// Variables: FIREBASE_SERVICE_ACCOUNT (obligatoria salvo DRY_RUN=1), FULL=1 (rescanear toda la temporada), SEASON_START (AAAA-MM-DD)
import fs from 'node:fs';
import { norm } from './lib.mjs';
import { planSettle, planBonus, planIdeal, payIdeal } from './rounds-lib.mjs';
import { parseScoreboard, assignRounds, currentRound, lastCompleteRound, medianPlayed, shiftRounds, makeTeamMap, makeMatcher, scoreMatch, finalizePoints, coachPoints, resolveUnmatched, statArr, addStat , planSuspensions, parseInjuries, parseApiInjuries } from './results-lib.mjs';

const DRY = !!process.env.DRY_RUN, FULL = !!process.env.FULL;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA && !DRY) { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const E = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';
const H = { 'User-Agent': 'Mozilla/5.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Devuelve el JSON, o null si tras varios intentos no hay respuesta válida (nunca se da por bueno un hueco).
async function get(u) {
  for (let i = 1; i <= 5; i++) {
    try { const r = await fetch(u, { headers: H }); if (r.ok) return await r.json(); console.warn(`   (HTTP ${r.status} en ${u.replace(E, '')}, intento ${i})`); } catch (e) { console.warn(`   (error de red en ${u.replace(E, '')}, intento ${i})`); }
    await sleep(1200 * i);
  }
  return null;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

let db = null, admin = null;
if (SA) {
  admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
  db = admin.firestore();
}
let cat;
if (db) { const c = await db.doc('catalog/main').get(); if (!c.exists) { console.error('No hay catálogo.'); process.exit(1); } cat = c.data(); }
else cat = JSON.parse(fs.readFileSync(process.env.CATALOG || 'catalog-preview.json', 'utf8'));
const wanted = JSON.parse(fs.readFileSync(new URL('./laliga-teams.json', import.meta.url), 'utf8'));
const teamCode = makeTeamMap(wanted, cat.teams);
const byApi = {}; for (const p of cat.players) byApi[p.a] = p;
let aliases = {};
try { aliases = JSON.parse(fs.readFileSync(new URL('./aliases.json', import.meta.url), 'utf8')); } catch (e) { aliases = {}; }
delete aliases._ayuda;
const matcher = makeMatcher(cat.players, aliases);

const fxSnap = db ? await db.doc('catalog/fixtures').get() : null;
const prevFx = fxSnap && fxSnap.exists ? fxSnap.data() : null;
const sSnap = db ? await db.doc('points/season').get() : null;
const season = sSnap && sSnap.exists ? sSnap.data() : { pl: {}, coach: {}, done: {} };
if (FULL) { season.pl = {}; season.coach = {}; season.done = {}; }
season.pl = season.pl || {}; season.coach = season.coach || {}; season.done = season.done || {};

// 1) calendario
const now = new Date(), day = 864e5;
const start = (!prevFx || FULL) ? new Date((process.env.SEASON_START || '2026-08-01') + 'T00:00:00Z') : new Date(+now - 7 * day);
const end = new Date(+now + 14 * day);
const all = new Map();
for (const m of (prevFx && prevFx.matches) || []) all.set(m.id, { id: m.id, d: m.d, h: { id: m.hi, n: m.hn, s: m.hs }, a: { id: m.ai, n: m.an, s: m.as }, st: m.st });
let calls = 0;
const failedDays = [];
for (let t = new Date(start); t <= end; t = new Date(+t + day)) {
  const j = await get(`${E}/scoreboard?dates=${ymd(t)}`); calls++;
  if (!j) { failedDays.push(ymd(t)); continue; }
  for (const m of parseScoreboard(j)) {
    if (!teamCode(m.h.n) || !teamCode(m.a.n)) continue;
    all.set(m.id, m);
  }
  await sleep(450);
}
if (failedDays.length) {
  console.error(`ERROR: ESPN no respondió para ${failedDays.length} días: ${failedDays.join(', ')}. No se guarda nada para no dejar el calendario incompleto.`);
  process.exit(1);
}
const matches = assignRounds([...all.values()]);

// A) Jornada oficial desde football-data.org (si hay clave): cada pareja local-visitante juega una sola vez por temporada.
async function fdRounds() {
  const key = process.env.FOOTBALL_DATA_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.football-data.org/v4/competitions/PD/matches', { headers: { 'X-Auth-Token': key } });
    if (!r.ok) { console.warn(`AVISO: football-data.org respondió ${r.status}`); return null; }
    const j = await r.json();
    const aliases = wanted.map((w) => ({ code: teamCode(w.label), names: w.names.concat([w.label]).map(norm) }));
    const fdCode = (t) => {
      if (!t) return null;
      for (const n of [t.name, t.shortName]) { const c = n && teamCode(n); if (c) return c; }
      const nn = norm(t.name || ''); if (!nn) return null;
      const hit = aliases.find((a) => a.code && a.names.some((x) => x.length >= 5 && (nn.includes(x) || x.includes(nn))));
      return hit ? hit.code : null;
    };
    const map = {}, bad = new Set();
    for (const x of j.matches || []) {
      const h = fdCode(x.homeTeam), a = fdCode(x.awayTeam);
      if (!h || !a) { if (!h) bad.add(x.homeTeam && x.homeTeam.name); if (!a) bad.add(x.awayTeam && x.awayTeam.name); continue; }
      map[h + '|' + a] = x.matchday;
    }
    if (bad.size) console.warn('AVISO: equipos de football-data.org sin emparejar:', [...bad].join(', '));
    return map;
  } catch (e) { console.warn('AVISO: no pude leer football-data.org:', e.message); return null; }
}
let usedFD = false;
{
  const map = await fdRounds();
  if (map) {
    let hit = 0;
    for (const m of matches) if (map[teamCode(m.h.n) + '|' + teamCode(m.a.n)] != null) hit++;
    if (hit >= matches.length * 0.95) {
      for (const m of matches) { const v = map[teamCode(m.h.n) + '|' + teamCode(m.a.n)]; if (v != null) m.r = v; }
      usedFD = true;
      console.log(`Jornadas oficiales de football-data.org aplicadas a ${hit} de ${matches.length} partidos.`);
    } else console.warn(`AVISO: solo ${hit} de ${matches.length} partidos emparejados con football-data.org; se usa el cálculo propio.`);
  }
}
// B) Si no hay jornadas oficiales: ancla del número de jornada: ESPN indica cuántos partidos ha jugado cada equipo (mediana = última jornada completa).
let offset = 0;
if (!usedFD) {
  const Lc = lastCompleteRound(matches);
  if (!FULL && prevFx && typeof prevFx.offset === 'number') { offset = prevFx.offset; console.log(`Desfase de jornada guardado: ${offset}`); }
  else {
    const st = await get('https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings');
    const med = st ? medianPlayed(st) : null;
    if (med == null) console.warn('AVISO: no pude leer la clasificación de ESPN; se usa la numeración calculada.');
    else {
      offset = med - Lc;
      console.log(`Clasificación ESPN: mediana de partidos jugados = ${med}; última jornada completa calculada = ${Lc}; desfase = ${offset}`);
      if (Math.abs(offset) > 6) { console.warn('AVISO: desfase demasiado grande, no se aplica.'); offset = 0; }
    }
  }
  shiftRounds(matches, offset);
}
const round = currentRound(matches);
console.log(`Calendario: ${matches.length} partidos (${calls} consultas) · jornada actual: ${round}`);
{
  const per = {}; for (const m of matches) per[m.r] = (per[m.r] || 0) + 1;
  console.log('Partidos por jornada:', Object.keys(per).map((r) => `J${r}:${per[r]}`).join(' '));
  const rr = {};
  for (const m of matches) { const x = (rr[m.r] = rr[m.r] || { a: m.d, b: m.d, n: 0, p: 0 }); if (m.d < x.a) x.a = m.d; if (m.d > x.b) x.b = m.d; x.n++; if (m.st === 'post') x.p++; }
  for (const r of Object.keys(rr).map(Number).sort((a, b) => a - b)) console.log(`  J${r}: ${rr[r].a.slice(0, 10)} → ${rr[r].b.slice(0, 10)} · ${rr[r].p}/${rr[r].n} jugados`);
  const odd = Object.keys(per).filter((r) => +r < round && per[r] !== Math.floor(cat.teams.length / 2));
  if (odd.length) console.warn(`AVISO: jornadas con un número raro de partidos (esperado ${Math.floor(cat.teams.length / 2)}): ${odd.map((r) => 'J' + r + '=' + per[r]).join(', ')}`);
}

// jugadores de ESPN que aún no se han podido emparejar con el catálogo (se les acreditan los puntos cuando se pueda)
const uRef = db ? db.doc('points/unmatched') : null;
const uSnap = uRef ? await uRef.get() : null;
let umItems = uSnap && uSnap.exists ? ((uSnap.data() || {}).items || []) : [];
if (FULL) umItems = [];
let umChanged = false;

// 2) puntos de los partidos terminados que aún no están procesados
// desglose de estadísticas por jornada (documentos points/s{jornada}: así points/season no crece sin límite)
const stR = {};
async function stDoc(r) {
  if (stR[r]) return stR[r];
  let pl = {};
  if (!FULL && db) { const d = await db.doc('points/s' + r).get(); if (d.exists) pl = (d.data() || {}).pl || {}; }
  return (stR[r] = { pl, dirty: false });
}
let processed = 0;
for (const m of matches) {
  if (m.st !== 'post' || season.done[m.id]) continue;
  const sum = await get(`${E}/summary?event=${m.id}`); await sleep(200);
  if (!sum) { console.warn('Sin resumen para', m.id); continue; }
  const res = scoreMatch({ match: m, summary: sum, teamCode, matcher });
  const pts = finalizePoints(res, byApi);
  console.log(`\nJ${m.r} · ${m.h.n} ${m.h.s}-${m.a.s} ${m.a.n}  (${Object.keys(pts).length} jugadores puntuados)`);
  const top = Object.entries(pts).sort((x, y) => y[1] - x[1]).slice(0, DRY ? 10 : 4);
  for (const [api, p] of top) { const s = res.pl[api]; console.log(`   ${String(p).padStart(3)}  ${byApi[api].n} (${byApi[api].t} ${byApi[api].p}) · ${s.minutes}' G${s.goals} A${s.assists} T${s.yellow}/${s.red}${s.cleanSheet ? ' PC' : ''}`); }
  if (res.unmatched.length) console.log('   sin emparejar:', res.unmatched.join(', '));
  for (const it of res.um || []) { umItems.push({ m: m.id, r: m.r, ...it }); umChanged = true; }
  { const sd = await stDoc(m.r); for (const api of Object.keys(pts)) { sd.pl[api] = addStat(sd.pl[api], statArr(res.pl[api])); } sd.dirty = true; }
  for (const [api, p] of Object.entries(pts)) {
    const x = (season.pl[api] = season.pl[api] || { j: {}, t: 0 });
    x.j[m.r] = (x.j[m.r] || 0) + p;
    x.t = Object.values(x.j).reduce((a, b) => a + b, 0);
  }
  for (const [side, o] of [[m.h, m.a], [m.a, m.h]]) {
    const code = teamCode(side.n), cp = coachPoints(side.s, o.s);
    const x = (season.coach[code] = season.coach[code] || { j: {}, t: 0 });
    x.j[m.r] = cp; x.t = Object.values(x.j).reduce((a, b) => a + b, 0);
  }
  season.done[m.id] = m.r;
  processed++;
}
console.log(`\nPartidos nuevos procesados: ${processed}`);
{
  const { resolved, left } = resolveUnmatched(umItems, matcher, byApi);
  for (const x of resolved) {
    const e = (season.pl[x.api] = season.pl[x.api] || { j: {}, t: 0 });
    { const sd = await stDoc(x.r); sd.pl[x.api] = addStat(sd.pl[x.api], statArr(x.item.s)); sd.dirty = true; }
    e.j[x.r] = (e.j[x.r] || 0) + x.pts;
    e.t = Object.values(e.j).reduce((a, b) => a + b, 0);
    console.log(`Emparejado a posteriori: ${x.item.names[0]} (${x.item.code}) → ${byApi[x.api].n}: ${x.pts} pts en la jornada ${x.r}`);
    processed++; umChanged = true;
  }
  umItems = left;
  if (left.length) console.log(`Jugadores sin emparejar pendientes: ${left.length} → ` + left.map((x) => `${x.code}:${x.names[0]}(${x.espnId})`).join(', ') + '. Añádelos a scripts/aliases.json con su id de ESPN.');
}

// 2b) puntos PROVISIONALES de los partidos en juego (no se suman a la temporada; la app los muestra "en directo")
const liveM = {};
for (const m of matches) {
  if (m.st !== 'in') continue;
  const sum = await get(`${E}/summary?event=${m.id}`); await sleep(200);
  if (!sum) { console.warn('Sin resumen en directo para', m.id); continue; }
  const res = scoreMatch({ match: m, summary: sum, teamCode, matcher });
  const pts = finalizePoints(res, byApi);
  const coach = {};
  for (const [side, o] of [[m.h, m.a], [m.a, m.h]]) { const code = teamCode(side.n); if (code) coach[code] = coachPoints(side.s, o.s); }
  const stl = {}; for (const api of Object.keys(pts)) stl[api] = statArr(res.pl[api]);
  liveM[m.id] = { r: m.r, h: teamCode(m.h.n), a: teamCode(m.a.n), hs: m.h.s, as: m.a.s, pl: pts, coach, st: stl };
  console.log(`EN DIRECTO J${m.r} · ${m.h.n} ${m.h.s}-${m.a.s} ${m.a.n} (${Object.keys(pts).length} jugadores con puntos provisionales)`);
}

if (DRY) { console.log('DRY_RUN: no se escribe nada en Firestore.'); process.exit(0); }
const compact = matches.map((m) => ({ id: m.id, d: m.d, h: teamCode(m.h.n), a: teamCode(m.a.n), hi: m.h.id, ai: m.a.id, hn: m.h.n, an: m.a.n, hs: m.h.s, as: m.a.s, st: m.st, r: m.r }));
const size = Buffer.byteLength(JSON.stringify(season)) + Buffer.byteLength(JSON.stringify(compact));
if (size > 900 * 1024) { console.error('Datos demasiado grandes'); process.exit(1); }
const ts = admin.firestore.FieldValue.serverTimestamp();
await db.doc('catalog/fixtures').set({ season: cat.season, round, offset, src: usedFD ? 'fd' : 'espn', matches: compact, updatedAt: ts });
{ let n = 0; for (const [r, sd] of Object.entries(stR)) if (sd.dirty) { await db.doc('points/s' + r).set({ r: +r, pl: sd.pl, updatedAt: ts }); n++; } console.log('Desglose de estadísticas guardado en', n, 'jornadas.'); }
if (processed || !sSnap.exists) await db.doc('points/season').set({ ...season, updatedAt: ts });
if (umChanged || FULL) await uRef.set({ items: umItems.slice(-200), updatedAt: ts });
{
  const lref = db.doc('points/live'), prev = await lref.get();
  const had = prev.exists && Object.keys((prev.data() || {}).m || {}).length > 0;
  if (Object.keys(liveM).length || had) { await lref.set({ m: liveM, updatedAt: ts }); console.log('Puntos en directo guardados:', Object.keys(liveM).length, 'partidos.'); }
}
console.log('Guardado en Firestore.');

// 2c) 11 ideal de cada jornada terminada (se guarda en points/ideal; las ligas cobran por él en el paso 3)
let ideal = {};
try {
  const iref = db.doc('points/ideal'), is = await iref.get();
  ideal = is.exists ? ((is.data() || {}).r || {}) : {};
  const newI = planIdeal({ matches: compact, now: +now, season, base: byApi, have: ideal });
  if (Object.keys(newI).length) { ideal = { ...ideal, ...newI }; await iref.set({ r: ideal, updatedAt: ts }); console.log('11 ideal nuevos:', Object.keys(newI).join(', ')); }
} catch (e) { console.error('Error en el 11 ideal:', e.message); }

// 2d) sancionados y lesionados (points/avail): la app avisa al alinear
try {
  const aref = db.doc('points/avail'), as = await aref.get(), prevA = as.exists ? as.data() : {};
  const injDue = FULL || !prevA.injAt || +now - prevA.injAt > 55 * 60 * 1000;
  if (processed || FULL || !as.exists || injDue) {
    // todas las jornadas con desglose (las tarjetas de toda la temporada)
    const stats = {};
    for (const [r, sd] of Object.entries(stR)) stats[r] = sd.pl || {};
    const sd2 = await db.collection('points').get();
    sd2.forEach((d) => { const m = /^s(\d+)$/.exec(d.id); if (m && !stats[m[1]]) stats[m[1]] = (d.data() || {}).pl || {}; });
    const sus = planSuspensions({ matches: compact, stats, base: byApi });
    let inj = prevA.inj || {}, injAt = prevA.injAt || 0;
    if (injDue) {
      // los ids de equipo del calendario pueden ser de football-data.org: los de ESPN salen de su propia lista
      const teams = new Map();
      const tl = await get(`${E}/teams`);
      const tlist = (tl && tl.sports && tl.sports[0] && tl.sports[0].leagues && tl.sports[0].leagues[0] && tl.sports[0].leagues[0].teams) || [];
      for (const t of tlist) {
        const tm = t && t.team; if (!tm || !tm.id) continue;
        const code = teamCode(tm.displayName || tm.name || '') || teamCode(tm.shortDisplayName || '');
        if (code) teams.set(code, tm.id);
      }
      console.log('Equipos de ESPN para lesiones:', teams.size);
      const fresh = {}; let okT = 0;
      for (const [code, id] of teams) {
        const ros = await get(`${E}/teams/${id}/roster`); await sleep(250);
        if (!ros) continue;
        okT++;
        for (const x of parseInjuries(ros)) {
          const api = matcher(code, x.names, x.espnId);
          if (api != null) fresh[api] = { s: x.info.s, n: x.info.n, ...(x.info.ret ? { d: x.info.ret } : {}) };
        }
      }
      console.log('Lesionados según ESPN:', Object.keys(fresh).length, 'de', okT, 'equipos.');
      // API-Football publica las lesiones de LaLiga (ESPN no): sus ids de jugador son las del catálogo
      let afOk = false;
      const AFK = process.env.API_FOOTBALL_KEY;
      if (AFK) {
        try {
          const yr = parseInt(String(cat.season || '').slice(0, 4), 10) || new Date().getUTCFullYear();
          const r = await fetch(`https://v3.football.api-sports.io/injuries?league=140&season=${yr}`, { headers: { 'x-apisports-key': AFK } });
          const j = await r.json();
          const errs = j && j.errors, hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
          if (!r.ok || hasErr) console.warn('API-Football (lesiones):', r.status, JSON.stringify(errs || {}));
          else {
            const af = parseApiInjuries(j, +now); let n = 0;
            for (const [id, v] of Object.entries(af)) { if (byApi[id]) { fresh[id] = v; n++; } }
            afOk = true; console.log('Lesionados según API-Football:', n, `(de ${(j.response || []).length} registros, quedan ${r.headers.get('x-ratelimit-requests-remaining') || '?'} peticiones hoy)`);
          }
        } catch (e) { console.warn('API-Football (lesiones) falló:', e.message); }
      } else console.log('Sin API_FOOTBALL_KEY: solo se usan las lesiones de ESPN.');
      if (afOk || (teams.size >= 10 && okT >= teams.size - 2)) { inj = fresh; injAt = +now; }
      else console.warn('Sin datos fiables de lesiones; se mantienen las anteriores.');
    }
    await aref.set({ sus, inj, injAt, updatedAt: ts });
    console.log('Disponibilidad guardada: sancionados', Object.keys(sus).length, '· lesionados', Object.keys(inj).length);
  }
} catch (e) { console.error('Error en sanciones/lesiones:', e.message); }

// 3) cierre de jornadas en el servidor: rellena los puntos de los mánagers que aún no han abierto la app
try {
  const leagues = await db.collection('leagues').get();
  let filled = 0;
  for (const L of leagues.docs) {
    const rules = L.data().rules || {};
    const members = {}; (await L.ref.collection('members').get()).forEach((d) => { members[d.id] = d.data(); });
    const snaps = {}; (await L.ref.collection('rounds').get()).forEach((d) => { snaps[+d.id] = (d.data() || {}).elig || {}; });
    const out = planSettle({ matches: compact, members, snaps, season, base: byApi, capOn: !!rules.cap });
    // puntos recién cerrados + prima por punto de esta liga
    const merged = {};
    for (const [uid, m] of Object.entries(members)) merged[uid] = { ...m, rp: out[uid] ? out[uid].rp : (m.rp || {}) };
    const bon = planBonus({ matches: compact, members: merged, bonus: +rules.bonus || 0 });
    const fmtM = (x) => String(Math.round(x * 1e6)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
    const withB = {}; for (const [uid, m] of Object.entries(merged)) withB[uid] = bon[uid] ? { ...m, cash: bon[uid].cash } : m;
    const idl = payIdeal({ members: withB, ideal, per: +rules.ideal || 0 });
    for (const uid of new Set([...Object.keys(out), ...Object.keys(bon), ...Object.keys(idl)])) {
      const o = out[uid], b = bon[uid], iq = idl[uid], upd = {};
      if (o) { upd.tot = o.tot; upd.j = o.j; for (const r of o.added) upd['rp.' + r] = o.rp[r]; }
      if (b) { upd.cash = b.cash; upd.bp = b.bp; }
      if (iq) { upd.cash = iq.cash; upd.ip = iq.ip; }
      if (b || iq) upd.rev = (members[uid].rev || 0) + 1;
      await L.ref.collection('members').doc(uid).update(upd);
      if (b) await L.ref.collection('news').doc().set({ ts: Date.now(), k: 'primas', to: uid, a: null, x: `Prima de la jornada ${b.rounds.join(', ')}: ${fmtM(b.credit)}.` });
      if (iq && iq.credit > 0) await L.ref.collection('news').doc().set({ ts: Date.now(), k: 'primas', to: uid, a: null, x: `11 ideal de la jornada ${iq.rounds.map((x) => x.r).join(', ')}: ${iq.n} jugador${iq.n === 1 ? '' : 'es'} → ${fmtM(iq.credit)}.` });
      filled++; console.log(`${members[uid].name} en ${L.data().name}:`, o ? `jornadas ${o.added.join(', ')} cerradas (total ${o.tot})` : '', b ? `prima ${fmtM(b.credit)}` : '');
    }
  }
  console.log('Mánagers con jornadas cerradas por el servidor:', filled);
} catch (e) { console.error('Error al cerrar jornadas:', e.message); }
