// A Ravian addon server: the template. Protocol: docs/protocol.md. Steps: docs/guide.md.
// Change MANIFEST and the functions under "Your source". The part under "The protocol" follows the spec: change it only
// when the spec changes. Node 18 or newer, no dependencies.
import http from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// The address that the phone uses, with no "/" at the end. Stream links start with it.
const PUBLIC = (process.env.PUBLIC_BASE || 'http://127.0.0.1:7090').replace(/\/$/, '');
// The key for the stream links. Set SECRET in production: with a random key, all links stop at each restart.
const SECRET = process.env.SECRET || randomBytes(32).toString('hex');

// ---- Your source ----

const MANIFEST = {
  id: 'org.example.template',
  version: '1.0.0',
  name: 'Template',
  description: 'Two Chopin recordings from Musopen (CC0). Replace them with your source.',
  ravian: 1,
  resources: ['catalog', 'meta', 'stream'],
  types: ['track', 'album'],
  catalogs: [
    { type: 'album', id: 'all', name: 'Albums', extra: [{ name: 'skip' }] },
    { type: 'track', id: 'search', name: 'Search', extra: [{ name: 'search', isRequired: true }] },
  ],
  idPrefixes: ['tpl-'],
  // The settings page at /configure (spec section 3). Remove this line and the page if your addon has no settings.
  configurable: true,
};

// The settings that the configure page can change, with their values when the link has none.
const DEFAULTS = { limit: 20 };

const ALBUM = { id: 'tpl-chopin', type: 'album', name: 'Chopin: Two Pieces', artist: 'Frédéric Chopin' };
const TRACKS = [
  { id: 'tpl-ballade-1', name: 'Ballade No. 1, Op. 23', duration: 613, file: 'Ballade no. 1 - Op. 23.mp3' },
  { id: 'tpl-fantaisie', name: 'Fantaisie-Impromptu, Op. 66', duration: 326, file: 'Fantasie Impromptu Op. 66.mp3' },
];
const meta = ({ file, ...t }, i) => ({ ...t, type: 'track', artist: ALBUM.artist, album: ALBUM.name, trackNumber: i + 1 });

/** The items of one catalog, or null when the manifest has no such catalog. [extra] has search and skip. */
async function catalog(type, id, extra, settings) {
  if (type === 'album' && id === 'all') return [ALBUM].slice(Number(extra.skip) || 0);
  if (type === 'track' && id === 'search') {
    const q = (extra.search || '').toLowerCase();
    return TRACKS.map(meta).filter((t) => t.name.toLowerCase().includes(q)).slice(0, settings.limit);
  }
  return null;
}

/** One item with its details, or null. An album or a playlist has its tracks in play order. */
async function details(type, id) {
  if (type === 'album' && id === ALBUM.id) return { ...ALBUM, tracks: TRACKS.map(meta) };
  const i = TRACKS.findIndex((t) => t.id === id);
  return type === 'track' && i >= 0 ? meta(TRACKS[i], i) : null;
}

/** The audio address of a track, or null. Only the signed /audio link gives it to the phone (see streams below). */
async function audioUrl(id) {
  const t = TRACKS.find((x) => x.id === id);
  return t ? `https://archive.org/download/musopen-chopin/${encodeURIComponent(t.file)}` : null;
}

// ---- The protocol ----

const mac = (text) => createHmac('sha256', SECRET).update(text).digest('hex').slice(0, 32);

/** A link that works for 24 hours. Without it, one shared link plays your source with no app and no limit. */
function sign(path) {
  const unsigned = `${path}e=${Math.floor(Date.now() / 1000) + 24 * 3600}`;
  return `${unsigned}&s=${mac(unsigned)}`;
}

function signed(path) {
  const m = /^(.*[?&]e=(\d+))&s=([0-9a-f]{32})$/.exec(path);
  return !!m && Number(m[2]) * 1000 > Date.now() && timingSafeEqual(Buffer.from(mac(m[1])), Buffer.from(m[3]));
}

/** The streams of a track: a signed link to this server, which sends the phone on to the audio. */
async function streams(id, token) {
  if (!(await audioUrl(id))) return null;
  return [{ url: PUBLIC + sign(`/audio/${encodeURIComponent(id)}?t=${token || ''}&`), mime: 'audio/mpeg' }];
}

// Requests per minute for each user: the install token, or the address without one. Above it: 429.
const PER_MINUTE = 120;
let counts = { minute: 0, n: new Map() };
function allowed(who) {
  const minute = Math.floor(Date.now() / 60_000);
  if (counts.minute !== minute) counts = { minute, n: new Map() };
  const n = (counts.n.get(who) ?? 0) + 1;
  counts.n.set(who, n);
  return n <= PER_MINUTE;
}

