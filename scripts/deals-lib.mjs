// Lógica pura de ofertas y clausulazos entre mánagers de una liga (sin Firebase, para poder probarla).
export const H = 3600 * 1000;
export const LOCK_MS = 14 * 24 * H;     // protección tras fichar (mercado, oferta o clausulazo)
export const SHIELD_MS = 48 * H;        // blindaje voluntario
export const SHIELD_EVERY = 7 * 24 * H; // un blindaje por semana y mánager
export const OFFER_TTL = 48 * H;        // una oferta caduca si el dueño no responde
export const CLAUSE_MULT = 1.5;         // cláusula inicial = valor de mercado × 1,5
export const MAX_SQUAD = 26;
export const MIN_SQUAD = 11;            // el vendedor no puede quedarse con menos
const r2 = (x) => Math.round(x * 100) / 100;

// Reglas ajustables por el admin (con valores por defecto)
export const lockMsOf = (rules) => { const d = rules && rules.lockDays; return (d != null && d >= 0 ? d : 14) * 24 * H; };
export const clauseMultOf = (rules) => { const m = rules && rules.clauseMult; return m > 0 ? m : CLAUSE_MULT; };
export const offerTtlOf = (rules) => { const d = rules && rules.offerDays; return (d > 0 ? d : 2) * 24 * H; };
export const clubMaxOf = (rules) => { const c = rules && +rules.clubMax; return c >= 1 && c <= 11 ? c : 0; };
// Cuántos jugadores de ese club hay en la plantilla (los entrenadores no cuentan)
export const clubCount = (squad, base, t) => (squad || []).filter((x) => Number(x) >= 0 && base[x] && base[x].t === t).length;

export const clauseOf = (pm, a, val, mult = CLAUSE_MULT) => {
  const e = pm && pm[a];
  return e && e.c != null ? Number(e.c) : r2(val * mult);
};
export const protectedUntil = (pm, a) => {
  const e = (pm && pm[a]) || {};
  return Math.max(e.l || 0, e.s || 0);
};


// ---- Clausulazos por semana (lunes a domingo, hora de España) y bloqueo antes de cada jornada
export const CLAUSE_BLOCK_MS = 24 * H;  // desde 24 h antes del primer partido de la jornada hasta que empieza
export const clauseGivenOf = (rules) => { const n = rules && +rules.clauseGiven; return n >= 1 ? Math.floor(n) : 0; };   // 0 = sin límite
export const clauseTakenOf = (rules) => { const n = rules && +rules.clauseTaken; return n >= 1 ? Math.floor(n) : 0; };
export const clauseLockOn = (rules) => !(rules && rules.clauseLock === false);
// Lunes de esa semana como 'AAAA-MM-DD' (zona horaria de Madrid)
export function weekKey(ts) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(ts));
  const g = (t) => f.find((x) => x.type === t).value;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday'));
  const d = new Date(Date.UTC(+g('year'), +g('month') - 1, +g('day') - dow));
  return d.toISOString().slice(0, 10);
}
// Inicio (ms) de la próxima jornada que aún no ha empezado = su primer partido (contando los ya jugados), o 0 si no hay
export function nextRoundStart(matches, now) {
  const first = {};
  for (const m of matches || []) {
    if (!m || m.r == null || !m.d || m.st === 'ppd') continue;
    const t = +new Date(m.d);
    if (first[m.r] == null || t < first[m.r]) first[m.r] = t;
  }
  const v = Object.values(first).filter((t) => t > now);
  return v.length ? Math.min(...v) : 0;
}
// Si ahora no se puede clausurar, devuelve cuándo se reabre (inicio del primer partido); si se puede, 0
export function clauseBlockedUntil(matches, now, rules) {
  if (!clauseLockOn(rules)) return 0;
  const t = nextRoundStart(matches, now);
  return t && t - now <= CLAUSE_BLOCK_MS ? t : 0;
}
// Cuántos clausulazos ha hecho y recibido cada uno en la semana de `now`. log: [{wk,buyer,seller}]
export function weekCounts(log, now) {
  const wk = weekKey(now), given = {}, taken = {};
  for (const r of log || []) { if (r.wk !== wk) continue; given[r.buyer] = (given[r.buyer] || 0) + 1; taken[r.seller] = (taken[r.seller] || 0) + 1; }
  return { wk, given, taken };
}

const has = (arr, a) => (arr || []).map(String).includes(String(a));

