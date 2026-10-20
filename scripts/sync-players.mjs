// Carga plantillas, equipos y precios iniciales en Firestore (documento catalog/main).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { pickTeams, makeCodes, buildValueIndex, buildCatalog, pickCoach, coachEntry } from './lib.mjs';

const KEY = process.env.API_FOOTBALL_KEY;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
const VALUES_URL = process.env.VALUES_URL ||
  'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/players.csv.gz';
const DRY = !!process.env.DRY_RUN;
const SLEEP_MS = Number(process.env.SLEEP_MS || 7000);
if (!KEY || (!SA && !DRY)) { console.error('Faltan los secretos API_FOOTBALL_KEY y/o FIREBASE_SERVICE_ACCOUNT.'); process.exit(1); }

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
const teamsResp = await api('/teams?country=Spain');
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
