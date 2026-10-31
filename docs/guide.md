# Make a Ravian addon

This guide makes an addon, tests it in Ravian, puts it online and submits it to the list. The exact rules are in
[protocol.md](protocol.md).

You need Python 3 (for the checker). For a server addon, you also need Node 18 or newer.

## 1. Choose the kind

| Kind | Use it when | Host |
|---|---|---|
| Static | The songs do not change often. Search answers only the words that you prepare. | GitHub Pages, any static host |
| Server | The addon reads another service, or searches any text. | Vercel, or your own server |

## 2. Make a static addon

1. Copy the folder [`example/`](../example).
2. In `manifest.json`, change `id`, `name`, `description` and `idPrefixes`. Keep `"ravian": 1`.
3. For each catalog in the manifest, write `catalog/<type>/<id>.json` with `{"metas": [...]}`.
4. For each search word, write `catalog/<type>/<id>/search=<word>.json`.
5. For each album or playlist, write `meta/<type>/<id>.json` with `{"meta": {...}}`.
6. For each track, write `stream/track/<id>.json` with `{"streams": [{"url": "https://…"}]}`.
7. Run `python3 tools/check.py <your folder>`. Repair each problem until it shows `0 problems`.

Give only HTTPS links to audio and covers. Give only music that you have the right to give.

## 3. Make a server addon

1. Copy the folder [`template/`](../template).
2. In `server.js`, change `MANIFEST`.
3. Replace the three functions under "Your source": `catalog`, `details` and `audioUrl`.
4. Remove `configurable` and `CONFIGURE` if your addon has no settings.
5. Run `node server.js`. The server listens on `http://127.0.0.1:7090`.
6. Run `python3 tools/check.py http://127.0.0.1:7090`. Repair each problem until it shows `0 problems`.

Change only your part of `server.js`. The part under "The protocol" follows this protocol. It also has stream links that
expire after 24 hours and a limit of 120 requests a minute for each user.

## 4. Test it in Ravian

Store builds of Ravian accept only HTTPS. A debug build also accepts your computer:

| Where Ravian runs | Address to add |
|---|---|
| Android emulator | `http://10.0.2.2:<port>` |
| iOS simulator, or the Mac app | `http://localhost:<port>` |

1. For a static addon, run `python3 -m http.server 7090 -d <your folder>`.
2. For a server addon on the Android emulator, run `HOST=0.0.0.0 PUBLIC_BASE=http://10.0.2.2:7090 node server.js`.
3. In Ravian, open Settings → Sources → Add source, and type the address.
4. Open the addon. Open a catalog, search it, and play a track.

To test on a phone, put the addon online first (section 5).

## 5. Put it online

### GitHub Pages (static)

1. Put the addon folder in a public GitHub repository.
2. In the repository, open Settings → Pages. Choose the branch and the folder.
3. The addon URL is the Pages address of the folder, for example `https://<user>.github.io/<repo>`.

### Vercel (server)

1. Run `npx vercel@latest login`.
2. In the template folder, run `npx vercel@latest deploy --prod`. `vercel.json` and `api/index.js` are already there.
3. In the Vercel project, open Settings → Environment Variables, and add:
   - `PUBLIC_BASE`: the address of the project, for example `https://my-addon.vercel.app`.
   - `SECRET`: 64 random hex digits, for example from `openssl rand -hex 32`.
4. Deploy again, so the variables take effect.

On Vercel, each instance counts the request limit by itself. For a strict limit, use your own server.

### Your own server

1. Put nginx or Caddy with HTTPS in front of `node server.js`.
2. Set `PUBLIC_BASE` to the public address, and `SECRET` as above.
3. Keep `HOST` at `127.0.0.1`, so that only nginx or Caddy can reach the server.
4. Start it with a process manager, for example `pm2 start server.js`.

Keep `SECRET` the same after a restart. If it changes, each stream link that a phone has stops.

### Check it online

1. Run `python3 tools/check.py https://<your address>`.
2. Add the address in Ravian on a phone, and play a track.

## 6. Submit it to the list

1. Open an issue with the form [Submit an addon](https://github.com/ravianapp/addons/issues/new?template=submit.yml).
   In Ravian, Settings → Sources → Publish an addon opens the same form, with your URL in it.
2. A workflow checks the addon and writes the result in the issue. Repair each problem that it shows.
3. A reviewer tests the addon and accepts it or tells you why not.
4. After the review, the addon shows under Settings → Sources → Reviewed addons within one day.

Do not change the manifest after the review. A changed manifest leaves the list in one day, and needs a new review.
A change to the catalogs, the streams or the code needs no review.

## 7. Questions

Open an issue in this repository.
