import assert from 'node:assert/strict';
import fs from 'node:fs';
import { norm, pickTeams, makeCodes, buildValueIndex, matchValue, buildCatalog } from './lib.mjs';
const wanted = JSON.parse(fs.readFileSync(new URL('./laliga-teams.json', import.meta.url), 'utf8'));
assert.equal(wanted.length, 20);
assert.equal(norm('Atlético  de Madrid!'), 'atletico de madrid');

// teams?country=Spain simulado: clubes, filiales, selección y duplicados
const T = (id, name, code, founded, national = false) => ({ team: { id, name, code, founded, national, country: 'Spain' } });
const apiTeams = [T(9, 'Spain', 'ESP', 1913, true), T(529, 'Barcelona', 'BAR', 1899), T(541, 'Real Madrid', 'REA', 1902),
  T(5291, 'Barcelona B', 'BAR', 1970), T(5411, 'Real Madrid Castilla', 'REA', 1930), T(533, 'Villarreal', 'VIL', 1923),
  T(530, 'Atletico Madrid', 'ATL', 1903), T(543, 'Real Betis', 'BET', 1907), T(538, 'Celta Vigo', 'CEL', 1923),
  T(548, 'Real Sociedad', 'REA', 1909), T(546, 'Getafe', 'GET', 1983), T(531, 'Athletic Club', 'ATH', 1898),
  T(532, 'Valencia', 'VAL', 1919), T(536, 'Sevilla', 'SEV', 1890), T(728, 'Rayo Vallecano', 'RAY', 1924),
  T(727, 'Osasuna', 'OSA', 1920), T(540, 'Espanyol', 'ESP', 1900), T(542, 'Alaves', 'ALA', 1921),
  T(539, 'Levante', 'LEV', 1909), T(797, 'Elche', 'ELC', 1923), T(8001, 'Racing Santander', null, 1913),
  T(8002, 'Deportivo La Coruna', 'DEP', 1906), T(8003, 'Malaga', 'MAL', 1904), T(8004, 'Malaga', 'MAL', 1990), T(8005, 'Mallorca', 'MLL', 1916)];
const { found, missing } = pickTeams(apiTeams, wanted);
assert.deepEqual(missing, []);
assert.equal(found.length, 20);
assert.equal(found.find((f) => f.want.label === 'Málaga').team.id, 8003, 'elige el más antiguo');
assert.equal(found.find((f) => f.want.label === 'Málaga').extra, 1);
assert.ok(!found.some((f) => /Castilla| B$/.test(f.team.name)), 'sin filiales');
const codes = makeCodes(found.map((f) => f.team));
assert.equal(new Set(Object.values(codes)).size, 20, 'siglas únicas');
assert.ok(Object.values(codes).every((c) => /^[A-Z0-9]{3}$/.test(c)));

// valores de mercado (formato del dataset de Transfermarkt)
const rows = [
  { name: 'Kylian Mbappé', first_name: 'Kylian', last_name: 'Mbappé', market_value_in_eur: '180000000', last_season: '2025', current_club_name: 'Real Madrid Club de Fútbol' },
  { name: 'Vinicius Junior', first_name: 'Vinicius', last_name: 'Junior', market_value_in_eur: '150000000', last_season: '2025', current_club_name: 'Real Madrid Club de Fútbol' },
  { name: 'Pedri', first_name: '', last_name: 'Pedri', market_value_in_eur: '140000000', last_season: '2025', current_club_name: 'Futbol Club Barcelona' },
  { name: 'Antoine Griezmann', first_name: 'Antoine', last_name: 'Griezmann', market_value_in_eur: '25000000', last_season: '2025', current_club_name: 'Club Atlético de Madrid' },
  { name: 'Álvaro García', first_name: 'Álvaro', last_name: 'García', market_value_in_eur: '15000000', last_season: '2025', current_club_name: 'Rayo Vallecano' },
  { name: 'Adrián García', first_name: 'Adrián', last_name: 'García', market_value_in_eur: '3000000', last_season: '2025', current_club_name: 'Club Atlético Osasuna' },
  { name: 'Retirado García', first_name: 'Retirado', last_name: 'García', market_value_in_eur: '500000', last_season: '2018', current_club_name: 'Sin club' },
  { name: 'Sin Valor', first_name: 'Sin', last_name: 'Valor', market_value_in_eur: '', last_season: '2025', current_club_name: 'Getafe CF' }
];
const idx = buildValueIndex(rows);
assert.equal(matchValue(idx, 'K. Mbappé', 'Real Madrid'), 180);
assert.equal(matchValue(idx, 'Vinícius Júnior', 'Real Madrid'), 150);
assert.equal(matchValue(idx, 'Pedri', 'Barcelona'), 140);
assert.equal(matchValue(idx, 'A. Griezmann', 'Atletico Madrid'), 25);
assert.equal(matchValue(idx, 'A. García', 'Rayo Vallecano'), 15, 'elige por club entre homónimos');
assert.equal(matchValue(idx, 'A. García', 'Osasuna'), 3);
assert.equal(matchValue(idx, 'Z. Desconocido', 'Getafe'), null);
assert.equal(matchValue(idx, 'S. Valor', 'Getafe'), null, 'valor vacío = sin precio');
assert.equal(matchValue(null, 'K. Mbappé', 'Real Madrid'), null);

// catálogo completo
const P = (id, name, position, number) => ({ id, name, age: 25, number, position, photo: `https://media.api-sports.io/football/players/${id}.png` });
const squads = { 541: [P(1, 'K. Mbappé', 'Attacker', 10), P(2, 'Vinícius Júnior', 'Attacker', 7), P(3, 'T. Courtois', 'Goalkeeper', 1), P(1, 'K. Mbappé', 'Attacker', 10), P(4, 'Entrenador', 'Coach', null)],
  529: [P(5, 'Pedri', 'Midfielder', 8), P(6, 'Jugador Nuevo', 'Defender', null)] };
const cat = buildCatalog(found.filter((f) => [541, 529].includes(f.team.id)), codes, squads, idx);
assert.equal(cat.players.length, 5);
assert.equal(cat.stats.skipped, 2, 'duplicado y entrenador descartados');
const mb = cat.players.find((p) => p.a === 1);
assert.deepEqual(mb, { a: 1, n: 'K. Mbappé', t: codes[541], p: 'DEL', v: 180, num: 10 });
assert.equal(cat.players.find((p) => p.a === 3).v, 0.8, 'portero sin valor: precio por defecto');
assert.equal(cat.players.find((p) => p.a === 6).v, 1.0);
assert.equal(cat.players.find((p) => p.a === 6).num, null);
assert.equal(cat.teams.length, 2);
assert.ok(JSON.stringify(cat).length < 2000);
console.log('Todas las pruebas del cargador pasan.');
