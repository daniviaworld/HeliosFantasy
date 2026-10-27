// Carga plantillas, equipos y precios iniciales en Firestore (documento catalog/main).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { pickTeams, makeCodes, buildValueIndex, buildCatalog, pickCoach, coachEntry, matchValueInfo, MIN_VALUE } from './lib.mjs';

const KEY = process.env.API_FOOTBALL_KEY;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const VALUES_URL = process.env.VALUES_URL ||
  'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz';
const DRY = !!process.env.DRY_RUN;
const SLEEP_MS = Number(process.env.SLEEP_MS || 7000);
if (!SA && !DRY) { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT.'); process.exit(1); }

const API = 'https://v3.football.api-sports.io';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;

async function api(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (calls > 0) await sleep(SLEEP_MS); // el plan gratuito permite 10 peticiones por minuto
    calls++;
    const r = await fetch(API + path, { headers: { 'x-apisports-key': KEY } });
    const left = r.headers.get('x-ratelimit-requests-remaining');
    console.log(`GET ${path} -> ${r.status}${left ? ` (quedan ${left} hoy)` : ''}`);
    if (r.status === 429) { await sleep(65000); continue; }
    const j = await r.json();
    const errs = j.errors;
    const hasErr = Array.isArray(errs) ? errs.length > 0 : errs && Object.keys(errs).length > 0;
    if (hasErr) throw new Error(`La API devolvió un error en ${path}: ${JSON.stringify(errs)}`);
    return j;
  }
  throw new Error(`Demasiados intentos en ${path}`);
}

