// Ejecuta los clausulazos y las ofertas aceptadas entre mánagers. Se lanza desde GitHub Actions cada pocos minutos.
import { planDeals } from './deals-lib.mjs';

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA) { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const now = Date.now();

const cat = await db.collection('catalog').doc('main').get();
if (!cat.exists) { console.error('No hay catálogo todavía.'); process.exit(1); }
const base = {};
for (const p of cat.data().players) base[p.a] = p;

const leagues = await db.collection('leagues').get();
let done = 0, leaguesWith = 0;
for (const L of leagues.docs) {
  try {
    const ref = L.ref, data = L.data();
    const dSnap = await ref.collection('deals').get();
    const deals = [];
    dSnap.forEach((d) => deals.push({ id: d.id, ...d.data() }));
    // solo hay trabajo con clausulazos pendientes, ofertas aceptadas u ofertas pendientes (para caducarlas)
    if (!deals.some((d) => d.status === 'pending' || d.status === 'accepted')) continue;
    leaguesWith++;
    const memSnap = await ref.collection('members').get();
    const members = {};
    memSnap.forEach((d) => { const x = d.data(); members[d.id] = { ...x, squad: x.squad || [], selling: x.selling || {}, role: x.role || {}, lineup: x.lineup || {}, pm: x.pm || {} }; });
    const st = await ref.collection('market').doc('state').get();
    const values = st.exists ? (st.data().values || {}) : {};
    const r = planDeals({ now, members, deals, base, values, rules: data.rules || {}, anon: !!(data.rules && data.rules.anon) });
    const batch = db.batch();
    for (const [uid, upd] of Object.entries(r.memberUpdates)) batch.update(ref.collection('members').doc(uid), upd);
    for (const [id, upd] of Object.entries(r.dealUpdates)) batch.update(ref.collection('deals').doc(id), upd);
    r.news.forEach((n) => batch.set(ref.collection('news').doc(), { ts: now, k: n.k, to: n.to || null, a: n.a == null ? null : n.a, x: n.x }));
    // limpieza: tratos terminados con más de 7 días
    dSnap.forEach((d) => { const x = d.data(); if (['done', 'failed', 'expired', 'rejected', 'cancelled'].includes(x.status) && now - (x.doneAt || x.ts || 0) > 7 * 86400000) batch.delete(d.ref); });
    await batch.commit();
    const n = Object.values(r.dealUpdates).filter((u) => u.status === 'done').length;
    done += n;
    console.log(data.name, '·', n, 'traspasos,', Object.keys(r.dealUpdates).length, 'tratos resueltos');
  } catch (e) { console.error('Error en liga', L.id, e.message); }
}
console.log(`Hecho. Traspasos: ${done}. Ligas con tratos: ${leaguesWith}/${leagues.size}.`);
