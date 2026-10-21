// Actualiza calendario, resultados y puntos de LaLiga en Firestore a partir de ESPN (sin clave).
//   catalog/fixtures  -> calendario y jornada actual
//   points/season     -> puntos por jugador y jornada, y del entrenador
// Variables: FIREBASE_SERVICE_ACCOUNT (obligatoria salvo DRY_RUN=1), FULL=1 (rescanear toda la temporada), SEASON_START (AAAA-MM-DD)
import fs from 'node:fs';
import { parseScoreboard, assignRounds, currentRound, lastCompleteRound, medianPlayed, shiftRounds, makeTeamMap, makeMatcher, scoreMatch, finalizePoints, coachPoints } from './results-lib.mjs';

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
const matcher = makeMatcher(cat.players);

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
// Ancla del número de jornada: ESPN indica cuántos partidos ha jugado cada equipo (mediana = última jornada completa).
let offset = 0;
{
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

// 2) puntos de los partidos terminados que aún no están procesados
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

if (DRY) { console.log('DRY_RUN: no se escribe nada en Firestore.'); process.exit(0); }
const compact = matches.map((m) => ({ id: m.id, d: m.d, h: teamCode(m.h.n), a: teamCode(m.a.n), hi: m.h.id, ai: m.a.id, hn: m.h.n, an: m.a.n, hs: m.h.s, as: m.a.s, st: m.st, r: m.r }));
const size = Buffer.byteLength(JSON.stringify(season)) + Buffer.byteLength(JSON.stringify(compact));
if (size > 900 * 1024) { console.error('Datos demasiado grandes'); process.exit(1); }
const ts = admin.firestore.FieldValue.serverTimestamp();
await db.doc('catalog/fixtures').set({ season: cat.season, round, offset, matches: compact, updatedAt: ts });
if (processed || !sSnap.exists) await db.doc('points/season').set({ ...season, updatedAt: ts });
console.log('Guardado en Firestore.');
