const H = { 'User-Agent': 'Mozilla/5.0' };
const E = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';
const S = 'https://www.thesportsdb.com/api/v1/json/3';
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const day = (n) => new Date(Date.now() + n * 864e5);
async function get(u) {
  const r = await fetch(u, { headers: H });
  let j = null; try { j = await r.json(); } catch {}
  console.log(`\n== ${u}\n   HTTP ${r.status}`);
  return r.ok ? j : null;
}
function listEvents(j) {
  const ev = (j && j.events) || [];
  console.log(`   partidos: ${ev.length}`);
  for (const e of ev.slice(0, 12)) {
    const c = e.competitions[0].competitors.map((x) => `${x.team.displayName} ${x.score}`).join(' - ');
    console.log(`   ${e.id} · ${e.date} · ${e.status.type.name} · ${c}`);
  }
  return ev;
}
let all = [];
for (const u of [`${E}/scoreboard`, `${E}/scoreboard?dates=${ymd(day(-1))}`, `${E}/scoreboard?dates=${ymd(day(-3))}`, `${E}/scoreboard?dates=${ymd(day(-7))}-${ymd(day(-1))}`, `${E}/scoreboard?dates=${ymd(day(0))}-${ymd(day(7))}`, `${E}/teams/86/schedule`]) {
  const j = await get(u);
  if (j && j.events) all = all.concat(listEvents(j));
  else if (j && j.team) { console.log('   (calendario de equipo)', Object.keys(j).join(',')); const ev = j.events || []; console.log('   eventos del equipo:', ev.length); all = all.concat(ev.map((e) => ({ id: e.id, status: e.competitions && e.competitions[0] && e.competitions[0].status || {}, date: e.date }))); }
}
const done = all.find((e) => e.status && e.status.type && e.status.type.completed);
if (done) {
  const s = await get(`${E}/summary?event=${done.id}`);
  if (s) {
    console.log('   claves del resumen:', Object.keys(s).join(', '));
    const r = (s.rosters || [])[0];
    console.log('   rosters[0] claves:', r ? Object.keys(r).join(', ') : 'no hay');
    const p = r && (r.roster || [])[0];
    if (p) console.log('   jugador ejemplo:', JSON.stringify(p).slice(0, 1200));
    console.log('   keyEvents:', (s.keyEvents || []).length, JSON.stringify((s.keyEvents || []).slice(0, 3)).slice(0, 700));
    const d = (s.header && s.header.competitions && s.header.competitions[0] && s.header.competitions[0].details) || [];
    console.log('   details:', d.length, JSON.stringify(d.slice(0, 3)).slice(0, 500));
  }
} else console.log('\n(no se encontró ningún partido terminado)');
for (const u of [`${S}/eventspastleague.php?id=4335`, `${S}/eventsnextleague.php?id=4335`, `${S}/searchteams.php?t=Real%20Madrid`]) {
  const j = await get(u);
  if (j) { const ev = j.events || j.teams || []; console.log(`   resultados: ${ev.length}`, ev[0] ? JSON.stringify(ev[0]).slice(0, 300) : ''); }
}
console.log('\nHecho. Copia este resultado y pásaselo a Claude.');
