/** Pieces more than one view needs. */

import { el, segmented } from '../ui.js';
import { ALL, formatDate, formatTime, leaguesWithGames, seasonsWithGames } from '../model.js';
import { record } from '../stats.js';

/**
 * The season and league filters. Leagues that have no games in the chosen
 * season are left out rather than shown disabled, which keeps the Wednesday
 * and Thursday splits honest without hard-coding which season has which.
 */
export function scopeBar(app) {
  const seasons = seasonsWithGames(app.season);
  const leagues = leaguesWithGames(app.season, app.scope.season);
  const everything = { id: ALL, label: 'All' };

  const setScope = (patch) => {
    Object.assign(app.scope, patch);
    // Dropping to a season that does not include the chosen league widens it.
    const stillThere = leaguesWithGames(app.season, app.scope.season);
    if (app.scope.league !== ALL && !stillThere.some((l) => l.id === app.scope.league)) {
      app.scope.league = ALL;
    }
    app.render();
  };

  // With one season and one league there is nothing to filter, so show nothing.
  if (seasons.length < 2 && leagues.length < 2) return null;

  return el(
    'div.filters',
    seasons.length > 1 &&
      segmented('Season', [everything, ...seasons], app.scope.season, (season) => setScope({ season })),
    leagues.length > 1 &&
      segmented('League', [everything, ...leagues], app.scope.league, (league) => setScope({ league })),
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

/** "12 games · 8-4" */
export function recordLine(games) {
  const { label } = record(games);
  const count = games.length === 1 ? '1 game' : games.length + ' games';
  return el('p.subtitle', count, games.length ? el('span.sep', '·') : null, games.length ? el('strong', label) : null);
}

export function gameTitle(app, game) {
  return 'vs ' + (game.opponent ?? 'Unknown') + ' · ' + formatDate(game.date);
}

export function gameWhen(game) {
  const time = formatTime(game.time);
  return formatDate(game.date) + (time ? ' · ' + time : '');
}

/** Only a final score is worth showing; a half-known one just looks broken. */
export function scoreLine(game) {
  if (game.teamRuns == null || game.oppRuns == null) return null;
  return el('span.score', game.teamRuns, el('span.dash', '–'), game.oppRuns);
}
