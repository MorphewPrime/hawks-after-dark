/**
 * The admin proxy.
 *
 * The site is a static page on GitHub Pages, so it cannot commit to this repo
 * on its own. This tiny worker stands in for the one missing piece: it holds
 * a GitHub token (a secret, never served to the browser) and turns "write this
 * file" into a commit. The browser proves itself with a shared admin key; the
 * token itself only ever lives here.
 *
 * Bindings:
 *   REPO         "owner/repo" — where commits go        (var)
 *   BRANCH       the branch to commit to, default main (var)
 *   GITHUB_TOKEN fine-grained PAT, Contents read/write  (secret)
 *   ADMIN_KEY    the key the site sends as x-admin-key  (secret)
 *
 * Endpoints (JSON in, JSON out):
 *   GET  /file?path=data/games/x.csv   -> { content (base64), sha }
 *   PUT  /commit { path, content, message } -> { sha, htmlUrl }
 */

const API = 'https://api.github.com';
const MAX_BYTES = 1024 * 1024;

/** The only files the site may ever touch — everything else is refused. */
const ALLOWED = [/^data\/games\/[^/]+\.csv$/, /^data\/config\.json$/];

export default {
  async fetch(request, env) {
    const headers = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
      return json({ error: 'bad or missing admin key' }, 401, headers);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/file' && request.method === 'GET') return await file(url, env, headers);
      if (url.pathname === '/commit' && request.method === 'PUT') return await commit(request, env, headers);
      return json({ error: 'unknown route' }, 404, headers);
    } catch (err) {
      return json({ error: err.message }, 502, headers);
    }
  },
};

async function file(url, env, headers) {
  const path = url.searchParams.get('path') ?? '';
  checkPath(path);

  const res = await gh(env, 'GET', contentsPath(env, path));
  if (res.status === 404) throw new Error('no such file: ' + path);
  if (!res.ok) throw new Error('GitHub answered ' + res.status + ' for ' + path);

  const data = await res.json();
  return json({ content: data.content, sha: data.sha }, 200, headers);
}

async function commit(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new Error('the request body must be JSON');
  }
  const { path, content, message } = body ?? {};
  checkPath(path);
  if (typeof content !== 'string' || !content.length) throw new Error('content is required');
  if (Math.ceil((content.length * 3) / 4) > MAX_BYTES) throw new Error('the file is too large');
  if (typeof message !== 'string' || !message.trim()) throw new Error('a commit message is required');

  // Fetch the blob's current sha so an update can name it. GitHub answers 409
  // when the sha is stale — for instance the index workflow just committed —
  // so on a 409 we read the sha again and try once more.
  let sha = await currentSha(env, path);
  let res = await put(env, path, content, message, sha);
  if (res.status === 409) {
    sha = await currentSha(env, path);
    res = await put(env, path, content, message, sha);
  }
  if (!res.ok) throw new Error('GitHub refused the commit (' + res.status + ')');

  const data = await res.json();
  return json({ sha: data.content?.sha ?? data.sha, htmlUrl: data.content?.html_url ?? data.html_url }, 200, headers);
}

/* -------------------------------------------------------------------------- */

function checkPath(path) {
  if (typeof path !== 'string' || !ALLOWED.some((re) => re.test(path))) {
    throw new Error('that file is not something the site may change');
  }
}

function gh(env, method, path, body) {
  return fetch(API + path, {
    method,
    headers: {
      authorization: 'Bearer ' + env.GITHUB_TOKEN,
      accept: 'application/vnd.github+json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** A repo path for the contents API: each segment escaped, slashes kept. */
function contentsPath(env, path) {
  return '/repos/' + env.REPO + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + (env.BRANCH || 'main');
}

async function currentSha(env, path) {
  const res = await gh(env, 'GET', contentsPath(env, path));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub answered ' + res.status + ' looking up ' + path);
  return (await res.json()).sha;
}

async function put(env, path, content, message, sha) {
  return gh(env, 'PUT', contentsPath(env, path), { message, content, ...(sha ? { sha } : {}) });
}

/* -------------------------------------------------------------------------- */

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

/** The site may come from any Pages host, so the answer mirrors its origin. */
function cors(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-key',
    vary: 'origin',
  };
}
