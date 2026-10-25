// Cierra los mercados de todas las ligas cuya hora de cierre ya pasó (cada 24 h) y hace la foto de la jornada.
// Respaldo desde GitHub Actions: lo principal lo hace la Cloud Function «marketTick» cada minuto (misma lógica en market-run.mjs).
import { runMarket } from './market-run.mjs';

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA) { console.error('Falta FIREBASE_SERVICE_ACCOUNT'); process.exit(1); }
const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore(); db.settings({ ignoreUndefinedProperties: true });
const r = await runMarket({ db });
console.log(`Hecho. Cerrados: ${r.closed}. Creados: ${r.created}. Fotos: ${r.snaps}. Ligas: ${r.leagues}.`);
