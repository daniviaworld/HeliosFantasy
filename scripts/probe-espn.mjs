const H = { 'User-Agent': 'Mozilla/5.0' };
const E = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';
async function get(u) {
  const r = await fetch(u, { headers: H });
  let j = null; try { j = await r.json(); } catch {}
  console.log(`\n== ${u}\n   HTTP ${r.status}`);
  return r.ok ? j : null;
}
const cut = (x, n) => JSON.stringify(x).slice(0, n);
for (const id of ['401882846', '401882842']) {
  const s = await get(`${E}/summary?event=${id}`);
  if (!s) continue;
  console.log('   claves:', Object.keys(s).join(', '));
  const rs = s.rosters || [];
  console.log('   rosters:', rs.length, '· claves:', rs[0] ? Object.keys(rs[0]).join(', ') : '-');
  const pl = rs[0] && rs[0].roster || [];
  console.log('   jugadores en roster[0]:', pl.length);
  if (pl[0]) console.log('   ejemplo jugador:', cut(pl[0], 1400));
  const st = pl.find((p) => p.stats && p.stats.length);
  if (st) console.log('   ejemplo con stats:', cut(st, 1400));
  const ke = s.keyEvents || [];
  console.log('   keyEvents:', ke.length, cut(ke.slice(0, 4), 900));
  const comp = s.header && s.header.competitions && s.header.competitions[0];
  const det = (comp && comp.details) || [];
  console.log('   details:', det.length, cut(det.slice(0, 4), 700));
  const bs = s.boxscore || {};
  console.log('   boxscore claves:', Object.keys(bs).join(', '), '· players:', (bs.players || []).length);
  if (bs.players && bs.players[0]) console.log('   boxscore.players[0]:', cut(bs.players[0], 1200));
}
console.log('\nHecho. Copia este resultado y pásaselo a Claude.');
