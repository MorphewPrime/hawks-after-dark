/**
 * The admin screen: upload game files, and edit a game's CSV in place.
 *
 * Writes never go to GitHub from the page — they go to the proxy in proxy/,
 * which holds the token and commits on our behalf. The screen only exists
 * when data/config.json points at a proxy; otherwise it says so and nothing
 * else in the site changes.
 */

import { el, empty } from '../ui.js';
import { parseCsv, parseGameChanger, writeCsv } from '../csv.js';
import { adminReady, adminCommit } from '../admin-api.js';
import { gameWhen, leagueBadge } from './common.js';

export const title = 'Admin';

/** Uploads waiting to commit, and the one open CSV editor. */
const state = { files: [], uploadStatus: null, editor: null };

export function render(app, params) {
  if (!adminReady(app)) {
    return el(
      'section',
      empty(
        'No proxy configured',
        'The admin screen needs a proxy to commit through. Deploy the one in proxy/ and add an "admin" entry to data/config.json.',
      ),
    );
  }

  if (params.game) {
    const game = app.season.games.find((g) => g.id === params.game);
    if (!game) {
      return el('section', empty('Game not found', 'It may have been renamed.'));
    }
    if (!state.editor || state.editor.gameId !== game.id) {
      openEditor(app, game);
      return el('section', el('p', 'Loading ', el('code', game.file), '…'));
    }
    return editorView(app, game);
  }
  return home(app);
}

/* -------------------------------------------------------------------------- */
/* Uploading files                                                            */
/* -------------------------------------------------------------------------- */

function home(app) {
  const ready = state.files.filter((f) => f.text && !f.error && f.result !== 'ok');
  return el(
    'section',
    el('header.page-head', el('h1', 'Admin'), el('p.subtitle', 'Upload game files and edit the CSVs behind each game.')),
    state.uploadStatus && note(state.uploadStatus),
    el(
      'div.card',
      el('h2', 'Add a game'),
      el(
        'p.file-note',
        'Pick a GameChanger export — it is checked here before anything is committed, and the filename carries the date, league and score just like an upload to GitHub.',
      ),
      el('input.admin-file', {
        type: 'file',
        accept: '.csv',
        multiple: true,
        onchange: (e) => onFiles(app, e.target.files),
      }),
      state.files.length &&
        el(
          'div.upload-list',
          state.files.map((f, i) =>
            el(
              'div.upload-row',
              el('code.upload-name', f.name),
              f.error
                ? el('span.upload-bad', f.error)
                : el('span.upload-ok', f.players + ' players'),
              f.result === 'ok' && el('span.upload-ok', 'committed'),
              f.result && f.result !== 'ok' && el('span.upload-bad', f.result),
              el(
                'button.link-button.upload-remove',
                { type: 'button', 'aria-label': 'Remove from list', onclick: () => { state.files.splice(i, 1); app.render(); } },
                '×',
              ),
            ),
          ),
        ),
      el(
        'div.controls',
        el(
          'button.button',
          { type: 'button', disabled: !ready.length, onclick: () => commitFiles(app) },
          ready.length ? 'Commit ' + ready.length + (ready.length === 1 ? ' file' : ' files') : 'Commit',
        ),
      ),
    ),
    el(
      'div.card',
      el('h2', 'Edit a game'),
      el('p.file-note', 'Every file in the repo, with a straight line to its CSV.'),
      el(
        'div.upload-list',
        app.season.games.map((g) =>
          el(
            'div.upload-row',
            el('span.upload-name', gameWhen(g) + ' · vs ' + (g.opponent ?? 'Unknown')),
            leagueBadge(app, g.league),
            el('a.link-button', { href: '#/admin?game=' + encodeURIComponent(g.id) }, 'Edit CSV'),
          ),
        ),
      ),
    ),
  );
}

async function onFiles(app, list) {
  for (const file of [...list]) {
    let text;
    try {
      text = await file.text();
    } catch {
      state.files.push({ name: file.name, error: 'could not be read' });
      continue;
    }
    try {
      const parsed = parseGameChanger(text);
      state.files.push({ name: file.name, text, players: parsed.lines.length });
    } catch (err) {
      state.files.push({ name: file.name, text: null, error: err.message });
    }
  }
  app.render();
}

async function commitFiles(app) {
  const pending = state.files.filter((f) => f.text && !f.error && f.result !== 'ok');
  if (!pending.length) return;
  state.uploadStatus = null;
  for (const f of pending) {
    try {
      await adminCommit(app, { path: 'data/games/' + f.name, content: f.text, message: 'Add game ' + f.name });
      f.result = 'ok';
    } catch (err) {
      f.result = err.message;
    }
  }
  const failed = pending.filter((f) => f.result !== 'ok');
  state.uploadStatus = failed.length
    ? { ok: false, text: failed.length + ' file' + (failed.length === 1 ? '' : 's') + ' could not be committed — see the list above.' }
    : {
        ok: true,
        text:
          'Committed. The index workflow picks the new game(s) up in about a minute; reload the site to see them.',
      };
  app.render();
}

/* -------------------------------------------------------------------------- */
/* Editing one game's CSV                                                     */
/* -------------------------------------------------------------------------- */

