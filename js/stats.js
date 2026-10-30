/**
 * Batting math. Pure functions over counting stats — no DOM, no fetching.
 *
 * Rate stats are always derived from counting totals, never stored and never
 * averaged from per-game values, so every scope (season, league, career) adds
 * up the same way.
 */

/** The counting stats we track per player per game. */
export const COUNTING_KEYS = [
  'g', 'pa', 'ab', 'h', 'singles', 'doubles', 'triples', 'hr',
  'rbi', 'r', 'bb', 'sf', 'so',
];

export function emptyStats() {
  const s = {};
  for (const k of COUNTING_KEYS) s[k] = 0;
  return s;
}

/** Adds `b` into a copy of `a`. Missing keys count as zero. */
export function addStats(a, b) {
  const out = { ...a };
  for (const k of COUNTING_KEYS) out[k] += Number(b[k] ?? 0);
  return out;
}

export function sumStats(rows) {
  return rows.reduce((acc, r) => addStats(acc, r), emptyStats());
}

/** Singles are whatever is left of the hit total after extra-base hits. */
export function singlesFrom(h, doubles, triples, hr) {
  return Math.max(0, h - (doubles + triples + hr));
}

export function totalBases(s) {
  return s.singles + 2 * s.doubles + 3 * s.triples + 4 * s.hr;
}

/** Outs are inferred from at-bats, hits and sacrifice flies rather than stored. */
export function battingOuts(s) {
  return Math.max(0, s.ab - s.h) + s.sf;
}

/**
 * The team's own offensive value metric. PA here intentionally excludes
 * sacrifice flies, which is why it is computed separately from the PA column.
 *
 * Intermediate values (sops, bonus, ov) are returned for debugging but are not
 * shown in the UI.
 */
export function offensiveValue(s, ops, obp) {
  const pa = s.ab + s.bb;
  const sops = ops * obp + 1.4 * 12;
  const bonus = (ops - 1.4) / 0.3;
  const ov = sops - 1.2 + bonus;
  const swar = pa === 0 ? 0 : pa * ov * 0.1;
  return { pa, sops, bonus, ov, swar };
}

/** Every derived stat for a set of counting totals. */
export function rates(s) {
  const ba = s.ab > 0 ? s.h / s.ab : 0;
  const obpDen = s.ab + s.bb + s.sf;
  const obp = obpDen > 0 ? (s.h + s.bb) / obpDen : 0;
  const tb = totalBases(s);
  const slg = s.ab > 0 ? tb / s.ab : 0;
  const ops = obp + slg;
  const { swar } = offensiveValue(s, ops, obp);
  return { ba, obp, slg, ops, swar, tb, outs: battingOuts(s), xbh: s.doubles + s.triples + s.hr };
}

/** Counting totals plus every derived stat, flattened for table rendering. */
export function withRates(s) {
  return { ...s, ...rates(s) };
}

/** ".333" — baseball drops the leading zero on rate stats. */
export function fmtRate(n) {
  const s = Number(n).toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

export function gameResult(teamRuns, oppRuns) {
  if (teamRuns == null || oppRuns == null) return null;
  return teamRuns > oppRuns ? 'W' : teamRuns < oppRuns ? 'L' : 'T';
}

/** Win-loss-tie record over a list of games. Ties are omitted when zero. */
export function record(games) {
  const w = games.filter((g) => g.result === 'W').length;
  const l = games.filter((g) => g.result === 'L').length;
  const t = games.filter((g) => g.result === 'T').length;
  return { w, l, t, label: t ? `${w}-${l}-${t}` : `${w}-${l}` };
}

/**
 * Every column the app can show, in one place. `kind` drives formatting:
 * 'count' integers, 'rate' three decimals without a leading zero, 'dec' two
 * decimals. Adding a column here makes it available to every table and to the
 * lineup builder's stat pickers.
 */
export const COLUMNS = [
  { key: 'g', label: 'G', kind: 'count', title: 'Games' },
  { key: 'pa', label: 'PA', kind: 'count', title: 'Plate appearances' },
  { key: 'ab', label: 'AB', kind: 'count', title: 'At bats' },
  { key: 'h', label: 'H', kind: 'count', title: 'Hits' },
  { key: 'singles', label: '1B', kind: 'count', title: 'Singles' },
  { key: 'doubles', label: '2B', kind: 'count', title: 'Doubles' },
  { key: 'triples', label: '3B', kind: 'count', title: 'Triples' },
  { key: 'hr', label: 'HR', kind: 'count', title: 'Home runs' },
  { key: 'rbi', label: 'RBI', kind: 'count', title: 'Runs batted in' },
  { key: 'r', label: 'R', kind: 'count', title: 'Runs scored' },
  { key: 'bb', label: 'BB', kind: 'count', title: 'Walks' },
  { key: 'so', label: 'SO', kind: 'count', title: 'Strikeouts' },
  { key: 'sf', label: 'SF', kind: 'count', title: 'Sacrifice flies' },
  { key: 'outs', label: 'Outs', kind: 'count', title: 'Batting outs' },
  { key: 'xbh', label: 'XBH', kind: 'count', title: 'Extra-base hits' },
  { key: 'tb', label: 'TB', kind: 'count', title: 'Total bases' },
  { key: 'ba', label: 'BA', kind: 'rate', title: 'Batting average' },
  { key: 'obp', label: 'OBP', kind: 'rate', title: 'On-base percentage' },
  { key: 'slg', label: 'SLG', kind: 'rate', title: 'Slugging percentage' },
  { key: 'ops', label: 'OPS', kind: 'rate', title: 'OBP plus SLG' },
  { key: 'swar', label: 'sWAR', kind: 'dec', title: 'Softball wins above replacement' },
];

const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

export function column(key) {
  return COLUMN_BY_KEY.get(key);
}

/** Formats a value the way its column wants to be read. */
export function fmtStat(key, value) {
  const col = COLUMN_BY_KEY.get(key);
  const n = Number(value ?? 0);
  if (!col) return String(value ?? '—');
  if (col.kind === 'rate') return fmtRate(n);
  if (col.kind === 'dec') return n.toFixed(2);
  return String(n);
}

/** Columns shown on the leaderboard, in order. */
export const LEADERBOARD_COLUMNS = [
  'g', 'pa', 'ab', 'h', 'singles', 'doubles', 'triples', 'hr',
  'rbi', 'r', 'bb', 'so', 'outs', 'ba', 'obp', 'slg', 'ops', 'swar',
];

/** Columns shown in a box score and in a player's game log. */
export const BOX_SCORE_COLUMNS = [
  'ab', 'h', 'singles', 'doubles', 'triples', 'hr', 'rbi', 'r', 'bb', 'so', 'outs',
  'ba', 'obp', 'slg', 'ops', 'swar',
];