// Quita al jugador de una plantilla (alineación, rol, venta, capitán, entrenador, protección)
export function dropPlayer(s, a) {
  s.squad = (s.squad || []).filter((x) => String(x) !== String(a));
  for (const pos of Object.keys(s.lineup || {})) s.lineup[pos] = (s.lineup[pos] || []).map((x) => (x != null && String(x) === String(a) ? null : x));
  if (s.role) delete s.role[a];
  if (s.selling) delete s.selling[a];
  if (s.pm) delete s.pm[a];
  if (s.cap != null && String(s.cap) === String(a)) s.cap = null;
  if (s.coach != null && String(s.coach) === String(a)) s.coach = s.squad.find((x) => x < 0) ?? null;
  s.saved = false;
}

// Pasa el jugador `a` de `from` a `to` por `price`. Devuelve nada; modifica M.
export function transfer(M, a, from, to, price, now, newClause, lockMs = LOCK_MS) {
  const s = M[from], b = M[to];
  s.cash = r2(s.cash + price);
  s.squad = (s.squad || []).filter((x) => String(x) !== String(a));
  for (const pos of Object.keys(s.lineup || {})) s.lineup[pos] = (s.lineup[pos] || []).map((x) => (x != null && String(x) === String(a) ? null : x));
  if (s.role) delete s.role[a];
  if (s.selling) delete s.selling[a];
  if (s.pm) delete s.pm[a];
  if (s.cap != null && String(s.cap) === String(a)) s.cap = null;
  if (s.coach != null && String(s.coach) === String(a)) s.coach = s.squad.find((x) => x < 0) ?? null;
  s.saved = false;
  b.cash = r2(b.cash - price);
  b.squad = [...(b.squad || []), a];
  if (a < 0 && b.coach == null) b.coach = a;
  b.pm = { ...(b.pm || {}), [a]: { l: now + lockMs, c: newClause } };
  b.saved = false;
}

