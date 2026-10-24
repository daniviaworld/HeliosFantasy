// Cierra los mercados de todas las ligas cuya hora de cierre ya pasó (cada 24 h).
// Se ejecuta desde GitHub Actions cada pocos minutos. Usa la cuenta de servicio de Firebase.
import { planClose, initialState, newCpuListings } from './market-lib.mjs';
import { lockMsOf, clauseMultOf, clubMaxOf } from './deals-lib.mjs';
import { planRound } from './rounds-lib.mjs';

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA) { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore(); db.settings({ ignoreUndefinedProperties: true });
const now = Date.now();

const cat = await db.collection('catalog').doc('main').get();
if (!cat.exists) { console.error('No hay catálogo todavía. Ejecuta antes «Sincronizar jugadores».'); process.exit(1); }
const base = {};
for (const p of cat.data().players) base[p.a] = p;

const leagues = await db.collection('leagues').get();
let closed = 0, created = 0;
for (const L of leagues.docs) {
  try {
    const ref = L.ref, data = L.data(), perDay = Math.max(18, (data.rules && data.rules.perDay) || 18), anon = !!(data.rules && data.rules.anon);
    // draft: mientras se reparten los jugadores por turnos (o aún no ha empezado) el mercado no se cierra
    const dSnap = await ref.collection('market').doc('draft').get();
    if ((dSnap.exists && (dSnap.data() || {}).status === 'running') || (!dSnap.exists && data.rules && data.rules.start === 'draft')) { console.log('Mercado en pausa por el draft en', data.name); continue; }
    const stRef = ref.collection('market').doc('state');
    const stSnap = await stRef.get();
    const memSnap = await ref.collection('members').get();
    const members = {};
    memSnap.forEach((d) => { const x = d.data(); members[d.id] = { ...x, squad: x.squad || [], selling: x.selling || {}, role: x.role || {}, lineup: x.lineup || {} }; });
    if (!stSnap.exists) {
      await stRef.set(initialState(now, base, members, perDay));
      created++; console.log('Mercado creado en', data.name); continue;
    }
    const st = stSnap.data();
    if (st.end > now) {
      // completa el mercado abierto hasta el mínimo de jugadores (p. ej. ligas creadas con 8)
      const cur = st.listings || [];
      if (cur.length < perDay) {
        const extra = newCpuListings(base, members, perDay - cur.length, Math.random, cur);
        if (extra.length) { await stRef.update({ listings: [...cur, ...extra] }); console.log('Mercado ampliado en', data.name, '+' + extra.length); }
      }
      continue;
    }
    const bidSnap = await ref.collection('bids').get();
    const bids = {};
    bidSnap.forEach((d) => { const x = d.data() || {}; if (x.round == null || x.round === st.round) bids[d.id] = x.bids || {}; });
    const debtPct = data.rules && data.rules.debt != null ? +data.rules.debt : 20;
    const rl = data.rules || {};
    const r = planClose({ now, state: st, members, bids, base, perDay, anon, debtPct, lockMs: lockMsOf(rl), clauseMult: clauseMultOf(rl), clubMax: clubMaxOf(rl) });
    const batch = db.batch();
    batch.set(stRef, r.state);
    // ofertas de la liga: las que seguían sin respuesta caducan y se crean las nuevas
    const dealsRef = ref.collection('deals');
    (await dealsRef.where('type', '==', 'cpu').where('status', '==', 'pending').get()).forEach((d) => batch.update(d.ref, { status: 'expired' }));
    for (const o of r.cpuNew || []) batch.set(dealsRef.doc(), { type: 'cpu', buyer: null, seller: o.seller, sellerName: (members[o.seller] || {}).name || '', a: o.a, amount: o.amount, n: o.n, status: 'pending', ts: now });
    for (const [uid, upd] of Object.entries(r.memberUpdates)) batch.update(ref.collection('members').doc(uid), upd);
    bidSnap.forEach((d) => batch.delete(d.ref));
    (await ref.collection('bidpub').get()).forEach((d) => batch.delete(d.ref));
    r.news.forEach((n) => batch.set(ref.collection('news').doc(), { ts: now, k: n.k, to: n.to || null, a: n.a == null ? null : n.a, ...(n.tr ? { tr: n.tr } : {}), x: n.x }));
    batch.set(ref.collection('news').doc(), { ts: now, k: 'jornada', to: null, x: `Mercado cerrado: ${r.sold.length} fichajes. Ya hay jugadores nuevos hasta mañana.` });
    await batch.commit();
    closed++; console.log('Mercado cerrado en', data.name, '·', r.sold.length, 'fichajes');
  } catch (e) { console.error('Error en liga', L.id, e.message); }
}
// Foto de elegibilidad al empezar la jornada (saldo negativo o sin 11 alineados → no puntúa)
try {
  const fx = await db.doc('catalog/fixtures').get();
  const matches = fx.exists ? (fx.data().matches || []) : [];
  let snaps = 0;
  for (const L of leagues.docs) {
    const rs = await L.ref.collection('rounds').get();
    const done = new Map(); rs.forEach((d) => done.set(+d.id, !!(d.data().elig && Object.values(d.data().elig).some((e) => e && e.lu))));
    const memSnap = await L.ref.collection('members').get();
    const members = {}; memSnap.forEach((d) => { members[d.id] = d.data(); });
    const p = planRound({ now, matches, members, done });
    if (!p) continue;
    await L.ref.collection('rounds').doc(String(p.round)).set({ round: p.round, at: now, start: p.start, elig: p.elig });
    snaps++; console.log('Foto de la jornada', p.round, 'en', L.data().name);
  }
  console.log('Fotos de jornada:', snaps);
} catch (e) { console.error('Error en fotos de jornada', e.message); }
console.log(`Hecho. Cerrados: ${closed}. Creados: ${created}. Ligas: ${leagues.size}.`);
