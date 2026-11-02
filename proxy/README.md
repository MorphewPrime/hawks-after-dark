# The admin proxy

The site is static, so it cannot commit to this repo by itself. This worker is
the one missing piece: it holds a GitHub token — a secret that never ships to
the browser — and turns the admin screen's "save this file" into a commit.

It does two things, nothing else:

| Endpoint | What it does |
| --- | --- |
| `GET /file?path=data/games/x.csv` | reads one file, returns its base64 content and blob sha |
| `PUT /commit` `{ path, content, message }` | creates or updates one file, commits it |

Only `data/games/*.csv` and `data/config.json` may be touched — any other path
is refused — and every request must carry the admin key in the `x-admin-key`
header.

## Setting it up

1. **Make a token.** GitHub → **Settings → Developer settings → Fine-grained
   personal access tokens → Generate new token**. Give it access to *this repo
   only*, with one permission: **Contents → Read and write**. Copy it.
2. **Deploy the worker.** From this folder, with [wrangler](https://developers.cloudflare.com/workers/wrangler/)
   installed:
   ```bash
   npm i -g wrangler
   wrangler login
   wrangler deploy
   ```
   It comes up at `https://hawks-admin.<your-subdomain>.workers.dev`.
3. **Hand it its secrets.**
   ```bash
   wrangler secret put GITHUB_TOKEN
   wrangler secret put ADMIN_KEY
   ```
   `ADMIN_KEY` is any long random string (`node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`).
    If the repo is not `morphewprime/hawks-after-dark`, change `REPO` in
   [`wrangler.jsonc`](wrangler.jsonc) and redeploy.
4. **Point the site at it.** Add this to [`data/config.json`](../data/config.json)
   and commit:
   ```json
   "admin": { "base": "https://hawks-admin.<your-subdomain>.workers.dev", "key": "<ADMIN_KEY>" }
   ```
   Without that entry the admin screen reports that no proxy is configured, and
   nothing else in the site changes.

## Trust model

The admin key sits in the page's JavaScript, so a determined visitor can read
it and use the proxy. That is the price of a static site with no login: the
key is a speed bump, not a wall. What it does mean is that the *token* — the
thing that could rewrite the repo — never leaves the worker, and the worker
only writes game CSVs and the config file, on `main`.
