// Cierre de mercados y foto de jornada de todas las ligas. Lo usan la Cloud Function (cada minuto) y el workflow de GitHub (respaldo).
// Es seguro ejecutarlo a la vez desde los dos sitios: el cierre se hace en una transacción que comprueba que nadie lo cerró antes.
import { planClose, initialState, newCpuListings, roundMoves } from './market-lib.mjs';
import { lockMsOf, clauseMultOf, clubMaxOf } from './deals-lib.mjs';
import { planRound } from './rounds-lib.mjs';
import { currentRound, coreMatches, lastCompleteRound } from './results-lib.mjs';

const cache = { base: null, baseAt: 0, fx: null, fxAt: 0, pts: null, ptsAt: 0 };

export async function runMarket({ db, now = Date.now(), log = console.log, notify = null }) {
  if (!cache.base || now - cache.baseAt > 10 * 60 * 1000) {
    const cat = await db.collection('catalog').doc('main').get();
    if (!cat.exists) { log('No hay catálogo todavía.'); return { closed: 0, created: 0, snaps: 0 }; }
    const base = {}; for (const p of cat.data().players) base[p.a] = p;
    cache.base = base; cache.baseAt = now;
  }
  const base = cache.base;
  if (!cache.fx || now - cache.fxAt > 60 * 1000) {
    const fx = await db.doc('catalog/fixtures').get();
    cache.fx = fx.exists ? (fx.data().matches || []) : []; cache.fxAt = now;
  }
  const matches = cache.fx;

  const leagues = await db.collection('leagues').get();
  let closed = 0, created = 0, snaps = 0;
  const loadMembers = async (ref) => {
    const members = {};
    (await ref.collection('members').get()).forEach((d) => { const x = d.data(); members[d.id] = { ...x, squad: x.squad || [], selling: x.selling || {}, role: x.role || {}, lineup: x.lineup || {} }; });
    return members;
  };

  for (const L of leagues.docs) {
    try {
      const ref = L.ref, data = L.data(), rl = data.rules || {};
      const perDay = Math.max(18, rl.perDay || 18), anon = !!rl.anon;
      // draft: mientras se reparten los jugadores por turnos (o aún no ha empezado) el mercado no se cierra
      const dSnap = await ref.collection('market').doc('draft').get();
      const draftOn = (dSnap.exists && (dSnap.data() || {}).status === 'running') || (!dSnap.exists && rl.start === 'draft');
      if (draftOn) log('Mercado en pausa por el draft en', data.name);
      else {
        const stRef = ref.collection('market').doc('state');
        const stSnap = await stRef.get();
        if (!stSnap.exists) {
          const members = await loadMembers(ref);
          await stRef.set(initialState(now, base, members, perDay));
          created++; log('Mercado creado en', data.name);
        } else {
          const st = stSnap.data();
          if (st.end > now) {
            const cur = st.listings || [];
            if (cur.length < perDay) { // completa el mercado abierto hasta el mínimo de jugadores
              const members = await loadMembers(ref);
              const extra = newCpuListings(base, members, perDay - cur.length, Math.random, cur);
              if (extra.length) { await stRef.update({ listings: [...cur, ...extra] }); log('Mercado ampliado en', data.name, '+' + extra.length); }
            }
          } else {
            const members = await loadMembers(ref);
            const bidSnap = await ref.collection('bids').get();
            const bids = {};
            bidSnap.forEach((d) => { const x = d.data() || {}; if (x.round == null || x.round === st.round) bids[d.id] = x.bids || {}; });
            const debtPct = rl.debt != null ? +rl.debt : 20;
            // el valor de los jugadores se mueve con los puntos de las jornadas terminadas desde el último cierre
            let pointMoves = null;
            try {
              const last = lastCompleteRound(matches, now);
              if (last) {
                if (st.vr == null) pointMoves = { upTo: last, factors: {} }; // primera vez: se parte de la jornada actual, sin efecto retroactivo
                else if (last > st.vr) {
                  if (!cache.pts || now - cache.ptsAt > 60 * 1000) { const ps = await db.doc('points/season').get(); cache.pts = ps.exists ? (ps.data().pl || {}) : {}; cache.ptsAt = now; }
                  pointMoves = { upTo: last, factors: roundMoves(cache.pts, st.vr, last) };
                }
              }
            } catch (e) { console.error('Valores por puntos:', e.message); }
            const r = planClose({ now, state: st, members, bids, base, perDay, anon, debtPct, lockMs: lockMsOf(rl), clauseMult: clauseMultOf(rl), clubMax: clubMaxOf(rl), pointMoves });
            const dealsRef = ref.collection('deals');
            const oldCpu = await dealsRef.where('type', '==', 'cpu').where('status', '==', 'pending').get();
            const bidpub = await ref.collection('bidpub').get();
            const ops = [];
            ops.push(['set', stRef, r.state]);
            oldCpu.forEach((d) => ops.push(['update', d.ref, { status: 'expired' }]));
            for (const o of r.cpuNew || []) ops.push(['set', dealsRef.doc(), { type: 'cpu', buyer: null, seller: o.seller, sellerName: (members[o.seller] || {}).name || '', a: o.a, amount: o.amount, n: o.n, status: 'pending', ts: now }]);
            for (const [uid, upd] of Object.entries(r.memberUpdates)) ops.push(['update', ref.collection('members').doc(uid), upd]);
            bidSnap.forEach((d) => ops.push(['delete', d.ref]));
            bidpub.forEach((d) => ops.push(['delete', d.ref]));
            r.news.forEach((n) => ops.push(['set', ref.collection('news').doc(), { ts: now, k: n.k, to: n.to || null, a: n.a == null ? null : n.a, ...(n.tr ? { tr: n.tr } : {}), x: n.x }]));
            ops.push(['set', ref.collection('news').doc(), { ts: now, k: 'jornada', to: null, x: `Mercado cerrado: ${r.sold.length} fichajes. Ya hay jugadores nuevos hasta mañana.` }]);
            // transacción: solo la primera ejecución (Cloud Function o GitHub) cierra; la otra ve que el estado ya cambió y no hace nada
            const won = await db.runTransaction(async (tx) => {
              const cur = await tx.get(stRef);
              if (!cur.exists || cur.data().end !== st.end || cur.data().round !== st.round) return false;
              for (const [k, rf, d] of ops) { if (k === 'set') tx.set(rf, d); else if (k === 'update') tx.update(rf, d); else tx.delete(rf); }
              return true;
            });
            if (won) { closed++; log('Mercado cerrado en', data.name, '·', r.sold.length, 'fichajes'); if (notify) { try { await notify(r.news, data.name, { members, base, listings: (r.state && r.state.listings) || [] }); } catch (e) { console.warn('aviso:', e.message); } } }
            else log('El mercado de', data.name, 'ya lo había cerrado otra ejecución.');
          }
        }
      }
    } catch (e) { console.error('Error en liga', L.id, e.message); }
  }

  // Foto de elegibilidad al empezar la jornada (saldo negativo o sin 11 alineados → no puntúa)
  try {
    if (matches.length) {
      const round = currentRound(matches, now);
      const core = coreMatches(matches, now).filter((m) => m.r === round);
      const start = core.length ? Math.min(...core.map((m) => +new Date(m.d))) : Infinity;
      if (now >= start) {
        for (const L of leagues.docs) {
          const rRef = L.ref.collection('rounds').doc(String(round));
          const rs = await rRef.get();
          const has = rs.exists && !!(rs.data().elig && Object.values(rs.data().elig).some((e) => e && e.lu));
          if (has) continue;
          const members = {}; (await L.ref.collection('members').get()).forEach((d) => { members[d.id] = d.data(); });
          const p = planRound({ now, matches, members, done: new Map() });
          if (!p) continue;
          await rRef.set({ round: p.round, at: now, start: p.start, elig: p.elig });
          snaps++; log('Foto de la jornada', p.round, 'en', L.data().name);
        }
      }
    }
  } catch (e) { console.error('Error en fotos de jornada', e.message); }
  return { closed, created, snaps, leagues: leagues.size };
}
