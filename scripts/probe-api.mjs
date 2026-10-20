// Prueba rápida: qué datos deja pedir el plan gratuito de API-Football (calendario, resultados, entrenadores, estadísticas).
const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error('Falta API_FOOTBALL_KEY'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  const r = await fetch('https://v3.football.api-sports.io' + path, { headers: { 'x-apisports-key': KEY } });
  const j = await r.json().catch(() => ({}));
  const e = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  const err = e && e.length ? JSON.stringify(j.errors) : '';
  console.log(`\n== ${path}\n   HTTP ${r.status} · resultados: ${(j.response || []).length}${err ? ' · ERROR: ' + err : ' · OK'}`);
  await sleep(7000);
  return j;
}
const nxt = await get('/fixtures?league=140&next=6');
for (const f of (nxt.response || []).slice(0, 6)) console.log('   próximo:', f.fixture.date, f.teams.home.name, 'vs', f.teams.away.name);
const lst = await get('/fixtures?league=140&last=6');
for (const f of (lst.response || []).slice(0, 6)) console.log('   jugado:', f.fixture.date, f.teams.home.name, f.goals.home, '-', f.goals.away, f.teams.away.name, `(id ${f.fixture.id})`);
await get('/fixtures?team=541&next=3');
const co = await get('/coachs?team=541');
for (const c of (co.response || []).slice(0, 3)) console.log('   entrenador:', c.name, '· carrera:', (c.career || []).slice(0, 2).map((k) => `${k.team && k.team.name} ${k.start}→${k.end}`).join(' | '));
const done = (lst.response || []).find((f) => f.fixture.status && f.fixture.status.short === 'FT');
if (done) {
  const pl = await get(`/fixtures/players?fixture=${done.fixture.id}`);
  const t0 = (pl.response || [])[0];
  const p0 = t0 && t0.players && t0.players[0];
  if (p0) console.log('   jugador de ejemplo:', p0.player.name, JSON.stringify(p0.statistics[0].games), 'goles', JSON.stringify(p0.statistics[0].goals));
}
console.log('\nHecho. Copia este resultado y pásaselo a Claude.');