/** Reads the game's CSV from the site itself and splits it for editing. */
async function openEditor(app, game) {
  state.editor = { gameId: game.id, file: game.file };
  try {
    const res = await fetch('data/games/' + encodeURIComponent(game.file), { cache: 'no-cache' });
    if (!res.ok) throw new Error(game.file + ' could not be loaded (' + res.status + ')');
    const rows = parseCsv(await res.text());
    const headerIndex = rows.findIndex((r) => r.some((c) => c.trim().toUpperCase() === 'AB'));
    if (headerIndex < 0) throw new Error("no 'AB' column found in " + game.file);

    // Banner rows above the header (a full GameChanger export has two of them)
    // are kept exactly as they are and never shown for editing.
    Object.assign(state.editor, {
      banner: rows.slice(0, headerIndex),
      header: rows[headerIndex],
      data: rows.slice(headerIndex + 1).map((r) => [...r]),
      original: rows.slice(headerIndex + 1).map((r) => [...r]),
      saving: false,
      status: null,
    });
  } catch (err) {
    state.editor.error = err.message;
  }
  app.render();
}

function editorView(app, game) {
  const ed = state.editor;
  if (ed.error) {
    return el(
      'section',
      el('a.back', { href: '#/admin' }, '← Admin'),
      note({ ok: false, text: ed.error }),
    );
  }

  const dirty = isDirty(ed);
  return el(
    'section',
    el('a.back', { href: '#/admin' }, '← Admin'),
    el(
      'header.page-head',
      el('h1', 'Edit vs ', game.opponent ?? game.file),
      el('p.subtitle', 'Saving commits ', el('code', 'data/games/' + ed.file), ' — the numbers below update the moment it lands.'),
    ),
    ed.status && note(ed.status),
    el(
      'div.table-wrap',
      el(
        'table.stats.admin-table',
        el(
          'thead',
          el(
            'tr',
            ed.header.map((h, i) => el('th', { class: i === 0 ? 'sticky' : 'num' }, h)),
            el('th.admin-rowcol', ''),
          ),
        ),
        el(
          'tbody',
          ed.data.map((row, r) =>
            el(
              'tr',
              row.map((cell, c) =>
                el(
                  'td',
                  { class: c === 0 ? 'sticky' : 'num' },
                  el('input.cell-input', {
                    value: cell,
                    oninput: (e) => {
                      ed.data[r][c] = e.target.value;
                      refreshSaveButton(ed);
                    },
                  }),
                ),
              ),
              el(
                'td.admin-rowcol',
                el(
                  'button.link-button',
                  {
                    type: 'button',
                    'aria-label': 'Remove row',
                    onclick: () => {
                      ed.data.splice(r, 1);
                      app.render();
                    },
                  },
                  '×',
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    el(
      'div.admin-actions',
      el(
        'button.button.ghost',
        {
          type: 'button',
          onclick: () => {
            ed.data.push(Array(ed.header.length).fill(''));
            app.render();
          },
        },
        'Add row',
      ),
      el(
        'button.button',
        {
          id: 'admin-save',
          type: 'button',
          disabled: ed.saving || !dirty,
          onclick: () => saveEditor(app, game),
        },
        ed.saving ? 'Saving…' : 'Save changes',
      ),
    ),
  );
}

/** Typing must not re-render — the input would lose its focus mid-keystroke. */
function refreshSaveButton(ed) {
  const btn = document.getElementById('admin-save');
  if (btn) btn.disabled = ed.saving || !isDirty(ed);
}

function isDirty(ed) {
  if (ed.data.length !== ed.original.length) return true;
  for (let r = 0; r < ed.data.length; r++) {
    const a = ed.data[r];
    const b = ed.original[r];
    if (a.length !== b.length) return true;
    for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) return true;
  }
  return false;
}

async function saveEditor(app, game) {
  const ed = state.editor;
  if (ed.saving) return;
  ed.saving = true;
  ed.status = null;
  app.render();

  try {
    const text = writeCsv([...ed.banner, ed.header, ...ed.data]);
    await adminCommit(app, { path: 'data/games/' + ed.file, content: text, message: 'Update ' + ed.file });
    applyToSeason(app, game, text);
    ed.original = ed.data.map((r) => [...r]);
    ed.status = { ok: true, text: 'Saved — the box score now shows the new numbers.' };
  } catch (err) {
    ed.status = { ok: false, text: err.message };
  }

  ed.saving = false;
  app.render();
}

/**
 * Puts the new CSV into the season already in memory, so the box score and
 * the leaderboards reflect the edit without a reload. The in-repo file is the
 * truth; this just keeps the page honest until the next load.
 */
function applyToSeason(app, game, text) {
  const parsed = parseGameChanger(text);
  const aliases = app.season.config.playerAliases ?? {};
  const byName = new Map(app.season.players.map((p) => [p.name, p]));

  app.season.stats = app.season.stats.filter((s) => s.gameId !== game.id);
  for (const line of parsed.lines) {
    const canonical = aliases[line.name] ?? line.name;
    const player = byName.get(canonical);
    if (!player) continue; // a new name joins the roster on the next load
    if (line.jersey && game.date && (!player.lastSeen || game.date >= player.lastSeen)) {
      player.jersey = line.jersey;
      player.lastSeen = game.date;
    }
    app.season.stats.push({ playerId: player.id, gameId: game.id, ...line.stats });
  }
}

function note(status) {
  return el('div.notice' + (status.ok ? '' : ' notice-bad'), status.text);
}
