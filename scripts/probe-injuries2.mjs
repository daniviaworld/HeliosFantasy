// Prueba rápida: ¿responden Biwenger y LaLiga Fantasy desde GitHub y con qué forma?
const H = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
for (const [l, u] of [['Biwenger', 'https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&score=5'], ['LaLiga Fantasy', 'https://api-fantasy.llt-services.com/api/v3/players?x-lang=es']]) {
  try {
    const r = await fetch(u, { headers: H }); const t = await r.text(); console.log(`\n== ${l}: HTTP ${r.status}, ${t.length} bytes`);
    let j; try { j = JSON.parse(t); } catch { console.log(t.slice(0, 200)); continue; }
    const d = j.data || j; const arr = Array.isArray(d) ? d : Object.values(d.players || {});
    console.log('claves:', Object.keys(d).slice(0, 8).join(','), '· jugadores:', arr.length);
    console.log('ejemplo:', JSON.stringify(arr[0]).slice(0, 400));
    const cnt = {}; for (const p of arr) { const s = p.status || p.playerStatus; cnt[s] = (cnt[s] || 0) + 1; } console.log('estados:', JSON.stringify(cnt));
    console.log('con baja:', JSON.stringify(arr.filter((p) => !/^ok$/i.test(p.status || p.playerStatus)).slice(0, 3)).slice(0, 700));
  } catch (e) { console.log(`\n== ${l}: ERROR ${e.message}`); }
}
