/** Pieces more than one view needs. */

import { el, segmented } from '../ui.js';
import { ALL, formatDate, formatTime } from '../model.js';
import { record } from '../stats.js';

/** The leagues that play in a season, per config; every league for All. */
function leaguesIn(config, seasonId) {
  const season = config.seasons.find((s) => s.id === seasonId);
  return season?.leagues ?? config.leagues.map((l) => l.id);
}

/**
 * The season and league filters, always shown in full whatever the data
 * holds. A league that does not play in the chosen season is greyed out —
 * Spring is Wednesday only, Summer Thursday only — which config.json says.
 *
 * Pass `{ leagues: false }` where a league choice would do nothing.
 */
export function scopeBar(app, { leagues = true } = {}) {
  const { config } = app.season;
  const open = leaguesIn(config, app.scope.season);

  const setScope = (patch) => {
    Object.assign(app.scope, patch);
    // Moving to a season the chosen league does not play in widens it to All.
    if (app.scope.league !== ALL && !leaguesIn(config, app.scope.season).includes(app.scope.league)) {
      app.scope.league = ALL;
    }
    app.render();
  };

  return el(
    'div.filters',
    segmented(
      'Season',
      [{ id: ALL, label: 'All Seasons' }, ...config.seasons],
      app.scope.season,
      (season) => setScope({ season }),
    ),
    leagues &&
      segmented(
        'League',
        [{ id: ALL, label: 'All Leagues' }, ...config.leagues.map((l) => ({ ...l, disabled: !open.includes(l.id) }))],
        app.scope.league,
        (league) => setScope({ league }),
      ),
  );
}

export function leagueBadge(app, leagueId) {
  const league = app.season.config.leagues.find((l) => l.id === leagueId);
  if (!league) return null;
  return el('span.badge', { dataset: { league: leagueId } }, league.short ?? league.label);
}

export function playerLink(player) {
  return el(
    'a.player-link',
    { href: '#/players/' + player.id },
    player.jersey && el('span.jersey', '#' + player.jersey),
    player.name,
  );
}

/** "26 games · Record 14-11" */
export function recordLine(games) {
  const { label } = record(games);
  const count = games.length === 1 ? '1 game' : games.length + ' games';
  return el('p.subtitle', count, el('span.sep', '·'), 'Record ', el('strong', label));
}

export function gameWhen(game) {
  const time = formatTime(game.time);
  return formatDate(game.date) + uploadNote(game) + (time ? ' · ' + time : '');
}

/** Flags a date taken from the upload day, so nobody mistakes it for game night. */
export function uploadNote(game) {
  return game.dateIsGuessed ? ' (upload date)' : '';
}

/** Only a final score is worth showing; a half-known one just looks broken. */
export function scoreLine(game) {
  if (game.teamRuns == null || game.oppRuns == null) return null;
  return el('span.score', game.teamRuns, el('span.dash', '–'), game.oppRuns);
}
