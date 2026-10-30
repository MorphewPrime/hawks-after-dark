/**
 * Writes data/games/index.json from whatever CSV files are in data/games/.
 *
 * A static site cannot list a directory, so it needs this one small file to
 * know what is there. The GitHub Action in .github/workflows/ runs this on
 * every push, so adding a game is only ever "add the CSV". Run it by hand with:
 *
 *   node tools/build-index.mjs
 *
 * Exits non-zero if a filename has no date in it, which is the one thing the
 * site cannot work out on its own.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gamesDir = join(root, 'data', 'games');
const indexFile = join(gamesDir, 'index.json');

const DATE = /\d{4}-\d{2}-\d{2}/;

const files = (await readdir(gamesDir))
  .filter((name) => name.toLowerCase().endsWith('.csv'))
  .sort()
  .reverse();

const undated = files.filter((name) => !DATE.test(name));

const index = {
  generated: new Date().toISOString(),
  count: files.length,
  games: files,
};

const next = JSON.stringify(index, null, 2) + '\n';
const previous = await readFile(indexFile, 'utf8').catch(() => null);

// Compare everything but the timestamp, so an unchanged folder makes no commit.
const sameGames =
  previous && JSON.stringify(JSON.parse(previous).games) === JSON.stringify(files);

if (sameGames) {
  console.log(`index.json already lists all ${files.length} game(s)`);
} else {
  await writeFile(indexFile, next);
  console.log(`index.json now lists ${files.length} game(s)`);
}

if (undated.length) {
  console.error('\nThese files have no YYYY-MM-DD date and will be skipped by the site:');
  for (const name of undated) console.error('  ' + name);
  console.error('\nRename them like 2026-10-29_wednesday_Bumper_19-12.csv');
  process.exit(1);
}
