/**
 * Turns the files in `data/` into the team's season.
 *
 * Everything the site shows comes from two kinds of file:
 *   data/config.json       leagues, seasons and name fixes
 *   data/games/*.csv       one GameChanger export per game
 *
 * Adding a game means dropping its CSV into data/games/. The filename can
 * carry details the export does not (date, league, score) but needs none of
 * them: see `parseGameFilename`, and `loadSeason` for how gaps are filled.
 */

import { parseGameChanger } from './csv.js';
import { addStats, emptyStats, gameResult } from './stats.js';

const DATA = 'data';
const GAMES = DATA + '/games';

/* -------------------------------------------------------------------------- */
/* Filenames                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reads whatever it can out of a game's filename.
 *
 * Nothing here is required. Each piece is looked for by shape and lifted out
 * of the name; whatever text is left over is taken to be the opponent. So all
 * of these work, and so does a file straight out of GameChanger:
 *
 *   Bumper.csv                                   opponent only
 *   2026-10-29 Bumper 19-12.csv                  spaces are fine
 *   10-29-2026_wed_Bumper_19-12.csv              US dates too
 *   2026-10-29_wed_Pitch-Please_7-12_6.30pm.csv  the lot
 *
 * Anything it cannot find comes back null and is filled in elsewhere: the date
 * falls back to when the file was added to the repo, and the opponent to the
 * filename itself.
 */
