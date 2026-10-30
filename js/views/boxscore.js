/** One game's batting line, straight out of its CSV. */

import { el, empty, sortRows, sortableTable } from '../ui.js';
import { formatDate, formatTime, labelFor } from '../model.js';
import { BOX_SCORE_COLUMNS, sumStats, withRates } from '../stats.js';
import { leagueBadge, playerLink, scoreLine } from './common.js';

const state = { sort: { key: 'ops', dir: -1 } };

export const title = 'Box score';

export function render(app, params) {
  const game = app.season.games.find((g) => g.id === params.id);
  if (!game) {
    return el(
      'section',
      empty('Game not found', 'It may have been renamed.', el('a.button', { href: '#/games' }, 'All games')),
    );
  }

  const byPlayer = new Map(app.season.players.map((p) => [p.id, p]));
  const lines = app.season.stats.filter((s) => s.gameId === game.id);

  const rows = lines.map((line) => {
    const player = byPlayer.get(line.playerId);
    return {
      key: line.playerId,
      sortText: player?.name ?? line.playerId,
      cells: [player ? playerLink(player) : line.playerId],
      values: withRates(line),
    };
  });

  const outcome = {
    W: 'Win',
    L: 'Loss',
    T: 'Tie',
  }[game.result];

  return el(
    'section',
    el('a.back', { href: '#/games' }, '← Games'),
    el(
      'header.page-head',
      el('h1', 'vs ', game.opponent ?? 'Unknown'),
      el(
        'p.subtitle',
        leagueBadge(app, game.league),
        formatDate(game.date, { weekday: 'long' }),
        game.time ? el('span.sep', '·') : null,
        game.time ? formatTime(game.time) : null,
        game.season ? el('span.sep', '·') : null,
        game.season ? labelFor(app.season.config.seasons, game.season) : null,
      ),
      game.teamRuns != null &&
        el('p.scoreline', { dataset: { result: game.result ?? 'none' } }, outcome ?? '', ' ', scoreLine(game)),
    ),
    rows.length
      ? sortableTable({
          leading: [{ key: 'name', label: 'Player' }],
          columns: BOX_SCORE_COLUMNS,
          rows: sortRows(rows, state.sort),
          sort: state.sort,
          onSort: (sort) => {
            state.sort = sort;
            app.render();
          },
          footer: { cells: [el('strong', 'Team')], values: withRates(sumStats(lines)) },
        })
      : empty('No batting lines', 'The CSV for this game has no player rows.'),
    el('p.file-note', 'From ', el('code', game.file)),
  );
}
