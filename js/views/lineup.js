/**
 * Lineup builder: a game-day roster, a batting order, ten defensive spots, and
 * three stat columns of your choosing.
 *
 * Ported from the original app, which kept lineups in a database table. There
 * is no database here, so a lineup lives in the URL — sharing one is sharing
 * the link — and named lineups are kept in this browser's localStorage.
 *
 * Two pieces of state over the same players, deliberately kept apart:
 *   order      who bats, and in what order
 *   positions  which of them is standing where
 * Reordering the batting order never touches the defense. A batter with no
 * position is an EH, which is what the bench below the field lists.
 */

import { el, empty } from '../ui.js';
import { totalsByPlayer } from '../model.js';
import { COLUMNS, column, emptyStats, fmtStat, withRates } from '../stats.js';
import { scopeBar } from './common.js';

/** Ten defensive spots: four outfielders, as slow-pitch is played. */
export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'RC', 'RF'];

const STORE_KEY = 'hawks.lineups';
const DEFAULT_METRICS = ['ba', 'slg', 'ops'];

const state = {
  order: [],
  positions: {},
  metrics: [...DEFAULT_METRICS],
  name: 'Game Day Lineup',
  dirty: false,
  saved: false,
  dialog: null,
  search: '',
};

/**
 * The lineup JSON last written to (or read from) the URL. The link only wins
 * when it says something different — a shared link being opened, or Back —
 * so an edit that has not reached the URL yet is never overwritten by it.
 */
let lastLink = null;

export const title = 'Lineup Builder';

export function render(app, params) {
  if (params.s && params.s !== lastLink) {
    restore(params.s);
    lastLink = params.s;
  }

  // The filters change the numbers, never who is in the lineup: a player
  // with no games in the chosen season still bats, with dashes for stats.
  const totals = totalsByPlayer(app.season, app.scope);
  const roster = app.season.players;
  const byId = new Map(roster.map((p) => [p.id, p]));

  // Only someone who has left the data entirely drops out.
  state.order = state.order.filter((id) => byId.has(id));
  for (const position of POSITIONS) {
    if (state.positions[position] && !state.order.includes(state.positions[position])) {
      delete state.positions[position];
    }
  }

  const batters = state.order.map((id) => byId.get(id));
  const eh = batters.filter((p) => !positionOf(p.id));

  return el(
    'section.lineup',
    header(app),
    el('div.no-print', scopeBar(app)),
    el(
      'div.lineup-layout',
      el(
        'section.lineup-pane',
        paneHead(
          'Defense',
          Object.keys(state.positions).length + '/10',
          el(
            'button.link-button.no-print',
            {
              type: 'button',
              disabled: !Object.keys(state.positions).length,
              onclick: () => {
                if (!confirm('Clear all defensive positions? The batting order is kept.')) return;
                state.positions = {};
                save(app);
              },
            },
            '↺ Clear field',
          ),
        ),
        diamond(app, byId),
        benchRow(app, eh),
      ),
      el(
        'section.lineup-pane',
        paneHead(
          'Batting order',
          state.order.length === 1 ? '1 player' : state.order.length + ' players',
          el('button.button.ghost.no-print', { type: 'button', onclick: () => open(app, 'roster') }, 'Roster'),
        ),
        batters.length
          ? battingTable(app, batters, totals)
          : empty(
              'No players selected',
              'Pick who is playing tonight and they drop into the order.',
              el('button.button', { type: 'button', onclick: () => open(app, 'roster') }, 'Select players'),
            ),
      ),
    ),
    footer(),
    state.dialog && dialog(app, roster, byId),
  );
}

function header(app) {
  const status = state.dirty ? ' · Unsaved changes' : state.saved ? ' · Saved' : '';
  return el(
    'header.page-head.lineup-head',
    el('div', el('h1', 'Lineup Builder'), el('p.subtitle', state.name, status && el('span.status', status))),
    el(
      'div.actions.no-print',
      el('button.button.ghost', { type: 'button', onclick: () => open(app, 'load') }, 'Load saved lineup'),
      el(
        'button.button',
        { type: 'button', disabled: !state.order.length, onclick: () => open(app, 'save') },
        'Save lineup',
      ),
    ),
  );
}

