/**
 * The client for the admin proxy (see proxy/).
 *
 * The site is static, so nothing here talks to GitHub directly: the proxy is a
 * tiny worker that holds the token and commits on our behalf. It is only used
 * when `data/config.json` points at one — without that entry the admin screen
 * stays out of the way and the rest of the site never notices.
 */

/** True when config.json points the site at an admin proxy. */
export function adminReady(app) {
  const admin = app.season?.config?.admin;
  return !!(admin && admin.base && admin.key);
}

/** The proxy base URL, trimmed of any trailing slash. */
export function adminBase(app) {
  return app.season.config.admin.base.replace(/\/+$/, '');
}

/** One request to the proxy. Throws an Error with a readable message. */
async function adminRequest(app, path, init = {}) {
  let res;
  try {
    res = await fetch(adminBase(app) + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-admin-key': app.season.config.admin.key,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('the admin proxy could not be reached');
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON answer is still a failure with a status code.
  }
  if (!res.ok) throw new Error((body && body.error) || 'the proxy answered ' + res.status);
  return body;
}

/** UTF-8 to base64, in chunks so large files never overflow the stack. */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** The inverse of toBase64. */
export function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Commits `content` to `path` (a repo-relative file) on the proxy.
 * Resolves with GitHub's answer, which carries the blob's new sha and url.
 */
export function adminCommit(app, { path, content, message }) {
  return adminRequest(app, '/commit', {
    method: 'PUT',
    body: JSON.stringify({ path, content: toBase64(content), message }),
  });
}

/** Reads one repo file through the proxy. Resolves `{ content, sha }`. */
export function adminRead(app, path) {
  return adminRequest(app, '/file?path=' + encodeURIComponent(path));
}
