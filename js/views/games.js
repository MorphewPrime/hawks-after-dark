/** Every game on file, newest first. */

import { el, empty } from '../ui.js';
import { gamesInScope } from '../model.js';
import { gameWhen, leagueBadge, recordLine, scopeBar, scoreLine } from './common.js';

export const title = 'Games';

export function render(app) {
  const games = gamesInScope(app.season, app.scope);

  return el(
    'section',
    el('header.page-head', el('h1', 'Games'), recordLine(games)),
    scopeBar(app),
    games.length
      ? el('ul.game-list', games.map((game) => gameRow(app, game)))
      : empty('No games in this filter', 'Try widening the season or league.'),
  );
}

function gameRow(app, game) {
  return el(
    'li.game-row',
    el('span.result', { dataset: { result: game.result ?? 'none' } }, game.result ?? '–'),
    el(
      'a.game-main',
      { href: '#/games/' + encodeURIComponent(game.id) },
      el('span.game-title', leagueBadge(app, game.league), 'vs ', game.opponent ?? 'Unknown'),
      el('span.game-meta', gameWhen(game)),
    ),
    scoreLine(game),
  );
}
