/**
 * Turns the files in `data/` into the team's season.
 *
 * Everything the site shows comes from two kinds of file:
 *   data/config.json       leagues, seasons and name fixes
 *   data/games/*.csv       one GameChanger export per game
 *
 * A game's details live in its filename, so adding a game means dropping one
 * file in one folder. See `parseGameFilename` for the format.
 */

import { parseGameChanger } from './csv.js';
import { addStats, emptyStats, gameResult } from './stats.js';

const DATA = 'data';
const GAMES = DATA + '/games';

/* -------------------------------------------------------------------------- */
/* Filenames                                                                  */
/* -------------------------------------------------------------------------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SCORE = /^(\d{1,3})-(\d{1,3})$/;
const TIME = /^(\d{1,2})[.:-]?(\d{2})(am|pm)?$/i;

/**
 * Reads a game's details out of its filename. Tokens are separated by "_" and
 * recognised by shape, so only the date has to come first:
 *
 *   2026-10-29_wednesday_Bumper_19-12.csv
 *   2026-10-29_wednesday_Bumper.csv                 score not in yet
 *   2026-10-29_wed_Pitch-Please_7-12_630pm.csv      hyphens become spaces
 *   2026-07-02_thu_Bumper_11-4_fall.csv             overrides the season
 *
 * Returns null when there is no date, which is the one thing we cannot guess.
 */
export function parseGameFilename(filename, config) {
  const base = filename.replace(/\.csv$/i, '');
  const tokens = base.split('_').map((t) => t.trim()).filter(Boolean);

  let date = null;
  let league = null;
  let season = null;
  let time = null;
  let teamRuns = null;
  let oppRuns = null;
  const rest = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (!date && DATE.test(token)) {
      date = token;
      continue;
    }
    if (!league && findLeague(lower, config)) {
      league = findLeague(lower, config).id;
      continue;
    }
    if (!season && findSeason(lower, config)) {
      season = findSeason(lower, config).id;
      continue;
    }

    const score = token.match(SCORE);
    if (teamRuns === null && score) {
      teamRuns = Number(score[1]);
      oppRuns = Number(score[2]);
      continue;
    }

    const t = token.match(TIME);
    if (!time && t && /^\d{3,4}$|am|pm/i.test(token)) {
      time = normalizeTime(t);
      continue;
    }

    rest.push(token);
  }

  if (!date) return null;

  return {
    date,
    league: league ?? config.leagues[0]?.id ?? 'league',
    season: season ?? seasonForDate(date, config),
    time,
    teamRuns,
    oppRuns,
    opponent: rest.length ? rest.join(' ').replace(/-/g, ' ').trim() : null,
  };
}

function findLeague(token, config) {
  return config.leagues.find(
    (l) => l.id === token || l.label.toLowerCase() === token || (l.aliases ?? []).includes(token),
  );
}

function findSeason(token, config) {
  return config.seasons.find((s) => s.id === token || s.label.toLowerCase() === token);
}

/** Falls back to the season whose months contain the game's month. */
function seasonForDate(date, config) {
  const month = Number(date.slice(5, 7));
  const match = config.seasons.find((s) => (s.months ?? []).includes(month));
  return match ? match.id : null;
}

function normalizeTime(match) {
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3] ? match[3].toLowerCase() : null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  // No am/pm given on an evening-league hour: assume PM.
  if (!meridiem && hour < 12) hour += 12;
  return String(hour).padStart(2, '0') + ':' + minute;
}

/** "18:30" to "6:30 PM" */
export function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return hour + ':' + String(m).padStart(2, '0') + ' ' + meridiem;
}

/** "2026-10-29" to "Thu, Oct 29, 2026", built locally so the date never shifts. */
export function formatDate(date, opts = {}) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: opts.weekday ?? 'short',
    month: 'short',
    day: 'numeric',
    year: opts.year ?? 'numeric',
  });
}

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