async function loadValues() {
  try {
    const r = await fetch(VALUES_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const csv = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8');
    const rows = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
    if (!rows.length || !('market_value_in_eur' in rows[0]) || !('name' in rows[0])) throw new Error('El archivo no tiene las columnas esperadas');
    console.log(`Valores de mercado cargados: ${rows.length} jugadores`);
    return buildValueIndex(rows);
  } catch (e) {
    console.warn(`No se pudieron cargar los valores de mercado (${e.message}). Se usarán precios por posición.`);
    return null;
  }
}

const wanted = JSON.parse(fs.readFileSync(new URL('./laliga-teams.json', import.meta.url), 'utf8'));

// Modo solo precios: si la API de plantillas no está disponible (cuenta suspendida, sin clave, sin cuota),
// se conservan jugadores, ids y equipos del catálogo actual y solo se recalculan los precios con Transfermarkt.
async function repriceOnly(why) {
  console.warn(`AVISO: ${why}`);
  console.warn('Modo solo precios: se conservan jugadores, ids y equipos del catálogo actual y se recalculan los precios.');
  if (DRY) { console.error('DRY_RUN sin API: no hay catálogo que reprecificar.'); process.exit(1); }
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
  const ref = admin.firestore().doc('catalog/main');
  const snap = await ref.get();
  if (!snap.exists) { console.error('No hay catálogo todavía; no se puede reprecificar.'); process.exit(1); }
  const prev = snap.data();
  const idx = await loadValues();
  if (!idx) { console.error('No hay valores de mercado: no se cambia nada.'); process.exit(1); }
  const label = {}; for (const t of prev.teams || []) label[t.c] = t.n;
  let changed = 0, same = 0, nomatch = 0; const dubious = [], moved = [];
  const players = (prev.players || []).map((p) => {
    if (p.p === 'ENT') return p;
    const mi = matchValueInfo(idx, p.n, label[p.t] || p.t);
    if (!mi) { nomatch++; return p; }
    const v = Math.max(MIN_VALUE, Math.round(mi.val * 100) / 100);
    if (mi.dubious) dubious.push({ name: p.n, team: label[p.t] || p.t, value: v, matchedClub: mi.club, candidates: mi.cands });
    if (Math.abs(v - p.v) > 1e-9) { changed++; moved.push({ name: p.n, team: p.t, from: p.v, to: v }); return { ...p, v }; }
    same++; return p;
  });
  console.log(`Precios recalculados: ${changed} cambian, ${same} igual, ${nomatch} sin coincidencia (se conserva su precio).`);
  moved.sort((x, y) => Math.abs(y.to - y.from) - Math.abs(x.to - x.from));
  console.log('Mayores cambios:'); for (const m of moved.slice(0, 40)) console.log(`  · ${m.name} (${m.team}): ${m.from} M → ${m.to} M`);
  if (dubious.length) { console.log(`Precios dudosos (${dubious.length}): no coincide el club o hay homónimos con valores muy distintos. Revísalos:`); for (const d of dubious.slice(0, 80)) console.log(`  · ${d.name} (${d.team}) → ${d.value.toFixed(2)} M, club encontrado: ${d.matchedClub || '—'}, candidatos: ${d.candidates}`); }
  await ref.set({ ...prev, players, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log('Catálogo actualizado (solo precios).');
  process.exit(0);
}
if (!KEY) await repriceOnly('Falta el secreto API_FOOTBALL_KEY.');
let teamsResp;
try { teamsResp = await api('/teams?country=Spain'); } catch (e) { await repriceOnly(e.message); }
const { found, missing } = pickTeams(teamsResp.response, wanted);
if (missing.length) console.warn('Equipos sin encontrar en la API:', missing.join(', '));
if (found.length < 18) { console.error(`Solo se encontraron ${found.length} equipos. No se actualiza nada.`); process.exit(1); }
const ambiguous = found.filter((f) => f.extra > 0).map((f) => f.want.label);
if (ambiguous.length) console.warn('Había varios equipos con ese nombre, se eligió el más antiguo:', ambiguous.join(', '));

const codes = makeCodes(found.map((f) => f.team));
const squads = {};
for (const { want, team } of found) {
  const j = await api(`/players/squads?team=${team.id}`);
  squads[team.id] = (j.response[0] && j.response[0].players) || [];
  if (squads[team.id].length < 15) console.warn(`Plantilla corta en ${want.label}: ${squads[team.id].length} jugadores`);
}

// Entrenadores (si la API falla para un equipo, se conserva el que ya había en el catálogo)
let admin = null, previous = null;
if (!DRY) {
  admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
  const prev = await admin.firestore().doc('catalog/main').get();
  previous = prev.exists ? prev.data() : null;
}
const coaches = [];
for (const { want, team } of found) {
  const code = codes[team.id];
  let entry = null;
  try {
    const j = await api(`/coachs?team=${team.id}`);
    entry = coachEntry(pickCoach(j.response, team.id), code);
  } catch (e) { console.warn(`Entrenador de ${want.label}: ${e.message}`); }
  if (!entry && previous) entry = (previous.players || []).find((x) => x.p === 'ENT' && x.t === code) || null;
  if (entry) coaches.push(entry); else console.warn(`Sin entrenador para ${want.label}`);
}
console.log(`Entrenadores: ${coaches.length}`);

const idx = await loadValues();
const built = buildCatalog(found, codes, squads, idx);
const { teams, stats } = built;
const players = built.players.concat(coaches);
console.log(`Jugadores: ${stats.players} (con valor de mercado: ${stats.priced}, con precio por posición: ${stats.defaulted}, descartados: ${stats.skipped})`);
console.log('Por equipo:', JSON.stringify(stats.perTeam));
if (stats.dubious.length) {
  console.log(`Precios dudosos (${stats.dubious.length}): no coincide el club o hay homónimos con valores muy distintos. Revísalos:`);
  for (const d of stats.dubious.slice(0, 80)) console.log(`  · ${d.name} (${d.team}) → ${(d.value).toFixed(2)} M, club encontrado: ${d.matchedClub || '—'}, candidatos: ${d.candidates}`);
}
if (built.players.length < 300 && !process.env.FORCE) { console.error('Muy pocos jugadores. No se actualiza nada.'); process.exit(1); }

const doc = { season: '2026/27', teams, players };
const size = Buffer.byteLength(JSON.stringify(doc));
console.log(`Tamaño del documento: ${(size / 1024).toFixed(0)} KB`);
if (size > 900 * 1024) { console.error('El documento supera el límite de Firestore.'); process.exit(1); }

if (DRY) {
  fs.writeFileSync('catalog-preview.json', JSON.stringify(doc));
  console.log('DRY_RUN: no se escribe en Firestore. Vista previa en catalog-preview.json');
  process.exit(0);
}
await admin.firestore().doc('catalog/main').set({ ...doc, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
console.log('Catálogo guardado en Firestore: catalog/main');
