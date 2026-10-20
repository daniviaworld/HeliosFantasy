// Cierra los mercados de todas las ligas cuya hora de cierre ya pasó (cada 24 h).
// Se ejecuta desde GitHub Actions cada pocos minutos. Usa la cuenta de servicio de Firebase.
import { planClose, initialState } from './market-lib.mjs';

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA) { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const now = Date.now();

const cat = await db.collection('catalog').doc('main').get();
if (!cat.exists) { console.error('No hay catálogo todavía. Ejecuta antes «Sincronizar jugadores».'); process.exit(1); }
const base = {};
for (const p of cat.data().players) base[p.a] = p;

const leagues = await db.collection('leagues').get();
let closed = 0, created = 0;
for (const L of leagues.docs) {
  try {
    const ref = L.ref, data = L.data(), perDay = (data.rules && data.rules.perDay) || 8, anon = !!(data.rules && data.rules.anon);
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
    if (st.end > now) continue;
    const bidSnap = await ref.collection('bids').get();
    const bids = {};
    bidSnap.forEach((d) => { bids[d.id] = (d.data() || {}).bids || {}; });
    const r = planClose({ now, state: st, members, bids, base, perDay, anon });
    const batch = db.batch();
    batch.set(stRef, r.state);
    for (const [uid, upd] of Object.entries(r.memberUpdates)) batch.update(ref.collection('members').doc(uid), upd);
    bidSnap.forEach((d) => batch.delete(d.ref));
    r.news.forEach((n) => batch.set(ref.collection('news').doc(), { ts: now, k: n.k, to: n.to || null, x: n.x }));
    batch.set(ref.collection('news').doc(), { ts: now, k: 'jornada', to: null, x: `Mercado cerrado: ${r.sold.length} fichajes. Ya hay jugadores nuevos hasta mañana.` });
    await batch.commit();
    closed++; console.log('Mercado cerrado en', data.name, '·', r.sold.length, 'fichajes');
  } catch (e) { console.error('Error en liga', L.id, e.message); }
}
console.log(`Hecho. Cerrados: ${closed}. Creados: ${created}. Ligas: ${leagues.size}.`);