/** A stable, URL-safe id for a player's name. */
export function playerId(name) {
  return name
    .normalize('NFKD')
    .replace(/[‘’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Primary position: the one a player has logged the most innings at. */
function primaryPosition(innings) {
  const entries = Object.entries(innings);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' could not be loaded (' + res.status + ')');
  return res.json();
}

/**
 * Reads config, the game index and every game CSV, and returns the whole
 * season: games newest first, players with their jersey and position, and one
 * stat line per player per game.
 *
 * A file that fails to parse is collected in `problems` instead of throwing, so
 * one bad export never takes the whole site down.
 */
export async function loadSeason() {
  const config = await fetchJson(DATA + '/config.json');
  const index = await fetchJson(GAMES + '/index.json');
  const files = (index.games ?? []).filter((f) => /\.csv$/i.test(f));

  const problems = [];
  const games = [];
  const stats = [];
  const players = new Map();

  const loaded = await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(GAMES + '/' + encodeURIComponent(file));
        if (!res.ok) throw new Error('could not be loaded (' + res.status + ')');
        return { file, text: await res.text() };
      } catch (err) {
        problems.push({ file, message: err.message });
        return null;
      }
    }),
  );

  for (const entry of loaded) {
    if (!entry) continue;

    const meta = parseGameFilename(entry.file, config);
    if (!meta) {
      problems.push({ file: entry.file, message: 'the filename needs to start with a YYYY-MM-DD date' });
      continue;
    }

    let parsed;
    try {
      parsed = parseGameChanger(entry.text);
    } catch (err) {
      problems.push({ file: entry.file, message: err.message });
      continue;
    }

    const id = entry.file.replace(/\.csv$/i, '');
    const teamRuns = meta.teamRuns ?? parsed.teamRuns;

    games.push({
      id,
      file: entry.file,
      date: meta.date,
      time: meta.time,
      league: meta.league,
      season: meta.season,
      opponent: meta.opponent,
      teamRuns,
      oppRuns: meta.oppRuns,
      result: gameResult(teamRuns, meta.oppRuns),
    });

    for (const line of parsed.lines) {
      const canonical = (config.playerAliases ?? {})[line.name] ?? line.name;
      const id2 = playerId(canonical);
      const position = primaryPosition(line.innings);
      const existing = players.get(id2);

      if (!existing) {
        players.set(id2, {
          id: id2,
          name: canonical,
          jersey: line.jersey,
          position,
          lastSeen: meta.date,
        });
      } else {
        // Keep the most recent jersey number; keep any position we can find.
        if (meta.date >= existing.lastSeen) {
          existing.lastSeen = meta.date;
          if (line.jersey) existing.jersey = line.jersey;
        }
        if (position && !existing.position) existing.position = position;
      }

      stats.push({ playerId: id2, gameId: id, ...line.stats });
    }
  }

  games.sort(compareGames);

  return {
    config,
    games,
    stats,
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name)),
    problems,
  };
}

/** Newest first; within a date the earliest start time first, untimed last. */
export function compareGames(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.time === b.time) return a.id.localeCompare(b.id);
  if (!a.time) return 1;
  if (!b.time) return -1;
  return a.time < b.time ? -1 : 1;
}

/* -------------------------------------------------------------------------- */
/* Scoping and aggregation                                                    */
/* -------------------------------------------------------------------------- */

/** A scope is { league, season }, where ALL means no filtering on that axis. */
export const ALL = 'all';

export function inScope(game, scope) {
  if (scope.league !== ALL && game.league !== scope.league) return false;
  if (scope.season !== ALL && game.season !== scope.season) return false;
  return true;
}

export function gamesInScope(season, scope) {
  return season.games.filter((g) => inScope(g, scope));
}

/** Counting totals per player id, over the games in scope. */
export function totalsByPlayer(season, scope) {
  const ids = new Set(gamesInScope(season, scope).map((g) => g.id));
  const totals = new Map();
  for (const row of season.stats) {
    if (!ids.has(row.gameId)) continue;
    totals.set(row.playerId, addStats(totals.get(row.playerId) ?? emptyStats(), row));
  }
  return totals;
}

/** Only the leagues that actually have games, so the filters stay honest. */
export function leaguesWithGames(season, seasonId = ALL) {
  const ids = new Set(
    season.games.filter((g) => seasonId === ALL || g.season === seasonId).map((g) => g.league),
  );
  return season.config.leagues.filter((l) => ids.has(l.id));
}

export function seasonsWithGames(season) {
  const ids = new Set(season.games.map((g) => g.season));
  return season.config.seasons.filter((s) => ids.has(s.id));
}

export function labelFor(list, id, fallback = '—') {
  const found = list.find((x) => x.id === id);
  return found ? found.label : fallback;
}

export function leagueLabel(season, id, short = false) {
  const league = season.config.leagues.find((l) => l.id === id);
  if (!league) return id;
  return short ? league.short ?? league.label : league.label;
}
