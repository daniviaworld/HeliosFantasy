// Prueba: ¿de dónde se pueden sacar lesionados y sancionados de LaLiga sin claves ni trabajo manual?
const UA = { headers: { 'User-Agent': 'Mozilla/5.0' } };
const get = async (u, label) => {
  try {
    const r = await fetch(u, UA);
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    console.log(`\n== ${label || u}\n   HTTP ${r.status} · ${t.length} bytes${j ? '' : ' · (no es JSON)'}`);
    return j;
  } catch (e) { console.log(`\n== ${label || u}\n   ERROR ${e.message}`); return null; }
};
const walk = (o, f, p = '') => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { f(k, o[k], p + '/' + k); walk(o[k], f, p + '/' + k); } };
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';

const tl = await get(`${B}/teams`, 'ESPN equipos');
const teams = (tl && tl.sports && tl.sports[0].leagues[0].teams || []).map((x) => x.team);
console.log('   equipos:', teams.length, teams.slice(0, 3).map((t) => `${t.id}:${t.displayName}`).join(', '));
const t0 = teams.find((t) => /Real Madrid/.test(t.displayName)) || teams[0];

if (t0) {
  const a = await get(`${B}/teams/${t0.id}`, `ESPN ficha de equipo ${t0.displayName}`);
  if (a) walk(a, (k, v, p) => { if (/injur|suspen|status|unavail/i.test(k) && p.length < 120) console.log('   clave:', p, '=', JSON.stringify(v).slice(0, 160)); });
  const r = await get(`${B}/teams/${t0.id}/roster`, `ESPN plantilla ${t0.displayName}`);
  if (r) {
    const ath = r.athletes || [];
    console.log('   jugadores:', ath.length, '· ejemplo claves:', ath[0] ? Object.keys(ath[0]).join(',') : '-');
    let n = 0; walk(r, (k, v, p) => { if (/injur/i.test(k)) { n++; if (n <= 8) console.log('   INJURY:', p, '=', JSON.stringify(v).slice(0, 300)); } });
    console.log('   apariciones de "injur" en la plantilla:', n);
  }
  await get(`${B}/teams/${t0.id}/injuries`, `ESPN /injuries ${t0.displayName}`);
  const c = await get(`https://sports.core.api.espn.com/v2/sports/soccer/leagues/esp.1/teams/${t0.id}/injuries?limit=50`, `ESPN core /injuries ${t0.displayName}`);
  if (c) console.log('   core items:', c.count, JSON.stringify(c).slice(0, 500));
}
// resumen de un partido reciente: ¿trae alguna marca de lesión o suspensión?
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const sb = await get(`${B}/scoreboard?dates=${ymd(new Date(Date.now() - 10 * 864e5))}-${ymd(new Date())}&limit=50`, 'ESPN partidos recientes');
const ev = ((sb && sb.events) || []).find((e) => e.status.type.completed);
if (ev) {
  const s = await get(`${B}/summary?event=${ev.id}`, `ESPN resumen partido ${ev.id}`);
  if (s) { let n = 0; walk(s, (k, v, p) => { if (/injur|suspen|unavail|absent/i.test(k)) { n++; if (n <= 8) console.log('   ', p, '=', JSON.stringify(v).slice(0, 250)); } }); console.log('   marcas encontradas:', n); }
}
// Otras fuentes públicas
const o1 = await get('https://api.sofascore.com/api/v1/team/2829/missing-players', 'Sofascore: jugadores ausentes (Real Madrid)');
if (o1) console.log('   ', JSON.stringify(o1).slice(0, 600));
const fd = await get('https://www.fotmob.com/api/teams?id=8633', 'FotMob equipo (Real Madrid)');
if (fd) { let n = 0; walk(fd, (k, v, p) => { if (/injur|suspen|unavail/i.test(k)) { n++; if (n <= 6) console.log('   ', p, '=', JSON.stringify(v).slice(0, 300)); } }); console.log('   marcas encontradas:', n); }
console.log('\nFin de la prueba.');