export function parseGameFilename(filename, config) {
  const found = {};
  let rest = filename.replace(/\.csv$/i, '').trim();

  // Order matters. The date owns its hyphens, so it has to come out before
  // anything tries to read "10-29" as a score.
  rest = takeDate(rest, found);
  rest = takeTime(rest, found);
  rest = takeScore(rest, found);
  rest = takeNamed(rest, config.leagues, 'league', found);
  rest = takeNamed(rest, config.seasons, 'season', found);

  return {
    date: found.date ?? null,
    league: found.league ?? null,
    season: found.season ?? null,
    time: found.time ?? null,
    teamRuns: found.teamRuns ?? null,
    oppRuns: found.oppRuns ?? null,
    opponent: tidy(rest),
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** A separator, or the start/end of the name. */
const EDGE = '(?:^|[\\s_.-])';
const END = '(?=$|[\\s_.-])';

function takeDate(text, found) {
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    found.date = `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
    return text.replace(iso[0], ' ');
  }
  // 10-29-2026, 10.29.26, 10/29/2026
  const us = text.match(/(\d{1,2})[-._/](\d{1,2})[-._/](\d{2,4})/);
  if (us) {
    const year = us[3].length === 2 ? '20' + us[3] : us[3];
    found.date = `${year}-${pad(us[1])}-${pad(us[2])}`;
    return text.replace(us[0], ' ');
  }
  return text;
}

/** Only with am/pm — a bare "630" in a filename is far more often not a time. */
function takeTime(text, found) {
  const m = text.match(new RegExp(EDGE + '(\\d{1,2})[:.]?(\\d{2})?\\s*(am|pm)' + END, 'i'));
  if (!m) return text;
  let hour = Number(m[1]);
  const meridiem = m[3].toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  found.time = `${pad(hour)}:${m[2] ?? '00'}`;
  return text.replace(m[0], ' ');
}

function takeScore(text, found) {
  const m = text.match(new RegExp(EDGE + '(\\d{1,2})\\s*-\\s*(\\d{1,2})' + END));
  if (!m) return text;
  found.teamRuns = Number(m[1]);
  found.oppRuns = Number(m[2]);
  return text.replace(m[0], ' ');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a league or season by its id, label or any alias, whole-word. */
function takeNamed(text, list, key, found) {
  for (const item of list) {
    for (const name of [item.id, item.label, ...(item.aliases ?? [])]) {
      const re = new RegExp(EDGE + escapeRe(name) + END, 'i');
      if (re.test(text)) {
        found[key] = item.id;
        return text.replace(re, ' ');
      }
    }
  }
  return text;
}

/**
 * Whatever is left is the opponent. Separators become spaces, and two things
 * people add without meaning them as part of the name go: a leading "vs" or
 * "at", and the " (1)" a browser tacks onto a second download of the same file.
 */
function tidy(text) {
  const name = text
    .replace(/[_.-]+/g, ' ')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/^\s*(vs|v|versus|at|@)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name || null;
}

/** The season whose months contain the game's month. */
export function seasonForDate(date, config) {
  if (!date) return null;
  const month = Number(date.slice(5, 7));
  const match = config.seasons.find((s) => (s.months ?? []).includes(month));
  return match ? match.id : null;
}

/**
 * The league, when the filename does not name one. In order:
 *   - a game date that falls on a league's night ("wednesday" on a Wednesday)
 *   - a season that only has one league (Summer is Thursday only)
 *   - the first league in config
 * The weekday only counts for a date read from the filename: the day a file
 * happened to be uploaded says nothing about the night the game was played.
 */
function inferLeague(config, seasonId, date, dateFromName) {
  if (date && dateFromName) {
    const [y, m, d] = date.split('-').map(Number);
    const night = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const match = config.leagues.find((l) => l.id === night || l.label.toLowerCase() === night);
    if (match) return match.id;
  }
  const season = config.seasons.find((s) => s.id === seasonId);
  if (season?.leagues?.length === 1) return season.leagues[0];
  return config.leagues[0]?.id ?? null;
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
  if (!date) return 'Date not set';
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

/** An index entry is either "game.csv" or { file, added }. */
function indexEntry(entry) {
  return typeof entry === 'string' ? { file: entry, added: null } : { file: entry.file, added: entry.added ?? null };
}

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
  const entries = (index.games ?? []).map(indexEntry).filter((e) => /\.csv$/i.test(e.file));

  const problems = [];
  const games = [];
  const stats = [];
  const players = new Map();

  const loaded = await Promise.all(
    entries.map(async (entry) => {
      try {
        const res = await fetch(GAMES + '/' + encodeURIComponent(entry.file));
        if (!res.ok) throw new Error('could not be loaded (' + res.status + ')');
        return { ...entry, text: await res.text() };
      } catch (err) {
        problems.push({ file: entry.file, message: err.message });
        return null;
      }
    }),
  );

  for (const entry of loaded) {
    if (!entry) continue;

    const meta = parseGameFilename(entry.file, config);

    let parsed;
    try {
      parsed = parseGameChanger(entry.text);
    } catch (err) {
      problems.push({ file: entry.file, message: err.message });
      continue;
    }

    const id = entry.file.replace(/\.csv$/i, '');
    // Nothing in the filename is required. What it does not say, we work out:
    // the date from when the file reached the repo, the season from the date,
    // the league from the night or the season, the opponent from the name
    // itself, and the runs we scored from the CSV's own totals row.
    const date = meta.date ?? entry.added ?? null;
    const season = meta.season ?? seasonForDate(date, config);
    const teamRuns = meta.teamRuns ?? parsed.teamRuns;

    games.push({
      id,
      file: entry.file,
      date,
      dateIsGuessed: !meta.date && !!date,
      time: meta.time,
      league: meta.league ?? inferLeague(config, season, date, !!meta.date),
      season,
      opponent: meta.opponent,
      teamRuns,
      oppRuns: meta.oppRuns,
      result: gameResult(teamRuns, meta.oppRuns),
    });

    for (const line of parsed.lines) {
      const canonical = (config.playerAliases ?? {})[line.name] ?? line.name;
      const pid = playerId(canonical);
      const position = primaryPosition(line.innings);
      const existing = players.get(pid);

      if (!existing) {
        players.set(pid, {
          id: pid,
          name: canonical,
          jersey: line.jersey,
          position,
          lastSeen: date,
        });
      } else {
        // Keep the most recent jersey number; keep any position we can find.
        if (date && (!existing.lastSeen || date >= existing.lastSeen)) {
          existing.lastSeen = date;
          if (line.jersey) existing.jersey = line.jersey;
        }
        if (position && !existing.position) existing.position = position;
      }

      stats.push({ playerId: pid, gameId: id, ...line.stats });
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

/** Newest first; within a date the earliest start time first, untimed last.
 *  A game with no date at all sorts to the bottom. */
export function compareGames(a, b) {
  if (!a.date !== !b.date) return a.date ? -1 : 1;
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

export function labelFor(list, id, fallback = '—') {
  const found = list.find((x) => x.id === id);
  return found ? found.label : fallback;
}