function paneHead(label, count, action) {
  return el('div.pane-head', el('h2', label, el('span.pane-count', count)), action);
}

function footer() {
  return el(
    'div.lineup-foot.no-print',
    el('button.button.ghost', { type: 'button', onclick: copyLink }, 'Copy link'),
    el(
      'button.button.ghost',
      { type: 'button', disabled: !state.order.length, onclick: () => window.print() },
      'Print / save as PDF',
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A chip on the field is barely wider than a thumb, so it shows the shortest
 * name that still says who it is: a first name, or "Gabe S." when two players
 * share one. The batting order below always shows the full name.
 */
function shortNames(players) {
  const counts = new Map();
  for (const p of players) {
    const first = p.name.split(/\s+/)[0];
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  return new Map(
    players.map((p) => {
      const parts = p.name.split(/\s+/);
      const first = parts[0];
      const last = parts[parts.length - 1];
      return [p.id, counts.get(first) > 1 && last !== first ? first + ' ' + last[0] + '.' : first];
    }),
  );
}

function diamond(app, byId) {
  const short = shortNames([...byId.values()]);

  return el(
    'div.diamond',
    { 'aria-label': 'Defensive positions', style: { aspectRatio: VIEW[0] + ' / ' + VIEW[1] } },
    el('div.diamond-field', { html: FIELD_SVG }),
    POSITIONS.map((position) => {
      const player = byId.get(state.positions[position]);
      const [x, y] = STATIONS[position];
      return el(
        'div.slot',
        {
          dataset: { position },
          style: { left: (x / VIEW[0]) * 100 + '%', top: (y / VIEW[1]) * 100 + '%' },
        },
        el(
          'button.slot-button',
          {
            type: 'button',
            'aria-label': 'Assign ' + position + (player ? ': ' + player.name : ''),
            onclick: () => open(app, 'position', position),
          },
          el('span.slot-position', position),
          el('span.slot-name' + (player ? '' : '.is-empty'), player ? short.get(player.id) : 'Assign'),
        ),
      );
    }),
  );
}

/** One player per spot, one spot per player. */
function assign(app, playerId, target) {
  for (const p of POSITIONS) if (state.positions[p] === playerId) delete state.positions[p];
  if (target !== 'bench') state.positions[target] = playerId;
  state.dialog = null;
  save(app);
}

function positionOf(playerId) {
  return POSITIONS.find((p) => state.positions[p] === playerId) ?? null;
}

function benchRow(app, eh) {
  return el(
    'div.bench',
    el('h3', 'EH / substitutes ', el('span.count', eh.length)),
    eh.length
      ? el('div.chips', eh.map((p) => el('button.chip', { type: 'button', onclick: () => open(app, 'player', p.id) }, p.name)))
      : el('p.muted', state.order.length ? 'Everyone in the order is on the field.' : 'No players selected yet.'),
  );
}

/* -------------------------------------------------------------------------- */
/* Batting order                                                              */
/* -------------------------------------------------------------------------- */

function battingTable(app, batters, totals) {
  return el(
    'div.table-wrap',
    el(
      'table.stats.batting',
      el(
        'thead',
        el(
          'tr',
          el('th.no-print.grip-col', ''),
          el('th.num-col', '#'),
          el('th.sticky', 'Player'),
          el('th', 'Pos'),
          state.metrics.map((metric, i) => el('th.num', metricPicker(app, metric, i))),
          el('th.no-print', ''),
        ),
      ),
      el('tbody', batters.map((player, i) => battingRow(app, player, i, batters.length, totals))),
    ),
  );
}

function battingRow(app, player, index, length, totals) {
  const stats = totals.get(player.id);
  const values = withRates(stats ?? emptyStats());

  const row = el(
    'tr',
    { dataset: { player: player.id } },
    el(
      'td.no-print.grip-col',
      el(
        'button.grip',
        {
          type: 'button',
          'aria-label': 'Drag ' + player.name,
          title: 'Drag to reorder',
          onpointerdown: (e) => startDrag(e, app, row),
        },
        '⠿',
      ),
    ),
    el('td.order-number', index + 1),
    el(
      'td.sticky',
      el('span.batter-name', player.name),
      el('span.batter-jersey', player.jersey ? '#' + player.jersey : '—'),
    ),
    el(
      'td',
      el(
        'button.position-chip',
        { type: 'button', onclick: () => open(app, 'player', player.id) },
        positionOf(player.id) ?? 'EH',
      ),
    ),
    state.metrics.map((metric) => el('td.num', stats ? fmtStat(metric, values[metric]) : '—')),
    el(
      'td.no-print.row-actions',
      el(
        'span.stepper',
        el(
          'button',
          {
            type: 'button',
            'aria-label': 'Move ' + player.name + ' up',
            disabled: index === 0,
            onclick: () => move(app, player.id, -1),
          },
          '▴',
        ),
        el(
          'button',
          {
            type: 'button',
            'aria-label': 'Move ' + player.name + ' down',
            disabled: index === length - 1,
            onclick: () => move(app, player.id, 1),
          },
          '▾',
        ),
      ),
      el(
        'button.remove',
        {
          type: 'button',
          'aria-label': 'Remove ' + player.name,
          title: 'Remove from lineup',
          onclick: () => toggle(app, player.id),
        },
        '×',
      ),
    ),
  );

  return row;
}

function move(app, playerId, offset) {
  const from = state.order.indexOf(playerId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= state.order.length) return;
  const next = [...state.order];
  next.splice(from, 1);
  next.splice(to, 0, playerId);
  state.order = next;
  save(app);
}

/**
 * Drag to reorder, on pointer events so a mouse, a finger and a stylus all
 * behave the same.
 *
 * The row is moved in the DOM as you drag and the order is only read back on
 * release: re-rendering mid-drag would pull the row out from under the pointer.
 *
 * The listeners go on window, not on the grip. Moving the row detaches the
 * grip for an instant, which silently drops any pointer capture it held, and
 * from then on the grip would never hear the release.
 */
function startDrag(event, app, row) {
  event.preventDefault();
  const tbody = row.parentElement;
  row.classList.add('is-dragging');

  const onMove = (e) => {
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr');
    if (!over || over === row || over.parentElement !== tbody) return;
    const box = over.getBoundingClientRect();
    tbody.insertBefore(row, e.clientY < box.top + box.height / 2 ? over : over.nextSibling);
    [...tbody.children].forEach((tr, i) => {
      tr.querySelector('.order-number').textContent = i + 1;
    });
  };

  const onUp = () => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    row.classList.remove('is-dragging');
    const next = [...tbody.children].map((tr) => tr.dataset.player);
    if (next.join() !== state.order.join()) {
      state.order = next;
      save(app);
    }
  };

  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
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
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

function open(app, kind, value = null) {
  state.dialog = { kind, value };
  state.search = '';
  app.render();
}

function close(app) {
  state.dialog = null;
  app.render();
}

function dialog(app, roster, byId) {
  const { kind, value } = state.dialog;

  const heads = {
    roster: ['Game day roster', state.order.length + ' selected · ' + roster.length + ' rostered'],
    position: ['Assign ' + value, 'Game day players'],
    player: [byId.get(value)?.name ?? 'Player', 'Defensive position'],
    save: ['Save lineup', state.order.length + ' batters · ' + Object.keys(state.positions).length + ' positions'],
    load: ['Load saved lineup', 'Saved in this browser'],
  };

  const body = {
    roster: () => rosterDialog(app, roster),
    position: () => positionDialog(app, value, byId),
    player: () => playerDialog(app, value, byId),
    save: () => saveDialog(app),
    load: () => loadDialog(app),
  }[kind];

  return el(
    'div.modal',
    { onclick: (e) => e.target.classList.contains('modal') && close(app) },
    el(
      'div.modal-card',
      el(
        'header',
        el('div', el('h3', heads[kind][0]), el('p.muted.modal-note', heads[kind][1])),
        el('button.icon-button', { type: 'button', 'aria-label': 'Close', onclick: () => close(app) }, '×'),
      ),
      body(),
    ),
  );
}

function rosterDialog(app, roster) {
  const shown = roster.filter((p) => p.name.toLowerCase().includes(state.search.toLowerCase()));

  return el(
    'div.roster',
    el('input.roster-search', {
      type: 'search',
      placeholder: 'Search players',
      'aria-label': 'Search roster',
      value: state.search,
      dataset: { keep: 'roster-search' },
      oninput: (e) => {
        state.search = e.target.value;
        app.render();
      },
    }),
    el(
      'div.roster-bulk',
      el(
        'button.button.ghost',
        {
          type: 'button',
          onclick: () => {
            state.order = [...state.order, ...roster.filter((p) => !state.order.includes(p.id)).map((p) => p.id)];
            save(app);
          },
        },
        'Select all',
      ),
      el(
        'button.link-button',
        {
          type: 'button',
          onclick: () => {
            if (state.order.length && !confirm('Remove all players and defensive assignments?')) return;
            state.order = [];
            state.positions = {};
            save(app);
          },
        },
        'Deselect all',
      ),
    ),
    el(
      'div.roster-list',
      shown.length
        ? shown.map((p) =>
            el(
              'label.roster-row',
              el('input', {
                type: 'checkbox',
                checked: state.order.includes(p.id),
                'aria-label': 'Select ' + p.name,
                onchange: () => toggle(app, p.id),
              }),
              el('span.roster-name', p.name),
              el('span.muted', p.jersey ? '#' + p.jersey : ''),
            ),
          )
        : el('p.muted.roster-none', 'No players match that search.'),
    ),
    el('button.button.wide', { type: 'button', onclick: () => close(app) }, 'Done'),
  );
}

function positionDialog(app, position, byId) {
  const batters = state.order.map((id) => byId.get(id));
  const current = state.positions[position];

  return el(
    'div',
    batters.length
      ? el(
          'div.pick-list',
          batters.map((p) =>
            el(
              'button.pick',
              {
                type: 'button',
                class: current === p.id ? 'is-active' : null,
                onclick: () => assign(app, p.id, position),
              },
              p.name,
              el('span.pick-note', positionOf(p.id) ?? 'EH'),
            ),
          ),
        )
      : el('p.muted', 'Pick your game day roster first.'),
    current && el('button.button.ghost.wide', { type: 'button', onclick: () => assign(app, current, 'bench') }, 'Move to EH'),
    !batters.length && el('button.button.wide', { type: 'button', onclick: () => open(app, 'roster') }, 'Select players'),
  );
}

function playerDialog(app, playerId, byId) {
  if (!byId.has(playerId)) return el('p.muted', 'That player is not in this filter.');
  return el(
    'div',
    el(
      'div.position-grid',
      POSITIONS.map((position) =>
        el(
          'button.chip',
          {
            type: 'button',
            class: state.positions[position] === playerId ? 'is-active' : null,
            onclick: () => assign(app, playerId, position),
          },
          position,
        ),
      ),
    ),
    el('button.button.ghost.wide', { type: 'button', onclick: () => assign(app, playerId, 'bench') }, 'EH / substitute'),
  );
}

function saveDialog(app) {
  return el(
    'div',
    el(
      'label.stacked-field',
      'Lineup name',
      el('input', {
        type: 'text',
        value: state.name,
        maxlength: 120,
        oninput: (e) => {
          state.name = e.target.value;
        },
      }),
    ),
    el(
      'button.button.wide',
      {
        type: 'button',
        onclick: () => {
          const name = state.name.trim();
          if (!name) return;
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [name]: snapshot() }));
            state.saved = true;
            state.dirty = false;
          } catch {
            // Private browsing, or storage full — the link still shares it.
          }
          // The name is part of the link too, so a shared link carries it.
          writeUrl();
          close(app);
        },
      },
      'Save lineup',
    ),
    el('p.muted.note', 'Saved in this browser only. To send one to someone, use Copy link.'),
  );
}

