// Prueba: ¿qué datos de LaLiga da la API pública de ESPN (la misma que usa el bot de clasificaciones)?
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); console.log(`\n== ${u}\n   HTTP ${r.status}`); return r.ok ? r.json() : null; };
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const now = new Date(), from = new Date(now - 14 * 864e5), to = new Date(+now + 14 * 864e5);

const sb = await get(`${B}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=100`);
const evs = (sb && sb.events) || [];
console.log(`   partidos entre ${ymd(from)} y ${ymd(to)}: ${evs.length}`);
for (const e of evs) {
  const c = e.competitions[0].competitors.map((x) => `${x.team.displayName} ${x.score}`).join(' - ');
  console.log(`   ${e.id} · ${e.date} · ${e.status.type.name} · ${c}`);
}
const done = evs.find((e) => e.status.type.completed);
if (done) {
  const s = await get(`${B}/summary?event=${done.id}`);
  if (s) {
    console.log('   claves del resumen:', Object.keys(s).join(', '));
    const r = (s.rosters || [])[0];
    console.log('   rosters[0] claves:', r ? Object.keys(r).join(', ') : 'no hay');
    const p = r && (r.roster || [])[0];
    if (p) console.log('   jugador ejemplo:', JSON.stringify(p).slice(0, 900));
    const k = (s.keyEvents || []).slice(0, 4);
    console.log('   keyEvents:', (s.keyEvents || []).length, JSON.stringify(k).slice(0, 700));
    const d = (s.header && s.header.competitions && s.header.competitions[0] && s.header.competitions[0].details) || [];
    console.log('   details (goles/tarjetas):', d.length, JSON.stringify(d.slice(0, 3)).slice(0, 500));
  }
} else console.log('   (no hay ningún partido terminado en esa ventana)');

const t = await get('https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=' + now.toISOString().slice(0, 10) + '&l=Spanish%20La%20Liga');
console.log('   TheSportsDB hoy:', t && (t.events || []).length);
console.log('\nHecho. Copia este resultado y pásaselo a Claude.');