const dec = (s) => { try { return decodeURIComponent(s); } catch { return null; } };
const jsonName = (s) => (s.endsWith('.json') ? s.slice(0, -5) : null);

// The settings are base64url JSON in the first part of the path: <base>/<settings>/manifest.json.
function readSettings(part) {
  try {
    const s = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return { limit: Math.min(50, Math.max(1, Number(s.limit) || DEFAULTS.limit)) };
  } catch { return null; }
}

const KINDS = new Set(['manifest.json', 'catalog', 'meta', 'stream', 'audio', 'configure']);
const NOT_FOUND = { status: 404, json: { error: 'not found' } };

/** The answer to a GET: { status, json }, { status, html }, or { status, location }. */
async function route(url, token) {
  const [path] = url.split('?');
  const parts = path.split('/').filter(Boolean);
  let settings = DEFAULTS;
  if (parts.length > 1 && !KINDS.has(parts[0])) settings = readSettings(parts.shift());
  if (!settings) return NOT_FOUND;
  const [kind, a, b, c] = parts;
  if (kind === 'manifest.json' && parts.length === 1) return { status: 200, json: MANIFEST };
  if (kind === 'configure' && parts.length === 1 && MANIFEST.configurable) return { status: 200, html: CONFIGURE };
  if (kind === 'catalog' && (parts.length === 3 || parts.length === 4)) {
    const id = dec(parts.length === 3 ? jsonName(b) ?? '' : b);
    const extra = parts.length === 4 ? jsonName(c) : '';
    if (id === null || extra === null) return NOT_FOUND;
    const metas = await catalog(dec(a), id, Object.fromEntries(new URLSearchParams(extra)), settings);
    return metas ? { status: 200, json: { metas } } : NOT_FOUND;
  }
  if (kind === 'meta' && parts.length === 3) {
    const m = await details(dec(a), dec(jsonName(b) ?? ''));
    return m ? { status: 200, json: { meta: m } } : NOT_FOUND;
  }
  if (kind === 'stream' && a === 'track' && parts.length === 3) {
    const s = await streams(dec(jsonName(b) ?? ''), token);
    return s ? { status: 200, json: { streams: s } } : NOT_FOUND;
  }
  if (kind === 'audio' && parts.length === 2 && signed(url)) {
    const to = await audioUrl(dec(a));
    return to ? { status: 302, location: to } : NOT_FOUND;
  }
  return kind === 'audio' ? { status: 403, json: { error: 'link' } } : NOT_FOUND;
}

// The settings page. Save makes a new addon link and opens it in Ravian, which keeps it in place of the old one.
const CONFIGURE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${MANIFEST.name} settings</title>
<body style="font:16px system-ui;max-width:28em;margin:2em auto;padding:0 1em">
<h1>${MANIFEST.name}</h1>
<label>Search results (1 to 50) <input id="limit" type="number" min="1" max="50" value="${DEFAULTS.limit}"></label>
<p><button id="save">Save in Ravian</button></p>
<script>
document.getElementById('save').onclick = () => {
  const s = btoa(JSON.stringify({ limit: Number(document.getElementById('limit').value) }))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  location.href = 'ravian://addon?url=' + encodeURIComponent('${PUBLIC}/' + s + '/manifest.json');
};
</script>`;

/** Answers one request. The local server and the Vercel function (api/index.js) both use it. */
export async function handler(req, res) {
  // The install token: Ravian sends one for each addon host, and a stream link carries it as t=. 32 hex digits.
  const token = /^[0-9a-f]{32}$/.exec(req.headers['x-ravian-install'] || /[?&]t=([0-9a-f]*)/.exec(req.url)?.[1] || '')?.[0];
  // Behind a proxy (Vercel, nginx), the first X-Forwarded-For address is the user.
  const address = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  let answer;
  if (req.method !== 'GET') answer = { status: 405, json: { error: 'method' } };
  else if (!allowed(token || address)) answer = { status: 429, json: { error: 'limit' } };
  else answer = await route(req.url, token).catch(() => ({ status: 502, json: { error: 'upstream' } }));
  if (answer.location) return res.writeHead(302, { Location: answer.location }).end();
  if (answer.html) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(answer.html);
  res.writeHead(answer.status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(answer.json));
}

// node server.js: port 7090 (env PORT), on 127.0.0.1 only (env HOST). Put nginx or Caddy with HTTPS in front of it.
// Not 7000: AirPlay Receiver uses it on a Mac.
export function startServer() {
  const port = Number(process.env.PORT) || 7090;
  const host = process.env.HOST || '127.0.0.1';
  return http.createServer(handler).listen(port, host, () => console.log(`${MANIFEST.name} on http://${host}:${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
