# Hawks After Dark

Batting stats, box scores and a lineup builder for the team — as one static
page that reads its numbers out of the CSV files in this repo.

**To add a game, add a file.** Drop the GameChanger export into
[`data/games/`](data/games), name it with the date, and the leaderboard, the
game list, every player page and the lineup builder all pick it up.

There is no database, no server, no build step and no dependencies. GitHub
Pages serves the files exactly as they sit here.

---

## Hosting it on GitHub Pages

1. Push this repo to your own GitHub account.
2. **Settings → Pages → Build and deployment** → Source: **Deploy from a
   branch**, Branch: **main**, folder: **/ (root)**. Save.
3. **Settings → Actions → General → Workflow permissions** → **Read and write
   permissions**. Save.
   (That is what lets the workflow below update the game index for you.)

A minute later the site is live at
`https://<your-username>.github.io/<repo-name>/`.

---

## Adding a game

Export the game from GameChanger as CSV, rename it, and put it in
`data/games/`. You can do the whole thing in the browser on github.com —
**Add file → Upload files** — no git needed.

The filename carries everything the site cannot read out of the CSV:

```
2026-10-29_wednesday_Bumper_19-12.csv
└─ date     └─ league  └─ opponent └─ our runs–their runs
```

Parts are separated by `_`, and only the date has to come first. These all work:

| Filename | Means |
| --- | --- |
| `2026-10-29_wednesday_Bumper_19-12.csv` | the full thing |
| `2026-10-29_wed_Bumper_19-12.csv` | `wed` and `thu` are fine |
| `2026-10-29_wednesday_Bumper.csv` | score not in yet |
| `2026-10-29_wed_Pitch-Please_7-12.csv` | hyphens in the opponent become spaces |
| `2026-10-29_wed_Bumper_19-12_630pm.csv` | a start time, for doubleheaders |
| `2026-07-02_thu_Bumper_11-4_fall.csv` | force the season instead of guessing from the date |

The season is worked out from the month unless you say otherwise — see
`seasons` in [`data/config.json`](data/config.json).

### The game index

A static site cannot list a folder, so `data/games/index.json` records what is
in it. The **Index games** workflow rebuilds that file automatically on every
push, so normally you never touch it.

If you are working locally and want to do it yourself:

```bash
node tools/build-index.mjs
```

---

## Changing the team, leagues or seasons

[`data/config.json`](data/config.json) holds the team name, the leagues, the
season months, and a place to fix up names.

Leagues are not hard-coded anywhere — adding a third one is a config entry plus
CSVs named after it.

```json
{
  "leagues": [
    { "id": "wednesday", "label": "Wednesday", "short": "Wed", "aliases": ["wed"] }
  ]
}
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
  model.js              reads data/, parses filenames, aggregates by scope
  csv.js                CSV reader, and the GameChanger translation
  stats.js              batting maths; every column the site can show
  ui.js                 element helper, sortable table
  views/                one file per screen
data/
  config.json           team, leagues, seasons, name fixes
  games/*.csv           one file per game — the only thing you add
  games/index.json      generated; lists the CSVs above
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

The lineup builder keeps the batting order and the ten defensive spots as two
separate things, so reordering batters never disturbs the defense. A lineup
lives in the URL — share the link and the other person sees the same one.
Named lineups are saved in your own browser.