function loadDialog(app) {
  const saved = readStore();
  const names = Object.keys(saved).sort();
  if (!names.length) return el('p.muted', 'No saved lineups yet.');

  return el(
    'div.pick-list',
    names.map((name) =>
      el(
        'button.pick',
        {
          type: 'button',
          onclick: () => {
            if (state.dirty && !confirm('Load this lineup and discard unsaved changes?')) return;
            const row = saved[name];
            state.order = row.o ?? [];
            state.positions = row.p ?? {};
            state.metrics = row.m ?? [...DEFAULT_METRICS];
            state.name = name;
            state.saved = true;
            state.dirty = false;
            state.dialog = null;
            writeUrl();
            app.render();
          },
        },
        name,
        el('span.pick-note', (saved[name].o ?? []).length + ' batters'),
      ),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Saving and sharing                                                         */
/* -------------------------------------------------------------------------- */

function snapshot() {
  return { o: state.order, p: state.positions, m: state.metrics, n: state.name };
}

/** `json` arrives already decoded: the router reads it with URLSearchParams. */
function restore(json) {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data.o)) state.order = data.o;
    if (data.p && typeof data.p === 'object') state.positions = data.p;
    if (Array.isArray(data.m) && data.m.length === 3 && data.m.every((k) => column(k))) state.metrics = data.m;
    if (typeof data.n === 'string' && data.n) state.name = data.n;
  } catch {
    // A mangled link just means we keep the lineup already in hand.
  }
}

