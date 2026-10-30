/**
 * Writes data/games/index.json from whatever CSV files are in data/games/.
 *
 * A static site cannot list a directory, so it needs this one small file to
 * know what is there. It also records, per game, the day the CSV was added to
 * the repo — which is what the site falls back to when the filename does not
 * say when the game was played. That is the whole reason a game can be called
 * anything at all.
 *
 * The GitHub Action runs this on every push, so adding a game is only ever
 * "add the CSV". By hand:
 *
 *   node tools/build-index.mjs
 */

import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'data', 'games');
const indexFile = join(gamesDir, 'index.json');

/**
 * The day this file first appeared in the repo, as YYYY-MM-DD.
 *
 * Needs full history: with the shallow clone CI does by default there is no
 * commit to find, so the workflow checks out with fetch-depth 0. Falls back to
 * the file's own timestamp, which is right for a file not yet committed.
 */
async function addedOn(name) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--follow', '--format=%ad', '--date=short', '-1', '--', join('data', 'games', name)],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (out) return out.split('\n').pop();
  } catch {
    // No git, or the file is not committed yet.
  }
  const info = await stat(join(gamesDir, name));
  return info.mtime.toISOString().slice(0, 10);
}

const files = (await readdir(gamesDir))
  .filter((name) => name.toLowerCase().endsWith('.csv'))
  .sort()
  .reverse();

const games = [];
for (const file of files) {
  games.push({ file, added: await addedOn(file) });
}

// Newest first, by whatever date the filename gives, else the day it landed.
const dateOf = (g) => (g.file.match(/\d{4}-\d{2}-\d{2}/) ?? [g.added])[0];
games.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));

// Compare the game list only, so an unchanged folder does not make a commit
// just to bump the timestamp. An index that will not parse is rewritten.
let unchanged = false;
try {
  const previous = JSON.parse(await readFile(indexFile, 'utf8'));
  unchanged = JSON.stringify(previous.games) === JSON.stringify(games);
} catch {
  unchanged = false;
}

if (unchanged) {
  console.log(`index.json already lists all ${games.length} game(s)`);
} else {
  const index = { generated: new Date().toISOString(), count: games.length, games };
  await writeFile(indexFile, JSON.stringify(index, null, 2) + '\n');
  console.log(`index.json now lists ${games.length} game(s)`);
  for (const g of games) console.log(`  ${g.file}  (added ${g.added})`);
}
