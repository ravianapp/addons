# Ravian addon server template

A Ravian addon server in one file, `server.js`. It needs Node 18 or newer and no packages. It runs as a local server
and as a Vercel function (`api/index.js`, `vercel.json`).
The protocol is in [docs/protocol.md](../docs/protocol.md). The full steps are in [docs/guide.md](../docs/guide.md).

## What it has

- The routes of spec section 2: manifest, catalog, search, meta and stream.
- A settings page at `/configure`. It puts the settings in the addon link (spec section 3).
- Stream links that expire after 24 hours. Without them, one shared link plays your source for anybody.
- A limit of 120 requests a minute for each user. The user is the install token (`X-Ravian-Install`), or the address.
- No log. Add one only when your privacy text says what you keep and for how long.

## Make your addon

1. Copy this folder to a new place.
2. In `server.js`, change `MANIFEST`: `id`, `name`, `description`, `catalogs` and `idPrefixes`.
3. Replace the functions under "Your source": `catalog`, `details` and `audioUrl`.
4. Remove `configurable` and `CONFIGURE` if your addon has no settings.
5. Change only the part under "The protocol" when the spec changes.

## Test it

1. Run `node server.js`. The server listens on `http://127.0.0.1:7090`.
2. Run `python3 ../tools/check.py http://127.0.0.1:7090`.
3. Repair each problem that the checker shows, until it shows `0 problems`.
4. For the Android emulator, run `HOST=0.0.0.0 PUBLIC_BASE=http://10.0.2.2:7090 node server.js`.
5. In a debug build of Ravian, add the addon `http://10.0.2.2:7090`.

Store builds of Ravian need HTTPS. Use a debug build for tests on your computer.

## Put it on Vercel

The steps are in [docs/guide.md](../docs/guide.md), section 5.

## Put it on a server

1. Put nginx or Caddy with HTTPS in front of the server.
2. Set `PUBLIC_BASE` to the public address, for example `https://addon.example.org`.
3. Set `SECRET` to 64 random hex digits, for example from `openssl rand -hex 32`.
4. Keep `HOST` at `127.0.0.1`, so that only nginx or Caddy can reach the server.
5. Start it with a process manager, for example `pm2 start server.js`.

Keep `SECRET` the same after a restart. If it changes, every stream link that the phones have stops.

## Rules for your addon

- Give only content that you have the right to give.
- An addon is data. Ravian runs no code that an addon sends.
- Do not use the install token to match one user across addons. Each addon gets a different token for the same user.
