/**
 * Boot, routing and the page shell.
 *
 * The site is one page. Views are swapped into #view by a hash router, so every
 * link is shareable and GitHub Pages never has to be told about routes.
 */

import { ALL, loadSeason } from './model.js';
import { el, mount } from './ui.js';
import * as leaderboard from './views/leaderboard.js';
import * as games from './views/games.js';
import * as boxscore from './views/boxscore.js';
import * as player from './views/player.js';
import * as lineup from './views/lineup.js';
import * as admin from './views/admin.js';

const ROUTES = [
  { pattern: /^\/?$/, view: leaderboard, nav: 'leaderboard' },
  { pattern: /^\/games\/(.+)$/, view: boxscore, keys: ['id'], nav: 'games' },
  { pattern: /^\/games\/?$/, view: games, nav: 'games' },
  { pattern: /^\/players\/(.+)$/, view: player, keys: ['id'], nav: 'leaderboard' },
  { pattern: /^\/lineup\/?$/, view: lineup, nav: 'lineup' },
  // No nav item: the admin screen is a direct link (#/admin) only.
  { pattern: /^\/admin\/?$/, view: admin },
];

const NAV = [
  { id: 'leaderboard', href: '#/', label: 'Leaderboard' },
  { id: 'games', href: '#/games', label: 'Games' },
  { id: 'lineup', href: '#/lineup', label: 'Lineup' },
];

const app = {
  season: null,
  scope: { league: ALL, season: ALL },
  repoUrl: repoUrl(),
  render,
};

/** Splits "#/games/abc?x=1" into a path and its query parameters. */
function currentRoute() {
  const raw = location.hash.replace(/^#/, '');
  const [path, query] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query ?? ''));

  for (const route of ROUTES) {
    const match = (path || '/').match(route.pattern);
    if (!match) continue;
    (route.keys ?? []).forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    return { route, params };
  }
  return { route: ROUTES[0], params };
}

/** github.io hosts tell us the repo, so the site can link back to its data. */
function repoUrl() {
  const host = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return host && repo ? 'https://github.com/' + host[1] + '/' + repo : null;
}

/** The page last drawn, so a re-render of the same page keeps its scroll. */
let lastPath = null;

/**
 * The scroll offsets of every scrollable area inside a view: the roster
 * dialog's list, the position pickers and the wide stat tables all scroll on
 * their own, and a re-render replaces their nodes, so their offsets would
 * otherwise snap back to the top on every change.
 */
function captureScrolls(root) {
  const out = [];
  root.querySelectorAll('*').forEach((node) => {
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      out.push({
        key: node.tagName.toLowerCase() + '.' + [...node.classList].join('.'),
        x: node.scrollLeft,
        y: node.scrollTop,
      });
    }
  });
  return out;
}

/** Puts captured offsets back on the same scrollable areas of a new view. */
function restoreScrolls(root, saved) {
  const pools = new Map();
  root.querySelectorAll('*').forEach((node) => {
    if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) {
      const key = node.tagName.toLowerCase() + '.' + [...node.classList].join('.');
      const list = pools.get(key) ?? [];
      list.push(node);
      pools.set(key, list);
    }
  });
  const used = new Map();
  for (const entry of saved) {
    const list = pools.get(entry.key) ?? [];
    const i = used.get(entry.key) ?? 0;
    used.set(entry.key, i + 1);
    const node = list[i];
    if (node) {
      node.scrollLeft = entry.x;
      node.scrollTop = entry.y;
    }
  }
}

/**
 * Draws the current page. Views call this after every change, rebuilding
 * their whole DOM, so three things are carried across when the page is the
 * same as last time:
 *   - focus and caret, for any input marked `data-keep`, so typing into a
 *     search box or the Min AB field is not cut off after one keystroke
 *   - the scroll of any inner scrollable area, so ticking a box in the
 *     roster dialog does not drag the list back to the top
 *   - the window scroll, which is reset only when the page itself changed
 */
function render() {
  const { route, params } = currentRoute();
  const view = document.getElementById('view');
  const path = location.hash.split('?')[0];
  const samePage = path === lastPath;

  const active = document.activeElement;
  const keep = active?.dataset?.keep;
  let caret = null;
  try {
    caret = active?.selectionStart ?? null;
  } catch {
    // Number inputs refuse to report a caret.
  }

  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === route.nav);
  });

  const scrolls = samePage ? captureScrolls(view) : null;

  try {
    mount(view, route.view.render(app, params));
  } catch (err) {
    console.error(err);
    mount(view, problem('Something went wrong drawing this page', err.message));
  }
  document.title = route.view.title + ' · ' + app.season.config.team;

  if (keep) {
    const again = view.querySelector(`[data-keep="${keep}"]`);
    again?.focus();
    try {
      if (caret !== null) again?.setSelectionRange(caret, caret);
    } catch {
      // As above: not every input has a caret.
    }
  }

  // Last, so a focus that nudges a scrollable area into view cannot undo it.
  if (scrolls) restoreScrolls(view, scrolls);

  if (path !== lastPath) window.scrollTo({ top: 0 });
  lastPath = path;
}

function problem(title, message) {
  return el('div.notice.notice-bad', el('strong', title), message && el('p', message));
}

/** One line per file we could not read, so a bad export is obvious but harmless. */
function problemsBanner(problems) {
  if (!problems.length) return null;
  return el(
    'div.notice.notice-warn',
    el('strong', problems.length === 1 ? '1 file was skipped' : problems.length + ' files were skipped'),
    el('ul', problems.map((p) => el('li', el('code', p.file), ' — ' + p.message))),
  );
}

function shell(season) {
  const header = document.querySelector('.site-head');
  mount(
    header,
    el(
      'div.wrap.head-inner',
      // The logo is the team's name set in type, so it replaces the wordmark
      // when it loads and the wordmark stands in when there is no logo file.
      el(
        'a.brand',
        { href: '#/' },
        el('img', {
          src: 'assets/logo.png',
          alt: season.config.team,
          onload: (e) => e.target.closest('.brand').classList.add('has-logo'),
          onerror: (e) => e.target.remove(),
        }),
        el('span.brand-text', season.config.team),
      ),
      el(
        'nav.nav',
        NAV.map((item) => el('a', { href: item.href, dataset: { nav: item.id } }, item.label)),
      ),
    ),
  );

  const banner = document.getElementById('banner');
  mount(banner, problemsBanner(season.problems));
}

async function start() {
  const view = document.getElementById('view');
  try {
    app.season = await loadSeason();
  } catch (err) {
    console.error(err);
    mount(
      view,
      problem(
        'The season data could not be loaded',
        err.message + '. Check that data/config.json and data/games/index.json are both present.',
      ),
    );
    return;
  }

  shell(app.season);
  addEventListener('hashchange', render);
  render();
}

start();
