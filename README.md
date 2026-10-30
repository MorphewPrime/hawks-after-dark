# Hawks After Dark

Batting stats, box scores and a lineup builder for the team — as one static
page that reads its numbers out of the CSV files in this repo.

**To add a game, add a file.** Drop the GameChanger export into
[`data/games/`](data/games) — whatever it is called — and the leaderboard, the
game list, every player page and the lineup builder all pick it up.

There is no database, no server, no build step and no dependencies. GitHub
Pages serves the files exactly as they sit here.

---

## Hosting it on GitHub Pages

1. Get this repo onto your own GitHub account: fork it, or clone it and push it
   to a new repo.
2. **Settings → Pages → Build and deployment** → Source: **Deploy from a
   branch**, Branch: **main**, folder: **/ (root)**. Save.
3. **Settings → Actions → General → Workflow permissions** → **Read and write
   permissions**. Save. This is what lets the workflow below keep the game
   index up to date for you.
4. If you **forked** it, open the **Actions** tab once and enable workflows —
   GitHub switches them off on forks until you do.

A minute later the site is live at
`https://<your-username>.github.io/<repo-name>/`.

---

## Adding a game

Export the game from GameChanger as CSV and put it in `data/games/`. You can do
the whole thing in the browser on github.com — **Add file → Upload files** — no
git needed.

The file can keep whatever name it downloaded with. Everything else is worked
out:

| | Where it comes from |
| --- | --- |
| Players, jerseys, every stat | the CSV itself |
| Runs we scored | the CSV's **Totals** row |
| Opponent | the filename — `Bumper.csv` is a game against Bumper |
| Date | a date in the filename, or else the day the file was uploaded |
| Season | the date's month (see `seasons` in [`data/config.json`](data/config.json)) |
| League | the night the date falls on, or the season if it only has one league |

When a date is the upload day rather than game night, the site says so next to
it ("upload date").

The one thing a GameChanger export never contains is **the other team's
score**, so a game only gets a W or L if the filename has the final. If you
want any of the details exact, put them in the name — in any order, separated
by spaces, `_` or `-`:

| Filename | Means |
| --- | --- |
| `Bumper.csv` | just the opponent; everything else is worked out |
| `2026-10-29 Bumper 19-12.csv` | date and final score |
| `10-29-2026_wed_Bumper_19-12.csv` | US-style dates, and the league |
| `2026-10-29 Pitch-Please 7-12 6.30pm.csv` | a start time, for doubleheaders |
| `2026-06-03 Bumper 11-4 spring.csv` | force the season instead of using the month |

Scores are always **ours first**. A leading "vs" or "at", and the " (1)" a
browser adds to a repeat download, are ignored. A file that is not a batting
export is skipped with a note at the top of the site, and everything else
keeps working.

### The game index

A static site cannot list a folder, so `data/games/index.json` records what is
in it, and the day each file was added. The **Index games** workflow rebuilds
that file automatically on every push, so normally you never touch it.

If you are working locally and want to do it yourself:

```bash
node tools/build-index.mjs
```

---

## Changing the team, leagues or seasons

[`data/config.json`](data/config.json) holds the team name, the leagues, the
seasons, and a place to fix up names. Nothing about the leagues is hard-coded,
so adding a third one is a config entry.

Each season lists its months and which leagues play in it. The season and
league filters use that: picking Spring greys out Thursday, because Spring is
Wednesday only.

```json
{ "id": "spring", "label": "Spring", "months": [3, 4, 5], "leagues": ["wednesday"] }
```

If GameChanger spells someone two different ways, map one onto the other so
their stats stay together:

```json
"playerAliases": { "Dan O'Connell": "Danny O’Connell" }
```

---

## Running it locally

ES modules do not work over `file://`, so the page needs a server — any server.
There is a tiny one here with no dependencies:

```bash
npm start
```

Then open <http://localhost:4173>. `python -m http.server` works just as well.

---

## What is where

```
index.html              the page
assets/app.css          all of the styling; the colour tokens are at the top
js/
  main.js               boot, the hash router, the page shell
  model.js              reads data/, reads filenames, fills gaps, filters
  csv.js                CSV reader, and the GameChanger translation
  stats.js              batting maths; every column the site can show
  ui.js                 element helper, sortable table, filter buttons
  views/                one file per screen; lineup.js also draws the field
data/
  config.json           team, leagues, seasons, name fixes
  games/*.csv           one file per game — the only thing you add
  games/index.json      generated; lists the CSVs and when each was added
tools/
  build-index.mjs       rebuilds that index
  serve.mjs             local preview server
```

### How the numbers work

Rate stats are always derived from counting totals and never stored, so a
player's season line, their league split and the team total all add up from the
same place. `js/stats.js` is the only file that does any arithmetic.

- `OBP = (H + BB) / (AB + BB + SF)`
- `SLG = TB / AB`, `OPS = OBP + SLG`
- `Outs = (AB − H) + SF`, derived rather than tracked
- `sWAR` is the team's own metric, carried over as-is from the old site:
  `PA = AB + BB`, then `sWAR = PA × (OPS × OBP + 16.8 − 1.2 + (OPS − 1.4) / 0.3) × 0.1`

### The lineup builder

Pick the game day roster, set the batting order (drag the handle, or use the
arrows), and tap a spot on the field to fill it. The batting order and the ten
defensive spots are separate, so reordering batters never moves anyone on the
field; anyone batting without a spot is listed as an EH. The season and league
filters change the stats shown beside each batter, never who is in the lineup.

A lineup lives in the URL, so sharing the link shares the lineup. **Save
lineup** keeps named copies in your own browser, and **Print / save as PDF**
gives a lineup card.
