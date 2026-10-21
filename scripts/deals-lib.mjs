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

export const clauseOf = (pm, a, val) => {
  const e = pm && pm[a];
  return e && e.c != null ? Number(e.c) : r2(val * CLAUSE_MULT);
};
export const protectedUntil = (pm, a) => {
  const e = (pm && pm[a]) || {};
  return Math.max(e.l || 0, e.s || 0);
};

const has = (arr, a) => (arr || []).map(String).includes(String(a));

// Pasa el jugador `a` de `from` a `to` por `price`. Devuelve nada; modifica M.
export function transfer(M, a, from, to, price, now, newClause) {
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
  b.pm = { ...(b.pm || {}), [a]: { l: now + LOCK_MS, c: newClause } };
  b.saved = false;
}

// members: {uid:{name,cash,squad,lineup,role,selling,pm,cap,coach,rev}}
// deals: [{id,type:'clause'|'offer',buyer,seller,a,amount,status,ts}]
// base: {a:{v,n}}   values: {a:valor actual del mercado}   rules: {clause:boolean}
export function planDeals({ now, members, deals, base, values = {}, rules = {}, anon = false }) {
  const M = JSON.parse(JSON.stringify(members));
  const val = (a) => (values[a] != null ? values[a] : base[a] ? base[a].v : 1);
  const pname = (a) => (base[a] ? base[a].n : 'Jugador ' + a);
  const fmt = (x) => x.toFixed(2).replace('.', ',') + ' M';
  const nameOf = (u) => (M[u] ? M[u].name : 'Un mánager');
  const who = (u) => (anon ? 'Un mánager' : nameOf(u));
  const changed = new Set(), news = [], dealUpdates = {};
  const fail = (d, why, notify = true) => {
    dealUpdates[d.id] = { status: 'failed', note: why, doneAt: now };
    if (notify && M[d.buyer]) news.push({ k: 'mercado', to: d.buyer, a: d.a, x: `${d.type === 'clause' ? 'Clausulazo' : 'Oferta'} por ${pname(d.a)} no realizado: ${why}.` });
  };
  const ordered = [...deals].sort((x, y) => (x.ts || 0) - (y.ts || 0));
  for (const d of ordered) {
    const a = d.a;
    if (d.status === 'pending' && d.type === 'offer') {
      if (now - (d.ts || 0) > OFFER_TTL) {
        dealUpdates[d.id] = { status: 'expired', note: 'caducada', doneAt: now };
        if (M[d.buyer]) news.push({ k: 'mercado', to: d.buyer, a: a, x: `Tu oferta por ${pname(a)} caducó sin respuesta.` });
      }
      continue;
    }
    const run = (d.status === 'pending' && d.type === 'clause') || (d.status === 'accepted' && d.type === 'offer');
    if (!run) continue;
    const S = M[d.seller], B = M[d.buyer];
    if (!S || !B) { fail(d, 'el mánager ya no está en la liga', false); continue; }
    if (!has(S.squad, a)) { fail(d, 'el jugador ya no es de ' + who(d.seller)); continue; }
    if (has(B.squad, a)) { fail(d, 'ya es tuyo'); continue; }
    if ((B.squad || []).length >= MAX_SQUAD) { fail(d, `tu plantilla está completa (${MAX_SQUAD})`); continue; }
    if ((S.squad || []).length <= MIN_SQUAD) { fail(d, `${who(d.seller)} no puede quedarse con menos de ${MIN_SQUAD} jugadores`); continue; }
    let price, newClause;
    if (d.type === 'clause') {
      if (!rules.clause) { fail(d, 'los clausulazos están desactivados en esta liga'); continue; }
      const until = protectedUntil(S.pm, a);
      if (until > now) { fail(d, 'el jugador está protegido'); continue; }
      price = clauseOf(S.pm, a, val(a));
      if ((d.amount || 0) + 1e-9 < price) { fail(d, `la cláusula subió a ${fmt(price)}`); continue; }
      newClause = price;
    } else {
      price = r2(Number(d.amount) || 0);
      if (price <= 0) { fail(d, 'importe no válido'); continue; }
      newClause = r2(Math.max(price, val(a)) * CLAUSE_MULT);
    }
    if (B.cash + 1e-9 < price) { fail(d, 'saldo insuficiente'); continue; }
    transfer(M, a, d.seller, d.buyer, price, now, newClause);
    changed.add(d.seller); changed.add(d.buyer);
    dealUpdates[d.id] = { status: 'done', note: fmt(price), price, doneAt: now };
    const how = d.type === 'clause' ? 'paga la cláusula de' : 'ficha a';
    news.push({ k: 'fichaje', to: d.seller, x: d.type === 'clause' ? `${who(d.buyer)} paga la cláusula de ${pname(a)}: ${fmt(price)}.` : `Vendes a ${pname(a)} a ${who(d.buyer)} por ${fmt(price)}.` });
    news.push({ k: 'fichaje', to: d.buyer, a: a, x: `Fichas a ${pname(a)} de ${who(d.seller)} por ${fmt(price)}. Protegido ${Math.round(LOCK_MS / 24 / H)} días.` });
    news.push({ k: 'fichaje', to: null, a: a, x: `${who(d.buyer)} ${how} ${pname(a)}${d.type === 'clause' ? '' : ' a ' + who(d.seller)} (${fmt(price)}).` });
    // el resto de tratos sobre el mismo jugador pendientes se anulan solos en su turno (ya no es de ese dueño)
  }
  const memberUpdates = {};
  for (const uid of changed) {
    const m = M[uid];
    m.pl = m.squad.length;
    m.val = r2(m.squad.reduce((s, a) => s + val(a), 0));
    m.rev = (m.rev || 0) + 1;
    memberUpdates[uid] = { cash: m.cash, squad: m.squad, lineup: m.lineup || {}, role: m.role || {}, selling: m.selling || {}, pm: m.pm || {}, saved: m.saved, pl: m.pl, val: m.val, rev: m.rev, coach: m.coach == null ? null : m.coach, cap: m.cap == null ? null : m.cap };
  }
  return { memberUpdates, dealUpdates, news };
}