// members: {uid:{name,cash,squad,lineup,role,selling,pm,cap,coach,rev}}
// deals: [{id,type:'clause'|'offer',buyer,seller,a,amount,status,ts}]
// base: {a:{v,n}}   values: {a:valor actual del mercado}   rules: {clause:boolean}
export function planDeals({ now, members, deals, base, values = {}, rules = {}, anon = false, matches = [], clog = [] }) {
  const M = JSON.parse(JSON.stringify(members));
  const val = (a) => (values[a] != null ? values[a] : base[a] ? base[a].v : 1);
  const pname = (a) => (base[a] ? base[a].n : 'Jugador ' + a);
  const fmt = (x) => String(Math.round(x * 1e6)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
  const nameOf = (u) => (M[u] ? M[u].name : 'Un mánager');
  const who = (u) => (anon ? 'Un mánager' : nameOf(u));
  const changed = new Set(), news = [], dealUpdates = {}, clauseRecs = [];
  const wc = weekCounts(clog, now), cGiven = clauseGivenOf(rules), cTaken = clauseTakenOf(rules);
  const blockedAt = clauseBlockedUntil(matches, now, rules);
  const lockMs = lockMsOf(rules), cMult = clauseMultOf(rules), ttl = offerTtlOf(rules), cMax = clubMaxOf(rules);
  const fail = (d, why, notify = true) => {
    dealUpdates[d.id] = { status: 'failed', note: why, doneAt: now };
    if (notify && M[d.buyer]) news.push({ k: 'mercado', to: d.buyer, a: d.a, x: `${d.type === 'clause' ? 'Clausulazo' : d.type === 'swap' ? 'Intercambio' : d.type === 'loan' ? 'Cesión' : 'Oferta'} por ${pname(d.a)} no realizado: ${why}.` });
  };
  const ordered = [...deals].sort((x, y) => (x.ts || 0) - (y.ts || 0));
  for (const d of ordered) {
    const a = d.a;
    if (d.status === 'pending' && (d.type === 'offer' || d.type === 'swap' || d.type === 'loan')) {
      if (now - (d.ts || 0) > ttl) {
        dealUpdates[d.id] = { status: 'expired', note: 'caducada', doneAt: now };
        if (M[d.buyer]) news.push({ k: 'mercado', to: d.buyer, a: a, x: `Tu ${d.type === 'swap' ? 'intercambio' : d.type === 'loan' ? 'petición de cesión' : 'oferta'} por ${pname(a)} caducó sin respuesta.` });
      }
      continue;
    }
    const run = (d.status === 'pending' && d.type === 'clause') || (d.status === 'accepted' && (d.type === 'offer' || d.type === 'swap' || d.type === 'loan'));
    if (!run) continue;
    const S = M[d.seller], B = M[d.buyer];
    if (!S || !B) { fail(d, 'el mánager ya no está en la liga', false); continue; }
    if (!has(S.squad, a)) { fail(d, 'el jugador ya no es de ' + who(d.seller)); continue; }
    if (S.ln && S.ln[a]) { fail(d, 'el jugador está cedido y no se puede traspasar'); continue; }
    if (d.type === 'swap' && B.ln && B.ln[d.give]) { fail(d, 'tu jugador ofrecido está cedido'); continue; }
    if (d.type === 'swap') {
      const g = d.give, cash = r2(Number(d.amount) || 0);
      if (g == null || !has(B.squad, g)) { fail(d, 'tu jugador del intercambio ya no está en tu plantilla'); continue; }
      if (has(S.squad, g)) { fail(d, 'el jugador ofrecido ya es de ' + who(d.seller)); continue; }
      if (has(B.squad, a)) { fail(d, 'ya es tuyo'); continue; }
      if (cash < 0) { fail(d, 'importe no válido'); continue; }
      if (B.cash + 1e-9 < cash) { fail(d, 'saldo insuficiente'); continue; }
      const nsq = (sq, out, inn) => [...(sq || []).filter((x) => String(x) !== String(out)), inn];
      if (cMax && base[a] && base[a].t && a >= 0 && clubCount(nsq(B.squad, g, a), base, base[a].t) > Math.max(cMax, clubCount(B.squad, base, base[a].t))) { fail(d, `límite de ${cMax} jugadores por club en esta liga`); continue; }
      if (cMax && base[g] && base[g].t && g >= 0 && clubCount(nsq(S.squad, a, g), base, base[g].t) > Math.max(cMax, clubCount(S.squad, base, base[g].t))) { fail(d, `límite de ${cMax} jugadores por club para ${who(d.seller)}`); continue; }
      const clA = r2(val(a) * cMult), clG = r2(val(g) * cMult);
      transfer(M, a, d.seller, d.buyer, cash, now, clA, lockMs);
      transfer(M, g, d.buyer, d.seller, 0, now, clG, lockMs);
      changed.add(d.seller); changed.add(d.buyer);
      dealUpdates[d.id] = { status: 'done', note: `${pname(g)} + ${fmt(cash)}`, price: cash, doneAt: now };
      const extra = cash > 0 ? ` y ${fmt(cash)}` : '';
      news.push({ k: 'fichaje', to: d.seller, a: g, x: `Intercambio: das a ${pname(a)} y recibes a ${pname(g)}${extra ? ' y ' + fmt(cash) : ''} de ${who(d.buyer)}.` });
      news.push({ k: 'fichaje', to: d.buyer, a, x: `Intercambio: das a ${pname(g)}${extra} y recibes a ${pname(a)} de ${who(d.seller)}.` });
      news.push({ k: 'fichaje', to: null, a, tr: { f: d.seller, t: d.buyer, p: cash, k: 'swap', g }, x: `${who(d.buyer)} y ${who(d.seller)} intercambian a ${pname(g)}${extra} por ${pname(a)}.` });
      continue;
    }
    if (has(B.squad, a)) { fail(d, 'ya es tuyo'); continue; }
    if ((B.squad || []).length >= MAX_SQUAD) { fail(d, `tu plantilla está completa (${MAX_SQUAD})`); continue; }
    if ((S.squad || []).length <= MIN_SQUAD) { fail(d, `${who(d.seller)} no puede quedarse con menos de ${MIN_SQUAD} jugadores`); continue; }
    if (cMax && base[a] && base[a].t && clubCount(B.squad, base, base[a].t) >= cMax) { fail(d, `límite de ${cMax} jugadores por club en esta liga`); continue; }
    if (d.type === 'loan') {
      const days = [7, 14, 21, 28].includes(Number(d.days)) ? Number(d.days) : 7, fee = r2(Number(d.amount) || 0);
      if (fee < 0) { fail(d, 'importe no válido'); continue; }
      if (B.cash + 1e-9 < fee) { fail(d, 'saldo insuficiente'); continue; }
      const until = now + days * 24 * H, sp = S.pm && S.pm[a] ? { ...S.pm[a] } : null;
      transfer(M, a, d.seller, d.buyer, fee, now, r2(val(a) * cMult), lockMs);
      B.pm = { ...(B.pm || {}), [a]: { l: until, c: r2(val(a) * cMult) } };
      B.ln = { ...(B.ln || {}), [a]: { f: d.seller, u: until } };
      S.lo = { ...(S.lo || {}), [a]: { t: d.buyer, u: until, pm: sp } };
      changed.add(d.seller); changed.add(d.buyer);
      dealUpdates[d.id] = { status: 'done', note: `${days} días · ${fmt(fee)}`, price: fee, doneAt: now };
      const fin = new Date(until).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      news.push({ k: 'fichaje', to: d.seller, a, x: `Cedes a ${pname(a)} a ${who(d.buyer)} ${days} días por ${fmt(fee)}. Vuelve el ${fin}.` });
      news.push({ k: 'fichaje', to: d.buyer, a, x: `Recibes cedido a ${pname(a)} de ${who(d.seller)} por ${fmt(fee)}. Lo devuelves el ${fin}.` });
      news.push({ k: 'fichaje', to: null, a, x: `${who(d.seller)} cede a ${pname(a)} a ${who(d.buyer)} ${days} días (${fmt(fee)}).` });
      continue;
    }
    let price, newClause;
    if (d.type === 'clause') {
      if (!rules.clause) { fail(d, 'los clausulazos están desactivados en esta liga'); continue; }
      if (blockedAt) { fail(d, `los clausulazos están cerrados hasta que empiece la jornada (${new Date(blockedAt).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })})`); continue; }
      if (cGiven && (wc.given[d.buyer] || 0) >= cGiven) { fail(d, `ya has hecho ${cGiven === 1 ? 'tu clausulazo' : 'tus ' + cGiven + ' clausulazos'} de esta semana`); continue; }
      if (cTaken && (wc.taken[d.seller] || 0) >= cTaken) { fail(d, `${who(d.seller)} ya ha recibido ${cTaken === 1 ? 'el máximo de 1 clausulazo' : 'el máximo de ' + cTaken + ' clausulazos'} esta semana`); continue; }
      const until = protectedUntil(S.pm, a);
      if (until > now) { fail(d, 'el jugador está protegido'); continue; }
      price = clauseOf(S.pm, a, val(a), cMult);
      if ((d.amount || 0) + 1e-9 < price) { fail(d, `la cláusula subió a ${fmt(price)}`); continue; }
      newClause = price;
    } else {
      price = r2(Number(d.amount) || 0);
      if (price <= 0) { fail(d, 'importe no válido'); continue; }
      newClause = r2(Math.max(price, val(a)) * cMult);
    }
    if (B.cash + 1e-9 < price) { fail(d, 'saldo insuficiente'); continue; }
    transfer(M, a, d.seller, d.buyer, price, now, newClause, lockMs);
    changed.add(d.seller); changed.add(d.buyer);
    dealUpdates[d.id] = { status: 'done', note: fmt(price), price, doneAt: now };
    if (d.type === 'clause') {
      wc.given[d.buyer] = (wc.given[d.buyer] || 0) + 1; wc.taken[d.seller] = (wc.taken[d.seller] || 0) + 1;
      clauseRecs.push({ ts: now, wk: wc.wk, buyer: d.buyer, buyerName: nameOf(d.buyer), seller: d.seller, sellerName: nameOf(d.seller), a, pname: pname(a), price });
    }
    const how = d.type === 'clause' ? 'paga la cláusula de' : 'ficha a';
    news.push({ k: 'fichaje', to: d.seller, x: d.type === 'clause' ? `${who(d.buyer)} paga la cláusula de ${pname(a)}: ${fmt(price)}.` : `Vendes a ${pname(a)} a ${who(d.buyer)} por ${fmt(price)}.` });
    news.push({ k: 'fichaje', to: d.buyer, a: a, x: `Fichas a ${pname(a)} de ${who(d.seller)} por ${fmt(price)}. Protegido ${Math.round(lockMs / 24 / H)} días.` });
    news.push({ k: 'fichaje', to: null, a: a, tr: { f: d.seller, t: d.buyer, p: price, k: d.type === 'clause' ? 'clausula' : 'oferta' }, x: `${who(d.buyer)} ${how} ${pname(a)}${d.type === 'clause' ? '' : ' a ' + who(d.seller)} (${fmt(price)}).` });
    // el resto de tratos sobre el mismo jugador pendientes se anulan solos en su turno (ya no es de ese dueño)
  }
  const memberUpdates = {};
  for (const uid of changed) {
    const m = M[uid];
    m.pl = m.squad.length;
    m.val = r2(m.squad.reduce((s, a) => s + val(a), 0));
    m.rev = (m.rev || 0) + 1;
    memberUpdates[uid] = { cash: m.cash, squad: m.squad, lineup: m.lineup || {}, role: m.role || {}, selling: m.selling || {}, pm: m.pm || {}, ln: m.ln || {}, lo: m.lo || {}, saved: m.saved, pl: m.pl, val: m.val, rev: m.rev, coach: m.coach == null ? null : m.coach, cap: m.cap == null ? null : m.cap };
  }
  return { memberUpdates, dealUpdates, news, clauseRecs };
}

// Devuelve a su dueño los jugadores cedidos cuyo plazo ha terminado.
// members: {uid:{name,squad,lineup,role,selling,pm,ln,lo,cap,coach,rev}}
export function planLoans({ now, members, base = {}, values = {}, anon = false }) {
  const M = JSON.parse(JSON.stringify(members));
  const pname = (a) => (base[a] ? base[a].n : 'Jugador ' + a);
  const val = (a) => (values[a] != null ? values[a] : base[a] ? base[a].v : 1);
  const changed = new Set(), news = [];
  for (const [ou, S] of Object.entries(M)) {
    for (const [a, lo] of Object.entries(S.lo || {})) {
      if (!(lo.u <= now)) continue;
      const B = M[lo.t];
      if (B) { if (has(B.squad, a)) dropPlayer(B, a); if (B.ln) delete B.ln[a]; changed.add(lo.t); news.push({ k: 'fichaje', to: lo.t, a: Number(a), x: `Termina la cesión de ${pname(a)}: vuelve con ${S.name || 'su dueño'}.` }); }
      if (!has(S.squad, a)) { S.squad = [...(S.squad || []), Number(a)]; if (Number(a) < 0 && S.coach == null) S.coach = Number(a); if (lo.pm) S.pm = { ...(S.pm || {}), [a]: lo.pm }; }
      delete S.lo[a]; S.saved = false; changed.add(ou);
      news.push({ k: 'fichaje', to: ou, a: Number(a), x: `${pname(a)} vuelve a tu plantilla tras la cesión.` });
    }
    // cesiones recibidas cuyo dueño ya no está en la liga
    for (const [a, ln] of Object.entries(S.ln || {})) {
      if (!(ln.u <= now) || M[ln.f]) continue;
      if (has(S.squad, a)) dropPlayer(S, a);
      delete S.ln[a]; changed.add(ou);
    }
  }
  const memberUpdates = {};
  for (const uid of changed) {
    const m = M[uid];
    m.pl = m.squad.length;
    m.val = r2(m.squad.reduce((s, a) => s + val(a), 0));
    m.rev = (m.rev || 0) + 1;
    memberUpdates[uid] = { squad: m.squad, lineup: m.lineup || {}, role: m.role || {}, selling: m.selling || {}, pm: m.pm || {}, ln: m.ln || {}, lo: m.lo || {}, saved: m.saved, pl: m.pl, val: m.val, rev: m.rev, coach: m.coach == null ? null : m.coach, cap: m.cap == null ? null : m.cap };
  }
  return { memberUpdates, news };
}

// ¿Hay cesiones que devolver?
export const loansDue = (members, now) => Object.values(members).some((m) => Object.values(m.lo || {}).some((l) => l.u <= now) || Object.values(m.ln || {}).some((l) => l.u <= now));

// Devuelve las cesiones vencidas y después ejecuta los tratos pendientes.
export function planAll({ now, members, deals, base, values = {}, rules = {}, anon = false, matches = [], clog = [] }) {
  const L = planLoans({ now, members, base, values, anon });
  const M2 = {};
  for (const [u, m] of Object.entries(members)) M2[u] = L.memberUpdates[u] ? { ...m, ...L.memberUpdates[u] } : m;
  const D = planDeals({ now, members: M2, deals, base, values, rules, anon, matches, clog });
  const memberUpdates = {};
  for (const u of new Set([...Object.keys(L.memberUpdates), ...Object.keys(D.memberUpdates)])) memberUpdates[u] = { ...(L.memberUpdates[u] || {}), ...(D.memberUpdates[u] || {}) };
  return { memberUpdates, dealUpdates: D.dealUpdates, news: [...L.news, ...D.news], clauseRecs: D.clauseRecs };
}
