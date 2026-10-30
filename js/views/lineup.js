/**
 * Lineup builder: a batting order, ten defensive spots, and three stat columns
 * of your choosing.
 *
 * Reordering the batting order never touches the defense, and vice versa —
 * they are two separate pieces of state over the same set of players.
 *
 * A lineup lives in the URL, so sharing one is just sharing the link. Named
 * lineups are kept in this browser's localStorage.
 */

import { el, empty, segmented } from '../ui.js';
import { ALL, totalsByPlayer } from '../model.js';
import { COLUMNS, column, fmtStat, withRates } from '../stats.js';
import { scopeBar } from './common.js';

/** Ten defensive spots: four outfielders, as slow-pitch is played. */
export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'RC', 'RF'];

const STORE_KEY = 'hawks.lineups';
const DEFAULT_METRICS = ['ba', 'slg', 'ops'];

const state = {
  order: null, // null until we seed it from the roster
  positions: {},
  metrics: [...DEFAULT_METRICS],
  name: '',
  picking: null, // a position awaiting a player, or 'order'
};

export const title = 'Lineup';

export function render(app, params) {
  if (params.s) restore(params.s);

  const totals = totalsByPlayer(app.season, app.scope);
  const roster = app.season.players.filter((p) => totals.has(p.id));

  if (!roster.length) {
    return el(
      'section',
      el('header.page-head', el('h1', 'Lineup')),
      scopeBar(app),
      empty('No players in this filter', 'Widen the season or league to build a lineup.'),
    );
  }

  // Seed the order the first time, and drop anyone who left the filter.
  const ids = new Set(roster.map((p) => p.id));
  if (state.order === null) state.order = roster.map((p) => p.id);
  state.order = state.order.filter((id) => ids.has(id));
  for (const position of POSITIONS) {
    if (state.positions[position] && !state.order.includes(state.positions[position])) {
      delete state.positions[position];
    }
  }

  const byId = new Map(roster.map((p) => [p.id, p]));
  const batters = state.order.map((id) => byId.get(id));
  const bench = roster.filter((p) => !state.order.includes(p.id));

  return el(
    'section.lineup',
    el(
      'header.page-head',
      el('h1', 'Lineup'),
      el('p.subtitle', 'Tap a spot on the field to fill it. Drag a batter, or use the arrows, to set the order.'),
    ),
    el('div.controls.no-print', scopeBar(app), actions(app)),
    el(
      'div.lineup-layout',
      diamond(app, byId),
      el(
        'div',
        battingTable(app, batters, totals),
        benchRow(app, bench),
      ),
    ),
    state.picking && picker(app, byId),
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

function diamond(app, byId) {
  return el(
    'div.diamond',
    { 'aria-label': 'Defensive positions' },
    el('div.diamond-field', { html: FIELD_SVG }),
    POSITIONS.map((position) => {
      const player = byId.get(state.positions[position]);
      return el(
        'div.slot',
        { dataset: { position } },
        el(
          'button.slot-button',
          {
            type: 'button',
            'aria-label': 'Assign ' + position + (player ? ': ' + player.name : ''),
            ondragover: (e) => e.preventDefault(),
            ondrop: (e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (byId.has(id)) assign(app, position, id);
            },
            onclick: () => {
              state.picking = position;
              app.render();
            },
          },
          el('span.slot-position', position),
          el('span.slot-name' + (player ? '' : '.is-empty'), player ? player.name : 'Assign'),
        ),
      );
    }),
  );
}

/** One player per spot, one spot per player. */
function assign(app, position, playerId) {
  for (const p of POSITIONS) if (state.positions[p] === playerId) delete state.positions[p];
  if (position !== 'bench') state.positions[position] = playerId;
  state.picking = null;
  save(app);
}

function positionOf(playerId) {
  return POSITIONS.find((p) => state.positions[p] === playerId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Batting order                                                              */
/* -------------------------------------------------------------------------- */

function battingTable(app, batters, totals) {
  let dragging = null;

  const move = (id, offset) => {
    const from = state.order.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= state.order.length) return;
    const next = [...state.order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    state.order = next;
    save(app);
  };

  const dropOn = (overId) => {
    if (!dragging || dragging === overId) return;
    const next = state.order.filter((id) => id !== dragging);
    next.splice(state.order.indexOf(overId), 0, dragging);
    state.order = next;
    dragging = null;
    save(app);
  };

  return el(
    'div.table-wrap',
    el(
      'table.stats.batting',
      el(
        'thead',
        el(
          'tr',
          el('th', '#'),
          el('th.sticky', 'Batter'),
          el('th', 'Pos'),
          state.metrics.map((metric, i) => el('th.num', metricPicker(app, metric, i))),
          el('th.no-print', ''),
        ),
      ),
      el(
        'tbody',
        batters.map((player, index) => {
          const values = withRates(totals.get(player.id));
          return el(
            'tr',
            {
              draggable: true,
              ondragstart: (e) => {
                dragging = player.id;
                e.dataTransfer.setData('text/plain', player.id);
                e.dataTransfer.effectAllowed = 'move';
              },
              ondragover: (e) => e.preventDefault(),
              ondrop: (e) => {
                e.preventDefault();
                dropOn(player.id);
              },
            },
            el('td.order-number', index + 1),
            el('td.sticky', el('span.grip.no-print', '⠿'), player.name),
            el(
              'td',
              el(
                'button.position-chip',
                {
                  type: 'button',
                  onclick: () => {
                    state.picking = 'player:' + player.id;
                    app.render();
                  },
                },
                positionOf(player.id) ?? 'EH',
              ),
            ),
            state.metrics.map((metric) => el('td.num', fmtStat(metric, values[metric]))),
            el(
              'td.no-print.row-actions',
              el('button', { type: 'button', 'aria-label': 'Move up', onclick: () => move(player.id, -1) }, '▴'),
              el('button', { type: 'button', 'aria-label': 'Move down', onclick: () => move(player.id, 1) }, '▾'),
              el('button', { type: 'button', 'aria-label': 'Remove from lineup', onclick: () => toggle(app, player.id) }, '×'),
            ),
          );
        }),
      ),
    ),
  );
}

function metricPicker(app, metric, index) {
  return el(
    'select.metric-select',
    {
      'aria-label': 'Stat column ' + (index + 1),
      onchange: (e) => {
        state.metrics[index] = e.target.value;
        save(app);
      },
    },
    COLUMNS.map((col) => el('option', { value: col.key, selected: col.key === metric }, col.label)),
  );
}

function benchRow(app, bench) {
  return el(
    'div.bench.no-print',
    el('h3', 'Not batting ', el('span.count', bench.length)),
    bench.length
      ? el('div.chips', bench.map((p) => el('button.chip', { type: 'button', onclick: () => toggle(app, p.id) }, p.name)))
      : el('p.muted', 'Everyone in this filter is in the order.'),
  );
}

function toggle(app, playerId) {
  if (state.order.includes(playerId)) {
    state.order = state.order.filter((id) => id !== playerId);
    for (const p of POSITIONS) if (state.positions[p] === playerId) delete state.positions[p];
  } else {
    state.order = [...state.order, playerId];
  }
  save(app);
}

/* -------------------------------------------------------------------------- */
/* Player picker                                                              */
/* -------------------------------------------------------------------------- */

function picker(app, byId) {
  const target = state.picking;
  const forPlayer = target.startsWith('player:') ? target.slice(7) : null;
  const close = () => {
    state.picking = null;
    app.render();
  };

  const body = forPlayer
    ? el(
        'div.chips',
        el('button.chip', { type: 'button', onclick: () => assign(app, 'bench', forPlayer) }, 'EH / no position'),
        POSITIONS.map((position) =>
          el(
            'button.chip',
            {
              type: 'button',
              class: state.positions[position] === forPlayer ? 'is-active' : null,
              onclick: () => assign(app, position, forPlayer),
            },
            position,
            state.positions[position] && state.positions[position] !== forPlayer
              ? el('span.muted', ' ' + byId.get(state.positions[position]).name)
              : null,
          ),
        ),
      )
    : el(
        'div.chips',
        state.order.map((id) =>
          el(
            'button.chip',
            {
              type: 'button',
              class: state.positions[target] === id ? 'is-active' : null,
              onclick: () => assign(app, target, id),
            },
            byId.get(id).name,
            positionOf(id) ? el('span.muted', ' ' + positionOf(id)) : null,
          ),
        ),
      );

  return el(
    'div.modal',
    { onclick: (e) => e.target.classList.contains('modal') && close() },
    el(
      'div.modal-card',
      el(
        'header',
        el('h3', forPlayer ? 'Position for ' + byId.get(forPlayer).name : 'Who plays ' + target + '?'),
        el('button.icon-button', { type: 'button', 'aria-label': 'Close', onclick: close }, '×'),
      ),
      body,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Saving, sharing, printing                                                  */
/* -------------------------------------------------------------------------- */

function actions(app) {
  const saved = readStore();
  return el(
    'div.actions',
    el('input.name-input', {
      type: 'text',
      placeholder: 'Lineup name',
      value: state.name,
      oninput: (e) => {
        state.name = e.target.value;
      },
    }),
    el('button.button', { type: 'button', onclick: () => storeLineup(app) }, 'Save'),
    Object.keys(saved).length
      ? el(
          'select.metric-select',
          {
            'aria-label': 'Load a saved lineup',
            onchange: (e) => {
              if (e.target.value) loadLineup(app, e.target.value);
            },
          },
          el('option', { value: '' }, 'Load…'),
          Object.keys(saved).sort().map((name) => el('option', { value: name }, name)),
        )
      : null,
    el('button.button.ghost', { type: 'button', onclick: copyLink }, 'Copy link'),
    el('button.button.ghost', { type: 'button', onclick: () => window.print() }, 'Print'),
  );
}

function snapshot() {
  return { o: state.order, p: state.positions, m: state.metrics, n: state.name };
}

function restore(encoded) {
  try {
    const data = JSON.parse(decodeURIComponent(encoded));
    if (Array.isArray(data.o)) state.order = data.o;
    if (data.p && typeof data.p === 'object') state.positions = data.p;
    if (Array.isArray(data.m) && data.m.length === 3 && data.m.every((k) => column(k))) state.metrics = data.m;
    if (typeof data.n === 'string') state.name = data.n;
  } catch {
    // A mangled link just means we keep the lineup already in hand.
  }
}

/** Keeps the URL in step with the lineup without adding history entries. */
function save(app) {
  const encoded = encodeURIComponent(JSON.stringify(snapshot()));
  history.replaceState(null, '', '#/lineup?s=' + encoded);
  app.render();
}

function copyLink() {
  navigator.clipboard?.writeText(location.href);
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function storeLineup(app) {
  const name = state.name.trim();
  if (!name) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [name]: snapshot() }));
  } catch {
    // Private browsing, or storage full — the link still shares the lineup.
  }
  app.render();
}

function loadLineup(app, name) {
  const saved = readStore()[name];
  if (!saved) return;
  state.order = saved.o ?? state.order;
  state.positions = saved.p ?? {};
  state.metrics = saved.m ?? [...DEFAULT_METRICS];
  state.name = name;
  save(app);
}

/* -------------------------------------------------------------------------- */

/** The field, drawn once. Slot positions live in the stylesheet. */
const FIELD_SVG = `
<svg viewBox="0 0 600 570" aria-hidden="true">
  <path d="M300 524 L24 226 A300 300 0 0 1 576 226 Z" class="turf" />
  <path d="M300 511 L116 324 L300 140 L484 324 Z" class="infield" />
  <path d="M300 501 L162 362 L300 224 L438 362 Z" class="chalk" />
  <path d="M300 511 L27 224 M300 511 L573 224" class="chalk" />
  <path d="M62 225 A268 268 0 0 1 538 225" class="fence" />
  <circle cx="300" cy="365" r="24" class="mound" />
  <path d="M292 496 h16 v10 l-8 8 -8 -8 Z" class="base" />
  <path d="M292 216 h16 v16 h-16 Z M154 354 h16 v16 h-16 Z M430 354 h16 v16 h-16 Z" class="base" />
</svg>`;
