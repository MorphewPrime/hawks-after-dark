/** One player: totals for the scope, a split per league, and a game log. */

import { el, empty, sortableTable } from '../ui.js';
import { ALL, formatDate, gamesInScope, totalsByPlayer } from '../model.js';
import { BOX_SCORE_COLUMNS, column, emptyStats, fmtStat, withRates } from '../stats.js';
import { leagueBadge, scopeBar } from './common.js';

const state = { sort: { key: 'date', dir: -1 } };

/** The five numbers worth showing big. */
const HEADLINE = ['ba', 'obp', 'slg', 'ops', 'swar'];
const SUMMARY = ['g', 'pa', 'ab', 'h', 'doubles', 'triples', 'hr', 'rbi', 'r', 'bb', 'so', 'outs'];

export const title = 'Player';

export function render(app, params) {
  const player = app.season.players.find((p) => p.id === params.id);
  if (!player) {
    return el(
      'section',
      empty('Player not found', 'They may be spelled differently in a newer export.', el('a.button', { href: '#/' }, 'Leaderboard')),
    );
  }

  const scoped = { ...app.scope, league: ALL };
  const overall = totalsByPlayer(app.season, scoped).get(player.id);
  const perLeague = app.season.config.leagues
    .map((league) => ({
      league,
      totals: totalsByPlayer(app.season, { ...scoped, league: league.id }).get(player.id),
    }))
    .filter((split) => split.totals);

  return el(
    'section',
    el('a.back', { href: '#/' }, '← Leaderboard'),
    el(
      'header.page-head.player-head',
      player.jersey && el('span.jersey-big', player.jersey),
      el(
        'div',
        el('h1', player.name),
        el(
          'p.subtitle',
          player.position ? 'Mostly ' + player.position : null,
          player.position ? el('span.sep', '·') : null,
          'Last played ' + formatDate(player.lastSeen),
        ),
      ),
    ),
    // Seasons only: the page already splits by league underneath.
    scopeBar(app, { leagues: false }),
    overall ? statCard('Overall', overall, true) : empty('No games in this filter', 'Try widening the season.'),
    perLeague.length > 1 &&
      el('div.split-grid', perLeague.map(({ league, totals }) => statCard(league.label, totals, false, league.id))),
    overall && gameLog(app, player, scoped),
  );
}

function statCard(label, totals, primary, leagueId) {
  const values = withRates(totals);
  const stat = (key, cls) =>
    el(cls, el('span.stat-label', column(key).label), el('span.stat-value', fmtStat(key, values[key])));

  return el(
    'article.card' + (primary ? '.card-primary' : ''),
    { dataset: leagueId ? { league: leagueId } : null },
    el('h2', label),
    el('div.headline', HEADLINE.map((key) => stat(key, 'div.stat'))),
    el('div.summary', SUMMARY.map((key) => stat(key, 'div.stat-small'))),
  );
}

function gameLog(app, player, scope) {
  const games = new Map(gamesInScope(app.season, scope).map((g) => [g.id, g]));
  const rows = app.season.stats
    .filter((s) => s.playerId === player.id && games.has(s.gameId))
    .map((s) => {
      const game = games.get(s.gameId);
      return {
        key: s.gameId,
        game,
        sortText: game.date + (game.time ?? ''),
        cells: [
          el('a', { href: '#/games/' + encodeURIComponent(game.id) }, formatDate(game.date, { year: undefined })),
          leagueBadge(app, game.league),
          game.opponent ?? '—',
        ],
        values: withRates({ ...emptyStats(), ...s }),
      };
    });

  rows.sort((a, b) => {
    if (state.sort.key === 'date') return a.sortText.localeCompare(b.sortText) * state.sort.dir;
    if (state.sort.key === 'opponent') return (a.game.opponent ?? '').localeCompare(b.game.opponent ?? '') * state.sort.dir;
    return ((a.values[state.sort.key] ?? 0) - (b.values[state.sort.key] ?? 0)) * state.sort.dir;
  });

  return el(
    'section.block',
    el('h2', 'Game log'),
    sortableTable({
      leading: [
        { key: 'date', label: 'Date' },
        { label: 'Lg' },
        { key: 'opponent', label: 'Opponent' },
      ],
      columns: BOX_SCORE_COLUMNS,
      rows,
      sort: state.sort,
      onSort: (sort) => {
        state.sort = sort;
        app.render();
      },
    }),
  );
}
