/** Team batting leaders for the scope in view. */

import { el, empty, sortRows, sortableTable } from '../ui.js';
import { gamesInScope, totalsByPlayer } from '../model.js';
import { LEADERBOARD_COLUMNS, sumStats, withRates } from '../stats.js';
import { playerLink, recordLine, scopeBar } from './common.js';

const state = {
  sort: { key: 'ops', dir: -1 },
  minAb: 0,
};

export const title = 'Leaderboard';

export function render(app) {
  const games = gamesInScope(app.season, app.scope);
  const totals = totalsByPlayer(app.season, app.scope);

  const rows = app.season.players
    .filter((p) => totals.has(p.id))
    .map((p) => ({
      key: p.id,
      sortText: p.name,
      cells: [playerLink(p)],
      values: withRates(totals.get(p.id)),
    }))
    .filter((row) => row.values.ab >= state.minAb);

  const header = el(
    'header.page-head',
    el('h1', 'Leaderboard'),
    recordLine(games),
  );

  if (!app.season.games.length) {
    return el(
      'section',
      header,
      empty(
        'No games yet',
        'Drop a GameChanger CSV into data/games/ and the whole site fills in.',
        app.repoUrl && el('a.button', { href: app.repoUrl + '/tree/main/data/games' }, 'Open the games folder'),
      ),
    );
  }

  if (!rows.length) {
    return el('section', header, scopeBar(app), empty('Nothing in this filter', 'Try widening the season or league.'));
  }

  return el(
    'section',
    header,
    el('div.controls', scopeBar(app), minAbControl(app)),
    sortableTable({
      leading: [{ key: 'name', label: 'Player' }],
      columns: LEADERBOARD_COLUMNS,
      rows: sortRows(rows, state.sort),
      sort: state.sort,
      onSort: (sort) => {
        state.sort = sort;
        app.render();
      },
      footer: {
        cells: [el('strong', 'Team')],
        // G is the number of games the team played, not the sum of appearances.
        values: { ...withRates(sumStats([...totals.values()])), g: games.length },
      },
    }),
  );
}

function minAbControl(app) {
  return el(
    'label.field',
    'Min AB',
    el('input', {
      type: 'number',
      min: 0,
      value: state.minAb,
      oninput: (e) => {
        state.minAb = Math.max(0, Number(e.target.value) || 0);
        app.render();
      },
    }),
  );
}
