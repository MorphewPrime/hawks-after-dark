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

const ROUTES = [
  { pattern: /^\/?$/, view: leaderboard, nav: 'leaderboard' },
  { pattern: /^\/games\/(.+)$/, view: boxscore, keys: ['id'], nav: 'games' },
  { pattern: /^\/games\/?$/, view: games, nav: 'games' },
  { pattern: /^\/players\/(.+)$/, view: player, keys: ['id'], nav: 'leaderboard' },
  { pattern: /^\/lineup\/?$/, view: lineup, nav: 'lineup' },
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

function render() {
  const { route, params } = currentRoute();
  const view = document.getElementById('view');

  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === route.nav);
  });

  try {
    mount(view, route.view.render(app, params));
  } catch (err) {
    console.error(err);
    mount(view, problem('Something went wrong drawing this page', err.message));
  }
  document.title = route.view.title + ' · ' + app.season.config.team;
  window.scrollTo({ top: 0 });
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
      el(
        'a.brand',
        { href: '#/' },
        el('img', { src: 'assets/logo.png', alt: '', onerror: (e) => e.target.remove() }),
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