function writeUrl() {
  lastLink = JSON.stringify(snapshot());
  history.replaceState(null, '', '#/lineup?s=' + encodeURIComponent(lastLink));
}

/** Keeps the URL in step with the lineup without adding history entries. */
function save(app) {
  state.dirty = true;
  writeUrl();
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

/* -------------------------------------------------------------------------- */
/* The field                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Everything about the field is measured from home plate, in the units of a
 * 600 x 500 drawing. The outline and the cards are both placed from these
 * numbers, so they cannot drift apart.
 *
 * The outline follows a real park: the outfield wall is an arc around home;
 * at each foul pole the edge runs back along the foul line, then drops
 * straight down the side, then angles in parallel to the foul line and wraps
 * round behind the plate. Foul ground is the strip between that edge and the
 * foul lines — narrow at the poles, a wide apron behind home.
 */
const VIEW = [600, 500];
const HOME = [300, 410];
const WALL = 400; // home to the outer edge of the warning track
const SIDE = 236; // home to each straight side wall
const APRON = 80; // foul ground beside the lines and behind the plate
const TRACK = 16; // warning track width
const BASE = 145; // home to first, and to third

/** Where each fielder's card sits. */
const STATIONS = {
  LF: [120, 175],
  LC: [215, 95],
  RC: [385, 95],
  RF: [480, 175],
  SS: [228, 245],
  '2B': [372, 245],
  '3B': [165, 315],
  '1B': [435, 315],
  P: [300, 335],
  C: [300, 452],
};

const r1 = (n) => Math.round(n * 10) / 10;
const pt = (x, y) => r1(x) + ' ' + r1(y);

/**
 * The park's outline, pulled in by `inset` all the way round. Inset 0 is the
 * outer edge of the warning track, inset TRACK the edge of the grass, and the
 * insets between that and APRON trace the mowing stripes in foul ground.
 */
function outline(inset) {
  const [hx, hy] = HOME;
  const wall = WALL - inset;
  const apron = APRON - inset;
  const side = SIDE - inset;
  const shift = inset / Math.SQRT2; // the foul-line edge moves toward fair
  const turn = apron / Math.SQRT2; // where the angled sides meet the apron
  const reach = Math.sqrt((wall * wall) / 2 - shift * shift); // out to the pole
  const top = hy - 2 * shift - side; // side wall leaves the foul line
  const knee = hy + 2 * turn - side; // side wall angles in toward home

  return [
    'M', pt(hx + shift - reach, hy - shift - reach),
    'L', pt(hx - side, top),
    'L', pt(hx - side, knee),
    'L', pt(hx - turn, hy + turn),
    'A', r1(apron), r1(apron), 0, 0, 0, pt(hx + turn, hy + turn),
    'L', pt(hx + side, knee),
    'L', pt(hx + side, top),
    'L', pt(hx - shift + reach, hy - shift - reach),
    'A', r1(wall), r1(wall), 0, 0, 0, pt(hx + shift - reach, hy - shift - reach),
    'Z',
  ].join(' ');
}

function buildField() {
  const [hx, hy] = HOME;
  const along = BASE / Math.SQRT2;
  const first = [hx + along, hy - along];
  const third = [hx - along, hy - along];
  const second = [hx, hy - 2 * along];
  const middle = [hx, hy - along];
  const pole = WALL / Math.SQRT2;

  // Fair ground is the wedge above the two foul lines; foul is everything else.
  const far = 500;
  const fair = `M${pt(hx, hy)} L${pt(hx - far, hy - far)} L${pt(hx + far, hy - far)} Z`;
  const foul = `M${pt(hx, hy)} L${pt(hx - far, hy - far)} L${pt(hx - far, hy + far)} L${pt(hx + far, hy + far)} L${pt(hx + far, hy - far)} Z`;

  // Infield dirt: from home out along both foul lines, closed by an arc that
  // runs behind second base.
  const dirtCentre = [hx, hy - 75];
  const dirtRadius = 167;
  const meet = (75 + Math.sqrt(75 * 75 + 2 * (dirtRadius * dirtRadius - 75 * 75))) / 2;
  const dirt = `M${pt(hx, hy)} L${pt(hx - meet, hy - meet)} A${dirtRadius} ${dirtRadius} 0 0 1 ${pt(hx + meet, hy - meet)} Z`;

  // Infield grass: a square inside the base paths, its corners eaten by the
  // dirt circles round each base.
  const g = 80;
  const grass = `M${pt(middle[0], middle[1] - g)} L${pt(middle[0] + g, middle[1])} L${pt(middle[0], middle[1] + g)} L${pt(middle[0] - g, middle[1])} Z`;

  const bag = ([x, y], r = 7) => `<path class="base" d="M${pt(x, y - r)} L${pt(x + r, y)} L${pt(x, y + r)} L${pt(x - r, y)} Z" />`;
  const cutout = ([x, y]) => `<circle class="dirt" cx="${r1(x)}" cy="${r1(y)}" r="34" />`;
  const stripes = [TRACK + 8, TRACK + 40]
    .map((inset) => `<path class="foul-stripe" d="${outline(inset)}" />`)
    .join('');

  return `
<svg viewBox="0 0 ${VIEW[0]} ${VIEW[1]}" aria-hidden="true">
  <defs>
    <pattern id="mowA" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect class="mow" width="24" height="48" />
    </pattern>
    <pattern id="mowB" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect class="mow" width="24" height="48" />
    </pattern>
    <clipPath id="grass-clip"><path d="${outline(TRACK)}" /></clipPath>
    <clipPath id="fair-clip"><path d="${fair}" /></clipPath>
    <clipPath id="foul-clip"><path d="${foul}" /></clipPath>
    <clipPath id="dirt-clip"><path d="${dirt}" /></clipPath>
  </defs>

  <path class="track" d="${outline(0)}" />
  <path class="turf" d="${outline(TRACK)}" />
  <g clip-path="url(#grass-clip)">
    <g clip-path="url(#fair-clip)">
      <path class="mow-a" d="${fair}" />
      <path class="mow-b" d="${fair}" />
    </g>
    <g clip-path="url(#foul-clip)">${stripes}</g>
  </g>

  <path class="dirt" d="${dirt}" />
  <path class="turf" d="${grass}" />
  <g clip-path="url(#dirt-clip)">${cutout(first)}${cutout(second)}${cutout(third)}</g>
  <circle class="dirt" cx="${hx}" cy="${hy}" r="30" />
  <circle class="dirt" cx="${hx}" cy="${r1(hy - 105)}" r="18" />
  <rect class="base" x="${hx - 5}" y="${r1(hy - 106.5)}" width="10" height="3" />

  <path class="chalk" d="M${pt(hx, hy)} L${pt(hx - pole, hy - pole)} M${pt(hx, hy)} L${pt(hx + pole, hy - pole)}" />
  <path class="chalk box" d="M${pt(hx - 20, hy - 9)} h9 v18 h-9 Z M${pt(hx + 11, hy - 9)} h9 v18 h-9 Z" />

  ${bag(first)}${bag(second)}${bag(third)}
  <path class="base" d="M${pt(hx - 5, hy - 5)} h10 v5 l-5 5 l-5 -5 Z" />
</svg>`;
}

const FIELD_SVG = buildField();
