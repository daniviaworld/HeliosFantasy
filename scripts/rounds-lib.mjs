// Foto de elegibilidad al empezar una jornada: quien tenga saldo negativo o menos de 11 jugadores
// alineados en ese momento no puntúa esa jornada.
import { coreMatches, currentRound } from './results-lib.mjs';

export const MIN_LINEUP = 11;
export const lineupCount = (m) => ['POR', 'DEF', 'MED', 'DEL'].reduce((n, p) => n + ((m.lineup && m.lineup[p]) || []).filter((x) => x != null).length, 0);

// Devuelve { round, elig } si hay que hacer la foto de la jornada en curso (ya empezó y aún no existe), o null.
export function planRound({ now, matches, members, done }) {
  if (!matches || !matches.length) return null;
  const round = currentRound(matches, now);
  const core = coreMatches(matches, now).filter((m) => m.r === round);
  if (!core.length) return null;
  const start = Math.min(...core.map((m) => +new Date(m.d)));
  if (now < start || done.has(round)) return null;
  const elig = {};
  for (const [uid, m] of Object.entries(members)) {
    const n = lineupCount(m), neg = (+m.cash || 0) < -1e-9;
    elig[uid] = { ok: !neg && n >= MIN_LINEUP, n, neg };
  }
  return { round, start, elig };
}
